/**
 * Playbook registry.
 *
 * Maps a resolved route intent to the curated AdvisorPlaybook for that topic.
 * The composition pipeline uses this to populate workspace fields that are not
 * produced by the LLM — confidentiality reminders, anti-reprisal reminders, and
 * suggested documents — from vetted, hand-written content.
 */
import { AdvisorPlaybook } from './types';
import { AdvisorIntent } from '../workspace/workspaceTypes';
import { harassmentPlaybook } from './harassment';
import { terminationPlaybook } from './termination';
import { leavePlaybook } from './leave';
import { compensationPlaybook } from './compensation';
import { accommodationPlaybook } from './accommodation';
import { employeeMedicalDisclosurePlaybook } from './employeeMedicalDisclosure';
import { reprisalPlaybook } from './reprisal';
import { workplaceSafetyPlaybook } from './workplaceSafety';

const PLAYBOOK_BY_INTENT: Partial<Record<AdvisorIntent, AdvisorPlaybook>> = {
  harassment_or_workplace_violence: harassmentPlaybook,
  termination_or_discipline: terminationPlaybook,
  leave_or_absence: leavePlaybook,
  pay_hours_or_entitlements: compensationPlaybook,
  employee_medical_or_accommodation: accommodationPlaybook,
};

/**
 * Return the curated playbook for a route intent, or undefined when no playbook
 * is mapped (e.g. document_drafting, general_hr_compliance, privacy).
 */
export function getPlaybookForIntent(intent: AdvisorIntent): AdvisorPlaybook | undefined {
  return PLAYBOOK_BY_INTENT[intent];
}

export {
  harassmentPlaybook,
  terminationPlaybook,
  leavePlaybook,
  compensationPlaybook,
  accommodationPlaybook,
  employeeMedicalDisclosurePlaybook,
  reprisalPlaybook,
  workplaceSafetyPlaybook,
};
