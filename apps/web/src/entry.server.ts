import { Effect } from "effect";
import * as Server from "foldkit/experimental/server";

import { Flags, initialModel } from "./client/board/model.js";
import { view } from "./features/board/index.js";
import { loadBoardFlags } from "./server/board-flags.js";

export const prerenderPaths: readonly string[] = [];

export const renderDocument: Server.DocumentRenderer = (application, assets) =>
  Server.renderDocument(application, assets);

const PICKER = "Phát";

const studioOf = (pathname: string) => {
  const match = /^\/(?:studio\/(?<id>[\w-]+)\/?)?$/u.exec(pathname);

  return match === null ? undefined : { id: match.groups?.id };
};

const renderBoard = Effect.fn("web.renderBoard")(function* renderBoard(
  request: Request
) {
  const route = studioOf(new URL(request.url).pathname);

  if (route === undefined) {
    return Server.Responded(new Response("Not found", { status: 404 }));
  }

  const flags = yield* loadBoardFlags(route.id, PICKER);

  const application = yield* Server.renderToString(
    {
      Flags,
      init: (initial) => ({ model: initialModel(initial) }),
      view,
    },
    { flags }
  );

  return Server.Rendered(application);
});

const unavailablePage = (message: string) =>
  Server.Responded(
    new Response(message, {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 503,
    })
  );

export const renderPage = (request: Request) =>
  Effect.runPromise(
    renderBoard(request).pipe(
      Effect.catchTag("BoardUnavailable", (failure) =>
        Effect.succeed(unavailablePage(failure.message))
      )
    )
  );
