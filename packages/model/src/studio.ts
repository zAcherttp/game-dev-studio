import { Schema } from "effect";

import { GateDef } from "./gate.js";
import { RenderKind } from "./render-kind.js";

export const LayerDef = Schema.Struct({
  id: Schema.String,
  order: Schema.Int,
  renderKind: RenderKind,
  renderer: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The renderer for this layer, over the studio's renderer. Left out, the studio's renderer draws it.",
    })
  ),
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
  cameras: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "Path inside the game checkout to the studio's named cameras, which a renderer draws views from.",
    })
  ),
  check: Schema.optionalKey(Schema.String),
  commands: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.NonEmptyArray(Schema.String)).annotate({
      description:
        "Game commands by verb, each a command and its arguments, run without a shell by the command adapter.",
    })
  ),
  gates: Schema.Array(GateDef),
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

export const rendererOf = (
  studio: typeof StudioDef.Type,
  layer: string
): string =>
  studio.layers.find((entry) => entry.id === layer)?.renderer ??
  studio.renderer;
