import { Schema } from "effect";

export const RenderKind = Schema.Literals([
  "audio",
  "image",
  "gif",
  "model",
  "numbers",
]).annotate({
  description: "What a render produces, so a viewer knows how to show it.",
});
