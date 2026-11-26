import type { Asset, LayerDef, StudioDef } from "@gds/model";

type LayerDefValue = typeof LayerDef.Type;

export const layersOf = (
  studio: typeof StudioDef.Type,
  asset: typeof Asset.Type
): readonly LayerDefValue[] => {
  const declared = new Map(studio.layers.map((layer) => [layer.id, layer]));

  const renderKind =
    studio.layers[0]?.renderKind ?? studio.renderKinds[0] ?? "gif";

  return Object.keys(asset.layers).map(
    (id, index) =>
      declared.get(id) ?? {
        id,
        order: studio.layers.length + index,
        renderKind,
        title: id,
      }
  );
};
