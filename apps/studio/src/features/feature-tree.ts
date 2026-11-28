import { Component, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Layer, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import { GetTree } from "../client/queries/get-tree.ts";
import { failureText, Studio } from "../client/studio.ts";
import { Page } from "../domain/page.ts";
import type { Area, Row, TreeNodeValue } from "../domain/tree.ts";
import { isClaimable, isFeature, outline, SORTS } from "../domain/tree.ts";

const SORT_LABELS = { name: "Name", status: "Status", tree: "Tree order" };

export const FeatureTreeMessage = UiSchema.TaggedEnum({
  ChoseSort: { sort: Schema.Literals(SORTS) },
});

const FeatureTreeDef = Html.component({
  message: FeatureTreeMessage,
  model: Schema.Struct({ sort: Schema.Literals(SORTS) }),
  name: "FeatureTree",
  props: Schema.Struct({ page: Page }),
  queries: {
    tree: { args: ({ props }) => ({ page: props.page }), query: GetTree },
  },
});

export const claimUrl = (node: TreeNodeValue) =>
  `https://github.com/SE370-Team1/docs/issues/new?${new URLSearchParams({
    template: "task.yml",
    title: `GDD [${node.id}]: ${node.title}`,
    what: `${node.title}, from the GDD feature tree: ${node.url ?? ""}\n\n${node.summary ?? ""}`,
  }).toString()}`;

const statusLabel = (status: string) =>
  status === "needs-owner" ? "needs owner" : status;

const row = FeatureTreeDef.fragment((h, entry: Row) => {
  const { node } = entry;
  const status = node.status ?? "planned";

  return h.li
    .key(node.id)
    .class("feature")
    .attr("style", `--depth: ${entry.depth}`)
    .children(
      h.span.class(`dot status-${status}`).attr("aria-hidden", "true"),
      node.url === undefined
        ? h.span.class("name").children(node.title)
        : h.a
            .class("name")
            .attr("href", node.url)
            .attr("target", "_blank")
            .attr("rel", "noopener")
            .attr("title", node.summary ?? "")
            .children(node.title),
      isFeature(node) && status !== "live"
        ? h.span.class("status").children(statusLabel(status))
        : [],
      isClaimable(node)
        ? h.a
            .class("claim-button")
            .attr("href", claimUrl(node))
            .attr("target", "_blank")
            .attr("rel", "noopener")
            .children("Claim")
        : h.span.class("owner").children(node.owner ?? "")
    );
});

const area = FeatureTreeDef.fragment((h, entry: Area) =>
  h.section
    .key(entry.node.id)
    .class("area")
    .children(
      h.h2(
        h.span.children(entry.node.title),
        h.span.class("tally").children(`${entry.live} of ${entry.total} live`)
      ),
      h.ul.children(entry.rows.map((item) => row(h, item)))
    )
);

export const FeatureTreeNoDeps = FeatureTreeDef.make({
  init: () => ({ sort: "tree" as const }),
  update: ($, message) =>
    FeatureTreeMessage.match(message, {
      ChoseSort: ({ sort }) => $.evolve({ sort }),
    }),
  view: (h, model) =>
    AsyncResult.match(h.queries.tree, {
      onFailure: ({ cause }) =>
        h.p.class("note pad").children(failureText(cause)),
      onInitial: () => h.p.class("note pad").children("Loading the tree…"),
      onSuccess: ({ value: root }) =>
        h.section.class("outline").children(
          h.header.class("tools").children(
            h.h1(root.title),
            h.div
              .class("buttons")
              .attr("role", "group")
              .attr("aria-label", "Sort")
              .children(
                h.span.class("sort-label").children("Sort"),
                SORTS.map((sort) =>
                  h.button
                    .key(sort)
                    .attr("aria-pressed", String(model.sort === sort))
                    .on("click", FeatureTreeMessage.ChoseSort({ sort }))
                    .children(SORT_LABELS[sort])
                )
              )
          ),
          h.div
            .class("areas")
            .children(outline(root, model.sort).map((entry) => area(h, entry)))
        ),
    }),
});

export const FeatureTree = FeatureTreeNoDeps.pipe(
  Component.provide([GetTree.layer.pipe(Layer.provide(Studio.layerHttp))])
);
