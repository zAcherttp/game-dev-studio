import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Asset,
  GateDef,
  NotBuilt,
  StudioDef,
  contracts,
  notBuilt,
  rendererOf,
} from "../src/index.js";
import vfxGates from "./fixtures/vfx-gates.json" with { type: "json" };

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
      gates: vfxGates,
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

  it("a VFX studio file without the world keys decodes and re-encodes unchanged", () => {
    const StudioFile = Schema.fromJsonString(StudioDef);

    const text = JSON.stringify({
      check: "roblox.vfxlab",
      gates: vfxGates,
      id: "vfx",
      layers: [{ id: "flash", order: 1, renderKind: "gif", title: "Flash" }],
      pack: { files: [] },
      renderKinds: ["gif", "image"],
      renderer: "roblox.evfx",
      sync: { beat: "contact" },
      title: "VFX",
    });

    const studio = Schema.decodeSync(StudioFile)(text);

    expect(JSON.parse(Schema.encodeSync(StudioFile)(studio))).toEqual(
      JSON.parse(text)
    );
    expect(rendererOf(studio, "flash")).toBe("roblox.evfx");
  });

  it("a layer's renderer overrides the studio's for that layer only", () => {
    const studio = Schema.decodeSync(StudioDef)({
      gates: [],
      id: "world",
      layers: [
        { id: "massing", order: 0, renderKind: "image", title: "Massing" },
        {
          id: "pieces",
          order: 1,
          renderKind: "image",
          renderer: "command:refloop",
          title: "Pieces",
        },
      ],
      pack: { files: [] },
      renderKinds: ["image"],
      renderer: "roblox.plan",
      title: "World",
    });

    expect(rendererOf(studio, "pieces")).toBe("command:refloop");
    expect(rendererOf(studio, "massing")).toBe("roblox.plan");
    expect(rendererOf(studio, "unlisted")).toBe("roblox.plan");
  });

  it("decodes the VFX gates as data and refuses a gate with an unknown op", () => {
    const gates = Schema.decodeUnknownSync(Schema.Array(GateDef))(vfxGates);
    const [audit] = gates;

    expect(gates.map((gate) => gate.id)).toEqual([
      "easyvfx.audit",
      "easyvfx.beats",
    ]);
    expect(() =>
      Schema.decodeUnknownSync(GateDef)({
        ...audit,
        pass: { op: "near", value: 0 },
      })
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(GateDef)({
        ...audit,
        pass: { op: "lt", value: "0" },
      })
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(StudioDef)({
        gates: ["easyvfx.audit"],
        id: "vfx",
        layers: [],
        pack: { files: [] },
        renderKinds: ["gif"],
        renderer: "roblox.evfx",
        title: "VFX",
      })
    ).toThrow();
  });

  it("names eleven distinct contracts and lets each one fail as not built", () => {
    expect(new Set(contracts.map((contract) => contract.name)).size).toBe(11);

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
