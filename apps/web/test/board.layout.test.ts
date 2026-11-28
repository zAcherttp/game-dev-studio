import { expect, it } from "@effect/vitest";
import type { Variant } from "@gds/model";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  FIT_MIN_ZOOM,
  fit,
  layout,
  lineage,
  panTo,
  shownTakes,
  zoomAt,
} from "../src/client/board/layout.js";
import { fireFlags } from "./fixtures/fire-kit.js";

const ParentIndexes = Schema.Array(
  Schema.Int.check(Schema.isBetween({ maximum: 12, minimum: -1 }))
).check(Schema.isMinLength(1), Schema.isMaxLength(12));

const parentIndexes = Arbitrary.schema(ParentIndexes);

type VariantValue = typeof Variant.Type;

const variantsOf = (parents: readonly number[]) =>
  parents.map((parent, index) => {
    const variant = {
      generator: "test",
      id: `v${index}`,
      label: `v${index}`,
      layer: "layer",
      params: {},
    };

    return parent >= 0 && parent < index
      ? { ...variant, parent: `v${parent}` }
      : variant;
  });

it.prop(
  "a lineage places every variant once, each child one round right of its parent and never above it",
  { parents: parentIndexes },
  ({ parents }) => {
    const variants = variantsOf(parents);
    const { placed, rows } = lineage(variants);
    const byId = new Map(placed.map((entry) => [entry.variant.id, entry]));

    expect(placed).toHaveLength(variants.length);
    expect(byId.size).toBe(variants.length);

    for (const entry of placed) {
      expect(entry.row).toBeLessThan(rows);

      if (entry.variant.parent === undefined) {
        expect(entry.depth).toBe(0);
      } else {
        const parent = byId.get(entry.variant.parent);
        expect(entry.depth).toBe((parent?.depth ?? -2) + 1);
        expect(entry.row).toBeGreaterThanOrEqual(parent?.row ?? Infinity);
      }
    }
  }
);

it("the board draws every layer once, with its take count, and only the lineage and picked takes", () => {
  const graph = layout(fireFlags.studio, fireFlags.assets);
  const asset = fireFlags.assets[0]?.asset;

  const layerNodes = graph.nodes.filter((node) => node.kind === "layer");

  const shown = Object.entries(asset?.layers ?? {}).flatMap(([id, layer]) =>
    shownTakes(layer.variants, asset?.mix[id])
  );

  expect(layerNodes).toHaveLength(fireFlags.assets[0]?.layers.length ?? -1);

  for (const node of layerNodes) {
    expect(node.count).toBe(asset?.layers[node.layer.id]?.variants.length ?? 0);
  }

  expect(graph.nodes.filter((node) => node.kind === "variant")).toHaveLength(
    shown.length
  );
  expect(
    graph.edges
      .filter((edge) => edge.kind === "pick")
      .map((edge) => edge.from)
      .toSorted()
  ).toEqual(
    Object.entries(asset?.mix ?? {})
      .map(([layer, variant]) => `variant:fire/${layer}/${variant}`)
      .toSorted()
  );
});

it.prop(
  "shown takes keep the pick and every take with a parent, with each one's ancestors, and nothing else",
  { parents: parentIndexes },
  ({ parents }) => {
    const variants: readonly VariantValue[] = variantsOf(parents);
    const picked = variants.at(-1)?.id;
    const shown = shownTakes(variants, picked);
    const ids = new Set(shown.map((variant) => variant.id));

    expect(picked === undefined || ids.has(picked)).toBe(true);

    for (const variant of variants) {
      if (variant.parent !== undefined) {
        expect(ids.has(variant.id)).toBe(true);
      }
    }

    for (const variant of shown) {
      expect(variant.parent === undefined || ids.has(variant.parent)).toBe(
        true
      );
      expect(
        variant.id === picked ||
          variant.parent !== undefined ||
          shown.some((child) => child.parent === variant.id)
      ).toBe(true);
    }
  }
);

