import { AdapterFailed, Source, Store, UnknownAsset } from "@gds/model";
import type {
  Asset,
  AssetLayer,
  AssetSummary,
  UnknownStudio,
  Variant,
} from "@gds/model";
import { Effect, Layer, Option } from "effect";

type AssetValue = typeof Asset.Type;

type LayerValue = typeof AssetLayer.Type;

type VariantValue = typeof Variant.Type;

const emptyLayer: LayerValue = { picks: [], variants: [] };

const withTakes = (
  stored: LayerValue,
  takes: readonly VariantValue[]
): LayerValue => {
  const own = new Map(stored.variants.map((variant) => [variant.id, variant]));
  const fromSource = new Set(takes.map(({ id }) => id));

  return {
    ...stored,
    variants: [
      ...takes.map((take) => own.get(take.id) ?? take),
      ...stored.variants.filter(({ id }) => !fromSource.has(id)),
    ],
  };
};

export const mergeSourced = (
  stored: Option.Option<AssetValue>,
  summary: typeof AssetSummary.Type,
  studio: string,
  layers: readonly (readonly [string, readonly VariantValue[]])[]
): AssetValue => {
  const base = Option.getOrElse(stored, (): AssetValue => ({
    id: summary.id,
    layers: {},
    mix: {},
    studio,
    title: summary.title,
  }));

  const sourced = new Set(layers.map(([id]) => id));

  return {
    ...base,
    layers: Object.fromEntries([
      ...layers.map(
        ([id, takes]) =>
          [
            id,
            withTakes(
              Object.hasOwn(base.layers, id)
                ? (base.layers[id] ?? emptyLayer)
                : emptyLayer,
              takes
            ),
          ] as const
      ),
      ...Object.entries(base.layers).filter(([id]) => !sourced.has(id)),
    ]),
  };
};

export const SourcedStore = Layer.effect(
  Store,
  Effect.gen(function* makeSourcedStore() {
    const inner = yield* Store;
    const source = yield* Source;

    const sourcedSummaries = (studio: string) =>
      source.listAssets(studio).pipe(
        Effect.asSome,
        Effect.catchTag("UnknownStudio", () => Effect.succeedNone)
      );

    const listAssets = Effect.fn("SourcedStore.listAssets")(
      function* listAssets(studio: string) {
        const stored = yield* inner.listAssets(studio);
        const sourced = yield* sourcedSummaries(studio);
        const known = new Set(stored.map(({ id }) => id));

        return [
          ...stored,
          ...Option.getOrElse(sourced, () => []).filter(
            ({ id }) => !known.has(id)
          ),
        ].toSorted((left, right) => left.id.localeCompare(right.id));
      }
    );

    const sourcedLayers = Effect.fnUntraced(function* sourcedLayers(
      studio: string,
      asset: string
    ) {
      const summaries = yield* sourcedSummaries(studio);

      const found = Option.isSome(summaries)
        ? summaries.value.find(({ id }) => id === asset)
        : undefined;

      if (found === undefined) {
        return Option.none<{
          readonly layers: readonly (readonly [
            string,
            readonly VariantValue[],
          ])[];
          readonly summary: typeof AssetSummary.Type;
        }>();
      }

      const defs = yield* source.layersOf(studio, asset);

      const layers = yield* Effect.forEach(
        defs.toSorted((left, right) => left.order - right.order),
        (def) =>
          source.takesOf(studio, asset, def.id).pipe(
            Effect.map((takes) => [def.id, takes] as const),
            Effect.catchTag("UnknownLayer", ({ layer }) =>
              Effect.fail(
                new AdapterFailed({
                  adapter: "store",
                  message: `The source listed layer ${layer} of ${studio}/${asset} and then had no takes for it. The kit changed while it was read. Fix: read the asset again.`,
                })
              )
            )
          )
      );

      return Option.some({ layers, summary: found });
    });

    const storedAsset = (studio: string, asset: string) =>
      inner.getAsset(studio, asset).pipe(
        Effect.asSome,
        Effect.catchTag("UnknownAsset", () => Effect.succeedNone)
      );

    const getAsset = Effect.fn("SourcedStore.getAsset")(function* getAsset(
      studio: string,
      asset: string
    ) {
      const stored = yield* storedAsset(studio, asset);

      const sourced = yield* sourcedLayers(studio, asset).pipe(
        Effect.catchTag("UnknownAsset", () => Effect.succeedNone)
      );

      if (Option.isNone(sourced)) {
        if (Option.isNone(stored)) {
          return yield* new UnknownAsset({ asset, studio });
        }

        return stored.value;
      }

      return mergeSourced(
        stored,
        sourced.value.summary,
        studio,
        sourced.value.layers
      );
    });

    const ensureStored = Effect.fnUntraced(function* ensureStored(
      studio: string,
      asset: string,
      layer: string
    ): Effect.fn.Return<void, UnknownAsset | UnknownStudio | AdapterFailed> {
      const stored = yield* storedAsset(studio, asset);

      if (Option.isSome(stored)) {
        return;
      }

      yield* getAsset(studio, asset);
      yield* inner.putVariants(studio, asset, layer, []);
    });

    return Store.of({
      getAsset,
      history: inner.history,
      listAssets,
      listStudios: inner.listStudios,
      pick: (studio, asset, chosen) =>
        ensureStored(studio, asset, chosen.layer).pipe(
          Effect.andThen(inner.pick(studio, asset, chosen)),
          Effect.andThen(getAsset(studio, asset))
        ),
      putVariants: (studio, asset, layer, variants) =>
        inner
          .putVariants(studio, asset, layer, variants)
          .pipe(Effect.andThen(getAsset(studio, asset))),
      round: (studio, asset, request) =>
        ensureStored(studio, asset, request.layer).pipe(
          Effect.andThen(inner.round(studio, asset, request)),
          Effect.andThen(getAsset(studio, asset))
        ),
    });
  })
);
