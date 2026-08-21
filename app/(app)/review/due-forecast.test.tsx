import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { HourBucket } from "@/lib/srs/forecast";
import { DueForecast } from "./due-forecast";

/** An hour bucket `offsetHours` from now, as the query would return it. */
function bucket(offsetHours: number, count: number): HourBucket {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + offsetHours);
  return { hour: d.toISOString(), count };
}

/** The three cells of the row headed `label`. */
function row(label: string) {
  const heading = screen.getByRole("rowheader", { name: label });
  return within(heading.closest("tr")!);
}

describe("DueForecast", () => {
  it("shows a row for each of the next seven days", () => {
    render(<DueForecast buckets={[]} />);

    expect(screen.getAllByRole("row")).toHaveLength(7);
    expect(screen.getByRole("rowheader", { name: "Today" })).toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", { name: "Tomorrow" }),
    ).toBeInTheDocument();
  });

  it("counts today's work, overdue words included", () => {
    render(<DueForecast buckets={[bucket(0, 137)]} />);

    expect(row("Today").getByText("137")).toBeInTheDocument();
    expect(screen.getByText("137 words this week")).toBeInTheDocument();
  });

  it("sums buckets that share a day", () => {
    render(<DueForecast buckets={[bucket(0, 3), bucket(1, 4)]} />);

    expect(row("Today").getByText("7")).toBeInTheDocument();
  });

  it("marks a day with nothing due rather than showing a zero", () => {
    render(<DueForecast buckets={[bucket(0, 2)]} />);

    expect(row("Tomorrow").getByText("—")).toBeInTheDocument();
  });

  it("says so when the week is empty", () => {
    render(<DueForecast buckets={[]} />);

    expect(screen.getByText("Nothing due this week")).toBeInTheDocument();
  });

  it("uses the singular for one word", () => {
    render(<DueForecast buckets={[bucket(0, 1)]} />);

    expect(screen.getByText("1 word this week")).toBeInTheDocument();
  });

  it("renders no days at all on the server", () => {
    const html = renderToString(<DueForecast buckets={[bucket(0, 42)]} />);

    expect(html).not.toContain("Today");
    expect(html).not.toContain("42");
  });
});
