import Link from "next/link";

import {
  PER_PAGE_OPTIONS,
  pageCount,
  pageItems,
  paginationHref,
} from "@/lib/pagination";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { LinkPending } from "./link-pending";
import { RowsPerPageSelect } from "./rows-per-page-select";

/**
 * The pagination bar shared by search results and the saved-word list.
 *
 * A server component: it holds the whole URL vocabulary of the route — which
 * params to preserve, which page each link points at — and hands the client
 * island below nothing but finished hrefs.
 *
 * Layout is DOM order pagination-then-select, which stacks correctly on mobile
 * (pages above, page size below) and is flipped by `order` on desktop so the
 * select sits on the left and the pages on the right.
 */
export function PaginationBar({
  pathname,
  params,
  page,
  perPage,
  total,
}: Readonly<{
  pathname: string;
  /** The route's own search params, carried through every link. */
  params?: Record<string, string | undefined>;
  page: number;
  perPage: number;
  total: number;
}>) {
  // Below the smallest page size there is nothing to choose: every option would
  // produce a single page, so the whole bar would be decoration.
  if (total <= PER_PAGE_OPTIONS[0]) return null;

  const totalPages = pageCount(total, perPage);
  const pageHref = (target: number) =>
    paginationHref(pathname, { ...params, page: target, perPage });

  return (
    <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
      <Pagination className="w-auto sm:order-2 sm:mx-0">
        <PaginationContent>
          <PaginationItem>
            {page > 1 ? (
              // `relative` anchors the pending spinner, which is positioned out
              // of flow so a page number stays a 36px square while it loads.
              <PaginationPrevious
                className="relative"
                render={<Link href={pageHref(page - 1)} />}
              >
                <LinkPending />
              </PaginationPrevious>
            ) : (
              // Rendered as an inert span rather than dropped, so the bar keeps
              // its width and the page numbers don't shift on the first page.
              <PaginationPrevious
                aria-disabled
                className="pointer-events-none opacity-50"
                render={<span />}
              />
            )}
          </PaginationItem>

          {pageItems(page, totalPages).map((item, index) =>
            item === "ellipsis" ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink
                  className="relative"
                  isActive={item === page}
                  render={<Link href={pageHref(item)} />}
                >
                  {item}
                  {/* The current page is still a link, but clicking it starts
                      no navigation, so it gets no pending state. */}
                  {item !== page && <LinkPending />}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            {page < totalPages ? (
              <PaginationNext
                className="relative"
                render={<Link href={pageHref(page + 1)} />}
              >
                <LinkPending />
              </PaginationNext>
            ) : (
              <PaginationNext
                aria-disabled
                className="pointer-events-none opacity-50"
                render={<span />}
              />
            )}
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      <RowsPerPageSelect
        className="sm:order-1"
        value={perPage}
        // Changing the page size always returns to page 1 — `page` is simply
        // left out of these hrefs.
        options={PER_PAGE_OPTIONS.map((option) => ({
          value: option,
          href: paginationHref(pathname, { ...params, perPage: option }),
        }))}
      />
    </div>
  );
}
