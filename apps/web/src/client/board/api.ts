import type { Asset, Render, RoundRequest } from "@gds/model";
import { Context, DateTime, Effect, Layer, Ref } from "effect";

import { BoardApiFailed } from "./board-api-failed.js";
import type { BoardAssetValue } from "./model.js";

export interface PickInput {
  readonly studio: string;
  readonly asset: string;
  readonly layer: string;
  readonly variant: string;
  readonly note: string;
  readonly by: string;
}

export interface RoundInput {
  readonly studio: string;
  readonly asset: string;
  readonly layer: string;
  readonly axis: string;
  readonly note: string;
}

export interface RenderInput {
  readonly studio: string;
  readonly asset: string;
  readonly layer: string;
  readonly variant: string;
  readonly mix?: Readonly<Record<string, string>>;
}

type AssetValue = typeof Asset.Type;

export class BoardApi extends Context.Service<
  BoardApi,
  {
    readonly pick: (
      input: PickInput
    ) => Effect.Effect<AssetValue, BoardApiFailed>;
    readonly round: (
      input: RoundInput
    ) => Effect.Effect<typeof RoundRequest.Type, BoardApiFailed>;
    readonly render: (
      input: RenderInput
    ) => Effect.Effect<typeof Render.Type, BoardApiFailed>;
  }
>()("@gds/web/BoardApi") {}

const failed = (message: string) => new BoardApiFailed({ message });

const findAsset = (
  assets: ReadonlyMap<string, AssetValue>,
  input: {
    readonly studio: string;
    readonly asset: string;
    readonly layer: string;
  }
) => {
  const asset = assets.get(input.asset);

  if (asset === undefined || asset.studio !== input.studio) {
    return Effect.fail(failed(`No asset ${input.asset} in ${input.studio}.`));
  }

  const layer = asset.layers[input.layer];

  if (layer === undefined) {
    return Effect.fail(failed(`No layer ${input.layer} in ${input.asset}.`));
  }

  return Effect.succeed({ asset, layer });
};

export const withPick = (
  asset: AssetValue,
  input: PickInput,
  at: string
): AssetValue => {
  const layer = asset.layers[input.layer];

  if (layer === undefined) {
    return asset;
  }

  return {
    ...asset,
    layers: {
      ...asset.layers,
      [input.layer]: {
        ...layer,
        picks: [
          ...layer.picks,
          {
            at,
            by: input.by,
            layer: input.layer,
            note: input.note,
            variant: input.variant,
          },
        ],
      },
    },
    mix: { ...asset.mix, [input.layer]: input.variant },
  };
};

export const memoryBoardApi = (initial: readonly BoardAssetValue[]) =>
  Layer.effect(
    BoardApi,
    Effect.gen(function* makeMemoryBoardApi() {
      const store = yield* Ref.make(
        new Map(initial.map((entry) => [entry.asset.id, entry.asset]))
      );

      const pick = Effect.fn("BoardApi.memory.pick")(function* pick(
        input: PickInput
      ) {
        const assets = yield* Ref.get(store);
        const { layer } = yield* findAsset(assets, input);

        if (!layer.variants.some((variant) => variant.id === input.variant)) {
          return yield* failed(
            `No variant ${input.variant} on layer ${input.layer}.`
          );
        }

        const at = DateTime.formatIso(yield* DateTime.now);
        const current = assets.get(input.asset);

        if (current === undefined) {
          return yield* failed(`No asset ${input.asset}.`);
        }

        const next = withPick(current, input, at);
        yield* Ref.set(store, new Map([...assets, [input.asset, next]]));

        return next;
      });

      const round = Effect.fn("BoardApi.memory.round")(function* round(
        input: RoundInput
      ) {
        const assets = yield* Ref.get(store);
        const { asset } = yield* findAsset(assets, input);

        if (asset.mix[input.layer] === undefined) {
          return yield* failed(
            `Layer ${input.layer} has no pick yet. Pick a variant before asking for a round.`
          );
        }

        const at = DateTime.formatIso(yield* DateTime.now);

        return { ...input, at };
      });

      const render = Effect.fn("BoardApi.memory.render")(function* render(
        input: RenderInput
      ) {
        const { layer } = yield* findAsset(yield* Ref.get(store), input);
        const found = layer.variants.find(({ id }) => id === input.variant);

        if (found?.render === undefined) {
          return yield* failed(
            `No render for ${input.variant} on layer ${input.layer} in the fixture.`
          );
        }

        return found.render;
      });

      return { pick, render, round };
    })
  );
