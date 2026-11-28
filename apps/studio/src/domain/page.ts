import { Schema } from "effect";

export const PageKind = Schema.Literals(["frame", "tree", "decisions"]);

export const Page = Schema.Struct({
  hint: Schema.optionalKey(Schema.String),
  id: Schema.String,
  kind: Schema.optionalKey(PageKind),
  title: Schema.String,
  url: Schema.String,
});

export type PageValue = typeof Page.Type;

export const StudioConfig = Schema.Struct({
  boardUrl: Schema.String,
  pages: Schema.Array(Page),
});

export type StudioConfigValue = typeof StudioConfig.Type;

export const StudioLink = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
});

export type StudioLinkValue = typeof StudioLink.Type;

export const kindOf = (page: PageValue) => page.kind ?? "frame";

export const hostPath = (page: PageValue, path: string) =>
  `/pages/${page.id}${path}`;
