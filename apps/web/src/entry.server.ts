import { Effect } from "effect";
import * as Server from "foldkit/experimental/server";

import { initialModel } from "./client/motion/model.js";
import { view } from "./features/home/index.js";

export const prerenderPaths = ["/"];

export const renderDocument: Server.DocumentRenderer = (application, assets) =>
  Server.renderDocument(application, assets);

const renderHome = Effect.fn("web.renderHome")(function* renderHome(
  request: Request
) {
  const { pathname } = new URL(request.url);

  if (pathname !== "/") {
    return Server.Responded(new Response("Not found", { status: 404 }));
  }

  const application = yield* Server.renderToString({
    init: () => ({ model: initialModel }),
    view,
  });

  return Server.Rendered(application);
});

export const renderPage = (request: Request) =>
  Effect.runPromise(renderHome(request));
