import type { Asset, LayerDef } from "@gds/model";

type AssetValue = typeof Asset.Type;

export type Picks = Readonly<Record<string, string>>;

export const pickedTakes = (
  asset: AssetValue,
  layers: readonly (typeof LayerDef.Type)[]
): Picks =>
  Object.fromEntries(
    layers.flatMap((layer) => {
      const picked = asset.mix[layer.id];

      const known = asset.layers[layer.id]?.variants.some(
        ({ id }) => id === picked
      );

      return picked !== undefined && known === true
        ? [[layer.id, picked] as const]
        : [];
    })
  );

export const withoutLayers = (picks: Picks, off: readonly string[]): Picks =>
  Object.fromEntries(
    Object.entries(picks).filter(([layer]) => !off.includes(layer))
  );

export const takeName = (
  layerTitle: string,
  variant: { readonly id: string; readonly label: string }
) =>
  variant.label.startsWith(`${layerTitle} `)
    ? variant.label.slice(layerTitle.length + 1)
    : variant.label;

export const composeKey = (asset: string, picks: Picks) =>
  `${asset}|${Object.entries(picks)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([layer, take]) => `${layer}=${take}`)
    .join(",")}`;

export const composeRequest = (picks: Picks) => {
  const [first, ...rest] = Object.entries(picks).toSorted(([left], [right]) =>
    left.localeCompare(right)
  );

  return first === undefined
    ? undefined
    : { layer: first[0], mix: Object.fromEntries(rest), variant: first[1] };
};
