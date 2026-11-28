import { Component, Head } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Layer, Match, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import { GetConfig } from "../client/queries/get-config.ts";
import { Studio } from "../client/studio.ts";
import type { PageValue } from "../domain/page.ts";
import { kindOf } from "../domain/page.ts";
import { Decisions } from "./decisions.ts";
import { FeatureTree } from "./feature-tree.ts";

const PageViewDef = Html.component({
  message: Schema.Never,
  model: Schema.Struct({}),
  name: "PageView",
  props: Schema.Struct({ id: Schema.String }),
  queries: { config: { args: () => ({}), query: GetConfig } },
});

const framed = PageViewDef.fragment((h, page: PageValue) =>
  h.div
    .class("framed")
    .children(
      h.iframe.attr("src", page.url).attr("title", page.title),
      page.hint === undefined
        ? []
        : h.p.class("hint").children("Not loading? Run ", h.code(page.hint))
    )
);

export const PageViewNoDeps = PageViewDef.make({
  head: ({ props, queries }) => [
    Head.title(
      AsyncResult.isSuccess(queries.config)
        ? (queries.config.value.pages.find((page) => page.id === props.id)
            ?.title ?? props.id)
        : props.id
    ),
  ],
  init: () => ({}),
  update: ($) => $.model,
  view: (h) =>
    AsyncResult.match(h.queries.config, {
      onFailure: () =>
        h.p.class("note").children("The studio's config did not load."),
      onInitial: () => h.p.class("note").children("Loading…"),
      onSuccess: ({ value: config }) => {
        const page = config.pages.find((entry) => entry.id === h.props.id);

        if (page === undefined) {
          return h.main
            .class("hub")
            .children(
              h.h1("No such page"),
              h.p.class("note").children(h.props.id)
            );
        }

        const kind = kindOf(page);

        return Match.value(kind).pipe(
          Match.when("tree", () =>
            FeatureTree(h, { key: page.id, props: { page } })
          ),
          Match.when("decisions", () =>
            Decisions(h, { key: page.id, props: { page } })
          ),
          Match.orElse(() => framed(h, page))
        );
      },
    }),
});

export const PageView = PageViewNoDeps.pipe(
  Component.provide([GetConfig.layer.pipe(Layer.provide(Studio.layerHttp))])
);
