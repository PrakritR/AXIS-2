// @vitest-environment jsdom
import { describe, expect, it, vi, beforeAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { DestinationNav } from "@/components/ui/destination-nav";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { PortalTabs } from "@/components/ui/portal-tabs";

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

describe("DestinationNav", () => {
  it("marks active item by id", () => {
    render(
      <DestinationNav
        items={[
          { id: "pending", label: "Pending", href: "/portal/payments/incoming/pending", count: 5 },
          { id: "paid", label: "Paid", href: "/portal/payments/incoming/paid" },
        ]}
        activeId="pending"
      />,
    );
    expect(screen.getByRole("link", { name: /Pending/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Paid/ }).getAttribute("aria-current")).toBeNull();
  });
});

describe("PageHeader", () => {
  it("renders title and count", () => {
    render(<PageHeader title="Payments" count={12} />);
    expect(screen.getByRole("heading", { name: /Payments/ })).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("shows title on mobile by default", () => {
    const { container } = render(<PageHeader title="Residents" />);
    const header = container.querySelector("[data-slot=page-header]");
    expect(header?.className).not.toContain("sr-only");
  });
});

describe("FilterBar", () => {
  it("renders pills and removable chips", () => {
    const onRemove = vi.fn();
    render(
      <FilterBar
        pills={[
          { id: "all", label: "All", active: true, onClick: () => {} },
          { id: "pending", label: "Pending", onClick: () => {} },
        ]}
        chips={[{ id: "house", label: "House A", onRemove }]}
      />,
    );
    expect(screen.getByRole("button", { name: "All" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /House A/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /House A/ }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

describe("BulkActionBar", () => {
  it("renders nothing when count is zero", () => {
    const { container } = render(<BulkActionBar count={0}>Actions</BulkActionBar>);
    expect(container.firstChild).toBeNull();
  });

  it("shows selection count when active", () => {
    render(
      <BulkActionBar count={3}>
        <button type="button">Delete</button>
      </BulkActionBar>,
    );
    expect(screen.getByText("3 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });
});

describe("PortalTabs", () => {
  it("switches tabs on click", () => {
    const onChange = vi.fn();
    render(
      <PortalTabs
        items={[
          { id: "pending", label: "Pending" },
          { id: "paid", label: "Paid" },
        ]}
        activeId="pending"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getAllByRole("tab", { name: "Paid" })[0]!);
    expect(onChange).toHaveBeenCalledWith("paid");
  });
});

describe("DataList", () => {
  it("renders mobile rows and empty state", () => {
    const { container, rerender } = render(
      <DataList
        rows={[
          {
            id: "1",
            data: { name: "Alice" },
            primary: "Alice",
            meta: "Unit 2A",
            trailing: "$500",
          },
        ]}
        columns={[
          { id: "name", header: "Name", cell: (r) => r.name },
        ]}
      />,
    );
    const mobileRow = container.querySelector("[data-slot=data-list-mobile-row]");
    expect(mobileRow?.textContent).toContain("Alice");
    expect(mobileRow?.textContent).toContain("Unit 2A");

    rerender(
      <DataList
        rows={[]}
        columns={[{ id: "name", header: "Name", cell: () => "" }]}
        emptyState={<EmptyState title="No records" />}
      />,
    );
    expect(screen.getByText("No records")).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("renders title and primary action", () => {
    const onAction = vi.fn();
    render(
      <EmptyState title="Nothing here" actionLabel="Add one" onAction={onAction} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
