import { Schema } from "effect";

export class StudioUnavailable extends Schema.TaggedError<
  StudioUnavailable,
  { readonly brand: unique symbol }
>()("StudioUnavailable", { message: Schema.String }) {}