it.prop(
  "a liked take stays on the board with its ancestors, whatever the lineage",
  {
    liked: Schema.Int.check(Schema.isBetween({ maximum: 11, minimum: 0 })),
    parents: parentIndexes,
  },
  ({ liked, parents }) => {
    const variants: readonly VariantValue[] = variantsOf(parents);
    const target = variants[liked % variants.length];

    const shown = new Map(
      shownTakes(
        variants,
        undefined,
        target === undefined ? [] : [target.id]
      ).map((variant) => [variant.id, variant])
    );

    const chain = (
      id: string | undefined,
      seen: readonly string[]
    ): readonly string[] => {
      const found = variants.find((variant) => variant.id === id);

      return found === undefined || seen.includes(found.id)
        ? seen
        : chain(found.parent, [...seen, found.id]);
    };

    const kept = chain(target?.id, []);

    expect(kept.length > 0).toBe(target !== undefined);

    for (const id of kept) {
      expect(shown.has(id)).toBe(true);
    }
  }
);

it("a story block sits on its own row above the asset's layers, wired from the asset", () => {
  const [entry] = fireFlags.assets;

  expect(entry).toBeDefined();

  if (entry === undefined) {
    return;
  }

  const story = {
    at: "2026-11-28T00:00:00.000Z",
    by: "phat",
    references: [],
    rules: [],
    title: "Fire",
    version: 2,
    words: "A slow lick of flame.",
  };

  const plain = layout(fireFlags.studio, [entry]);

  const told = layout(fireFlags.studio, [
    {
      ...entry,
      asset: { ...entry.asset, story: [{ ...story, version: 1 }, story] },
    },
  ]);

  const storyNodes = told.nodes.filter((node) => node.kind === "story");
  const layers = told.nodes.filter((node) => node.kind === "layer");

  expect(storyNodes).toMatchObject([
    { id: "story:fire", story: { version: 2 } },
  ]);
  expect(told.height - plain.height).toBe(148);
  expect(layers.every((node) => node.y > (storyNodes[0]?.y ?? Infinity))).toBe(
    true
  );
  expect(
    told.edges.some((edge) => edge.id === "structure:asset:fire->story:fire")
  ).toBe(true);
});

it("node ids stay unique when layers reuse take letters, as EasyVFX kits do", () => {
  const lettered = fireFlags.assets.map((entry) => ({
    ...entry,
    asset: {
      ...entry.asset,
      layers: Object.fromEntries(
        Object.entries(entry.asset.layers).map(([id, layer]) => [
          id,
          {
            ...layer,
            variants: layer.variants.map(({ parent, ...variant }) => {
              const byLetter = { ...variant, id: variant.label };

              return parent === undefined
                ? byLetter
                : { ...byLetter, parent: parent.split("-").at(-1) ?? parent };
            }),
          },
        ])
      ),
    },
  }));

  const ids = layout(fireFlags.studio, lettered).nodes.map((node) => node.id);

  expect(new Set(ids).size).toBe(ids.length);
});

it("fit frames the board above a readable zoom floor, keeps the start in view when it can't, and panning centres a node", () => {
  const graph = layout(fireFlags.studio, fireFlags.assets);

  for (const board of [graph, { height: 40_000, width: 3000 }]) {
    for (const viewport of [
      { height: 720, width: 1280 },
      { height: 600, width: 800 },
    ]) {
      const camera = fit(board, viewport);

      expect(camera.zoom).toBeGreaterThanOrEqual(FIT_MIN_ZOOM);
      expect(camera.x).toBeGreaterThanOrEqual(0);
      expect(camera.y).toBeGreaterThanOrEqual(0);

      if (board.width * camera.zoom + 96 <= viewport.width) {
        expect(camera.x * 2 + board.width * camera.zoom).toBeCloseTo(
          viewport.width
        );
      }
    }
  }

  const node = graph.nodes.at(-1);
  const viewport = { height: 600, width: 800 };

  if (node !== undefined) {
    const centred = panTo({ x: 0, y: 0, zoom: 0.2 }, node, viewport);

    expect((node.x + node.width / 2) * centred.zoom + centred.x).toBeCloseTo(
      400
    );
    expect((node.y + node.height / 2) * centred.zoom + centred.y).toBeCloseTo(
      300
    );
    expect(centred.zoom).toBe(FIT_MIN_ZOOM);
  }

  const camera = { x: 30, y: -40, zoom: 0.8 };
  const at = { x: 400, y: 300 };
  const zoomed = zoomAt(camera, 1.5, at);

  const before = {
    x: (at.x - camera.x) / camera.zoom,
    y: (at.y - camera.y) / camera.zoom,
  };

  const after = {
    x: (at.x - zoomed.x) / zoomed.zoom,
    y: (at.y - zoomed.y) / zoomed.zoom,
  };

  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
});
