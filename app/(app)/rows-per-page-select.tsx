"use client";

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavPending } from "./nav-pending";

/**
 * Picks how many rows a page shows.
 *
 * A deliberately dumb island: every target URL is built on the server and
 * handed in, so this never reads `useSearchParams` — which would force client
 * rendering up to the nearest Suspense boundary, the same reason <SearchField>
 * keeps its own URL read in <SearchBox>.
 *
 * Navigating inside the shared transition is what dims the stale rows while the
 * new page size loads. The provider is mounted in the (app) layout, so this
 * works the same on the list as on the search page.
 */
export function RowsPerPageSelect({
  value,
  options,
  className,
}: Readonly<{
  value: number;
  options: ReadonlyArray<{ value: number; href: string }>;
  className?: string;
}>) {
  const router = useRouter();
  const { startNavigation } = useNavPending();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Hidden on mobile, where the bar is stacked and space is tight — the
          trigger's aria-label carries the same name for assistive tech. */}
      <span className="hidden text-sm text-muted-foreground sm:inline">
        Rows per page
      </span>
      <Select
        value={value}
        items={options.map((option) => ({
          value: option.value,
          label: String(option.value),
        }))}
        onValueChange={(next) => {
          const target = options.find((option) => option.value === next);
          if (!target) return;
          startNavigation(() => router.push(target.href));
        }}
      >
        <SelectTrigger size="sm" aria-label="Rows per page">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
