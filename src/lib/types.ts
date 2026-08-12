export type SearchType = "phone" | "fax" | "text";

export interface SearchRequest {
  url: string;
  searchType: SearchType;
  query?: string;
  maxPages?: number;
}

export interface SearchMatch {
  pageUrl: string;
  match: string;
  context: string;
  searchType: SearchType;
}

export interface CrawlProgress {
  pagesScanned: number;
  pagesQueued: number;
  currentUrl: string;
  matchesFound: number;
  maxPages: number;
  status: "fetching" | "parsed";
}

export type SearchStreamEvent =
  | ({ type: "progress" } & CrawlProgress)
  | { type: "match"; pageUrl: string; matches: SearchMatch[] }
  | ({ type: "complete" } & SearchResponse)
  | { type: "error"; message: string };

export interface SearchResponse {
  startUrl: string;
  searchType: SearchType;
  query?: string;
  pagesScanned: number;
  matches: SearchMatch[];
  errors: string[];
}
