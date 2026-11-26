import { toRpcGroup } from "@gds/capability/rpc-group";
import {
  getAssetContract,
  listStudiosContract,
  pickContract,
  roundContract,
} from "@gds/model";
import { Effect, Layer, Match } from "effect";
import { FetchHttpClient } from "effect/http";
import type { RpcClientError } from "effect/rpc";
import { RpcClient, RpcSerialization } from "effect/rpc";

import { BoardApi } from "./api.js";
import type { PickInput, RoundInput } from "./api.js";
import { BoardApiFailed } from "./board-api-failed.js";

export const boardRpcGroup = toRpcGroup([
  listStudiosContract,
  getAssetContract,
  pickContract,
  roundContract,
]).group;

export const STUDIO_RPC_PATH = "/rpc";

type StudioFailure =
  | typeof pickContract.failure.Type
  | typeof roundContract.failure.Type
  | RpcClientError.RpcClientError;

const reload = "Fix: reload the board; the asset file changed.";

export const failureMessage = (failure: StudioFailure): string =>
  Match.value(failure).pipe(
    Match.tagsExhaustive({
      AdapterFailed: ({ message }) => message,
      LayerBusy: ({ layer }) =>
        `Layer ${layer} is making a round, so it cannot take a pick. Fix: wait for its new variants.`,
      NoPick: ({ layer }) =>
        `Layer ${layer} has no pick yet. Fix: pick a variant before asking for a round.`,
      NotBuilt: ({ message }) => message,
      RpcClientError: () =>
        `The dev studio server did not answer at ${STUDIO_RPC_PATH}. Fix: start it with \`pnpm --filter @gds/cli cli serve --port 4310\`.`,
      UnknownAsset: ({ asset, studio }) =>
        `No asset ${asset} in ${studio}. Fix: add variants to it with \`addVariants\` first.`,
      UnknownLayer: ({ asset, layer }) =>
        `No layer ${layer} in ${asset}. ${reload}`,
      UnknownStudio: ({ studio }) =>
        `No studio ${studio} in the game checkout. Fix: add \`tools/devstudio/studios/${studio}.json\` to the game named by \`GDS_GAME\`.`,
      UnknownVariant: ({ layer, variant }) =>
        `No variant ${variant} on layer ${layer}. ${reload}`,
    })
  );

const failed = (failure: StudioFailure) =>
  new BoardApiFailed({ message: failureMessage(failure) });

export const rpcBoardApi = (url: string) =>
  Layer.effect(
    BoardApi,
    Effect.gen(function* makeRpcBoardApi() {
      const client = yield* RpcClient.make(boardRpcGroup);

      return BoardApi.of({
        pick: (input: PickInput) =>
          client.pick(input).pipe(Effect.mapError(failed)),
        round: (input: RoundInput) =>
          client.round(input).pipe(Effect.mapError(failed)),
      });
    })
  ).pipe(
    Layer.provide(RpcClient.layerProtocolHttp({ url })),
    Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson])
  );
