/**
 * Web source ranking.
 *
 * Ranks validated web search results by source authority.
 * Official government and legislation sources rank highest.
 * General web / unknown sources rank lowest.
 */

import type { WebSearchResult, WebSourceType } from './webSearchTypes';

const SOURCE_TYPE_RANK: Record<WebSourceType, number> = {
  legislation: 10,
  official_government: 9,
  regulator_or_agency: 8,
  court_or_tribunal: 7,
  reputable_secondary: 5,
  general_web: 2,
  unknown: 1,
};

function rankScore(result: WebSearchResult): number {
  const typeScore = SOURCE_TYPE_RANK[result.sourceType] ?? 1;
  // Boost validated results, penalise requires_review, suppress gets 0
  const validationMultiplier =
    result.validationStatus === 'valid' ? 1.0
    : result.validationStatus === 'requires_review' ? 0.6
    : 0;
  return typeScore * validationMultiplier;
}

/**
 * Sort web results by authority (highest first).
 * Suppressed results are excluded.
 */
export function rankWebSources(results: WebSearchResult[]): WebSearchResult[] {
  return results
    .filter((r) => r.validationStatus !== 'suppressed')
    .sort((a, b) => rankScore(b) - rankScore(a));
}

/**
 * Return only results that meet the minimum authority threshold.
 * For legal/compliance answers prefer official sources.
 */
export function filterToAuthoritative(
  results: WebSearchResult[],
  minSourceType: WebSourceType = 'reputable_secondary',
): WebSearchResult[] {
  const minScore = SOURCE_TYPE_RANK[minSourceType] ?? 5;
  return results.filter(
    (r) => (SOURCE_TYPE_RANK[r.sourceType] ?? 1) >= minScore && r.validationStatus !== 'suppressed',
  );
}
