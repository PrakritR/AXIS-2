// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AssistantMarkdown } from "@/components/portal/assistant-markdown";

describe("AssistantMarkdown (assistant chat replies render markdown, not literal syntax)", () => {
  afterEach(cleanup);

  it("renders bold and GFM tables as real elements with no literal markers", () => {
    const { container } = render(
      <AssistantMarkdown
        text={
          "Two tenants are overdue — **$15,450** total.\n\n" +
          "| Tenant | Property | Overdue |\n|---|---|---|\n" +
          "| Dana Whitfield | Emerald Court · 3 | $9,600 |\n| Omar Haddad | Cascade Lofts · 4B | $5,850 |"
        }
      />,
    );
    expect(screen.getByText("$15,450").tagName).toBe("STRONG");
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByText("Dana Whitfield").closest("td")).not.toBeNull();
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("|");
  });

  it("renders lists and links (links open in a new tab)", () => {
    const { container } = render(
      <AssistantMarkdown text={"- first\n- second\n\nSee [pricing](/pricing)."} />,
    );
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    const link = screen.getByRole("link", { name: "pricing" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("never renders raw HTML from model output (injection-safe)", () => {
    const { container } = render(
      <AssistantMarkdown text={'Hi <img src=x onerror="alert(1)"> <script>alert(1)</script>'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("downgrades headers to compact bold lines", () => {
    const { container } = render(<AssistantMarkdown text={"# Big header\nbody"} />);
    expect(container.querySelector("h1")).toBeNull();
    expect(screen.getByText("Big header").tagName).toBe("P");
  });
});
