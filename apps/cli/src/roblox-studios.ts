import {
  EVFX_BACKEND,
  EasyvfxKits,
  ROR_BACKEND,
  RobloxConfig,
  VFXLAB_CHECK,
  easyvfxSource,
  evfxRenderer,
  rorRenderer,
  vfxlabCheck,
} from "@gds/adapter-roblox";
import type { RobloxSettings } from "@gds/adapter-roblox";
import {
  AdapterFailed,
  Check,
  Renderer,
  Source,
  Store,
  UnknownStudio,
} from "@gds/model";
import type { StudioDef } from "@gds/model";
import { GameFolder } from "@gds/store";
import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Ref,
  Scope,
  Semaphore,
} from "effect";
import type { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import type { ChildProcessSpawner } from "effect/process";

type StudioValue = typeof StudioDef.Type;

const ROBLOX_RENDERERS: ReadonlySet<string> = new Set([
  EVFX_BACKEND,
  ROR_BACKEND,
]);

export const isRobloxStudio = (studio: StudioValue): boolean =>
  ROBLOX_RENDERERS.has(studio.renderer);

const optional = (name: string) => Config.option(Config.NonEmptyString(name));

const RobloxEnv = Config.all({
  easyvfx: optional("GDS_EASYVFX"),
  kits: optional("GDS_KITS"),
  python: Config.NonEmptyString("GDS_PYTHON").pipe(
    Config.withDefault("python")
  ),
  ree: optional("GDS_ROR_REE"),
  slot: optional("GDS_STUDIO_SLOT"),
  workers: Config.Int("GDS_EVFX_WORKERS").pipe(Config.withDefault(4)),
});

const RENDER_SIZE = [360, 240] as const;

const ROR_SECONDS = 1.5;

export const extraKits = (listed: string): readonly string[] =>
  listed
    .split(";")
    .map((dir) => dir.trim())
    .filter((dir) => dir !== "");

interface RobloxBackend {
  readonly check: Check["Service"];
  readonly renderer: Renderer["Service"];
  readonly source: Source["Service"];
}

const failed = (message: string) =>
  new AdapterFailed({ adapter: "roblox", message });

export class RobloxStudios extends Context.Service<
  RobloxStudios,
  {
    readonly backend: (
      studio: StudioValue
    ) => Effect.Effect<RobloxBackend, AdapterFailed>;
  }
>()("@gds/cli/RobloxStudios") {
  static readonly layer = Layer.effect(
    RobloxStudios,
    Effect.gen(function* makeRobloxStudios() {
      const game = yield* GameFolder;
      const scope = yield* Scope.Scope;
      const path = yield* Path;

      const platform = yield* Effect.context<
        FileSystem | Path | ChildProcessSpawner.ChildProcessSpawner
      >();

      const built = yield* Ref.make(new Map<string, RobloxBackend>());
      const building = yield* Semaphore.make(1);

      const settingsFor = Effect.fnUntraced(function* settingsFor(
        studio: StudioValue
      ) {
        const root = yield* game.root;

        const env = yield* RobloxEnv.pipe(
          Effect.mapError((problem) =>
            failed(
              `The Roblox adapter settings are invalid: ${problem.message}. Fix: correct the GDS_* variables named in \`.env.schema\`.`
            )
          )
        );

        const roblox: RobloxSettings = {
          cache: path.join(root, ".cache", "devstudio"),
          easyvfx: Option.getOrElse(env.easyvfx, () =>
            path.join(root, "tools", "easyvfx")
          ),
          kits: [
            path.join(root, "art", "vfx", "easyvfx"),
            ...Option.match(env.kits, {
              onNone: () => [],
              onSome: extraKits,
            }),
          ],
          python: env.python,
          ror: env.ree.pipe(
            Option.map((ree) => ({
              gameRoot: root,
              ree,
              seconds: ROR_SECONDS,
            })),
            Option.getOrUndefined
          ),
          size: RENDER_SIZE,
          syncBeat: studio.sync?.beat,
          workers: env.workers,
        };

        return {
          roblox,
          vfxlab: {
            gameRoot: root,
            slot: Option.getOrUndefined(env.slot),
          },
        };
      });

      const build = Effect.fnUntraced(function* build(studio: StudioValue) {
        const { roblox, vfxlab } = yield* settingsFor(studio);

        const renderer =
          studio.renderer === ROR_BACKEND ? rorRenderer : evfxRenderer;

        const kits = EasyvfxKits.layer.pipe(
          Layer.provideMerge(RobloxConfig.layer(roblox))
        );

        const layer = Layer.mergeAll(
          easyvfxSource(studio.id),
          vfxlabCheck(vfxlab).pipe(Layer.provideMerge(renderer))
        ).pipe(Layer.provide(kits));

        const context = yield* Layer.buildWithScope(layer, scope).pipe(
          Effect.provideContext(platform)
        );

        return {
          check: Context.get(context, Check),
          renderer: Context.get(context, Renderer),
          source: Context.get(context, Source),
        };
      });

      const backend = (studio: StudioValue) =>
        building.withPermits(1)(
          Effect.gen(function* backendFor() {
            const known = (yield* Ref.get(built)).get(studio.id);

            if (known !== undefined) {
              return known;
            }

            const made = yield* build(studio);
            yield* Ref.update(
              built,
              (all) => new Map([...all, [studio.id, made]])
            );

            return made;
          })
        );

      return RobloxStudios.of({ backend });
    })
  );
}

const studioOf = (store: Store["Service"], id: string) =>
  store.listStudios.pipe(
    Effect.flatMap((studios) => {
      const found = studios.find((entry) => entry.id === id);

      return found === undefined
        ? Effect.fail(new UnknownStudio({ studio: id }))
        : Effect.succeed(found);
    })
  );

export const StudioSource = Layer.effect(
  Source,
  Effect.gen(function* makeStudioSource() {
    const store = yield* Store;
    const roblox = yield* RobloxStudios;

    const sourceFor = Effect.fnUntraced(function* sourceFor(
      id: string
    ): Effect.fn.Return<Source["Service"], UnknownStudio | AdapterFailed> {
      const studio = yield* studioOf(store, id);

      if (!isRobloxStudio(studio)) {
        return yield* new UnknownStudio({ studio: id });
      }

      return (yield* roblox.backend(studio)).source;
    });

    return Source.of({
      layersOf: (studio, asset) =>
        sourceFor(studio).pipe(
          Effect.flatMap((source) => source.layersOf(studio, asset))
        ),
      listAssets: (studio) =>
        sourceFor(studio).pipe(
          Effect.flatMap((source) => source.listAssets(studio))
        ),
      takesOf: (studio, asset, layer) =>
        sourceFor(studio).pipe(
          Effect.flatMap((source) => source.takesOf(studio, asset, layer))
        ),
    });
  })
);

const noStudio = (adapter: string, { studio }: UnknownStudio) =>
  new AdapterFailed({
    adapter,
    message: `No studio ${studio} in the game checkout. Fix: add \`tools/devstudio/studios/${studio}.json\` to the game named by \`GDS_GAME\`.`,
  });

export const StudioRenderer = Layer.effect(
  Renderer,
  Effect.gen(function* makeStudioRenderer() {
    const store = yield* Store;
    const roblox = yield* RobloxStudios;

    return Renderer.of({
      render: (request) =>
        studioOf(store, request.studio).pipe(
          Effect.catchTag("UnknownStudio", (problem) =>
            Effect.fail(noStudio("renderer", problem))
          ),
          Effect.flatMap((studio) =>
            isRobloxStudio(studio)
              ? roblox.backend(studio)
              : Effect.fail(
                  new AdapterFailed({
                    adapter: "renderer",
                    message: `Studio ${studio.id} names renderer "${studio.renderer}", which no adapter in this dev studio draws. Fix: set "renderer" in \`tools/devstudio/studios/${studio.id}.json\` to one of ${[...ROBLOX_RENDERERS].join(", ")}.`,
                  })
                )
          ),
          Effect.flatMap(({ renderer }) => renderer.render(request))
        ),
    });
  })
);

export const StudioCheck = Layer.effect(
  Check,
  Effect.gen(function* makeStudioCheck() {
    const store = yield* Store;
    const roblox = yield* RobloxStudios;

    return Check.of({
      open: (request) =>
        studioOf(store, request.studio).pipe(
          Effect.catchTag("UnknownStudio", (problem) =>
            Effect.fail(noStudio("check", problem))
          ),
          Effect.flatMap((studio) =>
            studio.check === VFXLAB_CHECK && isRobloxStudio(studio)
              ? roblox.backend(studio)
              : Effect.fail(
                  new AdapterFailed({
                    adapter: "check",
                    message: `Studio ${studio.id} names check "${studio.check ?? "none"}", which no adapter in this dev studio opens. Fix: set "check" in \`tools/devstudio/studios/${studio.id}.json\` to "${VFXLAB_CHECK}" with a Roblox renderer.`,
                  })
                )
          ),
          Effect.flatMap(({ check }) => check.open(request))
        ),
    });
  })
);
