import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { CatalogEntry, initialModel } from "../src/client/board/model.js";
import { switcherEntries } from "../src/client/board/switcher.js";
import { prerenderPicks } from "../src/client/board/update.js";
import { fireFlags } from "./fixtures/fire-kit.js";

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

it("page load renders each picked take that has no render yet, once", () => {
  const model = initialModel(fireFlags);
  const asset = fireFlags.assets[0]?.asset;

  const missing = Object.entries(asset?.mix ?? {}).filter(([layer, picked]) => {
    const variant = asset?.layers[layer]?.variants.find(
      ({ id }) => id === picked
    );

    return variant !== undefined && variant.render === undefined;
  });

  const withoutRenders = {
    ...model,
    assets: model.assets.map((entry) => ({
      ...entry,
      asset: {
        ...entry.asset,
        layers: Object.fromEntries(
          Object.entries(entry.asset.layers).map(([id, layer]) => [
            id,
            {
              ...layer,
              variants: layer.variants.map(
                ({ render: _drop, ...variant }) => variant
              ),
            },
          ])
        ),
      },
    })),
  };

  expect(prerenderPicks(model)).toHaveLength(missing.length);
  expect(prerenderPicks(withoutRenders).map(({ args }) => args)).toEqual(
    Object.entries(asset?.mix ?? {})
      .filter(
        ([layer, picked]) =>
          asset?.layers[layer]?.variants.some(({ id }) => id === picked) ===
          true
      )
      .map(([layer, variant]) => ({
        asset: "fire",
        layer,
        studio: "vfx",
        variant,
      }))
  );
});
