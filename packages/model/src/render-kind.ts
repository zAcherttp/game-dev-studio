import { Schema } from "effect";

export const RenderKind = Schema.Literals([
  "audio",
  "image",
  "gif",
  "model",
  "numbers",
  "playable",
]).annotate({
  description:
    "What a render produces, so a viewer knows how to show it. playable: a take that runs; the render carries its launch.",
});
