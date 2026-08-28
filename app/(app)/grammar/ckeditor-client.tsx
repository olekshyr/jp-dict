"use client";

import { CKEditor } from "@ckeditor/ckeditor5-react";
import {
  Autoformat,
  BlockQuote,
  Bold,
  ClassicEditor,
  Code,
  Essentials,
  Heading,
  Italic,
  Link,
  List,
  Paragraph,
  Strikethrough,
  Underline,
} from "ckeditor5";

import "ckeditor5/ckeditor5.css";

/*
 * The editor itself, in its own module so `next/dynamic` can put it — and the
 * stylesheet — in a chunk nothing else pulls. Never import this from a server
 * component, or from anything one reaches: CKEditor touches browser APIs at
 * module load.
 *
 * `licenseKey: "GPL"` is required, not optional. CKEditor 5 has demanded a
 * license key since v44, and that literal string is what self-hosted
 * open-source use takes; the editor refuses to start without it.
 */

/**
 * The toolbar and the sanitizer allowlist in lib/grammar/sanitize.ts are one
 * decision written twice. A button added here whose tag is missing there does
 * not fail — it silently discards the user's formatting on save.
 */
const config = {
  licenseKey: "GPL",
  plugins: [
    Essentials,
    Paragraph,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Code,
    Heading,
    Link,
    List,
    BlockQuote,
    Autoformat,
  ],
  toolbar: [
    "undo",
    "redo",
    "|",
    "heading",
    "|",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "code",
    "|",
    "link",
    "bulletedList",
    "numberedList",
    "blockQuote",
  ],
  heading: {
    // No h1: the page owns that, and a body that can outrank its own title
    // makes the document outline nonsense.
    options: [
      { model: "paragraph" as const, title: "Paragraph", class: "ck-heading_paragraph" },
      { model: "heading2" as const, view: "h2", title: "Heading", class: "ck-heading_heading2" },
      { model: "heading3" as const, view: "h3", title: "Subheading", class: "ck-heading_heading3" },
    ],
  },
};

export default function CkeditorClient({
  initialValue,
  onChange,
}: Readonly<{
  initialValue: string;
  onChange: (html: string) => void;
}>) {
  return (
    <CKEditor
      editor={ClassicEditor}
      config={config}
      // `data` seeds the editor and is never fed back. The editor owns its own
      // content from here — re-supplying it on every keystroke is what makes a
      // rich-text field fight the cursor.
      data={initialValue}
      onChange={(_event, editor) => onChange(editor.getData())}
    />
  );
}
