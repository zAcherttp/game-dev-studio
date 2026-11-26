import { fileURLToPath } from "node:url";

import { AdapterFailed, Renderer } from "@gds/model";
import type { Render, RenderRequest } from "@gds/model";
import { Clock, Effect, Layer, Option, Schema } from "effect";
import type { Digest } from "effect/crypto/Digest";
import { layerWebCrypto } from "effect/crypto/Digest";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { RobloxConfig } from "./config.js";
import { CameraSet, placeCameras } from "./plan-cameras.js";
import type { PlacedCamera } from "./plan-cameras.js";
import { decodePlan, drawnParts } from "./plan-file.js";
import type { Plan } from "./plan-file.js";
import { PLAN_RENDERER_VERSION, planKey } from "./plan-key.js";
import { projectMounts } from "./project-mounts.js";
import { registeredTextures } from "./ror-renderer.js";

export const PLAN_BACKEND = "roblox.plan";

const script = fileURLToPath(new URL("../ror/draw-plan.luau", import.meta.url));

export const VILLAGE_CAMERAS = fileURLToPath(
  new URL("../ror/village-cameras.json", import.meta.url)
);

export type PlanSource =
  | { readonly kind: "command"; readonly run: readonly [string, ...string[]] }
  | { readonly kind: "village" };

export interface PlanSettings {
  readonly cameras: string;
  readonly gameRoot: string;
  readonly project: string;
  readonly ree: string;
  readonly size: readonly [number, number];
  readonly source: PlanSource;
}

const RorSummary = Schema.Struct({
  parts: Schema.Finite,
  script: Schema.Struct({ errors: Schema.Array(Schema.String) }),
  timings: Schema.Struct({ totalMs: Schema.Finite }),
  views: Schema.Array(Schema.Struct({ file: Schema.String })),
});

const decodeSummary = Schema.decodeUnknownEffect(
  Schema.fromJsonString(RorSummary)
);

const decodeCameras = Schema.decodeUnknownEffect(
  Schema.fromJsonString(CameraSet)
);

export const PlanNote = Schema.Struct({
  backend: Schema.String,
  key: Schema.String,
  ms: Schema.Finite,
  msPerView: Schema.Finite,
  parts: Schema.Finite,
  planMs: Schema.Finite,
  rorMs: Schema.Finite,
  views: Schema.Array(
    Schema.Struct({ camera: Schema.String, path: Schema.String })
  ),
});

const NoteFile = Schema.fromJsonString(PlanNote);

const failed = (message: string) =>
  new AdapterFailed({ adapter: PLAN_BACKEND, message });

const seedParam = Schema.decodeUnknownOption(Schema.Finite);

const camerasParam = Schema.decodeUnknownOption(Schema.Array(Schema.String));

export const seedOf = (request: RenderRequest): number =>
  request.variant.seed ??
  Option.getOrElse(seedParam(request.variant.params.seed), () => 1);

export const chosenCameras = (
  request: RenderRequest
): readonly string[] | undefined =>
  Option.getOrUndefined(camerasParam(request.variant.params.cameras));

const placeModule = (plan: Plan, cameras: readonly PlacedCamera[]): string => {
  const figures = cameras.flatMap(({ figure }) =>
    figure === undefined ? [] : [figure]
  );

  const body = JSON.stringify({ figures, parts: plan.parts });

  return `return game:GetService("HttpService"):JSONDecode([==[${body}]==])\n`;
};

const unreadable = (where: string) => (problem: { readonly message: string }) =>
  failed(
    `${where} is unusable: ${problem.message}. The plan renderer keeps its work there. Fix: delete \`${where}\` and render again.`
  );

const asRender = (note: typeof PlanNote.Type): typeof Render.Type => ({
  kind: "image",
  ms: note.ms,
  path: note.views[0]?.path ?? "",
  views: note.views,
});

