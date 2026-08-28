import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { resetLink } from "./test/next-link";
import { resetNavigation } from "./test/next-navigation";

/*
 * The expensive part of testing this app is not rendering, it is what a
 * component drags in. Everything mocked below is mocked once, here, for reasons
 * of cost as much as isolation:
 *
 *   - `@/app/actions/words` is "use server" and imports `lib/db/client.ts`,
 *     which throws at module load without DATABASE_URL and otherwise builds a
 *     Neon client. `vi.mock` is hoisted, so the real module is never evaluated.
 *   - `next/navigation`'s hooks throw outside a Next runtime.
 *   - `next/link` pulls in Next's client router internals and an app-router
 *     context that does not exist here. Every assertion is on the rendered
 *     href, so a plain anchor loses nothing. It also has to supply
 *     `useLinkStatus`, which <LinkPending> calls and which only exists inside
 *     a real router.
 *   - `lucide-react` is a barrel that evaluates the whole icon set per test
 *     file, and no test cares which glyph came out.
 *
 * What stays real is what is actually under test: @base-ui/react, wanakana,
 * lib/pagination.ts, clsx/tailwind-merge.
 */

vi.mock("@/app/actions/words", () => ({
  // Implementations are passed to vi.fn() rather than set afterwards, so
  // resetAllMocks() below restores them and a per-test override cannot leak.
  addWord: vi.fn(async () => undefined),
  removeWord: vi.fn(async () => undefined),
  setStatus: vi.fn(async () => undefined),
  // Returns the previews the real action returns, so a card sent to the back
  // of the deck by "again" gets fresh labels rather than undefined.
  gradeCard: vi.fn(async () => ({
    again: "1d",
    hard: "2d",
    good: "3d",
    easy: "8d",
  })),
  setNote: vi.fn(async () => undefined),
  setFrontMode: vi.fn(async () => undefined),
}));

vi.mock("@/app/actions/grammar", () => ({
  // Mocked here for the same reason as the words actions: "use server" plus
  // lib/db/client.ts, which throws at module load without DATABASE_URL.
  // The id is a literal, not a shared const: vi.mock factories are hoisted,
  // so anything they close over is still in its temporal dead zone.
  createRule: vi.fn(async () => ({
    id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    body: "<p>saved</p>",
  })),
  // Returns the *sanitized* body, which is what RuleView is supposed to adopt
  // over the raw editor output — a stub returning the input would hide that.
  updateRule: vi.fn(async () => ({ body: "<p>saved</p>" })),
  deleteRule: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", async () => await import("./test/next-navigation"));

vi.mock("next/link", async () => await import("./test/next-link"));

vi.mock("lucide-react", () => {
  const stubs = new Map<string, React.ComponentType<{ className?: string }>>();

  // Vitest awaits the factory result and rejects reads of exports the mock
  // does not claim to have, so the proxy answers `in` as well as `get` — and
  // disowns `then`/`default`/symbols so it is not mistaken for a thenable.
  const isIcon = (prop: string | symbol) =>
    typeof prop === "string" && prop !== "then" && prop !== "default";

  return new Proxy(
    {},
    {
      has: (_target, prop) => isIcon(prop),
      get(_target, prop) {
        if (!isIcon(prop)) return undefined;
        prop = prop as string;
        if (!stubs.has(prop)) {
          const Icon = (props: { className?: string }) => (
            <svg data-icon={prop} aria-hidden {...props} />
          );
          Icon.displayName = prop;
          stubs.set(prop, Icon);
        }
        return stubs.get(prop);
      },
    },
  );
});

// Base UI's Select (reached through RowsPerPageSelect inside PaginationBar)
// wants both of these, and jsdom provides neither.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as typeof globalThis.matchMedia;

afterEach(() => {
  // RTL's auto-cleanup keys off a global afterEach, which `globals: false`
  // doesn't give us.
  cleanup();
  resetNavigation();
  resetLink();
  vi.resetAllMocks();
});
