import type { LayerDef, Render, Variant } from "@gds/model";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import {
  composeKey,
  failingGates,
  gateValue,
  hasRows,
  isPickable,
  isWaiting,
  pickedTakes,
  rowDiff,
  takeName,
  viewOf,
  viewsOf,
} from "../../client/board/compose.js";
import { Message } from "../../client/board/message.js";
import type { BoardMessage } from "../../client/board/message.js";
import { takeKey } from "../../client/board/model.js";
import type {
  BoardAssetValue,
  BoardModel,
  CameraCompareValue,
  ComposeStateValue,
} from "../../client/board/model.js";
import { mediaSrc } from "../../client/board/picker.js";
import { composeCopy } from "./copy.js";
import { pickerStyles } from "./picker.stylex.js";

type VariantValue = typeof Variant.Type;

type RenderValue = typeof Render.Type;

type LayerValue = typeof LayerDef.Type;

const cls = (...styles: (stylex.StyleXStyles | false)[]) =>
  stylex.props(...styles).className ?? "";

const waitingBox = (h: HtmlBuilder<BoardMessage>, why: string): Html =>
  h.div(
    [h.Class(cls(pickerStyles.pending)), h.Role("status")],
    [composeCopy.waiting(why)]
  );

const emptyBox = (h: HtmlBuilder<BoardMessage>, text: string): Html =>
  h.div([h.Class(cls(pickerStyles.pending))], [text]);

const strip = (
  h: HtmlBuilder<BoardMessage>,
  render: RenderValue,
  label: string,
  selected: Option.Option<string>,
  onPick: (camera: string) => BoardMessage
): Html => stripIn(false, h, render, label, selected, onPick);

const stripIn = (
  extra: stylex.StyleXStyles | false,
  h: HtmlBuilder<BoardMessage>,
  render: RenderValue,
  label: string,
  selected: Option.Option<string>,
  onPick: (camera: string) => BoardMessage
): Html =>
  h.div(
    [h.Class(cls(pickerStyles.strip, extra)), h.AriaLabel(label)],
    viewsOf(render).map((view) =>
      h.button(
        [
          h.Key(view.camera),
          h.Type("button"),
          h.Class(
            cls(
              pickerStyles.thumbButton,
              Option.contains(selected, view.camera) && pickerStyles.thumbOn
            )
          ),
          h.AriaLabel(composeCopy.camera(view.camera)),
          h.OnClick(onPick(view.camera)),
        ],
        [
          h.img([
            h.Src(mediaSrc(view.path)),
            h.Alt(""),
            h.Class(cls(pickerStyles.thumb)),
            h.Draggable(false),
          ]),
          h.span([h.Class(cls(pickerStyles.thumbLabel))], [view.camera]),
        ]
      )
    )
  );

const mixStage = (
  h: HtmlBuilder<BoardMessage>,
  entry: BoardAssetValue,
  compose: ComposeStateValue,
  render: RenderValue | undefined,
  hasPicks: boolean
): Html => {
  if (!hasPicks) {
    return emptyBox(h, composeCopy.empty);
  }

  if (render === undefined) {
    return emptyBox(h, composeCopy.rendering);
  }

  if (render.pending !== undefined) {
    return waitingBox(h, render.pending);
  }

  const views = viewsOf(render);

  const [first] = views;

  const camera = Option.getOrElse(compose.mixCamera, () => first?.camera ?? "");

  const shown = Option.match(viewOf(render, camera), {
    onNone: () => render.still ?? render.path,
    onSome: (view) => view.path,
  });

  return h.div(
    [h.Class(cls(pickerStyles.mixStage))],
    [
      h.img([
        h.Src(mediaSrc(shown)),
        h.Alt(
          views.length === 0
            ? composeCopy.mix(entry.asset.title)
            : `${composeCopy.mix(entry.asset.title)}, ${camera}`
        ),
        h.Class(cls(pickerStyles.mixImage)),
      ]),
      views.length === 0
        ? h.empty
        : stripIn(
            pickerStyles.mixStrip,
            h,
            render,
            composeCopy.mixCameras,
            Option.some(camera),
            (id) => Message.ChoseMixCamera({ camera: id })
          ),
    ]
  );
};

const gateTable = (h: HtmlBuilder<BoardMessage>, variant: VariantValue) =>
  variant.gates === undefined || variant.gates.length === 0
    ? h.empty
    : h.table(
        [
          h.Class(cls(pickerStyles.gates)),
          h.AriaLabel(composeCopy.gates(variant.label)),
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
                    [h.Class(cls(pickerStyles.gateCell))],
                    [gateValue(gate.value)]
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
                ]
              )
            )
          ),
        ]
      );

