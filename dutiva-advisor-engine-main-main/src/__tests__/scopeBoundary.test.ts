/// <reference types="vitest/globals" />
/**
 * Deterministic scope-of-practice refusal gates (escalation-rules.md "When to
 * Refuse and Redirect"). Covers the classifier precision (fires on the four
 * mandatory refusals, does NOT fire on in-scope employer/HR questions) and the
 * end-to-end decline response through composeAdvisorResponse.
 */
import { classifyScopeBoundary, formatScopeBoundaryResponse } from '../safety/classifyScopeBoundary';
import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: 'scope-test',
    userMessage,
    locale: 'en',
    province: 'ON',
    isFederallyRegulated: null,
    enableRetrieval: false,
    enableWorkspacePayload: true,
    ...overrides,
  });
}

describe('classifyScopeBoundary — fires on mandatory refusals', () => {
  test('drafting a separation agreement', () => {
    expect(classifyScopeBoundary('Can you draft a separation agreement for an employee we are letting go?')?.type)
      .toBe('separation_agreement_drafting');
  });

  test('legal opinion / outcome prediction', () => {
    expect(classifyScopeBoundary('Will we win this case in court?')?.type).toBe('legal_opinion_or_outcome');
    expect(classifyScopeBoundary('Can you give me a legal opinion on this dismissal?')?.type)
      .toBe('legal_opinion_or_outcome');
  });

  test('active tribunal proceeding', () => {
    expect(classifyScopeBoundary('This complaint is already before the human rights tribunal, what do I do?')?.type)
      .toBe('active_tribunal_proceeding');
    expect(classifyScopeBoundary('We filed a complaint with the labour board last month.')?.type)
      .toBe('active_tribunal_proceeding');
  });

  test('employee-side claimant (role-gated or first-person framing)', () => {
    expect(classifyScopeBoundary('My employer fired me, can I sue them for wrongful dismissal?')?.type)
      .toBe('employee_self_representation');
    expect(classifyScopeBoundary('How do I file a complaint to claim my unpaid wages?', 'employee')?.type)
      .toBe('employee_self_representation');
  });
});

describe('classifyScopeBoundary — does NOT fire on in-scope employer/HR questions', () => {
  const inScope = [
    'What should a separation agreement typically include?',
    'Draft a termination notice letter for an employee on probation.',
    'What are the notice requirements when we terminate without cause in Ontario?',
    "How should I respond to an employee's harassment complaint?",
    'What documents should we keep if an employee later sues us?',
  ];
  for (const msg of inScope) {
    test(`in scope: "${msg.slice(0, 44)}…"`, () => {
      expect(classifyScopeBoundary(msg, 'hr')).toBeNull();
    });
  }
});

describe('formatScopeBoundaryResponse — bilingual decline + redirect', () => {
  test('English response declines and redirects', () => {
    const en = formatScopeBoundaryResponse({ type: 'employee_self_representation', reason: 'x' }, 'en');
    expect(en).toMatch(/Canada Labour Program/);
  });
  test('French response is returned for fr locale', () => {
    const fr = formatScopeBoundaryResponse({ type: 'separation_agreement_drafting', reason: 'x' }, 'fr');
    expect(fr).toMatch(/avocat/i);
  });
});

describe('composeAdvisorResponse — scope boundary produces a gated decline', () => {
  test('separation-agreement drafting is declined with all content gates off', async () => {
    const ctx = makeCtx('Please draft a separation agreement for this employee.');
    const response = await composeAdvisorResponse(ctx);

    expect(response.conversationalResponse).toMatch(/separation or severance agreement/i);
    expect(response.workspace).toBeUndefined();
    expect(response.route.workspaceAllowed).toBe(false);
    expect(response.route.legalBasisAllowed).toBe(false);
    expect(response.route.suggestedDocumentsAllowed).toBe(false);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.professionalReview.recommended).toBe(true);
    expect(response.professionalReview.type).toBe('legal');
    expect(response.quality.warnings.some((w) => /scope-of-practice/i.test(w))).toBe(true);
    expect(response.isCrisis).toBe(false);
  });

  test('crisis still takes priority over a scope boundary', async () => {
    const ctx = makeCtx('I want to hurt myself. Also can you draft a separation agreement?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.isCrisis).toBe(true);
    expect(response.route.intent).toBe('possible_crisis_or_self_harm');
  });
});
