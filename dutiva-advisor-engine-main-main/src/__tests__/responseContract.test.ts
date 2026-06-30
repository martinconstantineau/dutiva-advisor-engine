/// <reference types="vitest/globals" />
/**
 * Response contract tests covering the full product rules from the README contract.
 *
 * Tests:
 * - A. Response contract completeness
 * - F. Self-care route output artifacts
 * - G. Personal depression route output
 * - I. Employee mental-health route concepts
 * - J. Harassment route concepts
 * - K. Markdown cleanup in end-to-end response
 * - O. Match labels / no fake confidence percentages
 */

import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: `contract-test-${Date.now()}`,
    userMessage,
    locale: 'en',
    province: null,
    isFederallyRegulated: null,
    enableRetrieval: false,
    enableWorkspacePayload: true,
    ...overrides,
  });
}

describe('A. Response contract completeness', () => {
  test('every response includes required top-level fields', async () => {
    const ctx = makeCtx('What are my rights?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.sessionId).toBeTruthy();
    expect(response.locale).toMatch(/^(en|fr)$/);
    expect(typeof response.conversationalResponse).toBe('string');
    expect(response.conversationalResponse.length).toBeGreaterThan(0);
    expect(response.route).toBeDefined();
    expect(response.jurisdiction).toBeDefined();
    expect(response.risk).toBeDefined();
    expect(response.professionalReview).toBeDefined();
    expect(response.quality).toBeDefined();
    expect(typeof response.isCrisis).toBe('boolean');
    expect(response.debug).toBeUndefined();
  });

  test('workspace is omitted when workspaceAllowed is false', async () => {
    const ctx = makeCtx('What self-care strategies could you recommend for me?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.workspaceAllowed).toBe(false);
    expect(response.workspace).toBeUndefined();
  });

  test('workspace is present when workspaceAllowed is true', async () => {
    const ctx = makeCtx('An employee told me they are depressed. What should I do?', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.workspaceAllowed).toBe(true);
    expect(response.workspace).toBeDefined();
  });
});

describe('F. Self-care route output artifacts', () => {
  test('self-care response does not contain HR/legal artifacts', async () => {
    const ctx = makeCtx('What self-care strategies could you recommend for me?');
    const response = await composeAdvisorResponse(ctx);

    expect(response.route.intent).toBe('personal_wellbeing');
    expect(response.route.responseMode).toBe('supportive_triage');
    expect(response.route.surface).toBe('advisor_chat');
    expect(response.route.retrievalAllowed).toBe(false);
    expect(response.route.workspaceAllowed).toBe(false);
    expect(response.route.legalBasisAllowed).toBe(false);
    expect(response.route.suggestedDocumentsAllowed).toBe(false);

    const chatLower = response.conversationalResponse.toLowerCase();
    expect(response.workspace).toBeUndefined();
    expect(chatLower).not.toContain('retrieved guidance');
    expect(chatLower).not.toContain('compensation');
    expect(chatLower).not.toContain('legal basis');
    expect(chatLower).not.toContain('citation');
    expect(chatLower).not.toContain('ontario');
    expect(chatLower).not.toContain('esa');
    expect(chatLower).not.toContain('suggested document');
    expect(chatLower).not.toContain('at dutiva');
    expect(response.conversationalResponse).not.toMatch(/\*\*/);
    expect(response.conversationalResponse).not.toMatch(/##/);
  });
});

describe('G. Personal depression route', () => {
  test('depression response asks for context and has no HR/legal content', async () => {
    const ctx = makeCtx('I feel depressed');
    const response = await composeAdvisorResponse(ctx);

    expect(['personal_mental_health', 'ambiguous']).toContain(response.route.intent);
    expect(response.route.responseMode).toBe('supportive_triage');
    expect(response.route.surface).toBe('advisor_chat');
    expect(response.route.retrievalAllowed).toBe(false);
    expect(response.route.workspaceAllowed).toBe(false);
    expect(response.route.legalBasisAllowed).toBe(false);
    expect(response.route.suggestedDocumentsAllowed).toBe(false);

    const chatLower = response.conversationalResponse.toLowerCase();
    expect(chatLower).toMatch(/personal|workplace|employee|context|yourself|you/i);
    expect(chatLower).not.toContain('http');
    expect(chatLower).not.toContain('article');
    expect(response.workspace).toBeUndefined();
  });
});

describe('I. Employee mental-health route', () => {
  test('employee depression routes to HR and surfaces required concepts', async () => {
    const ctx = makeCtx('An employee told me they are depressed. What should I do?', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);

    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    expect(['hr_compliance_advisor', 'high_risk_escalation']).toContain(response.route.responseMode);
    expect(response.route.surface).toBe('hybrid');
    expect(response.route.retrievalAllowed).toBe(true);
    expect(response.route.workspaceAllowed).toBe(true);

    const chatLower = response.conversationalResponse.toLowerCase();
    expect(chatLower).toMatch(/employ|accommodat|confidential|privacy|medical|disclosure|safety|document|jurisdiction|hr|legal/i);
    expect(chatLower).not.toContain('medical diagnosis');
    expect(chatLower).not.toContain('treatment plan');
    expect(response.workspace).toBeDefined();
  });
});

describe('J. Harassment route', () => {
  test('harassment complaint routes to high-risk and gives operational guidance', async () => {
    const ctx = makeCtx('What should I do if there is a harassment complaint?', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);

    expect(response.route.intent).toBe('harassment_or_workplace_violence');
    expect(response.route.responseMode).toBe('high_risk_escalation');
    expect(response.route.surface).toBe('hybrid');
    expect(response.route.retrievalAllowed).toBe(true);
    expect(response.route.workspaceAllowed).toBe(true);
    expect(['high', 'critical']).toContain(response.risk.compliance);

    const chatLower = response.conversationalResponse.toLowerCase();
    expect(chatLower).toMatch(/complaint|investigat|confidential|document|safety|next steps|records|reprisal|escalat/i);
    expect(chatLower).not.toContain('diagnosis');
    expect(response.conversationalResponse).not.toMatch(/\*\*/);
  });
});

describe('K. Markdown cleanup in end-to-end response', () => {
  test('no raw Markdown in conversationalResponse or workspace fields', async () => {
    const ctx = makeCtx('What should I do if there is a harassment complaint?', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).not.toMatch(/\*\*/);
    expect(response.conversationalResponse).not.toMatch(/##/);
    if (response.workspace) {
      expect(response.workspace.summary).not.toMatch(/\*\*/);
      expect(response.workspace.guidance).not.toMatch(/\*\*/);
    }
  });
});

describe('O. Match labels and confidence', () => {
  test('retrieved guidance uses qualitative match labels, not percentages', async () => {
    const ctx = makeCtx('What should I do if there is a harassment complaint?', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance && response.workspace.retrievedGuidance.length > 0) {
      for (const item of response.workspace.retrievedGuidance) {
        expect(['High match', 'Medium match', 'Low match']).toContain(item.matchLabel);
        expect(item.matchLabel).not.toMatch(/%$/);
      }
    }
  });

  test('no percentage above 100% appears in conversationalResponse', async () => {
    const ctx = makeCtx('What should I do if there is a harassment complaint?', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const matches = response.conversationalResponse.match(/\d{3,}\s*%/g);
    expect(matches).toBeNull();
  });
});
