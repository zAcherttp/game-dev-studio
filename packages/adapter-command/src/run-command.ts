import { AdapterFailed } from "@gds/model";
import type { ApplyRequest, Render, RenderRequest } from "@gds/model";
import { Duration, Effect, Schema, Stream } from "effect";
import { Path } from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { CommandConfig } from "./command-config.js";

export interface StudioRequest {
  readonly studio: string;
}

export interface LayerRequest extends StudioRequest {
  readonly asset: string;
  readonly layer: string;
}

export interface GateRequest extends RenderRequest {
  readonly render: typeof Render.Type;
}

export type CommandRequest =
  | StudioRequest
  | LayerRequest
  | RenderRequest
  | ApplyRequest
  | GateRequest;

export interface Ran {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

const TAIL = 800;

export const tailOf = (text: string): string => {
  const trimmed = text.trim();

  return trimmed.length > TAIL ? `...${trimmed.slice(-TAIL)}` : trimmed;
};

export const insideRoot = (
  path: Path,
  root: string,
  dir: string | undefined
): string | undefined => {
  if (dir === undefined) {
    return root;
  }

  const resolved = path.resolve(root, dir);
  const relative = path.relative(root, resolved);

  return relative.startsWith("..") || path.isAbsolute(relative)
    ? undefined
    : resolved;
};

export const runArgv = Effect.fnUntraced(function* runArgv(
  adapter: string,
  argv: readonly [string, ...string[]],
  request: CommandRequest,
  dir?: string
): Effect.fn.Return<
  Ran,
  AdapterFailed,
  CommandConfig | ChildProcessSpawner.ChildProcessSpawner | Path
> {
  const { root, timeout } = yield* (yield* CommandConfig).settings;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const path = yield* Path;
  const shown = argv.join(" ");
  const cwd = insideRoot(path, root, dir);

  if (cwd === undefined) {
    return yield* new AdapterFailed({
      adapter,
      message: `\`${shown}\` asks to run in ${dir ?? ""}, outside the game checkout ${root}. Studio commands run only inside \`GDS_GAME\`. Fix: give a \`cwd\` inside the checkout in the studio file.`,
    });
  }

  const [program, ...args] = argv;
  const input = new TextEncoder().encode(JSON.stringify(request));

  return yield* Effect.scoped(
    Effect.gen(function* capture() {
      const handle = yield* spawner.spawn(
        ChildProcess.make(program, args, {
          cwd,
          stdin: { stream: Stream.make(input) },
        })
      );

      const [stdout, stderr, code] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" }
      );

      return { code: Number(code), stderr, stdout };
    })
  ).pipe(
    Effect.mapError(
      (problem) =>
        new AdapterFailed({
          adapter,
          message: `\`${shown}\` did not run in ${cwd}: ${problem.message}. The studio file names a program this machine cannot start. Fix: install it or correct the command in the studio file.`,
        })
    ),
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () =>
        Effect.fail(
          new AdapterFailed({
            adapter,
            message: `\`${shown}\` ran past ${Duration.format(timeout)} in ${cwd} and was stopped. A studio command must print its JSON and exit. Fix: make the command faster, or raise \`GDS_COMMAND_TIMEOUT_S\`.`,
          })
        ),
    })
  );
});

export const runJson = <S extends Schema.Top>(
  adapter: string,
  argv: readonly [string, ...string[]],
  request: CommandRequest,
  schema: S
) =>
  Effect.gen(function* runJsonCommand() {
    const shown = argv.join(" ");
    const ran = yield* runArgv(adapter, argv, request);

    if (ran.code !== 0) {
      return yield* new AdapterFailed({
        adapter,
        message: `\`${shown}\` exited ${ran.code}: ${tailOf(ran.stderr) || "(no stderr)"}. The game command failed. Fix: run it by hand in the game checkout with the same JSON on stdin.`,
      });
    }

    return yield* Schema.decodeEffect(Schema.fromJsonString(schema))(
      ran.stdout.trim()
    ).pipe(
      Effect.mapError(
        (issue) =>
          new AdapterFailed({
            adapter,
            message: `\`${shown}\` printed output that is not the JSON it owes: ${issue.message}. Printed: ${tailOf(ran.stdout) || "(nothing)"}. Fix: print exactly one JSON value on stdout and send logs to stderr.`,
          })
      )
    );
  });
