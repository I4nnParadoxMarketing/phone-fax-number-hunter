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
}

export interface SearchResponse {
  startUrl: string;
  searchType: SearchType;
  query?: string;
  pagesScanned: number;
  matches: SearchMatch[];
  errors: string[];
}
