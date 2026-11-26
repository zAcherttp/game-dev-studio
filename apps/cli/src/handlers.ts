import { PLAN_BACKEND } from "@gds/adapter-roblox";
import { implement } from "@gds/capability/implement";
import {
  AdapterFailed,
  Apply,
  Check,
  Pack,
  Renderer,
  Source,
  Store,
  UnknownLayer,
  UnknownStudio,
  UnknownVariant,
  addVariantsContract,
  getAssetContract,
  getPackContract,
  layersOfContract,
  listAssetsContract,
  listStudiosContract,
  notBuilt,
  openCheckContract,
  pickContract,
  renderContract,
  renderMixContract,
  roundContract,
} from "@gds/model";
import type { Asset } from "@gds/model";
import {
  addToLayer,
  factsOf,
  ownsLayers,
  pickOnLayer,
  roundOnLayer,
} from "@gds/store";
import { DateTime, Effect, Option } from "effect";

interface Where {
  readonly studio: string;
  readonly asset: string;
  readonly layer: string;
}

const studioDef = Effect.fnUntraced(function* studioDef(studio: string) {
  const found = (yield* Store.use((store) => store.listStudios)).find(
    (entry) => entry.id === studio
  );

  if (found === undefined) {
    return yield* new UnknownStudio({ studio });
  }

  return found;
});

const layerOf = Effect.fnUntraced(function* layerOf(
  asset: typeof Asset.Type,
  where: Where
) {
  const entry = asset.layers[where.layer];

  if (entry === undefined) {
    return yield* new UnknownLayer(where);
  }

  return entry;
});

const getStoredAsset = (studio: string, asset: string) =>
  Store.use((store) => store.getAsset(studio, asset));

const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));

export const listStudios = implement(listStudiosContract, () =>
  Store.use((store) => store.listStudios).pipe(
    Effect.map((studios) => ({ studios }))
  )
);

export const listAssets = implement(listAssetsContract, ({ studio }) =>
  Store.use((store) => store.listAssets(studio)).pipe(
    Effect.map((assets) => ({ assets }))
  )
);

export const getAsset = implement(getAssetContract, ({ asset, studio }) =>
  getStoredAsset(studio, asset)
);

export const layersOf = implement(
  layersOfContract,
  Effect.fn("layersOf")(function* layersOf({ asset, studio }) {
    const def = yield* studioDef(studio);
    const stored = yield* getStoredAsset(studio, asset);

    const sourced = yield* Source.use((source) =>
      source.layersOf(studio, asset)
    ).pipe(
      Effect.catchTag(["UnknownStudio", "UnknownAsset"], () =>
        Effect.succeed([])
      )
    );

    const known = new Map(
      [...def.layers, ...sourced].map((layer) => [layer.id, layer])
    );

    const renderKind = def.layers[0]?.renderKind ?? def.renderKinds[0] ?? "gif";

    return {
      layers: Object.keys(stored.layers).map((id, order) => ({
        ...(known.get(id) ?? { id, renderKind, title: id }),
        order,
      })),
    };
  })
);

export const addVariants = implement(
  addVariantsContract,
  Effect.fn("addVariants")(function* addVariants(input) {
    const { asset, layer, studio, variants } = input;
    const where = { asset, layer, studio };
    const def = yield* studioDef(studio);

    const stored = yield* getStoredAsset(studio, asset).pipe(
      Effect.catchTag("UnknownAsset", () => Effect.void)
    );

    const known =
      stored === undefined ||
      stored.layers[layer] !== undefined ||
      def.layers.some((entry) => entry.id === layer) ||
      ownsLayers(def, Object.keys(stored.layers));

    const stray = variants.find((variant) => variant.layer !== layer);

    if (!known) {
      return yield* new UnknownLayer(where);
    }

    if (stray !== undefined) {
      return yield* new UnknownLayer({ ...where, layer: stray.layer });
    }

    const entry = stored?.layers[layer];

    yield* addToLayer(
      factsOf(where, entry),
      variants.map(({ id }) => id)
    );

    const roundParent =
      entry?.making === undefined ? undefined : entry.picks.at(-1)?.variant;

    const parented =
      roundParent === undefined
        ? variants
        : variants.map((variant) =>
            variant.parent === undefined
              ? { ...variant, parent: roundParent }
              : variant
          );

    return yield* Store.use((store) =>
      store.putVariants(studio, asset, layer, parented)
    );
  })
);

