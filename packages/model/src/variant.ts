import { Schema } from "effect";

import { RenderKind } from "./render-kind.js";

export const Render = Schema.Struct({
  kind: RenderKind,
  ms: Schema.Finite,
  path: Schema.String,
});

export const GateResult = Schema.Struct({
  id: Schema.String,
  note: Schema.String,
  ok: Schema.Boolean,
  value: Schema.Json,
});

export const Variant = Schema.Struct({
  gates: Schema.optionalKey(Schema.Array(GateResult)),
  generator: Schema.String,
  id: Schema.String,
  label: Schema.String,
  layer: Schema.String,
  note: Schema.optionalKey(Schema.String),
  params: Schema.Record(Schema.String, Schema.Json),
  parent: Schema.optionalKey(Schema.String),
  render: Schema.optionalKey(Render),
  seed: Schema.optionalKey(Schema.Finite),
});
