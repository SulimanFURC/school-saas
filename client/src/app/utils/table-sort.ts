/**
 * Client-side sort helpers. Server-paginated lists only reorder the loaded page;
 * full-dataset ordering needs API query params (sort/order).
 */

export type SortDir = 'asc' | 'desc';

export function nextSortDir(current: SortDir): SortDir {
  return current === 'asc' ? 'desc' : 'asc';
}

export function compareNullableString(a: string | null | undefined, b: string | null | undefined): number {
  const sa = (a ?? '').trim();
  const sb = (b ?? '').trim();
  return sa.localeCompare(sb, undefined, { sensitivity: 'base', numeric: true });
}

export function compareDates(a: string | null | undefined, b: string | null | undefined): number {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  const na = Number.isNaN(ta) ? 0 : ta;
  const nb = Number.isNaN(tb) ? 0 : tb;
  return na - nb;
}

export function sortCopy<T>(rows: readonly T[], compare: (a: T, b: T) => number, dir: SortDir): T[] {
  const out = [...rows];
  const m = dir === 'asc' ? 1 : -1;
  out.sort((a, b) => m * compare(a, b));
  return out;
}
