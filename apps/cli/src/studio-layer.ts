import { GateLedger } from "@gds/adapter-command";
import { FileStore, GameFolder, SourcedStore, StudioPack } from "@gds/store";
import { Layer } from "effect";

import {
  CommandApply,
  CommandSettings,
  CommandSource,
  GatedRenderer,
  GatedStore,
} from "./command-studios.js";
import {
  RobloxStudios,
  StudioCheck,
  StudioRenderer,
  StudioSource,
} from "./roblox-studios.js";

export const studioLayer = (game: Layer.Layer<GameFolder>) => {
  const backends = RobloxStudios.layer;
  const files = FileStore;
  const commands = CommandSettings;
  const ledger = GateLedger.layer.pipe(Layer.provide(commands));

  const source = CommandSource.pipe(
    Layer.provide(StudioSource),
    Layer.provide(Layer.mergeAll(files, backends, commands))
  );

  const store = GatedStore.pipe(
    Layer.provide(SourcedStore),
    Layer.provide(Layer.mergeAll(source, files, ledger))
  );

  const renderer = GatedRenderer.pipe(Layer.provide(StudioRenderer));

  return Layer.mergeAll(StudioPack, renderer, StudioCheck, CommandApply).pipe(
    Layer.provideMerge(store),
    Layer.provideMerge(source),
    Layer.provide(backends),
    Layer.provide(ledger),
    Layer.provide(commands),
    Layer.provide(game)
  );
};

export const configuredStudioLayer = studioLayer(GameFolder.layer);
