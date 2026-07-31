import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  NavigationMenu,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { setPathname } from "@/test/next-navigation";
import { NavLink } from "./nav-link";

// NavigationMenuLink reads Base UI's root context, so the menu chrome has to be
// there — the same wrapper the layout puts around these.
const renderAt = (pathname: string) => {
  setPathname(pathname);
  return render(
    <NavigationMenu>
      <NavigationMenuList>
        <NavLink href="/review">Review</NavLink>
      </NavigationMenuList>
    </NavigationMenu>,
  );
};

describe("NavLink", () => {
  it("lights up on an exact match", () => {
    renderAt("/review");

    expect(screen.getByText("Review")).toHaveAttribute("aria-current", "page");
  });

  it("stays lit on a sub-path", () => {
    // A future /review/settings should still read as "Review".
    renderAt("/review/settings");

    expect(screen.getByText("Review")).toHaveAttribute("aria-current", "page");
  });

  it("does not light up for a route that merely starts with the same letters", () => {
    // The `${href}/` suffix in the check exists precisely for this.
    renderAt("/reviewers");

    expect(screen.getByText("Review")).not.toHaveAttribute("aria-current");
  });

  it("stays dark on an unrelated route", () => {
    renderAt("/search");

    expect(screen.getByText("Review")).not.toHaveAttribute("aria-current");
  });

  it("links to its href", () => {
    renderAt("/search");

    expect(screen.getByText("Review")).toHaveAttribute("href", "/review");
  });
});
