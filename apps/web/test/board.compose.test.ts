import { expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  composeKey,
  composeRequest,
  pickedTakes,
} from "../src/client/board/compose.js";
import { gridLevels } from "../src/client/board/grid.js";
import { MAX_ZOOM, MIN_ZOOM } from "../src/client/board/layout.js";
import { Message } from "../src/client/board/message.js";
import { initialModel } from "../src/client/board/model.js";
import { update } from "../src/client/board/update.js";
import { fireFlags } from "./fixtures/fire-kit.js";

const ComposedArgs = Schema.Struct({
  layer: Schema.String,
  mix: Schema.Record(Schema.String, Schema.String),
  variant: Schema.String,
});

const decodeComposed = Schema.decodeUnknownSync(ComposedArgs);

const Picks = Schema.Record(
  Schema.Literals(["Fireball", "FireLoop", "Smoke", "Sparks"]),
  Schema.Literals(["A", "B", "C"])
);

it.prop(
  "a composed render asks for exactly the chosen layers, and its key ignores their order",
  { picks: Arbitrary.schema(Picks) },
  ({ picks }) => {
    const request = composeRequest(picks);
    const reversed = Object.fromEntries(Object.entries(picks).toReversed());

    expect(composeKey("fire", reversed)).toBe(composeKey("fire", picks));

    if (request === undefined) {
      expect(Object.keys(picks)).toHaveLength(0);
    } else {
      expect({ ...request.mix, [request.layer]: request.variant }).toEqual(
        picks
      );
    }
  }
);

it("the compose view starts on every picked layer, and a toggle renders exactly the rest", () => {
  const start = initialModel(fireFlags);
  const [entry] = fireFlags.assets;

  const picks =
    entry === undefined ? {} : pickedTakes(entry.asset, entry.layers);

  const [first] = Object.keys(picks);

  const opened = update(start, Message.OpenedCompose({ asset: "fire" }));

  const toggled = update(
    opened.model,
    Message.ToggledComposeLayer({ layer: first ?? "" })
  );

  const [ask] = toggled.commands ?? [];

  expect(opened.commands?.[0]?.name).toBe("RenderComposed");
  expect(Option.getOrUndefined(toggled.model.compose)?.off).toEqual([first]);
  expect(ask?.name).toBe("RenderComposed");
  const asked = decodeComposed(ask?.args);

  expect({ ...asked.mix, [asked.layer]: asked.variant }).toEqual(
    Object.fromEntries(
      Object.entries(picks).filter(([layer]) => layer !== first)
    )
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
