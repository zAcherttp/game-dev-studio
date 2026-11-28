import { toRpcGroup } from "@gds/capability/rpc-group";
import { listStudiosContract } from "@gds/model";
import { Cause, Context, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

import { AnswerResult, Records } from "../domain/decision.ts";
import type { PageValue, StudioLinkValue } from "../domain/page.ts";
import { hostPath, StudioConfig } from "../domain/page.ts";
import { StudioUnavailable } from "../domain/studio-unavailable.ts";
import { TreeNode } from "../domain/tree.ts";

export const failureText = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);

  return Schema.is(StudioUnavailable)(error)
    ? error.message
    : "Something went wrong loading this.";
};

export interface Answer {
  readonly choice: string;
  readonly digest: string;
  readonly id: string;
  readonly note: string;
  readonly text: string;
}

const studiosGroup = toRpcGroup([listStudiosContract]).group;

const unavailable = (what: string) => () =>
  new StudioUnavailable({ message: what });

const TOKEN = /<meta name="decisions-token" content="(?<token>[0-9a-f]+)">/u;

export class Studio extends Context.Service<
  Studio,
  {
    readonly answer: (
      page: PageValue,
      answer: Answer
    ) => Effect.Effect<typeof AnswerResult.Type, StudioUnavailable>;
    readonly config: Effect.Effect<typeof StudioConfig.Type, StudioUnavailable>;
    readonly records: (
      page: PageValue
    ) => Effect.Effect<typeof Records.Type, StudioUnavailable>;
    readonly studios: Effect.Effect<
      readonly StudioLinkValue[],
      StudioUnavailable
    >;
    readonly tree: (
      page: PageValue
    ) => Effect.Effect<typeof TreeNode.Type, StudioUnavailable>;
  }
>()("gds/Studio") {
  static readonly layerHttp = Layer.effect(
    Studio,
    Effect.gen(function* layerHttp() {
      const http = yield* HttpClient.HttpClient;
      const client = http.pipe(HttpClient.filterStatusOk);

      const config = client
        .get("/gds/config.json")
        .pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(StudioConfig)),
          Effect.mapError(
            unavailable(
              "The studio's config did not load. Fix: start it with scripts/devstudio.sh serve."
            )
          )
        );

      const studios = Effect.gen(function* listStudios() {
        const rpc = yield* RpcClient.make(studiosGroup);
        const result = yield* rpc.listStudios({});

        return result.studios.map((studio) => ({
          id: studio.id,
          title: studio.title,
        }));
      }).pipe(
        Effect.scoped,
        Effect.provide(
          RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
            Layer.provide(RpcSerialization.layerJson)
          )
        ),
        Effect.provideService(HttpClient.HttpClient, http),
        Effect.mapError(
          unavailable(
            "The dev studio API did not answer, so no studios are listed. Fix: run scripts/devstudio.sh serve from the game."
          )
        )
      );

      const tree = (page: PageValue) =>
        client
          .get(hostPath(page, ""))
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(TreeNode)),
            Effect.mapError(unavailable(`${page.title} did not load.`))
          );

      const records = (page: PageValue) =>
        client
          .get(hostPath(page, "/api/records"))
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(Records)),
            Effect.mapError(
              unavailable(
                `${page.title} did not load.${page.hint === undefined ? "" : ` Run ${page.hint}.`}`
              )
            )
          );

      const answer = (page: PageValue, body: Answer) =>
        Effect.gen(function* postAnswer() {
          const html = yield* client
            .get(hostPath(page, "/"))
            .pipe(Effect.flatMap((response) => response.text));

          const token = TOKEN.exec(html)?.groups?.token ?? "";

          const response = yield* HttpClientRequest.post(
            hostPath(page, "/api/edit")
          ).pipe(
            HttpClientRequest.setHeader("X-Decisions-Token", token),
            HttpClientRequest.bodyJsonUnsafe({ action: "answer", ...body }),
            client.execute
          );

          return yield* HttpClientResponse.schemaBodyJson(AnswerResult)(
            response
          );
        }).pipe(
          Effect.mapError(
            unavailable(`The answer did not reach ${page.title}.`)
          )
        );

      return Studio.of({ answer, config, records, studios, tree });
    })
  );
}
