import type { PackingItem } from '@tripwise/shared';

import { newId } from '../../lib/ids';

/** Add a template's items, skipping ones the list already has (same key or label). */
export function mergeItems(items: PackingItem[], extra: PackingItem[]): PackingItem[] {
  const seen = new Set(items.map((i) => i.label.toLowerCase()));
  const added = extra
    .filter((i) => !seen.has(i.label.toLowerCase()))
    .map((i) => ({ ...i, id: newId('p'), checked: false }));
  return [...items, ...added];
}
