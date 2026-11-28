import { Component, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Layer, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import { GetTree } from "../client/queries/get-tree.ts";
import { failureText, Studio } from "../client/studio.ts";
import { Page } from "../domain/page.ts";
import type { Placed, TreeNodeValue } from "../domain/tree.ts";
import {
  branchIds,
  isClaimable,
  place,
  STATUSES,
  tally,
} from "../domain/tree.ts";

const COLUMN = 250;

const ROW = 30;

const MARGIN = 40;

const BAR = 120;

export const MindMapMessage = UiSchema.TaggedEnum({
  ClickedExpandAll: {},
  ClickedFoldAll: {},
  ClickedNode: { id: Schema.String },
  ClosedPanel: {},
  ToggledIdeas: {},
});

const MindMapDef = Html.component({
  message: MindMapMessage,
  model: Schema.Struct({
    open: Schema.Array(Schema.String),
    selected: Schema.String,
    showIdeas: Schema.Boolean,
  }),
  name: "MindMap",
  props: Schema.Struct({ page: Page }),
  queries: {
    tree: { args: ({ props }) => ({ page: props.page }), query: GetTree },
  },
});

const label = (status: string) =>
  status === "needs-owner" ? "needs owner" : status;

const find = (node: TreeNodeValue, id: string): TreeNodeValue | undefined => {
  if (node.id === id) {
    return node;
  }

  for (const child of node.children ?? []) {
    const found = find(child, id);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
};

export const claimUrl = (node: TreeNodeValue) =>
  `https://github.com/SE370-Team1/docs/issues/new?${new URLSearchParams({
    template: "task.yml",
    title: `GDD [${node.id}]: ${node.title}`,
    what: `${node.title}, from the GDD feature tree: ${node.url ?? ""}\n\n${node.summary ?? ""}`,
  }).toString()}`;

const yOf = (row: number) => MARGIN + row * ROW;

const xOf = (depth: number) => MARGIN + depth * COLUMN;

const fanned = (entry: Placed) => entry.open && entry.hasChildren;

const statusBar = MindMapDef.fragment(
  (h, entry: Placed, showIdeas: boolean) => {
    const counts = tally(entry.node, showIdeas);

    if (counts.total === 0) {
      return [];
    }

    let offset = 0;
    const x = xOf(entry.depth) + 12;
    const y = yOf(entry.y) + 8;

    return h.g.children(
      ...STATUSES.flatMap((status) => {
        const count = counts.byStatus[status] ?? 0;

        if (count === 0) {
          return [];
        }

        const width = (count / counts.total) * BAR;

        const segment = h.rect.key(status).attrs({
          class: `seg status-${status}`,
          height: "4",
          rx: "2",
          width: String(Math.max(width - 1, 1)),
          x: String(x + offset),
          y: String(y),
        });

        offset += width;

        return [segment];
      }),
      h.svgText
        .attrs({ class: "count", x: String(x + BAR + 8), y: String(y + 5) })
        .children(
          `${counts.live}/${counts.total} live${counts.free > 0 ? ` · ${counts.free} to claim` : ""}`
        )
    );
  }
);

const panel = MindMapDef.fragment((h, node: TreeNodeValue) =>
  h.aside
    .class("panel")
    .attr("aria-label", node.title)
    .children(
      h.button
        .class("close")
        .attr("aria-label", "Close")
        .on("click", MindMapMessage.ClosedPanel())
        .children("×"),
      h.h2(node.title),
      h.p
        .class("meta")
        .children(
          h.span
            .class(`status-text status-${node.status ?? "planned"}`)
            .children(`● ${label(node.status ?? node.kind)}`),
          node.owner === undefined || node.owner === ""
            ? ""
            : ` · ${node.owner}`,
          node.issue === undefined || node.issue === ""
            ? ""
            : h.a
                .attr(
                  "href",
                  `https://github.com/SE370-Team1/docs/issues/${node.issue}`
                )
                .attr("target", "_blank")
                .attr("rel", "noopener")
                .children(` · docs#${node.issue}`)
        ),
      h.p(node.summary ?? ""),
      node.url === undefined
        ? []
        : h.p(
            h.a
              .attr("href", node.url)
              .attr("target", "_blank")
              .attr("rel", "noopener")
              .children("Open the note")
          ),
      isClaimable(node)
        ? h.div
            .class("claim")
            .children(
              h.b(
                node.status === "idea" ? "Free to design. " : "Free to claim. "
              ),
              h.a
                .attr("href", claimUrl(node))
                .attr("target", "_blank")
                .attr("rel", "noopener")
                .children("Claim it"),
              ": this opens a Task issue for it. Fill in Done when, assign yourself, and the tree shows you as its owner after the next sync."
            )
        : []
    )
);

const drawTree = MindMapDef.fragment(
  (h, root: TreeNodeValue, open: readonly string[], showIdeas: boolean) => {
    const placed = place(root, new Set(open), showIdeas);
    const byId = new Map(placed.map((entry) => [entry.node.id, entry]));
    const rows = Math.max(0, ...placed.map((entry) => entry.y)) + 1;

    const depth = Math.max(0, ...placed.map((entry) => entry.depth)) + 1;

    return h.svg
      .class("tree")
      .attrs({
        height: String(rows * ROW + MARGIN * 2),
        role: "tree",
        width: String(depth * COLUMN + MARGIN * 2 + 160),
      })
      .children(
        h.g.children(
          placed.flatMap((entry) => {
            const parent = byId.get(entry.parentId);

            if (parent === undefined) {
              return [];
            }

            const x1 = xOf(parent.depth);
            const y1 = yOf(parent.y);
            const x2 = xOf(entry.depth);
            const y2 = yOf(entry.y);
            const mid = (x1 + x2) / 2;

            return [
              h.path.key(`link-${entry.node.id}`).attrs({
                class: `link status-${entry.node.status ?? "planned"}`,
                d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`,
              }),
            ];
          })
        ),
        h.g.children(
          placed.map((entry) => {
            const status = entry.node.status ?? "planned";
            const filled = entry.node.kind !== "feature" || status === "live";

            return h.g
              .key(entry.node.id)
              .attrs({ class: "node", role: "treeitem" })
              .attr(
                "aria-expanded",
                entry.hasChildren ? String(entry.open) : "false"
              )
              .on("click", MindMapMessage.ClickedNode({ id: entry.node.id }))
              .children(
                h.circle.attrs({
                  class: `dot status-${status}${filled ? " filled" : ""}`,
                  cx: String(xOf(entry.depth)),
                  cy: String(yOf(entry.y)),
                  r: entry.depth === 0 ? "7" : "5",
                }),
                h.svgText
                  .attrs({
                    class: entry.depth <= 1 ? "label strong" : "label",
                    x: String(xOf(entry.depth) + (fanned(entry) ? -6 : 12)),
                    y: String(yOf(entry.y) + (fanned(entry) ? -12 : 4)),
                  })
                  .children(
                    entry.node.title,
                    entry.node.kind === "feature" && status !== "live"
                      ? h.tspan
                          .attr("class", `tag status-${status}`)
                          .children(` ${label(status).toUpperCase()}`)
                      : []
                  ),
                entry.hasChildren && entry.depth > 0
                  ? statusBar(h, entry, showIdeas)
                  : []
              );
          })
        )
      );
  }
);

export const MindMapNoDeps = MindMapDef.make({
  init: () => ({ open: [], selected: "", showIdeas: false }),
  update: ($, message) =>
    MindMapMessage.match(message, {
      ClickedExpandAll: () =>
        AsyncResult.isSuccess($.queries.tree)
          ? $.evolve({ open: branchIds($.queries.tree.value) })
          : $.model,
      ClickedFoldAll: () => $.evolve({ open: [] }),
      ClickedNode: ({ id }) => {
        const node = AsyncResult.isSuccess($.queries.tree)
          ? find($.queries.tree.value, id)
          : undefined;

        const isBranch = (node?.children ?? []).length > 0;

        const toggled = $.model.open.includes(id)
          ? $.model.open.filter((entry) => entry !== id)
          : [...$.model.open, id];

        return node?.kind === "feature"
          ? $.evolve({ open: isBranch ? toggled : $.model.open, selected: id })
          : $.evolve({ open: toggled });
      },
      ClosedPanel: () => $.evolve({ selected: "" }),
      ToggledIdeas: () => $.evolve({ showIdeas: (shown) => !shown }),
    }),
  view: (h, model) =>
    AsyncResult.match(h.queries.tree, {
      onFailure: ({ cause }) =>
        h.p.class("note pad").children(failureText(cause)),
      onInitial: () => h.p.class("note pad").children("Loading the tree…"),
      onSuccess: ({ value: root }) => {
        const selected =
          model.selected === "" ? undefined : find(root, model.selected);

        return h.section.class("mindmap").children(
          h.header.class("tools").children(
            h.h1(root.title),
            h.div.class("legend").children(
              STATUSES.map((status) =>
                h.span
                  .key(status)
                  .class(`chip status-text status-${status}`)
                  .children(`● ${label(status)}`)
              )
            ),
            h.div
              .class("buttons")
              .children(
                h.button
                  .attr("aria-pressed", String(model.showIdeas))
                  .on("click", MindMapMessage.ToggledIdeas())
                  .children("Ideas"),
                h.button
                  .on("click", MindMapMessage.ClickedExpandAll())
                  .children("Expand all"),
                h.button
                  .on("click", MindMapMessage.ClickedFoldAll())
                  .children("Fold all")
              )
          ),
          h.div
            .class("canvas")
            .children(drawTree(h, root, model.open, model.showIdeas)),
          selected === undefined ? [] : panel(h, selected)
        );
      },
    }),
});

export const MindMap = MindMapNoDeps.pipe(
  Component.provide([GetTree.layer.pipe(Layer.provide(Studio.layerHttp))])
);
