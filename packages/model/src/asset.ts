import { Schema } from "effect";

import { Pick } from "./pick.js";
import { Variant } from "./variant.js";

export const AssetLayer = Schema.Struct({
  picks: Schema.Array(Pick),
  variants: Schema.Array(Variant),
});

export const Mix = Schema.Record(Schema.String, Schema.String).annotate({
  description: "The picked variant id for each layer id.",
});

export const Asset = Schema.Struct({
  id: Schema.String,
  layers: Schema.Record(Schema.String, AssetLayer),
  mix: Mix,
  studio: Schema.String,
  title: Schema.String,
});

export const AssetSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
});
