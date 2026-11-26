import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { Message } from "../src/client/board/message.js";
import { CatalogEntry, initialModel } from "../src/client/board/model.js";
import { switcherEntries } from "../src/client/board/switcher.js";
import { prerenderBoard, update } from "../src/client/board/update.js";
import { fireFlags } from "./fixtures/fire-kit.js";

const render = {
  kind: "gif" as const,
  ms: 900,
  path: "E:/game/.cache/devstudio/vfx/fire/x.gif",
  still: "E:/game/.cache/devstudio/vfx/fire/x.still.png",
};

const Catalog = Schema.Array(CatalogEntry).check(Schema.isMaxLength(60));

it.prop(
  "the switcher keeps every asset the filter names, assets with picks first",
  {
    catalog: Arbitrary.schema(Catalog),
    filter: Arbitrary.schema(Schema.String.check(Schema.isMaxLength(3))),
  },
  ({ catalog, filter }) => {
    const entries = switcherEntries(catalog, filter);
    const needle = filter.trim().toLowerCase();

    const matches = catalog.filter(
      (entry) =>
        entry.id.toLowerCase().includes(needle) ||
        entry.title.toLowerCase().includes(needle)
    );

    expect(entries).toHaveLength(matches.length);

    const firstUnpicked = entries.findIndex((entry) => entry.picks <= 0);

    expect(
      firstUnpicked === -1 ||
        entries.slice(firstUnpicked).every((entry) => entry.picks <= 0)
    ).toBe(true);
  }
);

it("page load renders each shown take alone and the whole mix once, and nothing again once they are in", () => {
  const model = initialModel(fireFlags);
  const commands = prerenderBoard(model);
  const solos = commands.filter((command) => command.name === "RenderSolo");

  const composed = commands.filter(
    (command) => command.name === "RenderComposed"
  );

  expect(solos.length).toBeGreaterThan(0);
  expect(composed).toHaveLength(1);

  let filled = model;

  for (const command of commands) {
    filled = update(
      filled,
      command.name === "RenderSolo"
        ? Message.RenderedSolo({ ...command.args, render })
        : Message.RenderedComposed({ key: command.args.key, render })
    ).model;
  }

  expect(prerenderBoard(filled)).toEqual([]);
});
