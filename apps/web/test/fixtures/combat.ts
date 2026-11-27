import type { Asset, LayerDef, Render, StudioDef, Variant } from "@gds/model";

import type { FlagsValue } from "../../src/client/board/model.js";
import type { FrameLogValue } from "../../src/client/board/playable.js";

type VariantValue = typeof Variant.Type;

type RenderValue = typeof Render.Type;

export interface StrikeTiming {
  readonly startup: number;
  readonly active: number;
  readonly recovery: number;
  readonly tail: number;
}

const stateAt = (timing: StrikeTiming, tick: number) => {
  if (tick < timing.startup) {
    return "startup";
  }

  if (tick < timing.startup + timing.active) {
    return "active";
  }

  return tick < timing.startup + timing.active + timing.recovery
    ? "recovery"
    : "idle";
};

export const frameLog = (timing: StrikeTiming): FrameLogValue => {
  const length = timing.startup + timing.active + timing.recovery + timing.tail;
  const hitTick = timing.startup;

  return {
    hash: `hash-${timing.startup}-${timing.active}-${timing.recovery}`,
    strikes: [
      {
        active: timing.active,
        advantageOnHit: timing.active - timing.recovery + 12,
        hitTick,
        hitstopTicks: 5,
        index: 1,
        recovery: timing.recovery,
        startup: timing.startup,
      },
    ],
    ticks: Array.from({ length }, (_unused, t) => ({
      attacker: stateAt(timing, t),
      hits: t === hitTick ? [1] : [],
      t,
    })),
    version: 1,
  };
};

export const lengthMs = (timing: StrikeTiming, tickRate = 60) =>
  ((timing.startup + timing.active + timing.recovery + timing.tail) * 1000) /
  tickRate;

export const timings = {
  "Strike-A": { active: 4, recovery: 18, startup: 21, tail: 17 },
  "Strike-B": { active: 3, recovery: 22, startup: 15, tail: 14 },
} as const satisfies Record<string, StrikeTiming>;

const cache = "E:/game/.cache/devstudio/combat/jab";

export const framesPath = (take: string) => `${cache}/${take}.frames.json`;

export const playableRender = (take: keyof typeof timings): RenderValue => ({
  kind: "playable",
  launch: {
    args: ["--path", "stage", "--", "--replay", `${take}.rec.json`],
    command: "stage",
  },
  ms: lengthMs(timings[take]),
  numbers: framesPath(take),
  path: `${cache}/${take}.webm`,
  views: [{ camera: "replay", path: `${cache}/${take}.webm` }],
});

export const combatFrames = {
  [framesPath("Strike-A")]: frameLog(timings["Strike-A"]),
  [framesPath("Strike-B")]: frameLog(timings["Strike-B"]),
} satisfies Record<string, FrameLogValue>;

const take = (
  id: keyof typeof timings,
  label: string,
  extra: Partial<VariantValue> = {}
): VariantValue => ({
  generator: "stage",
  id,
  label,
  layer: "Strike",
  params: {
    rows: [
      {
        file: "src/features/Attack/Shared/Modes.luau",
        path: "Flow.Strike",
        value: id === "Strike-A" ? 150 : 130,
      },
    ],
  },
  render: playableRender(id),
  ...extra,
});

export const combatLayers: readonly (typeof LayerDef.Type)[] = [
  { id: "Strike", order: 1, renderKind: "playable", title: "Strike" },
];

export const combatAsset: typeof Asset.Type = {
  id: "jab",
  layers: {
    Strike: {
      picks: [],
      variants: [
        take("Strike-A", "A", {
          gates: [
            {
              id: "startup",
              note: "Startup: 21",
              ok: true,
              reading: true,
              value: 21,
            },
          ],
        }),
        take("Strike-B", "B", {
          gates: [
            {
              id: "active",
              note: "Active: not read yet",
              ok: false,
              reading: true,
              value: null,
            },
            {
              id: "parity",
              note: "hitTick within 1 tick of Roblox",
              ok: true,
              value: true,
            },
          ],
        }),
      ],
    },
  },
  mix: {},
  records: [],
  studio: "combat",
  title: "Jab",
};

export const combatStudio: typeof StudioDef.Type = {
  gates: [],
  id: "combat",
  layers: combatLayers,
  pack: { files: [] },
  renderKinds: ["playable"],
  renderer: "stage",
  title: "Combat",
};

export const combatFlags: FlagsValue = {
  assets: [{ asset: combatAsset, layers: combatLayers }],
  by: "Phát",
  catalog: [{ id: "jab", picks: 0, title: "Jab" }],
  studio: combatStudio,
};
