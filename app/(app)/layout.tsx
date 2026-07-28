import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";

import {
  NavigationMenu,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { ThemeToggle } from "@/app/theme-toggle";
import { NavLink } from "./nav-link";

/**
 * Redirects signed-out users to the sign-in page.
 *
 * This is deliberately its own component rather than a call at the top of the
 * layout: reading auth is request-time work, so doing it inline would pull the
 * entire `(app)` subtree out of the static shell and block every page on it.
 * Isolated behind <Suspense>, the chrome prerenders and only this gate streams.
 *
 * This is a navigation guard, not the authorization boundary. Every function in
 * `lib/user-words/` independently calls `auth()` itself, because Server Actions
 * and Server Components are reachable without ever rendering this layout.
 */
async function AuthGate() {
  await auth.protect();
  return null;
}

const navLinks = [
  { href: "/search", label: "Search" },
  { href: "/list", label: "My list" },
  { href: "/review", label: "Review" },
];

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>

      <header className="border-b">
        <nav className="mx-auto flex w-full max-w-4xl items-center gap-6 px-4 py-3">
          <Link href="/search" className="font-semibold tracking-tight">
            jp<span className="text-muted-foreground">-</span>dict
          </Link>
          <NavigationMenu className="max-w-none flex-1 justify-start">
            <NavigationMenuList className="justify-start gap-1">
              {navLinks.map((link) => (
                <NavLink key={link.href} href={link.href}>
                  {link.label}
                </NavLink>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
          <ThemeToggle />
          {/*
            UserButton is a Client Component that resolves auth on the client,
            so it stays in the static shell and needs no Suspense boundary.
          */}
          <UserButton />
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
