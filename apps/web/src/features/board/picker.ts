import type { Variant } from "@gds/model";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "../../client/board/message.js";
import type { BoardMessage } from "../../client/board/message.js";
import { takeKey } from "../../client/board/model.js";
import type { BoardModel, OpenLayerValue } from "../../client/board/model.js";
import {
  mediaSrc,
  openedLayer,
  referenceOf,
  syncClips,
} from "../../client/board/picker.js";
import { cycleOf, hasStarted, syncPlan } from "../../client/board/sync.js";
import type { SyncPlan } from "../../client/board/sync.js";
import { pickerCopy } from "./copy.js";
import { pickerStyles } from "./picker.stylex.js";

type VariantValue = typeof Variant.Type;

const cls = (...styles: (stylex.StyleXStyles | false)[]) =>
  stylex.props(...styles).className ?? "";

const loopSrc = (path: string, cycle: number) => `${path}?loop=${cycle}`;

const media = (
  h: HtmlBuilder<BoardMessage>,
  variant: VariantValue,
  plan: SyncPlan,
  clock: number,
  isRendering: boolean
): Html => {
  const { render } = variant;

  if (render === undefined) {
    return h.div(
      [h.Key(`${variant.id}:empty`), h.Class(cls(pickerStyles.stage))],
      isRendering ? [pickerCopy.rendering(variant.label)] : []
    );
  }

  const clip = { id: variant.id };
  const cycle = cycleOf(plan, clock);

  if (!hasStarted(plan, clip, clock)) {
    if (render.still === undefined) {
      return h.div([
        h.Key(`${variant.id}:wait`),
        h.Class(cls(pickerStyles.stage)),
        h.DataAttribute("cycle", "waiting"),
      ]);
    }

    return h.img([
      h.Key(`${variant.id}:wait`),
      h.Src(mediaSrc(render.still)),
      h.Alt(pickerCopy.loop(variant.label)),
      h.Class(cls(pickerStyles.stage, pickerStyles.waiting)),
      h.DataAttribute("cycle", "waiting"),
    ]);
  }

  return h.img([
    h.Key(`${variant.id}:${cycle}`),
    h.Src(loopSrc(mediaSrc(render.path), cycle)),
    h.Alt(pickerCopy.loop(variant.label)),
    h.Class(cls(pickerStyles.stage)),
    h.DataAttribute("cycle", String(cycle)),
  ]);
};

const gateRows = (h: HtmlBuilder<BoardMessage>, variant: VariantValue): Html =>
  variant.gates === undefined || variant.gates.length === 0
    ? h.empty
    : h.table(
        [
          h.Class(cls(pickerStyles.gates)),
          h.AriaLabel(`${variant.label} gates`),
        ],
        [
          h.tbody(
            [],
            variant.gates.map((gate) =>
              h.tr(
                [h.Key(gate.id)],
                [
                  h.th(
                    [
                      h.Class(cls(pickerStyles.gateCell)),
                      h.Attribute("scope", "row"),
                    ],
                    [gate.id]
                  ),
                  h.td(
                    [
                      h.Class(
                        cls(
                          pickerStyles.gateCell,
                          gate.ok ? pickerStyles.pass : pickerStyles.fail
                        )
                      ),
                    ],
                    [gate.ok ? "pass" : "fail"]
                  ),
                  h.td([h.Class(cls(pickerStyles.gateCell))], [gate.note]),
                ]
              )
            )
          ),
        ]
      );

const variantColumn =
  (
    h: HtmlBuilder<BoardMessage>,
    model: BoardModel,
    plan: SyncPlan,
    picked: string | undefined
  ) =>
  (variant: VariantValue, index: number): Html => {
    const beat = model.studio.sync?.beat ?? "start";
    const isPicked = variant.id === picked;

    const isRendering = Option.exists(model.open, (open) => {
      const key = takeKey(open.asset, open.layer, variant.id);

      return model.pickerMode === "solo"
        ? model.solo[key] === undefined
        : model.rendering.includes(key);
    });

    return h.figure(
      [
        h.Key(variant.id),
        h.Class(cls(pickerStyles.column, isPicked && pickerStyles.picked)),
        h.AriaLabel(
          `Variant ${variant.label}${isPicked ? ", current pick" : ""}`
        ),
        h.DataAttribute("rendering", String(isRendering)),
      ],
      [
        h.div(
          [h.Class(cls(pickerStyles.columnHead))],
          [
            h.span([h.Class(cls(pickerStyles.label))], [variant.label]),
            h.kbd([h.Class(cls(pickerStyles.key))], [String(index + 1)]),
          ]
        ),
        media(h, variant, plan, model.clock, isRendering),
        variant.render?.still === undefined
          ? h.empty
          : h.div(
              [h.Class(cls(pickerStyles.stillRow))],
              [
                h.img([
                  h.Src(mediaSrc(variant.render.still)),
                  h.Alt(pickerCopy.still(variant.label, beat)),
                  h.Class(cls(pickerStyles.still)),
                ]),
                h.span([], [pickerCopy.beat(beat)]),
              ]
            ),
        gateRows(h, variant),
        variant.note === undefined
          ? h.empty
          : h.p([h.Class(cls(pickerStyles.note))], [variant.note]),
        h.button(
          [
            h.Type("button"),
            h.Class(cls(pickerStyles.button)),
            h.Disabled(model.status.state === "saving"),
            h.OnClick(Message.ChoseVariant({ variant: variant.id })),
          ],
          [pickerCopy.pick(variant.label)]
        ),
      ]
    );
  };

