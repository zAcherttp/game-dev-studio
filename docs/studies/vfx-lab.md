# VFX.LAB

Studied 2026-11-27 at commit [`336b3a5`](https://github.com/spellbound-labs/vfx.lab/tree/336b3a5549a134b23398609193f88bff3646bca9), read-only. Lessons are in our own words; no code or assets are copied.

## What it is

A browser tool for stylized, anime-style 3D effects by Spellbound Labs, MIT, about 30 stars, first pushed 2026-11-24. It is a static page: Three.js r128 and WebGL2, four files, no build step ([`README.md`](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/README.md)). You draw a 3D path, stack layers on a timeline, apply a look, and export a video, a sprite sheet, a PNG or a JSON effect file.

## What it tried, and how AI assists

- **AI built the tool, not the effects.** Both commits are co-authored by a Claude model and link a Claude session. The page also checks for claude.ai Artifact hooks (`window.claude.use`, `window.claude.hot`) to keep state across hot reloads and to save media and downloads ([`editor.js` L1008](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/editor.js#L1008)). So it was likely grown as an Artifact, then exported to a repository.
- **No AI inside the tool.** No model is called at run time. The "assist" is procedural: 26 starter effects, 16 one-click looks, 10 palettes, a recolour that rotates every colour around the effect's dominant hue ([`editor.js` `recolor`](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/editor.js#L577)), and a "shuffle variation" that jitters numbers on every layer by 15 to 30 percent ([`editor.js` `shuffleVariation`](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/editor.js#L585)).
- **An agent handle.** The page exposes a small global object with `load`, `seek`, `look`, `recolor`, `shuffleVariation`, `select` and the live project ([`editor.js` L1009](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/editor.js#L1009)). That is enough for a browser-driving agent to load a preset, scrub to a frame and screenshot it.

## How it splits an effect into parts

- **A flat stack of typed layers.** Eight kinds: particles, ribbon, shader mesh, screen (flash and shake), occluder, media, manga overlay, lettering ([`presets.js` `DEFAULTS`](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/presets.js#L23)). No tree, no parenting.
- **Every layer shares a base.** Visible, start, duration, position, an optional path with from, to and easing, blend, intensity, alpha, a colour gradient, and three curves over the layer's life: alpha, size and visibility ([`presets.js` `BASE`](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/presets.js#L13)). Kind-specific fields sit on top.
- **Paths are shared objects.** Layers point at a path by id. A comet's tail ribbon, core sphere and stardust particles all follow the same "Flight" path, and the impact layers sit at the path's end. The path is the sync spine.
- **Layers are named by role.** The starter effects use names like Tail, Helix threads, Core, Stardust. The 26 presets hold 6 to 14 layers each, most 6 to 9 ([`presets.js` `PRESETS`](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/presets.js#L133)).
- **Every frame is a pure function of time.** The README says so, and it is why the timeline scrubs cleanly in both directions.

## How it shows the whole while one part is worked on

- One viewport plays all visible layers. The timeline lists each layer as a bar with its start and duration. Each row has an eye toggle ([`editor.js` L681](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/editor.js#L681)). Selecting a layer opens its inspector and highlights its row; it does not change how the other layers draw.
- Occluders draw as faint wireframe ghosts so you see what hides the effect without it covering the effect.
- A look (cel shade, ink, pixel art, VHS) is a post-process over the whole frame, so style is judged on the whole, never per layer.

## How it keeps or versions takes

- **Undo is the only history.** Each change pushes a JSON snapshot of the whole project; 80 are kept ([`editor.js` `commit`](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/editor.js#L59)). The toast after a shuffle says undo brings the last variation back: the only way to compare two variations is to flip between them with undo and redo.
- **Autosave** to browser local storage, plus a "mine" list of saved user presets.
- **The file has a version and fills gaps.** A project carries `v: 2` ([`presets.js` L125](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/presets.js#L125)). On load, every layer is completed from its kind's defaults, and layers of unknown kinds are dropped ([`editor.js` L74](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/editor.js#L74)). New fields never break old files.

## What gds should borrow

1. **Role-named, typed layers with a shared base.** Start, duration, curves for alpha, size and visibility, and a colour gradient on every layer. This is a good minimum shape for a gds VFX layer, whatever engine renders it.
2. **A shared spine.** Layers that follow one path or one anchor stay in sync when the spine changes. gds already names a sync point per timed studio; a path or anchor shared by id is the spatial twin of that beat.
3. **Pure function of time.** A render at time t never depends on the frames before it. That makes a variant render deterministic and lets every variant on the board be scrubbed to the same beat.
4. **Fill from defaults on load.** A small, safe way to keep old variants readable when a layer kind gains a field. It complements Effekseer's step migrations: defaults for additions, steps for renames and removals.
5. **A small agent handle.** Load, seek, select and read state. The gds MCP tools already go further; the lesson is to keep the surface small enough that an agent uses it right.

## What to avoid

- **Whole-effect variation.** Shuffle jitters every layer at once. If one layer gets better and another worse, the result can only be kept or thrown away whole. gds makes variants per layer, drawn over the other layers' picks.
- **Undo as the comparison tool.** Two variations are never on screen together, and losing the redo stack loses the take. gds keeps every variant and shows them side by side.
- **Selection without focus.** Selecting a layer does not dim the others, so a small layer is hard to read inside a busy effect. gds should dim the rest (the minimap in [`feed-forward.md`](./feed-forward.md)).
- **Local storage as the store.** Work lives in one browser. gds writes picks into the game checkout.

## Links

- Repository: <https://github.com/spellbound-labs/vfx.lab>
- Layer kinds and starter effects: [`js/presets.js`](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/presets.js)
- Editor, history, agent handle: [`js/editor.js`](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/editor.js)
- Rendering and looks: [`js/engine.js`](https://github.com/spellbound-labs/vfx.lab/blob/336b3a5549a134b23398609193f88bff3646bca9/js/engine.js)
