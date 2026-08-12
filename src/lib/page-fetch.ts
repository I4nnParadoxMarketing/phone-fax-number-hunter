const USER_AGENT = "PhoneFaxNumberHunter/1.0 (+https://github.com/phone-fax-number-hunter)";
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

function isFetchableContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  return (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml")
  );
}

export async function fetchPageHtml(
  url: string,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
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

export async function fetchTextResource(
  url: string,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<string> {
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
