import {
  CommandConfig,
  GateLedger,
  commandStudio,
  commandVerb,
  runGates,
} from "@gds/adapter-command";
import {
  AdapterFailed,
  Apply,
  Renderer,
  Source,
  Store,
  UnknownStudio,
  rendererOf,
} from "@gds/model";
import type { RenderRequest, StudioDef } from "@gds/model";
import { GameFolder } from "@gds/store";
import { Config, Duration, Effect, Layer, Option } from "effect";
import type { Context } from "effect";
import type { Path } from "effect/Path";
import type { ChildProcessSpawner } from "effect/process";

type StudioValue = typeof StudioDef.Type;

type CommandServices =
  | CommandConfig
  | ChildProcessSpawner.ChildProcessSpawner
  | Path;

const DEFAULT_TIMEOUT_S = 300;

export const CommandSettings = Layer.effect(
  CommandConfig,
  Effect.gen(function* readCommandSettings() {
    const game = yield* GameFolder;

    const timeout = Config.Int("GDS_COMMAND_TIMEOUT_S").pipe(
      Config.withDefault(DEFAULT_TIMEOUT_S)
    );

    return CommandConfig.of({
      settings: Effect.all({
        root: game.root,
        timeout: timeout.pipe(
          Effect.map((seconds) => Duration.seconds(seconds)),
          Effect.mapError(
            (problem) =>
              new AdapterFailed({
                adapter: "command",
                message: `GDS_COMMAND_TIMEOUT_S is invalid: ${problem.message}. It is the seconds a studio command may run. Fix: set it to a whole number in \`.env.local\`.`,
              })
          )
        ),
      }),
    });
  })
);

export const isCommandSource = (studio: StudioValue): boolean =>
  studio.commands?.assets !== undefined;

const studioOf = (store: Store["Service"], id: string) =>
  store.listStudios.pipe(
    Effect.flatMap((studios) => {
      const found = studios.find((entry) => entry.id === id);

      return found === undefined
        ? Effect.fail(new UnknownStudio({ studio: id }))
        : Effect.succeed(found);
    })
  );

const commandsFor =
  (services: Context.Context<CommandServices>) => (studio: StudioValue) =>
    commandStudio(studio).pipe(Effect.provideContext(services));

export const CommandSource = Layer.effect(
  Source,
  Effect.gen(function* makeCommandSource() {
    const inner = yield* Source;
    const store = yield* Store;
    const commands = commandsFor(yield* Effect.context<CommandServices>());

    const sourceFor = (id: string) =>
      studioOf(store, id).pipe(
        Effect.flatMap((studio) =>
          isCommandSource(studio)
            ? commands(studio).pipe(Effect.map(({ source }) => source))
            : Effect.succeed(inner)
        )
      );

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

const noStudio = ({ studio }: UnknownStudio) =>
  new AdapterFailed({
    adapter: "renderer",
    message: `No studio ${studio} in the game checkout. Fix: add \`tools/devstudio/studios/${studio}.json\` to the game named by \`GDS_GAME\`.`,
  });

export const GatedRenderer = Layer.effect(
  Renderer,
  Effect.gen(function* makeGatedRenderer() {
    const inner = yield* Renderer;
    const store = yield* Store;
    const ledger = yield* GateLedger;
    const services = yield* Effect.context<CommandServices>();
    const commands = commandsFor(services);

    const draw = (studio: StudioValue, request: RenderRequest) =>
      Option.isSome(commandVerb(rendererOf(studio, request.layer)))
        ? commands(studio).pipe(
            Effect.flatMap(({ renderer }) => renderer.render(request))
          )
        : inner.render(request);

    return Renderer.of({
      render: (request) =>
        Effect.gen(function* renderAndGate() {
          const studio = yield* studioOf(store, request.studio).pipe(
            Effect.catchTag("UnknownStudio", (problem) =>
              Effect.fail(noStudio(problem))
            )
          );

          const render = yield* draw(studio, request);

          if (request.whole === true) {
            return render;
          }

          const results = yield* runGates(studio, request, render).pipe(
            Effect.provideContext(services)
          );

          if (results.length > 0) {
            yield* ledger.record(
              {
                asset: request.asset,
                layer: request.layer,
                studio: request.studio,
                variant: request.variant.id,
              },
              results
            );
          }

          return render;
        }),
    });
  })
);

export const GatedStore = Layer.effect(
  Store,
  Effect.gen(function* makeGatedStore() {
    const inner = yield* Store;
    const ledger = yield* GateLedger;

    return Store.of({
      ...inner,
      getAsset: (studio, asset) =>
        inner.getAsset(studio, asset).pipe(Effect.flatMap(ledger.attach)),
      pick: (studio, asset, chosen) =>
        inner.pick(studio, asset, chosen).pipe(Effect.flatMap(ledger.attach)),
      putVariants: (studio, asset, layer, variants) =>
        inner
          .putVariants(studio, asset, layer, variants)
          .pipe(Effect.flatMap(ledger.attach)),
      round: (studio, asset, request) =>
        inner.round(studio, asset, request).pipe(Effect.flatMap(ledger.attach)),
    });
  })
);

export const CommandApply = Layer.effect(
  Apply,
  Effect.gen(function* makeCommandApply() {
    const store = yield* Store;
    const commands = commandsFor(yield* Effect.context<CommandServices>());

    return Apply.of({
      apply: (request) =>
        studioOf(store, request.studio).pipe(
          Effect.catchTag("UnknownStudio", ({ studio }) =>
            Effect.fail(
              new AdapterFailed({
                adapter: "apply",
                message: `No studio ${studio} to apply a pick in. Fix: add \`tools/devstudio/studios/${studio}.json\` to the game named by \`GDS_GAME\`.`,
              })
            )
          ),
          Effect.flatMap(commands),
          Effect.flatMap(({ apply }) => apply.apply(request))
        ),
    });
  })
);
