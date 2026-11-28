import { Router } from "@effect/ui";
import { BrowserHost, BrowserRouter } from "@effect/ui/html";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { App } from "../features/app.ts";
import { AppRoute } from "../routes.ts";

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import "../styles.css";

const root = document.querySelector("#root");

if (root !== null) {
  const main = BrowserHost.mount(App, Router.props(AppRoute), root).pipe(
    Layer.provide([
      BrowserRouter.layer({ routes: AppRoute }),
      FetchHttpClient.layer,
    ])
  );

  Layer.launch(main).pipe(Effect.runFork);
}
