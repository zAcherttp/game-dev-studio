# @gds/adapter-roblox

The Roblox adapter for the dev studio's `vfx` studio: EasyVFX kits as assets, drawn offline. It implements two ports from `@gds/model`:

- **`Source`** (`easyvfxSource(studio)`): `listAssets` lists the kits, `layersOf` gives a kit's layers in the kit's order, and `takesOf` gives a layer's takes (A, B, C ...) as variants with their EasyVFX layers in `params`. It reads them through EasyVFX's own export (`lune run tests/kits.luau` in the EasyVFX checkout), not a parser of ours. The listing is cached until a kit source or EasyVFX's `Presets.luau` changes.
- **`Renderer`**, with two backends behind the one port. The studio picks one:
  - `evfxRenderer` (`roblox.evfx`): the kit's preset with this layer's take swapped in and the mix's picks for the other layers. EasyVFX's `tests/timeline.luau` exports it and `tools/evfx/render.py` draws it, through `evfx/render_take.py`. That script is one Python process with a warm pool of frame workers, started on the first render. It writes a looping GIF from EasyVFX's ground camera at 25 fps, and a PNG held at the sync beat.
  - `rorRenderer` (`roblox.ror`): the same mix built from the game's source under ree (`ror/play-kit.luau`: EasyVFX's `Builder`, then `PlayLocal`), then drawn by `ror video` through the same camera.

A render returns `{ kind: "gif", path, ms, still, beat }`. The sync beat comes from the kit's beat sheet (`sheets/<preset>.json`): first the beat `syncBeat` names, then the sheet's flash beat, then the brightest frame drawn.

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
