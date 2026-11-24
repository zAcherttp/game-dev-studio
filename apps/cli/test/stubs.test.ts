import { expect, it } from "@effect/vitest";
import { invokerFor } from "@gds/capability";
import { NotBuilt, contracts } from "@gds/model";
import { Effect, Schema } from "effect";

import { stubCapabilities } from "../src/stubs.js";

const sampleInputs = {
  addVariants: { asset: "a", layer: "l", studio: "s", variants: [] },
  getAsset: { asset: "a", studio: "s" },
  getPack: { studio: "s" },
  listStudios: {},
  openCheck: { asset: "a", studio: "s" },
  pick: {
    asset: "a",
    by: "b",
    layer: "l",
    note: "",
    studio: "s",
    variant: "v",
  },
  render: { asset: "a", layer: "l", studio: "s", variant: "v" },
  round: { asset: "a", axis: "colour", layer: "l", note: "", studio: "s" },
} as const;

it("stubs every model contract exactly once", () => {
  expect(stubCapabilities.map((capability) => capability.contract)).toEqual([
    ...contracts,
  ]);
});

it.effect(
  "every stub decodes its input and fails with a not-built error its failure schema encodes",
  () =>
    Effect.gen(function* failsNotBuilt() {
      const invoke = yield* invokerFor(stubCapabilities);

      for (const [name, input] of Object.entries(sampleInputs)) {
        const outcome = yield* invoke(name, input);

        expect(outcome.ok).toBe(false);

        const error = yield* Schema.decodeUnknownEffect(NotBuilt)(
          outcome.ok ? undefined : outcome.error
        );

        expect(error.capability).toBe(name);
      }
    })
);

it("declares only the reads read-only and idempotent", () => {
  for (const capability of stubCapabilities) {
    const reads = ["listStudios", "getAsset", "getPack"].includes(
      capability.contract.name
    );

    expect(capability.contract.annotations.readOnly).toBe(reads);
    expect(capability.contract.annotations.idempotent).toBe(
      reads || capability.contract.name === "render"
    );
  }
});
