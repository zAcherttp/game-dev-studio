import { Schema } from "effect";

const Tick = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const InputChange = Schema.Tuple([
  Tick,
  Schema.Array(Schema.Json),
]).annotate({
  description:
    "One change of input: the tick it happens on and the whole pressed set from then on, in the game's own action names.",
});

export const InputRecord = Schema.Struct({
  id: Schema.String,
  note: Schema.optionalKey(Schema.String),
  start: Schema.Json.annotate({
    description:
      "Where the replay starts, as the stage wrote it. Opaque to the dev studio.",
  }),
  tickRate: Schema.Int.check(Schema.isGreaterThan(0)).annotate({
    description: "Ticks per second the record was taken at.",
  }),
  ticks: Schema.Array(InputChange).annotate({
    description: "Only the changes, oldest first.",
  }),
  version: Schema.Literal(1),
}).annotate({
  description:
    "Recorded input for a playable asset. Every take of the asset replays the same record, so takes compare on the same input.",
});
