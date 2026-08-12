"use client";

import { FormEvent, useMemo, useState } from "react";
import { parseStreamLine, readResponseError } from "@/lib/read-response-error";
import type { CrawlProgress, SearchMatch, SearchResponse, SearchType, SearchStreamEvent } from "@/lib/types";

const SEARCH_TYPES: { value: SearchType; label: string; description: string }[] = [
  {
    value: "phone",
    label: "Phone numbers",
    description: "Find all phone numbers, or filter by a specific number",
  },
  {
    value: "fax",
    label: "Fax numbers",
    description: "Find fax lines labeled on the site, or filter by number",
  },
  {
    value: "text",
    label: "Custom text",
    description: "Search for any word or phrase across the site",
  },
];

function downloadCsv(matches: SearchMatch[]) {
  const header = ["Page URL", "Match", "Context", "Type"];
  const rows = matches.map((m) =>
    [m.pageUrl, m.match, m.context, m.searchType]
      .map((value) => `"${value.replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "search-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function groupMatchesByPage(matches: SearchMatch[]): [string, SearchMatch[]][] {
  const groups = new Map<string, SearchMatch[]>();

  for (const match of matches) {
    const existing = groups.get(match.pageUrl) ?? [];
    existing.push(match);
    groups.set(match.pageUrl, existing);
  }

  return [...groups.entries()];
}

async function runSearch(
  payload: {
    url: string;
    searchType: SearchType;
    query?: string;
    maxPages: number;
  },
  onProgress: (progress: CrawlProgress) => void,
  onMatch: (pageUrl: string, matches: SearchMatch[]) => void,
): Promise<SearchResponse> {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("ndjson")) {
    throw new Error(await readResponseError(response));
  }

  if (!response.body) {
    throw new Error("Search failed: no response stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;

      const event = parseStreamLine(line) as SearchStreamEvent;

      if (event.type === "progress") {
        onProgress({
          pagesScanned: event.pagesScanned,
          pagesQueued: event.pagesQueued,
          currentUrl: event.currentUrl,
          matchesFound: event.matchesFound,
          maxPages: event.maxPages,
          status: event.status,
        });
      }

      if (event.type === "match") {
        onMatch(event.pageUrl, event.matches);
      }

      if (event.type === "error") {
        throw new Error(event.message);
      }

      if (event.type === "complete") {
        return {
          startUrl: event.startUrl,
          searchType: event.searchType,
          query: event.query,
          pagesScanned: event.pagesScanned,
          matches: event.matches,
          errors: event.errors,
        };
      }
    }
  }

  throw new Error("Search ended before results were received");
}

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("phone");
  const [query, setQuery] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [liveMatches, setLiveMatches] = useState<SearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);

  const progressPercent = useMemo(() => {
    if (!progress || progress.maxPages <= 0) return 0;
    return Math.min(100, Math.round((progress.pagesScanned / progress.maxPages) * 100));
  }, [progress]);

  const groupedResults = useMemo(
    () => (result ? groupMatchesByPage(result.matches) : []),
    [result],
  );

  const groupedLiveMatches = useMemo(
    () => (liveMatches.length > 0 ? groupMatchesByPage(liveMatches) : []),
    [liveMatches],
  );
  const queryLabel = useMemo(() => {
    if (searchType === "text") return "Text to search";
    if (searchType === "fax") return "Specific fax number (optional)";
    return "Specific phone number (optional)";
  }, [searchType]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setProgress(null);
    setLiveMatches([]);
    setError(null);
    setResult(null);

    try {
      const data = await runSearch(
        {
          url,
          searchType,
          query: query.trim() || undefined,
          maxPages,
        },
        setProgress,
        (pageUrl, matches) => {
          setLiveMatches((current) => [
            ...current,
            ...matches.map((match) => ({ ...match, pageUrl })),
          ]);
        },
      );

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
      setProgress(null);
      setLiveMatches([]);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--primary)]">
          Site-wide contact finder
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Phone &amp; Fax Number Hunter
        </h1>
        <p className="max-w-2xl text-[var(--muted)]">
          Enter a website URL and search the entire site for phone numbers, fax numbers, or
          custom text. Results include the page URL and surrounding context.
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="url" className="block text-sm font-medium">
              Website URL
            </label>
            <input
              id="url"
              type="url"
              required
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 outline-none ring-[var(--primary)] focus:ring-2"
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Search type</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {SEARCH_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    searchType === type.value
                      ? "border-[var(--primary)] bg-blue-50 dark:bg-blue-950/30"
                      : "border-[var(--border)] hover:border-[var(--primary)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="searchType"
                    value={type.value}
                    checked={searchType === type.value}
                    onChange={() => setSearchType(type.value)}
                    className="sr-only"
                  />
                  <span className="block font-medium">{type.label}</span>
                  <span className="mt-1 block text-sm text-[var(--muted)]">
                    {type.description}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="query" className="block text-sm font-medium">
                {queryLabel}
              </label>
              <input
                id="query"
                type="text"
                required={searchType === "text"}
                placeholder={
                  searchType === "text" ? "Billing department" : "800-555-0199 (optional)"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 outline-none ring-[var(--primary)] focus:ring-2"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="maxPages" className="block text-sm font-medium">
                Max pages to scan
              </label>
              <input
                id="maxPages"
                type="number"
                min={1}
                max={200}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 outline-none ring-[var(--primary)] focus:ring-2"
              />
              <p className="text-xs text-[var(--muted)]">
                Use 5–10 pages on the free Vercel plan to avoid timeouts.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Scanning site…" : "Search site"}
          </button>
        </form>
      </section>

      {loading && progress && (
        <section
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm"
          aria-live="polite"
        >
          <div className="flex items-start gap-4">
            <div
              className="mt-1 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <p className="font-medium">
                  {progress.status === "fetching" ? "Fetching page…" : "Scanning page…"}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Page{" "}
                  {progress.status === "fetching"
                    ? progress.pagesScanned + 1
                    : progress.pagesScanned}{" "}
                  of {progress.maxPages}
                  {progress.pagesQueued > 0 && ` · ${progress.pagesQueued} more in queue`}
                </p>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-[var(--background)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                  style={{ width: `${Math.max(progressPercent, progress.pagesScanned > 0 ? 8 : 4)}%` }}
                />
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--muted)]">Matches found</dt>
                  <dd className="text-lg font-semibold">{progress.matchesFound}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Pages scanned</dt>
                  <dd className="text-lg font-semibold">{progress.pagesScanned}</dd>
                </div>
              </dl>

              <div>
                <p className="text-sm text-[var(--muted)]">Currently searching</p>
                <p className="mt-1 break-all text-sm font-medium">{progress.currentUrl}</p>
              </div>

              {groupedLiveMatches.length > 0 && (
                <div className="space-y-3 border-t border-[var(--border)] pt-4">
                  <p className="text-sm font-medium">Found on these pages</p>
                  <div className="space-y-3">
                    {groupedLiveMatches.map(([pageUrl, pageMatches]) => (
                      <div
                        key={pageUrl}
                        className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                          Page URL
                        </p>
                        <a
                          href={pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block break-all text-sm text-[var(--primary)] hover:underline"
                        >
                          {pageUrl}
                        </a>
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          {pageMatches.length} match{pageMatches.length === 1 ? "" : "es"} on this page
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {loading && !progress && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-8 text-center">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
          <p className="font-medium">Starting site scan…</p>
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Results</h2>
              <p className="text-sm text-[var(--muted)]">
                Scanned {result.pagesScanned} page{result.pagesScanned === 1 ? "" : "s"} on{" "}
                <span className="font-medium text-[var(--foreground)]">{result.startUrl}</span>
                {" · "}
                {result.matches.length} match{result.matches.length === 1 ? "" : "es"}
              </p>
            </div>

            {result.matches.length > 0 && (
              <button
                type="button"
                onClick={() => downloadCsv(result.matches)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--background)]"
              >
                Export CSV
              </button>
            )}
          </div>

          {result.errors.length > 0 && (
            <details className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <summary className="cursor-pointer font-medium">
                {result.errors.length} page fetch warning
                {result.errors.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.errors.slice(0, 10).map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {result.errors.length > 10 && <li>…and {result.errors.length - 10} more</li>}
              </ul>
            </details>
          )}

          {result.matches.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-[var(--muted)]">
              No matches found. Try a different query or increase the page limit.
            </div>
          ) : (
            <div className="space-y-4">
              {groupedResults.map(([pageUrl, pageMatches]) => (
                <article
                  key={pageUrl}
                  className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]"
                >
                  <div className="border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                      Page URL
                    </p>
                    <a
                      href={pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all font-medium text-[var(--primary)] hover:underline"
                    >
                      {pageUrl}
                    </a>
                  </div>
                  <ul className="divide-y divide-[var(--border)]">
                    {pageMatches.map((match, index) => (
                      <li key={`${match.match}-${index}`} className="px-4 py-3">
                        <p className="font-semibold">{match.match}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">{match.context}</p>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="mt-auto border-t border-[var(--border)] pt-6 text-center text-sm text-[var(--muted)]">
        Built by{" "}
        <span className="font-medium text-[var(--foreground)]">Paradox Marketing</span>
      </footer>
    </main>
  );
}
