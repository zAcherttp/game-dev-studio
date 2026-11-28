import { Query } from "@effect/ui";
import { Effect, Schema } from "effect";

import { StudioLink } from "../../domain/page.ts";
import { StudioUnavailable } from "../../domain/studio-unavailable.ts";
import { Studio } from "../studio.ts";

export class ListStudios extends Query.Service<ListStudios>()(
  "gds/ListStudios",
  {
    error: StudioUnavailable,
    staleTime: "1 minute",
    success: Schema.Array(StudioLink),
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* listStudios() {
      const studio = yield* Studio;

      return () => studio.studios;
    })
  );
}
