import type { Asset, LayerDef, Render, StudioDef, Variant } from "@gds/model";

import type { FlagsValue } from "../../src/client/board/model.js";

type VariantValue = typeof Variant.Type;

type RenderValue = typeof Render.Type;

export const worldCameras = ["street", "square", "high"] as const;

const hues = new Map([
  ["dressing", 30],
  ["look", 200],
  ["massing", 120],
  ["mood", 280],
  ["pieces", 0],
  ["surface", 60],
]);

const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">${body}</svg>`
  )}`;

const label = (text: string, y: number) =>
  `<text x="12" y="${y}" font-family="monospace" font-size="16" fill="#fff">${text}</text>`;

const shade = (variant: string) => ({ A: 32, B: 48, C: 64 })[variant] ?? 40;

export const takeImage = (layer: string, variant: string, camera: string) =>
  svg(
    `<rect width="320" height="180" fill="hsl(${hues.get(layer) ?? 0} 45% ${shade(variant)}%)"/>${label(`${layer} ${variant}`, 30)}${label(camera, 165)}`
  );

export const worldLayers: readonly (typeof LayerDef.Type)[] = [
  { id: "massing", order: 1, renderKind: "image", title: "Massing" },
  { id: "surface", order: 2, renderKind: "image", title: "Surface" },
  { id: "pieces", order: 3, renderKind: "image", title: "Pieces" },
  { id: "look", order: 4, renderKind: "image", title: "Look" },
  { id: "dressing", order: 5, renderKind: "image", title: "Dressing" },
  {
    id: "mood",
    order: 6,
    renderKind: "image",
    renderer: "roblox.shot",
    title: "Mood",
  },
];

export const worldStudio: typeof StudioDef.Type = {
  cameras: "tools/devstudio/studios/world-cameras.json",
  gates: [
    {
      id: "parts",
      json: "parts",
      pass: { op: "lt", value: 15_000 },
      run: ["python", "tools/devstudio/world.py", "gate", "parts"],
      title: "Part count under the place budget",
      where: "variant",
    },
    {
      id: "coplanar",
      json: "faces",
      pass: { op: "eq", value: 0 },
      run: ["python", "tools/devstudio/world.py", "gate", "coplanar"],
      title: "No coplanar faces",
      where: "variant",
    },
  ],
  id: "world",
  layers: worldLayers,
  pack: { files: [] },
  renderKinds: ["image"],
  renderer: "roblox.plan",
  title: "World",
};

const viewsRender = (layer: string, variant: string): RenderValue => {
  const views = worldCameras.map((camera) => ({
    camera,
    path: takeImage(layer, variant, camera),
  }));

  return {
    kind: "image",
    ms: 1200,
    path: views[0]?.path ?? "",
    views,
  };
};

export const slotWait = "no Studio slot is free yet";

const passing = (parts: number) => [
  { id: "parts", note: "", ok: true, value: parts },
  { id: "coplanar", note: "", ok: true, value: 0 },
];

const rowsOf = (variant: string) => [
  {
    file: "Config/Look.luau",
    path: "Walls.Material",
    value: `Plaster${variant}`,
  },
  { file: "Config/Look.luau", path: "Trim.Colour", value: "#d8c9a8" },
  {
    file: "Config/Look.luau",
    path: "Roof.Pitch",
    value: variant === "C" ? 40 : 35,
  },
];

const take = (layer: string, variant: string): VariantValue => {
  const base = {
    generator: "fixture",
    id: `${layer}-${variant}`,
    label: variant,
    layer,
    params: layer === "look" ? { rows: rowsOf(variant) } : {},
  };

  if (layer === "surface" && variant === "C") {
    return {
      ...base,
      gates: [
        {
          id: "parts",
          note: "over the place budget",
          ok: false,
          value: 16_200,
        },
        { id: "coplanar", note: "", ok: true, value: 0 },
      ],
      render: viewsRender(layer, variant),
    };
  }

  if (layer === "mood" && variant === "C") {
    return {
      ...base,
      render: { kind: "image", ms: 0, path: "", pending: slotWait },
    };
  }

  return {
    ...base,
    gates: passing(9000 + (variant.codePointAt(0) ?? 0)),
    render: viewsRender(layer, variant),
  };
};

const variantIds = ["A", "B", "C"] as const;

export const worldAsset: typeof Asset.Type = {
  id: "village",
  layers: Object.fromEntries(
    worldLayers.map((layer) => [
      layer.id,
      {
        picks: [],
        variants: variantIds.map((variant) => take(layer.id, variant)),
      },
    ])
  ),
  mix: Object.fromEntries(
    worldLayers.map((layer) => [layer.id, `${layer.id}-A`])
  ),
  studio: "world",
  title: "Village",
};

export const worldFlags: FlagsValue = {
  assets: [{ asset: worldAsset, layers: worldLayers }],
  by: "Phát",
  catalog: [{ id: "village", picks: 0, title: "Village" }],
  studio: worldStudio,
};

export const mixImage = (asset: typeof Asset.Type, camera: string) =>
  svg(
    [
      `<rect width="320" height="180" fill="#111"/>`,
      ...worldLayers.map((layer, index) => {
        const picked = asset.mix[layer.id] ?? "none";
        const variant = picked.slice(layer.id.length + 1);

        return `<rect x="0" y="${index * 26}" width="320" height="26" fill="hsl(${hues.get(layer.id) ?? 0} 45% ${shade(variant)}%)"/>${label(picked, index * 26 + 19)}`;
      }),
      label(camera, 172),
    ].join("")
  );

export const mixRender = (asset: typeof Asset.Type): RenderValue => {
  const views = worldCameras.map((camera) => ({
    camera,
    path: mixImage(asset, camera),
  }));

  return { kind: "image", ms: 2400, path: views[0]?.path ?? "", views };
};
