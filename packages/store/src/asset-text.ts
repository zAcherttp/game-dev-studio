import { Asset } from "@gds/model";
import { Effect, Schema } from "effect";

const isJsonObject = Schema.is(Schema.JsonObject);

const sortKeys = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .flatMap((key) => {
          const entry = value[key];

          return entry === undefined ? [] : [[key, sortKeys(entry)] as const];
        })
    );
  }

  return value;
};

const encodeAsset = Schema.encodeEffect(Asset);

const asJson = Schema.decodeUnknownEffect(Schema.Json);

export const assetText = Effect.fnUntraced(function* assetText(
  asset: typeof Asset.Type
) {
  const encoded = yield* asJson(yield* encodeAsset(asset));

  return `${JSON.stringify(sortKeys(encoded), null, 2)}\n`;
});

export const parseAsset = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Asset)
);
