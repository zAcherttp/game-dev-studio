import * as stylex from "@stylexjs/stylex";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "../../client/board/message.js";
import type { BoardMessage } from "../../client/board/message.js";
import type {
  BoardModel,
  CatalogEntryValue,
} from "../../client/board/model.js";
import { assetPath, switcherEntries } from "../../client/board/switcher.js";
import { boardStyles } from "./board.stylex.js";
import { switcherCopy } from "./copy.js";

const cls = (...styles: (stylex.StyleXStyles | false)[]) =>
  stylex.props(...styles).className ?? "";

const PANEL_ID = "asset-switcher";

const entryLink = (
  h: HtmlBuilder<BoardMessage>,
  studio: string,
  entry: CatalogEntryValue,
  isCurrent: boolean
): Html => {
  const attributes = [
    h.Href(assetPath(studio, entry.id)),
    h.Class(
      cls(boardStyles.switcherLink, isCurrent && boardStyles.switcherCurrent)
    ),
  ];

  return h.li(
    [h.Key(entry.id)],
    [
      h.a(isCurrent ? [...attributes, h.AriaCurrent("page")] : attributes, [
        h.span([], [entry.title]),
        entry.picks > 0
          ? h.span(
              [h.Class(cls(boardStyles.switcherPicks))],
              [switcherCopy.picks(entry.picks)]
            )
          : h.empty,
      ]),
    ]
  );
};

export const switcherView = (
  model: BoardModel,
  h: HtmlBuilder<BoardMessage>
): Html => {
  const current = model.assets[0]?.asset;
  const entries = switcherEntries(model.catalog, model.assetFilter);

  const panel = h.nav(
    [
      h.Id(PANEL_ID),
      h.AriaLabel(switcherCopy.label),
      h.Class(cls(boardStyles.switcherPanel)),
    ],
    [
      h.input([
        h.Type("search"),
        h.AriaLabel(switcherCopy.filter),
        h.Placeholder(switcherCopy.filterPlaceholder),
        h.Value(model.assetFilter),
        h.Class(cls(boardStyles.switcherInput)),
        h.OnInput((value) => Message.UpdatedAssetFilter({ value })),
      ]),
      entries.length === 0
        ? h.p([h.Class(cls(boardStyles.switcherEmpty))], [switcherCopy.empty])
        : h.ul(
            [h.Class(cls(boardStyles.switcherList))],
            entries.map((entry) =>
              entryLink(h, model.studio.id, entry, entry.id === current?.id)
            )
          ),
    ]
  );

  return h.div(
    [h.Class(cls(boardStyles.switcher))],
    [
      h.button(
        [
          h.Type("button"),
          h.Class(cls(boardStyles.tool)),
          h.AriaExpanded(model.switcherOpen),
          h.AriaControls(PANEL_ID),
          h.OnClick(Message.ToggledSwitcher()),
        ],
        [switcherCopy.button(current?.title ?? model.studio.title)]
      ),
      model.switcherOpen ? panel : h.empty,
    ]
  );
};
