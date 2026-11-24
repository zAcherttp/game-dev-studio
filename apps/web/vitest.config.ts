import { defineConfig } from "vitest/config";

import { stylexRenderingPlugin } from "./stylex.js";

export default defineConfig({
  plugins: [stylexRenderingPlugin()],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
