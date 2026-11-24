import { NodeHttpServer } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { CallLog, OutcomeSchema, devtoolsLayer } from "@gds/devtools";
import { NotBuilt } from "@gds/model";
import { Effect, Layer, Schema } from "effect";
import { HttpClient, HttpRouter, HttpServer } from "effect/http";
import { HttpApiClient } from "effect/http-api";

import {
  capabilities,
  devtoolsRoutes,
  http,
  routes,
  serverLayer,
} from "../src/surfaces.js";

const decodeOpenApi = Schema.decodeUnknownSync(
  Schema.Struct({ paths: Schema.Record(Schema.String, Schema.Unknown) })
);

const AppLayer = HttpRouter.serve(routes, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

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
    "returns the typed not-built failure through the generated client",
    () =>
      Effect.gen(function* failsNotBuilt() {
        const client = yield* HttpApiClient.make(http.api);

        const error = yield* client.capabilities
          .getAsset({ payload: { asset: "fireball", studio: "vfx" } })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(NotBuilt);
        expect(error).toMatchObject({ capability: "getAsset" });
      }).pipe(Effect.provide(AppLayer))
  );

  it.effect("records REST calls when served with devtools", () =>
    Effect.gen(function* recordsRestCalls() {
      const client = yield* HttpApiClient.make(http.api);
      yield* client.capabilities.listStudios({ payload: {} }).pipe(Effect.flip);

      const { entries } = yield* (yield* CallLog).snapshot;
      const [entry] = entries;

      expect(entries).toHaveLength(1);
      expect(entry).toMatchObject({ capability: "listStudios", input: {} });
      expect(
        entry !== undefined && OutcomeSchema.guards.Failed(entry.outcome)
      ).toBe(true);
    }).pipe(
      Effect.provide(
        HttpRouter.serve(devtoolsRoutes, {
          disableListenLog: true,
          disableLogger: true,
        }).pipe(
          Layer.provideMerge(NodeHttpServer.layerTest),
          Layer.provideMerge(devtoolsLayer())
        )
      )
    )
  );
});
