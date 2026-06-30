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
  content: string;
  /** Optional search-optimized text (e.g. retrieval.search_text). */
  search_text?: string;
  /** Optional canonical answer text (e.g. advisor_answer_en). */
  advisor_answer_en?: string;
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
