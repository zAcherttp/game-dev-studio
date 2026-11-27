import type { GateResult, Render, Variant } from "@gds/model";
import { Option, Schema } from "effect";

import { gateValue } from "./compose.js";
import { clipTime } from "./sync.js";
import type { SyncClip, SyncPlan } from "./sync.js";

type VariantValue = typeof Variant.Type;

type RenderValue = typeof Render.Type;

const Tick = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const FrameTick = Schema.Struct({
  attacker: Schema.String,
  hits: Schema.Array(Schema.Json),
  hitstop: Schema.optionalKey(Schema.Finite),
  slices: Schema.optionalKey(Schema.Array(Schema.Json)),
  t: Tick,
  targets: Schema.optionalKey(Schema.Array(Schema.Json)),
});

export type FrameTickValue = typeof FrameTick.Type;

export const Strike = Schema.Struct({
  active: Schema.Int,
  advantageOnHit: Schema.Int,
  hitTick: Tick,
  hitstopTicks: Schema.Int,
  index: Schema.Int,
  recovery: Schema.Int,
  startup: Schema.Int,
});

export const FrameLog = Schema.Struct({
  hash: Schema.String,
  strikes: Schema.Array(Strike),
  tickRate: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  ticks: Schema.Array(FrameTick),
  version: Schema.Literal(1),
}).annotate({
  description:
    "The frame strip a replay writes beside its movie: one entry per tick and the strikes it measured.",
});

export type FrameLogValue = typeof FrameLog.Type;

export const DEFAULT_TICK_RATE = 60;

export const tickRateOf = (frames: FrameLogValue) =>
  frames.tickRate ?? DEFAULT_TICK_RATE;

export const hitTickOf = (frames: FrameLogValue): Option.Option<number> =>
  Option.orElse(Option.fromNullishOr(frames.strikes[0]?.hitTick), () =>
    Option.fromNullishOr(frames.ticks.find((tick) => tick.hits.length > 0)?.t)
  );

export const msOfTick = (tick: number, tickRate: number) =>
  (tick * 1000) / tickRate;

const EDGE = 1e-6;

export const tickAt = (ms: number, tickRate: number) =>
  Math.floor((ms * tickRate) / 1000 + EDGE);

export const isPlayable = (render: RenderValue | undefined) =>
  render !== undefined &&
  render.kind === "playable" &&
  render.pending === undefined;

export const movieOf = (render: RenderValue | undefined) =>
  isPlayable(render)
    ? Option.fromNullishOr(render?.views?.[0]?.path ?? render?.path)
    : Option.none<string>();

export interface PlayTake {
  readonly id: string;
  readonly render: RenderValue | undefined;
  readonly frames: Option.Option<FrameLogValue>;
}

export const playClip = (take: PlayTake): Option.Option<SyncClip> =>
  take.render === undefined || !isPlayable(take.render)
    ? Option.none()
    : Option.some({
        beatMs: Option.match(take.frames, {
          onNone: () => 0,
          onSome: (frames) =>
            Option.match(hitTickOf(frames), {
              onNone: () => 0,
              onSome: (hit) => msOfTick(hit, tickRateOf(frames)),
            }),
        }),
        id: take.id,
        ms: take.render.ms,
      });

export const playClips = (takes: readonly PlayTake[]): readonly SyncClip[] =>
  takes.flatMap((take) => Option.toArray(playClip(take)));

export const cursorTick = (
  plan: SyncPlan,
  clip: SyncClip,
  clock: number,
  tickRate: number
) => tickAt(clipTime(plan, clip, clock), tickRate);

export interface Segment {
  readonly from: number;
  readonly to: number;
  readonly state: string;
}

export interface Strip {
  readonly id: string;
  readonly hitTick: number;
  readonly length: number;
  readonly segments: readonly Segment[];
  readonly hits: readonly number[];
  readonly tickRate: number;
}

export const stripOf = (id: string, frames: FrameLogValue): Strip => {
  const ticks = frames.ticks.toSorted((left, right) => left.t - right.t);
  const length = (ticks.at(-1)?.t ?? -1) + 1;

  const segments: Segment[] = [];

  for (const [index, tick] of ticks.entries()) {
    const to = ticks[index + 1]?.t ?? length;
    const last = segments.at(-1);

    if (last !== undefined && last.state === tick.attacker) {
      segments[segments.length - 1] = { ...last, to };
    } else {
      segments.push({ from: tick.t, state: tick.attacker, to });
    }
  }

  return {
    hitTick: Option.getOrElse(hitTickOf(frames), () => 0),
    hits: ticks.filter((tick) => tick.hits.length > 0).map((tick) => tick.t),
    id,
    length,
    segments,
    tickRate: tickRateOf(frames),
  };
};

export interface Axis {
  readonly from: number;
  readonly to: number;
}

export const stripAxis = (strips: readonly Strip[]): Axis => ({
  from: Math.min(0, ...strips.map((strip) => -strip.hitTick)),
  to: Math.max(1, ...strips.map((strip) => strip.length - strip.hitTick)),
});

export const axisShare = (axis: Axis, aligned: number) =>
  (aligned - axis.from) / Math.max(1, axis.to - axis.from);

export const READINGS = [
  { id: "startup", strike: "startup" },
  { id: "active", strike: "active" },
  { id: "recovery", strike: "recovery" },
  { id: "advantage", strike: "advantageOnHit" },
] as const;

export const PARITY = "parity";

export interface Reading {
  readonly id: string;
  readonly value: Option.Option<string>;
}

const gateOf = (variant: VariantValue, id: string) =>
  Option.fromNullishOr(variant.gates?.find((gate) => gate.id === id));

export const readingsOf = (
  variant: VariantValue,
  frames: Option.Option<FrameLogValue>
): readonly Reading[] =>
  READINGS.map(({ id, strike }) => ({
    id,
    value: gateOf(variant, id).pipe(
      Option.map((gate) => gateValue(gate.value)),
      Option.orElse(() =>
        frames.pipe(
          Option.flatMap((log) => Option.fromNullishOr(log.strikes[0])),
          Option.map((first) => String(first[strike]))
        )
      )
    ),
  }));

export const parityOf = (
  variant: VariantValue
): Option.Option<typeof GateResult.Type> => gateOf(variant, PARITY);

const shownElsewhere = new Set<string>([
  ...READINGS.map(({ id }) => id),
  PARITY,
]);

export const otherGates = (variant: VariantValue) =>
  (variant.gates ?? []).filter((gate) => !shownElsewhere.has(gate.id));
