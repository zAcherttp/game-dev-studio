import type { CatalogEntryValue } from "./model.js";

export const assetPath = (studio: string, asset: string) =>
  `/studio/${encodeURIComponent(studio)}/${encodeURIComponent(asset)}`;

export const switcherEntries = (
  catalog: readonly CatalogEntryValue[],
  filter: string
): readonly CatalogEntryValue[] => {
  const needle = filter.trim().toLowerCase();

  return catalog
    .filter(
      (entry) =>
        needle === "" ||
        entry.id.toLowerCase().includes(needle) ||
        entry.title.toLowerCase().includes(needle)
    )
    .toSorted(
      (left, right) =>
        Number(right.picks > 0) - Number(left.picks > 0) ||
        left.id.localeCompare(right.id)
    );
};
