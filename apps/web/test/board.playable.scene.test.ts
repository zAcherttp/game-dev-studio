import { it } from "@effect/vitest";
import { Option } from "effect";
import {
  all,
  click,
  Command,
  expect,
  expectAll,
  given,
  inside,
  Mount,
  role,
  scene,
  selector,
  text,
} from "foldkit/scene";

import {
  LaunchTake,
  LoadFrames,
  WatchCanvas,
} from "../src/client/board/command.js";
import { Message } from "../src/client/board/message.js";
import { initialModel, takeKey } from "../src/client/board/model.js";
import type { BoardModel } from "../src/client/board/model.js";
import { playClips } from "../src/client/board/playable.js";
import { syncPlan } from "../src/client/board/sync.js";
import { update } from "../src/client/board/update.js";
import { view } from "../src/features/board/index.js";
import {
  frameLog,
  combatFlags,
  combatFrames,
  framesPath,
  playableRender,
  timings,
} from "./fixtures/combat.js";

const opened = (): BoardModel => {
  const open = update(
    initialModel(combatFlags),
    Message.OpenedLayer({ asset: "jab", layer: "Strike" })
  ).model;

  let current = open;

  for (const take of ["Strike-A", "Strike-B"] as const) {
    const frames = combatFrames[framesPath(take)];

    if (frames !== undefined) {
      current = update(
        current,
        Message.LoadedFrames({ frames, key: takeKey("jab", "Strike", take) })
      ).model;
    }
  }

  return current;
};

const measured = Mount.resolve(
  WatchCanvas,
  Message.MeasuredCanvas({ height: 800, width: 1280 })
);

it("a playable take shows its replay, Play, readings and frame strip", () => {
  scene(
    { update, view },
    given(opened()),
    measured,
    expect(role("dialog", { name: "Strike variants" })).toExist(),
    expect(role("button", { name: "Play A" })).toExist(),
    expect(role("button", { name: "Play B" })).toExist(),
    expect(role("button", { name: "Pick B" })).toBeEnabled(),
    expect(role("table", { name: "A readings" })).toExist(),
    inside(
      role("table", { name: "A readings" }),
      expect(text("21")).toExist(),
      expect(text("parity")).toBeAbsent()
    ),
    inside(
      role("table", { name: "B readings" }),
      expect(text("parity")).toExist(),
      expect(text("15")).toExist()
    ),
    expect(role("region", { name: /Frame strips/u })).toExist(),
    expect(role("group", { name: "A frame strip" })).toExist(),
    expect(role("group", { name: "B frame strip" })).toExist(),
    expectAll(all.role("button", { name: "Record input on Jab" })).toHaveCount(
      2
    ),
    click(role("button", { name: "Play A" })),
    expect(role("button", { name: "Launching A…" })).toBeDisabled(),
    Command.resolve(
      LaunchTake,
      Message.Launched({
        asset: "jab",
        layer: "Strike",
        render: playableRender("Strike-A"),
        variant: "Strike-A",
      })
    ),
    expect(role("button", { name: "Play A" })).toBeEnabled(),
    Command.resolve(
      LoadFrames,
      Message.LoadedFrames({
        frames: frameLog(timings["Strike-A"]),
        key: takeKey("jab", "Strike", "Strike-A"),
      })
    )
  );
});

it("after 20 loops both strip cursors sit on their first hit when the movies do", () => {
  const start = opened();

  const plan = syncPlan(
    playClips(
      (["Strike-A", "Strike-B"] as const).map((take) => ({
        frames: Option.fromNullishOr(combatFrames[framesPath(take)]),
        id: take,
        render: playableRender(take),
      }))
    )
  );

  const target = 20 * plan.period + plan.lead;
  let current = start;

  while (current.clock < target) {
    current = update(
      current,
      Message.TickedClock({ elapsed: Math.min(50, target - current.clock) })
    ).model;
  }

  scene(
    { update, view },
    given(current),
    measured,
    inside(
      role("group", { name: "A frame strip" }),
      expect(selector("[data-tick]")).toHaveAttr(
        "data-tick",
        String(timings["Strike-A"].startup)
      )
    ),
    inside(
      role("group", { name: "B frame strip" }),
      expect(selector("[data-tick]")).toHaveAttr(
        "data-tick",
        String(timings["Strike-B"].startup)
      )
    ),
    expectAll(all.role("button", { name: /^Play /u })).toHaveCount(2)
  );
});
