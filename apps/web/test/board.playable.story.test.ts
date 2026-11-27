import { expect, it } from "@effect/vitest";
import { Command, given, message, model, story } from "foldkit/story";

import {
  LaunchTake,
  LoadAsset,
  LoadFrames,
  PickVariant,
  RecordInput,
} from "../src/client/board/command.js";
import { Message } from "../src/client/board/message.js";
import { initialModel, takeKey } from "../src/client/board/model.js";
import { update } from "../src/client/board/update.js";
import {
  combatAsset,
  combatFlags,
  combatFrames,
  framesPath,
  playableRender,
} from "./fixtures/combat.js";

const start = initialModel(combatFlags);

const keyA = takeKey("jab", "Strike", "Strike-A");

const keyB = takeKey("jab", "Strike", "Strike-B");

const loaded = (take: "Strike-A" | "Strike-B") => {
  const frames = combatFrames[framesPath(take)];

  if (frames === undefined) {
    throw new Error(`No fixture frames for ${take}.`);
  }

  return Message.LoadedFrames({
    frames,
    key: takeKey("jab", "Strike", take),
  });
};

it("opening a playable layer loads each take's frame strip and renders nothing", () => {
  story(
    update,
    given(start),
    message(Message.OpenedLayer({ asset: "jab", layer: "Strike" })),
    Command.expectExact(
      LoadFrames({ key: keyA, path: framesPath("Strike-A") }),
      LoadFrames({ key: keyB, path: framesPath("Strike-B") })
    ),
    Command.resolveAll(
      [LoadFrames, loaded("Strike-A")],
      [LoadFrames, loaded("Strike-B")]
    ),
    model((current) => {
      expect(Object.keys(current.frames).toSorted()).toEqual([keyA, keyB]);
      expect(current.rendering).toEqual([]);
    })
  );
});

it("Play launches the take once, and its new replay replaces the old strip", () => {
  const replay = {
    ...playableRender("Strike-A"),
    numbers: "E:/game/.cache/devstudio/combat/jab/Strike-A.2.frames.json",
  };

  story(
    update,
    given(start),
    message(Message.OpenedLayer({ asset: "jab", layer: "Strike" })),
    Command.resolveAll(
      [LoadFrames, loaded("Strike-A")],
      [LoadFrames, loaded("Strike-B")]
    ),
    message(Message.ClickedPlay({ variant: "Strike-A" })),
    Command.expectExact(
      LaunchTake({
        asset: "jab",
        layer: "Strike",
        studio: "combat",
        take: "Strike-A",
      })
    ),
    Command.resolve(
      LaunchTake,
      Message.Launched({
        asset: "jab",
        layer: "Strike",
        render: replay,
        variant: "Strike-A",
      })
    ),
    model((current) => {
      expect(current.launching).toEqual([]);
      expect(current.frames[keyA]).toBeUndefined();
      expect(current.frames[keyB]).toBeDefined();
      expect(
        current.assets[0]?.asset.layers.Strike?.variants[0]?.render?.numbers
      ).toBe(replay.numbers);
    }),
    Command.expectExact(LoadFrames({ key: keyA, path: replay.numbers })),
    Command.resolve(LoadFrames, loaded("Strike-A"))
  );
});

it("a failed launch names the take and frees its Play button", () => {
  story(
    update,
    given(start),
    message(Message.OpenedLayer({ asset: "jab", layer: "Strike" })),
    Command.resolveAll(
      [LoadFrames, loaded("Strike-A")],
      [LoadFrames, loaded("Strike-B")]
    ),
    message(Message.ClickedPlay({ variant: "Strike-B" })),
    Command.resolve(
      LaunchTake,
      Message.FailedLaunch({
        asset: "jab",
        layer: "Strike",
        message: "launch is not built yet.",
        variant: "Strike-B",
      })
    ),
    model((current) => {
      expect(current.launching).toEqual([]);
      expect(current.status.state).toBe("failed");
      expect(current.status.message).toContain("Strike-B");
    })
  );
});

it("Record keeps a record on the asset and reloads it, and a reading never blocks a pick", () => {
  const recorded = {
    ...combatAsset,
    records: [
      {
        id: "rec-1",
        start: {},
        tickRate: 60,
        ticks: [[12, ["Attack"]] as const],
        version: 1 as const,
      },
    ],
  };

  story(
    update,
    given(start),
    message(Message.ClickedRecord({ asset: "jab" })),
    Command.expectExact(RecordInput({ asset: "jab", studio: "combat" })),
    Command.resolve(
      RecordInput,
      Message.Recorded({ asset: "jab", record: "rec-1" })
    ),
    Command.expectExact(LoadAsset({ asset: "jab", studio: "combat" })),
    Command.resolve(LoadAsset, Message.LoadedAsset({ asset: recorded })),
    model((current) => {
      expect(current.recording).toEqual([]);
      expect(current.assets[0]?.asset.records?.map(({ id }) => id)).toEqual([
        "rec-1",
      ]);
      expect(current.status.state).toBe("done");
    }),
    message(Message.OpenedLayer({ asset: "jab", layer: "Strike" })),
    Command.resolveAll(
      [LoadFrames, loaded("Strike-A")],
      [LoadFrames, loaded("Strike-B")]
    ),
    message(Message.ChoseVariant({ variant: "Strike-B" })),
    Command.expectExact(
      PickVariant({
        asset: "jab",
        by: "Phát",
        layer: "Strike",
        note: "",
        studio: "combat",
        variant: "Strike-B",
      })
    ),
    Command.resolve(PickVariant, Message.FailedPick({ message: "store down" }))
  );
});

it("a second Play or Record while one runs sends nothing", () => {
  const open = update(
    start,
    Message.OpenedLayer({ asset: "jab", layer: "Strike" })
  ).model;

  const launching = update(
    open,
    Message.ClickedPlay({ variant: "Strike-A" })
  ).model;

  const recording = update(open, Message.ClickedRecord({ asset: "jab" })).model;

  expect(
    update(launching, Message.ClickedPlay({ variant: "Strike-A" })).commands ??
      []
  ).toEqual([]);
  expect(
    update(launching, Message.ClickedPlay({ variant: "Strike-B" })).commands
      ?.length
  ).toBe(1);
  expect(
    update(recording, Message.ClickedRecord({ asset: "jab" })).commands ?? []
  ).toEqual([]);
});
