import { it } from "@effect/vitest";
import {
  all,
  click,
  expect,
  expectAll,
  given,
  Mount,
  role,
  scene,
  text,
  type,
} from "foldkit/scene";

import { WatchCanvas } from "../src/client/board/command.js";
import { Message } from "../src/client/board/message.js";
import { initialModel } from "../src/client/board/model.js";
import { update } from "../src/client/board/update.js";
import { view } from "../src/features/board/index.js";
import { fireFlags } from "./fixtures/fire-kit.js";

const start = initialModel(fireFlags);

it("the board shows the fire kit's layers with their picks and the mix", () => {
  scene(
    { update, view },
    given(start),
    Mount.resolve(
      WatchCanvas,
      Message.MeasuredCanvas({ height: 800, width: 1280 })
    ),
    expect(role("button", { name: "Open Fire loop, picked L" })).toExist(),
    expect(role("button", { name: "Open Fireball, picked J" })).toExist(),
    expect(role("button", { name: "Fire loop variant L, picked" })).toExist(),
    expect(role("button", { name: "Fire loop variant H" })).toExist(),
    expect(role("list", { name: "Fire kit mix" })).toExist(),
    expectAll(all.role("button", { name: /^Open /u })).toHaveCount(
      fireFlags.assets[0]?.layers.length ?? -1
    )
  );
});

it("opening a layer shows the reference first and one pick button per variant", () => {
  scene(
    { update, view },
    given(start),
    Mount.resolve(
      WatchCanvas,
      Message.MeasuredCanvas({ height: 800, width: 1280 })
    ),
    click(role("button", { name: "Open Ember burst, picked G" })),
    expect(role("dialog", { name: "Ember burst variants" })).toExist(),
    expect(role("figure", { name: "Variant G, current pick" })).toExist(),
    expect(role("button", { name: "Pick A" })).toExist(),
    expect(role("button", { name: "Pick D" })).toExist(),
    expect(role("table", { name: "D gates" })).toExist(),
    expect(text("Reference")).toExist(),
    type(role("textbox", { name: "Pick note" }), "fewer embers"),
    expect(role("textbox", { name: "Pick note" })).toHaveValue("fewer embers"),
    click(role("button", { name: "Close" })),
    expect(role("dialog", { name: "Ember burst variants" })).toBeAbsent()
  );
});
