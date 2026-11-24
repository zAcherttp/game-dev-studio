import { Schema } from "effect";

export class UnknownVariant extends Schema.TaggedError<
  UnknownVariant,
  { readonly brand: unique symbol }
>()("UnknownVariant", {
  asset: Schema.String,
  layer: Schema.String,
  studio: Schema.String,
  variant: Schema.String,
}) {}
