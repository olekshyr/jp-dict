import { Suspense } from "react";
import Link from "next/link";
import { NotebookPenIcon, PlusIcon, SearchXIcon } from "lucide-react";

import { getMyRuleCount, getMyRules } from "@/lib/grammar/queries";
import { pageCount, parsePagination } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ItemGroup } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkPending } from "../link-pending";
import { PaginationBar } from "../pagination-bar";
import { PendingContent } from "../pending-content";
import { SearchField } from "../search-field";
import {
  GRAMMAR_SEARCH_LABEL,
  GRAMMAR_SEARCH_PLACEHOLDER,
  GrammarSearchBox,
} from "./grammar-search-box";
import { RuleRow } from "./rule-row";

type GrammarPageParams = {
  q?: string;
  page?: string;
  perPage?: string;
};

/**
 * `runtime` because this route reads `?q`, `?page` and `?perPage`. Every param
 * the route reads has to appear in every sample, `null` where it should be
 * absent.
 */
export const unstable_instant = {
  prefetch: "runtime",
  samples: [
    { searchParams: { q: null, page: null, perPage: null } },
    { searchParams: { q: "てしまう", page: null, perPage: null } },
    { searchParams: { q: "conditional", page: "2", perPage: "50" } },
  ],
};

function RuleListSkeleton() {
  return (
    <ItemGroup>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 rounded-md" />
      ))}
    </ItemGroup>
  );
}

async function RuleList({
  searchParams,
}: Readonly<{
  searchParams: Promise<GrammarPageParams>;
}>) {
  const { q = "", ...rest } = await searchParams;
  const query = q.trim();
  const { page: requestedPage, perPage, offset } = parsePagination(rest);

  const [requestedRules, total] = await Promise.all([
    getMyRules(query, perPage, offset),
    getMyRuleCount(query),
  ]);

  // Like /list, this shrinks underneath the user: deleting the last rule on the
  // last page leaves them pointing past the end. The extra query only runs in
  // that one case.
  const page = Math.min(requestedPage, pageCount(total, perPage));
  const rules =
    page === requestedPage
      ? requestedRules
      : await getMyRules(query, perPage, (page - 1) * perPage);

  if (rules.length === 0) {
    return query ? (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>No rules match “{query}”</EmptyTitle>
          <EmptyDescription>
            <Link href="/grammar">Clear the search</Link> to see all of them, or{" "}
            <Link href="/grammar/new">write a new rule</Link>.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <NotebookPenIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>
            <Link href="/grammar/new">Write your first rule</Link> — a formula,
            when to use it, and a couple of examples.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <PendingContent>
      <ItemGroup>
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            id={rule.id}
            title={rule.title}
            excerpt={rule.excerpt}
          />
        ))}
      </ItemGroup>

      <PaginationBar
        pathname="/grammar"
        params={{ q: query }}
        page={page}
        perPage={perPage}
        total={total}
      />
    </PendingContent>
  );
}

export default function GrammarPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<GrammarPageParams>;
}>) {
  return (
    <div>
      {/* Static shell: the heading and the New button paint immediately. */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Grammar</h1>
        {/* `relative` anchors <LinkPending>, which positions itself out of flow. */}
        <Button
          size="sm"
          className="relative"
          nativeButton={false}
          render={<Link href="/grammar/new" />}
        >
          <PlusIcon data-icon="inline-start" />
          New rule
          <LinkPending />
        </Button>
      </div>

      <Suspense
        fallback={
          <SearchField
            disabled
            placeholder={GRAMMAR_SEARCH_PLACEHOLDER}
            label={GRAMMAR_SEARCH_LABEL}
          />
        }
      >
        <GrammarSearchBox />
      </Suspense>

      <Suspense fallback={<RuleListSkeleton />}>
        <RuleList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
