import { afterEach, describe, expect, it } from "vitest";
import { focusRouteContent } from "@/lib/route-focus";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("focusRouteContent", () => {
  it("focuses the first h1/h2 inside main", async () => {
    document.body.innerHTML = `
      <main>
        <h1>Inbox</h1>
        <h2>Other</h2>
      </main>
    `;
    const heading = document.querySelector("h1") as HTMLElement;

    await focusRouteContent();

    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(heading.classList.contains("route-focus")).toBe(true);
  });

  it("falls back to main when no heading exists", async () => {
    document.body.innerHTML = "<main><p>No heading</p></main>";
    const main = document.querySelector("main") as HTMLElement;

    await focusRouteContent();

    expect(document.activeElement).toBe(main);
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(main.classList.contains("route-focus")).toBe(true);
  });

  it("does nothing when skip is true", async () => {
    document.body.innerHTML = "<main><h1>Inbox</h1></main>";
    const heading = document.querySelector("h1") as HTMLElement;

    await focusRouteContent(true);

    expect(document.activeElement).not.toBe(heading);
    expect(heading.hasAttribute("tabindex")).toBe(false);
  });
});
