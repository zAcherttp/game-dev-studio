import { Effect, Schema } from "effect";
import { Digest, sha256 } from "effect/crypto/Digest";

export interface RenderInputs {
  readonly backend: string;
  readonly kit: Schema.Json;
  readonly layer: string;
  readonly mix: Readonly<Record<string, string>>;
  readonly take: string;
}

const isList = Schema.is(Schema.Array(Schema.Json));

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));

const sortedKeys = (_key: string, value: Schema.Json): Schema.Json =>
  isList(value) || !isRecord(value)
    ? value
    : Object.fromEntries(
        Object.entries(value).toSorted(([a], [b]) => (a < b ? -1 : 1))
      );

const encoder = new TextEncoder();

export const otherLayers = (
  mix: Readonly<Record<string, string>>,
  layer: string
): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(mix).filter(([key]) => key !== layer));

export const renderKeyText = (inputs: RenderInputs): string =>
  JSON.stringify(
    {
      backend: inputs.backend,
      kit: inputs.kit,
      layer: inputs.layer,
      mix: otherLayers(inputs.mix, inputs.layer),
      take: inputs.take,
    },
    sortedKeys
  );

export const digestText = Effect.fnUntraced(function* digestText(text: string) {
  const digest = yield* Digest;

  return yield* digest.digestHex(sha256, encoder.encode(text));
});

export const renderKey = (inputs: RenderInputs) =>
  Effect.map(digestText(renderKeyText(inputs)), (hex) => hex.slice(0, 20));
