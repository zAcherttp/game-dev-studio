import { Schema } from "effect";

import { RenderKind } from "./render-kind.js";

export const LayerDef = Schema.Struct({
  id: Schema.String,
  order: Schema.Int,
  renderKind: RenderKind,
  title: Schema.String,
});

export const PackFile = Schema.Struct({
  path: Schema.String.annotate({
    description:
      "Path inside the checkout the studio points at; nothing is copied.",
  }),
  why: Schema.String,
});

export const PackDef = Schema.Struct({ files: Schema.Array(PackFile) });

export const StudioDef = Schema.Struct({
  check: Schema.optionalKey(Schema.String),
  gates: Schema.Array(Schema.String),
  id: Schema.String,
  layers: Schema.Array(LayerDef).annotate({
    description:
      "Default layer order. A Source may give an asset its own layers.",
  }),
  pack: PackDef,
  renderKinds: Schema.Array(RenderKind),
  renderer: Schema.String,
  sync: Schema.optionalKey(Schema.Struct({ beat: Schema.String })),
  title: Schema.String,
});
