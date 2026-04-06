/** 1-based page indices to show in pagination (sliding window). */
export function windowedPageNumbers1Based(currentPage: number, totalPages: number, windowSize = 5): number[] {
  if (totalPages <= 0) return [];
  const cur = Math.min(Math.max(1, currentPage), totalPages);
  let start = Math.max(1, cur - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  if (end - start + 1 < windowSize) {
    start = Math.max(1, end - windowSize + 1);
  }
  const arr: number[] = [];
  for (let p = start; p <= end; p++) {
    arr.push(p);
  }
  return arr;
}
