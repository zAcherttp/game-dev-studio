import { Config, Effect, Schema } from "effect";

export const Page = Schema.Struct({
  hint: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "What to run when the page does not load, shown under its frame.",
    })
  ),
  id: Schema.String.check(Schema.isPattern(/^[\w-]+$/u)),
  title: Schema.String,
  url: Schema.String.annotate({
    description: "Where the page lives; the hub opens it in a frame.",
  }),
});

export type PageValue = typeof Page.Type;

const PageList = Schema.fromJsonString(Schema.Array(Page));

export class PagesInvalid extends Schema.TaggedError<
  PagesInvalid,
  { readonly brand: unique symbol }
>()("PagesInvalid", { message: Schema.String }) {}

export const decodePages = Effect.fn("web.decodePages")(function* decodePages(
  raw: string
) {
  return yield* Schema.decodeEffect(PageList)(raw).pipe(
    Effect.mapError(
      (error) =>
        new PagesInvalid({
          message: `GDS_PAGES is not a list of pages ({ id, title, url, hint? }): ${error.message}. Fix: check the game's tools/devstudio/pages.json.`,
        })
    )
  );
});

export const loadPages = Effect.fn("web.loadPages")(function* loadPages() {
  const raw = yield* Config.String("GDS_PAGES").pipe(Config.withDefault("[]"));

  return yield* decodePages(raw);
});
