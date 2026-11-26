import {
  AdapterFailed,
  StudioDef,
  Store,
  UnknownAsset,
  UnknownStudio,
} from "@gds/model";
import type {
  Asset,
  AssetLayer,
  Pick,
  RoundRequest,
  Variant,
} from "@gds/model";
import {
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Semaphore,
} from "effect";

import { assetText, parseAsset } from "./asset-text.js";
import { GameFolder } from "./game-folder.js";

type AssetValue = typeof Asset.Type;

type LayerValue = typeof AssetLayer.Type;

type StudioValue = typeof StudioDef.Type;

const failed = (message: string) =>
  new AdapterFailed({ adapter: "store", message });

const parseStudio = Schema.decodeUnknownEffect(
  Schema.fromJsonString(StudioDef)
);

const io =
  (what: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.mapError((cause) =>
        failed(
          `Could not ${what}: ${String(cause)}. Fix: check that the path exists and is writable, then retry.`
        )
      )
    );

const emptyLayer: LayerValue = { picks: [], variants: [] };

const mixOf = (layers: AssetValue["layers"]): AssetValue["mix"] =>
  Object.fromEntries(
    Object.entries(layers).flatMap(([id, layer]) => {
      const latest = layer.picks.at(-1);

      return latest === undefined ? [] : [[id, latest.variant] as const];
    })
  );

const isStudioLayer = (studio: StudioValue, layer: string) =>
  studio.layers.some((entry) => entry.id === layer);

export const ownsLayers = (
  studio: StudioValue,
  layers: readonly string[]
): boolean => layers.some((layer) => !isStudioLayer(studio, layer));

const withStudioLayers = (studio: StudioValue, asset: AssetValue): AssetValue =>
  ownsLayers(studio, Object.keys(asset.layers))
    ? asset
    : {
        ...asset,
        layers: {
          ...Object.fromEntries(
            studio.layers.map((layer) => [layer.id, emptyLayer])
          ),
          ...asset.layers,
        },
      };

const freshAsset = (
  studio: StudioValue,
  id: string,
  firstLayer: string
): AssetValue =>
  withStudioLayers(studio, {
    id,
    layers: { [firstLayer]: emptyLayer },
    mix: {},
    studio: studio.id,
    title: id,
  });

const updateLayer = (
  asset: AssetValue,
  layer: string,
  change: (current: LayerValue) => LayerValue
): AssetValue => {
  const layers = {
    ...asset.layers,
    [layer]: change(asset.layers[layer] ?? emptyLayer),
  };

  return { ...asset, layers, mix: mixOf(layers) };
};

const withoutMaking = ({ making: _open, ...layer }: LayerValue): LayerValue =>
  layer;

