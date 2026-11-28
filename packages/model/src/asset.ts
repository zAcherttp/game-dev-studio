import { Schema } from "effect";

import { InputRecord } from "./input-record.js";
import { Like } from "./like.js";
import { Pick } from "./pick.js";
import { RoundRequest } from "./round.js";
import { StoryBlock } from "./story.js";
import { Variant } from "./variant.js";

export const AssetLayer = Schema.Struct({
  likes: Schema.optionalKey(
    Schema.Array(Like).annotate({
      description:
        "Every like and dropped like on this layer, oldest first. likedTakes folds them into the takes liked now.",
    })
  ),
  making: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "When set, the at of the open round: the layer is making variants and refuses a pick until addVariants lands.",
    })
  ),
  picks: Schema.Array(Pick),
  rounds: Schema.optionalKey(
    Schema.Array(RoundRequest).annotate({
      description: "Every round requested on this layer, oldest first.",
    })
  ),
  variants: Schema.Array(Variant),
});

export const Mix = Schema.Record(Schema.String, Schema.String).annotate({
  description: "The picked variant id for each layer id.",
});

export const Asset = Schema.Struct({
  id: Schema.String,
  layers: Schema.Record(Schema.String, AssetLayer),
  mix: Mix,
  records: Schema.optionalKey(
    Schema.Array(InputRecord).annotate({
      description:
        "Input records every take of the asset replays, oldest first. A take never owns a record.",
    })
  ),
  story: Schema.optionalKey(
    Schema.Array(StoryBlock).annotate({
      description:
        "Every version of the asset's story block, oldest first; the last is current.",
    })
  ),
  studio: Schema.String,
  title: Schema.String,
});

export const AssetSummary = Schema.Struct({
  id: Schema.String,
  kind: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "What sort of asset this is in its studio, such as a house or a dungeon room. Gates with kinds run only on assets of those kinds.",
    })
  ),
  picks: Schema.optionalKey(
    Schema.Int.annotate({
      description:
        "How many picks the asset's history holds; absent when the studio has no picks file for it yet.",
    })
  ),
  title: Schema.String,
});
