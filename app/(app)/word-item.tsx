import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
} from "@/components/ui/item";

/**
 * One dictionary entry as a list row.
 *
 * Search results and the saved-word list render the same headword / reading /
 * gloss block and differ only in which buttons hang off the end, so those come
 * in as `children`. The link stays *inside* the row rather than wrapping it —
 * `Item` can render as an anchor, but that would nest the action buttons in an
 * <a>.
 */
export function WordItem({
  entryId,
  headword,
  reading,
  romaji,
  glossSummary,
  isCommon = false,
  children,
}: {
  entryId: number;
  headword: string;
  reading: string;
  romaji: string;
  glossSummary: string;
  isCommon?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Item
      role="listitem"
      variant="outline"
      className="items-start transition-colors hover:border-ring"
    >
      <ItemContent>
        <Link href={`/entry/${entryId}`} className="flex min-w-0 flex-col gap-1">
          {/*
            Deliberately not <ItemTitle>: its `line-clamp-1` sets
            `display: -webkit-box`, which cancels the flex row this needs to lay
            the headword, reading, romaji and badge out on a shared baseline.
          */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl">{headword}</span>
            {reading !== headword && (
              <span className="text-muted-foreground">{reading}</span>
            )}
            <span className="font-mono text-xs text-muted-foreground">
              {romaji}
            </span>
            {isCommon && (
              <Badge variant="outline" className="text-muted-foreground">
                common
              </Badge>
            )}
          </div>
          <ItemDescription>{glossSummary}</ItemDescription>
        </Link>
      </ItemContent>
      <ItemActions className="flex-col items-end gap-1.5">
        {children}
      </ItemActions>
    </Item>
  );
}
