/**
 * Guidance text normalization utilities.
 *
 * normalizeGuidanceText  – cosmetic cleanup (smart quotes, dashes, whitespace)
 * normalizeForSearch     – lowercase + diacritic strip + punctuation collapse
 * normalizeProvinceName  – province code/name → canonical search string
 * tokenizeGuidanceQuery  – split normalized query into meaningful tokens
 *
 * (Query → GuidanceCategory classification lives in
 *  ../retrieval/topicClassification — the single source of truth.)
 */

const STOP_WORDS_EN = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','can',
  'i','we','you','he','she','they','it','my','our','your','his','her','its',
  'this','that','these','those','what','which','who','how','when','where','why',
  'not','no','if','as','up','out','about','into','than','more','also',
]);

const STOP_WORDS_FR = new Set([
  'le','la','les','un','une','des','du','de','et','ou','mais','dans','sur',
  'à','au','aux','pour','par','avec','sans','se','si','en','que','qui',
  'il','elle','nous','vous','ils','elles','je','tu','mon','ma','mes',
  'ce','cet','cette','ces','quel','quelle','quels','quelles',
  'est','sont','était','étaient','être','avoir','pas','ne',
]);

/** Cosmetic normalisation: smart quotes, dashes, excess whitespace */
export function normalizeGuidanceText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2014/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize for search/scoring:
 * lowercase → strip French diacritics (NFD) → replace punctuation/hyphens with spaces → collapse whitespace → trim
 */
export function normalizeForSearch(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[-_.,:;!?()[\]{}'"/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map province codes and names to a canonical lowercase search token */
export function normalizeProvinceName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const MAP: Record<string, string> = {
    on: 'ontario', ontario: 'ontario',
    qc: 'quebec', pq: 'quebec', quebec: 'quebec', 'québec': 'quebec',
    bc: 'bc', 'british columbia': 'bc',
    ab: 'alberta', alberta: 'alberta',
    sk: 'sk', saskatchewan: 'sk',
    mb: 'mb', manitoba: 'mb',
    nb: 'nb', 'new brunswick': 'nb',
    ns: 'ns', 'nova scotia': 'ns',
    nl: 'nl', newfoundland: 'nl', 'newfoundland and labrador': 'nl',
    pe: 'pe', 'prince edward island': 'pe', pei: 'pe',
    nt: 'nt', 'northwest territories': 'nt',
    nu: 'nu', nunavut: 'nu',
    yt: 'yt', yukon: 'yt',
    federal: 'federal', federally: 'federal',
    ca: 'canada', canada: 'canada',
  };
  return MAP[raw] ?? raw;
}

/** Remove stop words and deduplicate tokens */
export function tokenizeGuidanceQuery(value: unknown): string[] {
  const normalized = normalizeForSearch(value);
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const allStops = new Set([...STOP_WORDS_EN, ...STOP_WORDS_FR]);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tokens) {
    if (!allStops.has(t) && !seen.has(t) && t.length > 1) {
      seen.add(t);
      result.push(t);
    }
  }
  return result;
}
