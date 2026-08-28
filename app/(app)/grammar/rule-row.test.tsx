import {
  act,
  fireEvent,
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { deleteRule } from "@/app/actions/grammar";
import { toast } from "@/components/ui/toast";
import { NavPendingProvider } from "../nav-pending";
import { RuleRow } from "./rule-row";

/** The row's title link carries a <LinkPending>, which needs the provider. */
const renderRow = (props: React.ComponentProps<typeof RuleRow>) =>
  render(
    <NavPendingProvider>
      <RuleRow {...props} />
    </NavPendingProvider>,
  );

const RULE = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  title: "〜てしまう",
  excerpt: "Completion, or regret about it.",
};

describe("RuleRow", () => {
  it("links to the rule and shows its excerpt", () => {
    renderRow(RULE);

    expect(screen.getByText("〜てしまう").closest("a")).toHaveAttribute(
      "href",
      `/grammar/${RULE.id}`,
    );
    expect(screen.getByText(RULE.excerpt)).toBeInTheDocument();
  });

  it("renders no excerpt line for a rule with an empty body", () => {
    renderRow({ ...RULE, excerpt: "" });

    expect(screen.queryByText(RULE.excerpt)).not.toBeInTheDocument();
  });

  /*
   * Both tests below turn on the same subtlety `list-row.test.tsx` documents at
   * length: `setRemoved(true)` starts an exit animation, and `AnimatePresence`
   * keeps the node mounted for its duration. A synchronous assertion right
   * after `act()` therefore cannot tell a still-exiting row from one that was
   * never removed — what discriminates them is whether the exit ever completes.
   * So the assertion is `waitForElementToBeRemoved` resolving or timing out,
   * not a `queryByText` on the same tick.
   */
  it("removes the row before the delete settles", async () => {
    // Never resolves, so the row leaves while the write is still in flight —
    // which is the only thing that distinguishes an optimistic update from one
    // that merely happens afterwards.
    vi.mocked(deleteRule).mockReturnValueOnce(new Promise(() => {}));
    renderRow(RULE);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete 〜てしまう" }));
    });

    expect(deleteRule).toHaveBeenCalledExactlyOnceWith(RULE.id);
    await waitForElementToBeRemoved(() => screen.queryByText("〜てしまう"));
  });

  it("puts the row back and warns when the delete fails", async () => {
    vi.mocked(deleteRule).mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const add = vi.spyOn(toast, "add");
    renderRow(RULE);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete 〜てしまう" }));
    });

    // The load-bearing assertion: a correct rollback flips `removed` back
    // before the 150ms exit completes, so the row is never actually removed and
    // this must time out. Without the rollback it resolves in ~150ms.
    await expect(
      waitForElementToBeRemoved(() => screen.queryByText("〜てしまう"), {
        timeout: 400,
      }),
    ).rejects.toThrow();

    expect(screen.getByText("〜てしまう")).toBeInTheDocument();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });
});
