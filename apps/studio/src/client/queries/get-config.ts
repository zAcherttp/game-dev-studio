import { Query } from "@effect/ui";
import { Effect } from "effect";

import { StudioConfig } from "../../domain/page.ts";
import { StudioUnavailable } from "../../domain/studio-unavailable.ts";
import { Studio } from "../studio.ts";

export class GetConfig extends Query.Service<GetConfig>()("gds/GetConfig", {
  error: StudioUnavailable,
  staleTime: "1 minute",
  success: StudioConfig,
}) {
  static readonly layer = this.toLayer(
    Effect.gen(function* getConfig() {
      const studio = yield* Studio;

      return () => studio.config;
    })
  );
}