const rowsView = (
  h: HtmlBuilder<BoardMessage>,
  current: VariantValue | undefined,
  variant: VariantValue
): Html => {
  if (!hasRows(variant) || current?.id === variant.id) {
    return h.empty;
  }

  const changes = rowDiff(current, variant);

  return h.ul(
    [
      h.Class(cls(pickerStyles.diff)),
      h.AriaLabel(composeCopy.rows(variant.label)),
    ],
    changes.length === 0
      ? [h.li([], [composeCopy.sameRows])]
      : changes.map((change) =>
          h.li(
            [h.Key(`${change.file}:${change.path}`)],
            [
              `${change.file} ${change.path}: `,
              h.span(
                [h.Class(cls(pickerStyles.diffFrom))],
                [
                  Option.match(change.from, {
                    onNone: () => composeCopy.unset,
                    onSome: gateValue,
                  }),
                ]
              ),
              ` → ${gateValue(change.to)}`,
            ]
          )
        )
  );
};

const variantMedia = (
  h: HtmlBuilder<BoardMessage>,
  layer: LayerValue,
  variant: VariantValue,
  isRendering: boolean
): Html => {
  const { render } = variant;

  if (render === undefined) {
    return emptyBox(
      h,
      isRendering ? composeCopy.rendering : composeCopy.notRendered
    );
  }

  if (render.pending !== undefined) {
    return waitingBox(h, render.pending);
  }

  if (viewsOf(render).length > 0) {
    return strip(
      h,
      render,
      composeCopy.cameras(variant.label),
      Option.none(),
      (camera) => Message.OpenedCamera({ camera, layer: layer.id })
    );
  }

  return h.img([
    h.Src(mediaSrc(render.still ?? render.path)),
    h.Alt(`${layer.title} ${variant.label}`),
    h.Class(cls(pickerStyles.stage)),
    h.Draggable(false),
  ]);
};

const variantCard =
  (
    h: HtmlBuilder<BoardMessage>,
    model: BoardModel,
    entry: BoardAssetValue,
    layer: LayerValue,
    current: VariantValue | undefined
  ) =>
  (variant: VariantValue): Html => {
    const isPicked = current?.id === variant.id;
    const failing = failingGates(variant);
    const [firstFail] = failing;

    const isRendering = model.rendering.includes(
      takeKey(entry.asset.id, layer.id, variant.id)
    );

    const action = isPicked
      ? h.span([h.Class(cls(pickerStyles.key))], [composeCopy.current])
      : h.button(
          [
            h.Type("button"),
            h.Class(cls(pickerStyles.ghost)),
            h.Disabled(!isPickable(variant) || model.status.state === "saving"),
            h.AriaLabel(
              firstFail === undefined
                ? composeCopy.pick(`${layer.title} ${variant.label}`)
                : `${composeCopy.pick(`${layer.title} ${variant.label}`)}, ${composeCopy.fails(firstFail.id, gateValue(firstFail.value))}`
            ),
            h.OnClick(
              Message.ChoseComposeVariant({
                layer: layer.id,
                variant: variant.id,
              })
            ),
          ],
          [composeCopy.pick(variant.label)]
        );

    return h.figure(
      [
        h.Key(variant.id),
        h.Class(
          cls(
            pickerStyles.column,
            isPicked && pickerStyles.picked,
            failing.length > 0 && pickerStyles.failing
          )
        ),
        h.AriaLabel(
          `${layer.title} ${variant.label}${isPicked ? `, ${composeCopy.current}` : ""}${
            firstFail === undefined
              ? ""
              : `, ${composeCopy.fails(firstFail.id, gateValue(firstFail.value))}`
          }`
        ),
      ],
      [
        h.div(
          [h.Class(cls(pickerStyles.columnHead))],
          [
            h.span(
              [h.Class(cls(pickerStyles.label))],
              [takeName(layer.title, variant)]
            ),
            action,
          ]
        ),
        firstFail === undefined
          ? h.empty
          : h.p(
              [h.Class(cls(pickerStyles.note, pickerStyles.fail))],
              [composeCopy.fails(firstFail.id, gateValue(firstFail.value))]
            ),
        variantMedia(h, layer, variant, isRendering),
        gateTable(h, variant),
        rowsView(h, current, variant),
      ]
    );
  };

const layerRow =
  (h: HtmlBuilder<BoardMessage>, model: BoardModel, entry: BoardAssetValue) =>
  (layer: LayerValue): Html => {
    const variants = entry.asset.layers[layer.id]?.variants ?? [];
    const picked = entry.asset.mix[layer.id];
    const current = variants.find(({ id }) => id === picked);

    return h.section(
      [
        h.Key(layer.id),
        h.Class(cls(pickerStyles.composeLayer)),
        h.AriaLabel(composeCopy.layer(layer.title)),
      ],
      [
        h.div(
          [h.Class(cls(pickerStyles.composeLayerHead))],
          [
            h.h3([h.Class(cls(pickerStyles.heading))], [layer.title]),
            h.span(
              [h.Class(cls(pickerStyles.sub))],
              [
                current === undefined
                  ? composeCopy.noPick
                  : composeCopy.picked(takeName(layer.title, current)),
              ]
            ),
          ]
        ),
        h.div(
          [h.Class(cls(pickerStyles.composeCards))],
          variants.map(variantCard(h, model, entry, layer, current))
        ),
      ]
    );
  };

