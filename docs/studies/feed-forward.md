# Feed-forward: story blocks and the minimap

Notes for the gds vision plan (`docs/plans/dev-studio.md` in the game repository). Two ideas Phát named on 2026-11-27. Not built; nothing here is decided. Each idea lists what it is, what the studies say, the shape it suggests, and the calls it needs.

## 1. A story block per spark

### What Phát asked for

A spark is one effect idea. Its story block, like Flora's prompt blocks, carries the imagined visual plus its references. The round runs from it: agents make takes by code or by mixing references, and liked takes are kept. One canvas holds many sparks, instead of one session per spark.

### What the studies say

- Pablo's armor worked because every piece had its own reference. A story block is where the whole reference lives; each layer takes a crop of it ([layer sizing](./layer-sizing.md), rule 4).
- VFX.LAB keeps nothing between variations but undo. A story block is the anchor that makes takes comparable over time: every take answers the same block.
- Effekseer keeps the authoring record (`EDIT`) beside the result (`BIN_`). A take should keep the block version it answered, so a later change to the block doesn't orphan old takes.

### Shape it suggests

- **Story block**: a node on the canvas, one per spark. Fields: a title, the imagined visual in a few plain sentences, references (clips, stills, links) each with an optional crop or frame range, the sync beat, and the layer list the agent proposes from it.
- **Versioned**: editing the block makes a new version; takes record which version they answered.
- **Drives the round**: `round` reads the block plus the pick and note. An agent's pack (`getPack`) includes the block and the layer's crop.
- **Liked takes are kept**: a like is lighter than a pick. A layer has one pick, but any number of liked takes stay visible on the canvas as candidates for later rounds and for mixing.
- **Agents never edit the block.** It is Phát's words. An agent proposes changes as a note.

### Calls it needs

- Is a spark the same as an asset, or does an asset hold several sparks? (Recommended: a spark is an asset with a story block; avoids a second word.)
- Is "liked" a new record beside "pick", or a pick note? (Hard to undo once picks are saved.)
- Who writes the layer list: Phát in the block, or the agent from the block with Phát's yes?

## 2. A minimap that renders the mix

### What Phát asked for

A minimap on the canvas renders all layers combined. Selecting a layer keeps that layer opaque and makes every other layer translucent.

### What the studies say

- Effekseer and VFX.LAB both isolate by hiding. Hiding loses the context; showing again loses the focus. Neither dims. The minimap fills that gap.
- VFX.LAB's occluder ghosts (faint wireframes) show that a translucent stand-in reads well without covering the subject.
- Effekseer hides a whole subtree at once: the minimap should dim a layer group as one.

### Shape it suggests

- **Always on**: a small panel pinned to a corner of the canvas, playing the asset's mix (current picks) in a loop on the sync beat.
- **Focus follows selection**: selecting a layer, or one of its variants, draws that layer opaque at full strength and every other layer at a fixed low opacity. Selecting a variant swaps it into the minimap's mix in place of the pick, so Phát sees the variant in context before picking.
- **Nothing selected**: everything opaque, the mix as it ships.
- **Render path**: three cheap options, best first. (a) The renderer draws each layer to its own pass with alpha, and the web app composites with per-layer opacity, so focus changes cost no render. (b) The renderer takes a focus layer and an opacity and renders a fresh frame. (c) A still per layer composited in the browser, if a renderer can't do passes.
- **Same frame as the board**: the minimap scrubs with the board's timeline so a variant card and the minimap show the same instant.

### Calls it needs

- The dim level for unfocused layers (a look call; suggest offering 15, 30 and 50 percent).
- Whether additive layers (glows) dim by opacity or by intensity: additive blending makes plain opacity look odd. (Technical, but it changes what Phát sees.)
- Whether the minimap also shows liked takes, or only picks and the selected variant.
- Render path (a) needs each `Renderer` to emit per-layer passes: a change to the port, so it is the technical lead's call, recorded when made.
