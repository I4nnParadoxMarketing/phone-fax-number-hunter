import * as cheerio from "cheerio";
import type { SearchMatch, SearchType } from "./types";
import { normalizeForComparison, normalizePhone, phoneNumbersMatch } from "./normalize";

const PHONE_PATTERN =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}(?:\s*(?:x|ext\.?)\s*\d{1,6})?/gi;

const FAX_LABEL_PATTERN =
  /(?:fax|facsimile|f\.?\s*:)\s*([+\d()\s.\-/]{7,25})/gi;

const CONTEXT_RADIUS = 60;

function getContext(text: string, index: number, length: number): string {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(text.length, index + length + CONTEXT_RADIUS);
  const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${snippet}${suffix}`;
}

function dedupeMatches(matches: SearchMatch[]): SearchMatch[] {
  const seen = new Set<string>();
  const result: SearchMatch[] = [];

  for (const match of matches) {
    const key = `${match.pageUrl}::${match.match.toLowerCase()}::${match.context.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }

  return result;
}

function extractPhoneNumbers(text: string, pageUrl: string, filterQuery?: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const found = new Set<string>();

  for (const raw of text.match(PHONE_PATTERN) ?? []) {
    const candidate = raw.trim();
    const normalized = normalizePhone(candidate);
    if (!normalized) continue;

    const key = normalizeForComparison(candidate);
    if (found.has(key)) continue;
    found.add(key);

    if (filterQuery && !phoneNumbersMatch(candidate, filterQuery)) continue;

    const index = text.indexOf(candidate);
    matches.push({
      pageUrl,
      match: candidate,
      context: getContext(text, index, candidate.length),
      searchType: "phone",
    });
  }

  return matches;
}

function extractFaxNumbers(text: string, pageUrl: string, filterQuery?: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const found = new Set<string>();

  let labelMatch: RegExpExecArray | null;
  const labelPattern = new RegExp(FAX_LABEL_PATTERN.source, FAX_LABEL_PATTERN.flags);

  while ((labelMatch = labelPattern.exec(text)) !== null) {
    const candidate = labelMatch[1].trim();
    const normalized = normalizePhone(candidate);
    if (!normalized) continue;

    const key = normalizeForComparison(candidate);
    if (found.has(key)) continue;
    found.add(key);

    if (filterQuery && !phoneNumbersMatch(candidate, filterQuery)) continue;

    matches.push({
      pageUrl,
      match: candidate,
      context: getContext(text, labelMatch.index, labelMatch[0].length),
      searchType: "fax",
    });
  }

  // Also pick up numbers near "fax" within a short window
  const faxWindow = /fax[^.\n]{0,40}?([+\d()\s.\-/]{7,20})/gi;
  let windowMatch: RegExpExecArray | null;

  while ((windowMatch = faxWindow.exec(text)) !== null) {
    const candidate = windowMatch[1].trim();
    const normalized = normalizePhone(candidate);
    if (!normalized) continue;

    const key = normalizeForComparison(candidate);
    if (found.has(key)) continue;
    found.add(key);

    if (filterQuery && !phoneNumbersMatch(candidate, filterQuery)) continue;

    matches.push({
      pageUrl,
      match: candidate,
      context: getContext(text, windowMatch.index, windowMatch[0].length),
      searchType: "fax",
    });
  }

  return matches;
}

function extractTextMatches(text: string, pageUrl: string, query: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();

  if (!lowerQuery) return matches;

  let start = 0;
  while (true) {
    const index = lowerText.indexOf(lowerQuery, start);
    if (index === -1) break;

    matches.push({
      pageUrl,
      match: text.slice(index, index + query.length),
      context: getContext(text, index, query.length),
      searchType: "text",
    });

    start = index + lowerQuery.length;
  }

  return matches;
}

export function extractFromHtml(
  html: string,
  pageUrl: string,
  searchType: SearchType,
  query?: string,
): SearchMatch[] {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();

  if (!text) return [];

  let matches: SearchMatch[] = [];

  switch (searchType) {
    case "phone":
      matches = extractPhoneNumbers(text, pageUrl, query);
      break;
    case "fax":
      matches = extractFaxNumbers(text, pageUrl, query);
      break;
    case "text":
      if (!query?.trim()) return [];
      matches = extractTextMatches(text, pageUrl, query);
      break;
  }

  return dedupeMatches(matches);
}

export function extractLinks(html: string, baseUrl: URL): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;
      if (resolved.hostname !== baseUrl.hostname) return;

      resolved.hash = "";
      links.add(resolved.toString());
    } catch {
      // ignore invalid URLs
    }
  });

  return [...links];
}
