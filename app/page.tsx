import { Suspense } from "react";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { CanvasText } from "@/components/ui/canvas-text";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { AuthControls, AuthControlsFallback } from "./auth-controls";
import { ThemeToggle } from "./theme-toggle";

/**
 * Landing page. The hero reads no request data and prerenders into the static
 * shell; only the auth controls in the header stream, because Clerk's `<Show>`
 * awaits `auth()`.
 *
 * The hero CTA deliberately does not branch on auth state — it always points at
 * /search, and the AuthGate in `(app)/layout.tsx` bounces signed-out visitors to
 * sign-in. That keeps the largest part of the page fully static.
 */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col px-6">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between py-5">
        <span className="inline-flex items-center">
          <Logo className="h-7" />
          <span className="sr-only">jp-dict</span>
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Suspense fallback={<AuthControlsFallback />}>
            <AuthControls />
          </Suspense>
        </div>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 py-20">
        <p className="mb-4 font-mono text-sm text-muted-foreground">日本語</p>
        <h1 className="text-4xl leading-14 font-semibold tracking-tight sm:text-5xl sm:leading-16">
          Learn Japanese vocabulary,
          <br />
          <CanvasText
            text="one word at a time."
            backgroundClassName="bg-primary"
            colors={[
              "rgba(255, 255, 255, 0.5)",
              "rgba(255, 255, 255, 0.38)",
              "rgba(255, 255, 255, 0.27)",
              "rgba(255, 255, 255, 0.18)",
              "rgba(255, 255, 255, 0.11)",
              "rgba(255, 255, 255, 0.06)",
              "rgba(255, 255, 255, 0.03)",
              "rgba(255, 255, 255, 0.06)",
              "rgba(255, 255, 255, 0.11)",
              "rgba(255, 255, 255, 0.18)",
              "rgba(255, 255, 255, 0.27)",
              "rgba(255, 255, 255, 0.38)",
            ]}
            lineWidth={1.25}
            lineGap={5}
            curveIntensity={40}
            animationDuration={14}
          />
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          Search a dictionary of over 200,000 entries, save the words you want to
          learn, and drill them as flashcards — with kanji, furigana, romaji or
          English on the front.
        </p>

        <div className="mt-10">
          {/*
            HoverBorderGradient renders the element named by `as`, but its props
            are typed as plain HTMLAttributes — no `href`. So the link wraps it
            and the gradient renders as a div, which also keeps us from nesting
            an interactive <button> inside an <a>.
          */}
          <Link href="/search" className="inline-block">
            <HoverBorderGradient
              as="div"
              className="dark:bg-black bg-white px-5 py-2.5 text-sm font-medium dark:text-primary-foreground text-black"
            >
              Open the dictionary
            </HoverBorderGradient>
          </Link>
        </div>
      </div>
    </div>
  );
}
