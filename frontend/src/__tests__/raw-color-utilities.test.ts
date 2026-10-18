import { describe, expect, it } from "vitest";

import { findRawColorUtilities } from "@/lib/raw-color-utilities";

describe("findRawColorUtilities", () => {
  it("finds raw background and text colours", () => {
    expect(findRawColorUtilities("bg-white text-gray-700")).toEqual([
      "bg-white",
      "text-gray-700",
    ]);
  });

  it("finds variants, opacity modifiers, and important modifiers", () => {
    expect(
      findRawColorUtilities(
        "hover:bg-slate-500 dark:text-white bg-black/80 !bg-red-600",
      ),
    ).toEqual([
      "hover:bg-slate-500",
      "dark:text-white",
      "bg-black/80",
      "!bg-red-600",
    ]);
  });

  it("finds border, ring, and gradient utilities", () => {
    expect(
      findRawColorUtilities(
        "border-t-gray-200 ring-offset-white from-blue-500 via-rose-400",
      ),
    ).toEqual([
      "border-t-gray-200",
      "ring-offset-white",
      "from-blue-500",
      "via-rose-400",
    ]);
  });

  it("allows semantic tokens", () => {
    expect(
      findRawColorUtilities(
        "bg-card text-foreground border-border bg-status-success text-status-danger bg-image-canvas bg-overlay/80 text-destructive-foreground",
      ),
    ).toEqual([]);
  });

  it("ignores non-colour utilities", () => {
    expect(
      findRawColorUtilities(
        "text-sm border-2 bg-transparent shadow-lg divide-y",
      ),
    ).toEqual([]);
  });

  it("finds trailing important modifiers", () => {
    expect(findRawColorUtilities("bg-red-600! hover:text-white!")).toEqual([
      "bg-red-600!",
      "hover:text-white!",
    ]);
  });

  it("finds arbitrary colour utilities", () => {
    expect(
      findRawColorUtilities(
        "bg-[#fff] bg-[rgb(0,0,0)] text-[oklch(0.5_0.1_20)] bg-white/[0.5]",
      ),
    ).toEqual([
      "bg-[#fff]",
      "bg-[rgb(0,0,0)]",
      "text-[oklch(0.5_0.1_20)]",
      "bg-white/[0.5]",
    ]);
  });

  it("ignores arbitrary non-colour utilities", () => {
    expect(
      findRawColorUtilities("bg-[url(/img.png)] bg-[var(--surface)]"),
    ).toEqual([]);
  });

  it("ignores invalid palette shades", () => {
    expect(findRawColorUtilities("bg-gray-123")).toEqual([]);
  });

  it("returns no matches for whitespace-only values", () => {
    expect(findRawColorUtilities("   ")).toEqual([]);
  });

  it("ignores arbitrary URL values", () => {
    expect(
      findRawColorUtilities(
        "bg-[url(#grad)] bg-[url(/img.svg#icon)] fill-[url(#grad)]",
      ),
    ).toEqual([]);
  });

  it("finds colours in underscore-separated shadow and gradient values", () => {
    expect(
      findRawColorUtilities(
        "shadow-[0_0_0_1px_#fff] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] bg-[linear-gradient(to_right,_#fff,_#000)]",
      ),
    ).toEqual([
      "shadow-[0_0_0_1px_#fff]",
      "shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)]",
      "bg-[linear-gradient(to_right,_#fff,_#000)]",
    ]);
  });

  it("finds colours outside URLs in arbitrary values", () => {
    expect(
      findRawColorUtilities(
        "bg-[url(/p.png),linear-gradient(#fff,#000)] bg-[url(a),#fff]",
      ),
    ).toEqual([
      "bg-[url(/p.png),linear-gradient(#fff,#000)]",
      "bg-[url(a),#fff]",
    ]);
  });

  it("finds type-hinted arbitrary colour utilities", () => {
    expect(
      findRawColorUtilities(
        "text-[color:#fff] bg-[color:oklch(0.5_0.1_20)] bg-[color:color-mix(in_oklab,red,blue)] bg-[hwb(0_0%_0%)]",
      ),
    ).toEqual([
      "text-[color:#fff]",
      "bg-[color:oklch(0.5_0.1_20)]",
      "bg-[color:color-mix(in_oklab,red,blue)]",
      "bg-[hwb(0_0%_0%)]",
    ]);
  });

  it("ignores bare hash and function-like non-colour values", () => {
    expect(
      findRawColorUtilities(
        "bg-[#] bg-[#fffff] bg-[watercolor(red)] bg-[collab(blue)]",
      ),
    ).toEqual([]);
  });

  it("keeps variant prefixes separate from brackets", () => {
    expect(findRawColorUtilities("hover:bg-[color:#fff]")).toEqual([
      "hover:bg-[color:#fff]",
    ]);
  });

  it("requires shades for chromatic palette colours", () => {
    expect(findRawColorUtilities("bg-red")).toEqual([]);
    expect(findRawColorUtilities("bg-red-500")).toEqual(["bg-red-500"]);
  });

  it("constrains numeric opacity to 0-100", () => {
    expect(findRawColorUtilities("bg-white/000")).toEqual([]);
    expect(findRawColorUtilities("bg-white/999")).toEqual([]);
    expect(findRawColorUtilities("bg-white/100")).toEqual(["bg-white/100"]);
    expect(findRawColorUtilities("bg-white/50")).toEqual(["bg-white/50"]);
  });

  it("returns no matches for empty values", () => {
    expect(findRawColorUtilities("")).toEqual([]);
    expect(findRawColorUtilities("   ")).toEqual([]);
  });
});
