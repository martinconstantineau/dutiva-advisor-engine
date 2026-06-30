import { AdvisorPlaybook } from './types';
import { AdvisorPipelineContext } from '../workspace/workspaceTypes';
import { PlaybookContext } from './termination';

export const employeeMedicalDisclosurePlaybook: AdvisorPlaybook = {
  id: 'employee_medical_disclosure',
  topic: 'Employee Medical or Mental-Health Disclosure',
  risk: { compliance: 'high', safety: 'watch' },
  escalationRecommended: false,
  requiredConcepts: [
    'sensitive medical and disability-related disclosure',
    'confidentiality and privacy obligations',
    'do not diagnose or request diagnosis',
    'do not request unnecessary medical details',
    'ask whether support, accommodation, leave, or safety response is needed',
    'assess immediate safety concerns',
    'document factually without medical speculation',
    'avoid reprisal and discrimination',
    'confirm jurisdiction and applicable legislation',
    'escalate to HR or legal counsel if complex',
  ],
  requiredMissingFacts: [
    'whether the disclosure relates to a need for accommodation or leave',
    'whether there are immediate safety concerns',
    'province or federal jurisdiction',
    'whether the employee has requested anything specific',
  ],
  suggestedDocuments: [
    'Medical Information Request Letter (functional abilities only)',
    'Accommodation Request Acknowledgement',
    'Leave Application Form',
    'Confidential Medical Information File',
  ],
  immediateSteps: [
    'Acknowledge the disclosure with sensitivity — do not minimize or over-react',
    'Clarify whether the employee is seeking support, accommodation, leave, or a safety response',
    'Assess whether there are immediate safety concerns that require urgent action',
    'Remind the employee of available supports (EAP, leaves, accommodation process)',
    'Do not request a medical diagnosis or details beyond functional limitations',
  ],
  documentationSteps: [
    'Document the date and nature of the disclosure factually and without medical speculation',
    'Record what the employee requested and what next steps were agreed',
    'Store all health-related information in a separate confidential file',
    'Limit access to medical information strictly to those with a need to know',
  ],
  confidentialityNotes: [
    'Medical and mental health information is among the most sensitive personal information',
    'Do not share the employee\'s health information with other employees including their manager without consent',
    'Obtain written consent before sharing health information with third parties including insurers',
  ],
  antiReprisalNotes: [
    'An employee disclosing mental health information or requesting accommodation must not be penalized',
    'Ensure managers are aware that any adverse action following a disclosure may constitute discrimination',
  ],
};

export function getEmployeeMedicalDisclosurePlaybook(_workspace: AdvisorPipelineContext): PlaybookContext {
  return {
    topicHints: ['medical', 'doctor note', 'disclosure', 'health', 'diagnosis', 'privacy', 'functional limitations'],
    riskFlags: employeeMedicalDisclosurePlaybook.requiredConcepts,
    practicalSteps: employeeMedicalDisclosurePlaybook.immediateSteps,
  };
}
