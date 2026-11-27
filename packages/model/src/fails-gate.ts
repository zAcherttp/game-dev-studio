import { Schema } from "effect";

export class FailsGate extends Schema.TaggedError<
  FailsGate,
  { readonly brand: unique symbol }
>()("FailsGate", {
  asset: Schema.String,
  gates: Schema.Array(Schema.String),
  layer: Schema.String,
  studio: Schema.String,
  variant: Schema.String,
}) {}
