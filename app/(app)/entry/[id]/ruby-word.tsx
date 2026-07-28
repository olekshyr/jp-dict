import type { RubySegment } from "@/lib/db/schema";

/**
 * Renders a word with furigana above its kanji.
 *
 * Segments come pre-aligned from the JmdictFurigana dataset at import time, so
 * there is no morphological analysis at render time — just markup. A segment
 * with no `rt` is kana that needs no reading of its own.
 */
export function RubyWord({
  segments,
  fallback,
  className,
}: {
  segments: RubySegment[] | null;
  fallback: string;
  className?: string;
}) {
  if (!segments || segments.length === 0) {
    return <span className={className}>{fallback}</span>;
  }

  return (
    <ruby className={className}>
      {segments.map((segment, i) => (
        <ruby key={i}>
          {segment.ruby}
          <rt className="text-[0.4em] text-zinc-500">{segment.rt ?? ""}</rt>
        </ruby>
      ))}
    </ruby>
  );
}
