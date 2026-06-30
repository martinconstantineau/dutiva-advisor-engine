import { GuidanceCategory, GuidanceItem, LegalCitation } from './guidanceTypes';
import { GeneratedGuidanceCard } from './generatedGuidanceTypes';
import { Province } from '../workspace/workspaceTypes';

// Patterns that indicate an invalid bare-subsection citation (e.g. "s. (a)" or "s. (3)")
const BARE_SUBSECTION_CITATION = /,\s*s\.\s*\([\da-z]+\)\s*$/i;
// French placeholder marker — must never be exposed to users
const FRENCH_PLACEHOLDER_MARKER = 'Résumé français complet à générer';

/**
 * Map a generated guidance topic to a runtime GuidanceCategory.
 * Unrecognized topics become 'general'.
 */
function topicToCategory(topic: string): GuidanceCategory {
  const t = topic.toLowerCase().trim();
  if (t === 'termination') return 'termination';
  if (t === 'harassment') return 'harassment';
  if (t === 'accommodation') return 'accommodation';
  if (t === 'leave') return 'leave';
  if (t === 'compensation' || t === 'hours of work') return 'compensation';
  if (t === 'workplace safety') return 'workplace_safety';
  if (t === 'records and notices' || t === 'hiring') return 'general';
  if (t === 'reprisal') return 'reprisal';
  return 'general';
}

/**
 * Map a generated guidance jurisdiction string to the runtime Province code.
 * Only maps known federal string to FEDERAL. Returns null for unknown.
 */
function jurisdictionToProvince(jurisdiction: string): Province | 'ALL' | null {
  const j = jurisdiction.toLowerCase().trim();
  if (j === 'canada (federal)' || j === 'federal' || j === 'canada federal') return 'FEDERAL';
  if (j === 'ontario') return 'ON';
  if (j === 'quebec' || j === 'québec') return 'QC';
  return null;
}

/**
 * Build LegalCitation objects from a GeneratedGuidanceCard.
 * - Suppresses citations that are bare subsections (e.g. "s. (a)" or "s. (3)").
 * - Deduplicates law_title vs citation to avoid redundant entries.
 */
function buildCitations(card: GeneratedGuidanceCard): LegalCitation[] {
  const citations: LegalCitation[] = [];

  if (card.citation && !BARE_SUBSECTION_CITATION.test(card.citation)) {
    // Split law title from section: "Canada Labour Code, s. 230(1)" → statute + section
    const commaIdx = card.citation.indexOf(', s. ');
    if (commaIdx !== -1) {
      citations.push({
        statute: card.citation.slice(0, commaIdx).trim(),
        section: card.citation.slice(commaIdx + 2).trim(),
        shortForm: card.law_title,
      });
    } else {
      citations.push({
        statute: card.citation,
        shortForm: card.law_title,
      });
    }
  } else if (card.law_title) {
    // Fallback: use law_title only if citation was suppressed
    citations.push({
      statute: card.law_title,
      shortForm: card.law_title,
    });
  }

  return citations;
}

/**
 * Convert a validated GeneratedGuidanceCard to a runtime GuidanceItem.
 *
 * Returns null if the card cannot be safely adapted (e.g. no usable province mapping,
 * invalid citation, or French placeholder content leaking into advisor_answer_en).
 *
 * Safety gates applied:
 * - advisor_answer_en must not contain the French placeholder marker
 * - citation must not be a bare subsection (already filtered in buildCitations)
 * - province mapping must resolve (null means drop the record)
 */
export function adaptGeneratedGuidanceCard(card: GeneratedGuidanceCard): GuidanceItem | null {
  // Gate: ensure advisor_answer_en is not French placeholder
  if (card.advisor_answer_en.includes(FRENCH_PLACEHOLDER_MARKER)) {
    return null;
  }

  const province = jurisdictionToProvince(card.jurisdiction);
  if (province === null) {
    // Unknown jurisdiction — do not expose to runtime retrieval
    return null;
  }

  const category = topicToCategory(card.topic);
  const citations = buildCitations(card);

  // Build keywords from topic + topics array
  const keywordSet = new Set<string>([
    card.topic.toLowerCase(),
    ...card.topics.map((t) => t.toLowerCase()),
    card.law_title.toLowerCase(),
  ]);
  const keywords = [...keywordSet].filter(Boolean);

  const item: GuidanceItem = {
    id: card.id,
    category,
    province,
    title: `${card.topic}: ${card.citation || card.law_title}`,
    content: card.advisor_answer_en,
    search_text: card.retrieval.search_text || card.advisor_answer_en,
    advisor_answer_en: card.advisor_answer_en,
    citations,
    keywords,
    federalOnly: province === 'FEDERAL',
  };

  // Attach quality warnings — runtime scoring uses these
  const itemWithWarnings = item as GuidanceItem & { qualityWarnings?: string[]; status?: string; risk_level?: string };
  itemWithWarnings.qualityWarnings = card.metadata.quality_warnings ?? [];
  itemWithWarnings.status = card.status;
  itemWithWarnings.risk_level = card.risk_level;

  return item;
}

/**
 * Adapt all cards from a loaded index to runtime GuidanceItems.
 * Cards that fail adaptation are silently dropped (already logged by loader).
 */
export function adaptGeneratedGuidanceCards(cards: GeneratedGuidanceCard[]): GuidanceItem[] {
  const result: GuidanceItem[] = [];
  for (const card of cards) {
    const item = adaptGeneratedGuidanceCard(card);
    if (item !== null) {
      result.push(item);
    }
  }
  return result;
}
