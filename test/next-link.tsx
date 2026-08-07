/**
 * The stand-in for `next/link`, wired up globally in vitest.setup.tsx.
 *
 * The real component wants an app-router context that does not exist here, and
 * every assertion is on the rendered href, so a plain anchor loses nothing. It
 * does not bother with next/link's UrlObject href form — every href in this app
 * is a string, and one showing up would render visibly wrong.
 *
 * `useLinkStatus` is a mutable flag rather than anything router-shaped: nothing
 * navigates under Vitest, so a test that wants to see the pending affordance
 * sets it directly.
 */

let pending = false;

export function setLinkPending(next: boolean): void {
  pending = next;
}

/** Called from the global afterEach so state never leaks between tests. */
export function resetLink(): void {
  pending = false;
}

export function useLinkStatus(): { pending: boolean } {
  return { pending };
}

export default function Link({
  href,
  children,
  ...rest
}: React.ComponentProps<"a">) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
