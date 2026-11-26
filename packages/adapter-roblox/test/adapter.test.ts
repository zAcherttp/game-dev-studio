import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Renderer, Source } from "@gds/model";
import { Effect, Layer, Ref, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { layerWebCrypto } from "effect/crypto/Digest";
import { FileSystem } from "effect/FileSystem";

import {
  EasyvfxKits,
  KitListing,
  RobloxConfig,
  cachedRender,
  easyvfxSource,
  evfxRenderer,
  picksFor,
  renderKeyText,
} from "../src/index.js";

const Inputs = Schema.Struct({
  backend: Schema.String,
  kit: Schema.Json,
  layer: Schema.String,
  mix: Schema.Record(Schema.String, Schema.String),
  take: Schema.String,
});

const listing = {
  fire: {
    layers: [
      {
        name: "Flames",
        variants: { A: { count: 1, layers: [{ kind: "Ring" }], note: "low" } },
      },
      { name: "Smoke", variants: [] },
    ],
    picks: { Flames: "A" },
    preset: "fire_pit",
  },
} as const;

const variant = (id: string) => ({
  generator: "easyvfx.kit",
  id,
  label: `Flames ${id}`,
  layer: "Flames",
  params: {},
});

const request = (take: string) => ({
  asset: "fire",
  layer: "Flames",
  mix: { Flames: "A", Smoke: "B" },
  studio: "vfx",
  variant: variant(take),
});

const settings = (cache: string) => ({
  cache,
  easyvfx: "unused",
  kits: [],
  python: "unused",
  size: [360, 240] as const,
  workers: 1,
});

const KitLayers = Schema.Array(
  Schema.Literals(["Flames", "Smoke", "Sparks", "Glow", "Decal"])
).check(Schema.isMinLength(1));

describe("exact mix", () => {
  it.prop(
    "draws the variant and exactly the mix's layers, leaves every other kit layer out, and keeps the asset's mix when not exact",
    {
      chosen: Arbitrary.schema(KitLayers),
      kitLayers: Arbitrary.schema(KitLayers),
    },
    ({ chosen, kitLayers }) => {
      const kit = {
        layers: [...new Set(["Flames", ...kitLayers])].map((name) => ({
          name,
          variants: [] as const,
        })),
        picks: [] as const,
        preset: "fire_pit",
      };

      const mix = Object.fromEntries(
        [...new Set(chosen)].flatMap((name) =>
          name === "Flames" ? [] : [[name, "A"] as const]
        )
      );

      const exact = picksFor({ ...request("A"), exact: true, mix }, kit);

      for (const { name } of kit.layers) {
        if (name !== "Flames") {
          expect(exact[name]).toBe(mix[name] ?? "-");
        }
      }

      expect(exact.Flames).toBeUndefined();
      expect(picksFor({ ...request("A"), mix }, kit)).toEqual(mix);
    }
  );
});

describe("render cache key", () => {
  it.prop(
    "ignores the order of the mix and the rendered layer's own pick, which the take replaces",
    {
      inputs: Arbitrary.schema(Inputs),
      other: Arbitrary.schema(Schema.String),
    },
    ({ inputs, other }) => {
      const reordered = Object.fromEntries(
        Object.entries(inputs.mix).toReversed()
      );

      const repicked = { ...reordered, [inputs.layer]: other };

      expect(renderKeyText({ ...inputs, mix: repicked })).toBe(
        renderKeyText(inputs)
      );
    }
  );

  it.prop(
    "changes when the kit source, the layer, the take, the backend or another layer's pick changes",
    { inputs: Arbitrary.schema(Inputs) },
    ({ inputs }) => {
      const key = renderKeyText(inputs);
      const otherLayer = `${inputs.layer}+`;

      const changed = [
        { ...inputs, kit: [inputs.kit] },
        { ...inputs, layer: otherLayer },
        { ...inputs, take: `${inputs.take}+` },
        { ...inputs, backend: `${inputs.backend}+` },
        {
          ...inputs,
          mix: {
            ...inputs.mix,
            [otherLayer]: `${inputs.mix[otherLayer] ?? ""}+`,
          },
        },
      ];

      for (const input of changed) {
        expect(renderKeyText(input)).not.toBe(key);
      }
    }
  );
});

const withCache = <A, E>(
  body: (
    config: Layer.Layer<RobloxConfig>
  ) => Effect.Effect<A, E, NodeServices.NodeServices>
) =>
  Effect.gen(function* withTempCache() {
    const fs = yield* FileSystem;
    const cache = yield* fs.makeTempDirectoryScoped({ prefix: "gds-render-" });

    return yield* body(RobloxConfig.layer(settings(cache)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("renders", () => {
  it.effect(
    "a render with the same inputs returns the kept file without drawing again",
    () =>
      withCache((config) =>
        Effect.gen(function* keepsRenders() {
          const draws = yield* Ref.make(0);

          const draw = () =>
            Effect.as(
              Ref.update(draws, (n) => n + 1),
              {
                beat: { from: "measured", name: "brightest frame", t: 0.25 },
              }
            );

          const first = yield* cachedRender(
            "test",
            request("A"),
            listing.fire,
            draw
          );

          const again = yield* cachedRender(
            "test",
            request("A"),
            listing.fire,
            draw
          );

          const other = yield* cachedRender(
            "test",
            request("B"),
            listing.fire,
            draw
          );

          expect(again).toEqual(first);
          expect(first.beat).toEqual({ name: "brightest frame", t: 0.25 });
          expect(again.ms).toBe(first.ms);
          expect(other.path).not.toBe(first.path);
          expect(yield* Ref.get(draws)).toBe(2);
        }).pipe(Effect.provide(Layer.merge(config, layerWebCrypto)))
      )
  );

  it.effect(
    "a take the kit does not have fails as UnknownVariant before anything is drawn",
    () =>
      withCache((config) =>
        Effect.gen(function* missingTake() {
          const renderer = yield* Renderer;

          const failure = yield* renderer
            .render({
              asset: "fire",
              layer: "Flames",
              mix: { Flames: "A" },
              studio: "vfx",
              variant: variant("Z"),
            })
            .pipe(Effect.flip);

          expect(failure._tag).toBe("UnknownVariant");
        }).pipe(
          Effect.provide(
            evfxRenderer.pipe(
              Layer.provide(
                Layer.merge(config, EasyvfxKits.fromListing(listing))
              )
            )
          )
        )
      )
  );

  it.effect(
    "the source lists a kit's layers in order with their takes, and refuses a layer it lacks",
    () =>
      Effect.gen(function* kitSource() {
        const source = yield* Source;
        const layers = yield* source.layersOf("vfx", "fire");
        const takes = yield* source.takesOf("vfx", "fire", "Flames");
        const empty = yield* source.takesOf("vfx", "fire", "Smoke");

        const missing = yield* source
          .takesOf("vfx", "fire", "Sparks")
          .pipe(Effect.flip);

        const elsewhere = yield* source.listAssets("ui").pipe(Effect.flip);

        expect(layers.map((layer) => [layer.id, layer.order])).toEqual([
          ["Flames", 0],
          ["Smoke", 1],
        ]);
        expect(takes.map((take) => [take.id, take.note])).toEqual([
          ["A", "low"],
        ]);
        expect(empty).toEqual([]);
        expect(missing._tag).toBe("UnknownLayer");
        expect(elsewhere._tag).toBe("UnknownStudio");
      }).pipe(
        Effect.provide(
          easyvfxSource("vfx").pipe(
            Layer.provide(EasyvfxKits.fromListing(listing))
          )
        )
      )
  );

  it.effect(
    "a take the kit export writes with an empty layers table is a take with no layers",
    () =>
      Effect.gen(function* emptyTake() {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(KitListing)
        )(
          JSON.stringify({
            fire: {
              layers: [
                {
                  name: "Flames",
                  variants: { Z: { count: 0, layers: {}, note: "none" } },
                },
              ],
              picks: [],
              preset: "fire_pit",
            },
          })
        );

        const source = yield* Source.pipe(
          Effect.provide(
            easyvfxSource("vfx").pipe(
              Layer.provide(EasyvfxKits.fromListing(decoded))
            )
          )
        );

        const takes = yield* source.takesOf("vfx", "fire", "Flames");

        expect(takes.map((take) => [take.id, take.params])).toEqual([
          ["Z", { count: 0, layers: [] }],
        ]);
      })
  );
});
