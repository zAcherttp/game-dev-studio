import { Context } from "effect";
import type { Effect } from "effect";

import type { AdapterFailed } from "./adapter-failed.js";
import type { Mix } from "./asset.js";
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
    ) => Effect.Effect<typeof Render.Type, AdapterFailed>;
  }
>()("@gds/model/Renderer") {}
