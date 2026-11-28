import { Component, Head } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Layer, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import { GetConfig } from "../client/queries/get-config.ts";
import { ListStudios } from "../client/queries/list-studios.ts";
import { failureText, Studio } from "../client/studio.ts";
import { pageHref } from "../routes.ts";

export const HubNoDeps = Html.component({
  message: Schema.Never,
  model: Schema.Struct({}),
  name: "Hub",
  queries: {
    config: { args: () => ({}), query: GetConfig },
    studios: { args: () => ({}), query: ListStudios },
  },
}).make({
  head: () => [Head.title("Dev studio")],
  init: () => ({}),
  update: ($) => $.model,
  view: (h) =>
    h.main.class("hub").children(
      h.h1("Dev studio"),
      h.p
        .class("lede")
        .children("Studios to pick in, and the game's own pages beside them."),
      h.h2("Studios"),
      AsyncResult.match(h.queries.studios, {
        onFailure: ({ cause }) =>
          h.p.class("note").children(failureText(cause)),
        onInitial: () => h.p.class("note").children("Loading studios…"),
        onSuccess: ({ value: studios }) => {
          const board = AsyncResult.isSuccess(h.queries.config)
            ? h.queries.config.value.boardUrl
            : "";

          return h.ul
            .class("cards")
            .children(
              studios.map((studio) =>
                h.li
                  .key(studio.id)
                  .children(
                    h.a
                      .attr("href", `${board}/studio/${studio.id}`)
                      .children(studio.title)
                  )
              )
            );
        },
      }),
      h.h2("Pages"),
      AsyncResult.match(h.queries.config, {
        onFailure: () =>
          h.p.class("note").children("The studio's config did not load."),
        onInitial: () => h.p.class("note").children("Loading pages…"),
        onSuccess: ({ value: config }) =>
          config.pages.length === 0
            ? h.p
                .class("note")
                .children(
                  "No pages. The game lists them in tools/devstudio/pages.json."
                )
            : h.ul
                .class("cards")
                .children(
                  config.pages.map((page) =>
                    h.li
                      .key(page.id)
                      .children(
                        h.a.attr("href", pageHref(page.id)).children(page.title)
                      )
                  )
                ),
      })
    ),
});

export const Hub = HubNoDeps.pipe(
  Component.provide([
    GetConfig.layer.pipe(Layer.provide(Studio.layerHttp)),
    ListStudios.layer.pipe(Layer.provide(Studio.layerHttp)),
  ])
);
