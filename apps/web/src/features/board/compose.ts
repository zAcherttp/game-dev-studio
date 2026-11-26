import * as stylex from "@stylexjs/stylex";
import type { Html, HtmlBuilder } from "foldkit/html";

import {
  composeKey,
  pickedTakes,
  takeName,
  withoutLayers,
} from "../../client/board/compose.js";
import { Message } from "../../client/board/message.js";
import type { BoardMessage } from "../../client/board/message.js";
import type {
  BoardModel,
  ComposeStateValue,
} from "../../client/board/model.js";
import { mediaSrc } from "../../client/board/picker.js";
import { composeCopy } from "./copy.js";
import { pickerStyles } from "./picker.stylex.js";

const cls = (...styles: (stylex.StyleXStyles | false)[]) =>
  stylex.props(...styles).className ?? "";

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
  const shown = withoutLayers(picks, compose.off);
  const render = model.composed[composeKey(entry.asset.id, shown)];

  const stageOf = (): readonly (Html | string)[] => {
    if (Object.keys(shown).length === 0) {
      return [composeCopy.empty];
    }

    if (render === undefined) {
      return [composeCopy.rendering];
    }

    return [
      h.img([
        h.Src(mediaSrc(render.path)),
        h.Alt(composeCopy.dialog(entry.asset.title)),
        h.Class(cls(pickerStyles.composeImage)),
      ]),
    ];
  };

  const stage = stageOf();

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
              h.div([h.Class(cls(pickerStyles.composeStage))], stage),
              h.ul(
                [
                  h.Class(cls(pickerStyles.composeList)),
                  h.AriaLabel(composeCopy.layers),
                ],
                entry.layers.map((layer) => {
                  const take = picks[layer.id];

                  const variant = entry.asset.layers[layer.id]?.variants.find(
                    ({ id }) => id === take
                  );

                  const label =
                    variant === undefined
                      ? composeCopy.noPick
                      : takeName(layer.title, variant);

                  const isOn =
                    take !== undefined && !compose.off.includes(layer.id);

                  return h.li(
                    [h.Key(layer.id)],
                    [
                      h.label(
                        [
                          h.Class(
                            cls(
                              pickerStyles.composeRow,
                              !isOn && pickerStyles.composeOff
                            )
                          ),
                        ],
                        [
                          h.input([
                            h.Type("checkbox"),
                            h.Checked(isOn),
                            h.Disabled(take === undefined),
                            h.OnChange(() =>
                              Message.ToggledComposeLayer({ layer: layer.id })
                            ),
                          ]),
                          h.span([], [`${layer.title} ${label}`]),
                        ]
                      ),
                    ]
                  );
                })
              ),
            ]
          ),
        ]
      ),
    ]
  );
};
