import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

/**
 * `<SignIn />` resolves Clerk state at request time, so under Cache Components
 * it must stream behind a boundary — otherwise it blocks the whole route from
 * prerendering ("Uncached data was accessed outside of <Suspense>").
 */
export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Suspense
        fallback={
          <div className="h-96 w-80 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        }
      >
        <SignIn />
      </Suspense>
    </div>
  );
}
