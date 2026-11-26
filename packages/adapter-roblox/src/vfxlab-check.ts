import { AdapterFailed, Check, Renderer } from "@gds/model";
import type { CheckRequest } from "@gds/model";
import { Clock, Effect, Layer, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { RobloxConfig } from "./config.js";
import { EasyvfxKits } from "./easyvfx-kits.js";
import { kitPicks, takesOfLayer } from "./kit.js";

export const VFXLAB_CHECK = "roblox.vfxlab";

const Shot = Schema.Struct({
  held: Schema.String,
  shot: Schema.String,
  studio: Schema.String,
});

const decodeShot = Schema.decodeUnknownEffect(Schema.fromJsonString(Shot));

const failed = (message: string) =>
  new AdapterFailed({ adapter: VFXLAB_CHECK, message });

export interface VfxlabSettings {
  readonly gameRoot: string;
  readonly slot?: string | undefined;
}

export const vfxlabCheck = (settings: VfxlabSettings) =>
  Layer.effect(
    Check,
    Effect.gen(function* makeVfxlabCheck() {
      const config = yield* RobloxConfig;
      const kits = yield* EasyvfxKits;
      const renderer = yield* Renderer;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem;
      const path = yield* Path;

      const ownKits = path.resolve(settings.gameRoot, "art", "vfx", "easyvfx");

      const script = path.join(
        settings.gameRoot,
        "scripts",
        "vfxlab",
        "check.py"
      );

      const offlineStill = Effect.fnUntraced(function* offlineStill(
        request: CheckRequest
      ) {
        const kit = yield* kits.kit(request.studio, request.asset);

        const first = kit.layers.find(
          (layer) => Object.keys(takesOfLayer(layer)).length > 0
        );

        if (first === undefined) {
          return yield* failed(
            `Kit ${request.asset} has no layer with a take, so there is nothing to check. Fix: add a take to the kit in its kits/*.luau.`
          );
        }

        const take =
          request.mix[first.name] ??
          kitPicks(kit)[first.name] ??
          Object.keys(takesOfLayer(first))[0] ??
          "A";

        return yield* renderer.render({
          asset: request.asset,
          layer: first.name,
          mix: request.mix,
          studio: request.studio,
          variant: {
            generator: "easyvfx.kit",
            id: take,
            label: `${first.name} ${take}`,
            layer: first.name,
            params: {},
          },
        });
      });

      const open = Effect.fn("vfxlabCheck.open")(function* open(
        request: CheckRequest
      ) {
        const still = yield* offlineStill(request).pipe(
          Effect.catchTag(
            ["UnknownAsset", "UnknownLayer", "UnknownVariant"],
            (problem) =>
              Effect.fail(
                failed(
                  `The offline still for ${request.asset} could not be drawn: ${problem._tag}. The check sets the Studio shot beside it. Fix: render the asset's mix with \`render\` first and correct what it reports.`
                )
              )
          )
        );

        const stamp = yield* Clock.currentTimeMillis;

        const dir = path.join(
          config.cache,
          request.studio,
          request.asset,
          "check"
        );

        yield* fs
          .makeDirectory(dir, { recursive: true })
          .pipe(
            Effect.mapError((problem) =>
              failed(
                `The check folder ${dir} could not be made: ${problem.message}. Shots are kept there. Fix: check the game's .cache folder is writable.`
              )
            )
          );
        const out = path.join(dir, `${stamp}.png`);

        const args = [
          script,
          "--kit",
          request.asset,
          "--picks",
          JSON.stringify(request.mix),
          "--beat",
          String(still.beat?.t ?? 0.3),
          "--out",
          out,
          ...(still.still === undefined ? [] : ["--still", still.still]),
          ...config.kits.flatMap((folder) =>
            path.resolve(folder) === ownKits ? [] : ["--kits", folder]
          ),
          ...(settings.slot === undefined ? [] : ["--slot", settings.slot]),
        ];

        const text = yield* spawner
          .string(
            ChildProcess.make(config.python, args, {
              cwd: settings.gameRoot,
              extendEnv: true,
            })
          )
          .pipe(
            Effect.mapError((problem) =>
              failed(
                `The VFX lab check did not run: ${problem.message}. It opens Roblox Studio through scripts/studio-slot in ${settings.gameRoot}. Fix: run \`${config.python} scripts/vfxlab/check.py --kit ${request.asset} --out shot.png\` there and correct what it reports.`
              )
            )
          );

        const shot = yield* decodeShot(
          text.trim().split("\n").at(-1) ?? ""
        ).pipe(
          Effect.mapError(() =>
            failed(
              `The VFX lab check printed no shot: ${text.slice(-600)}. Roblox Studio did not open or the kit failed in the lab place. Fix: take a Studio slot first, then run scripts/vfxlab/check.py by hand in ${settings.gameRoot}.`
            )
          )
        );

        const beat =
          still.beat === undefined
            ? "the start"
            : `${still.beat.name} (${still.beat.t.toFixed(2)} s)`;

        return {
          note: `Roblox Studio (left, ${shot.studio}) held at ${beat}, beside the offline still (right, ${still.still ?? still.path}). ${shot.held}`,
          shot: shot.shot,
        };
      });

      return Check.of({ open });
    })
  );
