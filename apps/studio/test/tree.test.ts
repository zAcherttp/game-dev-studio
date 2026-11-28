import { expect, it } from "@effect/vitest";

import type { TreeNodeValue } from "../src/domain/tree.ts";
import { branchIds, isClaimable, place, tally } from "../src/domain/tree.ts";

const tree: TreeNodeValue = {
  children: [
    {
      children: [
        {
          id: "dash",
          kind: "feature",
          owner: "a",
          status: "live",
          title: "Dash",
        },
        {
          id: "stamina",
          kind: "feature",
          owner: "",
          status: "needs-owner",
          title: "Stamina",
        },
        { id: "khinh", kind: "feature", status: "idea", title: "Khinh" },
      ],
      id: "moving",
      kind: "area",
      title: "Moving",
    },
    { id: "story", kind: "area", title: "Story" },
  ],
  id: "game",
  kind: "root",
  title: "Game",
};

it("a folded tree places the root between its areas", () => {
  const placed = place(tree, new Set(), false);

  expect(placed.map((entry) => [entry.node.id, entry.y])).toStrictEqual([
    ["game", 0.5],
    ["moving", 0],
    ["story", 1],
  ]);
});

it("an open branch lists its children, ideas hidden unless shown", () => {
  const hidden = place(tree, new Set(["moving"]), false).map(
    (entry) => entry.node.id
  );

  const shown = place(tree, new Set(["moving"]), true).map(
    (entry) => entry.node.id
  );

  expect(hidden).toStrictEqual(["game", "moving", "dash", "stamina", "story"]);
  expect(shown).toContain("khinh");
});

it("a branch tallies live and needs-owner features", () => {
  const counts = tally(tree, false);

  expect(counts.live).toBe(1);
  expect(counts.free).toBe(1);
  expect(counts.total).toBe(2);
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

it("expand all opens every branch", () => {
  expect(branchIds(tree)).toStrictEqual(["game", "moving"]);
});
