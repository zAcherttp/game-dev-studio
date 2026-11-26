import { fileURLToPath } from "node:url";

import { AdapterFailed, Renderer } from "@gds/model";
import type { RenderRequest } from "@gds/model";
import { Effect, Layer, Option, Schema } from "effect";
import type { Digest } from "effect/crypto/Digest";
import { layerWebCrypto } from "effect/crypto/Digest";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { RobloxConfig } from "./config.js";
import type { RorSettings } from "./config.js";
import { EasyvfxKits } from "./easyvfx-kits.js";
import { picksFor } from "./exact-mix.js";
import { cachedRender } from "./render-cache.js";
import type { RenderPaths } from "./render-cache.js";
import { brightest, sheetBeat } from "./sync-beat.js";

export const ROR_BACKEND = "roblox.ror";

const script = fileURLToPath(new URL("../ror/play-kit.luau", import.meta.url));

export const KIT_HOLDER = [0, 2, 0] as const;

const GROUND_VIEW = { distance: 16, drop: 0.6, fov: 30, slope: [0.05, 0.6, 1] };

export const groundCamera = (holder: readonly [number, number, number]) => {
  const target = [holder[0], holder[1] - GROUND_VIEW.drop, holder[2]];
  const length = Math.hypot(...GROUND_VIEW.slope);

  const eye = target.map(
    (value, axis) =>
      value + ((GROUND_VIEW.slope[axis] ?? 0) / length) * GROUND_VIEW.distance
  );

  return { eye, fov: GROUND_VIEW.fov, mode: "lookAt", target };
};

const Summary = Schema.Struct({
  frameStats: Schema.Array(
    Schema.Struct({ luma: Schema.Finite, time: Schema.Finite })
  ),
  stats: Schema.Struct({
    missing: Schema.Array(Schema.String),
    particlesMax: Schema.Finite,
  }),
  video: Schema.NullOr(Schema.String),
});

const decodeSummary = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Summary)
);

const REGISTER_ROW = /^\| `(?<file>[^`]+\.png)` \| (?<id>\d+) \|/u;

export const registeredTextures = (
  registry: string
): readonly (readonly [string, string])[] =>
  registry.split("\n").flatMap((line) => {
    const row = REGISTER_ROW.exec(line)?.groups;

    return row?.file === undefined || row.id === undefined
      ? []
      : [[`rbxassetid://${row.id}`, row.file] as const];
  });

const failed = (message: string) =>
  new AdapterFailed({ adapter: ROR_BACKEND, message });

