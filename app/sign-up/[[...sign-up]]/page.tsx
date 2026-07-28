import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

/** See the note in the sign-in page: Clerk's widget streams behind Suspense. */
export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Suspense
        fallback={
          <div className="h-96 w-80 animate-pulse rounded-xl bg-muted" />
        }
      >
        <SignUp />
      </Suspense>
    </div>
  );
}
