import {
  AdapterFailed,
  Check,
  GateResult,
  Renderer,
  gateApplies,
  judge,
  readPath,
  ruleText,
} from "@gds/model";
import type {
  Applied,
  ApplyRequest,
  CheckRequest,
  GateDef,
  Render,
  RenderRequest,
} from "@gds/model";
import {
  Clock,
  Context,
  Effect,
  Layer,
  Option,
  Schema,
  Semaphore,
} from "effect";
import type { Digest } from "effect/crypto/Digest";
import { layerWebCrypto } from "effect/crypto/Digest";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  CallOutcome,
  cameraLuau,
  gateCall,
  markedLine,
  parseCall,
  serverCallsLuau,
} from "./dev-call.js";
import type { CallContext, DevCall } from "./dev-call.js";
import { chosenCameras, seedOf } from "./plan-renderer.js";
import { digestText, sortedKeys } from "./render-key.js";
import { placeProject, projectPaths, readProject } from "./scratch-place.js";
import { decodeShotCameras, shotCameras } from "./shot-cameras.js";
import type { PlacedShot, ShotCameraFileValue } from "./shot-cameras.js";

export const SHOT_BACKEND = "roblox.shot";

export const WORLDPLACE_CHECK = "roblox.worldplace";

export const SHOT_RENDERER_VERSION = "1";

export const SHOT_QUALITY = 21;

const DEFAULT_SETTLE_S = 3;

const SLOT_TASK = "gds-shot";

export interface ShotSettings {
  readonly apply: (
    root: string,
    request: ApplyRequest
  ) => Effect.Effect<Applied, AdapterFailed>;
  readonly cache: string;
  readonly cameras: string;
  readonly gameRoot: string;
  readonly gates: readonly (typeof GateDef.Type)[];
  readonly project: string;
  readonly python: string;
  readonly quality: number;
  readonly shotLayer: string;
  readonly slot?: string | undefined;
}

export const ShotNote = Schema.Struct({
  backend: Schema.String,
  key: Schema.String,
  ms: Schema.Finite,
  quality: Schema.Int,
  shots: Schema.Array(
    Schema.Struct({
      camera: Schema.String,
      ms: Schema.Finite,
      path: Schema.String,
    })
  ),
  stage: Schema.Array(CallOutcome),
});

const NoteFile = Schema.fromJsonString(ShotNote);

const Outcomes = Schema.fromJsonString(Schema.Array(CallOutcome));

const decodeOutcomes = Schema.decodeUnknownOption(Outcomes);

const failed = (message: string) =>
  new AdapterFailed({ adapter: SHOT_BACKEND, message });

const NO_SLOT =
  "no Studio slot: ask PC Bob for one (`slot request: <lane>, --project fresh, ~N min`), then set GDS_STUDIO_SLOT to the slot number";

export const pendingRender = (reason: string): typeof Render.Type => ({
  kind: "image",
  ms: 0,
  path: "",
  pending: reason,
});

export const callContext = (request: RenderRequest): CallContext => ({
  params: request.variant.params,
  seed: seedOf(request),
  take:
    request.whole === true
      ? request.mix
      : { ...request.mix, [request.layer]: request.variant.id },
});

export const checkContext = (request: CheckRequest): CallContext => ({
  params: {},
  seed: 1,
  take: request.mix,
});

export const stageCalls = (
  file: ShotCameraFileValue,
  context: CallContext
): Effect.Effect<readonly DevCall[], AdapterFailed> =>
  Effect.all(
    (file.shot?.stage ?? []).map((text) =>
      Effect.fromOption(parseCall(text, context)).pipe(
        Effect.mapError(() =>
          failed(
            `The stage call "${text}" is not \`Module.fn(args)\`. Stage calls run on the server before the shots. Fix: write it as \`Module.fn($seed, "text")\` in "shot"."stage" of the camera file.`
          )
        )
      )
    )
  );

export interface ShotKeyInputs {
  readonly base: string;
  readonly cameras: readonly PlacedShot[];
  readonly quality: number;
  readonly settle: number;
  readonly stage: readonly DevCall[];
  readonly variant?: unknown;
  readonly version: string;
}

