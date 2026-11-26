import { Schema } from "effect";

export class UnknownCamera extends Schema.TaggedError<
  UnknownCamera,
  { readonly brand: unique symbol }
>()("UnknownCamera", {
  camera: Schema.String,
  known: Schema.Array(Schema.String),
  message: Schema.String,
}) {}
