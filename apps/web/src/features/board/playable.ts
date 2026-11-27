import type { Variant } from "@gds/model";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { isPickable } from "../../client/board/compose.js";
import { Message } from "../../client/board/message.js";
import type { BoardMessage } from "../../client/board/message.js";
import { takeKey } from "../../client/board/model.js";
import type { BoardModel } from "../../client/board/model.js";
import { mediaSrc } from "../../client/board/picker.js";
import {
  axisShare,
  cursorTick,
  movieOf,
  otherGates,
  parityOf,
  playClip,
  playClips,
  readingsOf,
  stripAxis,
  stripOf,
} from "../../client/board/playable.js";
import type {
  Axis,
  FrameLogValue,
  Strip,
} from "../../client/board/playable.js";
import { cycleOf, hasStarted, syncPlan } from "../../client/board/sync.js";
import type { SyncPlan } from "../../client/board/sync.js";
import { pickerCopy, playableCopy } from "./copy.js";
import { pickerStyles } from "./picker.stylex.js";
import { playableStyles } from "./playable.stylex.js";

type VariantValue = typeof Variant.Type;

const cls = (...styles: (stylex.StyleXStyles | false)[]) =>
  stylex.props(...styles).className ?? "";

const percent = (share: number) => `${(share * 100).toFixed(3)}%`;

interface Take {
  readonly variant: VariantValue;
  readonly frames: Option.Option<FrameLogValue>;
}

export interface PlayableBoard {
  readonly plan: SyncPlan;
  readonly columns: readonly Html[];
  readonly strips: Html;
}

const takesOf = (
  model: BoardModel,
  asset: string,
  layer: string,
  variants: readonly VariantValue[]
): readonly Take[] =>
  variants.map((variant) => ({
    frames: Option.fromNullishOr(
      model.frames[takeKey(asset, layer, variant.id)]
    ),
    variant,
  }));

const playTake = (take: Take) => ({
  frames: take.frames,
  id: take.variant.id,
  render: take.variant.render,
});

const movie = (
  h: HtmlBuilder<BoardMessage>,
  take: Take,
  plan: SyncPlan,
  clock: number
): Html => {
  const { variant } = take;

  return Option.match(movieOf(variant.render), {
    onNone: () =>
      h.div(
        [h.Key(`${variant.id}:none`), h.Class(cls(pickerStyles.stage))],
        [playableCopy.noMovie(variant.label)]
      ),
    onSome: (path) => {
      const cycle = cycleOf(plan, clock);

      if (!hasStarted(plan, { id: variant.id }, clock)) {
        const still = variant.render?.still;

        return still === undefined
          ? h.div([
              h.Key(`${variant.id}:wait`),
              h.Class(cls(pickerStyles.stage)),
              h.DataAttribute("cycle", "waiting"),
            ])
          : h.img([
              h.Key(`${variant.id}:wait`),
              h.Src(mediaSrc(still)),
              h.Alt(playableCopy.movie(variant.label)),
              h.Class(cls(pickerStyles.stage, pickerStyles.waiting)),
              h.DataAttribute("cycle", "waiting"),
            ]);
      }

      return h.video([
        h.Key(`${variant.id}:${cycle}`),
        h.Src(mediaSrc(path)),
        h.Autoplay(true),
        h.Muted(true),
        h.Attribute("playsinline", ""),
        h.AriaLabel(playableCopy.movie(variant.label)),
        h.Class(cls(pickerStyles.stage)),
        h.DataAttribute("cycle", String(cycle)),
      ]);
    },
  });
};

const gateCell = (
  h: HtmlBuilder<BoardMessage>,
  text: string,
  tone: stylex.StyleXStyles | false = false
): Html => h.td([h.Class(cls(pickerStyles.gateCell, tone))], [text]);

const rowHead = (h: HtmlBuilder<BoardMessage>, id: string): Html =>
  h.th(
    [h.Class(cls(pickerStyles.gateCell)), h.Attribute("scope", "row")],
    [id]
  );

export const gateVerdict = (gate: {
  readonly ok: boolean;
  readonly reading?: true;
}) => {
  if (gate.reading === true) {
    return playableCopy.reading;
  }

  return gate.ok ? "pass" : "fail";
};

const verdictTone = (gate: {
  readonly ok: boolean;
  readonly reading?: true;
}) => {
  if (gate.reading === true) {
    return false;
  }

  return gate.ok ? pickerStyles.pass : pickerStyles.fail;
};

