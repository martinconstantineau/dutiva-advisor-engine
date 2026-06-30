/**
 * Provider-neutral web search types.
 *
 * Startpage is the discovery provider. The engine cites and validates the
 * underlying source pages, not Startpage URLs. Startpage search results are
 * not legal authority.
 */

export type WebSourceType =
  | 'official_government'   // canada.ca, ontario.ca, legisquebec.gouv.qc.ca, cnesst.gouv.qc.ca
  | 'court_or_tribunal'     // canlii.org, hrto.ca, or tribunal domains
  | 'legislation'           // ontario.ca/laws, laws-lois.justice.gc.ca
  | 'regulator_or_agency'   // ohrc.on.ca, esdc.gc.ca, hrsdc.gc.ca
  | 'reputable_secondary'   // recognized HR/legal publishers
  | 'general_web'           // other indexed pages
  | 'unknown';              // unable to classify

export type WebSearchValidationStatus = 'valid' | 'requires_review' | 'suppressed';

export interface WebSearchRequest {
  query: string;
  locale: 'en' | 'fr';
  jurisdiction?: string | null;
  maxResults?: number;
  safeSearch?: boolean;
  freshness?: 'any' | 'recent' | 'current';
}

export interface WebSearchResult {
  title: string;
  /** Canonicalized source URL — never a Startpage proxy/anonymous URL */
  url: string;
  snippet?: string;
  sourceDomain: string;
  retrievedAt: string;
  publishedAt?: string | null;
  sourceType: WebSourceType;
  validationStatus: WebSearchValidationStatus;
  qualityWarnings: string[];
}

export interface WebSearchProvider {
  name: 'startpage';
  search(request: WebSearchRequest): Promise<WebSearchResult[]>;
}

/** Metadata about web search execution for this response */
export interface WebSearchMeta {
  used: boolean;
  provider: 'startpage';
  query?: string;
  results?: WebSearchResult[];
  warnings: string[];
}

/** Web search configuration loaded from environment */
export interface WebSearchConfig {
  enabled: boolean;
  provider: 'startpage';
  startpageBaseUrl: string;
  startpageApiKey: string;
  startpageTimeoutMs: number;
  startpageMaxResults: number;
  startpageRegion: string;
  startpageLanguage: string;
  cacheTtlSeconds: number;
  fetchTimeoutMs: number;
}
