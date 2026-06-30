import { AdvisorPlaybook } from './types';
import { AdvisorPipelineContext } from '../workspace/workspaceTypes';
import { PlaybookContext } from './termination';

export const leavePlaybook: AdvisorPlaybook = {
  id: 'leave',
  topic: 'Protected Leave',
  risk: { compliance: 'medium', safety: 'none' },
  escalationRecommended: false,
  requiredConcepts: [
    'confirm type of leave and applicable statutory provisions',
    'verify employee eligibility',
    'provide written confirmation of leave and expected return date',
    'clarify benefit continuation during leave',
    'maintain position or equivalent for return',
    'do not contact employee unnecessarily during leave',
    'document leave dates',
  ],
  requiredMissingFacts: [
    'province or federal jurisdiction',
    'type of leave requested',
    'employee length of service',
    'whether EI benefits apply',
  ],
  suggestedDocuments: [
    'Leave Approval Letter',
    'Leave Schedule',
    'Benefits Continuation Notice',
    'Return to Work Plan',
  ],
  immediateSteps: [
    'Confirm the type of leave and applicable statutory entitlements in the jurisdiction',
    'Verify employee eligibility for the requested leave',
    'Provide written confirmation of leave approval and expected return date',
    'Clarify whether benefits continue during leave',
  ],
  documentationSteps: [
    'Record leave start date, expected return date, and type of leave',
    'Document all communications about the leave',
    'Record actual return date and any extensions',
  ],
  confidentialityNotes: [
    'Do not disclose the reason for leave to co-workers',
    'Treat medical or personal reasons for leave as confidential',
  ],
  antiReprisalNotes: [
    'Do not discipline, demote, or terminate an employee for taking or requesting protected leave',
    'Ensure the employee returns to their position or an equivalent position',
  ],
};

export function getLeavePlaybook(_workspace: AdvisorPipelineContext): PlaybookContext {
  return {
    topicHints: leavePlaybook.requiredConcepts,
    riskFlags: ['Terminating or disciplining employee on protected leave', 'Failing to reinstate employee after leave', 'Denying a statutory leave entitlement'],
    practicalSteps: leavePlaybook.immediateSteps,
  };
}
