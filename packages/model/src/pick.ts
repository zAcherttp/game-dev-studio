import { Schema } from "effect";

export const Pick = Schema.Struct({
  at: Schema.String.annotate({ description: "ISO 8601 instant of the pick." }),
  by: Schema.String,
  layer: Schema.String,
  note: Schema.String,
  variant: Schema.String,
}).annotate({
  description:
    "A later pick of the same layer replaces it in the mix; the history keeps every pick.",
});
