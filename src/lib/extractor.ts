import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { SearchMatch, SearchType } from "./types";
import { normalizeForComparison, normalizePhone, phoneNumbersMatch } from "./normalize";

const PHONE_PATTERN =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?/gi;

const FAX_LABEL_PATTERN =
  /(?:fax|facsimile|f\.?\s*:)\s*([+\d()\s.\-/]{7,25})/gi;

const CALL_LINK_TEXT =
  /\b(call(?:\s+us)?|phone|telephone|tel|contact(?:\s+us)?|ring(?:\s+us)?|dial)\b/i;

const FAX_LINK_TEXT = /\b(fax|facsimile)\b/i;

const SCAN_ATTRIBUTES = [
  "href",
  "title",
  "aria-label",
  "data-phone",
  "data-tel",
  "data-fax",
  "data-contact",
  "data-number",
  "content",
  "alt",
] as const;

const CONTEXT_RADIUS = 60;

function getContext(text: string, index: number, length: number): string {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(text.length, index + length + CONTEXT_RADIUS);
  const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${snippet}${suffix}`;
}

function formatContext(source: string, detail: string): string {
  return `[${source}] ${detail}`;
}

function decodeTelHref(href: string): string {
  const raw = href.replace(/^tel:/i, "").trim();
  const numberPart = raw.split(/[;,]/)[0] ?? raw;
  try {
    return decodeURIComponent(numberPart).replace(/\s+/g, " ").trim();
  } catch {
    return numberPart.replace(/\s+/g, " ").trim();
  }
}

function dedupeMatches(matches: SearchMatch[]): SearchMatch[] {
  const seen = new Set<string>();
  const result: SearchMatch[] = [];

  for (const match of matches) {
    const key = `${match.pageUrl}::${normalizeForComparison(match.match)}::${match.context.slice(0, 50)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }

  return result;
}

function passesFilter(candidate: string, filterQuery?: string): boolean {
  if (!filterQuery) return true;
  return phoneNumbersMatch(candidate, filterQuery);
}

function pushPhoneMatch(
  matches: SearchMatch[],
  found: Set<string>,
  pageUrl: string,
  candidate: string,
  context: string,
  filterQuery?: string,
): void {
  const trimmed = candidate.trim();
  if (!trimmed || !normalizePhone(trimmed)) return;
  if (!passesFilter(trimmed, filterQuery)) return;

  const key = normalizeForComparison(trimmed);
  if (found.has(key)) return;
  found.add(key);

  matches.push({
    pageUrl,
    match: trimmed,
    context,
    searchType: "phone",
  });
}

function pushFaxMatch(
  matches: SearchMatch[],
  found: Set<string>,
  pageUrl: string,
  candidate: string,
  context: string,
  filterQuery?: string,
): void {
  const trimmed = candidate.trim();
  if (!trimmed || !normalizePhone(trimmed)) return;
  if (!passesFilter(trimmed, filterQuery)) return;

  const key = normalizeForComparison(trimmed);
  if (found.has(key)) return;
  found.add(key);

  matches.push({
    pageUrl,
    match: trimmed,
    context,
    searchType: "fax",
  });
}

function extractPhoneNumbersFromText(
  text: string,
  pageUrl: string,
  source: string,
  found: Set<string>,
  filterQuery?: string,
): SearchMatch[] {
  const matches: SearchMatch[] = [];

  for (const raw of text.match(PHONE_PATTERN) ?? []) {
    const candidate = raw.trim();
    const index = text.indexOf(candidate);
    pushPhoneMatch(
      matches,
      found,
      pageUrl,
      candidate,
      formatContext(source, getContext(text, index, candidate.length)),
      filterQuery,
    );
  }

  return matches;
}

