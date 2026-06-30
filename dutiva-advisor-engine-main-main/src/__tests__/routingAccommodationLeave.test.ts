/// <reference types="vitest/globals" />
/**
 * Routing tests — accommodation/disability and leave route precision.
 *
 * Covers:
 *
 * Fix 1 — Accommodation/disability/medical-restriction routing:
 *   - "An employee asked for accommodation because of a medical condition" → employee_medical_or_accommodation
 *   - "An employee requested accommodation for a disability" → employee_medical_or_accommodation
 *   - "What should we do with medical restrictions and modified duties?" → employee_medical_or_accommodation
 *   - "What is the duty to accommodate?" → employee_medical_or_accommodation
 *   - "Doctor's note and functional limitations" → employee_medical_or_accommodation
 *   - "Return to work restrictions" → employee_medical_or_accommodation
 *   - "Undue hardship" → employee_medical_or_accommodation
 *   - French: "Un employé demande un accommodement pour un handicap" → employee_medical_or_accommodation
 *   - None of the above fall back to general_hr_compliance
 *
 * Fix 3 — Federal/CLC leave routing:
 *   - "Current Canada Labour Code leave rules" → leave_or_absence
 *   - "What federal leave rules apply?" → leave_or_absence
 *   - "What leave entitlements apply under the Canada Labour Code?" → leave_or_absence
 *   - "Federal leave" → leave_or_absence
 *   - "Family responsibility leave" → leave_or_absence
 *   - "Personal leave" → leave_or_absence
 *   - "Protected leave entitlements" → leave_or_absence
 *   - French: "Quelles règles de congé s'appliquent sous le Code canadien du travail?" → leave_or_absence
 *
 * Fix 1+3 gate contract:
 *   - Accommodation route: retrievalAllowed=true, workspaceAllowed=true, legalBasisAllowed=true,
 *     suggestedDocumentsAllowed=true, surface=hybrid
 *   - Leave route: same gates
 *   - Neither falls through to general_hr_compliance
 */

import { routeAdvisorMessage } from '../core/routeAdvisorMessage';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: 'routing-test',
    userMessage,
    history: [],
    locale: 'en',
    province: null,
    employerProvince: null,
    remoteWork: false,
    mode: 'hr_compliance',
    isFederallyRegulated: null,
    unionized: null,
    enableRetrieval: true,
    enableWorkspacePayload: true,
    enableDrafting: true,
    includeDebug: false,
    ...overrides,
  });
}

// ─── Accommodation / disability / medical-restriction routing ─────────────────

