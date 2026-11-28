import { likedTakes } from "@gds/model";
import type { PackDef, StudioDef, Variant } from "@gds/model";
import { Option } from "effect";

import type { BoardAssetValue, OpenLayerValue } from "./model.js";
import type { SyncClip } from "./sync.js";

type VariantValue = typeof Variant.Type;

export const MAX_COLUMNS = 5;

export const pickerVariants = (
  variants: readonly VariantValue[],
  picked: string | undefined,
  liked: readonly string[] = []
): readonly VariantValue[] => {
  const latest = variants.slice(-MAX_COLUMNS);

  const kept = variants.filter(
    (variant) =>
      (variant.id === picked || liked.includes(variant.id)) &&
      !latest.includes(variant)
  );

  return [...kept, ...latest.slice(Math.min(kept.length, latest.length))];
};

export const openedLayer = (
  assets: readonly BoardAssetValue[],
  open: OpenLayerValue
) => {
  const entry = assets.find((candidate) => candidate.asset.id === open.asset);
  const layer = entry?.layers.find((candidate) => candidate.id === open.layer);
  const state = entry?.asset.layers[open.layer];

  if (entry === undefined || layer === undefined || state === undefined) {
    return Option.none();
  }

  const picked = entry.asset.mix[open.layer];
  const liked = likedTakes(state.likes);

  return Option.some({
    asset: entry.asset,
    history: state.picks.filter((pick) => pick.layer === open.layer),
    layer,
    liked,
    picked,
    variants: pickerVariants(state.variants, picked, liked),
  });
};

export const beatMsOf = (
  studio: typeof StudioDef.Type,
  variant: VariantValue
) => {
  const beat = variant.render?.beat;

  return beat === undefined || beat.name !== studio.sync?.beat
    ? 0
    : beat.t * 1000;
};

export const syncClips = (
  studio: typeof StudioDef.Type,
  variants: readonly VariantValue[]
): readonly SyncClip[] =>
  variants.flatMap((variant) =>
    variant.render === undefined
      ? []
      : [
          {
            beatMs: beatMsOf(studio, variant),
            id: variant.id,
            ms: variant.render.ms,
          },
        ]
  );

const drivePath = /^[A-Za-z]:[\\/]/u;

export const mediaSrc = (path: string) =>
  drivePath.test(path) ? `/@fs/${path.replaceAll("\\", "/")}` : path;

const media = /\.(?:gif|png|jpe?g|webp)$/u;

export const referenceOf = (pack: typeof PackDef.Type) =>
  Option.fromNullishOr(pack.files.find((file) => media.test(file.path)));
