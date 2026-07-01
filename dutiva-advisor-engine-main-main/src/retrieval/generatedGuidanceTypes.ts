// Narrow string union types
export type GeneratedGuidanceStatus = 'active_or_current_unknown' | 'inactive_or_repealed';
export type GeneratedGuidanceLanguage = 'en' | 'fr' | 'unknown';
export type GeneratedGuidanceRiskLevel = 'low' | 'medium' | 'high';
export type GeneratedGuidanceAppliesTo = 'employer' | 'employee' | 'union' | 'regulator';

export interface GeneratedGuidanceGuardrails {
  disclaimer_en: string;
  disclaimer_fr: string;
  requires_escalation: boolean;
  do_not_present_as_legal_advice: boolean;
  verify_current_law_before_use: boolean;
}

export interface GeneratedGuidanceRetrieval {
  search_text: string;
  references: Array<{ raw: string; target_label: string; index: number }>;
  xml_path: string | null;
}

export interface GeneratedGuidanceMetadata {
  normalizer_version: string | null;
  parser_version: string | null;
  quality_warnings: string[];
  source_content_hash: string | null;
}

export interface GeneratedGuidanceCard {
  id: string;
  source_normalized_id: string;
  source_record_id: string;
  source_file: string;
  guidance_version: string;
  jurisdiction: string;
  language: GeneratedGuidanceLanguage;
  topic: string;
  topics: string[];
  risk_level: GeneratedGuidanceRiskLevel;
  applies_to: GeneratedGuidanceAppliesTo[];
  law_title: string;
  citation: string;
  status: GeneratedGuidanceStatus;
  user_questions: string[];
  advisor_answer_en: string;
  advisor_answer_fr_placeholder: string;
  /**
   * Optional validated French answer, populated by build-guidance-layer when the
   * source record is French-language. Absent (or equal to the placeholder) for the
   * current all-English federal corpus. The adapter promotes it to content_fr only
   * when it is real French (not the placeholder).
   */
  advisor_answer_fr?: string;
  legal_basis: string[];
  guardrails: GeneratedGuidanceGuardrails;
  retrieval: GeneratedGuidanceRetrieval;
  metadata: GeneratedGuidanceMetadata;
  // Optional enrichment fields added by the index pipeline (build-guidance-index-keyword.ts,
  // build-guidance-embeddings.ts). Present in advisor-guidance-index.json but absent from
  // the raw guidance layer output produced by build-guidance-layer.ts.
  embedding_id?: string;
  embedding_text?: string;
  embedding?: number[];
}

export interface GeneratedGuidanceIndex {
  generated_at: string;
  embeddings_version: string;
  model: string;
  dimensions: number;
  manifest?: Record<string, unknown>;
  guidance: GeneratedGuidanceCard[];
}

/**
 * Type guard: check if a raw unknown value is a valid GeneratedGuidanceCard.
 * Validates required string fields and status values only.
 * Returns false (suppresses) rather than throwing.
 */
export function isGeneratedGuidanceCard(value: unknown): value is GeneratedGuidanceCard {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const v = value as Record<string, unknown>;

  // Required non-empty string fields
  const requiredStrings: string[] = [
    'id',
    'source_normalized_id',
    'source_record_id',
    'source_file',
    'guidance_version',
    'jurisdiction',
    'law_title',
    'citation',
    'advisor_answer_en',
  ];
  for (const field of requiredStrings) {
    if (typeof v[field] !== 'string' || (v[field] as string).length === 0) {
      return false;
    }
  }

  // status must be one of the two known values
  if (v['status'] !== 'active_or_current_unknown' && v['status'] !== 'inactive_or_repealed') {
    return false;
  }

  // language must be 'en', 'fr', or 'unknown'
  if (v['language'] !== 'en' && v['language'] !== 'fr' && v['language'] !== 'unknown') {
    return false;
  }

  // topics, user_questions, legal_basis must be arrays
  if (!Array.isArray(v['topics'])) return false;
  if (!Array.isArray(v['user_questions'])) return false;
  if (!Array.isArray(v['legal_basis'])) return false;

  // metadata must be an object with a quality_warnings array
  if (typeof v['metadata'] !== 'object' || v['metadata'] === null) return false;
  const metadata = v['metadata'] as Record<string, unknown>;
  if (!Array.isArray(metadata['quality_warnings'])) return false;

  // retrieval must be an object with a search_text string
  if (typeof v['retrieval'] !== 'object' || v['retrieval'] === null) return false;
  const retrieval = v['retrieval'] as Record<string, unknown>;
  if (typeof retrieval['search_text'] !== 'string') return false;

  return true;
}
