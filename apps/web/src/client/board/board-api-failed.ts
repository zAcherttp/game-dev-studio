import { Schema } from "effect";

export class BoardApiFailed extends Schema.TaggedError<
  BoardApiFailed,
  { readonly brand: unique symbol }
>()("BoardApiFailed", { message: Schema.String }) {}
