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

export type Status = (typeof STATUSES)[number];

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

export interface Placed {
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly node: TreeNodeValue;
  readonly open: boolean;
  readonly parentId: string;
  readonly y: number;
}

export interface Tally {
  readonly byStatus: Readonly<Record<string, number>>;
  readonly free: number;
  readonly live: number;
  readonly total: number;
}

export const isFeature = (node: TreeNodeValue) => node.kind === "feature";

export const isClaimable = (node: TreeNodeValue) =>
  isFeature(node) &&
  (node.owner ?? "") === "" &&
  (node.issue ?? "") === "" &&
  ["needs-owner", "planned", "idea"].includes(node.status ?? "");

const hasVisible = (node: TreeNodeValue): boolean =>
  (node.children ?? []).some(
    (child) => child.status !== "idea" || hasVisible(child)
  );

const visibleChildren = (node: TreeNodeValue, showIdeas: boolean) =>
  (node.children ?? []).filter(
    (child) => showIdeas || child.status !== "idea" || hasVisible(child)
  );

export const tally = (node: TreeNodeValue, showIdeas: boolean): Tally => {
  const counts: Record<string, number> = {};
  let free = 0;

  const walk = (current: TreeNodeValue) => {
    for (const child of visibleChildren(current, showIdeas)) {
      const status = child.status ?? "planned";

      if (isFeature(child)) {
        counts[status] = (counts[status] ?? 0) + 1;
      }

      if (status === "needs-owner" && isClaimable(child)) {
        free += 1;
      }

      walk(child);
    }
  };

  walk(node);

  let total = 0;

  for (const value of Object.values(counts)) {
    total += value;
  }

  return { byStatus: counts, free, live: counts.live ?? 0, total };
};

interface Visit {
  readonly entries: readonly Placed[];
  readonly y: number;
}

export const place = (
  root: TreeNodeValue,
  open: ReadonlySet<string>,
  showIdeas: boolean
): readonly Placed[] => {
  let row = 0;

  const visit = (
    node: TreeNodeValue,
    depth: number,
    parentId: string
  ): Visit => {
    const children = visibleChildren(node, showIdeas);
    const isOpen = depth === 0 || open.has(node.id);

    const entry = {
      depth,
      hasChildren: children.length > 0,
      node,
      open: isOpen,
      parentId,
    };

    if (!isOpen || children.length === 0) {
      const y = row;

      row += 1;

      return { entries: [{ ...entry, y }], y };
    }

    const results = children.map((child) => visit(child, depth + 1, node.id));
    const y = ((results[0]?.y ?? 0) + (results.at(-1)?.y ?? 0)) / 2;

    return {
      entries: [
        { ...entry, y },
        ...results.flatMap((result) => result.entries),
      ],
      y,
    };
  };

  return visit(root, 0, "").entries;
};

export const branchIds = (root: TreeNodeValue): readonly string[] => {
  const ids: string[] = [];

  const walk = (node: TreeNodeValue) => {
    if ((node.children ?? []).length > 0) {
      ids.push(node.id);

      for (const child of node.children ?? []) {
        walk(child);
      }
    }
  };

  walk(root);

  return ids;
};
