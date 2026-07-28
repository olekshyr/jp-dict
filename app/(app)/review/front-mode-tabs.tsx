"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FrontMode } from "@/lib/user-words/queries";

const MODES: Array<{ value: FrontMode; label: string }> = [
  { value: "kanji", label: "Kanji" },
  { value: "furigana", label: "Furigana" },
  { value: "romaji", label: "Romaji" },
  { value: "english", label: "English" },
];

/**
 * Picks what shows on the front of a card.
 *
 * There is no <TabsContent> on purpose — the card below is a single surface
 * that re-renders, not four swapped panels, so the tabs act purely as the
 * selector for it.
 */
export function FrontModeTabs({
  mode,
  onModeChange,
}: {
  mode: FrontMode;
  onModeChange: (mode: FrontMode) => void;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="text-sm text-muted-foreground">Front</span>
      <Tabs
        value={mode}
        onValueChange={(value) => onModeChange(value as FrontMode)}
      >
        <TabsList>
          {MODES.map((m) => (
            <TabsTrigger key={m.value} value={m.value}>
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
