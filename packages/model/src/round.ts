import { Schema } from "effect";

import { GateResult, RenderView } from "./variant.js";

export const RoundRequest = Schema.Struct({
  asset: Schema.String,
  at: Schema.String,
  axis: Schema.String.annotate({
    description:
      "What the next variants should explore, such as colour or timing.",
  }),
  layer: Schema.String,
  note: Schema.String,
  studio: Schema.String,
}).annotate({
  description:
    "A recorded request for new variants. An agent makes them and calls addVariants; the dev studio never spawns agents.",
});

export const CheckShot = Schema.Struct({
  gates: Schema.optionalKey(
    Schema.Array(GateResult).annotate({
      description:
        "The studio's check gates, each read inside the engine and judged by its rule.",
    })
  ),
  note: Schema.String,
  shot: Schema.String,
  views: Schema.optionalKey(
    Schema.Array(RenderView).annotate({
      description: "One engine shot per named camera. shot is the first.",
    })
  ),
});
