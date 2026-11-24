import { Schema } from "effect";

export class UnknownAsset extends Schema.TaggedError<
  UnknownAsset,
  { readonly brand: unique symbol }
>()("UnknownAsset", { asset: Schema.String, studio: Schema.String }) {}