export const render = implement(
  renderContract,
  Effect.fn("render")(function* render(input) {
    const { asset, layer, studio, variant } = input;
    const stored = yield* getStoredAsset(studio, asset);
    const entry = yield* layerOf(stored, { asset, layer, studio });
    const found = entry.variants.find(({ id }) => id === variant);

    if (found === undefined) {
      return yield* new UnknownVariant({ asset, layer, studio, variant });
    }

    const request = { asset, layer, studio, variant: found };

    return yield* Renderer.use((renderer) =>
      renderer.render(
        input.mix === undefined
          ? { ...request, mix: stored.mix }
          : { ...request, exact: true, mix: input.mix }
      )
    );
  })
);

export const renderMix = implement(
  renderMixContract,
  Effect.fn("renderMix")(function* renderMix({ asset, studio }) {
    const def = yield* studioDef(studio);

    if (def.renderer !== PLAN_BACKEND) {
      return yield* notBuilt(renderMixContract.name);
    }

    const stored = yield* getStoredAsset(studio, asset);

    const order = [
      ...def.layers.toSorted((a, b) => a.order - b.order).map(({ id }) => id),
      ...Object.keys(stored.layers),
    ];

    const layer = order.find((id) => stored.mix[id] !== undefined);

    if (layer === undefined) {
      return yield* new AdapterFailed({
        adapter: "renderMix",
        message: `Asset ${asset} in studio ${studio} has no picks, so it has no mix to draw. renderMix draws the picked variants together. Fix: pick a variant with \`pick\` first.`,
      });
    }

    const variant = stored.mix[layer] ?? "";
    const entry = yield* layerOf(stored, { asset, layer, studio });
    const found = entry.variants.find(({ id }) => id === variant);

    if (found === undefined) {
      return yield* new UnknownVariant({ asset, layer, studio, variant });
    }

    return yield* Renderer.use((renderer) =>
      renderer.render({
        asset,
        exact: true,
        layer,
        mix: stored.mix,
        studio,
        variant: found,
      })
    );
  })
);

export const pick = implement(
  pickContract,
  Effect.fn("pick")(function* pick(input) {
    const { asset, by, layer, note, studio, variant } = input;
    const where = { asset, layer, studio };
    const stored = yield* getStoredAsset(studio, asset);
    const entry = yield* layerOf(stored, where);

    yield* pickOnLayer(factsOf(where, entry), variant);

    const chosen = entry.variants.find(({ id }) => id === variant);
    const applier = yield* Effect.serviceOption(Apply);

    if (chosen !== undefined && Option.isSome(applier)) {
      yield* applier.value.apply({ asset, layer, studio, variant: chosen });
    }

    const at = yield* now;

    return yield* Store.use((store) =>
      store.pick(studio, asset, { at, by, layer, note, variant })
    );
  })
);

export const round = implement(
  roundContract,
  Effect.fn("round")(function* round(input) {
    const { asset, axis, layer, note, studio } = input;
    const where = { asset, layer, studio };
    const stored = yield* getStoredAsset(studio, asset);
    const entry = yield* layerOf(stored, where);

    yield* roundOnLayer(factsOf(where, entry));

    const request = { asset, at: yield* now, axis, layer, note, studio };

    yield* Store.use((store) => store.round(studio, asset, request));

    return request;
  })
);

export const getPack = implement(getPackContract, ({ studio }) =>
  Pack.use((pack) => pack.get(studio))
);

export const openCheck = implement(
  openCheckContract,
  Effect.fn("openCheck")(function* openCheck(input) {
    const stored = yield* getStoredAsset(input.studio, input.asset);

    return yield* Check.use((check) =>
      check.open({ asset: input.asset, mix: stored.mix, studio: input.studio })
    );
  })
);

export const studioCapabilities = [
  listStudios,
  listAssets,
  getAsset,
  layersOf,
  addVariants,
  render,
  renderMix,
  pick,
  round,
  getPack,
  openCheck,
] as const;
