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

export const SHOWS = ["all", "unclaimed", "claimed"] as const;

export type Show = (typeof SHOWS)[number];

export interface Filter {
  readonly owner: string;
  readonly query: string;
  readonly show: Show;
  readonly status: string;
}

export const NO_FILTER: Filter = {
  owner: "",
  query: "",
  show: "all",
  status: "",
};

export interface Row {
  readonly context: boolean;
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

export const isFiltered = (filter: Filter) =>
  filter.show !== "all" ||
  filter.owner !== "" ||
  filter.status !== "" ||
  filter.query.trim() !== "";

const isClaimed = (node: TreeNodeValue) =>
  (node.owner ?? "") !== "" || (node.issue ?? "") !== "";

const showMatches = (node: TreeNodeValue, show: Show) => {
  if (show === "unclaimed") {
    return isClaimable(node);
  }

  if (show === "claimed") {
    return isFeature(node) && isClaimed(node);
  }

  return true;
};

export const matches = (node: TreeNodeValue, filter: Filter) => {
  const words = filter.query.toLowerCase().split(/\s+/u).filter(Boolean);
  const hay = `${node.title} ${node.summary ?? ""}`.toLowerCase();

  return (
    showMatches(node, filter.show) &&
    (filter.owner === "" || node.owner === filter.owner) &&
    (filter.status === "" || node.status === filter.status) &&
    words.every((word) => hay.includes(word))
  );
};

const rowsOf = (
  node: TreeNodeValue,
  depth: number,
  sort: Sort,
  filter: Filter
): readonly Row[] =>
  sorted(node.children ?? [], sort).flatMap((child) => {
    const below = rowsOf(child, depth + 1, sort, filter);
    const hit = matches(child, filter);

    return hit || below.length > 0
      ? [{ context: !hit, depth, node: child }, ...below]
      : [];
  });

export const owners = (root: TreeNodeValue): readonly string[] => {
  const found = new Set<string>();

  const walk = (node: TreeNodeValue) => {
    if ((node.owner ?? "") !== "") {
      found.add(node.owner ?? "");
    }

    for (const child of node.children ?? []) {
      walk(child);
    }
  };

  walk(root);

  return [...found].toSorted((a, b) => a.localeCompare(b));
};

export const outline = (
  root: TreeNodeValue,
  sort: Sort,
  filter: Filter
): readonly Area[] =>
  (root.children ?? []).flatMap((area) => {
    const all = rowsOf(area, 0, sort, NO_FILTER);
    const rows = isFiltered(filter) ? rowsOf(area, 0, sort, filter) : all;
    const features = all.filter((row) => isFeature(row.node));

    return rows.length === 0
      ? []
      : [
          {
            live: features.filter((row) => row.node.status === "live").length,
            node: area,
            rows,
            total: features.length,
          },
        ];
  });
