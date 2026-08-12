import type { SearchMatch, SearchType, SourceMode } from "./types";

const STORAGE_KEY = "phone-fax-hunter-session";

export type SearchSessionStatus = "running" | "paused" | "complete";

export interface SearchSession {
  id: string;
  startUrl: string;
  sourceMode: SourceMode;
  sitemapUrl?: string;
  searchType: SearchType;
  query?: string;
  maxPages: number;
  pageUrls: string[];
  nextIndex: number;
  matches: SearchMatch[];
  errors: string[];
  status: SearchSessionStatus;
  pauseReason?: string;
  updatedAt: string;
}

export function createSearchSession(input: {
  startUrl: string;
  sourceMode: SourceMode;
  sitemapUrl?: string;
  searchType: SearchType;
  query?: string;
  maxPages: number;
  pageUrls: string[];
}): SearchSession {
  return {
    id: crypto.randomUUID(),
    startUrl: input.startUrl,
    sourceMode: input.sourceMode,
    sitemapUrl: input.sitemapUrl,
    searchType: input.searchType,
    query: input.query,
    maxPages: input.maxPages,
    pageUrls: input.pageUrls.slice(0, input.maxPages),
    nextIndex: 0,
    matches: [],
    errors: [],
    status: "running",
    updatedAt: new Date().toISOString(),
  };
}

export function saveSearchSession(session: SearchSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSearchSession(): SearchSession | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SearchSession;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearSearchSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function sessionToResponse(session: SearchSession) {
  return {
    startUrl: session.startUrl,
    sourceMode: session.sourceMode,
    sitemapUrl: session.sitemapUrl,
    searchType: session.searchType,
    query: session.query,
    pagesScanned: session.nextIndex,
    matches: session.matches,
    errors: session.errors,
  };
}

export function isSessionResumable(session: SearchSession | null): session is SearchSession {
  if (!session) return false;
  return session.status === "paused" && session.nextIndex < session.pageUrls.length;
}

export function isSessionComplete(session: SearchSession): boolean {
  return session.nextIndex >= session.pageUrls.length;
}
