import {
  AdapterFailed,
  Apply,
  AssetSummary,
  Render,
  Renderer,
  Source,
  UnknownLayer,
  UnknownStudio,
  Variant,
  rendererOf,
} from "@gds/model";
import type { StudioDef } from "@gds/model";
import { Effect, Option, Schema } from "effect";
import { Path } from "effect/Path";
import type { ChildProcessSpawner } from "effect/process";

import { CommandConfig } from "./command-config.js";
import { runJson } from "./run-command.js";
import type { CommandRequest } from "./run-command.js";

type StudioValue = typeof StudioDef.Type;

export const COMMAND_RENDERER = "command:";

export const commandVerb = (renderer: string): Option.Option<string> =>
  renderer.startsWith(COMMAND_RENDERER) &&
  renderer.length > COMMAND_RENDERER.length
    ? Option.some(renderer.slice(COMMAND_RENDERER.length))
    : Option.none();

const Assets = Schema.Array(AssetSummary);

const Takes = Schema.Array(Variant);

const Changed = Schema.Struct({ changed: Schema.Array(Schema.String) });

export interface CommandStudio {
  readonly apply: Apply["Service"];
  readonly renderer: Renderer["Service"];
  readonly source: Source["Service"];
}

export const commandStudio = Effect.fnUntraced(function* commandStudio(
  studio: StudioValue
): Effect.fn.Return<
  CommandStudio,
  never,
  CommandConfig | ChildProcessSpawner.ChildProcessSpawner | Path
> {
  const services = yield* Effect.context<
    CommandConfig | ChildProcessSpawner.ChildProcessSpawner | Path
  >();

  const path = yield* Path;
  const config = yield* CommandConfig;

  const commandOf = (
    verb: string,
    why: string
  ): Effect.Effect<readonly [string, ...string[]], AdapterFailed> => {
    const argv = studio.commands?.[verb];

    return argv === undefined
      ? Effect.fail(
          new AdapterFailed({
            adapter: `command:${verb}`,
            message: `Studio ${studio.id} ${why}, but its file names no "${verb}" command. Fix: add "commands": { "${verb}": [program, ...args] } to \`tools/devstudio/studios/${studio.id}.json\`.`,
          })
        )
      : Effect.succeed(argv);
  };

  const run = <S extends Schema.Top>(
    verb: string,
    why: string,
    request: CommandRequest,
    schema: S
  ) =>
    commandOf(verb, why).pipe(
      Effect.flatMap((argv) =>
        runJson(`command:${verb}`, argv, request, schema)
      ),
      Effect.provide(services)
    );

  const ownStudio = (id: string): Effect.Effect<void, UnknownStudio> =>
    id === studio.id
      ? Effect.void
      : Effect.fail(new UnknownStudio({ studio: id }));

  const absolute = (root: string, file: string) =>
    path.isAbsolute(file) ? file : path.join(root, file);

  const rooted = (render: typeof Render.Type) =>
    config.settings.pipe(
      Effect.map(({ root }) => {
        const { still, views } = render;
        const drawn = { ...render, path: absolute(root, render.path) };

        const withStill =
          still === undefined
            ? drawn
            : { ...drawn, still: absolute(root, still) };

        return views === undefined
          ? withStill
          : {
              ...withStill,
              views: views.map((view) => ({
                ...view,
                path: absolute(root, view.path),
              })),
            };
      })
    );

  const source = Source.of({
    layersOf: (id) => ownStudio(id).pipe(Effect.as(studio.layers)),
    listAssets: (id) =>
      ownStudio(id).pipe(
        Effect.andThen(
          run("assets", "lists its assets by command", { studio: id }, Assets)
        )
      ),
    takesOf: (id, asset, layer) =>
      Effect.gen(function* takesOf() {
        yield* ownStudio(id);

        if (!studio.layers.some((entry) => entry.id === layer)) {
          return yield* new UnknownLayer({ asset, layer, studio: id });
        }

        return yield* run(
          "takes",
          "lists its takes by command",
          { asset, layer, studio: id },
          Takes
        );
      }),
  });

  const renderer = Renderer.of({
    render: (request) => {
      const named = rendererOf(studio, request.layer);

      return Option.match(commandVerb(named), {
        onNone: () =>
          Effect.fail(
            new AdapterFailed({
              adapter: "command",
              message: `Studio ${studio.id} draws layer ${request.layer} with renderer "${named}", which is not a command renderer. Fix: name it "${COMMAND_RENDERER}<verb>" in \`tools/devstudio/studios/${studio.id}.json\`, or send the layer to its own adapter.`,
            })
          ),
        onSome: (verb) =>
          run(
            verb,
            `names renderer "${named}" for layer ${request.layer}`,
            request,
            Render
          ).pipe(Effect.flatMap(rooted)),
      });
    },
  });

  const apply = Apply.of({
    apply: (request) =>
      studio.commands?.apply === undefined
        ? Effect.succeed({ changed: [] })
        : run("apply", "applies picks by command", request, Changed),
  });

  return { apply, renderer, source };
});
