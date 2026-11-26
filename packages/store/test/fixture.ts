import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Layer, Path } from "effect";

import { FileStore, GameFolder, StudioPack } from "../src/index.js";

export const vfxStudio = {
  gates: ["budget"],
  id: "vfx",
  layers: [
    { id: "core", order: 0, renderKind: "gif", title: "Core" },
    { id: "sparks", order: 1, renderKind: "gif", title: "Sparks" },
  ],
  pack: { files: [{ path: "docs/vfx.md", why: "Kit rules" }] },
  renderKinds: ["gif"],
  renderer: "roblox",
  title: "VFX",
} as const;

export const writeStudio = Effect.fnUntraced(function* writeStudio(
  root: string,
  name: string,
  text: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = path.join(root, "tools", "devstudio", "studios");

  yield* fs.makeDirectory(dir, { recursive: true });
  yield* fs.writeFileString(path.join(dir, name), text);

  return path.join(dir, name);
});

export const tempGame = Effect.gen(function* tempGame() {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "gds-store-" });

  yield* writeStudio(root, "vfx.json", JSON.stringify(vfxStudio));

  return root;
});

export const storeAt = (root: string) =>
  Layer.mergeAll(StudioPack).pipe(
    Layer.provideMerge(FileStore),
    Layer.provide(GameFolder.at(root)),
    Layer.provideMerge(NodeServices.layer)
  );

export const variant = (layer: string, id: string, parent?: string) => {
  const made = {
    generator: "test",
    id,
    label: id,
    layer,
    params: { hue: 0.5 },
  };

  return parent === undefined ? made : { ...made, parent };
};
