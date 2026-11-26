import { Context } from "effect";
import type { Effect } from "effect";

import type { AdapterFailed } from "./adapter-failed.js";
import type { PackDef } from "./studio.js";
import type { UnknownStudio } from "./unknown-studio.js";

export class Pack extends Context.Service<
  Pack,
  {
    readonly get: (
      studio: string
    ) => Effect.Effect<typeof PackDef.Type, UnknownStudio | AdapterFailed>;
  }
>()("@gds/model/Pack") {}
