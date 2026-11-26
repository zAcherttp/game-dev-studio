import { foldkit } from "@foldkit/vite-plugin";
import { defineConfig } from "vite";

import { stylexPlugin } from "./stylex.js";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@foldkit/devtools", "@foldkit/ui", "foldkit/devtools-host"],
  },
  plugins: [
    stylexPlugin(),
    foldkit({
      ssr: {
        build: { prerender: true },
        clientEntry: "/src/client/entry.ts",
        serverEntry: "/src/entry.server.ts",
      },
    }),
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
});
