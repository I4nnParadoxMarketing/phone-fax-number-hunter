import type { SearchMatch, SearchType, SourceMode } from "./types";

export type SearchJobStatus = "queued" | "running" | "complete" | "failed";

export interface SearchJob {
  id: string;
  status: SearchJobStatus;
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
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export const PAGES_PER_TICK = 5;

export const JOB_STORAGE_KEY = "phone-fax-hunter-job-id";
