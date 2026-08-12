import type { SearchRequest, SearchType } from "./types";

export function isSearchType(value: unknown): value is SearchType {
  return value === "phone" || value === "fax" || value === "text";
}

export function parseMaxPages(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.min(Math.floor(parsed), 200);
}

export function validateSearchRequest(body: SearchRequest): {
  ok: true;
  data: {
    url: string;
    searchType: SearchType;
    query?: string;
    maxPages?: number;
  };
} | { ok: false; error: string } {
  const { url, searchType, query, maxPages: rawMaxPages } = body;

  if (!url || typeof url !== "string") {
    return { ok: false, error: "Website URL is required" };
  }

  if (!isSearchType(searchType)) {
    return { ok: false, error: "searchType must be phone, fax, or text" };
  }

  if (searchType === "text" && !query?.trim()) {
    return { ok: false, error: "Query text is required for text search" };
  }

  return {
    ok: true,
    data: {
      url: url.trim(),
      searchType,
      query: query?.trim() || undefined,
      maxPages: parseMaxPages(rawMaxPages),
    },
  };
}
