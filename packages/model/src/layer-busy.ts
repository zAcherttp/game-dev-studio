import { Schema } from "effect";

export class LayerBusy extends Schema.TaggedError<
  LayerBusy,
  { readonly brand: unique symbol }
>()("LayerBusy", {
  asset: Schema.String,
  layer: Schema.String,
  studio: Schema.String,
}) {}
