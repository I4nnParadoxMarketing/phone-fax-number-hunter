import { planScanUrls } from "@/lib/plan-urls";
import { validateSearchRequest } from "@/lib/search-validation";
import type { SearchRequest } from "@/lib/types";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: SearchRequest;

  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateSearchRequest(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { url, sourceMode, maxPages } = validation.data;

  try {
    const plan = await planScanUrls(url, sourceMode, maxPages ?? 100);
    return NextResponse.json(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build scan plan";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
