import { Schema } from "effect";

export class UnknownStudio extends Schema.TaggedError<
  UnknownStudio,
  { readonly brand: unique symbol }
>()("UnknownStudio", { studio: Schema.String }) {}
