import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

const buttonClass =
  "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors";

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
          <button
            type="button"
            className={`${buttonClass} text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900`}
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button
            type="button"
            className={`${buttonClass} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300`}
          >
            Sign up
          </button>
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
