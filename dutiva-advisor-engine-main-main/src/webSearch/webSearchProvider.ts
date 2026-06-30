/**
 * Provider-neutral web search runner.
 *
 * Orchestrates:
 * 1. Config check (WEB_SEARCH_ENABLED, enableWebSearch option)
 * 2. PII-safe query building
 * 3. Provider call with graceful error handling
 * 4. Source validation and ranking
 * 5. Quality warning collection
 *
 * Never throws — returns an empty result set with warnings on failure.
 */

import type { WebSearchResult, WebSearchMeta } from './webSearchTypes';
import type { Locale } from '../workspace/workspaceTypes';
import { getWebSearchConfig, isWebSearchConfigured, sanitizeWebSearchError } from './webSearchConfig';
import { getWebSearchProvider } from './startpageSearchProvider';
import { buildWebSearchQuery, shouldPerformWebSearch } from './buildWebSearchQuery';
import { rankWebSources } from './rankWebSources';

export interface RunWebSearchOptions {
  userMessage: string;
  routeIntent: string;
  jurisdiction: string | null | undefined;
  locale: Locale;
  enableWebSearch: boolean;
  maxResults?: number;
}

/**
 * Run a web search and return canonicalized, validated, ranked results.
 *
 * Gate order (all must be true for search to run):
 * 1. WEB_SEARCH_ENABLED=true (global config gate)
 * 2. enableWebSearch === true (per-request option)
 * 3. Route is HR/compliance-eligible (not personal/crisis/out-of-scope)
 * 4. Query requires current/external information
 *
 * On any failure the function returns a meta with used=false and a warning,
 * never propagating exceptions to the caller.
 */
export async function runWebSearch(options: RunWebSearchOptions): Promise<WebSearchMeta> {
  const { userMessage, routeIntent, jurisdiction, locale, enableWebSearch, maxResults } = options;
  const cfg = getWebSearchConfig();

  // Gate 1: global config
  if (!cfg.enabled) {
    return { used: false, provider: 'startpage', warnings: [] };
  }

  // Gate 2: per-request option
  if (!enableWebSearch) {
    return { used: false, provider: 'startpage', warnings: [] };
  }

  // Gate 3+4: route and query intent
  if (!shouldPerformWebSearch(userMessage, routeIntent)) {
    return { used: false, provider: 'startpage', warnings: [] };
  }

  // Gate 5: config must be present (endpoint + key)
  if (!isWebSearchConfigured(cfg)) {
    return {
      used: false,
      provider: 'startpage',
      warnings: ['Web search is enabled but Startpage endpoint is not configured (STARTPAGE_BASE_URL, STARTPAGE_API_KEY).'],
    };
  }

  // Build PII-safe query
  const query = buildWebSearchQuery(userMessage, jurisdiction, locale);

  const provider = getWebSearchProvider(cfg);
  let rawResults: WebSearchResult[] = [];
  const warnings: string[] = [];

  try {
    rawResults = await provider.search({
      query,
      locale,
      jurisdiction,
      maxResults: maxResults ?? cfg.startpageMaxResults,
      safeSearch: true,
      freshness: 'recent',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown web search error';
    const safe = sanitizeWebSearchError(msg, cfg.startpageApiKey);
    warnings.push(`Web search failed: ${safe}`);
    return { used: false, provider: 'startpage', query, warnings };
  }

  // Rank results by authority
  const ranked = rankWebSources(rawResults);

  if (ranked.length === 0) {
    warnings.push('Web search returned no usable results for this query.');
  }

  return {
    used: ranked.length > 0,
    provider: 'startpage',
    query,
    results: ranked,
    warnings,
  };
}
