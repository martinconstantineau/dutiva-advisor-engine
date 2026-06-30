import { AdvisorPlaybook } from './types';
import { AdvisorPipelineContext } from '../workspace/workspaceTypes';

export const harassmentPlaybook: AdvisorPlaybook = {
  id: 'harassment',
  topic: 'Harassment and Workplace Violence',
  risk: { compliance: 'high', safety: 'urgent' },
  escalationRecommended: true,
  requiredConcepts: [
    'acknowledge complaint',
    'assess immediate safety',
    'confidentiality',
    'anti-reprisal',
    'document complaint and actions',
    'confirm jurisdiction, policy, parties, and dates',
    'assign investigator or escalate',
    'avoid premature credibility findings',
    'communicate next steps to parties',
    'preserve records',
  ],
  requiredMissingFacts: [
    'province or federal jurisdiction',
    'whether a formal complaint has been made',
    'identity of the parties (manager, co-worker, third party)',
    'dates and nature of the incidents',
    'whether there is a workplace harassment policy in place',
  ],
  suggestedDocuments: [
    'Workplace Harassment and Violence Prevention Policy',
    'Complaint Intake Form',
    'Investigation Terms of Reference',
    'Investigation Report',
    'Written Outcome Letter to Parties',
  ],
  immediateSteps: [
    'Acknowledge the complaint in writing promptly',
    'Assess whether the complainant or others face immediate safety risk',
    'Separate the parties if needed to ensure safety during the process',
    'Assign an impartial investigator (internal or external)',
    'Notify the respondent of the complaint and their right to respond',
  ],
  documentationSteps: [
    'Record date complaint was received and how it was submitted',
    'Document all communications with both parties',
    'Record all witness interviews and their statements',
    'Preserve all relevant evidence including emails, messages, and documents',
    'Document investigation findings and credibility assessments',
    'Record corrective action taken and date implemented',
  ],
  confidentialityNotes: [
    'Limit disclosure of complaint details to those with a need to know',
    'Do not share the complainant identity with anyone not involved in the investigation',
    'Remind all participants of their confidentiality obligations',
  ],
  antiReprisalNotes: [
    'Expressly remind all managers that reprisal against the complainant is prohibited',
    'Monitor the complainant\'s work situation throughout the process',
    'Document any concerns about potential reprisal actions',
  ],
};

// Legacy compat
export interface PlaybookContext { topicHints: string[]; riskFlags: string[]; practicalSteps: string[]; }
export function getHarassmentPlaybook(_workspace: AdvisorPipelineContext): PlaybookContext {
  return {
    topicHints: ['harassment', 'bullying', 'hostile work environment', 'investigation', 'complaint'],
    riskFlags: harassmentPlaybook.requiredConcepts,
    practicalSteps: harassmentPlaybook.immediateSteps,
  };
}
