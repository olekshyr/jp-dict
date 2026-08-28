import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRule, updateRule } from "@/app/actions/grammar";
import { toast } from "@/components/ui/toast";
import { router } from "@/test/next-navigation";
import { NavPendingProvider } from "../nav-pending";
import { RuleForm } from "./rule-form";

/*
 * The real editor is browser-only and would drag the whole CKEditor bundle into
 * every run of this file. What is under test is the form around it — that the
 * latest HTML reaches the action — so a textarea standing in for the seam is
 * enough, and it pins the `{ initialValue, onChange }` contract besides.
 */
vi.mock("./rich-text-editor", () => ({
  RichTextEditor: ({
    initialValue,
    onChange,
  }: {
    initialValue: string;
    onChange: (html: string) => void;
  }) => (
    <textarea
      aria-label="Body"
      defaultValue={initialValue}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const RULE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const renderForm = (props: React.ComponentProps<typeof RuleForm> = {}) =>
  render(
    <NavPendingProvider>
      <RuleForm {...props} />
    </NavPendingProvider>,
  );

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submit = async () =>
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });

describe("RuleForm", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("creates a rule and navigates to it", async () => {
    renderForm();

    type("Title", "〜てしまう");
    type("Body", "<p>Completion</p>");
    await submit();

    expect(createRule).toHaveBeenCalledExactlyOnceWith(
      "〜てしまう",
      "<p>Completion</p>",
    );
    expect(router.push).toHaveBeenCalledWith(`/grammar/${RULE_ID}`);
  });

  it("trims the title before sending it", async () => {
    renderForm();

    type("Title", "  〜てしまう  ");
    await submit();

    expect(createRule).toHaveBeenCalledExactlyOnceWith("〜てしまう", "");
  });

  it("refuses to submit without a title", async () => {
    renderForm();

    type("Body", "<p>orphan</p>");
    await submit();

    expect(createRule).not.toHaveBeenCalled();
    expect(screen.getByText("Give the rule a title.")).toBeInTheDocument();
  });

  it("blames the length, not the connection, for an over-cap body", async () => {
    renderForm();

    type("Title", "〜てしまう");
    type("Body", "x".repeat(20_001));
    await submit();

    // The action would reject this too, but a ZodError arrives in the browser
    // indistinguishable from a network failure — so "check your connection"
    // would be both wrong and unactionable.
    expect(createRule).not.toHaveBeenCalled();
    expect(
      screen.getByText("This rule is too long. Shorten it and try again."),
    ).toBeInTheDocument();
  });

  it("accepts a body right at the cap", async () => {
    renderForm();

    type("Title", "〜てしまう");
    type("Body", "x".repeat(20_000));
    await submit();

    expect(createRule).toHaveBeenCalledOnce();
  });

  it("updates an existing rule instead of creating one", async () => {
    const onSaved = vi.fn();
    renderForm({
      rule: { id: RULE_ID, title: "old", body: "<p>old</p>" },
      onSaved,
    });

    type("Body", "<p>new</p>");
    await submit();

    expect(updateRule).toHaveBeenCalledExactlyOnceWith(
      RULE_ID,
      "old",
      "<p>new</p>",
    );
    expect(createRule).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    // The action's sanitized body, not the "<p>new</p>" the editor produced.
    expect(onSaved).toHaveBeenCalledExactlyOnceWith("old", "<p>saved</p>");
  });

  it("seeds the fields from an existing rule", () => {
    renderForm({ rule: { id: RULE_ID, title: "〜ながら", body: "<p>while</p>" } });

    expect(screen.getByLabelText("Title")).toHaveValue("〜ながら");
    expect(screen.getByLabelText("Body")).toHaveValue("<p>while</p>");
  });

  it("keeps the form and warns when the write fails", async () => {
    vi.mocked(createRule).mockRejectedValueOnce(new Error("offline"));
    const add = vi.spyOn(toast, "add");
    renderForm();

    type("Title", "〜てしまう");
    await submit();

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("〜てしまう");
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("says so when the rule was deleted from under the edit", async () => {
    vi.mocked(updateRule).mockResolvedValueOnce(null);
    const add = vi.spyOn(toast, "add");
    const onSaved = vi.fn();
    renderForm({
      rule: { id: RULE_ID, title: "old", body: "" },
      onSaved,
    });

    await submit();

    expect(onSaved).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });
});
