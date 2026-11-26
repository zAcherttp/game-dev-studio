import { Context } from "effect";
import type { Effect } from "effect";

import type { AdapterFailed } from "./adapter-failed.js";
import type { Variant } from "./variant.js";

export interface ApplyRequest {
  readonly studio: string;
  readonly asset: string;
  readonly layer: string;
  readonly variant: typeof Variant.Type;
}

export interface Applied {
  readonly changed: readonly string[];
}

export class Apply extends Context.Service<
  Apply,
  {
    readonly apply: (
      request: ApplyRequest
    ) => Effect.Effect<Applied, AdapterFailed>;
  }
>()("@gds/model/Apply") {}
