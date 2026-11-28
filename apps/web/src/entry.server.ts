import { Effect } from "effect";
import * as Server from "foldkit/experimental/server";

import { Flags, initialModel } from "./client/board/model.js";
import { view } from "./features/board/index.js";
import { loadBoardFlags } from "./server/board-flags.js";
import { hubHtml, loadStudioLinks, pageHtml } from "./server/hub.js";
import { loadPages } from "./server/pages.js";

export const prerenderPaths: readonly string[] = [];

export const renderDocument: Server.DocumentRenderer = (application, assets) =>
  Server.renderDocument(application, assets);

const PICKER = "Phát";

const studioOf = (pathname: string) => {
  const match = /^\/studio\/(?<id>[\w-]+)(?:\/(?<asset>[\w.-]+))?\/?$/u.exec(
    pathname
  );

  return match === null
    ? undefined
    : { asset: match.groups?.asset, id: match.groups?.id };
};

const htmlPage = (html: string, status = 200) =>
  Server.Responded(
    new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
      status,
    })
  );

const pageIdOf = (pathname: string) =>
  /^\/page\/(?<id>[\w-]+)\/?$/u.exec(pathname)?.groups?.id;

const renderHub = Effect.fn("web.renderHub")(function* renderHub() {
  const pages = yield* loadPages();
  const studios = yield* loadStudioLinks();

  return htmlPage(hubHtml(studios, pages));
});

const renderFramedPage = Effect.fn("web.renderFramedPage")(
  function* renderFramedPage(id: string) {
    const pages = yield* loadPages();
    const page = pages.find((entry) => entry.id === id);

    return page === undefined
      ? Server.Responded(new Response("Not found", { status: 404 }))
      : htmlPage(pageHtml(page, pages));
  }
);

const renderBoard = Effect.fn("web.renderBoard")(function* renderBoard(
  request: Request
) {
  const { pathname } = new URL(request.url);

  if (pathname === "/") {
    return yield* renderHub();
  }

  const pageId = pageIdOf(pathname);

  if (pageId !== undefined) {
    return yield* renderFramedPage(pageId);
  }

  const route = studioOf(pathname);

  if (route === undefined) {
    return Server.Responded(new Response("Not found", { status: 404 }));
  }

  const flags = yield* loadBoardFlags(route.id, route.asset, PICKER);

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
      Effect.catchTags({
        BoardUnavailable: (failure) =>
          Effect.succeed(unavailablePage(failure.message)),
        PagesInvalid: (failure) =>
          Effect.succeed(unavailablePage(failure.message)),
      })
    )
  );
