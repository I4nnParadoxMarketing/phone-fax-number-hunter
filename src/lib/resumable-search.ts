import { readResponseError } from "@/lib/read-response-error";
import type { ScanPlan } from "@/lib/plan-urls";
import {
  createSearchSession,
  saveSearchSession,
  type SearchSession,
} from "@/lib/search-session";
import type { CrawlProgress, SearchMatch, SourceMode, SearchType } from "@/lib/types";

const RETRY_LIMIT = 5;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("networkerror") ||
    message.includes("aborted")
  );
}

async function fetchPlan(payload: {
  url: string;
  sourceMode: SourceMode;
  searchType: SearchType;
  query?: string;
  maxPages: number;
}): Promise<ScanPlan> {
  const response = await fetch("/api/search/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  return response.json() as Promise<ScanPlan>;
}

async function scanPageRequest(
  pageUrl: string,
  searchType: SearchType,
  query: string | undefined,
  collectLinks: boolean,
): Promise<{ matches: SearchMatch[]; error?: string; links?: string[] }> {
  const response = await fetch("/api/search/page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageUrl,
      searchType,
      query,
      collectLinks,
    }),
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  return response.json() as Promise<{ matches: SearchMatch[]; error?: string; links?: string[] }>;
}

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

function buildProgress(session: SearchSession, currentUrl: string, status: CrawlProgress["status"]): CrawlProgress {
  return {
    pagesScanned: session.nextIndex,
    pagesQueued: Math.max(session.pageUrls.length - session.nextIndex, 0),
    currentUrl,
    matchesFound: session.matches.length,
    maxPages: session.pageUrls.length,
    status,
    sourceMode: session.sourceMode,
    sitemapUrl: session.sitemapUrl,
    totalPagesInSitemap: session.pageUrls.length,
  };
}

export async function runResumableSearch(
  session: SearchSession,
  onSessionUpdate: (session: SearchSession) => void,
  onProgress: (progress: CrawlProgress) => void,
  shouldContinue: () => boolean,
): Promise<SearchSession> {
  let workingSession: SearchSession = {
    ...session,
    status: "running",
    pauseReason: undefined,
    updatedAt: new Date().toISOString(),
  };

  saveSearchSession(workingSession);
  onSessionUpdate(workingSession);

  while (workingSession.nextIndex < workingSession.pageUrls.length) {
    if (!shouldContinue()) {
      workingSession = {
        ...workingSession,
        status: "paused",
        pauseReason: "Search paused while this tab is in the background.",
        updatedAt: new Date().toISOString(),
      };
      saveSearchSession(workingSession);
      onSessionUpdate(workingSession);
      return workingSession;
    }

    const pageUrl = workingSession.pageUrls[workingSession.nextIndex];
    onProgress(buildProgress(workingSession, pageUrl, "fetching"));

    let pageResult: { matches: SearchMatch[]; error?: string; links?: string[] } | null = null;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt += 1) {
      try {
        pageResult = await scanPageRequest(
          pageUrl,
          workingSession.searchType,
          workingSession.query,
          workingSession.sourceMode === "crawl",
        );
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Search failed");
        if (!isNetworkError(error) || attempt === RETRY_LIMIT) break;
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }

    if (!pageResult) {
      workingSession = {
        ...workingSession,
        status: "paused",
        pauseReason:
          lastError && isNetworkError(lastError)
            ? "Network connection lost. Reopen this page and click Resume to continue where you left off."
            : lastError?.message ?? "Search paused due to an error.",
        updatedAt: new Date().toISOString(),
      };
      saveSearchSession(workingSession);
      onSessionUpdate(workingSession);
      throw lastError ?? new Error("Search paused");
    }

    if (pageResult.error) {
      workingSession.errors.push(pageResult.error);
    }

    if (pageResult.matches.length > 0) {
      workingSession.matches.push(...pageResult.matches);
    }

    if (workingSession.sourceMode === "crawl" && pageResult.links?.length) {
      workingSession.pageUrls = appendUniqueUrls(
        workingSession.pageUrls,
        pageResult.links,
        workingSession.maxPages,
      );
    }

    workingSession.nextIndex += 1;
    workingSession.updatedAt = new Date().toISOString();
    saveSearchSession(workingSession);
    onSessionUpdate(workingSession);
    onProgress(buildProgress(workingSession, pageUrl, "parsed"));

    await sleep(150);
  }

  workingSession = {
    ...workingSession,
    status: "complete",
    pauseReason: undefined,
    updatedAt: new Date().toISOString(),
  };
  saveSearchSession(workingSession);
  onSessionUpdate(workingSession);

  return workingSession;
}

export async function startResumableSearch(payload: {
  url: string;
  sourceMode: SourceMode;
  searchType: SearchType;
  query?: string;
  maxPages: number;
}): Promise<SearchSession> {
  const plan = await fetchPlan(payload);

  return createSearchSession({
    startUrl: plan.startUrl,
    sourceMode: plan.sourceMode,
    sitemapUrl: plan.sitemapUrl,
    searchType: payload.searchType,
    query: payload.query,
    maxPages: payload.maxPages,
    pageUrls: plan.pageUrls,
  });
}
