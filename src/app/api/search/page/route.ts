import { scanSinglePage } from "@/lib/scan-page";
import { isSearchType } from "@/lib/search-validation";
import { NextResponse } from "next/server";

export const maxDuration = 30;

interface ScanPageRequest {
  pageUrl: string;
  searchType: unknown;
  query?: string;
  collectLinks?: boolean;
}

export async function POST(request: Request) {
  let body: ScanPageRequest;

  try {
    body = (await request.json()) as ScanPageRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { pageUrl, searchType, query, collectLinks } = body;

  if (!pageUrl || typeof pageUrl !== "string") {
    return NextResponse.json({ error: "pageUrl is required" }, { status: 400 });
  }

  if (!isSearchType(searchType)) {
    return NextResponse.json({ error: "searchType must be phone, fax, or text" }, { status: 400 });
  }

  if (searchType === "text" && !query?.trim()) {
    return NextResponse.json({ error: "Query text is required for text search" }, { status: 400 });
  }

  const result = await scanSinglePage(
    pageUrl.trim(),
    searchType,
    query?.trim() || undefined,
    collectLinks === true,
  );

  return NextResponse.json(result);
}