function extractFaxNumbersFromText(
  text: string,
  pageUrl: string,
  source: string,
  found: Set<string>,
  filterQuery?: string,
): SearchMatch[] {
  const matches: SearchMatch[] = [];

  let labelMatch: RegExpExecArray | null;
  const labelPattern = new RegExp(FAX_LABEL_PATTERN.source, FAX_LABEL_PATTERN.flags);

  while ((labelMatch = labelPattern.exec(text)) !== null) {
    pushFaxMatch(
      matches,
      found,
      pageUrl,
      labelMatch[1],
      formatContext(source, getContext(text, labelMatch.index, labelMatch[0].length)),
      filterQuery,
    );
  }

  const faxWindow = /fax[^.\n]{0,40}?([+\d()\s.\-/]{7,20})/gi;
  let windowMatch: RegExpExecArray | null;

  while ((windowMatch = faxWindow.exec(text)) !== null) {
    pushFaxMatch(
      matches,
      found,
      pageUrl,
      windowMatch[1],
      formatContext(source, getContext(text, windowMatch.index, windowMatch[0].length)),
      filterQuery,
    );
  }

  for (const raw of text.match(PHONE_PATTERN) ?? []) {
    const candidate = raw.trim();
    const index = text.indexOf(candidate);
    const lowerWindow = text
      .slice(Math.max(0, index - 20), index + candidate.length + 20)
      .toLowerCase();
    if (!lowerWindow.includes("fax") && !lowerWindow.includes("facsimile")) continue;

    pushFaxMatch(
      matches,
      found,
      pageUrl,
      candidate,
      formatContext(source, getContext(text, index, candidate.length)),
      filterQuery,
    );
  }

  return matches;
}

function extractFromTelAndCallLinks(
  $: CheerioAPI,
  pageUrl: string,
  searchType: "phone" | "fax",
  found: Set<string>,
  filterQuery?: string,
): SearchMatch[] {
  const matches: SearchMatch[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim() ?? "";
    const linkText = $(element).text().replace(/\s+/g, " ").trim();
    const ariaLabel = $(element).attr("aria-label")?.trim() ?? "";
    const title = $(element).attr("title")?.trim() ?? "";
    const combined = [linkText, ariaLabel, title].filter(Boolean).join(" · ");

    if (href.toLowerCase().startsWith("tel:")) {
      const telValue = decodeTelHref(href);
      const contextDetail = combined
        ? `${telValue} — link text: ${combined}`
        : telValue;

      if (searchType === "phone") {
        pushPhoneMatch(
          matches,
          found,
          pageUrl,
          telValue,
          formatContext("Call link (tel:)", contextDetail),
          filterQuery,
        );
      }

      if (searchType === "phone" && combined) {
        matches.push(
          ...extractPhoneNumbersFromText(combined, pageUrl, "Call link text", found, filterQuery),
        );
      }
    }

    if (searchType === "phone" && CALL_LINK_TEXT.test(combined)) {
      matches.push(
        ...extractPhoneNumbersFromText(combined, pageUrl, "Call link text", found, filterQuery),
      );

      const parentText = $(element).parent().text().replace(/\s+/g, " ").trim();
      matches.push(
        ...extractPhoneNumbersFromText(
          `${combined} ${parentText}`.slice(0, 180),
          pageUrl,
          "Call link nearby text",
          found,
          filterQuery,
        ),
      );
    }

    if (searchType === "fax" && (FAX_LINK_TEXT.test(combined) || href.toLowerCase().startsWith("fax:"))) {
      if (href.toLowerCase().startsWith("fax:")) {
        pushFaxMatch(
          matches,
          found,
          pageUrl,
          decodeTelHref(href.replace(/^fax:/i, "tel:")),
          formatContext("Fax link", combined || href),
          filterQuery,
        );
      }

      matches.push(
        ...extractFaxNumbersFromText(combined, pageUrl, "Fax link text", found, filterQuery),
      );
    }
  });

  return matches;
}

