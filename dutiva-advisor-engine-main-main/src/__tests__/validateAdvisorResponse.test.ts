/// <reference types="vitest/globals" />
import { validateAdvisorResponse } from '../core/validateAdvisorResponse';
import { AdvisorResponse } from '../workspace/workspaceTypes';

function makeValidResponse(overrides: Partial<AdvisorResponse> = {}): AdvisorResponse {
  return {
    sessionId: 'test-123',
    locale: 'en',
    conversationalResponse: 'Here is some guidance.',
    route: {
      intent: 'general_hr_compliance',
      responseMode: 'hr_compliance_advisor',
      surface: 'hybrid',
      retrievalAllowed: true,
      workspaceAllowed: true,
      legalBasisAllowed: true,
      suggestedDocumentsAllowed: true,
      webSearchAllowed: false,
    },
    jurisdiction: {
      status: 'unknown',
      notes: [],
    },
    risk: {
      compliance: 'medium',
      safety: 'none',
    },
    professionalReview: {
      recommended: false,
      type: 'none',
    },
    quality: {
      markdownCleaned: true,
      citationsValidated: false,
      blockedRendering: [],
      warnings: [],
    },
    isCrisis: false,
    ...overrides,
  };
}

describe('validateAdvisorResponse', () => {
  test('valid response passes', () => {
    const result = validateAdvisorResponse(makeValidResponse());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('missing conversationalResponse fails', () => {
    const result = validateAdvisorResponse(makeValidResponse({ conversationalResponse: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('conversationalResponse'))).toBe(true);
  });

  test('invalid risk.compliance fails', () => {
    const bad = makeValidResponse();
    (bad.risk as unknown as Record<string, unknown>)['compliance'] = 'extreme';
    const result = validateAdvisorResponse(bad);
    expect(result.valid).toBe(false);
  });

  test('invalid professionalReview.type fails', () => {
    const bad = makeValidResponse();
    (bad.professionalReview as unknown as Record<string, unknown>)['type'] = 'therapist';
    const result = validateAdvisorResponse(bad);
    expect(result.valid).toBe(false);
  });

  test('crisis response with isCrisis=true passes', () => {
    const crisis = makeValidResponse({
      isCrisis: true,
      risk: { compliance: 'low', safety: 'critical' },
      professionalReview: { recommended: true, type: 'emergency' },
      route: {
        intent: 'possible_crisis_or_self_harm',
        responseMode: 'supportive_triage',
        surface: 'advisor_chat',
        retrievalAllowed: false,
        workspaceAllowed: false,
        legalBasisAllowed: false,
        suggestedDocumentsAllowed: false,
        webSearchAllowed: false,
      },
    });
    const result = validateAdvisorResponse(crisis);
    expect(result.valid).toBe(true);
  });
});
