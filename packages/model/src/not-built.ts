import { Schema } from "effect";

export class NotBuilt extends Schema.TaggedError<
  NotBuilt,
  { readonly brand: unique symbol }
>()("NotBuilt", {
  capability: Schema.String,
  message: Schema.String,
}) {}

export const notBuilt = (capability: string) =>
  new NotBuilt({
    capability,
    message: `${capability} has a contract but no handler yet. Its lane has not merged. Fix: implement it in \`packages/core\` and register it in \`apps/cli/src/surfaces.ts\`.`,
  });
