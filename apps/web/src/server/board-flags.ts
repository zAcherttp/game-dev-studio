import { toRpcGroup } from "@gds/capability/rpc-group";
import {
  getAssetContract,
  layersOfContract,
  listAssetsContract,
  listStudiosContract,
} from "@gds/model";
import { Config, Effect, Exit, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

import { layersOf } from "../client/board/layers.js";
import type { FlagsValue } from "../client/board/model.js";

const loadGroup = toRpcGroup([
  listStudiosContract,
  listAssetsContract,
  layersOfContract,
  getAssetContract,
]).group;

export const studioUrl = Config.URL("GDS_STUDIO_URL").pipe(
  Config.withDefault(new URL("http://127.0.0.1:4310"))
);

export class BoardUnavailable extends Schema.TaggedError<
  BoardUnavailable,
  { readonly brand: unique symbol }
>()("BoardUnavailable", { message: Schema.String }) {}

const unavailable = (url: URL, what: string) =>
  new BoardUnavailable({
    message: `The dev studio server at ${url.origin} could not ${what}. The board reads studios and picks from it. Fix: run \`pnpm --filter @gds/cli cli serve --port ${url.port || "80"}\` with \`GDS_GAME\` set.`,
  });

export const loadBoardFlags = Effect.fn("web.loadBoardFlags")(
  function* loadBoardFlags(studioId: string | undefined, by: string) {
    const url = yield* studioUrl;

    return yield* Effect.gen(function* load() {
      const client = yield* RpcClient.make(loadGroup);
      const { studios } = yield* client.listStudios({});

      const studio =
        studioId === undefined
          ? studios[0]
          : studios.find((entry) => entry.id === studioId);

      if (studio === undefined) {
        return yield* unavailable(
          url,
          studioId === undefined ? "list any studio" : `find studio ${studioId}`
        );
      }

      const { assets: summaries } = yield* client.listAssets({
        studio: studio.id,
      });

      const assets = yield* Effect.all(
        summaries.map(({ id }) =>
          client.getAsset({ asset: id, studio: studio.id })
        )
      );

      const given = yield* Effect.all(
        summaries.map(({ id }) =>
          client.layersOf({ asset: id, studio: studio.id }).pipe(Effect.exit)
        )
      );

      const flags: FlagsValue = {
        assets: assets.map((asset, index) => {
          const kit = given[index];

          return {
            asset,
            layers: layersOf(
              studio,
              asset,
              kit !== undefined && Exit.isSuccess(kit) ? kit.value.layers : []
            ),
          };
        }),
        by,
        studio,
      };

      return flags;
    }).pipe(
      Effect.scoped,
      Effect.provide(
        RpcClient.layerProtocolHttp({
          url: new URL("/rpc", url).href,
        }).pipe(
          Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson])
        )
      ),
      Effect.mapError((error) =>
        Schema.is(BoardUnavailable)(error)
          ? error
          : unavailable(url, `answer: ${error._tag}`)
      )
    );
  }
);
