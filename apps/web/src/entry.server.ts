import { Effect } from "effect";
import * as Server from "foldkit/experimental/server";

import { fireFlags } from "../test/fixtures/fire-kit.js";
import { Flags, initialModel } from "./client/board/model.js";
import { view } from "./features/board/index.js";

export const prerenderPaths = ["/"];

export const renderDocument: Server.DocumentRenderer = (application, assets) =>
  Server.renderDocument(application, assets);

const renderBoard = Effect.fn("web.renderBoard")(function* renderBoard(
  request: Request
) {
  const { pathname } = new URL(request.url);

  if (pathname !== "/") {
    return Server.Responded(new Response("Not found", { status: 404 }));
  }

  const application = yield* Server.renderToString(
    {
      Flags,
      init: (flags) => ({ model: initialModel(flags) }),
      view,
    },
    { flags: fireFlags }
  );

  return Server.Rendered(application);
});

export const renderPage = (request: Request) =>
  Effect.runPromise(renderBoard(request));
