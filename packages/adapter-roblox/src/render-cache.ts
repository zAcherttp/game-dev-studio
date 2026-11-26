import { AdapterFailed } from "@gds/model";
import type { Render, RenderRequest } from "@gds/model";
import { Clock, Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { RobloxConfig } from "./config.js";
import { renderKey } from "./render-key.js";

export const SyncBeat = Schema.Struct({
  from: Schema.String,
  name: Schema.String,
  t: Schema.Finite,
});

export const RenderNote = Schema.Struct({
  backend: Schema.String,
  beat: SyncBeat,
  gif: Schema.String,
  key: Schema.String,
  missing: Schema.optionalKey(Schema.Array(Schema.String)),
  ms: Schema.Finite,
  still: Schema.String,
});

const NoteFile = Schema.fromJsonString(RenderNote);

export interface RenderPaths {
  readonly gif: string;
  readonly key: string;
  readonly still: string;
  readonly work: string;
}

export interface Drawn {
  readonly beat: typeof SyncBeat.Type;
  readonly missing?: readonly string[] | undefined;
}

export const cachedRender = <E, R>(
  backend: string,
  request: RenderRequest,
  kit: Schema.Json,
  draw: (paths: RenderPaths) => Effect.Effect<Drawn, E, R>
) =>
  Effect.gen(function* renderOrReuse() {
    const config = yield* RobloxConfig;
    const fs = yield* FileSystem;
    const path = yield* Path;

    const key = yield* renderKey({
      backend,
      kit,
      layer: request.layer,
      mix: request.mix,
      take: request.variant.id,
    });

    const dir = path.join(config.cache, request.studio, request.asset);

    const stem = path.join(
      dir,
      `${request.layer}-${request.variant.id}-${key}`
    );

    const paths: RenderPaths = {
      gif: `${stem}.gif`,
      key,
      still: `${stem}.still.png`,
      work: path.join(dir, "work", key),
    };

    const notePath = `${stem}.json`;

    const unreadable = (error: { readonly message: string }) =>
      new AdapterFailed({
        adapter: backend,
        message: `The render cache at ${dir} is unusable: ${error.message}. Renders are kept there between runs. Fix: delete \`${dir}\` and render again.`,
      });

    const kept = yield* fs.exists(notePath).pipe(Effect.mapError(unreadable));

    if (kept) {
      const text = yield* fs
        .readFileString(notePath)
        .pipe(Effect.mapError(unreadable));

      const note = yield* Schema.decodeEffect(NoteFile)(text).pipe(
        Effect.mapError(unreadable)
      );

      return {
        beat: { name: note.beat.name, t: note.beat.t },
        kind: "gif",
        ms: note.ms,
        path: note.gif,
        still: note.still,
      } satisfies typeof Render.Type;
    }

    yield* fs
      .makeDirectory(paths.work, { recursive: true })
      .pipe(Effect.mapError(unreadable));
    const started = yield* Clock.currentTimeMillis;
    const drawn = yield* draw(paths);
    const ms = (yield* Clock.currentTimeMillis) - started;

    const base = {
      backend,
      beat: drawn.beat,
      gif: paths.gif,
      key,
      ms,
      still: paths.still,
    };

    const note = yield* Schema.encodeEffect(NoteFile)(
      drawn.missing === undefined ? base : { ...base, missing: drawn.missing }
    ).pipe(Effect.mapError(unreadable));

    yield* fs.writeFileString(notePath, note).pipe(Effect.mapError(unreadable));

    return {
      beat: { name: drawn.beat.name, t: drawn.beat.t },
      kind: "gif",
      ms,
      path: paths.gif,
      still: paths.still,
    } satisfies typeof Render.Type;
  });
