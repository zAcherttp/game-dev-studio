import { AdapterFailed, Check, Renderer } from "@gds/model";
import { FileStore, GameFolder, StudioPack } from "@gds/store";
import { Effect, Layer } from "effect";

const notConnected = (adapter: string, port: string) =>
  new AdapterFailed({
    adapter,
    message: `No ${port} adapter is connected yet, so the dev studio cannot ${adapter === "renderer" ? "draw a variant" : "open the engine check"}. Fix: provide a \`${port}\` layer in \`apps/cli/src/studio-layer.ts\`.`,
  });

export const RendererNotConnected = Layer.succeed(
  Renderer,
  Renderer.of({
    render: () => Effect.fail(notConnected("renderer", "Renderer")),
  })
);

export const CheckNotConnected = Layer.succeed(
  Check,
  Check.of({ open: () => Effect.fail(notConnected("check", "Check")) })
);

export const studioLayer = (game: Layer.Layer<GameFolder>) =>
  Layer.mergeAll(StudioPack, RendererNotConnected, CheckNotConnected).pipe(
    Layer.provideMerge(FileStore),
    Layer.provide(game)
  );

export const configuredStudioLayer = studioLayer(GameFolder.layer);
