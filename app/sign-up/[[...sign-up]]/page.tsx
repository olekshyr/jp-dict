import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

import { Skeleton } from "@/components/ui/skeleton";

/** See the note in the sign-in page: Clerk's widget streams behind Suspense. */
export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={<Skeleton className="h-96 w-80 rounded-xl" />}>
        <SignUp />
      </Suspense>
    </div>
  );
}
