import { FileStore, GameFolder, SourcedStore, StudioPack } from "@gds/store";
import { Layer } from "effect";

import {
  RobloxStudios,
  StudioCheck,
  StudioRenderer,
  StudioSource,
} from "./roblox-studios.js";

export const studioLayer = (game: Layer.Layer<GameFolder>) => {
  const backends = RobloxStudios.layer;
  const files = FileStore;

  const source = StudioSource.pipe(Layer.provide(Layer.merge(files, backends)));

  const store = SourcedStore.pipe(Layer.provide(Layer.merge(source, files)));

  return Layer.mergeAll(StudioPack, StudioRenderer, StudioCheck).pipe(
    Layer.provideMerge(store),
    Layer.provideMerge(source),
    Layer.provide(backends),
    Layer.provide(game)
  );
};

export const configuredStudioLayer = studioLayer(GameFolder.layer);
