import { expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import { escapeHtml, hubHtml, pageHtml } from "../src/server/hub.js";
import { decodePages } from "../src/server/pages.js";

const pages = [
  {
    hint: "scripts/decisions.py serve --no-open",
    id: "decisions",
    title: "Decisions",
    url: "http://127.0.0.1:34880",
  },
  { id: "mindmap", title: "Mind map", url: "https://example.test/map.html" },
];

it.effect("GDS_PAGES decodes a list of pages", () =>
  Effect.gen(function* decodes() {
    const decoded = yield* decodePages(JSON.stringify(pages));

    expect(decoded.map((page) => page.id)).toStrictEqual([
      "decisions",
      "mindmap",
    ]);
  })
);

it.effect("GDS_PAGES that is not a list of pages fails with a fix", () =>
  Effect.gen(function* fails() {
    const exit = yield* Effect.exit(decodePages('[{"id":"a b","title":1}]'));

    expect(Exit.isFailure(exit)).toBe(true);
  })
);

it("the hub links every studio and every page", () => {
  const html = hubHtml(
    { note: "", studios: [{ id: "vfx", title: "VFX" }] },
    pages
  );

  expect(html).toContain('href="/studio/vfx"');
  expect(html).toContain('href="/page/decisions"');
  expect(html).toContain('href="/page/mindmap"');
});

it("the hub says why studios are missing when the server is down", () => {
  const html = hubHtml(
    { note: "The dev studio server did not answer.", studios: [] },
    []
  );

  expect(html).toContain("did not answer");
  expect(html).toContain("tools/devstudio/pages.json");
});

it("a page opens framed, marked current, with its hint", () => {
  const [decisions] = pages;
  const html = decisions === undefined ? "" : pageHtml(decisions, pages);

  expect(html).toContain('<iframe src="http://127.0.0.1:34880"');
  expect(html).toContain('href="/page/decisions" aria-current="page"');
  expect(html).toContain("scripts/decisions.py serve --no-open");
});

it("titles and urls are escaped", () => {
  expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
    "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
  );
});
