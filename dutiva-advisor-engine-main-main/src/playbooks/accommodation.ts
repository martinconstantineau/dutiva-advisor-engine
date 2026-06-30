import { AdvisorPlaybook } from './types';
import { AdvisorPipelineContext } from '../workspace/workspaceTypes';
import { PlaybookContext } from './termination';

export const accommodationPlaybook: AdvisorPlaybook = {
  id: 'accommodation',
  topic: 'Accommodation and Disability',
  risk: { compliance: 'high', safety: 'watch' },
  escalationRecommended: false,
  requiredConcepts: [
    'acknowledge the accommodation request promptly',
    'request functional limitations not diagnosis',
    'duty to accommodate to the point of undue hardship',
    'collaborative process with the employee',
    'explore all reasonable accommodation options',
    'document all steps taken',
    'set review dates',
    'only conclude undue hardship after thorough documented analysis',
  ],
  requiredMissingFacts: [
    'province or federal jurisdiction',
    'nature of functional limitations',
    'whether a physician functional abilities form has been requested',
    'accommodation options already explored',
    'whether the employee has participated in the process',
  ],
  suggestedDocuments: [
    'Accommodation Request Acknowledgement Letter',
    'Physician Functional Abilities Form',
    'Accommodation Plan',
    'Accommodation Review Record',
  ],
  immediateSteps: [
    'Acknowledge the accommodation request in writing promptly',
    'Request functional limitations from the employee\'s treating physician (not diagnosis)',
    'Explore all reasonable accommodation options collaboratively with the employee',
    'Document all options considered and why each was accepted or rejected',
  ],
  documentationSteps: [
    'Record date accommodation request was received',
    'Document all communications with the employee and their physician',
    'Record all accommodation options explored',
    'Document the accommodation plan and any modifications',
    'Record review dates and outcomes',
  ],
  confidentialityNotes: [
    'Store medical information in a separate confidential file, not the personnel file',
    'Limit access to medical information on a strict need-to-know basis',
  ],
  antiReprisalNotes: [
    'Ensure the accommodation request does not negatively affect the employee\'s employment status',
    'Do not use accommodation as a factor in performance evaluations',
  ],
};

export function getAccommodationPlaybook(_workspace: AdvisorPipelineContext): PlaybookContext {
  return {
    topicHints: accommodationPlaybook.requiredConcepts,
    riskFlags: ['Failure to engage in accommodation process', 'Requesting confidential medical diagnosis', 'Premature conclusion of undue hardship'],
    practicalSteps: accommodationPlaybook.immediateSteps,
  };
}
