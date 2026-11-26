import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: [
    {
      name: "gds-debt",
      specifier: "./oxlint-plugin-debt-ledger.ts",
    },
  ],
  rules: { "gds-debt/debt-ledger": "error" },
});
