import { GuidanceItem, ScoredGuidanceItem } from './guidanceTypes';
import { normalizeForSearch, normalizeProvinceName, tokenizeGuidanceQuery } from '../core/normalizeGuidanceText';

export interface RetrieveOptions {
  province?: string | null;
  /**
   * Whether the employer is known to be federally regulated.
   * null = unknown.  Used to refine scoring when the province is 'FEDERAL'
   * or when isFederallyRegulated is explicitly true.
   */
  isFederallyRegulated?: boolean | null;
  limit?: number;
}

/**
 * Accented French → unaccented equivalents for matching.
 * This allows "preavis" in the query to match "préavis" in a keyword.
 */
function accentVariant(term: string): string {
  return term
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Score a single guidance item against a query.
 *
 * Scoring rules:
 *  +2  per keyword that appears as a substring in the normalized query
 *  +1  per query token found in search_text (or title)
 *  +0.5  per query token found in advisor_answer_en (or content)
 *  +4  if item province matches provided province (province-specific over generic)
 *  +1  if item province is 'ALL' and a province was provided
 *   0  Canada/federal boost only if item.province is 'FEDERAL' and jurisdiction is known federal
 *  -1  per quality warning (if item has a warnings array — future use)
 *  -2  if item has status 'inactive' (case-insensitive)
 *  +2  if item risk_level is 'high' (case-insensitive) — higher-risk guidance is surfaced first
 */
export function scoreGuidanceItem(
  query: unknown,
  item: GuidanceItem,
  options?: RetrieveOptions,
): ScoredGuidanceItem {
  const normalizedQuery = normalizeForSearch(query);
  const queryTokens = tokenizeGuidanceQuery(query);
  const province = options?.province ? normalizeProvinceName(options.province) : null;
  const isFederallyRegulated = options?.isFederallyRegulated ?? null;

  let score = 0;

  // Keyword matching (supports accented terms by comparing unaccented forms)
  for (const keyword of item.keywords) {
    const normKw = normalizeForSearch(keyword);
    const normKwNoAccent = accentVariant(normKw);
    const normQueryNoAccent = accentVariant(normalizedQuery);
    if (normalizedQuery.includes(normKw) || normQueryNoAccent.includes(normKwNoAccent)) {
      score += 2;
    }
  }

  // Token matching in search surfaces: search_text / advisor_answer_en / title / content
  const searchTextNorm = normalizeForSearch(item.search_text ?? item.title);
  const answerNorm = normalizeForSearch(item.advisor_answer_en ?? item.content);
  for (const token of queryTokens) {
    if (searchTextNorm.includes(token)) score += 1;
    if (answerNorm.includes(token)) score += 0.5;
  }

  // Jurisdiction scoring
  // NOTE: We compare item.province (the raw tag) directly rather than the normalised form so
  // that 'ALL', 'FEDERAL', 'ON', 'QC', etc. are matched unambiguously.  The normalised form
  // of 'FEDERAL' happens to be 'federal', but 'ALL' normalises to 'all', not 'federal', so
  // using normalizeProvinceName on item.province would never accidentally double-boost ALL
  // items.  The comparison with the caller-supplied `province` still uses the normalised form
  // because that value arrives via user input and needs case-folding.
  if (province) {
    if (normalizeProvinceName(item.province) === province) {
      score += 4; // exact province match
    } else if (item.province === 'ALL') {
      score += 1; // jurisdiction-neutral — always applicable
    } else if (
      item.province === 'FEDERAL' &&
      (province === 'federal' || province === 'canada' || isFederallyRegulated === true)
    ) {
      // Federal guidance is relevant when the caller explicitly identified a federal employer
      score += 1;
    }
  } else if (isFederallyRegulated === true) {
    // No province code but employer is known-federal — boost FEDERAL items
    if (item.province === 'FEDERAL') score += 4;
    else if (item.province === 'ALL') score += 1;
  } else {
    // No province known — still allow ALL items but no jurisdiction boost
    if (item.province === 'ALL') score += 0.5;
  }

  // Penalise inactive items
  const itemAny = item as unknown as Record<string, unknown>;
  if (typeof itemAny['status'] === 'string' && itemAny['status'].toLowerCase() === 'inactive') {
    score -= 2;
  }

  // Boost high-risk items
  if (typeof itemAny['risk_level'] === 'string' && itemAny['risk_level'].toLowerCase() === 'high') {
    score += 2;
  }

  // Quality warnings reduce score
  if (Array.isArray(itemAny['qualityWarnings'])) {
    score -= (itemAny['qualityWarnings'] as unknown[]).length;
  }

  return { ...item, score };
}

/**
 * Score and rank all guidance items, returning those with score > 0 sorted descending.
 */
export function rankGuidanceItems(
  items: GuidanceItem[],
  query: unknown,
  options?: RetrieveOptions,
): ScoredGuidanceItem[] {
  const limit = options?.limit ?? 5;
  return items
    .map((item) => scoreGuidanceItem(query, item, options))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
