import { Component, Head, Router, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Layer, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import { GetConfig } from "../client/queries/get-config.ts";
import { Studio } from "../client/studio.ts";
import type { AppRouteValue } from "../routes.ts";
import { AppRoute, pageHref } from "../routes.ts";
import { Hub } from "./hub.ts";
import { PageView } from "./page-view.ts";

export const AppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute },
});

const currentPage = (route: AppRouteValue) =>
  AppRoute.match(route, {
    Hub: () => "",
    NotFound: () => "",
    Page: ({ params }) => params.id,
  });

export const AppNoDeps = Html.component({
  message: AppMessage,
  model: Schema.Struct({ route: AppRoute }),
  name: "App",
  props: Schema.Struct({ route: AppRoute }),
  queries: { config: { args: () => ({}), query: GetConfig } },
}).make({
  head: () => [Head.title("Dev studio")],
  init: ($) => ({ route: $.props.route }),
  subscriptions: ({ model }) => [
    Router.subscription(AppRoute, model.route, (route) =>
      AppMessage.ChangedRoute({ route })
    ),
  ],
  update: ($, message) =>
    AppMessage.match(message, {
      ChangedRoute: ({ route }) => $.evolve({ route }),
    }),
  view: (h, model) =>
    h.div.class("shell").children(
      h.nav
        .class("bar")
        .attr("aria-label", "Dev studio")
        .children(
          h.a.class("home").attr("href", "/").children("Dev studio"),
          AsyncResult.isSuccess(h.queries.config)
            ? h.queries.config.value.pages.map((page) =>
                h.a
                  .key(page.id)
                  .attr("href", pageHref(page.id))
                  .attr(
                    "aria-current",
                    currentPage(model.route) === page.id ? "page" : "false"
                  )
                  .children(page.title)
              )
            : []
        ),
      AppRoute.match(model.route, {
        Hub: () => Hub(h, {}),
        NotFound: () =>
          h.main
            .class("hub")
            .children(
              h.h1("Not found"),
              h.a.attr("href", "/").children("Back to the hub")
            ),
        Page: ({ params }) =>
          PageView(h, { key: params.id, props: { id: params.id } }),
      })
    ),
});

export const App = AppNoDeps.pipe(
  Component.provide([GetConfig.layer.pipe(Layer.provide(Studio.layerHttp))])
);
