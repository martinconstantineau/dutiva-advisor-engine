/**
 * Startpage web search provider adapter.
 *
 * Startpage is the discovery provider only. The engine cites and validates
 * the underlying source page URLs, NOT Startpage URLs.
 *
 * This implementation is an adapter interface. Because Startpage does not
 * publish an official public API as of this writing, the provider is implemented
 * as a configurable adapter that:
 * 1. Calls a configured STARTPAGE_BASE_URL endpoint (e.g. a self-hosted or
 *    contracted Startpage API endpoint, or an approved proxy).
 * 2. Falls back gracefully with a quality warning if the endpoint is not
 *    configured or unavailable.
 * 3. Never uses brittle HTML scraping — if no API endpoint is configured,
 *    the provider fails safely rather than scraping.
 *
 * Configuration:
 *   STARTPAGE_BASE_URL  — the API/adapter endpoint URL (required for live calls)
 *   STARTPAGE_API_KEY   — API key for the endpoint (required for live calls)
 *   STARTPAGE_TIMEOUT_MS — request timeout (default 10000ms)
 *   STARTPAGE_MAX_RESULTS — maximum results to return (default 5)
 *   STARTPAGE_REGION    — search region (default "ca")
 *   STARTPAGE_LANGUAGE  — language (default "en")
 *
 * No live Startpage calls are made in tests (WEB_SEARCH_ENABLED defaults to false).
 */

import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from './webSearchTypes';
import type { WebSearchConfig } from './webSearchTypes';
import { validateWebUrl } from './validateWebSource';
import { sanitizeWebSearchError } from './webSearchConfig';

// ─── Raw Startpage API response shape ───────────────────────────────────────
// Adapt this interface to match whatever endpoint format is used.

interface StartpageApiResult {
  title?: string;
  url?: string;
  snippet?: string;
  published?: string | null;
}

interface StartpageApiResponse {
  results?: StartpageApiResult[];
  query?: string;
  error?: string;
}

// ─── Provider implementation ─────────────────────────────────────────────────

export class StartpageSearchProvider implements WebSearchProvider {
  readonly name = 'startpage' as const;

  constructor(private readonly config: WebSearchConfig) {}

  async search(request: WebSearchRequest): Promise<WebSearchResult[]> {
    const { startpageBaseUrl, startpageApiKey, startpageTimeoutMs } = this.config;

    // If endpoint is not configured, fail safely — do not scrape HTML
    if (!startpageBaseUrl.trim() || !startpageApiKey.trim()) {
      throw new Error(
        'Startpage endpoint is not configured. Set STARTPAGE_BASE_URL and STARTPAGE_API_KEY to enable live web search.',
      );
    }

    const maxResults = request.maxResults ?? this.config.startpageMaxResults;
    const region = this.config.startpageRegion;
    const language = request.locale === 'fr' ? 'fr' : this.config.startpageLanguage;

    // Build the request URL — adapt query parameters to match the actual endpoint spec
    const params = new URLSearchParams({
      q: request.query,
      regions: region,
      language,
      num: String(maxResults),
      safe: request.safeSearch !== false ? '1' : '0',
    });

    const url = `${startpageBaseUrl.replace(/\/$/, '')}/search?${params.toString()}`;

    let rawBody: string;
    try {
      // Use the built-in fetch (Node 18+) with a timeout via AbortController
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), startpageTimeoutMs);
      try {
        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${startpageApiKey}`,
            'Accept': 'application/json',
            'User-Agent': 'dutiva-advisor-engine/1.0',
          },
          signal: controller.signal,
        });
        rawBody = await resp.text();
        if (!resp.ok) {
          throw new Error(`Startpage endpoint returned HTTP ${resp.status}`);
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown fetch error';
      // Sanitize to never leak API key
      const safe = sanitizeWebSearchError(msg, startpageApiKey);
      throw new Error(`Startpage search failed: ${safe}`);
    }

    // Parse the response — adapt to actual endpoint schema
    let parsed: StartpageApiResponse;
    try {
      parsed = JSON.parse(rawBody) as StartpageApiResponse;
    } catch {
      throw new Error('Startpage returned a non-JSON response');
    }

    if (parsed.error) {
      throw new Error(`Startpage API error: ${sanitizeWebSearchError(parsed.error, startpageApiKey)}`);
    }

    const rawResults = parsed.results ?? [];
    const now = new Date().toISOString();

    return rawResults
      .slice(0, maxResults)
      .map((r): WebSearchResult | null => {
        if (!r.url) return null;

        const validated = validateWebUrl(r.url);
        if (validated.validationStatus === 'suppressed') return null;

        return {
          title: r.title ?? validated.hostname,
          url: validated.url,
          snippet: r.snippet,
          sourceDomain: validated.hostname,
          retrievedAt: now,
          publishedAt: r.published ?? null,
          sourceType: validated.sourceType,
          validationStatus: validated.validationStatus,
          qualityWarnings: validated.qualityWarnings,
        };
      })
      .filter((r): r is WebSearchResult => r !== null);
  }
}

// ─── Module-level provider instance ─────────────────────────────────────────

let _provider: WebSearchProvider | null = null;

export function createStartpageProvider(config: WebSearchConfig): WebSearchProvider {
  return new StartpageSearchProvider(config);
}

export function getWebSearchProvider(config: WebSearchConfig): WebSearchProvider {
  if (!_provider) _provider = createStartpageProvider(config);
  return _provider;
}

/** Reset provider (for tests) */
export function resetWebSearchProvider(): void {
  _provider = null;
}

/**
 * Set a mock/test provider to override the real Startpage provider.
 * Used in tests to prevent real network calls.
 */
export function setWebSearchProvider(provider: WebSearchProvider | null): void {
  _provider = provider;
}
