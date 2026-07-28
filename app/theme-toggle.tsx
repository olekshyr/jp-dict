"use client";

import { useEffect } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Switches between light and dark.
 *
 * The `dark` class on <html> is the single source of truth, so there is no React
 * state to hydrate: which icon shows is decided by the `dark:` variants, which
 * are already correct in the server HTML once ThemeScript has run.
 */
export function ThemeToggle() {
  // Until the user picks a side, follow the OS. `matchMedia` fires while the tab
  // is open, so the initial read in ThemeScript isn't enough on its own.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      if (localStorage.getItem("theme")) return;
      document.documentElement.classList.toggle("dark", media.matches);
    };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle dark mode"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark");
        localStorage.setItem("theme", dark ? "dark" : "light");
      }}
    >
      <SunIcon className="dark:hidden" aria-hidden />
      <MoonIcon className="hidden dark:block" aria-hidden />
    </Button>
  );
}
