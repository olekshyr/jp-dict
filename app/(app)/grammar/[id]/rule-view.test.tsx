import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteRule, updateRule } from "@/app/actions/grammar";
import { toast } from "@/components/ui/toast";
import { router } from "@/test/next-navigation";
import { NavPendingProvider } from "../../nav-pending";
import { RuleView } from "./rule-view";

// Same stand-in as rule-form.test.tsx, and for the same reason: CKEditor is
// browser-only and what is under test here is the view around it.
vi.mock("../rich-text-editor", () => ({
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

const RULE = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  title: "〜てしまう",
  body: "<p>Completion, or regret about it.</p>",
};

const renderView = () =>
  render(
    <NavPendingProvider>
      <RuleView {...RULE} />
    </NavPendingProvider>,
  );

describe("RuleView", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders the title and the stored body", () => {
    renderView();

    expect(
      screen.getByRole("heading", { name: "〜てしまう" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Completion, or regret about it."),
    ).toBeInTheDocument();
  });

  it("swaps in the editor on Edit and back out on Cancel", async () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Body")).toHaveValue(RULE.body);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("heading", { name: "〜てしまう" }),
    ).toBeInTheDocument();
  });

  it("adopts the sanitized body the action returned, not the editor's", async () => {
    vi.mocked(updateRule).mockResolvedValueOnce({ body: "<p>clean</p>" });
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Body"), {
      // What the editor hands over; the sanitizer would strip the script.
      target: { value: "<p>clean</p><script>alert(1)</script>" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(screen.getByText("clean")).toBeInTheDocument();
    expect(screen.queryByText(/alert/)).not.toBeInTheDocument();
  });

  it("keeps an edited title after the save, without a re-render from the server", async () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "〜ちゃう" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    // The `title` prop still says 〜てしまう. Re-reading it here is the bug this
    // guards: the action does not refresh the route.
    expect(screen.getByRole("heading", { name: "〜ちゃう" })).toBeInTheDocument();
  });

  it("deletes the rule and returns to the list", async () => {
    renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(deleteRule).toHaveBeenCalledExactlyOnceWith(RULE.id);
    expect(router.push).toHaveBeenCalledWith("/grammar");
  });

  it("locks Edit while a delete is in flight", async () => {
    // Never resolves, so the assertion lands mid-flight. Without this, the user
    // can open the editor and the delete's navigation then discards their work.
    vi.mocked(deleteRule).mockReturnValueOnce(new Promise(() => {}));
    renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  });

  it("stays put and warns when the delete fails", async () => {
    vi.mocked(deleteRule).mockRejectedValueOnce(new Error("offline"));
    const add = vi.spyOn(toast, "add");
    renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(router.push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "〜てしまう" }),
    ).toBeInTheDocument();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });
});
