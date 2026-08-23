"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FRONT_MODE_LABELS,
  FRONT_MODES,
  type FrontMode,
} from "@/lib/user-words/front-mode";

const MODES = FRONT_MODES.map((value) => ({
  value,
  label: FRONT_MODE_LABELS[value],
}));

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
