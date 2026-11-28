import { Query } from "@effect/ui";
import { Effect } from "effect";

import { Page } from "../../domain/page.ts";
import { StudioUnavailable } from "../../domain/studio-unavailable.ts";
import { TreeNode } from "../../domain/tree.ts";
import { Studio } from "../studio.ts";

export class GetTree extends Query.Service<GetTree>()("gds/GetTree", {
  args: { page: Page },
  error: StudioUnavailable,
  staleTime: "5 minutes",
  success: TreeNode,
}) {
  static readonly layer = this.toLayer(
    Effect.gen(function* getTree() {
      const studio = yield* Studio;

      return ({ page }) => studio.tree(page);
    })
  );
}
