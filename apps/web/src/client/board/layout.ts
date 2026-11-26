import type { Asset, LayerDef, Variant } from "@gds/model";

import type { BoardAssetValue, CameraValue, ViewportValue } from "./model.js";

type AssetValue = typeof Asset.Type;

type LayerDefValue = typeof LayerDef.Type;

type VariantValue = typeof Variant.Type;

export const COLUMN = 236;

export const VARIANT_COLUMN = 196;

export const ROW = 148;

export const MIN_ZOOM = 0.15;

export const MAX_ZOOM = 2.5;

export const FIT_MIN_ZOOM = 0.4;

const FIT_PADDING = 48;

const MIX_HEADER = 212;

const MIX_LINE = 17;

export const nodeSize = {
  asset: { height: 96, width: 190 },
  layer: { height: 134, width: 176 },
  mix: { height: 300, width: 240 },
  studio: { height: 96, width: 190 },
  variant: { height: 124, width: 164 },
} as const;

export type NodeKind = keyof typeof nodeSize;

interface NodeBase {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type GraphNode =
  | (NodeBase & { readonly kind: "studio"; readonly title: string })
  | (NodeBase & { readonly kind: "asset"; readonly asset: AssetValue })
  | (NodeBase & {
      readonly kind: "layer";
      readonly asset: AssetValue;
      readonly layer: LayerDefValue;
      readonly pick: VariantValue | undefined;
      readonly count: number;
    })
  | (NodeBase & {
      readonly kind: "variant";
      readonly asset: AssetValue;
      readonly layer: LayerDefValue;
      readonly variant: VariantValue;
      readonly isPicked: boolean;
      readonly round: number;
    })
  | (NodeBase & {
      readonly kind: "mix";
      readonly asset: AssetValue;
      readonly layers: readonly LayerDefValue[];
    });

export type EdgeKind = "structure" | "lineage" | "pick";

export interface GraphEdge {
  readonly id: string;
  readonly kind: EdgeKind;
  readonly from: string;
  readonly to: string;
  readonly path: string;
}

export interface Graph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly width: number;
  readonly height: number;
}

export const nodeId = {
  asset: (asset: string) => `asset:${asset}`,
  layer: (asset: string, layer: string) => `layer:${asset}/${layer}`,
  mix: (asset: string) => `mix:${asset}`,
  studio: (studio: string) => `studio:${studio}`,
  variant: (asset: string, layer: string, variant: string) =>
    `variant:${asset}/${layer}/${variant}`,
};

interface Placed {
  readonly variant: VariantValue;
  readonly depth: number;
  readonly row: number;
}

export const lineage = (variants: readonly VariantValue[]) => {
  const ids = new Set(variants.map((variant) => variant.id));

  const childrenOf = (parent?: string) =>
    variants.filter((variant) =>
      parent === undefined
        ? variant.parent === undefined || !ids.has(variant.parent)
        : variant.parent === parent
    );

  const placed: Placed[] = [];

  const visit = (
    variant: VariantValue,
    depth: number,
    nextRow: number,
    seen: ReadonlySet<string>
  ): number => {
    const children = childrenOf(variant.id).filter(
      (child) => !seen.has(child.id)
    );

    const below = new Set([...seen, variant.id]);
    const start = nextRow;

    let end = nextRow;

    for (const child of children) {
      end = visit(child, depth + 1, end, below);
    }

    placed.push({ depth, row: start, variant });

    return Math.max(end, start + 1);
  };

  let rows = 0;

  for (const root of childrenOf()) {
    rows = visit(root, 0, rows, new Set());
  }

  return { placed, rows: Math.max(1, rows) };
};

export const shownTakes = (
  variants: readonly VariantValue[],
  picked: string | undefined
): readonly VariantValue[] => {
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const shown = new Set<string>();

  const keep = (id: string | undefined) => {
    const variant = id === undefined ? undefined : byId.get(id);

    if (variant === undefined || shown.has(variant.id)) {
      return;
    }

    shown.add(variant.id);
    keep(variant.parent);
  };

  for (const variant of variants) {
    if (variant.parent !== undefined && byId.has(variant.parent)) {
      keep(variant.id);
    }
  }

  keep(picked);

  return variants.filter((variant) => shown.has(variant.id));
};

const pickOf = (asset: AssetValue, layer: string) => {
  const picked = asset.mix[layer];

  return asset.layers[layer]?.variants.find((variant) => variant.id === picked);
};

const edgePath = (from: NodeBase, to: NodeBase) => {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const bend = Math.max(40, (x2 - x1) / 2);

  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
};

const centredIn = (kind: NodeKind, x: number, rowTop: number) => ({
  height: nodeSize[kind].height,
  width: nodeSize[kind].width,
  x,
  y: rowTop + (ROW - nodeSize[kind].height) / 2,
});

export const orderedLayers = (entry: BoardAssetValue) =>
  [...entry.layers].toSorted((left, right) => left.order - right.order);