const compareView = (
  h: HtmlBuilder<BoardMessage>,
  entry: BoardAssetValue,
  compare: CameraCompareValue
): Html => {
  const layer = entry.layers.find(({ id }) => id === compare.layer);

  if (layer === undefined) {
    return h.empty;
  }

  const title = composeCopy.cameraDialog(layer.title, compare.camera);
  const picked = entry.asset.mix[layer.id];

  return h.div(
    [h.Class(cls(pickerStyles.backdrop))],
    [
      h.section(
        [
          h.Class(cls(pickerStyles.panel)),
          h.Role("dialog"),
          h.AriaModal(true),
          h.AriaLabel(title),
        ],
        [
          h.div(
            [h.Class(cls(pickerStyles.header))],
            [
              h.h2([h.Class(cls(pickerStyles.heading))], [title]),
              h.span([h.Class(cls(pickerStyles.spacer))]),
              h.button(
                [
                  h.Type("button"),
                  h.Class(cls(pickerStyles.ghost)),
                  h.OnClick(Message.ClosedCamera()),
                ],
                [composeCopy.close]
              ),
            ]
          ),
          h.div(
            [h.Class(cls(pickerStyles.compare))],
            (entry.asset.layers[layer.id]?.variants ?? []).map((variant) => {
              const failing = failingGates(variant);

              return h.figure(
                [
                  h.Key(variant.id),
                  h.Class(
                    cls(
                      pickerStyles.column,
                      variant.id === picked && pickerStyles.picked,
                      failing.length > 0 && pickerStyles.failing
                    )
                  ),
                ],
                [
                  Option.match(viewOf(variant.render, compare.camera), {
                    onNone: () =>
                      isWaiting(variant.render)
                        ? waitingBox(h, variant.render?.pending ?? "")
                        : emptyBox(h, composeCopy.noCamera(variant.label)),
                    onSome: (view) =>
                      h.img([
                        h.Src(mediaSrc(view.path)),
                        h.Alt(
                          `${layer.title} ${variant.label}, ${compare.camera}`
                        ),
                        h.Class(cls(pickerStyles.compareImage)),
                      ]),
                  }),
                  h.figcaption(
                    [h.Class(cls(pickerStyles.label))],
                    [
                      takeName(layer.title, variant),
                      variant.id === picked ? `, ${composeCopy.current}` : "",
                    ]
                  ),
                ]
              );
            })
          ),
        ]
      ),
    ]
  );
};

export const composeView = (
  model: BoardModel,
  compose: ComposeStateValue,
  h: HtmlBuilder<BoardMessage>
): Html => {
  const entry = model.assets.find(
    (candidate) => candidate.asset.id === compose.asset
  );

  if (entry === undefined) {
    return h.empty;
  }

  const picks = pickedTakes(entry.asset, entry.layers);
  const render = model.composed[composeKey(entry.asset.id, picks)];

  const layers = entry.layers.toSorted(
    (left, right) => left.order - right.order
  );

  return h.div(
    [h.Class(cls(pickerStyles.backdrop))],
    [
      h.section(
        [
          h.Class(cls(pickerStyles.panel)),
          h.Role("dialog"),
          h.AriaModal(true),
          h.AriaLabel(composeCopy.dialog(entry.asset.title)),
        ],
        [
          h.div(
            [h.Class(cls(pickerStyles.header))],
            [
              h.h2(
                [h.Class(cls(pickerStyles.heading))],
                [composeCopy.dialog(entry.asset.title)]
              ),
              h.span([h.Class(cls(pickerStyles.spacer))]),
              h.button(
                [
                  h.Type("button"),
                  h.Class(cls(pickerStyles.ghost)),
                  h.OnClick(Message.ClosedCompose()),
                ],
                [composeCopy.close]
              ),
            ]
          ),
          h.div(
            [h.Class(cls(pickerStyles.composeBody))],
            [
              h.div(
                [
                  h.Class(cls(pickerStyles.mixPane)),
                  h.Role("group"),
                  h.AriaLabel(composeCopy.mix(entry.asset.title)),
                ],
                [
                  mixStage(
                    h,
                    entry,
                    compose,
                    render,
                    Object.keys(picks).length > 0
                  ),
                ]
              ),
              h.div(
                [h.Class(cls(pickerStyles.composeLayers))],
                layers.map(layerRow(h, model, entry))
              ),
            ]
          ),
          h.p(
            [
              h.Class(
                cls(
                  pickerStyles.status,
                  model.status.state === "failed" && pickerStyles.statusFailed
                )
              ),
              h.Role("status"),
            ],
            [model.status.message]
          ),
        ]
      ),
      Option.match(compose.compare, {
        onNone: () => h.empty,
        onSome: (compare) => compareView(h, entry, compare),
      }),
    ]
  );
};
