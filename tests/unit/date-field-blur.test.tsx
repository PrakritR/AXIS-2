// @vitest-environment jsdom
//
// A committed date must never silently survive being edited down to an
// unparseable partial: "07/31/2026" edited to "07/3" and blurred has to clear
// the committed value so the step's required-field check genuinely fires on
// Continue, instead of the form quietly submitting the old date.
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DateField } from "@/components/ui/date-field";

afterEach(cleanup);

function ControlledDateField({ initial, onCommit }: { initial: string; onCommit: (iso: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      aria-label="Date"
      value={value}
      onChange={(iso) => {
        setValue(iso);
        onCommit(iso);
      }}
    />
  );
}

describe("DateField blur with an unparseable partial", () => {
  it("clears the committed value instead of retaining the old date", () => {
    const onCommit = vi.fn();
    render(<ControlledDateField initial="2026-07-31" onCommit={onCommit} />);
    const input = screen.getByLabelText("Date") as HTMLInputElement;
    expect(input.value).toBe("07/31/2026");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "07/3" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenLastCalledWith("");
  });

  it("still commits a fully re-typed date on blur", () => {
    const onCommit = vi.fn();
    render(<ControlledDateField initial="2026-07-31" onCommit={onCommit} />);
    const input = screen.getByLabelText("Date") as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "3/15/2027" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenLastCalledWith("2027-03-15");
    expect(input.value).toBe("03/15/2027");
  });

  it("clearing the text clears the committed value", () => {
    const onCommit = vi.fn();
    render(<ControlledDateField initial="2026-07-31" onCommit={onCommit} />);
    const input = screen.getByLabelText("Date") as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenLastCalledWith("");
    expect(input.value).toBe("");
  });
});
