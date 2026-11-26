# @gds/adapter-command

The engine-free adapter: it runs the game commands a studio file names and reads their JSON. The game knows its generators, renderers and rules; the dev studio learns no game words. It implements three ports from `@gds/model` and runs variant gates.

## How a command runs

`StudioDef.commands[verb]` is argv, never a shell string. The adapter runs it with `cwd` at the game checkout (`GDS_GAME`), writes the request as one JSON value on stdin, and reads one JSON value from stdout. A non-zero exit, output that does not decode, or a run past the timeout (`GDS_COMMAND_TIMEOUT_S`, 300 by default) fails as `AdapterFailed` with the tail of stderr or stdout. Logs belong on stderr.

| Port | Verb | stdin | stdout |
| --- | --- | --- | --- |
| `Source.listAssets` | `assets` | `{ studio }` | `AssetSummary[]` (extra keys such as `kind` are dropped) |
| `Source.takesOf` | `takes` | `{ studio, asset, layer }` | `Variant[]` |
| `Source.layersOf` | none |  | the studio's `layers` |
| `Renderer` for `command:<verb>` | `<verb>` | `RenderRequest` | `Render`; relative paths are read against the checkout |
| `Apply` | `apply` | `ApplyRequest` | `{ changed: string[] }`; a studio without `apply` changes nothing |

## Gates

After a render, every `GateDef` with `where: "variant"` whose `layers` include the layer (or that names none) runs: `run` as argv in `cwd` (inside the checkout; a path that leaves it fails), stdin `{ ...RenderRequest, render }`. Without `json` the value is the exit code; with it, `json` is a dotted path into stdout's JSON (`figures.problems`, `rows.0.id`). `pass` judges the value: `eq` by JSON equality, `lt`/`le`/`gt`/`ge` on numbers only, `truthy`. `where: "check"` gates belong to `openCheck`.

The store never replaces a variant, so results go to `GateLedger`: `<GDS_GAME>/.cache/devstudio/gates/<studio>/<asset>.json`, the latest result per layer and variant. It is a rebuildable cache; the CLI attaches it to every asset it returns.

## Wiring

`apps/cli/src/command-studios.ts`: a studio whose file has `commands.assets` lists through this adapter, a layer whose renderer is `command:<verb>` draws through it, `Apply` runs `apply`, and every render runs the layer's variant gates whichever renderer drew it.

## Checks

`test/command.test.ts` runs `test/fixtures/studio.ts`, a stand-in game command per verb: assets, takes, render, apply, a passing and a failing gate, a non-zero exit, bad JSON, a missing command and a timeout, plus properties for the gate rules and the dotted path.
