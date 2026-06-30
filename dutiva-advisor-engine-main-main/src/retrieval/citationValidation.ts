import { LegalCitation } from './guidanceTypes';

export type CitationValidationStatus = 'valid' | 'requires_review' | 'suppressed';

export interface ValidatedCitation {
  citation: LegalCitation;
  validationStatus: CitationValidationStatus;
  qualityWarning?: string;
}

/**
 * Patterns that indicate a malformed or low-quality citation.
 * These must NEVER be returned as authoritative.
 */
const MALFORMED_SECTION_PATTERNS = [
  /^s\.\s*\(\d+\)$/i,          // "s. (3)" — bare numeric subsection without parent section
  /^s\.\s*\([a-z]+\)$/i,       // "s. (a)" — bare letter subsection without parent section
  /^s\.\s*\(\)$/i,              // "s. ()" — empty parentheses
  /^\s*\(\d+\)\s*$/,            // just "(3)"
  /^\s*\([a-z]+\)\s*$/,         // just "(a)"
  /^s\.\s*$/, // bare "s."
];

const GENERIC_STATUTE_PATTERNS = [
  /an act to consolidate/i,
  /^an act\s*$/i,
  /^legislation$/i,
  /^statute$/i,
  /^regulation$/i,
];

const SUSPICIOUS_SHORT_FORM_PATTERNS = [
  /^s\.\s*\(\d+\)/i,   // shortForm looks like a bare section
];

export function validateCitation(citation: unknown): ValidatedCitation {
  if (
    typeof citation !== 'object' ||
    citation === null ||
    typeof (citation as Record<string, unknown>)['statute'] !== 'string' ||
    typeof (citation as Record<string, unknown>)['shortForm'] !== 'string'
  ) {
    return {
      citation: { statute: 'Unknown', shortForm: 'Unknown' },
      validationStatus: 'suppressed',
      qualityWarning: 'Citation is missing required fields',
    };
  }

  const c = citation as LegalCitation;

  // Empty statute
  if (!c.statute.trim()) {
    return { citation: c, validationStatus: 'suppressed', qualityWarning: 'Citation statute is empty' };
  }

  // Generic / vague statute name
  for (const pattern of GENERIC_STATUTE_PATTERNS) {
    if (pattern.test(c.statute.trim())) {
      return { citation: c, validationStatus: 'requires_review', qualityWarning: `Generic statute name: "${c.statute}"` };
    }
  }

  // Malformed section
  if (c.section) {
    for (const pattern of MALFORMED_SECTION_PATTERNS) {
      if (pattern.test(c.section.trim())) {
        return { citation: c, validationStatus: 'requires_review', qualityWarning: `Malformed section reference: "${c.section}"` };
      }
    }
  }

  // Suspicious shortForm
  if (!c.shortForm.trim()) {
    return { citation: c, validationStatus: 'requires_review', qualityWarning: 'Citation shortForm is empty' };
  }
  for (const pattern of SUSPICIOUS_SHORT_FORM_PATTERNS) {
    if (pattern.test(c.shortForm.trim())) {
      return { citation: c, validationStatus: 'requires_review', qualityWarning: `Suspicious shortForm: "${c.shortForm}"` };
    }
  }

  return { citation: c, validationStatus: 'valid' };
}

/** Validate a list of citation objects, returning only those that pass or need review. */
export function validateCitations(citations: unknown[]): ValidatedCitation[] {
  return citations.map(validateCitation);
}

/** Legacy guard — kept for backward compatibility */
export function isValidCitation(citation: unknown): citation is LegalCitation {
  const result = validateCitation(citation);
  return result.validationStatus === 'valid';
}

export function formatCitation(citation: LegalCitation): string {
  const parts = [citation.statute];
  if (citation.section) parts.push(citation.section);
  return `${parts.join(', ')} (${citation.shortForm})`;
}

export function formatCitationList(citations: LegalCitation[]): string {
  return citations
    .map(validateCitation)
    .filter((vc) => vc.validationStatus !== 'suppressed')
    .map((vc) =>
      vc.validationStatus === 'requires_review'
        ? 'Legal citation requires review'
        : formatCitation(vc.citation),
    )
    .join('; ');
}

/**
 * Convert a raw string citation (from LLM output) to a ValidatedCitation.
 * LLM-generated citations are always marked requires_review unless they match
 * known vetted patterns.
 */
export function validateRawStringCitation(raw: string): ValidatedCitation {
  if (!raw.trim()) {
    return {
      citation: { statute: raw, shortForm: raw },
      validationStatus: 'suppressed',
      qualityWarning: 'Empty citation string',
    };
  }

  // Check for malformed section references embedded in the string
  const hasMalformedSection = MALFORMED_SECTION_PATTERNS.some((p) => p.test(raw));
  const hasGenericStatute = GENERIC_STATUTE_PATTERNS.some((p) => p.test(raw));

  if (hasMalformedSection || hasGenericStatute) {
    return {
      citation: { statute: raw, shortForm: 'Legal citation requires review' },
      validationStatus: 'requires_review',
      qualityWarning: hasMalformedSection ? 'Malformed section reference' : 'Generic statute description',
    };
  }

  // LLM-generated citations get requires_review by default
  return {
    citation: { statute: raw, shortForm: raw },
    validationStatus: 'requires_review',
    qualityWarning: 'LLM-generated citation — requires editorial review before rendering as authoritative',
  };
}

/**
 * Normalize a citation string for tolerant comparison: lowercase, drop punctuation,
 * unify section/article markers (EN + FR), collapse whitespace.
 */
function normalizeCitationText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,;:()§«»]/g, ' ')
    .replace(/\b(sections?|art(?:icle)?s?|para(?:graph)?s?|al(?:in[eé]a)?s?)\b/g, 's')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reconcile a raw LLM-cited string against the citations carried by the vetted
 * guidance items that were actually retrieved for this query.
 *
 * This is the ONLY path by which an LLM citation can become authoritative. An LLM
 * citation is never trusted on its own (validateRawStringCitation always returns
 * `requires_review`); it is promoted only when it corroborates a citation the
 * engine itself already retrieved and vetted. The match rule is deliberately
 * conservative — the vetted statute name must appear in the raw string, and a
 * vetted section number (when present) is used only as a tie-breaker to prefer the
 * most specific corroborated citation. The returned citation is the VETTED one, so
 * callers should render its canonical form, never the raw LLM text.
 *
 * Returns null when no retrieved vetted citation corroborates the raw string.
 */
export function reconcileRawCitation(raw: string, vetted: LegalCitation[]): LegalCitation | null {
  const r = normalizeCitationText(raw);
  if (!r || vetted.length === 0) return null;

  let best: LegalCitation | null = null;
  let bestScore = -1;
  for (const c of vetted) {
    const statute = normalizeCitationText(c.statute);
    // Statute must be specific enough to match safely and must appear in the raw text.
    if (statute.length < 6 || !r.includes(statute)) continue;

    // Score: 1 for a statute match; +1 when a numeric section token also appears,
    // so a section-specific corroboration is preferred over a statute-only one.
    let score = 1;
    if (c.section) {
      const sectionTokens = normalizeCitationText(c.section)
        .split(/[\s–—-]+/)
        .filter((t) => /^\d+[a-z]?$/.test(t));
      if (sectionTokens.some((t) => new RegExp(`\\b${t}\\b`).test(r))) score += 1;
    }
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
