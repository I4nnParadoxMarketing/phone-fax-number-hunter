import { NextResponse } from "next/server";
import { crawlSite } from "@/lib/crawler";
import type { SearchRequest, SearchResponse, SearchType } from "@/lib/types";

export const maxDuration = 60;

function isSearchType(value: unknown): value is SearchType {
  return value === "phone" || value === "fax" || value === "text";
}

function parseMaxPages(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.min(Math.floor(parsed), 200);
}

export async function POST(request: Request) {
  let body: SearchRequest;

  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, searchType, query, maxPages: rawMaxPages } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Website URL is required" }, { status: 400 });
  }

  if (!isSearchType(searchType)) {
    return NextResponse.json(
      { error: "searchType must be phone, fax, or text" },
      { status: 400 },
    );
  }

  if (searchType === "text" && !query?.trim()) {
    return NextResponse.json(
      { error: "Query text is required for text search" },
      { status: 400 },
    );
  }

  const maxPages = parseMaxPages(rawMaxPages);

  try {
    const { matches, pagesScanned, errors } = await crawlSite(
      url.trim(),
      searchType,
      query?.trim() || undefined,
      { maxPages },
    );

    const response: SearchResponse = {
      startUrl: url.trim(),
      searchType,
      query: query?.trim() || undefined,
      pagesScanned,
      matches,
      errors,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
