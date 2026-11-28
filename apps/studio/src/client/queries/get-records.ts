import { Query } from "@effect/ui";
import { Effect } from "effect";

import { Records } from "../../domain/decision.ts";
import { Page } from "../../domain/page.ts";
import { StudioUnavailable } from "../../domain/studio-unavailable.ts";
import { Studio } from "../studio.ts";

export const RecordsTag = Query.Tag("decision-records");

export class GetRecords extends Query.Service<GetRecords>()("gds/GetRecords", {
  args: { page: Page },
  error: StudioUnavailable,
  staleTime: "30 seconds",
  success: Records,
  tags: [RecordsTag],
}) {
  static readonly layer = this.toLayer(
    Effect.gen(function* getRecords() {
      const studio = yield* Studio;

      return ({ page }) => studio.records(page);
    })
  );
}
