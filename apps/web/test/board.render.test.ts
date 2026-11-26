import { expect, it } from "@effect/vitest";

import { Message } from "../src/client/board/message.js";
import { initialModel, takeKey } from "../src/client/board/model.js";
import { update } from "../src/client/board/update.js";
import { fireFlags } from "./fixtures/fire-kit.js";

const start = initialModel(fireFlags);

const takesOf = (layer: string) =>
  fireFlags.assets[0]?.asset.layers[layer]?.variants ?? [];

const render = {
  kind: "gif" as const,
  ms: 900,
  path: "E:/game/.cache/devstudio/vfx/fire/Fireball-J-key.gif",
  still: "E:/game/.cache/devstudio/vfx/fire/Fireball-J-key.still.png",
};

it("opening a layer renders each take it shows, and a finished render replaces that take's render only", () => {
  const opened = update(
    start,
    Message.OpenedLayer({ asset: "fire", layer: "Fireball" })
  );

  const commands = opened.commands ?? [];
  const takes = takesOf("Fireball");
  const [first, other] = takes;
  const target = first?.id ?? "";

  expect(commands.length).toBeGreaterThan(0);
  expect(commands.every((command) => command.name === "RenderTake")).toBe(true);
  expect(opened.model.rendering).toContain(takeKey("fire", "Fireball", target));

  const rendered = update(
    opened.model,
    Message.RenderedTake({
      asset: "fire",
      layer: "Fireball",
      render,
      variant: target,
    })
  ).model;

  const variants = rendered.assets[0]?.asset.layers.Fireball?.variants ?? [];

  expect(variants.find(({ id }) => id === target)?.render).toEqual(render);
  expect(variants.find(({ id }) => id === other?.id)?.render).toEqual(
    other?.render
  );
  expect(rendered.rendering).not.toContain(takeKey("fire", "Fireball", target));
  expect(rendered.assets[0]?.asset.layers.FireLoop).toEqual(
    start.assets[0]?.asset.layers.FireLoop
  );
});

it("a failed render names the take and stops waiting for it", () => {
  const opened = update(
    start,
    Message.OpenedLayer({ asset: "fire", layer: "Fireball" })
  ).model;

  const target = takesOf("Fireball")[0]?.id ?? "";

  const failed = update(
    opened,
    Message.FailedRender({
      asset: "fire",
      layer: "Fireball",
      message: "No Renderer adapter is connected yet.",
      variant: target,
    })
  ).model;

  expect(failed.rendering).not.toContain(takeKey("fire", "Fireball", target));
  expect(failed.status.state).toBe("failed");
  expect(failed.status.message).toContain(target);
});
