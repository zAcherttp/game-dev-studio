# @gds/adapter-roblox

The Roblox adapter for the dev studio's `vfx` studio: EasyVFX kits as assets, drawn offline. It implements two ports from `@gds/model`:

- **`Source`** (`easyvfxSource(studio)`): `listAssets` lists the kits, `layersOf` gives a kit's layers in the kit's order, and `takesOf` gives a layer's takes (A, B, C ...) as variants with their EasyVFX layers in `params`. It reads them through EasyVFX's own export (`lune run tests/kits.luau` in the EasyVFX checkout), not a parser of ours. The listing is cached until a kit source or EasyVFX's `Presets.luau` changes.
- **`Renderer`**, with two backends behind the one port. The studio picks one:
  - `evfxRenderer` (`roblox.evfx`): the kit's preset with this layer's take swapped in and the mix's picks for the other layers. EasyVFX's `tests/timeline.luau` exports it and `tools/evfx/render.py` draws it, through `evfx/render_take.py`. That script is one Python process with a warm pool of frame workers, started on the first render. It writes a looping GIF from EasyVFX's ground camera at 25 fps, and a PNG held at the sync beat.
  - `rorRenderer` (`roblox.ror`): the same mix built from the game's source under ree (`ror/play-kit.luau`: EasyVFX's `Builder`, then `PlayLocal`), then drawn by `ror video` through the same camera.

A render returns `{ kind: "gif", path, ms, still, beat }`. The sync beat comes from the kit's beat sheet (`sheets/<preset>.json`): first the beat `syncBeat` names, then the sheet's flash beat, then the brightest frame drawn.

## World plans (`roblox.plan`)

`planRenderer(settings)` draws a generator's plan from named cameras, with no Roblox Studio. It gets the plan from the studio's `commands.plan` (run from the game checkout with the request JSON as its last argument; it prints the plan JSON). A studio without that command falls back to `lune run tools/island/village.luau plan <out> <seed>` for village massing. The seed is the variant's `seed`, else `params.seed`, else 1.

A plan is `shapes` (kind, size, `cf` as 12 CFrame components, and optionally wedge, far, solid, color, material, shape) and `landmarks` (name to world point). The village file's first village is read, and its `frame` position becomes the `centre` landmark.

`ror/draw-plan.luau` places every shape except `Collision` through the game's own `Features.SkyIsland.Build.place`, so colours and materials come from the game's source. It adds a 5-stud figure where a camera names one. The game's `ReplicatedStorage` is mounted from its Rojo project (`fresh.project.json`), and the plan goes in as a generated module. Registered textures resolve to the game's PNGs the same way as the ror VFX path.

Cameras come from the file the studio's `cameras` field names, else `ror/village-cameras.json`. Each camera has an `eye`, a `target`, an optional `figure` and a `fov`. Each anchor is a landmark or a point, `along` two landmarks (forward is the flat line from the first to the second), and `move` [right, up, forward] studs. `params.cameras` on a variant draws only those. A camera the file does not name fails `UnknownCamera`, and a landmark the plan lacks fails `UnknownLandmark`. The renderer reports both as `AdapterFailed`. One `ror render` load draws every view.

A render returns `{ kind: "image", path, ms, views: [{ camera, path }] }`. The views go to `<cache>/<studio>/<asset>/plan/<key>/<camera>.png`, beside a `note.json` with the plan and ror timings and the part count. The key is a SHA-256 over the plan, the camera file and `PLAN_RENDERER_VERSION`, and nothing else. `test/plan.test.ts` holds the properties.

`renderMix` on a studio whose renderer is `roblox.plan` draws the first picked layer's variant with the whole mix through the same renderer.

## Cache

Renders go to `<cache>/<studio>/<asset>/<layer>-<take>-<key>.{gif,still.png,json}`. The key is a SHA-256 over the backend, the kit as EasyVFX evaluates it, the layer, the take, and the mix without the rendered layer's own entry (the take replaces it). The same inputs return the kept file and the `ms` of the render that made it. `test/adapter.test.ts` holds the properties.

## Settings (`RobloxConfig.layer`)

| Field | What it is |
| --- | --- |
| `easyvfx` | An EasyVFX checkout at or after 64d0424 (VuxSussy/EasyVFX#32: Windows kits paths and trails) |
| `kits` | Folders holding `kits/*.luau` and `sheets/*.json`: `<game>/art/vfx/easyvfx` |
| `cache` | `<game>/.cache/devstudio`, never committed |
| `python` | A Python with `tools/evfx/requirements.txt` (numpy, Pillow) |
| `workers` | Frame workers in the evfx pool |
| `size` | Image size, `[360, 240]` as EasyVFX's studio draws |
| `syncBeat` | The studio's `sync.beat` |
| `ror` | `{ gameRoot, ree, seconds }`: the game checkout whose `rokit.toml` pins ror, `ROR_REE` from `scripts/ror-ree.sh`, and the clip length |

The game's textures belong to its Roblox group and aren't public, so ror can't download them without an account. The ror path draws them from the game's own PNGs instead, with no credential. `assets/assets.md` in `ror.gameRoot` maps each `rbxassetid://<id>` to its file, and `art/vfx/out` (in the game and beside each kits folder) holds the `rbxasset://textures/se370vfx/<Name>.png` dev textures. `ror/play-kit.luau` swaps those URIs for the local files before ror draws. Only textures a kit names are sent. The map is part of the ror cache key. A texture with neither an entry nor a file is still listed as missing in the render's `.json`. `ROR_STUDIO_COOKIE` is never set here.
