import { Component, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Layer, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import { GetTree } from "../client/queries/get-tree.ts";
import { failureText, Studio } from "../client/studio.ts";
import { Page } from "../domain/page.ts";
import type { Area, Row, TreeNodeValue } from "../domain/tree.ts";
import {
  isClaimable,
  isFeature,
  isFiltered,
  outline,
  owners,
  SHOWS,
  SORTS,
  STATUSES,
} from "../domain/tree.ts";

const SORT_LABELS = { name: "Name", status: "Status", tree: "Tree order" };

const SHOW_LABELS = {
  all: "All",
  claimed: "Claimed",
  unclaimed: "Unclaimed",
};

export const FeatureTreeMessage = UiSchema.TaggedEnum({
  ChoseOwner: { owner: Schema.String },
  ChoseShow: { show: Schema.Literals(SHOWS) },
  ChoseSort: { sort: Schema.Literals(SORTS) },
  ChoseStatus: { status: Schema.String },
  ClickedClear: {},
  UpdatedQuery: { query: Schema.String },
});

const FeatureTreeDef = Html.component({
  message: FeatureTreeMessage,
  model: Schema.Struct({
    owner: Schema.String,
    query: Schema.String,
    show: Schema.Literals(SHOWS),
    sort: Schema.Literals(SORTS),
    status: Schema.String,
  }),
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
    .class("feature", entry.context && "context")
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
  init: () => ({
    owner: "",
    query: "",
    show: "all" as const,
    sort: "tree" as const,
    status: "",
  }),
  update: ($, message) =>
    FeatureTreeMessage.match(message, {
      ChoseOwner: ({ owner }) => $.evolve({ owner }),
      ChoseShow: ({ show }) => $.evolve({ show }),
      ChoseSort: ({ sort }) => $.evolve({ sort }),
      ChoseStatus: ({ status }) => $.evolve({ status }),
      ClickedClear: () =>
        $.evolve({ owner: "", query: "", show: "all", status: "" }),
      UpdatedQuery: ({ query }) => $.evolve({ query }),
    }),
  view: (h, model) =>
    AsyncResult.match(h.queries.tree, {
      onFailure: ({ cause }) =>
        h.p.class("note pad").children(failureText(cause)),
      onInitial: () => h.p.class("note pad").children("Loading the tree…"),
      onSuccess: ({ value: root }) => {
        const areas = outline(root, model.sort, model);

        return h.section.class("outline").children(
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
          h.div.class("filters").children(
            h.div
              .class("buttons")
              .attr("role", "group")
              .attr("aria-label", "Show")
              .children(
                SHOWS.map((show) =>
                  h.button
                    .key(show)
                    .attr("aria-pressed", String(model.show === show))
                    .on("click", FeatureTreeMessage.ChoseShow({ show }))
                    .children(SHOW_LABELS[show])
                )
              ),
            h.select
              .attr("aria-label", "Claimed by")
              .value(model.owner)
              .on("change", ({ value }) =>
                FeatureTreeMessage.ChoseOwner({ owner: value })
              )
              .children(
                h.option.attr("value", "").children("Anyone"),
                owners(root).map((owner) =>
                  h.option.key(owner).attr("value", owner).children(owner)
                )
              ),
            h.select
              .attr("aria-label", "Status")
              .value(model.status)
              .on("change", ({ value }) =>
                FeatureTreeMessage.ChoseStatus({ status: value })
              )
              .children(
                h.option.attr("value", "").children("Any status"),
                STATUSES.map((status) =>
                  h.option
                    .key(status)
                    .attr("value", status)
                    .children(statusLabel(status))
                )
              ),
            h.input
              .class("search")
              .attr("type", "search")
              .attr("placeholder", "Search features")
              .attr("aria-label", "Search features")
              .value(model.query)
              .on("input", ({ value }) =>
                FeatureTreeMessage.UpdatedQuery({ query: value })
              ),
            isFiltered(model)
              ? h.button
                  .on("click", FeatureTreeMessage.ClickedClear())
                  .children("Clear")
              : []
          ),
          h.div
            .class("areas")
            .children(
              areas.length === 0
                ? h.p.class("note pad").children("Nothing matches.")
                : areas.map((entry) => area(h, entry))
            )
        );
      },
    }),
});

export const FeatureTree = FeatureTreeNoDeps.pipe(
  Component.provide([GetTree.layer.pipe(Layer.provide(Studio.layerHttp))])
);
