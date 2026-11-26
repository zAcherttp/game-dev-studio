import { Schema } from "effect";

import { RenderKind } from "./render-kind.js";

export const RenderBeat = Schema.Struct({
  name: Schema.String,
  t: Schema.Finite.annotate({
    description: "Seconds from the render's start to the studio's sync beat.",
  }),
});

export const RenderView = Schema.Struct({
  camera: Schema.String.annotate({
    description: "The named camera the view is drawn from.",
  }),
  path: Schema.String,
});

export const Render = Schema.Struct({
  beat: Schema.optionalKey(RenderBeat).annotate({
    description:
      "The sync beat this render is aligned on, where the still is held.",
  }),
  kind: RenderKind,
  ms: Schema.Finite,
  path: Schema.String,
  pending: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "Set while the render waits for something it needs, such as a free Studio slot, and says what. path and views are not drawn yet. A waiting render is not a failure; ask again later.",
    })
  ),
  still: Schema.optionalKey(Schema.String).annotate({
    description: "An image held at the sync beat, beside a timed render.",
  }),
  views: Schema.optionalKey(
    Schema.Array(RenderView).annotate({
      description: "One image per named camera. path is the first view's path.",
    })
  ),
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
