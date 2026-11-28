import { Route } from "@effect/ui";
import { Schema } from "effect";

export const AppRoute = Route.union({
  Hub: Route.make("/"),
  NotFound: Route.make("/*"),
  Page: Route.make("/page/:id", { params: { id: Schema.String } }),
});

export type AppRouteValue = typeof AppRoute.Type;

export const pageHref = (id: string) =>
  AppRoute.print(AppRoute.Page({ params: { id } }));
