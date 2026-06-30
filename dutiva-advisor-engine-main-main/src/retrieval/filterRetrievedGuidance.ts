import { ScoredGuidanceItem, GuidanceCategory } from './guidanceTypes';
import { topicCategoriesFromIntent } from './topicClassification';

// ─── Repeal-bracket stripping ────────────────────────────────────────────────

/**
 * Matches repeal/abrogation bracket text of the form:
 *   [Repealed, SOR/2019-168, s. 2]
 *   [Repealed]
 *   [Abrogé, DORS/2019-168, art. 2]
 *   [Abrogée]
 *
 * The pattern is intentionally permissive so it catches variants seen in
 * Justice Canada XML exports.
 */
const REPEAL_BRACKET_RE = /\[(?:Repealed|Abrog[eé][e]?)[^\]]*\]/gi;

/**
 * Strip repeal-bracket text from a string and normalise resulting whitespace.
 * Returns the cleaned string, or an empty string if the entire value was bracketed.
 */
function stripRepealBrackets(value: string): string {
  return value.replace(REPEAL_BRACKET_RE, '').replace(/\s{2,}/g, ' ').trim();
}

// ─── Topic-alignment helpers ──────────────────────────────────────────────────

/**
 * Determine whether a guidance item's category is aligned with the query topic
 * categories and route intent.
 *
 * Resolution order:
 *  1. If queryCategories is non-empty, use it directly.
 *  2. If queryCategories is empty but routeIntent is specific, derive from intent.
 *  3. If both are empty/general, allow all items (no narrowing).
 *
 * An item is topic-aligned if:
 *  - The effective category set is empty → allow all (general query)
 *  - The item's category is 'general' → always relevant background
 *  - The item's category is in the effective category set
 *  - Cross-category allowance: accommodation ↔ medical_disclosure
 */
function isTopicAligned(
  item: ScoredGuidanceItem,
  queryCategories: GuidanceCategory[],
  routeIntent?: string,
): boolean {
  let effectiveCategories = queryCategories;
  if (effectiveCategories.length === 0 && routeIntent) {
    effectiveCategories = topicCategoriesFromIntent(routeIntent);
  }

  if (effectiveCategories.length === 0) return true;
  if (item.category === 'general') return true;
  if (effectiveCategories.includes(item.category)) return true;

  // Cross-category allowance: accommodation ↔ medical_disclosure
  if (
    (item.category === 'accommodation' && effectiveCategories.includes('medical_disclosure')) ||
    (item.category === 'medical_disclosure' && effectiveCategories.includes('accommodation'))
  ) {
    return true;
  }

  return false;
}

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Jurisdiction context passed to the filter.  Mirrors the fields from
 * AdvisorJurisdiction / AdvisorPipelineContext that the filter needs.
 */
export interface FilterJurisdiction {
  /** 'known' | 'unknown' | 'assumed' | 'not_applicable' */
  status: string;
  province?: string | null;
  isFederallyRegulated?: boolean | null;
}

export interface FilterGuidanceOptions {
  /**
   * Resolved jurisdiction — used to perform jurisdiction-safety filtering.
   * If omitted the filter only performs repeal-bracket stripping.
   */
  jurisdiction?: FilterJurisdiction;
  /**
   * Whether the request context has unresolved conflicts (e.g. province
   * supplied in two places with conflicting values).  When true, only
   * ALL-province items are kept, same as unknown jurisdiction.
   */
  hasConflict?: boolean;
  /**
   * Query-level topic categories detected from the user message.
   * Derived by getQueryTopicCategories() in composeAdvisorResponse.ts.
   */
  queryCategories?: GuidanceCategory[];
  /**
   * Route intent — used as a fallback topic signal when queryCategories is empty.
   */
  routeIntent?: string;
}

export interface FilterGuidanceResult {
  /** Items that passed all filters, with repeal brackets stripped. */
  items: ScoredGuidanceItem[];
  /** Human-readable warning messages for quality.warnings and debug. */
  warnings: string[];
  /** Count of items removed by the jurisdiction filter. */
  jurisdictionWithheld: number;
  /** Count of items removed by the topic-alignment filter. */
  topicWithheld: number;
  /** Count of items removed because content was empty after repeal stripping. */
  repealStripped: number;
}

// ─── Core filter ──────────────────────────────────────────────────────────────

