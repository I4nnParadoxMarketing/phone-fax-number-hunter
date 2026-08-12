"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runResumableSearch, startResumableSearch } from "@/lib/resumable-search";
import {
  clearSearchSession,
  isSessionResumable,
  loadSearchSession,
  saveSearchSession,
  sessionToResponse,
  type SearchSession,
} from "@/lib/search-session";
import type { CrawlProgress, SearchMatch, SearchResponse, SearchType, SourceMode } from "@/lib/types";

const SOURCE_MODES: { value: SourceMode; label: string; description: string }[] = [
  {
    value: "sitemap",
    label: "Sitemap",
    description: "Load pages from sitemap.xml (recommended)",
  },
  {
    value: "crawl",
    label: "Website crawl",
    description: "Follow links starting from a page URL",
  },
];

const SEARCH_TYPES: { value: SearchType; label: string; description: string }[] = [
  {
    value: "phone",
    label: "Phone numbers",
    description: "Find numbers in page text, tel: links, and call links",
  },
  {
    value: "fax",
    label: "Fax numbers",
    description: "Find fax lines in text, links, and labeled fields",
  },
  {
    value: "text",
    label: "Custom text",
    description: "Search for any word or phrase across the site",
  },
];

function groupMatchesByPage(matches: SearchMatch[]): [string, SearchMatch[]][] {
  const groups = new Map<string, SearchMatch[]>();

  for (const match of matches) {
    const existing = groups.get(match.pageUrl) ?? [];
    existing.push(match);
    groups.set(match.pageUrl, existing);
  }

  return [...groups.entries()];
}

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("sitemap");
  const [searchType, setSearchType] = useState<SearchType>("phone");
  const [query, setQuery] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [liveMatches, setLiveMatches] = useState<SearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [pausedSession, setPausedSession] = useState<SearchSession | null>(null);

  const shouldContinueRef = useRef(true);
  const runningRef = useRef(false);

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

  const urlLabel = sourceMode === "sitemap" ? "Website or sitemap URL" : "Website URL";
  const urlPlaceholder =
    sourceMode === "sitemap"
      ? "https://example.com or https://example.com/sitemap.xml"
      : "https://example.com";

  const syncFromSession = useCallback((session: SearchSession) => {
    setLiveMatches(session.matches);
    setUrl(session.startUrl);
    setSourceMode(session.sourceMode);
    setSearchType(session.searchType);
    setQuery(session.query ?? "");
    setMaxPages(session.maxPages);

    if (session.status === "complete") {
      setResult(sessionToResponse(session));
      setPausedSession(null);
      return;
    }

    if (session.status === "paused") {
      setPausedSession(session);
      setResult(session.matches.length > 0 ? sessionToResponse(session) : null);
      return;
    }

    setPausedSession(null);
  }, []);

  const executeSession = useCallback(
    async (session: SearchSession) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setLoading(true);
      setError(null);
      setPausedSession(null);
      setResult(null);
      setLiveMatches(session.matches);
      shouldContinueRef.current = !document.hidden;

      try {
        const finalSession = await runResumableSearch(
          session,
          (updated) => {
            syncFromSession(updated);
            setLiveMatches(updated.matches);
          },
          setProgress,
          () => shouldContinueRef.current,
        );

        if (finalSession.status === "complete") {
          setResult(sessionToResponse(finalSession));
          clearSearchSession();
          setPausedSession(null);
        } else if (finalSession.status === "paused") {
          syncFromSession(finalSession);
          setError(finalSession.pauseReason ?? "Search paused. Click Resume to continue.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Search failed";
        const saved = loadSearchSession();
        if (saved && saved.status === "paused") {
          syncFromSession(saved);
          setError(saved.pauseReason ?? message);
        } else {
          setError(message);
        }
      } finally {
        setLoading(false);
        setProgress(null);
        runningRef.current = false;
      }
    },
    [syncFromSession],
  );

  useEffect(() => {
    const saved = loadSearchSession();
    if (!saved) return;

    syncFromSession(saved);

    if (saved.status === "complete") {
      setResult(sessionToResponse(saved));
    } else if (isSessionResumable(saved)) {
      setError(saved.pauseReason ?? "A previous search was paused. Click Resume to continue.");
    }
  }, [syncFromSession]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        shouldContinueRef.current = false;
        return;
      }

      shouldContinueRef.current = true;
      const saved = loadSearchSession();
      if (saved?.status === "paused" && isSessionResumable(saved) && !runningRef.current) {
        setPausedSession(saved);
        setError(saved.pauseReason ?? "Search paused. Click Resume to continue.");
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearSearchSession();
    setPausedSession(null);
    setError(null);

    try {
      setLoading(true);
      setProgress({
        pagesScanned: 0,
        pagesQueued: 0,
        currentUrl: url,
        matchesFound: 0,
        maxPages,
        status: sourceMode === "sitemap" ? "loading-sitemap" : "fetching",
        sourceMode,
      });

      const session = await startResumableSearch({
        url,
        sourceMode,
        searchType,
        query: query.trim() || undefined,
        maxPages,
      });

      saveSearchSession(session);
      await executeSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setLoading(false);
      setProgress(null);
    }
  }

  async function handleResume() {
    const saved = loadSearchSession();
    if (!saved || !isSessionResumable(saved)) return;

    saved.status = "running";
    saved.pauseReason = undefined;
    saveSearchSession(saved);
    setError(null);
    await executeSession(saved);
  }

  function handleDiscardPaused() {
    clearSearchSession();
    setPausedSession(null);
    setError(null);
    setLiveMatches([]);
    setResult(null);
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
          Search a site using its sitemap or by crawling pages. Progress saves automatically — if
          your laptop sleeps or the network drops, reopen the site and click Resume.
        </p>
        <p className="text-sm text-[var(--muted)]">
          For long scans, use the live site{" "}
          <a
            href="https://phone-fax-number-hunter.vercel.app/"
            className="text-[var(--primary)] hover:underline"
          >
            phone-fax-number-hunter.vercel.app
          </a>{" "}
          instead of localhost so scanning runs in the cloud.
        </p>
      </header>

      {pausedSession && !loading && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="font-semibold text-amber-950 dark:text-amber-100">Paused search</h2>
          <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
            {pausedSession.pauseReason ??
              `Scanned ${pausedSession.nextIndex} of ${pausedSession.pageUrls.length} pages.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleResume}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
            >
              Resume search
            </button>
            <button
              type="button"
              onClick={handleDiscardPaused}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--background)]"
            >
              Discard saved progress
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Page source</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {SOURCE_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    sourceMode === mode.value
                      ? "border-[var(--primary)] bg-blue-50 dark:bg-blue-950/30"
                      : "border-[var(--border)] hover:border-[var(--primary)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="sourceMode"
                    value={mode.value}
                    checked={sourceMode === mode.value}
                    onChange={() => setSourceMode(mode.value)}
                    className="sr-only"
                  />
                  <span className="block font-medium">{mode.label}</span>
                  <span className="mt-1 block text-sm text-[var(--muted)]">
                    {mode.description}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="url" className="block text-sm font-medium">
              {urlLabel}
            </label>
            <input
              id="url"
              type="url"
              required
              placeholder={urlPlaceholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 outline-none ring-[var(--primary)] focus:ring-2"
            />
            {sourceMode === "sitemap" && (
              <p className="text-xs text-[var(--muted)]">
                Enter a domain and we will look for `/sitemap.xml`, or paste the full sitemap URL.
              </p>
            )}
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
                max={20000}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 outline-none ring-[var(--primary)] focus:ring-2"
              />
              <p className="text-xs text-[var(--muted)]">
                Progress saves after each page. Resume anytime if your connection drops or laptop sleeps.
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
                  {progress.status === "loading-sitemap"
                    ? "Loading sitemap…"
                    : progress.status === "fetching"
                      ? "Fetching page…"
                      : "Scanning page…"}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Page{" "}
                  {progress.status === "fetching"
                    ? progress.pagesScanned + 1
                    : progress.pagesScanned}{" "}
                  of {progress.maxPages}
                  {progress.pagesQueued > 0 && ` · ${progress.pagesQueued} more in queue`}
                </p>
                {progress.sitemapUrl && (
                  <p className="mt-1 break-all text-xs text-[var(--muted)]">
                    Sitemap: {progress.sitemapUrl}
                  </p>
                )}
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-[var(--background)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                  style={{
                    width: `${Math.max(progressPercent, progress.pagesScanned > 0 ? 8 : 4)}%`,
                  }}
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
          <div>
            <h2 className="text-xl font-semibold">Results</h2>
            <p className="text-sm text-[var(--muted)]">
              Scanned {result.pagesScanned} page{result.pagesScanned === 1 ? "" : "s"} on{" "}
              <span className="font-medium text-[var(--foreground)]">{result.startUrl}</span>
              {result.sourceMode === "sitemap" && result.sitemapUrl && (
                <>
                  {" · "}
                  via sitemap{" "}
                  <span className="font-medium text-[var(--foreground)]">{result.sitemapUrl}</span>
                </>
              )}
              {" · "}
              {result.matches.length} match{result.matches.length === 1 ? "" : "es"}
            </p>
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
