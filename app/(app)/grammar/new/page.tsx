import Link from "next/link";

import { LinkPending } from "../../link-pending";
import { RuleForm } from "../rule-form";

/*
 * `runtime` with one empty sample, not `static`: this route reads no params, but
 * `static` asserts the whole page prerenders, and the (app) layout's AuthGate
 * reads auth — so nothing under it is ever entirely prerenderable. The guard is
 * still worth having: it fails the build if the form ever grows a boundary that
 * would block navigation.
 */
export const unstable_instant = { prefetch: "runtime", samples: [{}] };

export default function NewRulePage() {
  return (
    <div>
      <Link
        href="/grammar"
        className="relative mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to grammar
        <LinkPending />
      </Link>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New rule</h1>

      <RuleForm />
    </div>
  );
}
