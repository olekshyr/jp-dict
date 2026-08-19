"use client";

import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { paginationHref } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useNavPending } from "./nav-pending";

export function SearchField({
  defaultValue = "",
  perPage,
  autoFocus = false,
  disabled = false,
}: Readonly<{
  defaultValue?: string;
  perPage?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}>) {
  const router = useRouter();
  const { pending, startNavigation } = useNavPending();

  return (
    <form
      className="mb-8"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        const next = String(
          new FormData(event.currentTarget).get("q") ?? "",
        ).trim();
        startNavigation(() => {
          router.push(paginationHref("/search", { q: next, perPage }));
        });
      }}
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            className="h-11 rounded-lg px-4 pr-11 text-base md:text-base"
            name="q"
            defaultValue={defaultValue}
            placeholder="Search 猫, ねこ, neko or cat…"
            aria-label="Search the dictionary"
            autoComplete="off"
            autoFocus={autoFocus}
            disabled={disabled}
          />
          <Spinner
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground transition-opacity duration-200",
              pending ? "opacity-100 delay-150" : "animate-none opacity-0",
            )}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-11 rounded-lg px-5 text-base"
          disabled={disabled}
        >
          <SearchIcon />
          Search
        </Button>
      </div>
    </form>
  );
}
