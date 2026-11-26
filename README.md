# game-dev-studio

A local, engine-agnostic dev studio for agentic game work. Every asset goes through the same loop, whatever it is: split it into **layers**, make **variants** of a layer, **pick** one, then ask for another **round**. The mix of picks is the asset. A **studio** is one area of that work (`vfx` first, ported from EasyVFX), defined by the game, not by this repo.

It runs on your machine. `apps/cli` serves the eight capabilities over the CLI, a REST API with OpenAPI, and MCP on `127.0.0.1`; `apps/web` is the Foldkit board. Agents make the variants over MCP; the dev studio records them, renders them through a studio's renderer, and stores picks in the game checkout named by `GDS_GAME`. It never spawns agents and nothing deploys.

## Run it

```sh
nvm use                      # Node 24.18.0
corepack enable              # pnpm 11.3.0 from packageManager
pnpm install
pnpm turbo run check test build --summarize
pnpm cli -- listStudios      # every capability answers "not built" until its lane lands
pnpm cli mcp                 # MCP over stdio: listStudios, getAsset, addVariants, render, pick, round, getPack, openCheck
pnpm dev                     # the board at http://game-dev-studio.localhost:1355
```

On Windows run the commands from Git Bash.

## Layout

- `packages/model`: the shared shapes. Effect Schemas for studios, layers, variants, picks and assets; the `Store`, `Source`, `Renderer`, `Check` and `Pack` ports; the eight contracts. No handlers, no engine, no game.
- `packages/capability`: `defineContract`, `implement`, and the CLI, HTTP, MCP, RPC and code-mode projections.
- `packages/core`: config services and the fence tests; handlers for the contracts land here.
- `packages/devtools`: the `rat_*` call-recording capabilities behind `--devtools`.
- `packages/motion`: tweens, springs and easings for Foldkit.
- `packages/check-harness`: structured gate outcomes for check scripts.
- `apps/cli`: the composition root. `src/stubs.ts` binds every contract to a typed `NotBuilt` failure.
- `apps/web`: the Foldkit app, server-rendered and prerendered.

`AGENTS.md` is the law for agents and contributors: pins, commands, the fence. `VISION.md` is the intent.

## Stack

Effect `4.1.4`, XState `6.0.0-beta.3` with `@xstate/effect` `1.0.0-beta.2`, Foldkit `0.170.0`, TypeScript `7.0.2` checked by effect-tsrs, Oxlint `1.93.0` with Ultracite and the vendored anti-slop and Landmines rules, Turborepo, varlock and lefthook. Pins are exact.

## Credit

game-dev-studio is made from [rat-stack](https://github.com/joelhooks/rat-stack) by Joel Hooks (MIT), then trimmed to a local tool. `PROVENANCE.md` credits the code it borrows.
