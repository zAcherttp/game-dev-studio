import { expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import * as Scene from "foldkit/scene";

import { withPick } from "../src/client/board/api.js";
import { RenderComposed, WatchCanvas } from "../src/client/board/command.js";
import {
  composeKey,
  pickedTakes,
  rowDiff,
} from "../src/client/board/compose.js";
import { gridLevels } from "../src/client/board/grid.js";
import { MAX_ZOOM, MIN_ZOOM } from "../src/client/board/layout.js";
import { Message } from "../src/client/board/message.js";
import { initialModel } from "../src/client/board/model.js";
import type { BoardModel } from "../src/client/board/model.js";
import { update } from "../src/client/board/update.js";
import { view } from "../src/features/board/index.js";
import {
  mixRender,
  slotWait,
  worldAsset,
  worldFlags,
} from "./fixtures/world.js";

const Picks = Schema.Record(
  Schema.Literals(["Fireball", "FireLoop", "Smoke", "Sparks"]),
  Schema.Literals(["A", "B", "C"])
);

it.prop(
  "a mix key ignores the order of its layers",
  { picks: Arbitrary.schema(Picks) },
  ({ picks }) => {
    const reversed = Object.fromEntries(Object.entries(picks).toReversed());

    expect(composeKey("fire", reversed)).toBe(composeKey("fire", picks));
  }
);

const start = initialModel(worldFlags);

const measured = Scene.Mount.resolve(
  WatchCanvas,
  Message.MeasuredCanvas({ height: 800, width: 1280 })
);

const firstKey = composeKey(
  "village",
  pickedTakes(worldAsset, worldFlags.assets[0]?.layers ?? [])
);

const opened = (): BoardModel => {
  const open = update(start, Message.OpenedCompose({ asset: "village" }));

  return update(
    open.model,
    Message.RenderedComposed({ key: firstKey, render: mixRender(worldAsset) })
  ).model;
};

const Swap = Schema.Struct({
  layer: Schema.Literals([
    "massing",
    "surface",
    "pieces",
    "look",
    "dressing",
    "mood",
  ]),
  variant: Schema.Literals(["B", "C"]),
});

it.prop(
  "swapping a pick in compose changes that layer of the mix and nothing else, and re-renders only the mix",
  { swap: Arbitrary.schema(Swap) },
  ({ swap }) => {
    if (swap.layer === "surface" && swap.variant === "C") {
      return;
    }

    const before = opened();
    const variant = `${swap.layer}-${swap.variant}`;

    const chose = update(
      before,
      Message.ChoseComposeVariant({ layer: swap.layer, variant })
    );

    expect(chose.commands?.map((command) => command.name)).toEqual([
      "PickVariant",
    ]);

    const asset = withPick(
      worldAsset,
      {
        asset: "village",
        by: "Phát",
        layer: swap.layer,
        note: "",
        studio: "world",
        variant,
      },
      "2026-11-26T00:00:00.000Z"
    );

    const stored = {
      ...asset,
      layers: Object.fromEntries(
        Object.entries(asset.layers).map(([id, layer]) => [
          id,
          {
            ...layer,
            variants: layer.variants.map(({ render: _drawn, ...bare }) => bare),
          },
        ])
      ),
    };

    const done = update(chose.model, Message.SucceededPick({ asset: stored }));
    const after = done.model.assets[0]?.asset;

    const nextKey = composeKey(
      "village",
      pickedTakes(asset, worldFlags.assets[0]?.layers ?? [])
    );

    expect(done.commands?.map(({ args, name }) => ({ args, name }))).toEqual([
      {
        args: { asset: "village", key: nextKey, studio: "world" },
        name: RenderComposed.name,
      },
    ]);
    expect(after?.mix).toEqual({ ...worldAsset.mix, [swap.layer]: variant });
    expect({ ...after?.layers, [swap.layer]: undefined }).toEqual({
      ...worldAsset.layers,
      [swap.layer]: undefined,
    });
    expect(done.model.solo).toEqual(before.solo);
    expect(done.model.composed).toEqual(before.composed);
    expect(done.model.compose).toEqual(before.compose);
    expect(done.model.rendering).toEqual(before.rendering);

    const drawn = update(
      done.model,
      Message.RenderedComposed({ key: nextKey, render: mixRender(asset) })
    ).model;

    expect(drawn.composed[nextKey]?.path).not.toBe(
      drawn.composed[firstKey]?.path
    );
  }
);

it("a variant failing a gate is shown with its gate and value, and cannot be picked", () => {
  const refused = update(
    opened(),
    Message.ChoseComposeVariant({ layer: "surface", variant: "surface-C" })
  );

  expect(refused.commands ?? []).toEqual([]);
  expect(refused.model.status.state).toBe("failed");
  expect(refused.model.status.message).toContain("parts (16200)");

  Scene.scene(
    { update, view },
    Scene.given(opened()),
    measured,
    Scene.expect(
      Scene.role("figure", { name: "Surface C, fails parts (16200)" })
    ).toExist(),
    Scene.expect(
      Scene.role("button", { name: "Pick Surface C, fails parts (16200)" })
    ).toBeDisabled(),
    Scene.expect(Scene.role("button", { name: "Pick Surface B" })).toBeEnabled()
  );
});

it("a render waiting for a slot shows as waiting, not failed, and is asked for again", () => {
  const open = update(start, Message.OpenedCompose({ asset: "village" }));

  const waiting = update(
    open.model,
    Message.RenderedComposed({
      key: firstKey,
      render: { kind: "image", ms: 0, path: "", pending: slotWait },
    })
  ).model;

  expect(waiting.status.state).not.toBe("failed");

  Scene.scene(
    { update, view },
    Scene.given(waiting),
    measured,
    Scene.expect(
      Scene.within(
        Scene.role("group", { name: "Village mix" }),
        Scene.text(`Waiting: ${slotWait}`)
      )
    ).toExist(),
    Scene.expect(
      Scene.within(
        Scene.role("figure", { name: "Mood C" }),
        Scene.text(`Waiting: ${slotWait}`)
      )
    ).toExist()
  );

  const reopened = update(
    update(waiting, Message.ClosedCompose()).model,
    Message.OpenedCompose({ asset: "village" })
  );

  expect(
    reopened.commands?.some((command) => command.name === "RenderComposed")
  ).toBe(true);
});

it("one camera opens large across every variant of its layer, side by side", () => {
  Scene.scene(
    { update, view },
    Scene.given(opened()),
    measured,
    Scene.click(
      Scene.within(
        Scene.role("figure", { name: "Massing B" }),
        Scene.role("button", { name: "Open camera high" })
      )
    ),
    Scene.expect(Scene.role("dialog", { name: "Massing: high" })).toExist(),
    Scene.expectAll(
      Scene.all.role("img", { name: /^Massing [ABC], high$/u })
    ).toHaveCount(3),
    Scene.click(
      Scene.within(
        Scene.role("dialog", { name: "Massing: high" }),
        Scene.role("button", { name: "Close" })
      )
    ),
    Scene.expect(Scene.role("dialog", { name: "Massing: high" })).toBeAbsent()
  );
});

it("a row variant shows only its rows that differ from the current pick", () => {
  const look = worldAsset.layers.look?.variants ?? [];
  const [current, , changed] = look;

  expect(current === undefined ? [] : rowDiff(current, current)).toEqual([]);

  const diff = changed === undefined ? [] : rowDiff(current, changed);

  expect(diff.map(({ path }) => path)).toEqual([
    "Walls.Material",
    "Roof.Pitch",
  ]);
  expect(diff.map(({ from }) => Option.getOrUndefined(from))).toEqual([
    "PlasterA",
    35,
  ]);

  Scene.scene(
    { update, view },
    Scene.given(opened()),
    measured,
    Scene.expect(
      Scene.role("list", { name: "C rows against the current pick" })
    ).toExist(),
    Scene.expect(
      Scene.role("list", { name: "A rows against the current pick" })
    ).toBeAbsent()
  );
});

const Zoom = Schema.Finite.check(
  Schema.isBetween({ maximum: MAX_ZOOM, minimum: MIN_ZOOM })
);

it.prop(
  "the dot grid keeps visible dots at least 8 px apart, always shows a level, and fades instead of popping",
  { zoom: Arbitrary.schema(Zoom) },
  ({ zoom }) => {
    const camera = { x: 13, y: -7, zoom };
    const levels = gridLevels(camera);
    const nudged = gridLevels({ ...camera, zoom: zoom * 1.01 });

    expect(levels.length).toBeGreaterThan(0);
    expect(levels.every(({ spacing }) => spacing >= 8)).toBe(true);
    expect(levels.length).toBeLessThanOrEqual(3);

    for (const level of levels) {
      const near = nudged.find(
        (other) => Math.abs(other.spacing / 1.01 - level.spacing) < 1e-6
      );

      expect(Math.abs((near?.alpha ?? 0) - level.alpha)).toBeLessThan(0.05);
    }
  }
);
