import { Schema } from "effect";

const Picks = Schema.Union([
  Schema.Record(Schema.String, Schema.String),
  Schema.Tuple([]),
]);

export const KitTake = Schema.Struct({
  count: Schema.Finite,
  layers: Schema.Union([
    Schema.Array(Schema.Json),
    Schema.Record(Schema.String, Schema.Never),
  ]),
  note: Schema.String,
});

export const KitLayer = Schema.Struct({
  name: Schema.String,
  variants: Schema.Union([
    Schema.Record(Schema.String, KitTake),
    Schema.Tuple([]),
  ]),
});

export const Kit = Schema.Struct({
  layers: Schema.Array(KitLayer),
  picks: Picks,
  preset: Schema.String,
});

export const KitListing = Schema.Record(Schema.String, Kit);

export type KitValue = typeof Kit.Type;

const isEmptyTable = (value: unknown): value is readonly [] =>
  Array.isArray(value);

export const takesOfLayer = (
  layer: typeof KitLayer.Type
): Readonly<Record<string, typeof KitTake.Type>> =>
  isEmptyTable(layer.variants) ? {} : layer.variants;

const isLayerList = (
  layers: (typeof KitTake.Type)["layers"]
): layers is readonly Schema.Json[] => Array.isArray(layers);

export const takeLayers = (take: typeof KitTake.Type): readonly Schema.Json[] =>
  isLayerList(take.layers) ? take.layers : [];

export const kitPicks = (kit: KitValue): Readonly<Record<string, string>> =>
  isEmptyTable(kit.picks) ? {} : kit.picks;
