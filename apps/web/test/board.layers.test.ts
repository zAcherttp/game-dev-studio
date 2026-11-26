import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { layersOf } from "../src/client/board/layers.js";
import { fireStudio } from "./fixtures/fire-kit.js";

const LayerIds = Schema.Array(
  Schema.Literals([
    "Anticipation",
    "Streaks",
    "FireLoop",
    "Smoke",
    "flash",
    "path",
  ])
).check(Schema.isMaxLength(8));

const ids = Arbitrary.schema(LayerIds);

const assetWith = (layers: readonly string[]) => ({
  id: "fire",
  layers: Object.fromEntries(
    layers.map((id) => [id, { picks: [], variants: [] }])
  ),
  mix: {},
  studio: "vfx",
  title: "Fire",
});

it.prop(
  "an asset's own layers come first in their order, then every other layer it holds, each once",
  { held: ids, named: ids },
  ({ held, named }) => {
    const given = [...new Set(named)].map((id, order) => ({
      id,
      order,
      renderKind: "gif" as const,
      title: `${id} title`,
    }));

    const result = layersOf(fireStudio, assetWith(held), given);
    const resultIds = result.map((layer) => layer.id);

    expect(new Set(resultIds).size).toBe(resultIds.length);
    expect(resultIds.slice(0, given.length)).toEqual(
      given.map((layer) => layer.id)
    );
    expect(new Set(resultIds)).toEqual(
      new Set([...given.map((layer) => layer.id), ...held])
    );
  }
);
