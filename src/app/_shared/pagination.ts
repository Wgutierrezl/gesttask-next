export const PAGE_SIZE = 12;
const MAX_PAGE = 1000;

/** Reads `?page=` defensively: anything that is not a positive integer is page 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d+$/.test(value)) return 1;
  return Math.min(Math.max(Number(value), 1), MAX_PAGE);
}

/** Asks for one row beyond the page: its presence tells whether a next page exists without a count query. */
export function pageWindow(page: number): { limit: number; offset: number } {
  return { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE };
}

export function slicePage<T>(rows: T[]): { items: T[]; hasNext: boolean } {
  return { items: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE };
}
