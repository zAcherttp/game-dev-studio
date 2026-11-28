import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  Asset,
  GateDef,
  NotBuilt,
  Render,
  StudioDef,
  blocksPick,
  contracts,
  gateResult,
  gateUnread,
  judge,
  notBuilt,
  rendererOf,
} from "../src/index.js";
import combatGates from "./fixtures/combat-gates.json" with { type: "json" };
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

  it("a playable render with a launch, a replay video and a frame strip decodes and re-encodes to the same text", () => {
    const RenderFile = Schema.fromJsonString(Render);

    const text = JSON.stringify({
      kind: "playable",
      launch: {
        args: ["--take", "t1", "--replay", "first.rec.json"],
        command: "stage",
        cwd: "tools/stage",
      },
      ms: 4200,
      numbers: "cache/combat/flow/t1/first.frames.json",
      path: "cache/combat/flow/t1/first.mp4",
      views: [{ camera: "side", path: "cache/combat/flow/t1/first.mp4" }],
    });

    expect(
      Schema.encodeSync(RenderFile)(Schema.decodeSync(RenderFile)(text))
    ).toBe(text);
  });

  it("refuses a playable render without a launch, and a launch on any other kind", () => {
    const launch = { args: [], command: "stage" };

    expect(() =>
      Schema.decodeUnknownSync(Render)({ kind: "playable", ms: 0, path: "" })
    ).toThrow("carries a launch");
    expect(() =>
      Schema.decodeUnknownSync(Render)({ kind: "gif", launch, ms: 0, path: "" })
    ).toThrow("carries a launch");
  });

  it("decodes the combat frame gates as readings, which carry no pass rule", () => {
    const gates = Schema.decodeUnknownSync(Schema.Array(GateDef))(combatGates);

    expect(gates.length).toBeGreaterThan(0);
    expect(gates.every((gate) => gate.pass === undefined)).toBe(true);
  });

  it.prop(
    "a reading never blocks a pick, read or unread; a pass gate blocks exactly when its rule fails",
    { note: Schema.String, value: Schema.Json },
    ({ note, value }) => {
      const [reading] = Schema.decodeUnknownSync(Schema.Array(GateDef))(
        combatGates
      );

      const [audit] = Schema.decodeUnknownSync(Schema.Array(GateDef))(vfxGates);

      if (reading === undefined || audit?.pass === undefined) {
        throw new Error("fixtures lost their gates");
      }

      expect(blocksPick(gateResult(reading, value))).toBe(false);
      expect(blocksPick(gateUnread(reading, note))).toBe(false);
      expect(blocksPick(gateResult(audit, value))).toBe(
        !judge(audit.pass, value)
      );
      expect(blocksPick(gateUnread(audit, note))).toBe(true);
    }
  );

  it("names every contract distinctly and lets each one fail as not built", () => {
    expect(new Set(contracts.map((contract) => contract.name)).size).toBe(
      contracts.length
    );

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
