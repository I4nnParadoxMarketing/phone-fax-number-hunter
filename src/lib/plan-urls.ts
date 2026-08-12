import { fetchPageHtml } from "./page-fetch";
import { extractLinks } from "./extractor";
import { getUrlsFromSitemap } from "./sitemap";
import type { SourceMode } from "./types";

export interface ScanPlan {
  startUrl: string;
  sourceMode: SourceMode;
  sitemapUrl?: string;
  pageUrls: string[];
}

export async function planScanUrls(
  startUrl: string,
  sourceMode: SourceMode,
  maxPages: number,
): Promise<ScanPlan> {
  const trimmed = startUrl.trim();

  if (sourceMode === "sitemap") {
    const { sitemapUrl, urls } = await getUrlsFromSitemap(trimmed, maxPages);
    return {
      startUrl: trimmed,
      sourceMode,
      sitemapUrl,
      pageUrls: urls,
    };
  }

  let parsedStart: URL;
  try {
    parsedStart = new URL(trimmed);
    if (parsedStart.protocol !== "http:" && parsedStart.protocol !== "https:") {
      throw new Error("URL must use http or https");
    }
  } catch {
    throw new Error("Invalid URL. Include the full address, e.g. https://example.com");
  }

  parsedStart.hash = "";

  return {
    startUrl: parsedStart.toString(),
    sourceMode,
    pageUrls: [parsedStart.toString()],
  };
}

export async function discoverCrawlUrls(
  startUrl: string,
  maxPages: number,
): Promise<string[]> {
  let parsedStart: URL;
  try {
    parsedStart = new URL(startUrl);
    parsedStart.hash = "";
  } catch {
    throw new Error("Invalid URL");
  }

  const normalizedStart = parsedStart.toString();
  const visited = new Set<string>();
  const queue: string[] = [normalizedStart];
  const discovered: string[] = [];

  while (queue.length > 0 && discovered.length < maxPages) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);
    discovered.push(currentUrl);

    const result = await fetchPageHtml(currentUrl);
    if ("error" in result) continue;

    const links = extractLinks(result.html, new URL(currentUrl));
    for (const link of links) {
      if (!visited.has(link) && !queue.includes(link)) {
        queue.push(link);
      }
    }
  }

  return discovered;
}
