import { extractFromHtml, extractLinks } from "./extractor";
import type { CrawlProgress, SearchMatch, SearchType } from "./types";

const DEFAULT_MAX_PAGES = 100;
const DEFAULT_CRAWL_DELAY_MS = 500;
const VERCEL_CRAWL_DELAY_MS = 150;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = "PhoneFaxNumberHunter/1.0 (+https://github.com/phone-fax-number-hunter)";

export interface CrawlOptions {
  maxPages?: number;
  crawlDelayMs?: number;
  requestTimeoutMs?: number;
  onProgress?: (progress: CrawlProgress) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFetchableContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  return (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml")
  );
}

async function fetchPage(
  url: string,
  timeoutMs: number,
): Promise<{ html: string } | { error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return { error: `${url}: HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type");
    if (!isFetchableContentType(contentType)) {
      return { error: `${url}: unsupported content type (${contentType ?? "unknown"})` };
    }

    const html = await response.text();
    return { html };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";
    return { error: `${url}: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

export async function crawlSite(
  startUrl: string,
  searchType: SearchType,
  query: string | undefined,
  options: CrawlOptions = {},
): Promise<{ matches: SearchMatch[]; pagesScanned: number; errors: string[] }> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const crawlDelayMs =
    options.crawlDelayMs ??
    (process.env.VERCEL ? VERCEL_CRAWL_DELAY_MS : DEFAULT_CRAWL_DELAY_MS);
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  let parsedStart: URL;
  try {
    parsedStart = new URL(startUrl);
    if (parsedStart.protocol !== "http:" && parsedStart.protocol !== "https:") {
      throw new Error("URL must use http or https");
    }
  } catch {
    throw new Error("Invalid URL. Include the full address, e.g. https://example.com");
  }

  parsedStart.hash = "";
  const normalizedStart = parsedStart.toString();

  const visited = new Set<string>();
  const queue: string[] = [normalizedStart];
  const matches: SearchMatch[] = [];
  const errors: string[] = [];
  let pagesScanned = 0;

  while (queue.length > 0 && pagesScanned < maxPages) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    const reportProgress = (status: CrawlProgress["status"]) => {
      options.onProgress?.({
        pagesScanned,
        pagesQueued: queue.length,
        currentUrl,
        matchesFound: matches.length,
        maxPages,
        status,
      });
    };

    reportProgress("fetching");

    const result = await fetchPage(currentUrl, requestTimeoutMs);

    if ("error" in result) {
      errors.push(result.error);
      continue;
    }

    pagesScanned += 1;

    const pageMatches = extractFromHtml(result.html, currentUrl, searchType, query);
    matches.push(...pageMatches);

    reportProgress("parsed");

    const links = extractLinks(result.html, new URL(currentUrl));
    for (const link of links) {
      if (!visited.has(link) && !queue.includes(link)) {
        queue.push(link);
      }
    }

    if (queue.length > 0 && pagesScanned < maxPages) {
      await sleep(crawlDelayMs);
    }
  }

  return { matches, pagesScanned, errors };
}
