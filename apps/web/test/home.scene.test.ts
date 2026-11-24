import { it } from "@effect/vitest";
import { expect, given, role, scene } from "foldkit/scene";

import { initialModel } from "../src/client/motion/model.js";
import { update } from "../src/client/motion/update.js";
import { view } from "../src/features/home/index.js";

it("the home page names the dev studio and keeps the motion demo", () => {
  scene(
    { update, view },
    given(initialModel),
    expect(role("heading", { name: "Dev studio" })).toExist(),
    expect(role("heading", { name: "Motion" })).toExist(),
    expect(role("button", { name: "Replay curves" })).toExist()
  );
});
