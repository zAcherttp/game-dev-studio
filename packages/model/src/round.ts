import { Schema } from "effect";

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
  note: Schema.String,
  shot: Schema.String,
});
