const USER_AGENT = "PhoneFaxNumberHunter/1.0 (+https://github.com/phone-fax-number-hunter)";
const MAX_SITEMAP_FILES = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string, timeoutMs = 10000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/xml,text/xml,text/plain,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Could not fetch ${url} (HTTP ${response.status})`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractLocs(xml: string): { pageUrls: string[]; sitemapUrls: string[] } {
  const pageUrls: string[] = [];
  const sitemapUrls: string[] = [];
  const isIndex = /<sitemapindex/i.test(xml);

  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const loc = match[1].trim();
    if (!loc) continue;

    if (isIndex) {
      sitemapUrls.push(loc);
    } else {
      pageUrls.push(loc);
    }
  }

  return { pageUrls, sitemapUrls };
}

async function readSitemapFile(
  sitemapUrl: string,
  hostname: string,
  collected: Set<string>,
  sitemapFilesFetched: { count: number },
): Promise<void> {
  if (sitemapFilesFetched.count >= MAX_SITEMAP_FILES) return;

  sitemapFilesFetched.count += 1;
  const xml = await fetchText(sitemapUrl);
  const { pageUrls, sitemapUrls } = extractLocs(xml);

  for (const pageUrl of pageUrls) {
    try {
      const parsed = new URL(pageUrl);
      if (parsed.hostname !== hostname) continue;
      parsed.hash = "";
      collected.add(parsed.toString());
    } catch {
      // ignore invalid URLs
    }
  }

  for (const nested of sitemapUrls) {
    if (sitemapFilesFetched.count >= MAX_SITEMAP_FILES) break;
    await sleep(100);
    await readSitemapFile(nested, hostname, collected, sitemapFilesFetched);
  }
}

async function discoverSitemapUrls(siteUrl: URL): Promise<string[]> {
  const candidates = [
    new URL("/sitemap.xml", siteUrl).toString(),
    new URL("/sitemap_index.xml", siteUrl).toString(),
    new URL("/sitemap-index.xml", siteUrl).toString(),
  ];

  try {
    const robots = await fetchText(new URL("/robots.txt", siteUrl).toString(), 5000);
    for (const line of robots.split("\n")) {
      const match = line.match(/^\s*sitemap:\s*(.+)\s*$/i);
      if (match?.[1]) {
        candidates.unshift(match[1].trim());
      }
    }
  } catch {
    // robots.txt is optional
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    try {
      await fetchText(candidate, 5000);
      return [candidate];
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    "No sitemap found. Try entering the full sitemap URL, e.g. https://example.com/sitemap.xml",
  );
}

function isLikelySitemapUrl(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return path.endsWith(".xml") || path.includes("sitemap");
}

export async function getUrlsFromSitemap(
  input: string,
  maxPages: number,
): Promise<{ sitemapUrl: string; urls: string[] }> {
  let parsedInput: URL;
  try {
    parsedInput = new URL(input.trim());
    if (parsedInput.protocol !== "http:" && parsedInput.protocol !== "https:") {
      throw new Error("URL must use http or https");
    }
  } catch {
    throw new Error("Invalid URL. Include the full address, e.g. https://example.com/sitemap.xml");
  }

  parsedInput.hash = "";
  const hostname = parsedInput.hostname;

  const sitemapCandidates = isLikelySitemapUrl(parsedInput)
    ? [parsedInput.toString()]
    : await discoverSitemapUrls(parsedInput);

  const collected = new Set<string>();
  const sitemapFilesFetched = { count: 0 };

  for (const sitemapUrl of sitemapCandidates) {
    await readSitemapFile(sitemapUrl, hostname, collected, sitemapFilesFetched);
  }

  if (collected.size === 0) {
    throw new Error("Sitemap was found but it does not contain any page URLs for this domain.");
  }

  const urls = [...collected].slice(0, maxPages);
  return {
    sitemapUrl: sitemapCandidates[0],
    urls,
  };
}