const readingTable = (h: HtmlBuilder<BoardMessage>, take: Take): Html => {
  const { variant } = take;
  const parity = parityOf(variant);

  return h.table(
    [
      h.Class(cls(pickerStyles.gates)),
      h.AriaLabel(playableCopy.readings(variant.label)),
    ],
    [
      h.tbody(
        [],
        [
          ...readingsOf(variant, take.frames).map((reading) =>
            h.tr(
              [h.Key(reading.id)],
              [
                rowHead(h, reading.id),
                gateCell(
                  h,
                  Option.getOrElse(reading.value, () => playableCopy.noReading)
                ),
                gateCell(h, playableCopy.reading),
              ]
            )
          ),
          ...Option.match(parity, {
            onNone: () => [],
            onSome: (gate) => [
              h.tr(
                [h.Key(gate.id)],
                [
                  rowHead(h, playableCopy.parity),
                  gateCell(
                    h,
                    gate.ok ? "pass" : "fail",
                    gate.ok ? pickerStyles.pass : pickerStyles.fail
                  ),
                  gateCell(h, gate.note),
                ]
              ),
            ],
          }),
          ...otherGates(variant).map((gate) =>
            h.tr(
              [h.Key(gate.id)],
              [
                rowHead(h, gate.id),
                gateCell(h, gateVerdict(gate), verdictTone(gate)),
                gateCell(h, gate.note),
              ]
            )
          ),
        ]
      ),
    ]
  );
};

const column =
  (
    h: HtmlBuilder<BoardMessage>,
    model: BoardModel,
    where: { readonly asset: string; readonly layer: string },
    plan: SyncPlan,
    picked: string | undefined
  ) =>
  (take: Take, index: number): Html => {
    const { variant } = take;
    const isPicked = variant.id === picked;

    const isLaunching = model.launching.includes(
      takeKey(where.asset, where.layer, variant.id)
    );

    const launch = variant.render?.launch;

    return h.figure(
      [
        h.Key(variant.id),
        h.Class(cls(pickerStyles.column, isPicked && pickerStyles.picked)),
        h.AriaLabel(
          `Variant ${variant.label}${isPicked ? ", current pick" : ""}`
        ),
        h.DataAttribute("launching", String(isLaunching)),
      ],
      [
        h.div(
          [h.Class(cls(pickerStyles.columnHead))],
          [
            h.span([h.Class(cls(pickerStyles.label))], [variant.label]),
            h.kbd([h.Class(cls(pickerStyles.key))], [String(index + 1)]),
          ]
        ),
        movie(h, take, plan, model.clock),
        launch === undefined
          ? h.empty
          : h.p(
              [h.Class(cls(playableStyles.launch))],
              [playableCopy.ran([launch.command, ...launch.args].join(" "))]
            ),
        readingTable(h, take),
        variant.note === undefined
          ? h.empty
          : h.p([h.Class(cls(pickerStyles.note))], [variant.note]),
        h.div(
          [h.Class(cls(playableStyles.actions))],
          [
            h.button(
              [
                h.Type("button"),
                h.Class(cls(pickerStyles.ghost)),
                h.Disabled(isLaunching),
                h.OnClick(Message.ClickedPlay({ variant: variant.id })),
              ],
              [
                isLaunching
                  ? playableCopy.launching(variant.label)
                  : playableCopy.play(variant.label),
              ]
            ),
            h.button(
              [
                h.Type("button"),
                h.Class(cls(pickerStyles.button)),
                h.Disabled(
                  model.status.state === "saving" || !isPickable(variant)
                ),
                h.OnClick(Message.ChoseVariant({ variant: variant.id })),
              ],
              [pickerCopy.pick(variant.label)]
            ),
          ]
        ),
      ]
    );
  };

const stateStyle = (state: string) => {
  switch (state) {
    case "startup": {
      return playableStyles.startup;
    }

    case "active": {
      return playableStyles.active;
    }

    case "recovery": {
      return playableStyles.recovery;
    }

    default: {
      return playableStyles.other;
    }
  }
};