export const planRenderer = (settings: PlanSettings) =>
  Layer.effect(
    Renderer,
    Effect.gen(function* makePlanRenderer() {
      const config = yield* RobloxConfig;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem;
      const path = yield* Path;
      const services = yield* Effect.context<Digest>();

      const run = (
        command: string,
        args: readonly string[],
        what: string,
        fix: string
      ) =>
        spawner
          .string(
            ChildProcess.make(command, args, {
              cwd: settings.gameRoot,
              env: { ROR_REE: settings.ree },
              extendEnv: true,
            })
          )
          .pipe(
            Effect.mapError((problem) =>
              failed(
                `${what} did not run: ${problem.message}. It runs from the game checkout at ${settings.gameRoot}. Fix: ${fix}`
              )
            )
          );

      const exists = (where: string) =>
        fs.exists(where).pipe(Effect.orElseSucceed(() => false));

      const planText = (request: RenderRequest, work: string) =>
        Effect.gen(function* makePlanText() {
          if (settings.source.kind === "command") {
            const [command, ...args] = settings.source.run;

            const asked = JSON.stringify({
              asset: request.asset,
              layer: request.layer,
              mix: request.mix,
              params: request.variant.params,
              seed: seedOf(request),
              studio: request.studio,
              variant: request.variant.id,
            });

            return yield* run(
              command,
              [...args, asked],
              `The studio's plan command ${command}`,
              "run the studio's `commands.plan` by hand with the request JSON as its last argument; it must print the plan JSON."
            );
          }

          const out = path.join(work, "village.json");

          yield* run(
            "lune",
            [
              "run",
              "tools/island/village.luau",
              "plan",
              out,
              String(seedOf(request)),
            ],
            "lune tools/island/village.luau plan",
            "run `rokit install` in the game checkout, then `lune run tools/island/village.luau plan out.json 1`."
          );

          return yield* fs
            .readFileString(out)
            .pipe(Effect.mapError(unreadable(out)));
        });

      const textures = Effect.gen(function* textures() {
        const registry = yield* fs
          .readFileString(path.join(settings.gameRoot, "assets", "assets.md"))
          .pipe(Effect.orElseSucceed(() => ""));

        const found: Record<string, string> = {};

        for (const [uri, file] of registeredTextures(registry)) {
          const local = path.join(settings.gameRoot, file);

          if (yield* exists(local)) {
            found[uri] = local.replaceAll("\\", "/");
          }
        }

        return found;
      });

      const mounts = Effect.gen(function* mounts() {
        const projectPath = path.join(settings.gameRoot, settings.project);

        const project = yield* fs
          .readFileString(projectPath)
          .pipe(Effect.mapError(unreadable(projectPath)));

        const listed = yield* projectMounts(project).pipe(
          Effect.mapError(() =>
            failed(
              `The game project ${projectPath} is not a Rojo project. The plan renderer mounts the game's ReplicatedStorage from it. Fix: name a Rojo project file in the plan settings.`
            )
          )
        );

        const kept: string[] = [];

        for (const mount of listed) {
          if (yield* exists(path.join(settings.gameRoot, mount.path))) {
            kept.push("--mount", `${mount.at}=${mount.path}`);
          }
        }

        return kept;
      });

      const readNote = (notePath: string, dir: string) =>
        fs
          .readFileString(notePath)
          .pipe(
            Effect.flatMap(Schema.decodeEffect(NoteFile)),
            Effect.mapError(unreadable(dir))
          );

      const drawViews = (
        plan: Plan,
        cameras: readonly PlacedCamera[],
        dir: string
      ) =>
        Effect.gen(function* drawPlanViews() {
          const work = path.join(dir, "work");
          const module = path.join(work, "plan");

          yield* fs
            .makeDirectory(module, { recursive: true })
            .pipe(Effect.mapError(unreadable(dir)));

          yield* fs
            .writeFileString(
              path.join(module, "Data.luau"),
              placeModule(plan, cameras)
            )
            .pipe(Effect.mapError(unreadable(dir)));

          const mounted = yield* mounts;
          const found = yield* textures;

          const printed = yield* run(
            "ror",
            [
              "render",
              script,
              ...mounted,
              "--mount",
              `ReplicatedStorage/GdsPlan=${module}`,
              "--camera",
              JSON.stringify(
                cameras.map(({ eye, fov, target }) => ({
                  eye,
                  fov,
                  mode: "lookAt",
                  target,
                }))
              ),
              "--context",
              JSON.stringify({ textures: found }),
              "--size",
              settings.size.join("x"),
              "--out",
              path.join(work, "ror"),
              "--json",
            ],
            "ror render",
            `run \`rokit install\` and \`scripts/ror-ree.sh\` in ${settings.gameRoot} and give its folder as GDS_ROR_REE.`
          );

          const summary = yield* decodeSummary(
            printed.trim().split("\n").at(-1) ?? ""
          ).pipe(
            Effect.mapError(() =>
              failed(
                `ror printed no summary: ${printed.slice(-400)}. The plan script failed under ree. Fix: run the same \`ror render\` by hand from ${settings.gameRoot}.`
              )
            )
          );

          if (summary.script.errors.length > 0) {
            return yield* failed(
              `The plan script raised ${summary.script.errors.slice(0, 3).join("; ")}. ror draws the plan through the game's SkyIsland Build. Fix: run \`ror render\` on ${script} by hand and read its errors.`
            );
          }

          const views: { camera: string; path: string }[] = [];

          for (const [index, camera] of cameras.entries()) {
            const drawn = summary.views[index]?.file;

            if (drawn === undefined) {
              return yield* failed(
                `ror drew ${summary.views.length} views for ${cameras.length} cameras. Each camera is one view of one load. Fix: run \`ror render\` by hand with the same --camera list.`
              );
            }

            const kept = path.join(dir, `${camera.id}.png`);

            yield* fs
              .copyFile(drawn, kept)
              .pipe(Effect.mapError(unreadable(dir)));
            views.push({ camera: camera.id, path: kept });
          }

          return views;
        });

      const draw = (request: RenderRequest) =>
        Effect.gen(function* drawPlan() {
          const home = path.join(
            config.cache,
            request.studio,
            request.asset,
            "plan"
          );

          const scratch = path.join(home, "work", request.variant.id);

          yield* fs
            .makeDirectory(scratch, { recursive: true })
            .pipe(Effect.mapError(unreadable(scratch)));

          const planStarted = yield* Clock.currentTimeMillis;
          const text = yield* planText(request, scratch);
          const planMs = (yield* Clock.currentTimeMillis) - planStarted;

          const plan = yield* decodePlan(text).pipe(
            Effect.mapError((problem) =>
              failed(
                `The plan is not plan JSON: ${problem.message.slice(0, 300)}. A plan is shapes (kind, size, cf) and landmarks. Fix: make the plan command print what \`tools/island/village.luau plan\` writes.`
              )
            )
          );

          const camerasText = yield* fs
            .readFileString(settings.cameras)
            .pipe(Effect.mapError(unreadable(settings.cameras)));

          const cameraSet = yield* decodeCameras(camerasText).pipe(
            Effect.mapError((problem) =>
              failed(
                `The camera file ${settings.cameras} is not a camera set: ${problem.message.slice(0, 300)}. It lists named cameras by landmark. Fix: follow \`ror/village-cameras.json\` in @gds/adapter-roblox.`
              )
            )
          );

          const cameras = yield* placeCameras(
            cameraSet,
            plan.landmarks,
            chosenCameras(request)
          );

          const key = yield* planKey({
            cameras: cameraSet,
            plan,
            version: PLAN_RENDERER_VERSION,
          });

          const dir = path.join(home, key);
          const notePath = path.join(dir, "note.json");

          if (yield* exists(notePath)) {
            return yield* readNote(notePath, dir);
          }

          const rorStarted = yield* Clock.currentTimeMillis;
          const views = yield* drawViews(plan, cameras, dir);
          const rorMs = (yield* Clock.currentTimeMillis) - rorStarted;

          const note = {
            backend: PLAN_BACKEND,
            key,
            ms: planMs + rorMs,
            msPerView: rorMs / cameras.length,
            parts: drawnParts(plan),
            planMs,
            rorMs,
            views,
          };

          const encoded = yield* Schema.encodeEffect(NoteFile)(note).pipe(
            Effect.mapError(unreadable(dir))
          );

          yield* fs
            .writeFileString(notePath, encoded)
            .pipe(Effect.mapError(unreadable(dir)));

          return note;
        });

      return Renderer.of({
        render: (request) =>
          draw(request).pipe(
            Effect.catchTag(["UnknownCamera", "UnknownLandmark"], (problem) =>
              Effect.fail(failed(problem.message))
            ),
            Effect.map(asRender),
            Effect.provide(services)
          ),
      });
    })
  ).pipe(Layer.provide(layerWebCrypto));