describe('Fix 1 — accommodation/disability/medical routing → employee_medical_or_accommodation', () => {

  test('"An employee asked for accommodation because of a medical condition" routes correctly', () => {
    const route = routeAdvisorMessage(makeCtx('An employee asked for accommodation because of a medical condition. What should I do?'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
    expect(route.surface).toBe('hybrid');
    expect(route.retrievalAllowed).toBe(true);
    expect(route.workspaceAllowed).toBe(true);
    expect(route.legalBasisAllowed).toBe(true);
    expect(route.suggestedDocumentsAllowed).toBe(true);
  });

  test('"An employee requested accommodation for a disability" routes correctly', () => {
    const route = routeAdvisorMessage(makeCtx('An employee requested accommodation for a disability. What should I do?'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
    expect(route.surface).toBe('hybrid');
    expect(route.retrievalAllowed).toBe(true);
    expect(route.workspaceAllowed).toBe(true);
  });

  test('"What should we do with medical restrictions and modified duties?" routes correctly', () => {
    const route = routeAdvisorMessage(makeCtx('What should we do with medical restrictions and modified duties?'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
    expect(route.retrievalAllowed).toBe(true);
  });

  test('"An employee has medical restrictions and needs accommodation" routes correctly', () => {
    const route = routeAdvisorMessage(makeCtx('An employee has medical restrictions and needs accommodation.'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"duty to accommodate" routes to employee_medical_or_accommodation', () => {
    const route = routeAdvisorMessage(makeCtx('What is the duty to accommodate under human rights law?'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"disability accommodation" routes to employee_medical_or_accommodation', () => {
    const route = routeAdvisorMessage(makeCtx('What are my obligations regarding disability accommodation?'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"What do we do with a doctor\'s note and functional limitations?" routes correctly', () => {
    const route = routeAdvisorMessage(makeCtx("What do we do with a doctor's note and functional limitations?"));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"functional abilities form" routes to employee_medical_or_accommodation', () => {
    const route = routeAdvisorMessage(makeCtx('The employee provided a functional abilities form. What do we do now?'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"return to work restrictions" routes to employee_medical_or_accommodation', () => {
    const route = routeAdvisorMessage(makeCtx('Employee is coming back with return to work restrictions and needs modified duties.'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"undue hardship" routes to employee_medical_or_accommodation', () => {
    const route = routeAdvisorMessage(makeCtx('When does undue hardship apply to accommodation requests?'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"human rights accommodation" routes to employee_medical_or_accommodation', () => {
    const route = routeAdvisorMessage(makeCtx('What are our human rights accommodation obligations?'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('French: "Un employé demande un accommodement pour un handicap" routes correctly', () => {
    const route = routeAdvisorMessage(makeCtx('Un employé demande un accommodement pour un handicap. Que devons-nous faire?', { locale: 'fr' }));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
    expect(route.surface).toBe('hybrid');
    expect(route.retrievalAllowed).toBe(true);
    expect(route.workspaceAllowed).toBe(true);
  });

  test('French: "limitations fonctionnelles" routes to employee_medical_or_accommodation', () => {
    const route = routeAdvisorMessage(makeCtx('L\'employé a fourni des limitations fonctionnelles. Que faire?', { locale: 'fr' }));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('French: "contrainte excessive" routes to employee_medical_or_accommodation', () => {
    const route = routeAdvisorMessage(makeCtx('Quand est-ce que la contrainte excessive s\'applique?', { locale: 'fr' }));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('French: "billet médical" routes to employee_medical_or_accommodation', () => {
    const route = routeAdvisorMessage(makeCtx('L\'employé a soumis un billet médical. Que faire ensuite?', { locale: 'fr' }));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"needs accommodation" route is not general_hr_compliance', () => {
    const route = routeAdvisorMessage(makeCtx('The employee needs accommodation. What are our obligations?'));
    expect(route.intent).not.toBe('general_hr_compliance');
    expect(route.intent).toBe('employee_medical_or_accommodation');
  });

  // Gate contract for accommodation route
  test('accommodation route has all workspace gates enabled', () => {
    const route = routeAdvisorMessage(makeCtx('An employee requested accommodation for a disability.'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.surface).toBe('hybrid');
    expect(route.retrievalAllowed).toBe(true);
    expect(route.workspaceAllowed).toBe(true);
    expect(route.legalBasisAllowed).toBe(true);
    expect(route.suggestedDocumentsAllowed).toBe(true);
  });

  // High-risk mode when safety/harm mentioned
  test('accommodation with immediate safety concern uses high_risk_escalation', () => {
    const route = routeAdvisorMessage(makeCtx('An employee requested accommodation and there is a safety risk.'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.responseMode).toBe('high_risk_escalation');
  });

  // Standard mode without safety language
  test('accommodation without safety language uses hr_compliance_advisor', () => {
    const route = routeAdvisorMessage(makeCtx('An employee requested accommodation for a disability. What should I do?'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.responseMode).toBe('hr_compliance_advisor');
  });
});

// ─── Federal / CLC leave routing ─────────────────────────────────────────────

describe('Fix 3 — federal/CLC leave routing → leave_or_absence', () => {

  test('"Current Canada Labour Code leave rules" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('Current Canada Labour Code leave rules'));
    expect(route.intent).toBe('leave_or_absence');
    expect(route.intent).not.toBe('general_hr_compliance');
    expect(route.surface).toBe('hybrid');
    expect(route.retrievalAllowed).toBe(true);
  });

  test('"What federal leave rules apply?" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('What federal leave rules apply?'));
    expect(route.intent).toBe('leave_or_absence');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"What leave entitlements apply under the Canada Labour Code?" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('What leave entitlements apply under the Canada Labour Code?'));
    expect(route.intent).toBe('leave_or_absence');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"federal leave" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('What are the federal leave rules for our employees?'));
    expect(route.intent).toBe('leave_or_absence');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"CLC leave" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('What are CLC leave entitlements?'));
    expect(route.intent).toBe('leave_or_absence');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"family responsibility leave" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('Does an employee qualify for family responsibility leave?'));
    expect(route.intent).toBe('leave_or_absence');
  });

  test('"personal leave" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('What are the rules for personal leave under the ESA?'));
    expect(route.intent).toBe('leave_or_absence');
  });

  test('"protected leave entitlements" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('What protected leave entitlements does the employee have?'));
    expect(route.intent).toBe('leave_or_absence');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  test('"leave provisions" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('What are the leave provisions under federal law?'));
    expect(route.intent).toBe('leave_or_absence');
  });

  test('French: "Quelles règles de congé s\'appliquent sous le Code canadien du travail?" routes correctly', () => {
    const route = routeAdvisorMessage(makeCtx('Quelles règles de congé s\'appliquent sous le Code canadien du travail?', { locale: 'fr' }));
    expect(route.intent).toBe('leave_or_absence');
    expect(route.intent).not.toBe('general_hr_compliance');
    expect(route.retrievalAllowed).toBe(true);
  });

  test('French: "congé de maternité" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('Quelles sont les règles pour le congé de maternité au Québec?', { locale: 'fr' }));
    expect(route.intent).toBe('leave_or_absence');
  });

  test('French: "droits aux congés" routes to leave_or_absence', () => {
    const route = routeAdvisorMessage(makeCtx('Quels sont les droits aux congés sous le CCT?', { locale: 'fr' }));
    expect(route.intent).toBe('leave_or_absence');
    expect(route.intent).not.toBe('general_hr_compliance');
  });

  // Gate contract for leave route
  test('leave route has all workspace gates enabled', () => {
    const route = routeAdvisorMessage(makeCtx('Current Canada Labour Code leave rules'));
    expect(route.intent).toBe('leave_or_absence');
    expect(route.surface).toBe('hybrid');
    expect(route.retrievalAllowed).toBe(true);
    expect(route.workspaceAllowed).toBe(true);
    expect(route.legalBasisAllowed).toBe(true);
    expect(route.suggestedDocumentsAllowed).toBe(true);
  });
});