export const rorRenderer = Layer.effect(
  Renderer,
  Effect.gen(function* makeRorRenderer() {
    const config = yield* RobloxConfig;
    const kits = yield* EasyvfxKits;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fs = yield* FileSystem;
    const path = yield* Path;

    const services = yield* Effect.context<
      RobloxConfig | FileSystem | Path | Digest
    >();

    const ror: RorSettings | undefined = config.ror;

    const mounts = [
      "--mount",
      `ReplicatedStorage/Shared=${config.easyvfx}/src/Plugin/Shared`,
      "--mount",
      `ReplicatedStorage/Runtime=${config.easyvfx}/src/Plugin/Runtime/EasyVFX.luau`,
      ...config.kits.flatMap((dir, index) => [
        "--mount",
        `ReplicatedStorage/Kits${index + 1}=${dir}/kits`,
      ]),
    ];

    const localTextures = (settings: RorSettings) =>
      Effect.gen(function* findLocalTextures() {
        const found: Record<string, string> = {};
        const named: string[] = [];

        for (const dir of config.kits) {
          const folder = path.join(dir, "kits");

          const files = yield* fs
            .readDirectory(folder)
            .pipe(Effect.orElseSucceed((): string[] => []));

          for (const name of files.filter((entry) => entry.endsWith(".luau"))) {
            named.push(
              yield* fs
                .readFileString(path.join(folder, name))
                .pipe(Effect.orElseSucceed(() => ""))
            );
          }
        }

        const kitText = named.join("\n");

        const inKits = (uri: string) =>
          kitText.includes(uri.slice(uri.lastIndexOf("/") + 1));

        const registry = yield* fs
          .readFileString(path.join(settings.gameRoot, "assets", "assets.md"))
          .pipe(Effect.orElseSucceed(() => ""));

        for (const [uri, file] of registeredTextures(registry)) {
          const local = path.join(settings.gameRoot, file);

          if (
            inKits(uri) &&
            (yield* fs.exists(local).pipe(Effect.orElseSucceed(() => false)))
          ) {
            found[uri] = local.replaceAll("\\", "/");
          }
        }

        const outs = [
          path.join(settings.gameRoot, "art", "vfx", "out"),
          ...config.kits.map((dir) => path.join(dir, "..", "out")),
        ];

        for (const out of outs) {
          const names = yield* fs
            .readDirectory(out)
            .pipe(Effect.orElseSucceed((): string[] => []));

          for (const name of names.filter(
            (entry) => entry.endsWith(".png") && inKits(entry)
          )) {
            found[`rbxasset://textures/se370vfx/${name}`] ??= path
              .join(out, name)
              .replaceAll("\\", "/");
          }
        }

        return found;
      });

    const runRor = (
      settings: RorSettings,
      context: string,
      out: string,
      timing: readonly string[]
    ) =>
      spawner
        .string(
          ChildProcess.make(
            "ror",
            [
              "video",
              script,
              ...mounts,
              "--context",
              context,
              "--camera",
              JSON.stringify(groundCamera(KIT_HOLDER)),
              "--size",
              config.size.join("x"),
              "--sheet",
              "0",
              "--out",
              out,
              "--json",
              ...timing,
            ],
            {
              cwd: settings.gameRoot,
              env: { ROR_REE: settings.ree },
              extendEnv: true,
            }
          )
        )
        .pipe(
          Effect.mapError((problem) =>
            failed(
              `ror did not run: ${problem.message}. ror comes from the game's rokit.toml and needs ree. Fix: run \`rokit install\` and \`scripts/ror-ree.sh\` in ${settings.gameRoot}.`
            )
          ),
          Effect.flatMap((text) =>
            decodeSummary(text.trim().split("\n").at(-1) ?? "").pipe(
              Effect.mapError(() =>
                failed(
                  `ror printed no summary: ${text.slice(-400)}. The kit script failed under ree. Fix: run the same \`ror video\` by hand from ${settings.gameRoot}.`
                )
              )
            )
          )
        );

    const draw =
      (
        settings: RorSettings,
        request: RenderRequest,
        preset: string,
        textures: Readonly<Record<string, string>>
      ) =>
      (paths: RenderPaths) =>
        Effect.gen(function* drawWithRor() {
          const context = JSON.stringify({
            holder: KIT_HOLDER,
            kit: request.asset,
            layer: request.layer,
            picks: request.mix,
            take: request.variant.id,
            textures,
          });

          const clip = yield* runRor(settings, context, `${paths.work}/clip`, [
            "--start",
            "0.0167",
            "--duration",
            String(settings.seconds),
            "--fps",
            "25",
            "--format",
            "gif",
          ]);

          const named = yield* sheetBeat(preset);

          const beat = Option.getOrElse(named, () =>
            brightest(clip.frameStats)
          );

          yield* runRor(settings, context, `${paths.work}/still`, [
            "--times",
            String(Math.max(beat.t, 0.0167)),
            "--format",
            "png",
          ]);

          const copy = (from: string, to: string) =>
            fs
              .copyFile(from, to)
              .pipe(
                Effect.mapError((problem) =>
                  failed(
                    `ror's output ${from} could not be kept: ${problem.message}. ror writes into the render's work folder. Fix: check \`${paths.work}\` is writable.`
                  )
                )
              );

          yield* copy(clip.video ?? `${paths.work}/clip/video.gif`, paths.gif);
          yield* copy(`${paths.work}/still/frames/0000.png`, paths.still);

          return {
            beat,
            missing: [
              ...clip.stats.missing,
              ...(clip.stats.particlesMax === 0
                ? ["no particle drawn in any frame"]
                : []),
            ],
          };
        });

    return Renderer.of({
      render: (request) =>
        ror === undefined
          ? Effect.fail(
              failed(
                "The ror backend has no settings. It needs the game checkout and ree. Fix: give `ror: { gameRoot, ree, seconds }` in RobloxConfig."
              )
            )
          : kits
              .take(
                request.studio,
                request.asset,
                request.layer,
                request.variant.id
              )
              .pipe(
                Effect.flatMap(({ kit }) =>
                  Effect.flatMap(localTextures(ror), (textures) => {
                    const drawn = { ...request, mix: picksFor(request, kit) };

                    return cachedRender(
                      `${ROR_BACKEND} ${JSON.stringify(textures)}`,
                      drawn,
                      kit,
                      draw(ror, drawn, kit.preset, textures)
                    );
                  })
                ),
                Effect.provide(services)
              ),
    });
  })
).pipe(Layer.provide(layerWebCrypto));
