import { fileURLToPath } from "node:url";

import { AdapterFailed, Renderer } from "@gds/model";
import type { RenderRequest } from "@gds/model";
import {
  Effect,
  Layer,
  Option,
  Queue,
  Ref,
  Schema,
  Scope,
  Semaphore,
  Stream,
} from "effect";
import type { Cause } from "effect";
import type { Digest } from "effect/crypto/Digest";
import { layerWebCrypto } from "effect/crypto/Digest";
import type { FileSystem } from "effect/FileSystem";
import type { Path } from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { RobloxConfig } from "./config.js";
import { EasyvfxKits } from "./easyvfx-kits.js";
import { cachedRender, SyncBeat } from "./render-cache.js";
import type { RenderPaths } from "./render-cache.js";

export const EVFX_BACKEND = "roblox.evfx";

const Reply = Schema.Union([
  Schema.Struct({ ready: Schema.Literal(true) }),
  Schema.Struct({
    id: Schema.String,
    ok: Schema.Struct({ beat: SyncBeat, ms: Schema.Finite }),
  }),
  Schema.Struct({ error: Schema.String, id: Schema.String }),
]);

const decodeReply = Schema.decodeUnknownEffect(Schema.fromJsonString(Reply));

const EXITED = "gds-evfx-worker-exited";

interface EvfxJob {
  readonly beat: string | undefined;
  readonly gif: string;
  readonly id: string;
  readonly kit: string;
  readonly layer: string;
  readonly picks: Readonly<Record<string, string>>;
  readonly preset: string;
  readonly size: readonly [number, number];
  readonly still: string;
  readonly take: string;
  readonly work: string;
}

const failed = (message: string) =>
  new AdapterFailed({ adapter: EVFX_BACKEND, message });

const encoder = new TextEncoder();

const script = fileURLToPath(
  new URL("../evfx/render_take.py", import.meta.url)
);

export const evfxRenderer = Layer.effect(
  Renderer,
  Effect.gen(function* makeEvfxRenderer() {
    const config = yield* RobloxConfig;
    const kits = yield* EasyvfxKits;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const scope = yield* Scope.Scope;

    const services = yield* Effect.context<
      RobloxConfig | FileSystem | Path | Digest
    >();

    const lock = yield* Semaphore.make(1);

    const start = Effect.gen(function* startWorker() {
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          config.python,
          [script, config.easyvfx, ...config.kits],
          {
            env: { GDS_EVFX_WORKERS: String(config.workers) },
            extendEnv: true,
          }
        )
      );

      const outbox = yield* Queue.unbounded<Uint8Array, Cause.Done>();
      yield* Stream.fromQueue(outbox).pipe(
        Stream.run(handle.stdin),
        Effect.ignore,
        Effect.forkScoped
      );
      const replies = yield* Queue.unbounded<string>();
      yield* Stream.decodeText(handle.stdout).pipe(
        Stream.splitLines,
        Stream.filter((line) => line.trim() !== ""),
        Stream.runForEach((line) => Queue.offer(replies, line)),
        Effect.ignore,
        Effect.andThen(Queue.offer(replies, EXITED)),
        Effect.forkScoped
      );
      yield* Stream.runDrain(handle.stderr).pipe(
        Effect.ignore,
        Effect.forkScoped
      );

      const next = Queue.take(replies).pipe(
        Effect.tap((line) =>
          line === EXITED ? Queue.offer(replies, EXITED) : Effect.void
        ),
        Effect.flatMap((line) =>
          line === EXITED
            ? Effect.fail(
                failed(
                  `The evfx render worker exited. Python could not run ${script} with EasyVFX at ${config.easyvfx}. Fix: run \`${config.python} -m pip install -r ${config.easyvfx}/tools/evfx/requirements.txt\` and render again.`
                )
              )
            : decodeReply(line).pipe(
                Effect.mapError(() =>
                  failed(
                    `The evfx render worker printed ${line.slice(0, 200)}. Only JSON replies are expected on its stdout. Fix: keep prints out of \`${script}\`.`
                  )
                )
              )
        )
      );

      yield* next;

      const send = (job: EvfxJob) =>
        Queue.offer(outbox, encoder.encode(`${JSON.stringify(job)}\n`));

      return { next, send };
    }).pipe(
      Effect.catchTag("PlatformError", (problem) =>
        Effect.fail(
          failed(
            `The evfx render worker did not start: ${problem.message}. It is ${config.python} running ${script}. Fix: set \`python\` to a Python with numpy and Pillow.`
          )
        )
      ),
      Effect.provideService(Scope.Scope, scope)
    );

    const running = yield* Ref.make(
      Option.none<Effect.Success<typeof start>>()
    );

    const worker = Effect.gen(function* liveWorker() {
      const known = yield* Ref.get(running);

      if (Option.isSome(known)) {
        return known.value;
      }

      const live = yield* start;

      yield* Ref.set(running, Option.some(live));

      return live;
    });

    const draw =
      (request: RenderRequest, preset: string) => (paths: RenderPaths) =>
        lock.withPermits(1)(
          Effect.gen(function* drawTake() {
            const live = yield* worker;
            yield* live.send({
              beat: config.syncBeat,
              gif: paths.gif,
              id: paths.key,
              kit: request.asset,
              layer: request.layer,
              picks: request.mix,
              preset,
              size: config.size,
              still: paths.still,
              take: request.variant.id,
              work: paths.work,
            });
            const reply = yield* live.next;

            if ("error" in reply) {
              return yield* failed(
                `EasyVFX could not draw ${request.asset} ${request.layer} ${request.variant.id}: ${reply.error.slice(-600)}. The kit export or the renderer refused this mix. Fix: run \`python tools/evfx timeline kit__${request.asset}__${request.layer}__${request.variant.id}__in\` in ${config.easyvfx} to see the error.`
              );
            }

            if ("ready" in reply) {
              return yield* failed(
                "The evfx render worker announced itself twice. Its replies are out of step with the jobs. Fix: restart the dev studio."
              );
            }

            return { beat: reply.ok.beat };
          })
        );

    return Renderer.of({
      render: (request) =>
        kits
          .take(
            request.studio,
            request.asset,
            request.layer,
            request.variant.id
          )
          .pipe(
            Effect.flatMap(({ kit }) =>
              cachedRender(
                EVFX_BACKEND,
                request,
                kit,
                draw(request, kit.preset)
              )
            ),
            Effect.provide(services)
          ),
    });
  })
).pipe(Layer.provide(layerWebCrypto));
