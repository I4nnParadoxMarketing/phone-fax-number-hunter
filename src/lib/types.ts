export type SearchType = "phone" | "fax" | "text";
export type SourceMode = "sitemap" | "crawl";

export interface SearchRequest {
  url: string;
  sourceMode?: SourceMode;
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
  status: "loading-sitemap" | "fetching" | "parsed";
  sourceMode?: SourceMode;
  sitemapUrl?: string;
  totalPagesInSitemap?: number;
}

export type SearchStreamEvent =
  | ({ type: "progress" } & CrawlProgress)
  | { type: "match"; pageUrl: string; matches: SearchMatch[] }
  | ({ type: "complete" } & SearchResponse)
  | { type: "error"; message: string };

export interface SearchResponse {
  startUrl: string;
  sourceMode: SourceMode;
  sitemapUrl?: string;
  searchType: SearchType;
  query?: string;
  pagesScanned: number;
  matches: SearchMatch[];
  errors: string[];
}
