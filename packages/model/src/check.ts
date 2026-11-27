import { Context } from "effect";
import type { Effect } from "effect";

import type { AdapterFailed } from "./adapter-failed.js";
import type { Mix } from "./asset.js";
import type { CheckShot } from "./round.js";

export interface CheckRequest {
  readonly studio: string;
  readonly asset: string;
  readonly kind?: string;
  readonly mix: typeof Mix.Type;
}

export class Check extends Context.Service<
  Check,
  {
    readonly open: (
      request: CheckRequest
    ) => Effect.Effect<typeof CheckShot.Type, AdapterFailed>;
  }
>()("@gds/model/Check") {}
