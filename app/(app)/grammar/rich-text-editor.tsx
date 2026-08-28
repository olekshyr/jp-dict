"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/*
 * The seam. `{ initialValue, onChange }` is the whole contract `RuleForm` knows
 * about, so replacing CKEditor with another editor touches this file and
 * ./ckeditor-client.tsx and nothing else.
 *
 * `ssr: false` is not a preference — CKEditor reads browser globals at module
 * load — and `next/dynamic` can only be called with it from a client component,
 * which is why this wrapper exists at all rather than the form importing the
 * editor directly.
 */
const Editor = dynamic(() => import("./ckeditor-client"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-md" />,
});

/**
 * Uncontrolled by design: `initialValue` seeds the editor and nothing re-seeds
 * it, the same arrangement `SaveButton` and `Flashcards` use. `onChange`
 * reports the current HTML upward on every edit.
 */
export function RichTextEditor({
  initialValue,
  onChange,
}: Readonly<{
  initialValue: string;
  onChange: (html: string) => void;
}>) {
  return (
    <div className="rule-editor">
      <Editor initialValue={initialValue} onChange={onChange} />
    </div>
  );
}
