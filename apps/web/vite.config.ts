import { foldkit } from "@foldkit/vite-plugin";
import { defineConfig, searchForWorkspaceRoot } from "vite";

import { stylexPlugin } from "./stylex.js";

const studioUrl = process.env.GDS_STUDIO_URL ?? "http://127.0.0.1:4310";

const DEV_BUILD_ID = "dev-studio-dev";

const foldkitOptions = {
  ssr: {
    build: { prerender: true },
    clientEntry: "/src/client/entry.ts",
    serverEntry: "/src/entry.server.ts",
  },
};

export default defineConfig(({ command }) => ({
  optimizeDeps: {
    exclude: ["@foldkit/devtools", "@foldkit/ui", "foldkit/devtools-host"],
  },
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        ...(process.env.GDS_GAME === undefined ? [] : [process.env.GDS_GAME]),
      ],
    },
    proxy: { "/rpc": { changeOrigin: true, target: studioUrl } },
  },
  plugins: [
    stylexPlugin(),
    foldkit(
      command === "serve"
        ? { ...foldkitOptions, buildId: DEV_BUILD_ID }
        : foldkitOptions
    ),
    {
      configResolved: (config) => {
        if (config.optimizeDeps.include !== undefined) {
          config.optimizeDeps.include = config.optimizeDeps.include.filter(
            (specifier) =>
              specifier !== "@foldkit/devtools/vite" &&
              specifier !== "foldkit/devtools-host"
          );
        }
      },
      name: "foldkit-devtools-single-instance",
    },
  ],
}));
