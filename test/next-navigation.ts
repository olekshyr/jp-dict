import { vi } from "vitest";

/**
 * The stand-in for `next/navigation`, wired up globally in vitest.setup.tsx.
 *
 * The real hooks throw outside a Next runtime, and the components that use them
 * only ever read one value or push one URL — so this is a mutable store rather
 * than a router: a test sets the pathname it wants, renders, and asserts on
 * `router.push`.
 */

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

let pathname = "/";
let searchParams = new URLSearchParams();

export function setPathname(next: string): void {
  pathname = next;
}

export function setSearchParams(
  init?: string | Record<string, string>,
): void {
  searchParams = new URLSearchParams(init);
}

/** Called from the global afterEach so state never leaks between tests. */
export function resetNavigation(): void {
  pathname = "/";
  searchParams = new URLSearchParams();
}

export function usePathname(): string {
  return pathname;
}

export function useSearchParams(): URLSearchParams {
  return searchParams;
}

export function useRouter(): typeof router {
  return router;
}

export function useParams(): Record<string, string> {
  return {};
}
