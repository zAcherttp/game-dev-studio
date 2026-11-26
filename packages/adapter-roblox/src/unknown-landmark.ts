import { Schema } from "effect";

export class UnknownLandmark extends Schema.TaggedError<
  UnknownLandmark,
  { readonly brand: unique symbol }
>()("UnknownLandmark", {
  camera: Schema.String,
  known: Schema.Array(Schema.String),
  landmark: Schema.String,
  message: Schema.String,
}) {}
