import { Effect, Option, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import { RobloxConfig } from "./config.js";
import type { SyncBeat } from "./render-cache.js";

const BeatSheet = Schema.Struct({
  beats: Schema.Array(
    Schema.Struct({
      flash: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
      from: Schema.Finite,
      name: Schema.String,
    })
  ),
});

const decodeSheet = Schema.decodeUnknownOption(
  Schema.fromJsonString(BeatSheet)
);

const SHEET_FPS = 60;

export const beatFromSheet = (
  sheet: typeof BeatSheet.Type,
  wanted: string | undefined
): Option.Option<typeof SyncBeat.Type> => {
  const named = sheet.beats.find(
    (beat) =>
      wanted !== undefined && beat.name.toLowerCase() === wanted.toLowerCase()
  );

  if (named !== undefined) {
    return Option.some({
      from: "sheet",
      name: named.name,
      t: named.from / SHEET_FPS,
    });
  }

  const flash = sheet.beats.find((beat) => beat.flash === true);

  return flash === undefined
    ? Option.none()
    : Option.some({
        from: "sheet flash",
        name: flash.name,
        t: flash.from / SHEET_FPS,
      });
};

export const sheetBeat = Effect.fnUntraced(function* sheetBeat(preset: string) {
  const config = yield* RobloxConfig;
  const fs = yield* FileSystem;
  const path = yield* Path;

  for (const dir of config.kits) {
    const text = yield* fs
      .readFileString(path.join(dir, "sheets", `${preset}.json`))
      .pipe(Effect.option);

    const beat = text.pipe(
      Option.flatMap(decodeSheet),
      Option.flatMap((sheet) => beatFromSheet(sheet, config.syncBeat))
    );

    if (Option.isSome(beat)) {
      return beat;
    }
  }

  return Option.none<typeof SyncBeat.Type>();
});

export const brightest = (
  frames: readonly { readonly luma: number; readonly time: number }[]
): typeof SyncBeat.Type => {
  let best = frames[0] ?? { luma: 0, time: 0 };

  for (const frame of frames) {
    if (frame.luma > best.luma) {
      best = frame;
    }
  }

  return { from: "measured", name: "brightest frame", t: best.time };
};
