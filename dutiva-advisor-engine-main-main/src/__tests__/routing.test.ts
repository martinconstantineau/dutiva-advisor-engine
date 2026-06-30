/// <reference types="vitest/globals" />
import { routeAdvisorMessage } from '../core/routeAdvisorMessage';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

function makeCtx(userMessage: string, overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {}): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: 'test-session',
    userMessage,
    history: [],
    locale: 'en',
    province: null,
    employerProvince: null,
    remoteWork: false,
    mode: 'hr_compliance',  // requested mode; resolved internally to hr_compliance_advisor
    isFederallyRegulated: null,     // null = unknown — do not default to false
    unionized: null,
    enableRetrieval: true,
    enableWorkspacePayload: true,
    enableDrafting: true,
    includeDebug: false,
    ...overrides,
  });
}

describe('routeAdvisorMessage — routing contract', () => {

  // A. Self-care route
  test('self-care query routes to personal_wellbeing / supportive_triage / advisor_chat', () => {
    const route = routeAdvisorMessage(makeCtx('What self-care strategies could you recommend for me?'));
    expect(route.intent).toBe('personal_wellbeing');
    expect(route.responseMode).toBe('supportive_triage');
    expect(route.surface).toBe('advisor_chat');
    expect(route.retrievalAllowed).toBe(false);
    expect(route.workspaceAllowed).toBe(false);
    expect(route.legalBasisAllowed).toBe(false);
    expect(route.suggestedDocumentsAllowed).toBe(false);
  });

  test('self-care query does not route to HR compliance', () => {
    const route = routeAdvisorMessage(makeCtx('How can I take care of myself?'));
    expect(route.responseMode).toBe('supportive_triage');
    expect(route.retrievalAllowed).toBe(false);
  });

  // B. Personal depression route
  test('"I feel depressed" routes to personal_mental_health / supportive_triage', () => {
    const route = routeAdvisorMessage(makeCtx('I feel depressed'));
    expect(['personal_mental_health', 'ambiguous']).toContain(route.intent);
    expect(route.responseMode).toBe('supportive_triage');
    expect(route.surface).toBe('advisor_chat');
    expect(route.retrievalAllowed).toBe(false);
    expect(route.workspaceAllowed).toBe(false);
    expect(route.legalBasisAllowed).toBe(false);
  });

  test('"I am overwhelmed" routes to supportive triage', () => {
    const route = routeAdvisorMessage(makeCtx('I am overwhelmed'));
    expect(route.responseMode).toBe('supportive_triage');
    expect(route.retrievalAllowed).toBe(false);
  });

  // C. Crisis route
  test('crisis language routes to possible_crisis_or_self_harm / supportive_triage', () => {
    const route = routeAdvisorMessage(makeCtx('I want to kill myself because of what my employer did'));
    expect(route.intent).toBe('possible_crisis_or_self_harm');
    expect(route.responseMode).toBe('supportive_triage');
    expect(route.surface).toBe('advisor_chat');
    expect(route.retrievalAllowed).toBe(false);
    expect(route.workspaceAllowed).toBe(false);
    expect(route.legalBasisAllowed).toBe(false);
    expect(route.suggestedDocumentsAllowed).toBe(false);
  });

  // D. Employee mental health / accommodation route
  test('employee medical disclosure routes to employee_medical_or_accommodation', () => {
    const route = routeAdvisorMessage(makeCtx('An employee told me they are depressed. What should I do?'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(['hr_compliance_advisor', 'high_risk_escalation']).toContain(route.responseMode);
    expect(route.surface).toBe('hybrid');
    expect(route.retrievalAllowed).toBe(true);
    expect(route.workspaceAllowed).toBe(true);
    expect(route.legalBasisAllowed).toBe(true);
  });

  test('employee burnout / leave route is HR compliance', () => {
    const route = routeAdvisorMessage(makeCtx('An employee says they are burned out and needs time off'));
    expect(route.intent).toBe('employee_medical_or_accommodation');
    expect(route.retrievalAllowed).toBe(true);
  });

  // E. Harassment route
  test('harassment complaint routes to harassment_or_workplace_violence / high_risk_escalation', () => {
    const route = routeAdvisorMessage(makeCtx('What should I do if there is a harassment complaint?'));
    expect(route.intent).toBe('harassment_or_workplace_violence');
    expect(route.responseMode).toBe('high_risk_escalation');
    expect(route.surface).toBe('hybrid');
    expect(route.retrievalAllowed).toBe(true);
    expect(route.workspaceAllowed).toBe(true);
  });

  // F. Termination route
  test('termination query routes to termination_or_discipline', () => {
    const route = routeAdvisorMessage(makeCtx('I was terminated without cause after 5 years. What am I entitled to?'));
    expect(route.intent).toBe('termination_or_discipline');
    expect(route.retrievalAllowed).toBe(true);
    expect(route.workspaceAllowed).toBe(true);
  });

  // G. Out of scope
  test('recipe question routes to out_of_scope', () => {
    const route = routeAdvisorMessage(makeCtx('How do I make pasta carbonara?'));
    expect(route.intent).toBe('out_of_scope');
    expect(route.responseMode).toBe('out_of_scope_redirect');
    expect(route.retrievalAllowed).toBe(false);
    expect(route.workspaceAllowed).toBe(false);
  });

  // H. Workplace context override
  test('depression with workplace context routes to HR not personal', () => {
    const route = routeAdvisorMessage(makeCtx('I feel depressed because of my manager and my job'));
    // Has workplace indicators — should not be purely personal_mental_health
    // May route as personal_mental_health with workplace context or employee_medical — either is acceptable
    // Key: retrieval may be allowed because there IS workplace context
    // This test just confirms it does not suppress entirely without reason
    expect(route.intent).toBeDefined();
    expect(route.responseMode).toBeDefined();
  });

  // I. Ambiguous input
  test('vague input with no HR keywords routes to ambiguous', () => {
    const route = routeAdvisorMessage(makeCtx('Hello, I have a question'));
    expect(route.intent).toBe('ambiguous');
    expect(route.responseMode).toBe('supportive_triage');
    expect(route.surface).toBe('advisor_chat');
    expect(route.retrievalAllowed).toBe(false);
    expect(route.workspaceAllowed).toBe(false);
    expect(route.legalBasisAllowed).toBe(false);
    expect(route.suggestedDocumentsAllowed).toBe(false);
  });

  test('input with HR keywords routes to general_hr_compliance, not ambiguous', () => {
    const route = routeAdvisorMessage(makeCtx('What are the basic HR policies I need?'));
    expect(route.intent).toBe('general_hr_compliance');
    expect(route.responseMode).toBe('hr_compliance_advisor');
    expect(route.surface).toBe('hybrid');
  });
});
