import type { Asset, LayerDef, StudioDef } from "@gds/model";

type LayerDefValue = typeof LayerDef.Type;

export const layersOf = (
  studio: typeof StudioDef.Type,
  asset: typeof Asset.Type,
  given: readonly LayerDefValue[] = []
): readonly LayerDefValue[] => {
  const declared = new Map(
    [...studio.layers, ...given].map((layer) => [layer.id, layer])
  );

  const renderKind =
    studio.layers[0]?.renderKind ?? studio.renderKinds[0] ?? "gif";

  const named = new Set(given.map((layer) => layer.id));
  const start = Math.max(given.length, studio.layers.length);

  const rest = Object.keys(asset.layers)
    .filter((id) => !named.has(id))
    .map(
      (id, index) =>
        declared.get(id) ?? {
          id,
          order: start + index,
          renderKind,
          title: id,
        }
    );

  return [...given, ...rest];
};
