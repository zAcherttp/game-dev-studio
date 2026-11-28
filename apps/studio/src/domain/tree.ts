import { Schema } from "effect";

export const STATUSES = [
  "live",
  "building",
  "needs-owner",
  "planned",
  "idea",
  "reference",
  "dropped",
] as const;

export interface TreeNodeValue {
  readonly children?: readonly TreeNodeValue[];
  readonly id: string;
  readonly issue?: string;
  readonly kind: string;
  readonly owner?: string;
  readonly status?: string;
  readonly summary?: string;
  readonly title: string;
  readonly url?: string;
}

export const TreeNode: Schema.Codec<TreeNodeValue> = Schema.Struct({
  children: Schema.optionalKey(
    Schema.Array(Schema.suspend((): Schema.Codec<TreeNodeValue> => TreeNode))
  ),
  id: Schema.String,
  issue: Schema.optionalKey(Schema.String),
  kind: Schema.String,
  owner: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.String),
  summary: Schema.optionalKey(Schema.String),
  title: Schema.String,
  url: Schema.optionalKey(Schema.String),
});

export const SORTS = ["tree", "status", "name"] as const;

export type Sort = (typeof SORTS)[number];

export interface Row {
  readonly depth: number;
  readonly node: TreeNodeValue;
}

export interface Area {
  readonly live: number;
  readonly node: TreeNodeValue;
  readonly rows: readonly Row[];
  readonly total: number;
}

export const isFeature = (node: TreeNodeValue) => node.kind === "feature";

export const isClaimable = (node: TreeNodeValue) =>
  isFeature(node) &&
  (node.owner ?? "") === "" &&
  (node.issue ?? "") === "" &&
  ["needs-owner", "planned", "idea"].includes(node.status ?? "");

const STATUS_ORDER: readonly string[] = STATUSES;

const rank = (node: TreeNodeValue) => {
  const index = STATUS_ORDER.indexOf(node.status ?? "");

  return index === -1 ? STATUSES.length : index;
};

const sorted = (nodes: readonly TreeNodeValue[], sort: Sort) => {
  if (sort === "name") {
    return nodes.toSorted((a, b) => a.title.localeCompare(b.title));
  }

  if (sort === "status") {
    return nodes.toSorted(
      (a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title)
    );
  }

  return nodes;
};

const rowsOf = (
  node: TreeNodeValue,
  depth: number,
  sort: Sort
): readonly Row[] =>
  sorted(node.children ?? [], sort).flatMap((child) => [
    { depth, node: child },
    ...rowsOf(child, depth + 1, sort),
  ]);

export const outline = (root: TreeNodeValue, sort: Sort): readonly Area[] =>
  (root.children ?? []).map((area) => {
    const rows = rowsOf(area, 0, sort);
    const features = rows.filter((row) => isFeature(row.node));

    return {
      live: features.filter((row) => row.node.status === "live").length,
      node: area,
      rows,
      total: features.length,
    };
  });
