import type { PackDef, StudioDef, Variant } from "@gds/model";
import { Option, Schema } from "effect";

import type { BoardAssetValue, OpenLayerValue } from "./model.js";
import type { SyncClip } from "./sync.js";

type VariantValue = typeof Variant.Type;

export const MAX_COLUMNS = 5;

export const pickerVariants = (
  variants: readonly VariantValue[],
  picked: string | undefined
): readonly VariantValue[] => {
  const latest = variants.slice(-MAX_COLUMNS);
  const pick = variants.find((variant) => variant.id === picked);

  if (pick === undefined || latest.includes(pick)) {
    return latest;
  }

  return [pick, ...latest.slice(1)];
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

  return Option.some({
    asset: entry.asset,
    history: state.picks.filter((pick) => pick.layer === open.layer),
    layer,
    picked,
    variants: pickerVariants(state.variants, picked),
  });
};

const decodeBeat = Schema.decodeUnknownOption(Schema.Finite);

export const beatMsOf = (
  studio: typeof StudioDef.Type,
  variant: VariantValue
) => {
  const beat = studio.sync?.beat;
  const value = beat === undefined ? undefined : variant.params[beat];

  return Option.getOrElse(decodeBeat(value), () => 0);
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

export const stillOf = (path: string) => path.replace(/\.gif$/u, ".beat.png");

const media = /\.(?:gif|png|jpe?g|webp)$/u;

export const referenceOf = (pack: typeof PackDef.Type) =>
  Option.fromNullishOr(pack.files.find((file) => media.test(file.path)));
