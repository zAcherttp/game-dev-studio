import { AdapterFailed, GateResult } from "@gds/model";
import type { Asset } from "@gds/model";
import { Context, Effect, Layer, Schema, Semaphore } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { CommandConfig } from "./command-config.js";

const LedgerFile = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, Schema.Array(GateResult))
);

type LedgerValue = typeof LedgerFile.Type;

const decodeLedger = Schema.decodeUnknownEffect(
  Schema.fromJsonString(LedgerFile)
);

const failed = (message: string) =>
  new AdapterFailed({ adapter: "gates", message });

export const withGates = (
  asset: typeof Asset.Type,
  ledger: LedgerValue
): typeof Asset.Type => ({
  ...asset,
  layers: Object.fromEntries(
    Object.entries(asset.layers).map(([layer, entry]) => {
      const judged = ledger[layer] ?? {};

      return [
        layer,
        {
          ...entry,
          variants: entry.variants.map((variant) => {
            const gates = judged[variant.id];

            return gates === undefined ? variant : { ...variant, gates };
          }),
        },
      ] as const;
    })
  ),
});

export class GateLedger extends Context.Service<
  GateLedger,
  {
    readonly record: (
      where: {
        readonly studio: string;
        readonly asset: string;
        readonly layer: string;
        readonly variant: string;
      },
      results: readonly (typeof GateResult.Type)[]
    ) => Effect.Effect<void, AdapterFailed>;
    readonly attach: (
      asset: typeof Asset.Type
    ) => Effect.Effect<typeof Asset.Type, AdapterFailed>;
  }
>()("@gds/adapter-command/GateLedger") {
  static readonly layer = Layer.effect(
    GateLedger,
    Effect.gen(function* makeGateLedger() {
      const config = yield* CommandConfig;
      const fs = yield* FileSystem;
      const path = yield* Path;
      const writing = yield* Semaphore.make(1);

      const fileOf = (studio: string, asset: string) =>
        config.settings.pipe(
          Effect.map(({ root }) =>
            path.join(
              root,
              ".cache",
              "devstudio",
              "gates",
              encodeURIComponent(studio),
              `${encodeURIComponent(asset)}.json`
            )
          )
        );

      const read = Effect.fnUntraced(function* read(file: string) {
        const exists = yield* fs
          .exists(file)
          .pipe(Effect.orElseSucceed(() => false));

        if (!exists) {
          return {};
        }

        const text = yield* fs
          .readFileString(file)
          .pipe(
            Effect.mapError((problem) =>
              failed(
                `The gate results in ${file} could not be read: ${problem.message}. Fix: check the file is readable, or delete it and render again.`
              )
            )
          );

        return yield* decodeLedger(text).pipe(
          Effect.mapError((issue) =>
            failed(
              `The gate results in ${file} are not a gate ledger: ${issue.message}. The file is a rebuildable cache. Fix: delete it and render again.`
            )
          )
        );
      });

      return GateLedger.of({
        attach: (asset) =>
          fileOf(asset.studio, asset.id).pipe(
            Effect.flatMap(read),
            Effect.map((ledger) => withGates(asset, ledger))
          ),
        record: (where, results) =>
          writing.withPermits(1)(
            Effect.gen(function* recordGates() {
              const file = yield* fileOf(where.studio, where.asset);
              const ledger = yield* read(file);

              const next: LedgerValue = {
                ...ledger,
                [where.layer]: {
                  ...ledger[where.layer],
                  [where.variant]: results,
                },
              };

              yield* fs
                .makeDirectory(path.dirname(file), { recursive: true })
                .pipe(
                  Effect.andThen(
                    fs.writeFileString(
                      file,
                      `${JSON.stringify(next, null, 2)}\n`
                    )
                  ),
                  Effect.mapError((problem) =>
                    failed(
                      `The gate results could not be written to ${file}: ${problem.message}. Fix: check the game checkout's .cache folder is writable.`
                    )
                  )
                );
            })
          ),
      });
    })
  );
}
