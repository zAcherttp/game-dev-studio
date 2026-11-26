import { toCommand } from "@gds/capability";
import type { Asset } from "@gds/model";
import { Console, Effect, Layer, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import {
  getAsset,
  getPack,
  layersOf,
  listAssets,
  openCheck,
  render,
} from "./handlers.js";
import {
  commandCapabilities,
  SERVE_HOST,
  DEVTOOLS_MCP_PATH,
  codeMode,
  devtoolsWebServer,
  http,
  mcpServer,
  webServer,
} from "./surfaces.js";
import { VERSION } from "./version.js";

export { VERSION } from "./version.js";

const renderAsset = (asset: typeof Asset.Type) =>
  [
    `${asset.studio}/${asset.id}: ${asset.title}`,
    ...Object.entries(asset.layers).map(([id, layer]) => {
      const mixed = asset.mix[id];

      const parts = [
        `${layer.variants.length} variants`,
        `${layer.picks.length} picks`,
        ...(mixed === undefined ? [] : [`mix ${mixed}`]),
        ...(layer.making === undefined ? [] : ["making"]),
      ];

      return `  ${id}: ${parts.join(", ")}`;
    }),
  ].join("\n");

const renderTakes = Command.make(
  "render",
  {
    studio: Argument.String("studio"),
    asset: Argument.String("asset"),
    layer: Flag.String("layer").pipe(
      Flag.withDescription("Layer id, as the asset names it")
    ),
    variant: Flag.String("variant").pipe(
      Flag.optional,
      Flag.withDescription(
        "One variant id; every variant of the layer when left out"
      )
    ),
  },
  Effect.fn("Capability.render.takes")(function* renderLayer({
    asset,
    layer,
    studio,
    variant,
  }) {
    const stored = yield* getAsset.handler({ asset, studio });

    const ids = Option.match(variant, {
      onNone: () => (stored.layers[layer]?.variants ?? []).map(({ id }) => id),
      onSome: (one) => [one],
    });

    if (ids.length === 0) {
      yield* Console.error(
        `${studio}/${asset} has no variants on layer ${layer}. Fix: name a layer from \`getAsset ${studio} ${asset}\`.`
      );
    }

    for (const id of ids) {
      const drawn = yield* render.handler({
        asset,
        layer,
        studio,
        variant: id,
      });

      yield* Console.log(
        [
          `${layer} ${id}`,
          `${Math.round(drawn.ms)} ms`,
          drawn.path,
          ...(drawn.still === undefined ? [] : [drawn.still]),
        ].join("  ")
      );
    }
  })
).pipe(
  Command.withDescription(
    "Render one variant, or every variant of a layer, on the asset's current mix"
  )
);

const positional = new Map<unknown, readonly string[]>([
  [listAssets, ["studio"]],
  [getPack, ["studio"]],
  [layersOf, ["studio", "asset"]],
  [openCheck, ["studio", "asset"]],
]);

const capabilityCommands = commandCapabilities.map((capability) => {
  if (capability === getAsset) {
    return toCommand(getAsset, {
      positional: ["studio", "asset"],
      render: renderAsset,
    });
  }

  if (capability === render) {
    return renderTakes;
  }

  return toCommand(capability, { positional: positional.get(capability) });
});

const openapiCommand = Command.make("openapi", {}, () =>
  Console.log(JSON.stringify(http.openApi(), null, 2))
).pipe(Command.withDescription("Print the OpenAPI document for the REST API"));

const devtoolsFlag = Flag.Boolean("devtools").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Record every capability call and add the rat_* devtools tools"
  )
);

const serveCommand = Command.make(
  "serve",
  {
    devtools: devtoolsFlag,
    port: Flag.Int("port").pipe(
      Flag.withDefault(3000),
      Flag.withDescription("TCP port to listen on")
    ),
  },
  ({ devtools, port }) =>
    devtools
      ? Console.error(
          `🐀 devtools MCP: http://${SERVE_HOST}:${port}${DEVTOOLS_MCP_PATH}`
        ).pipe(
          Effect.andThen(Layer.launch(devtoolsWebServer(port))),
          Effect.orDie
        )
      : Layer.launch(webServer(port))
).pipe(
  Command.withDescription(
    "Serve the REST API, /openapi.json, and /docs until interrupted; --devtools adds MCP at /__rat/mcp on 127.0.0.1"
  )
);

const mcpCommand = Command.make(
  "mcp",
  {
    codeMode: Flag.Boolean("code-mode").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Expose search and execute instead of one tool per capability"
      )
    ),
    devtools: devtoolsFlag,
  },
  ({ codeMode: enabled, devtools }) => {
    if (devtools) {
      return enabled
        ? Layer.launch(mcpServer.devtoolsCodeMode).pipe(Effect.orDie)
        : Layer.launch(mcpServer.devtools).pipe(Effect.orDie);
    }

    return enabled
      ? Layer.launch(mcpServer.codeMode).pipe(Effect.orDie)
      : Layer.launch(mcpServer.tools).pipe(Effect.orDie);
  }
).pipe(
  Command.withDescription("Serve the capabilities as an MCP server over stdio")
);

const catalogCommand = Command.make(
  "catalog",
  {
    types: Flag.Boolean("types").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Print the TypeScript declarations a code-mode program sees"
      )
    ),
  },
  ({ types }) =>
    Console.log(
      types ? codeMode.declarations : JSON.stringify(codeMode.catalog, null, 2)
    )
).pipe(
  Command.withDescription(
    "Print the capability catalog as JSON Schema, or as TypeScript with --types"
  )
);

export const rootCommand = Command.make("game-dev-studio").pipe(
  Command.withDescription(
    "Local dev studio: studios, assets, layers, variants, picks and rounds over CLI, REST, and MCP"
  ),
  Command.withSubcommands([
    ...capabilityCommands,
    catalogCommand,
    openapiCommand,
    serveCommand,
    mcpCommand,
  ])
);

export const runCommand = Command.runWith(rootCommand, { version: VERSION });
