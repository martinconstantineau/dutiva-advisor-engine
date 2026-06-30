import { AdvisorPlaybook } from './types';
import { AdvisorPipelineContext } from '../workspace/workspaceTypes';
import { PlaybookContext } from './termination';

export const reprisalPlaybook: AdvisorPlaybook = {
  id: 'reprisal',
  topic: 'Reprisal and Retaliation',
  risk: { compliance: 'high', safety: 'watch' },
  escalationRecommended: true,
  requiredConcepts: [
    'document timeline of protected activity and adverse action',
    'assess whether there is a legitimate non-retaliatory reason for the adverse action',
    'ensure decision-makers were not aware of the protected activity',
    'review communications surrounding the adverse action',
    'consider reversing or suspending the adverse action pending review',
    'train managers on reprisal prohibitions',
  ],
  requiredMissingFacts: [
    'province or federal jurisdiction',
    'nature of the protected activity',
    'date of the protected activity',
    'date and nature of the adverse action',
    'whether the decision-maker knew about the protected activity',
  ],
  suggestedDocuments: [
    'Reprisal Complaint Form',
    'Timeline of Events',
    'Manager Communication Review',
  ],
  immediateSteps: [
    'Document the timeline of the protected activity and the subsequent adverse action',
    'Assess whether there is a legitimate non-retaliatory business reason',
    'Consider suspending the adverse action pending legal review',
    'Ensure the complainant is aware of anti-reprisal protections',
  ],
  documentationSteps: [
    'Preserve all records related to the adverse action decision',
    'Document who made the decision and what information they had at the time',
  ],
  confidentialityNotes: [
    'Handle reprisal complaints confidentially to protect the complainant',
  ],
  antiReprisalNotes: [
    'Further adverse action during a reprisal investigation compounds legal risk significantly',
    'Seek legal advice before taking any additional actions against the employee',
  ],
};

export function getReprisalPlaybook(_workspace: AdvisorPipelineContext): PlaybookContext {
  return {
    topicHints: reprisalPlaybook.requiredConcepts,
    riskFlags: reprisalPlaybook.requiredConcepts,
    practicalSteps: reprisalPlaybook.immediateSteps,
  };
}
