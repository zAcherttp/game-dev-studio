import { expect, it } from "@effect/vitest";

import type { TreeNodeValue } from "../src/domain/tree.ts";
import { isClaimable, NO_FILTER, outline } from "../src/domain/tree.ts";

const tree: TreeNodeValue = {
  children: [
    {
      children: [
        {
          id: "slide",
          kind: "feature",
          owner: "a",
          status: "live",
          title: "Slide",
        },
        {
          children: [
            { id: "khinh", kind: "feature", status: "idea", title: "Khinh" },
          ],
          id: "dash",
          kind: "feature",
          owner: "a",
          status: "live",
          title: "Dash",
        },
        {
          id: "stamina",
          kind: "feature",
          status: "needs-owner",
          title: "Stamina",
        },
      ],
      id: "moving",
      kind: "area",
      title: "Moving",
    },
  ],
  id: "game",
  kind: "root",
  title: "Game",
};

const order = (sort: "tree" | "status" | "name") =>
  outline(tree, sort, NO_FILTER)[0]?.rows.map((row) => [
    row.node.id,
    row.depth,
  ]);

it("tree order keeps each feature under the one it builds on", () => {
  expect(order("tree")).toStrictEqual([
    ["slide", 0],
    ["dash", 0],
    ["khinh", 1],
    ["stamina", 0],
  ]);
});

it("sorting reorders siblings and keeps the nesting", () => {
  expect(order("name")).toStrictEqual([
    ["dash", 0],
    ["khinh", 1],
    ["slide", 0],
    ["stamina", 0],
  ]);
  expect(order("status")).toStrictEqual([
    ["dash", 0],
    ["khinh", 1],
    ["slide", 0],
    ["stamina", 0],
  ]);
});

it("an area counts its live features", () => {
  const [moving] = outline(tree, "tree", NO_FILTER);

  expect([moving?.live, moving?.total]).toStrictEqual([2, 4]);
});

it("only an unowned, unclaimed feature is claimable", () => {
  expect(
    isClaimable({ id: "x", kind: "feature", status: "needs-owner", title: "X" })
  ).toBe(true);
  expect(
    isClaimable({
      id: "x",
      kind: "feature",
      owner: "a",
      status: "needs-owner",
      title: "X",
    })
  ).toBe(false);
  expect(
    isClaimable({
      id: "x",
      issue: "9",
      kind: "feature",
      status: "planned",
      title: "X",
    })
  ).toBe(false);
  expect(isClaimable({ id: "x", kind: "area", title: "X" })).toBe(false);
});

it("unclaimed shows free features, with their parents as context", () => {
  const rows = outline(tree, "tree", { ...NO_FILTER, show: "unclaimed" })[0]
    ?.rows;

  expect(rows?.map((row) => [row.node.id, row.context])).toStrictEqual([
    ["dash", true],
    ["khinh", false],
    ["stamina", false],
  ]);
});

it("claimed by one person shows only their features", () => {
  const rows = outline(tree, "tree", { ...NO_FILTER, owner: "a" })[0]?.rows;

  expect(rows?.map((row) => row.node.id)).toStrictEqual(["slide", "dash"]);
});

it("an area with nothing matching is left out", () => {
  expect(outline(tree, "tree", { ...NO_FILTER, query: "zzz" })).toStrictEqual(
    []
  );
});
