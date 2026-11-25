import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Asset,
  NotBuilt,
  StudioDef,
  contracts,
  notBuilt,
} from "../src/index.js";

const AssetFile = Schema.fromJsonString(Asset);

describe("model", () => {
  it.prop(
    "an asset file decodes and re-encodes to the same text, so a store rewrite never churns it",
    { asset: Arbitrary.schema(Asset) },
    ({ asset }) => {
      const text = Schema.encodeSync(AssetFile)(asset);
      const decoded = Schema.decodeSync(AssetFile)(text);

      expect(Schema.encodeSync(AssetFile)(decoded)).toBe(text);
      expect(Object.keys(decoded.layers)).toEqual(Object.keys(asset.layers));
    }
  );

  it("decodes an asset file written before layers kept rounds", () => {
    const asset = Schema.decodeSync(AssetFile)(
      JSON.stringify({
        id: "fire",
        layers: { core: { picks: [], variants: [] } },
        mix: {},
        studio: "vfx",
        title: "Fire",
      })
    );

    expect(asset.layers.core).toEqual({ picks: [], variants: [] });
  });

  it("decodes a studio definition and refuses an unknown render kind", () => {
    const studio = {
      gates: ["budget"],
      id: "vfx",
      layers: [{ id: "core", order: 0, renderKind: "gif", title: "Core" }],
      pack: { files: [{ path: "docs/vfx.md", why: "Kit rules" }] },
      renderKinds: ["gif"],
      renderer: "roblox",
      title: "VFX",
    };

    expect(Schema.decodeUnknownSync(StudioDef)(studio).id).toBe("vfx");
    expect(() =>
      Schema.decodeUnknownSync(StudioDef)({ ...studio, renderKinds: ["smell"] })
    ).toThrow();
  });

  it("names eight distinct contracts and lets each one fail as not built", () => {
    expect(new Set(contracts.map((contract) => contract.name)).size).toBe(8);

    for (const contract of contracts) {
      const encoded = Schema.encodeUnknownSync(contract.failure)(
        notBuilt(contract.name)
      );

      expect(Schema.decodeUnknownSync(NotBuilt)(encoded).capability).toBe(
        contract.name
      );
    }
  });
});
