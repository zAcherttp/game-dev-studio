import {
  AdapterFailed,
  UnknownAsset,
  UnknownLayer,
  UnknownVariant,
} from "@gds/model";
import { Context, Effect, Layer, Option, Ref, Schema } from "effect";
import { Digest, layerWebCrypto } from "effect/crypto/Digest";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { RobloxConfig } from "./config.js";
import { KitListing, kitPicks, takesOfLayer } from "./kit.js";
import type { KitTake, KitValue } from "./kit.js";
import { digestText } from "./render-key.js";

const decodeListing = Schema.decodeUnknownEffect(
  Schema.fromJsonString(KitListing)
);

export interface FoundTake {
  readonly kit: KitValue;
  readonly take: typeof KitTake.Type;
}

export const kitsPathList = (kits: readonly string[]): string =>
  kits.join(kits.some((dir) => /^[A-Za-z]:/u.test(dir)) ? ";" : ":");

const failed = (message: string) =>
  new AdapterFailed({ adapter: "roblox.easyvfx", message });

export const kitIn = (
  listing: typeof KitListing.Type,
  studio: string,
  asset: string
): Effect.Effect<KitValue, UnknownAsset> => {
  const found = listing[asset];

  return found === undefined
    ? Effect.fail(new UnknownAsset({ asset, studio }))
    : Effect.succeed(found);
};

export const takeIn = (
  listing: typeof KitListing.Type,
  studio: string,
  asset: string,
  layer: string,
  id: string
): Effect.Effect<FoundTake, UnknownAsset | UnknownLayer | UnknownVariant> =>
  Effect.flatMap(
    kitIn(listing, studio, asset),
    (kit): Effect.Effect<FoundTake, UnknownLayer | UnknownVariant> => {
      const kitLayer = kit.layers.find((entry) => entry.name === layer);

      if (kitLayer === undefined) {
        return Effect.fail(new UnknownLayer({ asset, layer, studio }));
      }

      const chosen = takesOfLayer(kitLayer)[id];

      return chosen === undefined
        ? Effect.fail(new UnknownVariant({ asset, layer, studio, variant: id }))
        : Effect.succeed({ kit, take: chosen });
    }
  );

const fromList = (
  list: Effect.Effect<typeof KitListing.Type, AdapterFailed>
): EasyvfxKits["Service"] => ({
  kit: (studio, asset) =>
    list.pipe(Effect.flatMap((listing) => kitIn(listing, studio, asset))),
  list,
  mix: (studio, asset) =>
    list.pipe(
      Effect.flatMap((listing) => kitIn(listing, studio, asset)),
      Effect.map(kitPicks)
    ),
  take: (studio, asset, layer, id) =>
    list.pipe(
      Effect.flatMap((listing) => takeIn(listing, studio, asset, layer, id))
    ),
});

export class EasyvfxKits extends Context.Service<
  EasyvfxKits,
  {
    readonly list: Effect.Effect<typeof KitListing.Type, AdapterFailed>;
    readonly kit: (
      studio: string,
      asset: string
    ) => Effect.Effect<KitValue, UnknownAsset | AdapterFailed>;
    readonly take: (
      studio: string,
      asset: string,
      layer: string,
      take: string
    ) => Effect.Effect<
      FoundTake,
      UnknownAsset | UnknownLayer | UnknownVariant | AdapterFailed
    >;
    readonly mix: (
      studio: string,
      asset: string
    ) => Effect.Effect<
      Readonly<Record<string, string>>,
      UnknownAsset | AdapterFailed
    >;
  }
>()("@gds/adapter-roblox/EasyvfxKits") {
  static readonly layer = Layer.effect(
    EasyvfxKits,
    Effect.gen(function* makeEasyvfxKits() {
      const config = yield* RobloxConfig;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem;
      const digest = yield* Digest;
      const path = yield* Path;

      const remembered = yield* Ref.make(
        Option.none<{
          readonly listing: typeof KitListing.Type;
          readonly stamp: string;
        }>()
      );

      const sources = Effect.gen(function* readSources() {
        const files = [
          path.join(config.easyvfx, "src", "Plugin", "Shared", "Presets.luau"),
        ];

        for (const dir of config.kits) {
          const folder = path.join(dir, "kits");
          const names = yield* fs.readDirectory(folder);
          files.push(
            ...names
              .filter((name) => name.endsWith(".luau"))
              .toSorted()
              .map((name) => path.join(folder, name))
          );
        }

        const parts: string[] = [];

        for (const name of files) {
          parts.push(name, yield* fs.readFileString(name));
        }

        return yield* digestText(JSON.stringify(parts)).pipe(
          Effect.provideService(Digest, digest)
        );
      }).pipe(
        Effect.mapError((problem) =>
          failed(
            `EasyVFX kit sources are unreadable: ${problem.message}. The kits path names a folder without kits/*.luau. Fix: point \`kits\` at <game>/art/vfx/easyvfx.`
          )
        )
      );

      const run = spawner
        .string(
          ChildProcess.make("lune", ["run", "tests/kits.luau"], {
            cwd: config.easyvfx,
            env: { EVFX_KITS: kitsPathList(config.kits) },
            extendEnv: true,
          })
        )
        .pipe(
          Effect.mapError((problem) =>
            failed(
              `EasyVFX's kit export did not run: ${problem.message}. Lune runs tests/kits.luau in the EasyVFX checkout. Fix: run \`rokit install\` in ${config.easyvfx}.`
            )
          ),
          Effect.flatMap((text) =>
            decodeListing(text).pipe(
              Effect.mapError((problem) =>
                failed(
                  `EasyVFX's kit export printed an unexpected listing: ${problem.message}. The EasyVFX checkout is not the one this adapter reads. Fix: use EasyVFX at or after 64d0424.`
                )
              )
            )
          )
        );

      const list = Effect.gen(function* listKits() {
        const stamp = yield* sources;
        const known = yield* Ref.get(remembered);

        if (Option.isSome(known) && known.value.stamp === stamp) {
          return known.value.listing;
        }

        const listing = yield* run;
        yield* Ref.set(remembered, Option.some({ listing, stamp }));

        return listing;
      });

      return fromList(list);
    })
  ).pipe(Layer.provide(layerWebCrypto));

  static readonly fromListing = (listing: typeof KitListing.Type) =>
    Layer.succeed(EasyvfxKits, fromList(Effect.succeed(listing)));
}
