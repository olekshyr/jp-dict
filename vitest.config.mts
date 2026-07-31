import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Reads the `@/*` map straight out of tsconfig.json, so there is no second
    // copy of it to keep in sync. (The Next docs still reach for the
    // vite-tsconfig-paths plugin here; Vite does it natively now.)
    tsconfigPaths: true,
    alias: {
      // A bare `import "server-only"` resolves to a module that throws outside
      // a server bundler. Nothing under test imports it today, but the alias
      // keeps a future test on lib/user-words/ from failing for a silly reason.
      "server-only": fileURLToPath(new URL("./test/empty.ts", import.meta.url)),
    },
  },
  test: {
    // The default for component tests. The pure lib tests drop back to "node"
    // with a per-file `@vitest-environment` docblock and pay no jsdom cost.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.tsx"],
    // No `globals: true`: tsconfig has no `types` array and adding one would
    // change type resolution for the whole project. Tests import describe/it/
    // expect from "vitest" explicitly instead.
    exclude: ["node_modules/**", ".next/**", "drizzle/**", "data/**"],
    coverage: {
      provider: "v8",
      // The v8 text table collapses fully-covered files whatever `skipFull`
      // says, so the terminal shows only the gaps. `json-summary` carries the
      // complete per-file picture (coverage/coverage-summary.json) and `html`
      // the line-by-line one.
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      // Scoped to the surface unit tests can actually reach, so the number
      // means something. `components/ui/` is left out wholesale — those are
      // vendored shadcn/Base UI primitives that shadcn rewrites on upgrade,
      // and testing them tests Base UI. pagination.tsx is named back in
      // because it is the one we modified, and it is tested.
      include: [
        "app/**",
        "components/logo.tsx",
        "components/ui/pagination.tsx",
        "lib/**",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        // Stylesheets and the icon route get swept up by `app/**` otherwise,
        // and always report a meaningless 100%.
        "**/*.{css,svg}",
        // Async Server Components: Vitest does not support them and the Next
        // docs point at E2E instead.
        "app/**/{page,layout,template,loading,error,not-found}.tsx",
        "app/actions/**",
        // Request-time or DB-bound, and `use cache` is compiled by Next's SWC
        // plugin rather than Vite.
        "lib/db/**",
        "lib/user-words/**",
        "lib/dictionary/{search,entry}.ts",
        // Generated from JMdict by scripts/gen-tags.ts.
        "lib/dictionary/tags.ts",
      ],
    },
  },
});
