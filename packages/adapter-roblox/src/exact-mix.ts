import type { RenderRequest } from "@gds/model";

import type { KitValue } from "./kit.js";

export const LEFT_OUT = "-";

export const picksFor = (
  request: RenderRequest,
  kit: KitValue
): Readonly<Record<string, string>> =>
  request.exact === true
    ? {
        ...Object.fromEntries(
          kit.layers
            .filter(({ name }) => name !== request.layer)
            .map(({ name }) => [name, LEFT_OUT])
        ),
        ...request.mix,
      }
    : request.mix;
