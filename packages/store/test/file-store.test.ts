import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Pack, Store, UnknownAsset, UnknownStudio } from "@gds/model";
import { Effect, FileSystem, Path } from "effect";

import { parseAsset } from "../src/index.js";
import {
  storeAt,
  tempGame,
  variant,
  vfxStudio,
  writeStudio,
} from "./fixture.js";

const pickOf = (layer: string, chosen: string, at: string) => ({
  at,
  by: "phat",
  layer,
  note: `${chosen} reads best`,
  variant: chosen,
});

const withStore = <A, E>(
  body: (
    root: string
  ) => Effect.Effect<A, E, Store | Pack | FileSystem.FileSystem | Path.Path>
) =>
  Effect.gen(function* run() {
    const root = yield* tempGame;

    return yield* body(root).pipe(Effect.provide(storeAt(root)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const readFile = (root: string) =>
  Effect.gen(function* readsAssetFile() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return yield* fs.readFileString(
      path.join(root, "art", "picks", "vfx", "fire.json")
    );
  });

describe("file store", () => {
  it.effect("a pick round-trips through the committed asset file", () =>
    withStore((root) =>
      Effect.gen(function* roundTrips() {
        const store = yield* Store;
        yield* store.putVariants("vfx", "fire", "core", [
          variant("core", "c1"),
          variant("core", "c2"),
        ]);

        const written = yield* store.pick(
          "vfx",
          "fire",
          pickOf("core", "c2", "2026-11-25T01:00:00.000Z")
        );

        const text = yield* readFile(root);

        expect(yield* parseAsset(text)).toEqual(written);
        expect(yield* store.getAsset("vfx", "fire")).toEqual(written);
        expect(written.mix).toEqual({ core: "c2" });
        expect(text.endsWith("}\n")).toBe(true);
        expect(text).toContain('\n  "id": "fire",\n');
      })
    )
  );

  it.effect(
    "a later pick replaces the mix and keeps every pick in history",
    () =>
      withStore(() =>
        Effect.gen(function* replacesMix() {
          const store = yield* Store;
          yield* store.putVariants("vfx", "fire", "core", [
            variant("core", "c1"),
            variant("core", "c2"),
          ]);
          yield* store.putVariants("vfx", "fire", "sparks", [
            variant("sparks", "s1"),
          ]);
          yield* store.pick(
            "vfx",
            "fire",
            pickOf("core", "c1", "2026-11-25T01:00:00.000Z")
          );
          yield* store.pick(
            "vfx",
            "fire",
            pickOf("sparks", "s1", "2026-11-25T01:01:00.000Z")
          );

          const asset = yield* store.pick(
            "vfx",
            "fire",
            pickOf("core", "c2", "2026-11-25T01:02:00.000Z")
          );

          expect(asset.mix).toEqual({ core: "c2", sparks: "s1" });
          expect(
            (yield* store.history("vfx", "fire", "core")).map(
              ({ variant: chosen }) => chosen
            )
          ).toEqual(["c1", "c2"]);
        })
      )
  );

  it.effect(
    "writes keys in sorted order so rewrites never churn the diff",
    () =>
      withStore((root) =>
        Effect.gen(function* sortsKeys() {
          const store = yield* Store;
          yield* store.putVariants("vfx", "fire", "sparks", [
            { ...variant("sparks", "s1"), params: { zeta: 1, alpha: 2 } },
          ]);
          const first = yield* readFile(root);
          const asset = yield* store.getAsset("vfx", "fire");
          yield* store.putVariants("vfx", "fire", "core", []);
          yield* store.putVariants("vfx", "fire", "core", []);
          const again = yield* readFile(root);

          expect(first.indexOf('"alpha"')).toBeLessThan(
            first.indexOf('"zeta"')
          );
          expect(first.indexOf('"core"')).toBeLessThan(
            first.indexOf('"sparks"')
          );
          expect(again).toBe(first);
          expect(Object.keys(asset.layers)).toEqual(["core", "sparks"]);
        })
      )
  );

  it.effect("refuses to replace a variant that already exists", () =>
    withStore(() =>
      Effect.gen(function* refusesDuplicate() {
        const store = yield* Store;
        yield* store.putVariants("vfx", "fire", "core", [
          variant("core", "c1"),
        ]);

        const error = yield* store
          .putVariants("vfx", "fire", "core", [variant("core", "c1")])
          .pipe(Effect.flip);

        expect(error._tag).toBe("AdapterFailed");
        expect(error.message).toContain("c1 already exists");
      })
    )
  );

  it.effect("names an unknown studio and an asset with no file", () =>
    withStore(() =>
      Effect.gen(function* namesUnknown() {
        const store = yield* Store;

        const studioError = yield* store
          .getAsset("audio", "fire")
          .pipe(Effect.flip);

        const assetError = yield* store
          .getAsset("vfx", "ice")
          .pipe(Effect.flip);

        expect(studioError).toBeInstanceOf(UnknownStudio);
        expect(studioError).toMatchObject({ studio: "audio" });
        expect(assetError).toBeInstanceOf(UnknownAsset);
        expect(assetError).toMatchObject({ asset: "ice" });
      })
    )
  );

  it.effect(
    "lists a studio's assets by id with their titles and pick counts",
    () =>
      withStore(() =>
        Effect.gen(function* listsAssets() {
          const store = yield* Store;
          const before = yield* store.listAssets("vfx");
          yield* store.putVariants("vfx", "ice", "core", [
            variant("core", "i1"),
          ]);
          yield* store.putVariants("vfx", "fire", "core", [
            variant("core", "f1"),
          ]);
          yield* store.pick(
            "vfx",
            "fire",
            pickOf("core", "f1", "2026-11-26T01:00:00.000Z")
          );

          const studioError = yield* store
            .listAssets("audio")
            .pipe(Effect.flip);

          expect(before).toEqual([]);
          expect(yield* store.listAssets("vfx")).toEqual([
            { id: "fire", picks: 1, title: "fire" },
            { id: "ice", picks: 0, title: "ice" },
          ]);
          expect(studioError).toBeInstanceOf(UnknownStudio);
        })
      )
  );

  it.effect("lists studios and serves each studio's pack", () =>
    withStore(() =>
      Effect.gen(function* listsStudios() {
        const studios = yield* Store.use((store) => store.listStudios);
        const pack = yield* Pack.use((source) => source.get("vfx"));

        expect(studios.map(({ id }) => id)).toEqual(["vfx"]);
        expect(pack).toEqual(vfxStudio.pack);
      })
    )
  );

  it.effect("refuses a bad studio file with its path and field", () =>
    withStore((root) =>
      Effect.gen(function* refusesBadStudio() {
        const file = yield* writeStudio(
          root,
          "audio.json",
          JSON.stringify({ ...vfxStudio, id: "audio", renderKinds: ["smell"] })
        );

        const error = yield* Store.use((store) => store.listStudios).pipe(
          Effect.flip
        );

        expect(error.message).toContain(file);
        expect(error.message).toContain("renderKinds");
      })
    )
  );
});
