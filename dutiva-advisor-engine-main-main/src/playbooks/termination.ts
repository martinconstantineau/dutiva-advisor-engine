import { AdvisorPlaybook } from './types';
import { AdvisorPipelineContext } from '../workspace/workspaceTypes';

export interface PlaybookContext { topicHints: string[]; riskFlags: string[]; practicalSteps: string[]; }

export const terminationPlaybook: AdvisorPlaybook = {
  id: 'termination',
  topic: 'Termination and Discipline',
  risk: { compliance: 'high', safety: 'none' },
  escalationRecommended: true,
  requiredConcepts: [
    'review employment contract for termination provisions',
    'calculate statutory minimum notice or pay in lieu',
    'assess common law reasonable notice (Bardal factors)',
    'prepare written termination letter',
    'provide Record of Employment',
    'secure company property and revoke system access',
  ],
  requiredMissingFacts: [
    'province or federal jurisdiction',
    'length of service',
    'whether termination is with or without cause',
    'whether the employee is in a protected group or on protected leave',
    'whether a written employment contract exists',
    'whether the workplace is unionized',
  ],
  suggestedDocuments: [
    'Termination Letter',
    'Record of Employment (ROE)',
    'Termination Agreement and Release (if applicable)',
    'Progressive Discipline Record (if cause)',
  ],
  immediateSteps: [
    'Confirm whether termination is without cause or for cause',
    'Calculate ESA minimum notice and severance for the jurisdiction',
    'Review contract for any without-cause or for-cause provisions',
    'Assess common law reasonable notice risk',
    'Prepare written termination letter with clear entitlements',
  ],
  documentationSteps: [
    'Document the reason for termination decision and who approved it',
    'Record all communications leading up to the termination',
    'File the Record of Employment within required timeframes',
    'Retain all termination-related documents for statutory limitation periods',
  ],
  confidentialityNotes: [
    'Limit internal disclosure of the termination decision to those who need to know',
    'Do not disclose the reason for termination to third parties without consent',
  ],
  antiReprisalNotes: [
    'Confirm the termination is not connected to any protected activity (complaint, leave, human rights ground)',
    'If temporal proximity exists between a complaint and the termination, seek legal advice before proceeding',
  ],
};

export function getTerminationPlaybook(workspace: AdvisorPipelineContext): PlaybookContext {
  const steps = [...terminationPlaybook.immediateSteps];
  if (workspace.isFederallyRegulated) {
    steps.push('Check unjust dismissal provisions under Canada Labour Code Part III for employees with 12+ months service');
  }
  if (workspace.unionized) {
    steps.push('Review collective agreement grievance and arbitration provisions before proceeding');
  }
  return {
    topicHints: ['notice period', 'severance', 'just cause', 'without cause', 'constructive dismissal'],
    riskFlags: ['Insufficient notice or pay in lieu', 'Termination during protected leave', 'Potential human rights violation', 'Retaliation or reprisal allegation'],
    practicalSteps: steps,
  };
}
