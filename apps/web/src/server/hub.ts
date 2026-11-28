import { toRpcGroup } from "@gds/capability/rpc-group";
import { listStudiosContract } from "@gds/model";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

import { studioUrl } from "./board-flags.js";
import type { PageValue } from "./pages.js";

export interface StudioLink {
  readonly id: string;
  readonly title: string;
}

export interface StudioListing {
  readonly note: string;
  readonly studios: readonly StudioLink[];
}

const studiosGroup = toRpcGroup([listStudiosContract]).group;

export const loadStudioLinks = Effect.fn("web.loadStudioLinks")(
  function* loadStudioLinks() {
    const url = yield* studioUrl;

    return yield* Effect.gen(function* load() {
      const client = yield* RpcClient.make(studiosGroup);
      const { studios } = yield* client.listStudios({});

      const listing: StudioListing = {
        note: "",
        studios: studios.map((studio) => ({
          id: studio.id,
          title: studio.title,
        })),
      };

      return listing;
    }).pipe(
      Effect.scoped,
      Effect.provide(
        RpcClient.layerProtocolHttp({ url: new URL("/rpc", url).href }).pipe(
          Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson])
        )
      ),
      Effect.orElseSucceed((): StudioListing => ({
        note: `The dev studio server at ${url.origin} did not answer, so no studios are listed. Fix: run scripts/devstudio.sh serve from the game.`,
        studios: [],
      }))
    );
  }
);

const ESCAPES = new Map([
  ['"', "&quot;"],
  ["&", "&amp;"],
  ["'", "&#39;"],
  ["<", "&lt;"],
  [">", "&gt;"],
]);

export const escapeHtml = (text: string) =>
  text.replaceAll(/["&'<>]/gu, (char) => ESCAPES.get(char) ?? char);

const STYLE = `
:root { color-scheme: dark; --bg: #0b0d12; --panel: #141821; --line: #262c38; --text: #e6e9ef; --dim: #8a93a6; --accent: #ffb547; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif; }
nav.bar { display: flex; gap: 4px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); background: var(--panel); flex-wrap: wrap; }
nav.bar a { color: var(--dim); text-decoration: none; padding: 4px 10px; border-radius: 999px; }
nav.bar a:hover { color: var(--text); background: var(--line); }
nav.bar a[aria-current="page"] { color: var(--bg); background: var(--accent); }
nav.bar .home { color: var(--text); font-weight: 600; margin-right: 8px; }
main.hub { max-width: 720px; margin: 0 auto; padding: 32px 16px; }
main.hub h1 { margin: 0 0 4px; font-size: 22px; }
main.hub p { color: var(--dim); margin: 0 0 24px; }
main.hub h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); margin: 24px 0 8px; }
main.hub ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
main.hub li a { display: block; padding: 12px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; color: var(--text); text-decoration: none; }
main.hub li a:hover { border-color: var(--accent); }
main.hub .note { color: var(--dim); }
.framed { display: flex; flex-direction: column; height: 100vh; }
.framed iframe { flex: 1; width: 100%; border: 0; background: var(--bg); }
.framed .hint { padding: 6px 12px; color: var(--dim); border-top: 1px solid var(--line); font-size: 12px; }
.framed .hint code { color: var(--text); }
`;

const document = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;

const bar = (pages: readonly PageValue[], current = "") =>
  `<nav class="bar" aria-label="Dev studio"><a class="home" href="/">Dev studio</a>${pages
    .map(
      (page) =>
        `<a href="/page/${escapeHtml(page.id)}"${page.id === current ? ' aria-current="page"' : ""}>${escapeHtml(page.title)}</a>`
    )
    .join("")}</nav>`;

export const hubHtml = (
  listing: StudioListing,
  pages: readonly PageValue[]
) => {
  const note =
    listing.note === ""
      ? ""
      : `<p class="note">${escapeHtml(listing.note)}</p>`;

  const studioList =
    listing.studios.length === 0
      ? note
      : `<ul>${listing.studios
          .map(
            (studio) =>
              `<li><a href="/studio/${escapeHtml(studio.id)}">${escapeHtml(studio.title)}</a></li>`
          )
          .join("")}</ul>`;

  const pageList =
    pages.length === 0
      ? `<p class="note">No pages. The game lists them in tools/devstudio/pages.json, passed in as GDS_PAGES.</p>`
      : `<ul>${pages
          .map(
            (page) =>
              `<li><a href="/page/${escapeHtml(page.id)}">${escapeHtml(page.title)}</a></li>`
          )
          .join("")}</ul>`;

  return document(
    "Dev studio",
    `${bar(pages)}<main class="hub"><h1>Dev studio</h1><p>Studios to pick in, and the game's own pages beside them.</p><h2>Studios</h2>${studioList}<h2>Pages</h2>${pageList}</main>`
  );
};

export const pageHtml = (page: PageValue, pages: readonly PageValue[]) =>
  document(
    `${page.title} · Dev studio`,
    `<div class="framed">${bar(pages, page.id)}<iframe src="${escapeHtml(page.url)}" title="${escapeHtml(page.title)}"></iframe>${
      page.hint === undefined
        ? ""
        : `<div class="hint">Not loading? Run <code>${escapeHtml(page.hint)}</code></div>`
    }</div>`
  );
