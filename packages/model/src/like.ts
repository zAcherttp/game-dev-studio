import { Schema } from "effect";

export const Like = Schema.Struct({
  at: Schema.String.annotate({ description: "ISO 8601 instant of the like." }),
  by: Schema.String,
  keep: Schema.Boolean.annotate({
    description:
      "true likes the take; false drops an earlier like. The latest record per take wins.",
  }),
  layer: Schema.String,
  note: Schema.String,
  variant: Schema.String,
}).annotate({
  description:
    "A like keeps a take on the board for later rounds and mixing. It is its own record beside the pick: a layer has one pick and any number of liked takes.",
});

export type LikeValue = typeof Like.Type;

export const likedTakes = (
  likes: readonly LikeValue[] | undefined
): readonly string[] => {
  const latest = new Map<string, boolean>();

  for (const like of likes ?? []) {
    latest.delete(like.variant);
    latest.set(like.variant, like.keep);
  }

  return [...latest].flatMap(([variant, keep]) => (keep ? [variant] : []));
};
