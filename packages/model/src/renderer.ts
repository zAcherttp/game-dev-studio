import { Context } from "effect";
import type { Effect } from "effect";

import type { AdapterFailed } from "./adapter-failed.js";
import type { Mix } from "./asset.js";
import type { UnknownAsset } from "./unknown-asset.js";
import type { UnknownLayer } from "./unknown-layer.js";
import type { UnknownVariant } from "./unknown-variant.js";
import type { Render, Variant } from "./variant.js";

export interface RenderRequest {
  readonly studio: string;
  readonly asset: string;
  readonly layer: string;
  readonly variant: typeof Variant.Type;
  readonly mix: typeof Mix.Type;
}

export class Renderer extends Context.Service<
  Renderer,
  {
    readonly render: (
      request: RenderRequest
    ) => Effect.Effect<
      typeof Render.Type,
      AdapterFailed | UnknownAsset | UnknownLayer | UnknownVariant
    >;
  }
>()("@gds/model/Renderer") {}
