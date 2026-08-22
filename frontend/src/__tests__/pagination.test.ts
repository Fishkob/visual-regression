import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  fetchAllPages,
} from "@/lib/pagination";

describe("fetchAllPages", () => {
  it("stops after a single page when total matches", async () => {
    const fetchPage = vi.fn(async (skip: number) => ({
      items: Array.from({ length: 100 }, (_, i) => skip + i),
      total: 100,
    }));

    const all = await fetchAllPages(fetchPage);

    expect(all).toHaveLength(100);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(DEFAULT_PAGE);
  });

  it("pages past the first page until the authoritative total is reached", async () => {
    const fetchPage = vi.fn(async (skip: number) => {
      const page = skip / DEFAULT_PAGE_SIZE;
      const size = page < 2 ? 100 : 50;
      return {
        items: Array.from({ length: size }, (_, i) => skip + i),
        total: 250,
      };
    });

    const all = await fetchAllPages(fetchPage);

    expect(all).toHaveLength(250);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 200);
  });

  it("stops at the page size when total is missing", async () => {
    const fetchPage = vi.fn(async () => ({
      items: Array.from({ length: 100 }, (_, i) => i),
    }));

    const all = await fetchAllPages(fetchPage);

    expect(all).toHaveLength(100);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops early when a page is truncated below the advertised total", async () => {
    const fetchPage = vi.fn(async (skip: number) => ({
      items: skip === 0 ? Array.from({ length: 100 }, (_, i) => i) : [],
      total: 250,
    }));

    const all = await fetchAllPages(fetchPage);

    expect(all).toHaveLength(100);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("returns an empty list when the first page is empty", async () => {
    const fetchPage = vi.fn(async () => ({ items: [], total: 0 }));

    const all = await fetchAllPages(fetchPage);

    expect(all).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
