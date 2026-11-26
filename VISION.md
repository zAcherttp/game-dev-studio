# Vision

The long-term goal is an AI harness for creative work. The first form is a dev studio for agentic game development: a local tool, engine agnostic, made from a template.

The pipeline of building something is the same for every asset: split it into layers, make variants of a layer, pick one, iterate. A VFX burst, a sound, a pose and a balance table all go through that loop. The dev studio owns the loop; a studio owns what its layers mean. The core speaks only the loop's words (studio, asset, layer, variant, pick, mix, round) and never imports an engine or a game. Engines and games plug in through ports: a `Source` that reads what a studio already has, a `Renderer` per engine or tool, a `Check` that opens the engine on the current mix, a `Store` for picks, a `Pack` that points an agent at the files it should read.

Agents do the making. A person does the picking. The dev studio records both, renders what is asked for, keeps every pick in history, and gets out of the way. It never spawns agents; an agent session calls it over MCP.

It runs on 127.0.0.1 and writes picks into the game checkout that `GDS_GAME` names. Nothing deploys.

The first sub-studio is VFX, ported from EasyVFX. Every later studio should cost a studio definition and its adapters, not a new app.

The build keeps its template's standard: one contract per behavior projected to every surface, schemas as the contract, lifecycles in machines, errors that say how to fix them, and a fence that makes the easy path the right one.