export const shotKeyText = (inputs: ShotKeyInputs): string =>
  JSON.stringify(inputs, sortedKeys);

const tail = (text: string) => text.trim().slice(-600);

const unusable = (where: string) => (problem: { readonly message: string }) =>
  failed(
    `${where} is unusable: ${problem.message}. The shot renderer keeps its work there. Fix: delete \`${where}\` and render again.`
  );

const asRender = (note: typeof ShotNote.Type): typeof Render.Type => ({
  kind: "image",
  ms: note.ms,
  path: note.shots[0]?.path ?? "",
  views: note.shots.map(({ camera, path: shot }) => ({
    camera,
    path: shot,
  })),
});

const judged = (
  gate: typeof GateDef.Type,
  outcome: typeof CallOutcome.Type | undefined
) => {
  if (outcome === undefined || !outcome.ok) {
    return GateResult.make({
      id: gate.id,
      note: `${gate.title}: ${gate.run[0]} failed in Studio: ${outcome?.error ?? "no reading"}`,
      ok: false,
      value: null,
    });
  }

  const read =
    gate.json === undefined
      ? Option.some<Schema.Json>(0)
      : readPath(outcome.value ?? null, gate.json);

  if (Option.isNone(read)) {
    return GateResult.make({
      id: gate.id,
      note: `${gate.title}: the reading of ${gate.run[0]} has no ${gate.json ?? ""}`,
      ok: false,
      value: null,
    });
  }

  const ok = judge(gate.pass, read.value);

  return GateResult.make({
    id: gate.id,
    note: `${gate.title}: ${JSON.stringify(read.value)} ${ok ? "meets" : "fails"} ${ruleText(gate.pass)}`,
    ok,
    value: read.value,
  });
};

export class ShotStudio extends Context.Service<
  ShotStudio,
  {
    readonly open: Check["Service"]["open"];
    readonly render: Renderer["Service"]["render"];
  }
>()("@gds/adapter-roblox/ShotStudio") {}