export const layout = (
  studio: { readonly id: string; readonly title: string },
  assets: readonly BoardAssetValue[]
): Graph => {
  const perAsset = assets.map((entry) => ({
    entry,
    layers: orderedLayers(entry).map((layer) => {
      const variants = entry.asset.layers[layer.id]?.variants ?? [];

      return {
        layer,
        takes: variants.length,
        tree: lineage(shownTakes(variants, entry.asset.mix[layer.id])),
      };
    }),
  }));

  const maxDepth = Math.max(
    0,
    ...perAsset.flatMap(({ layers }) =>
      layers.flatMap(({ tree }) => tree.placed.map((placed) => placed.depth))
    )
  );

  const variantX = COLUMN * 3;
  const mixX = variantX + (maxDepth + 1) * VARIANT_COLUMN + 60;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const byId = new Map<string, NodeBase>();

  const add = (node: GraphNode) => {
    nodes.push(node);
    byId.set(node.id, node);
  };

  const connect = (kind: EdgeKind, from: string, to: string) => {
    const source = byId.get(from);
    const target = byId.get(to);

    if (source !== undefined && target !== undefined) {
      edges.push({
        from,
        id: `${kind}:${from}->${to}`,
        kind,
        path: edgePath(source, target),
        to,
      });
    }
  };

  let rowCursor = 0;

  const assetBands = perAsset.map(({ entry, layers }) => {
    const { asset } = entry;
    const top = rowCursor;

    const layerRows = layers.map(({ layer, takes, tree }) => {
      const start = rowCursor;
      rowCursor += tree.rows;

      return { layer, start, takes, tree };
    });

    const rows = Math.max(1, rowCursor - top);
    rowCursor = top + rows;
    const middle = (top + rows / 2) * ROW - ROW / 2;

    add({
      asset,
      kind: "asset",
      ...centredIn("asset", COLUMN, middle),
      id: nodeId.asset(asset.id),
    });

    const mixHeight = Math.max(
      nodeSize.mix.height,
      MIX_HEADER + layers.length * MIX_LINE
    );

    add({
      asset,
      height: mixHeight,
      id: nodeId.mix(asset.id),
      kind: "mix",
      layers: layers.map(({ layer }) => layer),
      width: nodeSize.mix.width,
      x: mixX,
      y: middle + (ROW - mixHeight) / 2,
    });

    for (const { layer, start, takes, tree } of layerRows) {
      const layerNodeId = nodeId.layer(asset.id, layer.id);
      add({
        asset,
        count: takes,
        kind: "layer",
        layer,
        pick: pickOf(asset, layer.id),
        ...centredIn("layer", COLUMN * 2, start * ROW),
        id: layerNodeId,
      });

      for (const placed of tree.placed.toSorted(
        (left, right) => left.depth - right.depth
      )) {
        add({
          asset,
          isPicked: asset.mix[layer.id] === placed.variant.id,
          kind: "variant",
          layer,
          round: placed.depth + 1,
          variant: placed.variant,
          ...centredIn(
            "variant",
            variantX + placed.depth * VARIANT_COLUMN,
            (start + placed.row) * ROW
          ),
          id: nodeId.variant(asset.id, layer.id, placed.variant.id),
        });
      }
    }

    return { asset, layerRows, middle };
  });

  const totalRows = Math.max(1, rowCursor);
  add({
    kind: "studio",
    title: studio.title,
    ...centredIn("studio", 0, (totalRows / 2) * ROW - ROW / 2),
    id: nodeId.studio(studio.id),
  });

  for (const { asset, layerRows } of assetBands) {
    connect("structure", nodeId.studio(studio.id), nodeId.asset(asset.id));

    for (const { layer, tree } of layerRows) {
      const layerNodeId = nodeId.layer(asset.id, layer.id);
      connect("structure", nodeId.asset(asset.id), layerNodeId);

      for (const placed of tree.placed) {
        const { parent } = placed.variant;
        const isRoot = placed.depth === 0 || parent === undefined;
        connect(
          isRoot ? "structure" : "lineage",
          isRoot ? layerNodeId : nodeId.variant(asset.id, layer.id, parent),
          nodeId.variant(asset.id, layer.id, placed.variant.id)
        );
      }

      const picked = asset.mix[layer.id];

      if (picked !== undefined) {
        connect(
          "pick",
          nodeId.variant(asset.id, layer.id, picked),
          nodeId.mix(asset.id)
        );
      }
    }
  }

  const width = mixX + nodeSize.mix.width;
  const height = totalRows * ROW;

  return { edges, height, nodes, width };
};

export const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export const fit = (
  graph: Pick<Graph, "width" | "height">,
  viewport: ViewportValue
): CameraValue => {
  const zoom = Math.max(
    FIT_MIN_ZOOM,
    clampZoom(
      Math.min(
        (viewport.width - FIT_PADDING * 2) / graph.width,
        (viewport.height - FIT_PADDING * 2) / graph.height,
        1
      )
    )
  );

  const along = (room: number, size: number) =>
    size * zoom + FIT_PADDING * 2 > room
      ? FIT_PADDING
      : (room - size * zoom) / 2;

  return {
    x: along(viewport.width, graph.width),
    y: along(viewport.height, graph.height),
    zoom,
  };
};

export const panTo = (
  camera: CameraValue,
  node: Pick<NodeBase, "x" | "y" | "width" | "height">,
  viewport: ViewportValue
): CameraValue => {
  const zoom = Math.max(camera.zoom, FIT_MIN_ZOOM);

  return {
    x: viewport.width / 2 - (node.x + node.width / 2) * zoom,
    y: viewport.height / 2 - (node.y + node.height / 2) * zoom,
    zoom,
  };
};

export const zoomAt = (
  camera: CameraValue,
  factor: number,
  at: { readonly x: number; readonly y: number }
): CameraValue => {
  const zoom = clampZoom(camera.zoom * factor);
  const scale = zoom / camera.zoom;

  return {
    x: at.x - (at.x - camera.x) * scale,
    y: at.y - (at.y - camera.y) * scale,
    zoom,
  };
};