const referenceColumn = (
  h: HtmlBuilder<BoardMessage>,
  model: BoardModel,
  plan: SyncPlan
): Html =>
  Option.match(referenceOf(model.studio.pack), {
    onNone: () => h.empty,
    onSome: (file) =>
      h.figure(
        [h.Key("reference"), h.Class(cls(pickerStyles.column))],
        [
          h.div(
            [h.Class(cls(pickerStyles.columnHead))],
            [h.span([h.Class(cls(pickerStyles.label))], [pickerCopy.reference])]
          ),
          h.img([
            h.Key(`reference:${cycleOf(plan, model.clock)}`),
            h.Src(loopSrc(mediaSrc(file.path), cycleOf(plan, model.clock))),
            h.Alt(pickerCopy.reference),
            h.Class(cls(pickerStyles.stage)),
          ]),
          h.p([h.Class(cls(pickerStyles.note))], [file.why]),
        ]
      ),
  });

const field = (
  h: HtmlBuilder<BoardMessage>,
  id: string,
  label: string,
  control: Html
): Html =>
  h.div(
    [h.Class(cls(pickerStyles.field))],
    [
      h.label([h.For(id), h.Class(cls(pickerStyles.fieldLabel))], [label]),
      control,
    ]
  );

const footer = (h: HtmlBuilder<BoardMessage>, model: BoardModel): Html =>
  h.div(
    [h.Class(cls(pickerStyles.footer))],
    [
      field(
        h,
        "pick-note",
        pickerCopy.note,
        h.textarea([
          h.Id("pick-note"),
          h.Class(cls(pickerStyles.input)),
          h.Rows(2),
          h.Value(model.note),
          h.Placeholder(pickerCopy.notePlaceholder),
          h.OnInput((value) => Message.UpdatedNote({ value })),
        ])
      ),
      h.div(
        [h.Class(cls(pickerStyles.round))],
        [
          field(
            h,
            "round-axis",
            pickerCopy.axis,
            h.input([
              h.Id("round-axis"),
              h.Class(cls(pickerStyles.input)),
              h.Value(model.axis),
              h.Placeholder(pickerCopy.axisPlaceholder),
              h.OnInput((value) => Message.UpdatedAxis({ value })),
            ])
          ),
          field(
            h,
            "round-note",
            pickerCopy.roundNote,
            h.input([
              h.Id("round-note"),
              h.Class(cls(pickerStyles.input)),
              h.Value(model.roundNote),
              h.OnInput((value) => Message.UpdatedRoundNote({ value })),
            ])
          ),
          h.button(
            [
              h.Type("button"),
              h.Class(cls(pickerStyles.ghost)),
              h.Disabled(model.status.state === "saving"),
              h.OnClick(Message.SubmittedRound()),
            ],
            [pickerCopy.roundButton]
          ),
        ]
      ),
    ]
  );

const modeButton = (
  h: HtmlBuilder<BoardMessage>,
  model: BoardModel,
  mode: BoardModel["pickerMode"],
  label: string
): Html =>
  h.button(
    [
      h.Type("button"),
      h.Class(
        cls(
          pickerStyles.ghost,
          model.pickerMode === mode && pickerStyles.pressed
        )
      ),
      h.AriaPressed(String(model.pickerMode === mode)),
      h.OnClick(Message.SwitchedPickerMode({ mode })),
    ],
    [label]
  );

export const pickerView = (
  model: BoardModel,
  open: OpenLayerValue,
  h: HtmlBuilder<BoardMessage>
): Html =>
  Option.match(openedLayer(model.assets, open), {
    onNone: () => h.empty,
    onSome: ({ asset, history, layer, picked, variants: takes }) => {
      const variants =
        model.pickerMode === "solo"
          ? takes.map(({ render: _mix, ...take }) => {
              const solo = model.solo[takeKey(asset.id, layer.id, take.id)];

              return solo === undefined ? take : { ...take, render: solo };
            })
          : takes;

      const plan = syncPlan(syncClips(model.studio, variants));
      const beat = model.studio.sync?.beat ?? "start";

      return h.div(
        [h.Class(cls(pickerStyles.backdrop))],
        [
          h.section(
            [
              h.Class(cls(pickerStyles.panel)),
              h.Role("dialog"),
              h.AriaModal(true),
              h.AriaLabel(pickerCopy.dialog(layer.title)),
            ],
            [
              h.div(
                [h.Class(cls(pickerStyles.header))],
                [
                  h.h2([h.Class(cls(pickerStyles.heading))], [layer.title]),
                  h.span([h.Class(cls(pickerStyles.sub))], [asset.title]),
                  h.span(
                    [h.Class(cls(pickerStyles.sub))],
                    [pickerCopy.sync(beat, plan.period)]
                  ),
                  h.span(
                    [h.Class(cls(pickerStyles.sub))],
                    [pickerCopy.history(history.length)]
                  ),
                  modeButton(h, model, "mix", pickerCopy.inMix),
                  modeButton(h, model, "solo", pickerCopy.alone),
                  h.span([h.Class(cls(pickerStyles.spacer))]),
                  h.p(
                    [
                      h.Role("status"),
                      h.Class(
                        cls(
                          pickerStyles.status,
                          model.status.state === "failed" &&
                            pickerStyles.statusFailed
                        )
                      ),
                    ],
                    [model.status.message]
                  ),
                  h.button(
                    [
                      h.Type("button"),
                      h.Class(cls(pickerStyles.ghost)),
                      h.OnClick(Message.ClosedPicker()),
                    ],
                    [pickerCopy.close]
                  ),
                ]
              ),
              h.div(
                [h.Class(cls(pickerStyles.columns))],
                [
                  referenceColumn(h, model, plan),
                  ...variants.map(variantColumn(h, model, plan, picked)),
                ]
              ),
              footer(h, model),
            ]
          ),
        ]
      );
    },
  });
