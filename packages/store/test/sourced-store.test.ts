import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Asset, Source, Store, UnknownLayer, UnknownStudio } from "@gds/model";
import { Effect, Layer, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { SourcedStore, mergeSourced } from "../src/index.js";
import { storeAt, tempGame, variant } from "./fixture.js";

const Take = Schema.Struct({
  id: Schema.String,
  layer: Schema.String,
});

const takes = (layer: string, ids: readonly string[]) =>
  ids.map((id) => ({ ...variant(layer, id), generator: "kit" }));

describe("sourced asset", () => {
  it.prop(
    "keeps every source take and every stored variant, picks and the mix; a stored variant wins its id (ids are unique per layer, as putVariants keeps them)",
    {
      sourced: Arbitrary.schema(Schema.Array(Take)),
      stored: Arbitrary.schema(Asset),
    },
    ({ sourced, stored: generated }) => {
      const stored = {
        ...generated,
        layers: Object.fromEntries(
          Object.entries(generated.layers).map(([id, entry]) => [
            id,
            {
              ...entry,
              variants: entry.variants.filter(
                (own, index, all) =>
                  all.findIndex(({ id: other }) => other === own.id) === index
              ),
            },
          ])
        ),
      };

      const byLayer = new Map<string, string[]>();

      for (const take of sourced) {
        byLayer.set(take.layer, [...(byLayer.get(take.layer) ?? []), take.id]);
      }

      const layers = [...byLayer].map(
        ([layer, ids]) => [layer, takes(layer, [...new Set(ids)])] as const
      );

      const merged = mergeSourced(
        Option.some(stored),
        { id: stored.id, title: "from source" },
        stored.studio,
        layers
      );

      expect(merged.mix).toEqual(stored.mix);
      expect(merged.title).toBe(stored.title);

      for (const [id, entry] of Object.entries(stored.layers)) {
        const kept = merged.layers[id];

        expect(kept?.picks).toEqual(entry.picks);

        for (const own of entry.variants) {
          expect(kept?.variants).toContainEqual(own);
        }
      }

      for (const [layer, made] of layers) {
        const ids = (merged.layers[layer]?.variants ?? []).map(({ id }) => id);

        const owned = new Map(
          (stored.layers[layer]?.variants ?? []).map((own) => [own.id, own])
        );

        for (const take of made) {
          expect(ids).toContain(take.id);
          expect(
            merged.layers[layer]?.variants.find(({ id }) => id === take.id)
          ).toEqual(owned.get(take.id) ?? take);
        }

        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  );
});

const kit = new Map([
  ["Band", takes("Band", ["A", "B"])],
  ["Wash", takes("Wash", ["A"])],
]);

const kitSource = Layer.succeed(
  Source,
  Source.of({
    layersOf: (studio) =>
      studio === "vfx"
        ? Effect.succeed(
            [...kit.keys()].map((id, order) => ({
              id,
              order,
              renderKind: "gif" as const,
              title: id,
            }))
          )
        : Effect.fail(new UnknownStudio({ studio })),
    listAssets: (studio) =>
      studio === "vfx"
        ? Effect.succeed([{ id: "strike", title: "strike (cut)" }])
        : Effect.fail(new UnknownStudio({ studio })),
    takesOf: (studio, asset, layer) => {
      const found = kit.get(layer);

      return found === undefined
        ? Effect.fail(new UnknownLayer({ asset, layer, studio }))
        : Effect.succeed(found);
    },
  })
);

const withSourcedStore = <A, E>(body: Effect.Effect<A, E, Store>) =>
  Effect.gen(function* run() {
    const root = yield* tempGame;

    return yield* body.pipe(
      Effect.provide(
        SourcedStore.pipe(Layer.provide(Layer.merge(storeAt(root), kitSource)))
      )
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("sourced store", () => {
  it.effect(
    "a kit with no asset file is listed and read with its takes, and its first pick writes the file",
    () =>
      withSourcedStore(
        Effect.gen(function* firstPick() {
          const store = yield* Store;
          const listed = yield* store.listAssets("vfx");
          const before = yield* store.getAsset("vfx", "strike");

          const after = yield* store.pick("vfx", "strike", {
            at: "2026-11-26T01:00:00.000Z",
            by: "phat",
            layer: "Band",
            note: "the wide one",
            variant: "B",
          });

          expect(listed).toEqual([{ id: "strike", title: "strike (cut)" }]);
          expect(Object.keys(before.layers)).toEqual(["Band", "Wash"]);
          expect(before.layers.Band?.variants.map(({ id }) => id)).toEqual([
            "A",
            "B",
          ]);
          expect(after.mix).toEqual({ Band: "B" });
          expect(after.layers.Band?.picks.map(({ note }) => note)).toEqual([
            "the wide one",
          ]);
          expect(after.layers.Wash?.variants.map(({ id }) => id)).toEqual([
            "A",
          ]);
        })
      )
  );
});
