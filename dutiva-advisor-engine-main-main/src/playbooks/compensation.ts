import { AdvisorPlaybook } from './types';
import { AdvisorPipelineContext } from '../workspace/workspaceTypes';
import { PlaybookContext } from './termination';

export const compensationPlaybook: AdvisorPlaybook = {
  id: 'compensation',
  topic: 'Pay, Hours, and Compensation',
  risk: { compliance: 'medium', safety: 'none' },
  escalationRecommended: false,
  requiredConcepts: [
    'verify applicable minimum wage rate for province and employee classification',
    'confirm overtime thresholds and calculate overtime pay',
    'review permissible and impermissible payroll deductions',
    'check equal pay obligations',
    'ensure all compensation is documented in the employment contract',
  ],
  requiredMissingFacts: [
    'province or federal jurisdiction',
    'employee classification (hourly, salaried, commission)',
    'hours worked in the relevant period',
    'whether overtime was authorized or unauthorized',
  ],
  suggestedDocuments: [
    'Pay Statement / Wage Statement',
    'Overtime Authorization Policy',
    'Employment Contract (compensation section)',
  ],
  immediateSteps: [
    'Identify the applicable minimum wage and overtime rules for the jurisdiction',
    'Review time records to confirm hours worked',
    'Calculate any outstanding wages or overtime owed',
    'Correct any underpayment promptly',
  ],
  documentationSteps: [
    'Retain time records and pay statements for the statutory period',
    'Document any corrections made to payroll',
  ],
  confidentialityNotes: [
    'Pay equity and wage information may be sensitive — limit disclosure appropriately',
  ],
  antiReprisalNotes: [
    'Employees have the right to inquire about wages without reprisal',
    'Pay equity complaints are protected activities in all Canadian jurisdictions',
  ],
};

export function getCompensationPlaybook(_workspace: AdvisorPipelineContext): PlaybookContext {
  return {
    topicHints: compensationPlaybook.requiredConcepts,
    riskFlags: ['Wages below minimum wage', 'Unpaid overtime', 'Illegal deductions from wages', 'Pay equity violations'],
    practicalSteps: compensationPlaybook.immediateSteps,
  };
}
