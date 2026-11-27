import { blocksPick } from "@gds/model";
import type { Asset, LayerDef, Render, Variant } from "@gds/model";
import { Option, Predicate, Schema } from "effect";

type AssetValue = typeof Asset.Type;

type VariantValue = typeof Variant.Type;

type RenderValue = typeof Render.Type;

export type Picks = Readonly<Record<string, string>>;

export const pickedTakes = (
  asset: AssetValue,
  layers: readonly (typeof LayerDef.Type)[]
): Picks =>
  Object.fromEntries(
    layers.flatMap((layer) => {
      const picked = asset.mix[layer.id];

      const known = asset.layers[layer.id]?.variants.some(
        ({ id }) => id === picked
      );

      return picked !== undefined && known === true
        ? [[layer.id, picked] as const]
        : [];
    })
  );

export const drawnPicks = (
  picks: Picks,
  layers: readonly (typeof LayerDef.Type)[]
): Picks =>
  Object.fromEntries(
    Object.entries(picks).filter(
      ([layer]) =>
        layers.find((candidate) => candidate.id === layer)?.renderKind !==
        "playable"
    )
  );

export const takeName = (
  layerTitle: string,
  variant: { readonly id: string; readonly label: string }
) =>
  variant.label.startsWith(`${layerTitle} `)
    ? variant.label.slice(layerTitle.length + 1)
    : variant.label;

export const composeKey = (asset: string, picks: Picks) =>
  `${asset}|${Object.entries(picks)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([layer, take]) => `${layer}=${take}`)
    .join(",")}`;

export const failingGates = (variant: VariantValue) =>
  (variant.gates ?? []).filter(blocksPick);

export const isPickable = (variant: VariantValue) =>
  failingGates(variant).length === 0;

export const isWaiting = (render: RenderValue | undefined) =>
  render?.pending !== undefined;

export const gateValue = (value: Schema.Json): string =>
  Predicate.isString(value) ? value : JSON.stringify(value);

export const viewsOf = (render: RenderValue | undefined) =>
  render === undefined || isWaiting(render) ? [] : (render.views ?? []);

export const viewOf = (render: RenderValue | undefined, camera: string) =>
  Option.fromNullishOr(viewsOf(render).find((view) => view.camera === camera));

const RowEdit = Schema.Struct({
  file: Schema.String,
  path: Schema.String,
  value: Schema.Json,
});

const decodeRows = Schema.decodeUnknownOption(Schema.Array(RowEdit));

export type RowEditValue = typeof RowEdit.Type;

export const rowsOf = (variant: VariantValue): readonly RowEditValue[] =>
  Option.getOrElse(decodeRows(variant.params.rows), () => []);

export const hasRows = (variant: VariantValue) => rowsOf(variant).length > 0;

const isJsonObject = Schema.is(Schema.Record(Schema.String, Schema.Json));

const sortedKeys = (_key: string, item: Schema.Json): Schema.Json =>
  isJsonObject(item) && !Array.isArray(item)
    ? Object.fromEntries(
        Object.entries(item).toSorted(([left], [right]) =>
          left.localeCompare(right)
        )
      )
    : item;

const canonical = (value: Schema.Json) => JSON.stringify(value, sortedKeys);

const sameJson = (left: Schema.Json, right: Schema.Json) =>
  canonical(left) === canonical(right);

export interface RowChange {
  readonly file: string;
  readonly path: string;
  readonly from: Option.Option<Schema.Json>;
  readonly to: Schema.Json;
}

const rowId = (row: { readonly file: string; readonly path: string }) =>
  JSON.stringify([row.file, row.path]);

export const rowDiff = (
  current: VariantValue | undefined,
  variant: VariantValue
): readonly RowChange[] => {
  const before = new Map(
    (current === undefined ? [] : rowsOf(current)).map((row) => [
      rowId(row),
      row.value,
    ])
  );

  return rowsOf(variant).flatMap((row) => {
    const from = Option.fromNullishOr(before.get(rowId(row)));

    return Option.exists(from, (value) => sameJson(value, row.value))
      ? []
      : [{ file: row.file, from, path: row.path, to: row.value }];
  });
};
