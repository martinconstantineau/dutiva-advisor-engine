/**
 * Bilingual localization for guidance items.
 *
 * This is the single place that decides which language's text to serve for a given
 * locale, so retrieval, prompt-building, and the deterministic fallbacks all behave
 * consistently. It also finally wires in the two bilingual primitives that were
 * previously unused: the FR terminology map (`frenchTerminology`) and the localized
 * string table (`locale`).
 *
 * Fallback rule everywhere: when locale === 'fr' and validated French text exists,
 * use it; otherwise fall back to the validated English text (never a placeholder).
 */
import type { Locale } from '../workspace/workspaceTypes';
import type { GuidanceItem } from '../retrieval/guidanceTypes';
import { translateTerm } from './frenchTerminology';
import { t, isValidLocale } from './locale';

export { t, isValidLocale, translateTerm };

/** Guidance content in the requested locale, falling back to validated English. */
export function localizedContent(
  item: Pick<GuidanceItem, 'content' | 'content_fr'>,
  locale: Locale,
): string {
  return locale === 'fr' && item.content_fr ? item.content_fr : item.content;
}

/** Guidance title in the requested locale, falling back to English. */
export function localizedTitle(
  item: Pick<GuidanceItem, 'title' | 'title_fr'>,
  locale: Locale,
): string {
  return locale === 'fr' && item.title_fr ? item.title_fr : item.title;
}

/**
 * Advisor answer text in the requested locale, preferring the most specific
 * validated field and falling back through to English content.
 */
export function localizedAnswer(
  item: Pick<GuidanceItem, 'content' | 'content_fr' | 'advisor_answer_en' | 'advisor_answer_fr'>,
  locale: Locale,
): string {
  if (locale === 'fr') {
    return item.advisor_answer_fr ?? item.content_fr ?? item.advisor_answer_en ?? item.content;
  }
  return item.advisor_answer_en ?? item.content;
}

/**
 * Derive French search text from an item's (often English) keywords using the shared
 * FR terminology map, appended to any authored French search text. Groundwork for
 * bilingual retrieval: lets a French query match an item whose keywords are authored
 * in English. Returns a de-duplicated, space-joined string.
 */
export function deriveFrenchSearchText(keywords: string[], authoredFr?: string): string {
  const translated = keywords
    .map((k) => translateTerm(k))
    .filter((fr, i) => fr.toLowerCase() !== keywords[i].toLowerCase());
  const parts = [authoredFr, ...translated].filter((v): v is string => Boolean(v));
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of parts.join(' ').split(/\s+/)) {
    const key = p.toLowerCase();
    if (p && !seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }
  return deduped.join(' ').trim();
}
