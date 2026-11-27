# Layer sizing: a layer small enough for an agent to do well

Guidance for the VFX studio and the agents that make its variants. Drawn from three studies: [Effekseer](./effekseer.md), [VFX.LAB](./vfx-lab.md) and [Pablo's armor](./pablo-layered-vfx.md). Written 2026-11-27.

## Why

Phát, 2026-11-27: "its the main pain point here when agents try to do VFX in my mac VFX session, it would often build the whole VFX, result is not great at all, but drilled down and each layer verified with our gds canvas to kind of 'imagine' how all would look combined together should make things great".

An agent asked for a whole effect changes many things at once. When the result is wrong, nobody can say which part is wrong, and the next try changes everything again. The three sources point the same way: cut the effect into parts with clear boundaries, make and judge one part at a time, and always judge it on top of the rest.

## The rule

A layer is small enough when all five hold:

1. **One role.** It does one job in the effect, named by what it is: a flash, a path, a ring, sparks, smoke, debris, a ground mark, a screen shake. If its name needs "and", split it.
2. **One beat, one place.** It lives in one stretch of the timeline (anticipation, contact, follow-through, linger) and one region of space (core, rim, trail, ground, screen). It may hold several emitters; Effekseer shows that one look often needs two or three spawners.
3. **A small, fixed shape.** Its kind declares its knobs before the agent starts: timing (start, duration), curves over its life (alpha, size, visibility), a colour gradient, and a few kind-specific fields. As a guide, an agent should touch no more than about a dozen values in one variant. VFX.LAB's layers sit near this; Effekseer's 14 parameter groups per node are far past it.
4. **One reference crop.** It has its own target: a frame range of a reference clip, a crop of a reference still, or a written line from the story block ("a thin white arc, gone in 3 frames"). If no crop or line fits it, it is not a layer yet.
5. **Judgeable in one look.** Phát can say yes or no to it in a few seconds, seen alone and seen in the mix. If judging it needs a second layer to be right first, merge them or settle the other one first.

Layers made one at a time still read as one effect when they obey a few shared rules: a palette, an edge or trim treatment, a glow colour. Pablo's nine armor pieces match because of exactly that. The story block states these rules once, and every layer's pack carries them.

A typical effect has 4 to 9 layers, usually with one hero layer (the slash arc, the impact flash) that earns the most rounds. VFX.LAB's 26 starter effects hold 6 to 14 each, most 6 to 9. Past about 10, group layers (impact: flash, ring, sparks) so the group can be dimmed, hidden and picked as one, as Effekseer hides a subtree.

## How a layer is verified alone

- **Render it solo on a neutral backdrop**, at the studio's sync point, with the same camera and frame range as every other layer.
- **Run the studio's gates on it alone**: its particle count, its draw budget, its duration against its beat, its colours against the look spec.
- **Compare it to its own reference crop**, side by side, scrubbed to the same beat. Not to the whole reference.
- **Name one difference a round.** The agent's note says what it changed and why; Phát's note on a pick says what the next round should move. A round that changes the layer's role is a new layer, not a round.

## How it is checked in the combined view

- **Draw every variant on the mix.** A layer's variants are drawn over the other layers' current picks (the plan's rule). A variant that looks good alone and fights the mix loses.
- **Focus, don't hide.** The selected layer stays opaque and every other layer is dimmed, so the part is judged in context without losing the whole (the minimap in [`feed-forward.md`](./feed-forward.md)).
- **Check the beat lines up.** Every layer is aligned on the sync point. A layer whose peak drifts off the beat is wrong even if it looks right.
- **Whole-effect looks last.** A post-process look (VFX.LAB applies one to the whole frame) and the engine check come after the layers are picked, never as a way to rescue one layer.

## What an agent does

- Takes one layer, its shape, its reference crop and the current picks of the other layers. Nothing else.
- Makes several variants of that layer only. Never edits another layer in the same round.
- Renders each variant alone and on the mix, runs the gates, and writes one note per variant.
- If the layer can't be made well inside its shape, says so and proposes a split. It does not widen the layer.

## What an agent does not do

- Build or rebuild the whole effect in one go.
- Jitter every layer at once to "find a variation" (VFX.LAB's shuffle). Variation is per layer.
- Tune a layer by hiding the others and never looking at the mix.
- Copy reference art into the asset. References guide; the game's look comes from its specs.

## Sources

- [Effekseer](./effekseer.md): fixed parameter groups per part, subtree visibility, one viewer for the whole.
- [VFX.LAB](./vfx-lab.md): role-named typed layers with a shared base, a shared path as spine, 6 to 9 layers per effect.
- [Pablo's armor](./pablo-layered-vfx.md): split by a natural boundary, shared palette and trim rules, a hero piece, each piece judged in place.
