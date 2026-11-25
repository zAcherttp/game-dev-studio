import { Schema } from "effect";

import { RenderKind } from "./render-kind.js";

export const RenderBeat = Schema.Struct({
  name: Schema.String,
  t: Schema.Finite.annotate({
    description: "Seconds from the render's start to the studio's sync beat.",
  }),
});

export const Render = Schema.Struct({
  beat: Schema.optionalKey(RenderBeat).annotate({
    description:
      "The sync beat this render is aligned on, where the still is held.",
  }),
  kind: RenderKind,
  ms: Schema.Finite,
  path: Schema.String,
  still: Schema.optionalKey(Schema.String).annotate({
    description: "An image held at the sync beat, beside a timed render.",
  }),
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
