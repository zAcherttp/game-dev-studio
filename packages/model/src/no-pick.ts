import { Schema } from "effect";

export class NoPick extends Schema.TaggedError<
  NoPick,
  { readonly brand: unique symbol }
>()("NoPick", {
  asset: Schema.String,
  layer: Schema.String,
  studio: Schema.String,
}) {}