export const FileStore = Layer.effect(
  Store,
  Effect.gen(function* makeFileStore() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const game = yield* GameFolder;
    const writes = yield* Semaphore.make(1);

    const studiosDir = game.root.pipe(
      Effect.map((root) => path.join(root, "tools", "devstudio", "studios"))
    );

    const assetPath = (studio: string, asset: string) =>
      game.root.pipe(
        Effect.map((root) =>
          path.join(root, "art", "picks", studio, `${asset}.json`)
        )
      );

    const readStudio = Effect.fnUntraced(function* readStudio(
      file: string,
      id: string
    ) {
      const text = yield* fs.readFileString(file).pipe(io(`read ${file}`));

      const studio = yield* parseStudio(text).pipe(
        Effect.mapError((error) =>
          failed(
            `${file} is not a valid studio definition: ${error.message}. Fix: correct that field so the file matches StudioDef in \`packages/model/src/studio.ts\`.`
          )
        )
      );

      if (studio.id !== id) {
        return yield* failed(
          `${file} declares id "${studio.id}" but its file name says "${id}". Fix: rename the file to \`${studio.id}.json\` or set "id" to "${id}".`
        );
      }

      return studio;
    });

    const listStudios = Effect.gen(function* listStudios() {
      const dir = yield* studiosDir;

      if (!(yield* fs.exists(dir).pipe(io(`check ${dir}`)))) {
        return [];
      }

      const names = (yield* fs.readDirectory(dir).pipe(io(`list ${dir}`)))
        .filter((name) => name.endsWith(".json"))
        .toSorted();

      return yield* Effect.all(
        names.map((name) =>
          readStudio(path.join(dir, name), path.basename(name, ".json"))
        )
      );
    });

    const studioById = Effect.fnUntraced(function* studioById(id: string) {
      const studio = (yield* listStudios).find((entry) => entry.id === id);

      if (studio === undefined) {
        return yield* new UnknownStudio({ studio: id });
      }

      return studio;
    });

    const readAsset = Effect.fnUntraced(function* readAsset(
      studio: StudioValue,
      asset: string
    ) {
      const file = yield* assetPath(studio.id, asset);

      if (!(yield* fs.exists(file).pipe(io(`check ${file}`)))) {
        return Option.none<AssetValue>();
      }

      const text = yield* fs.readFileString(file).pipe(io(`read ${file}`));

      const decoded = yield* parseAsset(text).pipe(
        Effect.mapError((error) =>
          failed(
            `${file} is not a valid asset file: ${error.message}. Fix: restore it from git; picks are history and must not be hand-edited.`
          )
        )
      );

      return Option.some(withStudioLayers(studio, decoded));
    });

    const writeAsset = Effect.fnUntraced(function* writeAsset(
      asset: AssetValue
    ) {
      const file = yield* assetPath(asset.studio, asset.id);
      const temporary = `${file}.${process.pid}.tmp`;
      const text = yield* assetText(asset).pipe(io(`encode ${file}`));

      yield* fs
        .makeDirectory(path.dirname(file), { recursive: true })
        .pipe(io(`create ${path.dirname(file)}`));
      yield* fs.writeFileString(temporary, text).pipe(io(`write ${temporary}`));
      yield* fs.rename(temporary, file).pipe(io(`replace ${file}`));

      return asset;
    });

    const listAssets = Effect.fn("FileStore.listAssets")(function* listAssets(
      studio: string
    ) {
      const def = yield* studioById(studio);
      const dir = path.dirname(yield* assetPath(studio, "_"));

      if (!(yield* fs.exists(dir).pipe(io(`check ${dir}`)))) {
        return [];
      }

      const ids = (yield* fs.readDirectory(dir).pipe(io(`list ${dir}`)))
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.basename(name, ".json"))
        .toSorted();

      const found = yield* Effect.all(ids.map((id) => readAsset(def, id)));

      return found.flatMap((entry) =>
        Option.isSome(entry)
          ? [
              {
                id: entry.value.id,
                picks: Object.values(entry.value.layers).reduce(
                  (total, layer) => total + layer.picks.length,
                  0
                ),
                title: entry.value.title,
              },
            ]
          : []
      );
    });

    const getAsset = Effect.fn("FileStore.getAsset")(function* getAsset(
      studio: string,
      asset: string
    ) {
      const found = yield* readAsset(yield* studioById(studio), asset);

      if (Option.isNone(found)) {
        return yield* new UnknownAsset({ asset, studio });
      }

      return found.value;
    });

    const change = (
      studio: string,
      asset: string,
      firstLayer: string | undefined,
      update: (current: AssetValue) => Effect.Effect<AssetValue, AdapterFailed>
    ) =>
      writes.withPermits(1)(
        Effect.gen(function* changeAsset() {
          const def = yield* studioById(studio);
          const found = yield* readAsset(def, asset);

          if (Option.isSome(found)) {
            return yield* writeAsset(yield* update(found.value));
          }

          if (firstLayer === undefined) {
            return yield* new UnknownAsset({ asset, studio });
          }

          return yield* writeAsset(
            yield* update(freshAsset(def, asset, firstLayer))
          );
        })
      );

    const putVariants = Effect.fn("FileStore.putVariants")(
      function* putVariants(
        studio: string,
        asset: string,
        layer: string,
        variants: readonly (typeof Variant.Type)[]
      ) {
        return yield* change(studio, asset, layer, (current) => {
          const known = new Set(
            (current.layers[layer]?.variants ?? []).map(({ id }) => id)
          );

          const repeated = variants.find(({ id }) => known.has(id));

          if (repeated !== undefined) {
            return Effect.fail(
              failed(
                `Variant ${repeated.id} already exists on ${studio}/${asset}/${layer}; a variant is never replaced. Fix: give the new variant a fresh id.`
              )
            );
          }

          return Effect.succeed(
            updateLayer(current, layer, (entry) => ({
              ...withoutMaking(entry),
              variants: [...entry.variants, ...variants],
            }))
          );
        });
      }
    );

    const pick = Effect.fn("FileStore.pick")(function* pick(
      studio: string,
      asset: string,
      chosen: typeof Pick.Type
    ) {
      return yield* change(studio, asset, undefined, (current) =>
        Effect.succeed(
          updateLayer(current, chosen.layer, (entry) => ({
            ...entry,
            picks: [...entry.picks, chosen],
          }))
        )
      );
    });

    const round = Effect.fn("FileStore.round")(function* round(
      studio: string,
      asset: string,
      request: typeof RoundRequest.Type
    ) {
      return yield* change(studio, asset, undefined, (current) =>
        Effect.succeed(
          updateLayer(current, request.layer, (entry) => ({
            ...entry,
            making: request.at,
            rounds: [...(entry.rounds ?? []), request],
          }))
        )
      );
    });

    const history = Effect.fn("FileStore.history")(function* history(
      studio: string,
      asset: string,
      layer: string
    ) {
      return (yield* getAsset(studio, asset)).layers[layer]?.picks ?? [];
    });

    return Store.of({
      getAsset,
      history,
      listAssets,
      listStudios,
      pick,
      putVariants,
      round,
    });
  })
);
