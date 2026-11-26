import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { fit, layout, lineage, zoomAt } from "../src/client/board/layout.js";
import { fireFlags } from "./fixtures/fire-kit.js";

const ParentIndexes = Schema.Array(
  Schema.Int.check(Schema.isBetween({ maximum: 12, minimum: -1 }))
).check(Schema.isMinLength(1), Schema.isMaxLength(12));

const parentIndexes = Arbitrary.schema(ParentIndexes);

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

it("the fire kit board shows every layer, every take, and one pick wire per picked layer", () => {
  const graph = layout(fireFlags.studio, fireFlags.assets);
  const asset = fireFlags.assets[0]?.asset;
  const kinds = graph.nodes.map((node) => node.kind);

  const takes = Object.values(asset?.layers ?? {}).flatMap(
    (layer) => layer.variants
  );

  expect(kinds.filter((kind) => kind === "layer")).toHaveLength(
    fireFlags.assets[0]?.layers.length ?? -1
  );
  expect(kinds.filter((kind) => kind === "variant")).toHaveLength(takes.length);
  expect(
    graph.edges
      .filter((edge) => edge.kind === "pick")
      .map((edge) => edge.from)
      .toSorted()
  ).toEqual(
    Object.entries(asset?.mix ?? {})
      .map(([, variant]) => `variant:fire/${variant}`)
      .toSorted()
  );
  expect(graph.edges.filter((edge) => edge.kind === "lineage")).toHaveLength(
    takes.filter((take) => take.parent !== undefined).length
  );
});

it("fit puts the whole board inside the viewport, and zooming keeps the point under the cursor still", () => {
  const graph = layout(fireFlags.studio, fireFlags.assets);

  for (const viewport of [
    { height: 720, width: 1280 },
    { height: 600, width: 800 },
  ]) {
    const camera = fit(graph, viewport);

    expect(camera.x).toBeGreaterThanOrEqual(0);
    expect(camera.y).toBeGreaterThanOrEqual(0);
    expect(camera.x * 2 + graph.width * camera.zoom).toBeCloseTo(
      viewport.width
    );
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
