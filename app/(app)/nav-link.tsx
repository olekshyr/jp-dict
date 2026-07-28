"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";

/**
 * One header nav entry, highlighted while its route is the current one.
 *
 * The current URL is only readable on the client, so this is the one island in
 * an otherwise server-rendered header. It is cheap: the markup ships in the
 * initial HTML and re-renders from `usePathname` on client-side transitions,
 * without refetching the layout.
 *
 * `active` is Base UI's own prop — besides the styling hook it sets
 * `aria-current="page"`, which is what actually tells a screen reader where it
 * is. It surfaces as a valueless `data-active`, hence the bare `data-active:`
 * variants below.
 */
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Sub-paths keep their section lit, so a future /review/settings still reads
  // as "Review" rather than dropping the highlight entirely.
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <NavigationMenuItem>
      <NavigationMenuLink
        active={isActive}
        className="px-2.5 py-1.5 text-muted-foreground hover:text-foreground data-active:bg-muted data-active:font-medium data-active:text-foreground"
        render={<Link href={href} />}
      >
        {children}
      </NavigationMenuLink>
    </NavigationMenuItem>
  );
}
