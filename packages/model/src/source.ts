import { Context } from "effect";
import type { Effect } from "effect";

import type { AdapterFailed } from "./adapter-failed.js";
import type { AssetSummary } from "./asset.js";
import type { LayerDef } from "./studio.js";
import type { UnknownAsset } from "./unknown-asset.js";
import type { UnknownLayer } from "./unknown-layer.js";
import type { UnknownStudio } from "./unknown-studio.js";
import type { Variant } from "./variant.js";

export class Source extends Context.Service<
  Source,
  {
    readonly listAssets: (
      studio: string
    ) => Effect.Effect<
      readonly (typeof AssetSummary.Type)[],
      UnknownStudio | AdapterFailed
    >;
    readonly layersOf: (
      studio: string,
      asset: string
    ) => Effect.Effect<
      readonly (typeof LayerDef.Type)[],
      UnknownStudio | UnknownAsset | AdapterFailed
    >;
    readonly takesOf: (
      studio: string,
      asset: string,
      layer: string
    ) => Effect.Effect<
      readonly (typeof Variant.Type)[],
      UnknownStudio | UnknownAsset | UnknownLayer | AdapterFailed
    >;
  }
>()("@gds/model/Source") {}
