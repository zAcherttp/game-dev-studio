import { Context } from "effect";
import type { Effect } from "effect";

import type { AdapterFailed } from "./adapter-failed.js";
import type { Asset, AssetSummary } from "./asset.js";
import type { Pick } from "./pick.js";
import type { RoundRequest } from "./round.js";
import type { StudioDef } from "./studio.js";
import type { UnknownAsset } from "./unknown-asset.js";
import type { UnknownStudio } from "./unknown-studio.js";
import type { Variant } from "./variant.js";

export class Store extends Context.Service<
  Store,
  {
    readonly listStudios: Effect.Effect<
      readonly (typeof StudioDef.Type)[],
      AdapterFailed
    >;
    readonly listAssets: (
      studio: string
    ) => Effect.Effect<
      readonly (typeof AssetSummary.Type)[],
      UnknownStudio | AdapterFailed
    >;
    readonly getAsset: (
      studio: string,
      asset: string
    ) => Effect.Effect<
      typeof Asset.Type,
      UnknownStudio | UnknownAsset | AdapterFailed
    >;
    readonly putVariants: (
      studio: string,
      asset: string,
      layer: string,
      variants: readonly (typeof Variant.Type)[]
    ) => Effect.Effect<
      typeof Asset.Type,
      UnknownStudio | UnknownAsset | AdapterFailed
    >;
    readonly pick: (
      studio: string,
      asset: string,
      pick: typeof Pick.Type
    ) => Effect.Effect<
      typeof Asset.Type,
      UnknownStudio | UnknownAsset | AdapterFailed
    >;
    readonly round: (
      studio: string,
      asset: string,
      request: typeof RoundRequest.Type
    ) => Effect.Effect<
      typeof Asset.Type,
      UnknownStudio | UnknownAsset | AdapterFailed
    >;
    readonly history: (
      studio: string,
      asset: string,
      layer: string
    ) => Effect.Effect<
      readonly (typeof Pick.Type)[],
      UnknownStudio | UnknownAsset | AdapterFailed
    >;
  }
>()("@gds/model/Store") {}
