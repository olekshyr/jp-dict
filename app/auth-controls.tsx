import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

/**
 * Sign-in / sign-up when signed out, avatar when signed in.
 *
 * `<Show>` is an async Server Component that awaits `auth()`, so under Cache
 * Components every call site must wrap this in <Suspense>. See AuthControlsFallback.
 */
export async function AuthControls() {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button type="button" variant="ghost" size="sm">
            Sign in
          </Button>
        </SignInButton>
        <SignUpButton mode="modal">
          <Button type="button" size="sm">
            Sign up
          </Button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  );
}

/** Keeps the header from shifting while the auth state streams in. */
export function AuthControlsFallback() {
  return <div className="h-8 w-32" aria-hidden />;
}
