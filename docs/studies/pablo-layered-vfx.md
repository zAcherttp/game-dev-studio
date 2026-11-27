# Pablo's AI-assisted armor (the layered workflow)

Studied 2026-11-27, read-only. Source: an X post by Pablo (@DevPablooo), 2026-11-25, <https://x.com/DevPablooo/status/2125679082926948729>. Lessons are in our own words.

## What we could read, and what we could not

- **Read:** the post text and its numbers. Pablo says he and an AI fully adapted an R15 armor, at about 1 USD in tokens and 2 to 3 hours of work. The post has one image and about 11.7K views.
- **Not read:** the image and any thread of process notes. X serves the text to an automated fetch, not the media. The workflow details below come from Phát's description, 2026-11-27, and are marked so. If Phát has screenshots or notes, they go in this file's "Open" list.

So this is not a VFX study in the narrow sense. It is a model (armor pieces on an R15 rig), and what Phát wants from it is the workflow.

## What it is

Phát, 2026-11-27: "the author of this claimed this was ai assisted, he had tons of exp in solo gamedev, but the result is still impressive and we can imagine a lower poly ... whats important is the workflow, ref art from solo leveling, each pieces broken down to a 'layer' small enough for the agent to do well".

An experienced solo developer drove an AI through a large asset by cutting it into small pieces. Each piece had a reference. The AI made one piece at a time.

## What it tried

- **Small cost, big result.** About one dollar of tokens over two to three hours. The low token cost is the clue: no single request was large. Many small, well-aimed requests beat one big one.
- **Experience as the frame.** The author knew how the finished armor should split and fit. The AI filled in each piece; the person held the whole in their head. gds aims to put that "whole in the head" on the canvas instead.

## How it splits the asset into parts

From Phát's description, not from the post:

- **By piece of the costume.** Helmet, pauldrons, chest, gauntlets, greaves and so on. Each piece maps to one body part of the R15 rig, so each has a clear boundary and a clear attachment.
- **One reference per piece.** The references are anime art (Solo Leveling). A piece is matched against the matching crop of the art, not the whole picture.
- **Small enough to judge alone.** A piece is done when it matches its crop and fits its body part. Nobody has to imagine the whole to say yes or no.

## How it shows the whole while one part is worked on

Unknown from the post. On an R15 rig the answer is natural: every finished piece stays on the character, and the new piece is judged in place. The rig is the "mix" that every piece is drawn onto.

## How it keeps or versions takes

Unknown from the post. Nothing suggests takes were kept; most likely each piece was regenerated until accepted.

## What gds should borrow

1. **Split by a boundary the asset already has.** For armor that is the body part. For VFX it is the role in the timeline (anticipation, flash, path, impact, smoke, debris) and the space it fills (core, rim, trail, ground). A layer with a natural boundary is easy to hand to an agent and easy to judge.
2. **One reference crop per layer.** A story block carries the whole reference; each layer gets the part of it that it must match (a frame range of a clip, a crop of a still, one colour swatch).
3. **Judge each layer on the mix.** Every accepted piece stayed on the rig. In gds, a layer's variants are drawn over the other layers' current picks, which the plan already does.
4. **Many small rounds.** Cheap, short requests, each verified, then the next. The VFX studio should prefer five rounds on five layers over one round on the whole effect.

## What to avoid

- **Copying anime art into the game.** References guide; they are never traced, sampled or shipped. The game's own look comes from its specs.
- **Hiding the whole in one person's head.** Pablo could hold the whole because of years of experience. gds must show it (the mix and the minimap in [`feed-forward.md`](./feed-forward.md)) so an agent and a less experienced teammate can too.
- **Reading a showcase as a recipe.** One post, one image, a claimed cost. Treat the numbers as a hint, not a benchmark.

## Open

- Screenshots or notes from Phát on the actual steps (asked through PC Bob, 2026-11-27).

## Links

- Post: <https://x.com/DevPablooo/status/2125679082926948729>
