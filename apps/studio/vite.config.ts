import { Schema } from "effect";
import type { Plugin, ProxyOptions } from "vite";
import { defineConfig } from "vite";

import type { PageValue } from "./src/domain/page.ts";
import { Page } from "./src/domain/page.ts";

const studioUrl = process.env.GDS_STUDIO_URL ?? "http://127.0.0.1:4310";

const boardUrl = process.env.GDS_BOARD_URL ?? "";

const pages = Schema.decodeSync(Schema.fromJsonString(Schema.Array(Page)))(
  process.env.GDS_PAGES ?? "[]"
);

const hosted = (page: PageValue): [string, ProxyOptions] => {
  const target = new URL(page.url);
  const prefix = `/pages/${page.id}`;
  const base = target.pathname.replace(/\/$/u, "");

  return [
    prefix,
    {
      changeOrigin: true,
      headers: { origin: target.origin },
      rewrite: (path) => `${base}${path.slice(prefix.length)}`,
      target: target.origin,
    },
  ];
};

const config: Plugin = {
  configureServer: (server) => {
    server.middlewares.use("/gds/config.json", (_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ boardUrl, pages }));
    });
  },
  name: "gds-config",
};

export default defineConfig({
  plugins: [config],
  server: {
    proxy: {
      "/rpc": { changeOrigin: true, target: studioUrl },
      ...Object.fromEntries(
        pages.filter((page) => (page.kind ?? "frame") !== "frame").map(hosted)
      ),
    },
  },
});
