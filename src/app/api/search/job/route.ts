import { getBaseUrl, isBackgroundStorageConfigured, saveJob, scheduleJobTick } from "@/lib/job-store";
import type { SearchJob } from "@/lib/job-types";
import { jobToProgress } from "@/lib/job-processor";
import { planScanUrls } from "@/lib/plan-urls";
import { validateSearchRequest } from "@/lib/search-validation";
import type { SearchRequest } from "@/lib/types";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isBackgroundStorageConfigured()) {
    return NextResponse.json(
      {
        error:
          "Background search requires Vercel Blob storage. In Vercel, open Storage → Blob → Connect, then redeploy.",
      },
      { status: 503 },
    );
  }

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

  const { url, sourceMode, searchType, query, maxPages } = validation.data;

  try {
    const plan = await planScanUrls(url, sourceMode, maxPages ?? 100);
    const now = new Date().toISOString();

    const job: SearchJob = {
      id: crypto.randomUUID(),
      status: "queued",
      startUrl: plan.startUrl,
      sourceMode: plan.sourceMode,
      sitemapUrl: plan.sitemapUrl,
      searchType,
      query,
      maxPages: maxPages ?? 100,
      pageUrls: plan.pageUrls,
      nextIndex: 0,
      matches: [],
      errors: [],
      createdAt: now,
      updatedAt: now,
    };

    await saveJob(job);

    const baseUrl = getBaseUrl(request);
    void scheduleJobTick(job.id, baseUrl).catch(async (error) => {
      job.status = "failed";
      job.errorMessage = error instanceof Error ? error.message : "Could not start background job";
      await saveJob(job);
    });

    return NextResponse.json({
      jobId: job.id,
      job,
      progress: jobToProgress(job),
      result: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start search job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
