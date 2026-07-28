import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * `<SignIn />` resolves Clerk state at request time, so under Cache Components
 * it must stream behind a boundary — otherwise it blocks the whole route from
 * prerendering ("Uncached data was accessed outside of <Suspense>").
 */
export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={<Skeleton className="h-96 w-80 rounded-xl" />}>
        <SignIn />
      </Suspense>
    </div>
  );
}
