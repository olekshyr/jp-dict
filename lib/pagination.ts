/**
 * Pagination lives in the URL, like every other bit of list state in this app
 * (`?q`, `?filter`). That is what makes back/forward, a refresh and a shared
 * link all land on the same page without any client state to rehydrate.
 *
 * Everything here is pure, so it runs unchanged on the server (building hrefs)
 * and in the client island (reading the current value back out).
 */

export const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;

export const DEFAULT_PER_PAGE = 10;

/**
 * The deepest page a URL may ask for.
 *
 * `page` is user input that ends up as a bound OFFSET, and `Number.isInteger`
 * alone is not a bound: `?page=1e21` is an integer to JavaScript, serializes to
 * `1e+21`, and Postgres answers `invalid input syntax for type bigint`. On the
 * search route it is also part of a `use cache` key with `cacheLife('max')`, so
 * an unbounded page number means an unbounded number of entries that never
 * expire.
 *
 * 10,000 is far past anything reachable. The dictionary holds ~218k entries and
 * the widest single query matches ~21k of them — about 2,200 pages at the
 * smallest page size — so no page a user can actually navigate to gets clamped.
 */
export const MAX_PAGE = 10_000;

/** How many page number links sit either side of the current one. */
const WINDOW = 1;

export type Pagination = Readonly<{
  page: number;
  perPage: number;
  offset: number;
}>;

function parsePerPage(raw?: string): number {
  const value = Number(raw);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(value)
    ? value
    : DEFAULT_PER_PAGE;
}

/**
 * Reads `?page` / `?perPage`, clamping anything unexpected back to a safe
 * default. Search params are user input, so this never throws: a hand-edited
 * `?perPage=999999` becomes the default rather than an unbounded query, and a
 * `?page` beyond `MAX_PAGE` comes back as `MAX_PAGE` rather than as an offset
 * the database cannot parse. Every caller that turns these into SQL relies on
 * that, so bound the value here rather than at each query.
 *
 * The `Math.min` is doing the safety work, not the `isInteger`: it is what keeps
 * `page` — and so `offset` — inside the range Postgres can read, whatever
 * absurdity arrives in the URL. `isInteger` only rejects the fractions and the
 * non-finite values, which have no sensible clamp and fall back to page 1.
 *
 * A `page` past the end of the results is *not* clamped here — that needs a
 * total, which only the caller has.
 */
export function parsePagination(
  raw: Readonly<{ page?: string; perPage?: string }>,
): Pagination {
  const perPage = parsePerPage(raw.perPage);
  const parsedPage = Number(raw.page);
  const page =
    Number.isInteger(parsedPage) && parsedPage > 0
      ? Math.min(parsedPage, MAX_PAGE)
      : 1;

  return { page, perPage, offset: (page - 1) * perPage };
}

/** Total pages for `total` rows, at least 1 so an empty list still has a page 1. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/**
 * The page numbers to render, with `"ellipsis"` standing in for the gaps:
 * `[1, "ellipsis", 6, 7, 8, "ellipsis", 20]`.
 *
 * First, last and current ± 1 is a narrow enough window to fit a 375px screen
 * without a second, responsive variant of the list.
 */
export function pageItems(
  page: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  const shown = new Set<number>([1, totalPages]);
  for (let i = page - WINDOW; i <= page + WINDOW; i++) {
    if (i >= 1 && i <= totalPages) shown.add(i);
  }

  const items: Array<number | "ellipsis"> = [];
  let previous = 0;
  for (const n of [...shown].sort((a, b) => a - b)) {
    // A gap of exactly one page gets the page itself rather than an ellipsis
    // that would take the same space to say less.
    if (n - previous === 2) items.push(previous + 1);
    else if (n - previous > 2) items.push("ellipsis");
    items.push(n);
    previous = n;
  }
  return items;
}

/**
 * Builds a URL from the route's own params plus pagination.
 *
 * Empty values are dropped, and so is `page=1` / the default `perPage`: the
 * shortest URL that means the current view keeps shared links clean and keeps
 * the prefetched `?q=`-only shell reachable.
 */
export function paginationHref(
  pathname: string,
  params: Readonly<Record<string, string | number | undefined>>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (key === "page" && Number(value) <= 1) continue;
    if (key === "perPage" && Number(value) === DEFAULT_PER_PAGE) continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}
