import { extractFromHtml, extractLinks } from "./extractor";
import { fetchPageHtml } from "./page-fetch";
import type { SearchMatch, SearchType } from "./types";

export async function scanSinglePage(
  pageUrl: string,
  searchType: SearchType,
  query?: string,
  collectLinks = false,
): Promise<{ matches: SearchMatch[]; error?: string; links?: string[] }> {
  const result = await fetchPageHtml(pageUrl);

  if ("error" in result) {
    return { matches: [], error: result.error };
  }

  const matches = extractFromHtml(result.html, pageUrl, searchType, query);
  const links = collectLinks ? extractLinks(result.html, new URL(pageUrl)) : undefined;

  return { matches, links };
}
