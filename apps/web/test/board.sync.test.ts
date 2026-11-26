import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  clipTime,
  cycleOf,
  hasStarted,
  syncPlan,
} from "../src/client/board/sync.js";

const Clip = Schema.Struct({
  beatFraction: Schema.Finite.check(
    Schema.isBetween({ maximum: 1, minimum: 0 })
  ),
  ms: Schema.Int.check(Schema.isBetween({ maximum: 4000, minimum: 50 })),
});

const clipSets = Arbitrary.schema(
  Schema.Array(Clip).check(Schema.isMinLength(1), Schema.isMaxLength(6))
);

const cycles = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 50, minimum: 0 }))
);

const toClips = (clips: readonly (typeof Clip.Type)[]) =>
  clips.map((clip, index) => ({
    beatMs: Math.round(clip.ms * Math.abs(clip.beatFraction)),
    id: `clip-${index}`,
    ms: clip.ms,
  }));

it.prop(
  "every clip shows its beat frame at the same instant, in every cycle",
  { cycle: cycles, raw: clipSets },
  ({ cycle, raw }) => {
    const clips = toClips(raw);
    const plan = syncPlan(clips);
    const beatInstant = cycle * plan.period + plan.lead;

    for (const clip of clips) {
      expect(clipTime(plan, clip, beatInstant)).toBe(clip.beatMs);
      expect(hasStarted(plan, clip, beatInstant)).toBe(true);
    }
  }
);

it.prop(
  "each clip starts inside the cycle and finishes before the cycle restarts",
  { raw: clipSets },
  ({ raw }) => {
    const clips = toClips(raw);
    const plan = syncPlan(clips);

    for (const clip of clips) {
      const start = plan.starts.get(clip.id) ?? -1;

      expect(start).toBeGreaterThanOrEqual(0);
      expect(start + clip.ms).toBeLessThanOrEqual(plan.period);
    }

    expect(cycleOf(plan, plan.period - 1)).toBe(0);
    expect(cycleOf(plan, plan.period)).toBe(1);
  }
);

it("four GIFs of different lengths restart together and meet at the contact beat", () => {
  const clips = [
    { beatMs: 400, id: "A", ms: 800 },
    { beatMs: 300, id: "B", ms: 1300 },
    { beatMs: 650, id: "C", ms: 1000 },
    { beatMs: 100, id: "D", ms: 1750 },
  ];

  const plan = syncPlan(clips);

  expect(plan.lead).toBe(650);
  expect(plan.period).toBe(2300);
  expect(syncPlan([{ beatMs: 500, id: "end", ms: 500 }]).period).toBe(501);
  expect(clips.map((clip) => plan.starts.get(clip.id))).toEqual([
    250, 350, 0, 550,
  ]);

  for (const now of [650, 2300 + 650, 4600 + 650]) {
    expect(clips.map((clip) => clipTime(plan, clip, now))).toEqual([
      400, 300, 650, 100,
    ]);
  }

  expect(clips.map((clip) => hasStarted(plan, clip, 2300 + 100))).toEqual([
    false,
    false,
    true,
    false,
  ]);
});
