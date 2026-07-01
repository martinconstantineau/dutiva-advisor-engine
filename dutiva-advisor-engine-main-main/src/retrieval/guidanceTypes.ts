import { Province } from '../workspace/workspaceTypes';

export type GuidanceCategory =
  | 'termination'
  | 'harassment'
  | 'accommodation'
  | 'leave'
  | 'compensation'
  | 'reprisal'
  | 'workplace_safety'
  | 'medical_disclosure'
  | 'general';

export interface GuidanceItem {
  id: string;
  category: GuidanceCategory;
  province: Province | 'ALL';
  title: string;
  /** Optional validated French title, rendered when locale === 'fr'. */
  title_fr?: string;
  content: string;
  /** Optional validated French content, served when locale === 'fr'. Falls back to English when absent. */
  content_fr?: string;
  /** Optional search-optimized text (e.g. retrieval.search_text). */
  search_text?: string;
  /** Optional French search text for bilingual retrieval (groundwork — see localizeGuidance). */
  search_text_fr?: string;
  /** Optional canonical answer text (e.g. advisor_answer_en). */
  advisor_answer_en?: string;
  /** Optional validated French answer text (e.g. advisor_answer_fr from a bilingual source). */
  advisor_answer_fr?: string;
  citations: LegalCitation[];
  keywords: string[];
  federalOnly?: boolean;
}

export interface LegalCitation {
  statute: string;
  section?: string;
  shortForm: string;
  url?: string;
}

export interface ScoredGuidanceItem extends GuidanceItem {
  score: number;
}
