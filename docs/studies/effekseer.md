# Effekseer

Studied 2026-11-27 at commit [`b570008`](https://github.com/effekseer/Effekseer/tree/b5700082b49bc5f919610880dafddc90211a9a4e), read-only. Lessons are in our own words; no code or assets are copied.

## What it is

Effekseer is a free, open-source particle effect editor and runtime from Japan, about 2.2K stars. A C# editor (ImGui front end) authors an effect; a C++ runtime plays it in DirectX, OpenGL, Vulkan, Metal, Unity, Unreal and others. It has shipped since the early 2010s and its file format has gone through many versions.

## What it tried

One editor for every engine. The effect is engine-neutral data; each engine gets a thin runtime. That is the same bet gds makes with its `Renderer` port, and Effekseer shows the bet holds for VFX over a decade.

## How it splits an effect into parts

- **A tree of nodes.** An effect is a root with child nodes, each child able to hold more children ([`NodeBase.cs`](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/EffekseerCore/Data/NodeBase.cs)). A node is one emitter: it spawns instances, and each instance can spawn its children. A child inherits its parent's position, rotation and scale by choice, per node.
- **Every node has the same parameter groups.** [`Node.cs`](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/EffekseerCore/Data/Node.cs) lists them: common (count, life, spawn timing, kill rules), position, rotation, scale, spawn shape, depth, renderer common (texture, blend, UV), the drawing kind (sprite, ribbon, ring, track, model), sound, collisions, GPU particles. Each group has its own panel ([`GUI/Dock/`](https://github.com/effekseer/Effekseer/tree/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/Effekseer/GUI/Dock)).
- **Time is per node, in frames.** Each node says when it starts spawning, how often, how many and how long each instance lives ([`CommonValues.cs`](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/EffekseerCore/Data/CommonValues.cs)). There is no separate timeline track per node: timing is a parameter, and the whole effect plays on one frame range.

The split is technical, not artistic. A node is "a thing that spawns", so one visual idea (a slash) often spans several nodes (the arc, its glow, its sparks), and the tree depth follows spawn order, not meaning.

## How it shows the whole while one part is worked on

- One viewer always plays the whole effect. The controller has a frame slider, a start and end range, step back, step, play and pause ([`ViewerController.cs`](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/Effekseer/GUI/Dock/ViewerController.cs)).
- Each node in the tree has a show and hide toggle (`IsRendered`), and hiding can apply to the whole subtree ([`NodeTreeView.cs` `ChangeVisible`](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/Effekseer/GUI/Dock/NodeTreeView.cs#L394)). So the artist isolates by hiding the rest, then shows it again to judge the whole.
- An edit to a value reaches the viewer at once: the editor re-exports the runtime binary and the viewer reloads it ([`ARCHITECTURE.md`](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/docs/Development/ARCHITECTURE.md), "Flow of Value editing and preview").

There is no dim mode: a node is either drawn fully or not at all. To see one part in context you toggle back and forth.

## How it keeps or versions takes

- **No takes.** One file holds one effect. Alternatives are copies of the file or copies of a node. Undo is a command stack ([`Command/`](https://github.com/effekseer/Effekseer/tree/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/EffekseerCore/Command)).
- **The file keeps both editor and runtime data.** An `.efkefc` file is a small header plus named chunks: `INFO` (dependencies such as textures), `EDIT` (the compressed editor document) and `BIN_` (the runtime binary) ([`EfkEfc.cs` L464](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/EffekseerCore/IO/EfkEfc.cs#L464)). The runtime reads `BIN_` and never needs the editor; the editor reopens `EDIT` with every authoring choice intact.
- **Versions are numbered and migrated in steps.** The runtime binary has a version per release, alphas included ([`Effekseer.BinaryVersion.h`](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Cpp/Effekseer/Effekseer/Utils/Effekseer.BinaryVersion.h)). The editor upgrades old projects through a chain of one-step updaters, 1.4 to 1.5, 1.5 to 1.6 alpha 1, and so on to 1.8 ([`ProjectVersionUpdater.cs`](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/EffekseerCore/Utils/ProjectVersionUpdater.cs)). Each step knows only its neighbour.

## What gds should borrow

1. **One parameter shape per part kind.** Every Effekseer node answers the same questions in the same groups. A gds VFX layer should likewise declare a fixed shape for its kind (a flash, a path, a release, smoke), so an agent knows which knobs exist before it starts and Phát's note can name one.
2. **Keep the authoring record next to the rendered result.** `EDIT` beside `BIN_` means a take can always be reopened and changed, not only replayed. A gds variant should store its generator, seed, parent and parameters beside its render, which the plan already asks for; Effekseer shows it is worth the bytes.
3. **One-step migrations.** When a variant or pick shape changes, write one upgrader per version step, never a jump. Old picks stay readable, which matters because every pick is kept in history.
4. **Subtree visibility.** Hiding a parent hides its children. In gds, a layer group (say "impact": flash plus ring plus sparks) should dim or hide as one.
5. **Instant reload of the whole.** The viewer replays the whole effect after any edit. The gds mix view should redraw the moment a pick or variant changes.

## What to avoid

- **Splitting by spawner instead of by meaning.** A node tree mirrors how particles are spawned. Agents and Phát talk about what a part looks like and does. gds layers stay named by role (flash, path, release, smoke), and a layer may hold several emitters inside it.
- **All or nothing visibility.** Toggling hide and show makes the artist hold the rest of the effect in memory. gds should dim the other layers instead (see [`feed-forward.md`](./feed-forward.md), the minimap).
- **No takes.** Copying files to try alternatives loses the parent and the note. gds keeps variants as first-class records.
- **Hand-tuning dozens of panels.** The parameter surface is huge (14 groups per node). An agent given all of it tends to change many things at once. Give an agent one layer's shape, not the whole effect's.

## Links

- Repository: <https://github.com/effekseer/Effekseer>
- Node data: [`Dev/Editor/EffekseerCore/Data/`](https://github.com/effekseer/Effekseer/tree/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/EffekseerCore/Data)
- Editor panels: [`Dev/Editor/Effekseer/GUI/Dock/`](https://github.com/effekseer/Effekseer/tree/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/Effekseer/GUI/Dock)
- File format: [`Dev/Editor/EffekseerCore/IO/EfkEfc.cs`](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/EffekseerCore/IO/EfkEfc.cs)
- Migrations: [`Dev/Editor/EffekseerCore/Utils/ProjectVersionUpdater.cs`](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Editor/EffekseerCore/Utils/ProjectVersionUpdater.cs)
