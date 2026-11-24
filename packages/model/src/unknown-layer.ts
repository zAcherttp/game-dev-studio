import { Schema } from "effect";

export class UnknownLayer extends Schema.TaggedError<
  UnknownLayer,
  { readonly brand: unique symbol }
>()("UnknownLayer", {
  asset: Schema.String,
  layer: Schema.String,
  studio: Schema.String,
}) {}
