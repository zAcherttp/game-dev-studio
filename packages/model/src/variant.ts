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

export const Launch = Schema.Struct({
  args: Schema.Array(Schema.String),
  command: Schema.String,
  cwd: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "Directory the command runs in; the adapter's default when left out.",
    })
  ),
}).annotate({
  description:
    "How to start a playable take: a command and its arguments, run without a shell. The studio's adapter fills every field.",
});

const playableCarriesLaunch = Schema.makeFilter(
  (render: { readonly kind: string; readonly launch?: unknown }) =>
    (render.kind === "playable") === (render.launch !== undefined) ||
    "A playable render carries a launch, and only a playable render does."
);

export const Render = Schema.Struct({
  beat: Schema.optionalKey(RenderBeat).annotate({
    description:
      "The sync beat this render is aligned on, where the still is held.",
  }),
  kind: RenderKind,
  launch: Schema.optionalKey(Launch).annotate({
    description: "Set exactly when kind is playable: how to start the take.",
  }),
  ms: Schema.Finite,
  numbers: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "Path to the frame strip a replay wrote: per-tick numbers beside the replay video in views.",
    })
  ),
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
      description:
        "One image per named camera, or for a playable render the replay video. path is the first view's path.",
    })
  ),
}).check(playableCarriesLaunch);

export const GateResult = Schema.Struct({
  id: Schema.String,
  note: Schema.String,
  ok: Schema.Boolean,
  reading: Schema.optionalKey(
    Schema.Literal(true).annotate({
      description:
        "The gate is a reading: value is shown and never blocks a pick, whatever ok says.",
    })
  ),
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
  story: Schema.optionalKey(
    Schema.Int.annotate({
      description:
        "The story block version this take answered; addVariants stamps the current one when it is left out.",
    })
  ),
});
