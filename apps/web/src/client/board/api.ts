import type { Asset, Render, RoundRequest } from "@gds/model";
import { Context, DateTime, Effect, Layer, Ref } from "effect";

import { BoardApiFailed } from "./board-api-failed.js";
import type { BoardAssetValue } from "./model.js";
import type { FrameLogValue } from "./playable.js";

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

export interface MixInput {
  readonly studio: string;
  readonly asset: string;
}

export interface RenderInput {
  readonly studio: string;
  readonly asset: string;
  readonly layer: string;
  readonly variant: string;
  readonly mix?: Readonly<Record<string, string>>;
}

export interface LaunchInput {
  readonly studio: string;
  readonly asset: string;
  readonly layer: string;
  readonly take: string;
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
    readonly renderMix: (
      input: MixInput
    ) => Effect.Effect<typeof Render.Type, BoardApiFailed>;
    readonly getAsset: (
      input: MixInput
    ) => Effect.Effect<AssetValue, BoardApiFailed>;
    readonly launch: (
      input: LaunchInput
    ) => Effect.Effect<typeof Render.Type, BoardApiFailed>;
    readonly record: (
      input: MixInput
    ) => Effect.Effect<{ readonly record: string }, BoardApiFailed>;
    readonly frames: (
      path: string
    ) => Effect.Effect<FrameLogValue, BoardApiFailed>;
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

export type MixRenders = (asset: AssetValue) => typeof Render.Type | undefined;

export interface PlayFixture {
  readonly launches?: Readonly<Record<string, typeof Render.Type>>;
  readonly frames?: Readonly<Record<string, FrameLogValue>>;
}

export const memoryBoardApi = (
  initial: readonly BoardAssetValue[],
  mixRenders?: MixRenders,
  play: PlayFixture = {}
) =>
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

      const renderMix = Effect.fn("BoardApi.memory.renderMix")(
        function* renderMix(input: MixInput) {
          const asset = (yield* Ref.get(store)).get(input.asset);

          if (asset === undefined || asset.studio !== input.studio) {
            return yield* failed(`No asset ${input.asset} in ${input.studio}.`);
          }

          const drawn = mixRenders?.(asset);

          if (drawn === undefined) {
            return yield* failed(
              `No mix render for ${input.asset} in the fixture.`
            );
          }

          return drawn;
        }
      );

      const getAsset = Effect.fn("BoardApi.memory.getAsset")(function* getAsset(
        input: MixInput
      ) {
        const asset = (yield* Ref.get(store)).get(input.asset);

        if (asset === undefined || asset.studio !== input.studio) {
          return yield* failed(`No asset ${input.asset} in ${input.studio}.`);
        }

        return asset;
      });

      const launch = Effect.fn("BoardApi.memory.launch")(function* launch(
        input: LaunchInput
      ) {
        yield* findAsset(yield* Ref.get(store), input);
        const launched = play.launches?.[input.take];

        if (launched === undefined) {
          return yield* failed(
            `No launch for ${input.take} on layer ${input.layer} in the fixture.`
          );
        }

        return launched;
      });

      const record = Effect.fn("BoardApi.memory.record")(function* record(
        input: MixInput
      ) {
        const assets = yield* Ref.get(store);
        const asset = assets.get(input.asset);

        if (asset === undefined || asset.studio !== input.studio) {
          return yield* failed(`No asset ${input.asset} in ${input.studio}.`);
        }

        const id = `rec-${(asset.records ?? []).length + 1}`;

        const next = {
          ...asset,
          records: [
            ...(asset.records ?? []),
            { id, start: {}, tickRate: 60, ticks: [], version: 1 as const },
          ],
        };

        yield* Ref.set(store, new Map([...assets, [input.asset, next]]));

        return { record: id };
      });

      const frames = Effect.fn("BoardApi.memory.frames")(function* frames(
        path: string
      ) {
        const found = play.frames?.[path];

        if (found === undefined) {
          return yield* failed(`No frame strip at ${path} in the fixture.`);
        }

        return found;
      });

      return {
        frames,
        getAsset,
        launch,
        pick,
        record,
        render,
        renderMix,
        round,
      };
    })
  );