const stripRow = (
  h: HtmlBuilder<BoardMessage>,
  label: string,
  strip: Strip,
  axis: Axis,
  cursor: Option.Option<number>
): Html => {
  const span = Math.max(1, axis.to - axis.from);
  const at = (tick: number) => percent(axisShare(axis, tick - strip.hitTick));

  return h.div(
    [
      h.Key(strip.id),
      h.Class(cls(playableStyles.stripRow)),
      h.Role("group"),
      h.AriaLabel(playableCopy.strip(label)),
    ],
    [
      h.span([h.Class(cls(playableStyles.stripLabel))], [label]),
      h.div(
        [h.Class(cls(playableStyles.track))],
        [
          ...strip.segments.map((segment) =>
            h.span([
              h.Key(`segment:${segment.from}`),
              h.Class(cls(playableStyles.segment, stateStyle(segment.state))),
              h.Attribute(
                "title",
                `${segment.state} ${segment.from}–${segment.to - 1}`
              ),
              h.Style({
                left: at(segment.from),
                width: percent((segment.to - segment.from) / span),
              }),
            ])
          ),
          ...strip.hits.map((tick) =>
            h.span([
              h.Key(`hit:${tick}`),
              h.Class(cls(playableStyles.hit)),
              h.Style({ left: at(tick) }),
            ])
          ),
          h.span([
            h.Key("sync"),
            h.Class(cls(playableStyles.sync)),
            h.Style({ left: at(strip.hitTick) }),
          ]),
          ...Option.match(cursor, {
            onNone: () => [],
            onSome: (tick) => [
              h.span([
                h.Key("cursor"),
                h.Class(cls(playableStyles.cursor)),
                h.DataAttribute("tick", String(tick)),
                h.Style({ left: at(Math.min(tick, strip.length)) }),
              ]),
            ],
          }),
        ]
      ),
    ]
  );
};

const legend = (h: HtmlBuilder<BoardMessage>): Html =>
  h.div(
    [h.Class(cls(playableStyles.legend))],
    (["startup", "active", "recovery"] as const).map((state) =>
      h.span(
        [h.Key(state)],
        [
          h.span([
            h.Class(cls(playableStyles.swatch, stateStyle(state))),
            h.AriaHidden(true),
          ]),
          state,
        ]
      )
    )
  );

const stripsView = (
  h: HtmlBuilder<BoardMessage>,
  model: BoardModel,
  takes: readonly Take[],
  plan: SyncPlan
): Html => {
  const shown = takes.flatMap((take) =>
    Option.match(take.frames, {
      onNone: () => [],
      onSome: (frames) => [{ strip: stripOf(take.variant.id, frames), take }],
    })
  );

  if (shown.length === 0) {
    return h.empty;
  }

  const axis = stripAxis(shown.map(({ strip }) => strip));

  return h.section(
    [h.Class(cls(playableStyles.strips)), h.AriaLabel(playableCopy.strips)],
    [
      legend(h),
      ...shown.map(({ strip, take }) =>
        stripRow(
          h,
          take.variant.label,
          strip,
          axis,
          Option.map(
            Option.filter(playClip(playTake(take)), (clip) =>
              hasStarted(plan, clip, model.clock)
            ),
            (clip) => cursorTick(plan, clip, model.clock, strip.tickRate)
          )
        )
      ),
      h.div(
        [h.Class(cls(playableStyles.stripRow)), h.AriaHidden(true)],
        [
          h.span([]),
          h.div(
            [h.Class(cls(playableStyles.axis))],
            [
              h.span([], [playableCopy.axisStart(axis.from)]),
              h.span([], [playableCopy.axisHit]),
              h.span([], [playableCopy.axisEnd(axis.to - 1)]),
            ]
          ),
        ]
      ),
    ]
  );
};

export const playableBoard = (
  h: HtmlBuilder<BoardMessage>,
  model: BoardModel,
  where: { readonly asset: string; readonly layer: string },
  variants: readonly VariantValue[],
  picked: string | undefined
): PlayableBoard => {
  const takes = takesOf(model, where.asset, where.layer, variants);
  const plan = syncPlan(playClips(takes.map(playTake)));

  return {
    columns: takes.map(column(h, model, where, plan, picked)),
    plan,
    strips: stripsView(h, model, takes, plan),
  };
};

export const recordButton = (
  h: HtmlBuilder<BoardMessage>,
  recording: readonly string[],
  asset: { readonly id: string; readonly title: string },
  style: stylex.StyleXStyles
): Html => {
  const busy = recording.includes(asset.id);

  return h.button(
    [
      h.Type("button"),
      h.Class(cls(style)),
      h.AriaLabel(playableCopy.record(asset.title)),
      h.Disabled(busy),
      h.OnClick(Message.ClickedRecord({ asset: asset.id })),
    ],
    [busy ? playableCopy.recording : playableCopy.recordLabel]
  );
};
