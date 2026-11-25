import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { CallLog, OutcomeSchema, devtoolsLayer } from "@gds/devtools";
import { UnknownAsset } from "@gds/model";
import { GameFolder } from "@gds/store";
import { Effect, Layer, Schema } from "effect";
import { HttpClient, HttpRouter, HttpServer } from "effect/http";
import { HttpApiClient } from "effect/http-api";

import { studioLayer } from "../src/studio-layer.js";
import {
  capabilities,
  devtoolsRoutes,
  http,
  routes,
  serverLayer,
} from "../src/surfaces.js";

const fixtureGame = `${import.meta.dirname}/fixtures/game`;

const game = studioLayer(GameFolder.at(fixtureGame)).pipe(
  Layer.provideMerge(NodeServices.layer)
);

const decodeOpenApi = Schema.decodeUnknownSync(
  Schema.Struct({ paths: Schema.Record(Schema.String, Schema.Unknown) })
);

const AppLayer = HttpRouter.serve(routes, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provide(game), Layer.provideMerge(NodeHttpServer.layerTest));

describe("serve routes", () => {
  it.effect("binds serve to the loopback interface only", () =>
    Effect.gen(function* bindsLoopback() {
      const server = yield* HttpServer.HttpServer;

      expect(HttpServer.formatAddress(server.address)).toMatch(
        /^http:\/\/127\.0\.0\.1:\d+$/u
      );
    }).pipe(Effect.provide(serverLayer(0)))
  );

  it.effect("publishes the OpenAPI document and the docs page", () =>
    Effect.gen(function* publishesDocs() {
      const openapi = yield* HttpClient.get("/openapi.json");
      expect(openapi.status).toBe(200);
      const document = decodeOpenApi(yield* openapi.json);
      expect(Object.keys(document.paths)).toEqual(
        capabilities.map((capability) => `/${capability.contract.name}`)
      );

      const docs = yield* HttpClient.get("/docs");
      expect(docs.status).toBe(200);
      expect(docs.headers["content-type"]).toContain("text/html");
    }).pipe(Effect.provide(AppLayer))
  );

  it.effect(
    "reads an asset and returns a typed failure through the generated client",
    () =>
      Effect.gen(function* readsAsset() {
        const client = yield* HttpApiClient.make(http.api);

        const asset = yield* client.capabilities.getAsset({
          payload: { asset: "fire", studio: "vfx" },
        });

        const error = yield* client.capabilities
          .getAsset({ payload: { asset: "fireball", studio: "vfx" } })
          .pipe(Effect.flip);

        expect(asset.mix).toEqual({ core: "core-2" });
        expect(error).toBeInstanceOf(UnknownAsset);
        expect(error).toMatchObject({ asset: "fireball" });
      }).pipe(Effect.provide(AppLayer))
  );

  it.effect("records REST calls when served with devtools", () =>
    Effect.gen(function* recordsRestCalls() {
      const client = yield* HttpApiClient.make(http.api);
      yield* client.capabilities
        .getAsset({ payload: { asset: "ice", studio: "vfx" } })
        .pipe(Effect.flip);

      const { entries } = yield* (yield* CallLog).snapshot;
      const [entry] = entries;

      expect(entries).toHaveLength(1);
      expect(entry).toMatchObject({
        capability: "getAsset",
        input: { asset: "ice", studio: "vfx" },
      });
      expect(
        entry !== undefined && OutcomeSchema.guards.Failed(entry.outcome)
      ).toBe(true);
    }).pipe(
      Effect.provide(
        HttpRouter.serve(devtoolsRoutes, {
          disableListenLog: true,
          disableLogger: true,
        }).pipe(
          Layer.provide(game),
          Layer.provideMerge(NodeHttpServer.layerTest),
          Layer.provideMerge(devtoolsLayer())
        )
      )
    )
  );
});