export const shotStudio = (settings: ShotSettings) =>
  Layer.effect(
    ShotStudio,
    Effect.gen(function* makeShotStudio() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem;
      const path = yield* Path;
      const services = yield* Effect.context<Digest>();
      const studio = yield* Semaphore.make(1);

      const run = (
        command: string,
        args: readonly string[],
        cwd: string,
        fix: string
      ) =>
        spawner
          .string(ChildProcess.make(command, args, { cwd, extendEnv: true }))
          .pipe(
            Effect.mapError((problem) =>
              failed(
                `\`${[command, ...args].join(" ")}\` failed in ${cwd}: ${problem.message}. Fix: ${fix}`
              )
            )
          );

      const git = (cwd: string, args: readonly string[]) =>
        run(
          "git",
          args,
          cwd,
          `run the same git command by hand in ${cwd} and correct what it reports.`
        );

      const exists = (where: string) =>
        fs.exists(where).pipe(Effect.orElseSucceed(() => false));

      const slotScript = path.join(settings.gameRoot, "scripts", "studio-slot");

      const slot = (args: readonly string[]) =>
        run(
          settings.python,
          [slotScript, ...args],
          settings.gameRoot,
          `take a slot from PC Bob first, then run \`${settings.python} scripts/studio-slot ${args.join(" ")}\` by hand in ${settings.gameRoot}.`
        );

      const readCameras = fs.readFileString(settings.cameras).pipe(
        Effect.mapError(unusable(settings.cameras)),
        Effect.flatMap((text) =>
          decodeShotCameras(text).pipe(
            Effect.mapError((problem) =>
              failed(
                `The camera file ${settings.cameras} has no camera list: ${problem.message.slice(0, 300)}. A Studio shot reads each camera's position, lookAt and fov in world studs. Fix: correct the studio's camera file.`
              )
            )
          )
        )
      );

      const gameState = Effect.gen(function* gameState() {
        const head = (yield* git(settings.gameRoot, [
          "rev-parse",
          "HEAD",
        ])).trim();

        const diff = yield* git(settings.gameRoot, [
          "diff",
          "--binary",
          "HEAD",
        ]);

        const untracked = (yield* git(settings.gameRoot, [
          "ls-files",
          "--others",
          "--exclude-standard",
          "-z",
        ]))
          .split("\0")
          .filter((name) => name !== "");

        return { diff, head, untracked };
      });

      type GameState = Effect.Success<typeof gameState>;

      const syncTree = (tree: string, work: string, state: GameState) =>
        Effect.gen(function* syncTreeSteps() {
          if (!(yield* exists(path.join(tree, ".git")))) {
            yield* fs
              .makeDirectory(path.dirname(tree), { recursive: true })
              .pipe(Effect.mapError(unusable(tree)));
            yield* git(settings.gameRoot, [
              "worktree",
              "add",
              "--detach",
              "--force",
              tree,
              state.head,
            ]);
          }

          yield* git(tree, ["checkout", "--force", "--detach", state.head]);
          yield* git(tree, ["clean", "-fdq"]);

          if (state.diff.trim() !== "") {
            const patch = path.join(work, "game.diff");

            yield* fs
              .writeFileString(patch, state.diff)
              .pipe(Effect.mapError(unusable(work)));
            yield* git(tree, ["apply", "--whitespace=nowarn", patch]);
          }

          for (const name of state.untracked) {
            const into = path.join(tree, name);

            yield* fs
              .makeDirectory(path.dirname(into), { recursive: true })
              .pipe(Effect.mapError(unusable(tree)));
            yield* fs
              .copyFile(path.join(settings.gameRoot, name), into)
              .pipe(Effect.mapError(unusable(into)));
          }
        });

      const writePlace = (tree: string, work: string) =>
        Effect.gen(function* writePlaceSteps() {
          const source = path.join(tree, settings.project);

          const project = yield* fs.readFileString(source).pipe(
            Effect.mapError(unusable(source)),
            Effect.flatMap((text) =>
              readProject(text).pipe(
                Effect.mapError(() =>
                  failed(
                    `${source} is not a Rojo project. The shot place is built from it. Fix: name a Rojo project file in the shot settings.`
                  )
                )
              )
            )
          );

          const found = new Set<string>();

          for (const relative of projectPaths(project)) {
            const inTree = path.join(tree, relative);

            const listed = yield* fs
              .readDirectory(inTree)
              .pipe(Effect.orElseSucceed((): readonly string[] => []));

            if (
              listed.length > 0 ||
              (yield* fs.stat(inTree).pipe(
                Effect.map((info) => info.type === "File"),
                Effect.orElseSucceed(() => false)
              ))
            ) {
              found.add(relative);
            }
          }

          const placed = placeProject(project, {
            game: settings.gameRoot,
            has: (relative) => found.has(relative),
            join: (root, relative) => path.join(root, relative),
            tree,
          });

          const out = path.join(work, "shot.project.json");

          yield* fs
            .writeFileString(out, JSON.stringify(placed, undefined, 1))
            .pipe(Effect.mapError(unusable(work)));

          return out;
        });

      const runLuau = (
        work: string,
        name: string,
        code: string,
        side: readonly string[]
      ) =>
        Effect.gen(function* runLuauSteps() {
          const file = path.join(work, `${name}.luau`);

          yield* fs
            .writeFileString(file, code)
            .pipe(Effect.mapError(unusable(work)));

          const printed = yield* slot(["run", file, ...side]);

          return yield* Effect.fromOption(markedLine(printed)).pipe(
            Effect.mapError(() =>
              failed(
                `Studio returned nothing from ${name}: ${tail(printed)}. The place did not load the game, or the script failed. Fix: run \`scripts/studio-slot run ${file}\` in the open slot and read its error.`
              )
            )
          );
        });

      const callAll = (work: string, name: string, calls: readonly DevCall[]) =>
        calls.length === 0
          ? Effect.succeed<readonly (typeof CallOutcome.Type)[]>([])
          : runLuau(work, name, serverCallsLuau(calls), ["--server"]).pipe(
              Effect.flatMap((line) =>
                Effect.fromOption(decodeOutcomes(line)).pipe(
                  Effect.mapError(() =>
                    failed(
                      `Studio returned ${line.slice(0, 300)} from ${name}, not a list of call outcomes. Fix: run the file by hand in the open slot.`
                    )
                  )
                )
              )
            );

      const shoot = (
        work: string,
        dir: string,
        cameras: readonly PlacedShot[],
        settle: number
      ) =>
        Effect.all(
          cameras.map((camera) =>
            Effect.gen(function* shootOne() {
              const started = yield* Clock.currentTimeMillis;

              yield* runLuau(
                work,
                `camera-${camera.id}`,
                cameraLuau(camera, settle),
                ["--client"]
              );

              const out = path.join(dir, `${camera.id}.jpg`);

              yield* slot(["shot", out, "--scale", "1"]);

              const ms = (yield* Clock.currentTimeMillis) - started;

              return { camera: camera.id, ms, path: out };
            })
          )
        );

      const inSlot = <A>(
        place: string,
        use: Effect.Effect<A, AdapterFailed>
      ): Effect.Effect<A, AdapterFailed> =>
        Effect.acquireUseRelease(
          slot([
            "up",
            SLOT_TASK,
            "--project-file",
            place,
            "--quality",
            String(settings.quality),
            ...(settings.slot === undefined ? [] : ["--slot", settings.slot]),
          ]),
          () => use,
          () => slot(["down"]).pipe(Effect.ignore)
        );

      const home = (studioId: string) =>
        path.join(settings.cache, studioId, "shot");

      const prepare = (
        studioId: string,
        apply: Option.Option<ApplyRequest>,
        work: string
      ) =>
        Effect.gen(function* prepareSteps() {
          const tree = path.join(home(studioId), "tree");
          const state = yield* gameState;

          yield* fs
            .makeDirectory(work, { recursive: true })
            .pipe(Effect.mapError(unusable(work)));
          yield* syncTree(tree, work, state);

          if (Option.isSome(apply)) {
            yield* settings.apply(tree, apply.value);
          }

          return yield* writePlace(tree, work);
        });

      const readNote = (notePath: string) =>
        fs
          .readFileString(notePath)
          .pipe(
            Effect.flatMap(Schema.decodeEffect(NoteFile)),
            Effect.mapError(unusable(notePath))
          );

      const draw = (request: RenderRequest) =>
        Effect.gen(function* drawShots() {
          const file = yield* readCameras;

          const placed = yield* shotCameras(
            file,
            request.layer,
            chosenCameras(request)
          ).pipe(Effect.mapError((problem) => failed(problem.message)));

          if (placed.kind === "pending") {
            return pendingRender(placed.reason);
          }

          if (settings.slot === undefined) {
            return pendingRender(NO_SLOT);
          }

          const stage = yield* stageCalls(file, callContext(request));
          const settle = file.shot?.settle ?? DEFAULT_SETTLE_S;
          const state = yield* gameState;

          const key = (yield* digestText(
            shotKeyText({
              base: `${state.head}\n${state.diff}\n${state.untracked.join("\n")}`,
              cameras: placed.cameras,
              quality: settings.quality,
              settle,
              stage,
              variant:
                request.whole === true
                  ? undefined
                  : { id: request.variant.id, params: request.variant.params },
              version: SHOT_RENDERER_VERSION,
            })
          )).slice(0, 20);

          const dir = path.join(home(request.studio), request.asset, key);
          const notePath = path.join(dir, "note.json");

          if (yield* exists(notePath)) {
            return asRender(yield* readNote(notePath));
          }

          const started = yield* Clock.currentTimeMillis;
          const work = path.join(dir, "work");

          const place = yield* prepare(
            request.studio,
            request.whole === true
              ? Option.none()
              : Option.some({
                  asset: request.asset,
                  layer: request.layer,
                  studio: request.studio,
                  variant: request.variant,
                }),
            work
          );

          const note = yield* inSlot(
            place,
            Effect.gen(function* inStudio() {
              const staged = yield* callAll(work, "stage", stage);
              const broken = staged.find((outcome) => !outcome.ok);

              if (broken !== undefined) {
                return yield* failed(
                  `A stage call failed in Studio: ${broken.error ?? "no error text"}. The shots need the place staged first. Fix: correct "shot"."stage" in ${settings.cameras}.`
                );
              }

              const shots = yield* shoot(work, dir, placed.cameras, settle);
              const ms = (yield* Clock.currentTimeMillis) - started;

              return {
                backend: SHOT_BACKEND,
                key,
                ms,
                quality: settings.quality,
                shots,
                stage: staged,
              };
            })
          );

          const encoded = yield* Schema.encodeEffect(NoteFile)(note).pipe(
            Effect.mapError(unusable(dir))
          );

          yield* fs
            .writeFileString(notePath, encoded)
            .pipe(Effect.mapError(unusable(dir)));

          return asRender(note);
        });

      const open = (request: CheckRequest) =>
        Effect.gen(function* openWorldPlace() {
          if (settings.slot === undefined) {
            return yield* failed(
              `The ${WORLDPLACE_CHECK} check opens Roblox Studio and there is ${NO_SLOT}.`
            );
          }

          const file = yield* readCameras;
          const context = checkContext(request);
          const stage = yield* stageCalls(file, context);
          const settle = file.shot?.settle ?? DEFAULT_SETTLE_S;

          const placed = yield* shotCameras(file, settings.shotLayer).pipe(
            Effect.mapError((problem) => failed(problem.message))
          );

          const gates = settings.gates.filter(
            (gate) => gate.where === "check" && gateApplies(gate, request.kind)
          );

          const calls = yield* Effect.all(
            gates.map((gate) =>
              Effect.fromOption(gateCall(gate.run, context)).pipe(
                Effect.mapError(() =>
                  failed(
                    `Check gate ${gate.id} runs "${gate.run.join(" ")}", which is not a dev call. A check gate reads a dev API inside Studio. Fix: write its run as ["Module.fn", ...args] in the studio file.`
                  )
                )
              )
            )
          );

          const stamp = yield* Clock.currentTimeMillis;

          const dir = path.join(
            home(request.studio),
            request.asset,
            "check",
            String(stamp)
          );

          const work = path.join(dir, "work");
          const place = yield* prepare(request.studio, Option.none(), work);

          const { readings, shots, staged } = yield* inSlot(
            place,
            Effect.gen(function* inStudio() {
              const stagedNow = yield* callAll(work, "stage", stage);
              const readNow = yield* callAll(work, "gates", calls);
              const shotNow = yield* shoot(work, dir, placed.cameras, settle);

              return { readings: readNow, shots: shotNow, staged: stagedNow };
            })
          );

          const results = gates.map((gate, index) =>
            judged(gate, readings[index])
          );

          const readingsPath = path.join(dir, "check.json");

          yield* fs
            .writeFileString(
              readingsPath,
              JSON.stringify(
                { gates: results, readings, shots, stage: staged },
                undefined,
                1
              )
            )
            .pipe(Effect.mapError(unusable(dir)));

          const passed = results.filter(({ ok }) => ok).length;
          const waiting = placed.kind === "pending" ? ` ${placed.reason}.` : "";

          const each = shots
            .map(({ camera, ms }) => `${camera} ${Math.round(ms)} ms`)
            .join(", ");

          return {
            gates: results,
            note: `Roblox Studio at quality ${settings.quality}: ${passed}/${results.length} check gates pass; ${shots.length} shots (${each || "none"}).${waiting} Readings in ${readingsPath}.`,
            shot: shots[0]?.path ?? readingsPath,
            views: shots.map(({ camera, path: shot }) => ({
              camera,
              path: shot,
            })),
          };
        });

      return ShotStudio.of({
        open: (request) =>
          studio.withPermits(1)(open(request)).pipe(Effect.provide(services)),
        render: (request) =>
          studio.withPermits(1)(draw(request)).pipe(Effect.provide(services)),
      });
    })
  ).pipe(Layer.provide(layerWebCrypto));

export const shotRenderer = Layer.effect(
  Renderer,
  Effect.gen(function* makeShotRenderer() {
    const shots = yield* ShotStudio;

    return Renderer.of({ render: shots.render });
  })
);

export const worldplaceCheck = Layer.effect(
  Check,
  Effect.gen(function* makeWorldplaceCheck() {
    const shots = yield* ShotStudio;

    return Check.of({ open: shots.open });
  })
);
