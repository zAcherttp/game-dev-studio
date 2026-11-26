import { implement } from "@gds/capability/implement";
import {
  Check,
  Pack,
  Renderer,
  Store,
  UnknownLayer,
  UnknownStudio,
  UnknownVariant,
  addVariantsContract,
  getAssetContract,
  getPackContract,
  listStudiosContract,
  openCheckContract,
  pickContract,
  renderContract,
  roundContract,
} from "@gds/model";
import type { Asset } from "@gds/model";
import { addToLayer, factsOf, pickOnLayer, roundOnLayer } from "@gds/store";
import { DateTime, Effect } from "effect";

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

export const getAsset = implement(getAssetContract, ({ asset, studio }) =>
  getStoredAsset(studio, asset)
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
      def.layers.some((entry) => entry.id === layer) ||
      stored?.layers[layer] !== undefined;

    const stray = variants.find((variant) => variant.layer !== layer);

    if (!known) {
      return yield* new UnknownLayer(where);
    }

    if (stray !== undefined) {
      return yield* new UnknownLayer({ ...where, layer: stray.layer });
    }

    yield* addToLayer(
      factsOf(where, stored?.layers[layer]),
      variants.map(({ id }) => id)
    );

    return yield* Store.use((store) =>
      store.putVariants(studio, asset, layer, variants)
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

    return yield* Renderer.use((renderer) =>
      renderer.render({ asset, layer, mix: stored.mix, studio, variant: found })
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
  getAsset,
  addVariants,
  render,
  pick,
  round,
  getPack,
  openCheck,
] as const;
