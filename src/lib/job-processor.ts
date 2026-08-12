import { PAGES_PER_TICK, type SearchJob } from "./job-types";
import { saveJob, scheduleJobTick } from "./job-store";
import { scanSinglePage } from "./scan-page";

function appendUniqueUrls(existing: string[], incoming: string[], maxPages: number): string[] {
  const seen = new Set(existing);
  const merged = [...existing];

  for (const url of incoming) {
    if (merged.length >= maxPages) break;
    if (seen.has(url)) continue;
    seen.add(url);
    merged.push(url);
  }

  return merged;
}

export async function processJobTick(job: SearchJob, baseUrl: string): Promise<SearchJob> {
  job.status = "running";

  const endIndex = Math.min(job.nextIndex + PAGES_PER_TICK, job.pageUrls.length);
  let index = job.nextIndex;

  while (index < endIndex) {
    const pageUrl = job.pageUrls[index];
    const result = await scanSinglePage(
      pageUrl,
      job.searchType,
      job.query,
      job.sourceMode === "crawl",
    );

    if (result.error) {
      job.errors.push(result.error);
    }

    if (result.matches.length > 0) {
      job.matches.push(...result.matches);
    }

    if (job.sourceMode === "crawl" && result.links?.length) {
      job.pageUrls = appendUniqueUrls(job.pageUrls, result.links, job.maxPages);
    }

    index += 1;
    job.nextIndex = index;
    await saveJob(job);
  }

  if (job.nextIndex >= job.pageUrls.length) {
    job.status = "complete";
    await saveJob(job);
    return job;
  }

  await saveJob(job);
  await scheduleJobTick(job.id, baseUrl);
  return job;
}

export function jobToSearchResponse(job: SearchJob) {
  return {
    startUrl: job.startUrl,
    sourceMode: job.sourceMode,
    sitemapUrl: job.sitemapUrl,
    searchType: job.searchType,
    query: job.query,
    pagesScanned: job.nextIndex,
    matches: job.matches,
    errors: job.errors,
  };
}

export function jobToProgress(job: SearchJob, currentUrl?: string) {
  return {
    pagesScanned: job.nextIndex,
    pagesQueued: Math.max(job.pageUrls.length - job.nextIndex, 0),
    currentUrl: currentUrl ?? job.pageUrls[job.nextIndex] ?? job.startUrl,
    matchesFound: job.matches.length,
    maxPages: job.pageUrls.length,
    status: job.status === "queued" ? ("loading-sitemap" as const) : ("parsed" as const),
    sourceMode: job.sourceMode,
    sitemapUrl: job.sitemapUrl,
    totalPagesInSitemap: job.pageUrls.length,
  };
}
