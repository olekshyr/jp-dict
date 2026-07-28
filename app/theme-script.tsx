/**
 * Applies the saved theme before the browser paints.
 *
 * Theme lives in `localStorage`, which the server can't read, so the HTML always
 * ships light. This script runs synchronously while the browser parses <head>,
 * so it flips the `dark` class ahead of the first paint — no flash, and no
 * hydration mismatch either, because <html> carries `suppressHydrationWarning`.
 * See `next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`.
 *
 * An unset preference falls back to the OS setting; ThemeToggle keeps that in
 * sync for changes made after load.
 */
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem("theme");document.documentElement.classList.toggle("dark",t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))}catch(e){}})()`,
      }}
    />
  );
}
