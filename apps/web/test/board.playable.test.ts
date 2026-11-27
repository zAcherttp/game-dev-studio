import { expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  cursorTick,
  playClips,
  stripAxis,
  stripOf,
  tickAt,
} from "../src/client/board/playable.js";
import {
  clipTime,
  cycleOf,
  hasStarted,
  syncPlan,
} from "../src/client/board/sync.js";
import { frameLog, lengthMs, timings } from "./fixtures/combat.js";
import type { StrikeTiming } from "./fixtures/combat.js";

const Timing = Schema.Struct({
  active: Schema.Int.check(Schema.isBetween({ maximum: 12, minimum: 1 })),
  recovery: Schema.Int.check(Schema.isBetween({ maximum: 40, minimum: 1 })),
  startup: Schema.Int.check(Schema.isBetween({ maximum: 45, minimum: 1 })),
  tail: Schema.Int.check(Schema.isBetween({ maximum: 30, minimum: 0 })),
});

const timingSets = Arbitrary.schema(
  Schema.Array(Timing).check(Schema.isMinLength(1), Schema.isMaxLength(5))
);

const cycles = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ maximum: 60, minimum: 0 }))
);

const phases = Arbitrary.schema(
  Schema.Finite.check(Schema.isBetween({ maximum: 1, minimum: 0 }))
);

const takesOf = (list: readonly StrikeTiming[]) =>
  list.map((timing, index) => {
    const frames = frameLog(timing);

    return {
      frames,
      id: `take-${index}`,
      render: {
        kind: "playable" as const,
        launch: { args: [], command: "stage" },
        ms: lengthMs(timing),
        path: `take-${index}.webm`,
      },
      timing,
    };
  });

const planOf = (takes: ReturnType<typeof takesOf>) => {
  const clips = playClips(
    takes.map((take) => ({ ...take, frames: Option.some(take.frames) }))
  );

  return { clips, plan: syncPlan(clips) };
};

it.prop(
  "every take's movie and strip cursor reach its first hit at the same instant, in every loop",
  { cycle: cycles, list: timingSets },
  ({ cycle, list }) => {
    const takes = takesOf(list);
    const { clips, plan } = planOf(takes);
    const hitInstant = cycle * plan.period + plan.lead;

    for (const [index, clip] of clips.entries()) {
      const hitTick = takes[index]?.timing.startup ?? -1;

      expect(hasStarted(plan, clip, hitInstant)).toBe(true);
      expect(cursorTick(plan, clip, hitInstant, 60)).toBe(hitTick);
    }
  }
);

it.prop(
  "the strip cursor is the tick the movie shows, whatever the clock",
  { cycle: cycles, list: timingSets, phase: phases },
  ({ cycle, list, phase }) => {
    const takes = takesOf(list);
    const { clips, plan } = planOf(takes);
    const now = (cycle + phase) * plan.period;

    for (const [index, clip] of clips.entries()) {
      const tick = cursorTick(plan, clip, now, 60);
      const length = takes[index]?.frames.ticks.length ?? 0;

      expect(tick).toBe(tickAt(clipTime(plan, clip, now), 60));
      expect(tick).toBeGreaterThanOrEqual(0);
      expect(tick).toBeLessThanOrEqual(length);
    }
  }
);

it.prop(
  "one tick axis holds every strip with its first hit on the same column",
  { list: timingSets },
  ({ list }) => {
    const strips = takesOf(list).map((take) => stripOf(take.id, take.frames));
    const axis = stripAxis(strips);

    for (const strip of strips) {
      expect(axis.from).toBeLessThanOrEqual(-strip.hitTick);
      expect(axis.to).toBeGreaterThanOrEqual(strip.length - strip.hitTick);
      expect(strip.segments[0]?.from).toBe(0);
      expect(strip.segments.at(-1)?.to).toBe(strip.length);
      expect(strip.hits).toContain(strip.hitTick);
    }
  }
);

it("two fixture takes stay aligned on the first hit through 20 loops of 16 ms frames", () => {
  const takes = takesOf([timings["Strike-A"], timings["Strike-B"]]);
  const { clips, plan } = planOf(takes);
  const [first, second] = clips;

  if (first === undefined || second === undefined) {
    throw new Error("Two fixture clips expected.");
  }

  const hits = [timings["Strike-A"].startup, timings["Strike-B"].startup];
  let both = 0;

  for (let now = 0; cycleOf(plan, now) <= 20; now += 1000 / 60) {
    const ticks = [first, second].map((clip) =>
      cursorTick(plan, clip, now, 60)
    );

    const running = [first, second].every(
      (clip, index) =>
        hasStarted(plan, clip, now) &&
        (ticks[index] ?? 0) < (takes[index]?.frames.ticks.length ?? 0)
    );

    if (running) {
      both += 1;

      expect(
        Math.abs(
          (ticks[0] ?? 0) - (hits[0] ?? 0) - ((ticks[1] ?? 0) - (hits[1] ?? 0))
        )
      ).toBeLessThanOrEqual(1);
    }
  }

  const loop20 = 20 * plan.period + plan.lead;

  expect(both).toBeGreaterThan(20 * 40);
  expect(cursorTick(plan, first, loop20, 60)).toBe(hits[0]);
  expect(cursorTick(plan, second, loop20, 60)).toBe(hits[1]);
});
