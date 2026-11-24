import { Schema } from "effect";

export class AdapterFailed extends Schema.TaggedError<
  AdapterFailed,
  { readonly brand: unique symbol }
>()("AdapterFailed", {
  adapter: Schema.String,
  message: Schema.String,
}) {}
