import { expect, it } from "@effect/vitest";
import { Option } from "effect";
import { Command, given, message, model, story } from "foldkit/story";

import { withPick } from "../src/client/board/api.js";
import {
  PickVariant,
  RenderComposed,
  RenderSolo,
  RequestRound,
} from "../src/client/board/command.js";
import { Message } from "../src/client/board/message.js";
import { initialModel } from "../src/client/board/model.js";
import type { BoardModel } from "../src/client/board/model.js";
import { update } from "../src/client/board/update.js";
import { fireFlags, fireKit } from "./fixtures/fire-kit.js";
import { rendersOf } from "./fixtures/renders.js";

const start = initialModel(fireFlags);

const stillRender = {
  kind: "gif" as const,
  ms: 900,
  path: "E:/game/.cache/devstudio/vfx/fire/FireLoop-F.gif",
  still: "E:/game/.cache/devstudio/vfx/fire/FireLoop-F.still.png",
};

const fireLoop = (current: BoardModel) =>
  current.assets[0]?.asset.layers.FireLoop;

it("a key picks that column's variant with the note, and the mix follows the stored asset", () => {
  const picked = withPick(
    fireKit,
    {
      asset: "fire",
      by: "Phát",
      layer: "FireLoop",
      note: "taller core",
      studio: "vfx",
      variant: "FireLoop-G",
    },
    "2026-11-25T00:00:00.000Z"
  );

  story(
    update,
    given(start),
    message(Message.OpenedLayer({ asset: "fire", layer: "FireLoop" })),
    Command.resolveAll(...rendersOf("FireLoop")),
    message(Message.UpdatedNote({ value: " taller core " })),
    message(Message.PressedPickKey({ index: 3 })),
    Command.expectExact(
      PickVariant({
        asset: "fire",
        by: "Phát",
        layer: "FireLoop",
        note: "taller core",
        studio: "vfx",
        variant: "FireLoop-G",
      })
    ),
    Command.resolve(PickVariant, Message.SucceededPick({ asset: picked })),
    Command.resolveAll(
      [
        RenderSolo,
        Message.RenderedSolo({
          asset: "fire",
          layer: "FireLoop",
          render: stillRender,
          variant: "FireLoop-G",
        }),
      ],
      [
        RenderComposed,
        Message.RenderedComposed({ key: "fire|mix", render: stillRender }),
      ]
    ),
    model((current) => {
      expect(current.assets[0]?.asset.mix.FireLoop).toBe("FireLoop-G");
      expect(fireLoop(current)?.picks.at(-1)?.note).toBe("taller core");
      expect(fireLoop(current)?.picks.length).toBe(
        (fireKit.layers.FireLoop?.picks.length ?? 0) + 1
      );
      expect(current.status.state).toBe("done");
      expect(current.note).toBe("");
    })
  );
});

it("keys do nothing while the picker is closed, and a second pick waits for the first", () => {
  story(
    update,
    given(start),
    message(Message.PressedPickKey({ index: 1 })),
    Command.expectNone(),
    message(Message.OpenedLayer({ asset: "fire", layer: "Streaks" })),
    Command.resolveAll(...rendersOf("Streaks")),
    message(Message.ChoseVariant({ variant: "Streaks-A" })),
    Command.resolve(PickVariant, Message.FailedPick({ message: "store down" })),
    model((current) => {
      expect(current.status).toEqual({
        message: "store down",
        state: "failed",
      });
    })
  );

  const saving = update(
    update(start, Message.OpenedLayer({ asset: "fire", layer: "Streaks" }))
      .model,
    Message.ChoseVariant({ variant: "Streaks-A" })
  ).model;

  expect(
    update(saving, Message.PressedPickKey({ index: 2 })).commands ?? []
  ).toEqual([]);
});

it("more along needs an axis, then asks for a round on the open layer", () => {
  story(
    update,
    given(start),
    message(Message.OpenedLayer({ asset: "fire", layer: "Fireball" })),
    Command.resolveAll(...rendersOf("Fireball")),
    message(Message.SubmittedRound()),
    Command.expectNone(),
    model((current) => {
      expect(current.status.state).toBe("failed");
    }),
    message(Message.UpdatedAxis({ value: "height" })),
    message(Message.UpdatedRoundNote({ value: "keep J's ring" })),
    message(Message.SubmittedRound()),
    Command.expectExact(
      RequestRound({
        asset: "fire",
        axis: "height",
        layer: "Fireball",
        note: "keep J's ring",
        studio: "vfx",
      })
    ),
    Command.resolve(
      RequestRound,
      Message.SucceededRound({
        request: {
          asset: "fire",
          at: "2026-11-25T00:00:00.000Z",
          axis: "height",
          layer: "Fireball",
          note: "keep J's ring",
          studio: "vfx",
        },
      })
    ),
    model((current) => {
      expect(current.status.message).toContain("height");
      expect(current.axis).toBe("");
    }),
    message(Message.ClosedPicker()),
    model((current) => {
      expect(Option.isNone(current.open)).toBe(true);
    })
  );
});

it("the first measure fits the board once; panning and zooming keep the user's view afterwards", () => {
  const measured = update(
    start,
    Message.MeasuredCanvas({ height: 600, width: 800 })
  ).model;

  const panned = update(
    update(
      update(measured, Message.PressedCanvas({ x: 10, y: 10 })).model,
      Message.MovedPointer({ x: 40, y: 5 })
    ).model,
    Message.ReleasedPointer()
  ).model;

  const resized = update(
    panned,
    Message.MeasuredCanvas({ height: 700, width: 1280 })
  ).model;

  expect(measured.fitted).toBe(true);
  expect(panned.camera.x).toBeCloseTo(measured.camera.x + 30);
  expect(panned.camera.y).toBeCloseTo(measured.camera.y - 5);
  expect(resized.camera).toEqual(panned.camera);

  const refitted = update(
    measured,
    Message.MeasuredCanvas({ height: 700, width: 1280 })
  ).model;

  expect(refitted.camera).not.toEqual(measured.camera);
  expect(
    update(resized, Message.MovedPointer({ x: 400, y: 400 })).model.camera
  ).toEqual(panned.camera);
});
