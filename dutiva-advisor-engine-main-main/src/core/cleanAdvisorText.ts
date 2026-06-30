/**
 * Plain-text cleanup utilities.
 *
 * The engine returns clean text. If Markdown rendering is needed later,
 * that belongs in the consuming UI with a safe renderer.
 * No plain-text field returned by the engine should contain raw `**`.
 */

/**
 * Strip raw Markdown bold/italic markers and clean up whitespace.
 * Does NOT destroy legally meaningful punctuation (periods, commas, parentheses in citations).
 */
export function cleanAdvisorText(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value
    // Remove bold/italic markers (**, *, __, _) — handle unbalanced markers too
    .replace(/\*{1,3}([^*\n]*?)\*{1,3}/g, '$1')   // **text** / *text* / ***text***
    .replace(/\*{1,3}/g, '')                          // stray/unbalanced asterisks
    // Underscore emphasis only at word boundaries — intra-word underscores in
    // identifiers like `company_name_field` are preserved (CommonMark also does
    // not treat intra-word underscores as emphasis).
    .replace(/(?<![A-Za-z0-9])__([^_\n]+?)__(?![A-Za-z0-9])/g, '$1')   // __text__
    .replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, '$1')     // _text_
    .replace(/(?<![A-Za-z0-9])_{1,2}(?![A-Za-z0-9])/g, '')             // stray boundary underscores
    // Remove markdown headings (## Heading → Heading)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove markdown list bullets that are just decoration (- item, * item)
    // Keep hyphens that are part of words or legal references (s. 5(2)(a)-(b))
    .replace(/^[\s]*[-*]\s+/gm, '')
    // Remove numbered-list markdown emphasis (1. **Step:** → 1. Step:)
    .replace(/^(\d+\.\s+)\*{1,2}([^*]+?)\*{1,2}:/gm, '$1$2:')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    // Remove trailing whitespace from lines
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/** Apply cleanAdvisorText to an array of strings */
export function cleanAdvisorTextArray(values: unknown[]): string[] {
  return values.map(cleanAdvisorText);
}

/** Truncate to maxLength characters, appending ellipsis */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Strip bold markers from a label string (e.g. "**Regular Exercise:**" → "Regular Exercise:")
 * Safe to use on citation labels — will not strip parentheses or periods.
 */
export function cleanLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\*{1,3}/g, '').replace(/_{1,2}/g, '').trim();
}
