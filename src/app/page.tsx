"use client";

import { FormEvent, useMemo, useState } from "react";
import type { SearchMatch, SearchResponse, SearchType } from "@/lib/types";

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

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("phone");
  const [query, setQuery] = useState("");
  const [maxPages, setMaxPages] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);

  const queryLabel = useMemo(() => {
    if (searchType === "text") return "Text to search";
    if (searchType === "fax") return "Specific fax number (optional)";
    return "Specific phone number (optional)";
  }, [searchType]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          searchType,
          query: query.trim() || undefined,
          maxPages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Search failed");
      }

      setResult(data as SearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
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
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--border)] bg-[var(--background)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Page</th>
                      <th className="px-4 py-3 font-medium">Match</th>
                      <th className="px-4 py-3 font-medium">Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matches.map((match, index) => (
                      <tr
                        key={`${match.pageUrl}-${match.match}-${index}`}
                        className="border-b border-[var(--border)] last:border-b-0"
                      >
                        <td className="max-w-xs px-4 py-3 align-top">
                          <a
                            href={match.pageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-[var(--primary)] hover:underline"
                          >
                            {match.pageUrl}
                          </a>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top font-medium">
                          {match.match}
                        </td>
                        <td className="max-w-md px-4 py-3 align-top text-[var(--muted)]">
                          {match.context}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
