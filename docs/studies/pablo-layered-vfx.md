# Pablo's AI-assisted armor (the layered workflow)

Studied 2026-11-27, read-only. Source: an X post by Pablo (@DevPablooo), 2026-11-25, <https://x.com/DevPablooo/status/2125679082926948729>. Lessons are in our own words.

## What we have, and what we don't

- **The post text.** Pablo says he and an AI fully adapted an R15 armor, at about 1 USD in tokens and 2 to 3 hours of work. About 11.7K views.
- **The one image.** The finished armor on a blocky Roblox avatar, shown in a 3D editor viewport on a grid. Phát saved a copy for the team (`E:\se370\lanes\refs\pablo\end-result.webp` on the PC; not committed here, it is the author's art).
- **No workflow.** Phát confirmed the author posted only the end result. The workflow below has two sources, each marked: **Phát's description** of how it was likely done, and what is **inferred** from the image. Neither is stated by the author.

So this is not a VFX study in the narrow sense. It is a model, and what Phát wants from it is the workflow.

## What it is

Phát, 2026-11-27: "the author of this claimed this was ai assisted, he had tons of exp in solo gamedev, but the result is still impressive and we can imagine a lower poly ... whats important is the workflow, ref art from solo leveling, each pieces broken down to a 'layer' small enough for the agent to do well".

An experienced solo developer drove an AI through a large, detailed asset. Phát reads it as the asset cut into small pieces, each with a reference, each made by the AI one at a time.

## What it tried

- **Small cost, big result.** About one dollar of tokens over two to three hours. The low cost suggests no single request was large: many small, well-aimed requests rather than one big one.
- **Experience as the frame.** The author knew how the finished armor should split and fit. The AI filled in pieces; the person held the whole in their head. gds aims to put that whole on the canvas instead.

## How it splits the asset into parts

**Inferred from the image.** The set reads as about nine separate pieces, each a plausible single request:

| Piece | Where it sits | Notes |
| --- | --- | --- |
| Hood | head | dark cloth, small metal studs along the edge |
| Wrapped scarf | neck | soft folds, same cloth as the hood |
| Dragon-head pauldron | one shoulder only | the hero piece; sculpted head, horns, layered plates, a glowing gem eye |
| Coat and shirt | torso | open coat, laced pale shirt, spikes along the lapels |
| Chest straps | torso | studded leather straps with buckles |
| Belt buckle and charms | waist | metal buckle with a gem, two hanging charms |
| Torn skirt | hips | layered cloth, one side purple, the other crimson, torn hems |
| Leg wraps | legs | dark bands with gold trim |
| Boots | feet | banded, gold trim |

What ties them together, also inferred:

- **One palette across every piece.** Black base, gold trim lines, purple gems and glows, crimson cloth. A piece made alone still matches because it obeys the same few colour rules.
- **One trim language.** Thin gold edges with dark fill appear on the pauldron, coat, boots and leg wraps. A shared detail rule does what a shared spine does in VFX.LAB.
- **Natural boundaries.** Each piece covers one body region and stops at its edge, so pieces don't fight for the same space.
- **Asymmetry on purpose.** One shoulder carries the hero piece, the other arm is bare. The whole is composed, not just summed.

**Phát's description.** References came from Solo Leveling art, and each piece was a layer small enough for the agent to do well.

## How it shows the whole while one part is worked on

**Inferred.** The image is an editor viewport with every piece on the avatar, so pieces were most likely judged in place on the body. The avatar is the "mix" that every piece is drawn onto. The bare grey arms show the body itself stayed a plain stand-in.

## How it keeps or versions takes

Unknown. Nothing in the post suggests takes were kept.

## What gds should borrow

1. **Split by a boundary the asset already has.** For armor that is the body region. For VFX it is the role in the timeline (anticipation, flash, path, impact, smoke, debris) and the space it fills (core, rim, trail, ground). A layer with a natural boundary is easy to hand to an agent and easy to judge.
2. **Shared rules bind the layers.** The palette and the trim language are why nine separately made pieces read as one set. A VFX asset's story block should state its few shared rules (palette, edge treatment, glow colour) and every layer's pack should carry them.
3. **One reference crop per layer.** The story block carries the whole reference; each layer gets the part it must match.
4. **Judge each layer on the mix.** Every piece sits on the body. In gds, a layer's variants are drawn over the other layers' current picks, which the plan already does.
5. **Name a hero layer.** The pauldron carries the set; the rest supports it. A VFX asset usually has one too (the slash arc, the impact flash). Spend more rounds there.
6. **Many small rounds.** Cheap, short requests, each verified, then the next.

## What to avoid

- **Copying anime art into the game.** References guide; they are never traced, sampled or shipped. The game's look comes from its own specs.
- **Hiding the whole in one person's head.** Pablo could hold the whole because of years of experience. gds must show it (the mix and the minimap in [`feed-forward.md`](./feed-forward.md)) so an agent and a less experienced teammate can too.
- **Reading a showcase as a recipe.** One post, one image, a claimed cost, no process. Treat the numbers as a hint, not a benchmark. As Phát notes, our game would want a lower-poly take on this level of design.

## Links

- Post: <https://x.com/DevPablooo/status/2125679082926948729>