function extractFromAttributes(
  $: CheerioAPI,
  pageUrl: string,
  searchType: SearchType,
  found: Set<string>,
  filterQuery?: string,
): SearchMatch[] {
  const matches: SearchMatch[] = [];

  $("*").each((_, element) => {
    if (!("name" in element) || !element.name) return;

    for (const attr of SCAN_ATTRIBUTES) {
      const value = $(element).attr(attr)?.trim();
      if (!value) continue;

      const attrLabel = attr === "href" && value.toLowerCase().startsWith("tel:") ? "tel link" : attr;

      if (searchType === "phone" && value.toLowerCase().startsWith("tel:")) {
        pushPhoneMatch(
          matches,
          found,
          pageUrl,
          decodeTelHref(value),
          formatContext(`Attribute ${attrLabel}`, decodeTelHref(value)),
          filterQuery,
        );
        continue;
      }

      if (searchType === "fax" && value.toLowerCase().startsWith("fax:")) {
        pushFaxMatch(
          matches,
          found,
          pageUrl,
          decodeTelHref(value.replace(/^fax:/i, "tel:")),
          formatContext(`Attribute ${attrLabel}`, value),
          filterQuery,
        );
        continue;
      }

      if (searchType === "phone") {
        matches.push(
          ...extractPhoneNumbersFromText(value, pageUrl, `Attribute ${attrLabel}`, found, filterQuery),
        );
      }

      if (searchType === "fax") {
        matches.push(
          ...extractFaxNumbersFromText(value, pageUrl, `Attribute ${attrLabel}`, found, filterQuery),
        );
      }
    }

    const itemprop = $(element).attr("itemprop")?.toLowerCase();
    if (itemprop === "telephone" && searchType === "phone") {
      const value = $(element).text().replace(/\s+/g, " ").trim() || $(element).attr("content") || "";
      matches.push(
        ...extractPhoneNumbersFromText(value, pageUrl, "Schema telephone", found, filterQuery),
      );
    }

    if (itemprop === "faxnumber" && searchType === "fax") {
      const value = $(element).text().replace(/\s+/g, " ").trim() || $(element).attr("content") || "";
      matches.push(
        ...extractFaxNumbersFromText(value, pageUrl, "Schema fax", found, filterQuery),
      );
    }
  });

  return matches;
}

function extractFromRawHtml(
  html: string,
  pageUrl: string,
  searchType: "phone" | "fax",
  found: Set<string>,
  filterQuery?: string,
): SearchMatch[] {
  const matches: SearchMatch[] = [];

  if (searchType === "phone") {
    for (const match of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
      pushPhoneMatch(
        matches,
        found,
        pageUrl,
        decodeTelHref(`tel:${match[1]}`),
        formatContext("Raw tel: link", decodeTelHref(`tel:${match[1]}`)),
        filterQuery,
      );
    }
  }

  if (searchType === "fax") {
    for (const match of html.matchAll(/href=["']fax:([^"']+)["']/gi)) {
      pushFaxMatch(
        matches,
        found,
        pageUrl,
        decodeTelHref(`tel:${match[1]}`),
        formatContext("Raw fax: link", decodeTelHref(`tel:${match[1]}`)),
        filterQuery,
      );
    }
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
      context: formatContext("Page text", getContext(text, index, query.length)),
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

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const found = new Set<string>();
  const matches: SearchMatch[] = [];

  if (searchType === "phone") {
    if (bodyText) {
      matches.push(
        ...extractPhoneNumbersFromText(bodyText, pageUrl, "Page text", found, query),
      );
    }
    matches.push(...extractFromTelAndCallLinks($, pageUrl, "phone", found, query));
    matches.push(...extractFromAttributes($, pageUrl, "phone", found, query));
    matches.push(...extractFromRawHtml(html, pageUrl, "phone", found, query));
  }

  if (searchType === "fax") {
    if (bodyText) {
      matches.push(
        ...extractFaxNumbersFromText(bodyText, pageUrl, "Page text", found, query),
      );
    }
    matches.push(...extractFromTelAndCallLinks($, pageUrl, "fax", found, query));
    matches.push(...extractFromAttributes($, pageUrl, "fax", found, query));
    matches.push(...extractFromRawHtml(html, pageUrl, "fax", found, query));
  }

  if (searchType === "text") {
    if (!query?.trim()) return [];
    if (bodyText) {
      matches.push(...extractTextMatches(bodyText, pageUrl, query));
    }

    $("a[href]").each((_, element) => {
      const linkText = $(element).text().replace(/\s+/g, " ").trim();
      const ariaLabel = $(element).attr("aria-label")?.trim() ?? "";
      const combined = [linkText, ariaLabel].filter(Boolean).join(" · ");
      if (combined.toLowerCase().includes(query.toLowerCase())) {
        matches.push({
          pageUrl,
          match: query,
          context: formatContext("Call/link text", combined),
          searchType: "text",
        });
      }
    });
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
