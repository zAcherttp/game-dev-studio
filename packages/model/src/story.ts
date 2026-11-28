import { Schema } from "effect";

export const FrameRange = Schema.Struct({
  from: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  to: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}).annotate({
  description: "Frames of a reference clip, first and last, both included.",
});

export const Crop = Schema.Struct({
  height: Schema.Finite,
  width: Schema.Finite,
  x: Schema.Finite,
  y: Schema.Finite,
}).annotate({
  description:
    "A rectangle of a reference in its own pixels: the part one layer copies.",
});

export const StoryReference = Schema.Struct({
  crop: Schema.optionalKey(Crop),
  frames: Schema.optionalKey(FrameRange),
  label: Schema.String,
  layer: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The layer this reference is the crop for; absent when it serves the whole asset.",
    })
  ),
  source: Schema.String.annotate({
    description:
      "Where the reference lives: a path in the game checkout or a link.",
  }),
});

export const StoryBlock = Schema.Struct({
  at: Schema.String.annotate({
    description: "ISO 8601 instant this version was written.",
  }),
  beat: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The sync beat every take is judged on, such as the blade leaving the back.",
    })
  ),
  by: Schema.String,
  layers: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        "The layer list the owner said yes to, in order. An agent proposes it from the block; it lands here only with the owner's yes.",
    })
  ),
  references: Schema.Array(StoryReference),
  rules: Schema.Array(Schema.String).annotate({
    description:
      "Shared rules every layer keeps, such as the style bible or a locked look.",
  }),
  title: Schema.String,
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  words: Schema.String.annotate({
    description:
      "The owner's words for the asset, verbatim. Agents never rewrite them.",
  }),
}).annotate({
  description:
    "One version of an asset's story block. Editing the block adds a version; takes keep the version they answered.",
});

export type StoryBlockValue = typeof StoryBlock.Type;

export const currentStory = (
  story: readonly StoryBlockValue[] | undefined
): StoryBlockValue | undefined => story?.at(-1);
