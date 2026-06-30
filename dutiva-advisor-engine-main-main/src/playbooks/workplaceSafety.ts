import { AdvisorPlaybook } from './types';
import { AdvisorPipelineContext } from '../workspace/workspaceTypes';
import { PlaybookContext } from './termination';

export const workplaceSafetyPlaybook: AdvisorPlaybook = {
  id: 'workplace_safety',
  topic: 'Workplace Safety and Health',
  risk: { compliance: 'high', safety: 'urgent' },
  escalationRecommended: true,
  requiredConcepts: [
    'document the safety concern or incident immediately',
    'ensure employee right to refuse unsafe work is not penalized',
    'investigate the hazard with joint health and safety committee',
    'report critical injuries to OHS regulator within required timeframes',
    'implement interim controls',
    'file WSIB or WCB claim if work-related injury occurred',
    'review and update workplace safety policy and training',
  ],
  requiredMissingFacts: [
    'province or federal jurisdiction (determines OHS regulator)',
    'whether a work-related injury has occurred',
    'whether a right-to-refuse has been exercised',
    'whether the hazard is ongoing',
  ],
  suggestedDocuments: [
    'Incident/Accident Report',
    'Right to Refuse Record',
    'JHSC Meeting Minutes',
    'WSIB/WCB Claim Form',
    'Corrective Action Plan',
  ],
  immediateSteps: [
    'Document the safety concern or incident with date, time, persons involved, and nature of hazard',
    'Ensure no employee is penalized for refusing unsafe work or reporting a hazard',
    'Involve the Joint Health and Safety Committee in the investigation',
    'Report critical injuries to the applicable OHS regulator within required timeframes',
  ],
  documentationSteps: [
    'Complete an incident report immediately',
    'Record investigation findings and corrective actions',
    'Document JHSC involvement and recommendations',
    'Retain all OHS records for the statutory retention period',
  ],
  confidentialityNotes: [
    'Witness statements in safety investigations may be subject to privilege — obtain legal advice',
  ],
  antiReprisalNotes: [
    'OHS statutes in all Canadian jurisdictions prohibit reprisal against employees who exercise safety rights',
    'Do not discipline or penalize any employee who filed a safety report or exercised the right to refuse',
  ],
};

export function getWorkplaceSafetyPlaybook(_workspace: AdvisorPipelineContext): PlaybookContext {
  return {
    topicHints: workplaceSafetyPlaybook.requiredConcepts,
    riskFlags: ['Failure to investigate safety incidents', 'Penalizing employee for refusing unsafe work', 'Inadequate hazard controls', 'Failure to report critical injury'],
    practicalSteps: workplaceSafetyPlaybook.immediateSteps,
  };
}