/**
 * Full pre-prompt safety filter applied to every batch of scored guidance items
 * immediately before they are injected into the LLM prompt AND before building
 * workspace.retrievedGuidance.
 *
 * This is the authoritative single safety boundary for guidance reaching
 * buildAdvisorPrompt().  buildWorkspace() then receives the already-filtered
 * items and converts them to AdvisorRetrievedGuidanceItem without re-filtering.
 *
 * Three layers apply in order:
 *
 * 1. **Repeal-bracket stripping** (defense-in-depth)
 *    Items whose `content` becomes empty after stripping [Repealed…] / [Abrogé…]
 *    brackets are dropped entirely.  Items with brackets only in search_text or
 *    advisor_answer_en are cleaned and retained.
 *
 * 2. **Jurisdiction filter**
 *    - Unknown / conflicted jurisdiction → keep only province === 'ALL' items.
 *    - Known federal jurisdiction (`isFederallyRegulated === true` or
 *      `province === 'FEDERAL'`) → keep ALL and FEDERAL items.
 *    - Known provincial (non-federal) jurisdiction → keep ALL and matching province;
 *      exclude `federalOnly === true` items unless `isFederallyRegulated === true`.
 *    - No jurisdiction supplied → skip jurisdiction filter (only strip brackets).
 *
 * 3. **Topic-alignment filter**
 *    Uses `queryCategories` (query-level) with `routeIntent` as fallback.
 *    Items whose category is not aligned with the effective category set are
 *    removed.  'general' items always pass.  No narrowing when both are empty.
 *
 * The function is pure (no side effects) and never throws.
 */
export function filterRetrievedGuidanceForPromptAndWorkspace(
  items: ScoredGuidanceItem[],
  options: FilterGuidanceOptions = {},
): FilterGuidanceResult {
  const warnings: string[] = [];
  let repealStripped = 0;
  let jurisdictionWithheld = 0;
  let topicWithheld = 0;

  // ── Layer 1: Repeal-bracket stripping ───────────────────────────────────────
  const afterRepeal: ScoredGuidanceItem[] = [];
  for (const item of items) {
    const cleanContent = stripRepealBrackets(item.content);
    if (!cleanContent) {
      repealStripped++;
      continue;
    }

    const rawSearchText = item.search_text ?? item.content;
    const cleanSearchText = stripRepealBrackets(rawSearchText);
    const effectiveSearchText = cleanSearchText || cleanContent;

    const rawAnswer = item.advisor_answer_en ?? item.content;
    const cleanAnswer = stripRepealBrackets(rawAnswer);
    const effectiveAnswer = cleanAnswer || cleanContent;

    afterRepeal.push({
      ...item,
      content: cleanContent,
      search_text: effectiveSearchText,
      advisor_answer_en: effectiveAnswer,
    });
  }

  // ── Layer 2: Jurisdiction filter ────────────────────────────────────────────
  const { jurisdiction, hasConflict = false } = options;

  let afterJurisdiction: ScoredGuidanceItem[];
  if (!jurisdiction) {
    // No jurisdiction supplied — skip jurisdiction filter
    afterJurisdiction = afterRepeal;
  } else {
    const isJurisdictionSafe =
      jurisdiction.status === 'known' || jurisdiction.status === 'assumed';

    if (!isJurisdictionSafe || hasConflict) {
      // Unknown/conflicted → keep only jurisdiction-neutral items
      afterJurisdiction = afterRepeal.filter((g) => g.province === 'ALL');
      const withheld = afterRepeal.length - afterJurisdiction.length;
      if (withheld > 0) {
        jurisdictionWithheld += withheld;
        warnings.push(
          'Jurisdiction-specific retrieved guidance was withheld until jurisdiction is confirmed.',
        );
      }
    } else {
      // Jurisdiction is known — apply province/federal filter
      const prov = jurisdiction.province;
      const isFederal =
        prov === 'FEDERAL' || jurisdiction.isFederallyRegulated === true;

      afterJurisdiction = afterRepeal.filter((g) => {
        if (g.province === 'ALL') return true;
        if (isFederal) return g.province === 'FEDERAL';
        // Provincial: keep matching province; exclude other provinces and FEDERAL-only items
        if (g.federalOnly) return false;
        return g.province === prov;
      });

      const withheld = afterRepeal.length - afterJurisdiction.length;
      if (withheld > 0) {
        jurisdictionWithheld += withheld;
        warnings.push(
          `Retrieved guidance for other jurisdictions was withheld (jurisdiction: ${prov ?? 'unknown'}).`,
        );
      }
    }
  }

  // ── Layer 3: Topic-alignment filter ────────────────────────────────────────
  const { queryCategories = [], routeIntent } = options;

  const afterTopic = afterJurisdiction.filter((g) =>
    isTopicAligned(g, queryCategories, routeIntent),
  );

  const topicDiff = afterJurisdiction.length - afterTopic.length;
  if (topicDiff > 0) {
    topicWithheld += topicDiff;
    warnings.push(
      'Retrieved guidance for unrelated topics was withheld (topic-alignment filter).',
    );
  }

  return {
    items: afterTopic,
    warnings,
    jurisdictionWithheld,
    topicWithheld,
    repealStripped,
  };
}


