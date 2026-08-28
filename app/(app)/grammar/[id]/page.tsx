import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRule } from "@/lib/grammar/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkPending } from "../../link-pending";
import { parseRuleId } from "../rule-id";
import { RuleView } from "./rule-view";

/** A syntactically valid uuid that belongs to nobody. See `generateStaticParams`. */
const SAMPLE_ID = "00000000-0000-4000-8000-000000000000";

/**
 * `runtime` rather than `static`: this route reads a dynamic `id`, so instant
 * validation needs a concrete sample. The sample only has to be a syntactically
 * valid uuid — the whole body reads request-time auth and sits behind the
 * boundary below, so nothing it resolves to reaches the shell.
 */
export const unstable_instant = {
  prefetch: "runtime",
  // A literal, not SAMPLE_ID: Next parses segment config exports statically and
  // rejects one built from an identifier.
  samples: [{ params: { id: "00000000-0000-4000-8000-000000000000" } }],
};

/**
 * Required, and required to be non-empty: under `cacheComponents` a dynamic
 * route with no concrete params cannot have its shell validated at build time,
 * and the build fails with `EmptyGenerateStaticParamsError`.
 *
 * There is nothing real to name — every rule is private to one user, so a build
 * cannot know any id, let alone prerender one. A placeholder is enough because
 * the shell is genuinely id-independent: it is a back-link and a skeleton, and
 * the only thing that reads the path is `NavLink`, which lights the Grammar tab
 * for every `/grammar/…`. The rule itself streams per request behind the
 * boundary below.
 *
 * Without this the build fails the other way — "Uncached data was accessed
 * outside of <Suspense>" pointing at `NavLink`, because on a dynamic route with
 * no known params `usePathname()` is request data. /entry/[id] never hits it
 * only because its `generateStaticParams` names 200 real entries.
 */
export async function generateStaticParams() {
  return [{ id: SAMPLE_ID }];
}

async function Rule({ id }: Readonly<{ id: string }>) {
  const ruleId = parseRuleId(id);
  if (ruleId === null) notFound();

  const rule = await getRule(ruleId);
  // `getRule` is scoped by user id, so someone else's rule is indistinguishable
  // from one that never existed — which is the answer we want to give.
  if (!rule) notFound();

  return <RuleView id={rule.id} title={rule.title} body={rule.body} />;
}

export default function RulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div>
      <Link
        href="/grammar"
        className="relative mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to grammar
        <LinkPending />
      </Link>

      <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
        {/*
          Resolved inline rather than awaited here: awaiting `params` in this
          component would suspend the page itself and pull the link above out of
          the static shell.
        */}
        {params.then(({ id }) => (
          <Rule id={id} />
        ))}
      </Suspense>
    </div>
  );
}
