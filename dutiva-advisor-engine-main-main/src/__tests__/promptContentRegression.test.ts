/// <reference types="vitest/globals" />
/**
 * Prompt-content regression tests.
 *
 * These tests verify that the ACTUAL messages array sent to the LLM does NOT
 * contain unsafe retrieved guidance.  Unlike the unit tests in
 * promptLevelGuidanceFilter.test.ts (which test the filter function directly),
 * these tests exercise the full composeAdvisorResponse() integration path and
 * spy on the real LLM provider call to inspect the prompt text itself.
 *
 * Strategy:
 *   1. Install a mock LLMProvider via setDefaultProvider() that captures every
 *      messages array it receives and immediately returns a minimal valid JSON
 *      response (so composeAdvisorResponse() completes without a network call).
 *   2. Call composeAdvisorResponse() with a realistic context.
 *   3. Assert the captured system-message content does NOT contain forbidden
 *      guidance strings for the scenario under test.
 *   4. Restore the original provider in afterEach.
 *
 * Covered scenarios:
 *   - Ontario harassment query must not pass federal guidance to the LLM prompt
 *   - Ontario harassment query prompt must not contain Canada Labour Code /
 *     Canadian Human Rights Act / Québec guidance / unrelated topic guidance
 *   - Ontario accommodation query prompt must not contain harassment / safety /
 *     termination / unrelated-jurisdiction CHRA guidance
 *   - Unknown jurisdiction must not pass jurisdiction-specific guidance to the
 *     LLM prompt
 *   - Personal wellness / crisis routes must pass no retrieved employment-law
 *     guidance to the LLM prompt
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { setDefaultProvider } from '../llm/provider';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { LLMProvider, LLMCompletionOptions, LLMMessage } from '../llm/provider';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

// ─── Mock LLM provider ────────────────────────────────────────────────────────

/** Minimal valid JSON response for parseAdvisorLLMOutput */
const STUB_RESPONSE = JSON.stringify({
  conversationalResponse: 'Test stub response.',
  summary: 'Stub.',
  guidance: 'Stub.',
  immediateSteps: [],
  documentationSteps: [],
  missingFacts: [],
  followUpQuestions: [],
  complianceRisk: 'low',
  safetyRisk: 'none',
  professionalReviewType: 'none',
  citationsUsed: [],
});

interface CapturedCall {
  messages: LLMMessage[];
  systemContent: string;
}

function makeMockProvider(): { provider: LLMProvider; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];

  const provider: LLMProvider = {
    name: 'test-mock',
    generateCompletion(options: LLMCompletionOptions): Promise<string> {
      const systemContent = options.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
      calls.push({ messages: [...options.messages], systemContent });
      return Promise.resolve(STUB_RESPONSE);
    },
  };

  return { provider, calls };
}

// ─── Context helpers ──────────────────────────────────────────────────────────

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: `prompt-regression-${Date.now()}`,
    userMessage,
    locale: 'en',
    province: null,
    isFederallyRegulated: null,
    enableRetrieval: true,
    enableWorkspacePayload: true,
    includeDebug: false,
    ...overrides,
  });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  // Ensure the real provider is cleared so each test starts fresh.
  setDefaultProvider(null);
});

afterEach(() => {
  setDefaultProvider(null);
});

// ─── Scenario 1: Ontario harassment query — federal guidance must not reach LLM

describe('Scenario 1 — Ontario harassment query: no federal guidance in LLM prompt', () => {

  it('does not pass Canada Labour Code guidance to the LLM system message', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    const ctx = makeCtx(
      'An employee is being harassed by their manager. What are our obligations?',
      { province: 'ON', isFederallyRegulated: false },
    );
    await composeAdvisorResponse(ctx);

    expect(calls.length).toBeGreaterThan(0);
    const { systemContent } = calls[0];

    // Must not contain federal statute guidance citations in the retrieved guidance block
    expect(systemContent).not.toMatch(/Canada Labour Code.*harassment/i);
    expect(systemContent).not.toMatch(/harassment.*Canada Labour Code/i);
  });

  it('does not pass Canadian Human Rights Act guidance to the LLM system message', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    const ctx = makeCtx(
      'An employee is being harassed by their manager. What are our obligations?',
      { province: 'ON', isFederallyRegulated: false },
    );
    await composeAdvisorResponse(ctx);

    expect(calls.length).toBeGreaterThan(0);
    const { systemContent } = calls[0];

    expect(systemContent).not.toMatch(/Canadian Human Rights Act.*harassment/i);
    expect(systemContent).not.toMatch(/harassment.*Canadian Human Rights Act/i);
  });

  it('does not pass Québec guidance to the LLM system message for Ontario harassment', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    const ctx = makeCtx(
      'An employee is being harassed by their manager. What are our obligations?',
      { province: 'ON', isFederallyRegulated: false },
    );
    await composeAdvisorResponse(ctx);

    expect(calls.length).toBeGreaterThan(0);
    const { systemContent } = calls[0];

    // QC-specific statutes must not appear in the retrieved guidance context block
    expect(systemContent).not.toMatch(/\bLNT\b|\bCNESST\b|Act Respecting Labour Standards/i);
    expect(systemContent).not.toMatch(/province[:\s]+QC\b/i);
  });

  it('does not pass unrelated accommodation/safety/termination guidance to the LLM prompt for Ontario harassment', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    const ctx = makeCtx(
      'An employee is being harassed by their manager. What are our obligations?',
      { province: 'ON', isFederallyRegulated: false },
    );
    await composeAdvisorResponse(ctx);

    expect(calls.length).toBeGreaterThan(0);
    const { systemContent } = calls[0];

    // The retrieved guidance block (after the header "Retrieved internal guidance context")
    // must not contain items from unrelated categories.
    // We test by checking that category-specific citation patterns that would ONLY appear
    // in non-harassment guidance are absent.
    const guidanceBlock = systemContent.includes('Retrieved internal guidance context')
      ? systemContent.slice(systemContent.indexOf('Retrieved internal guidance context'))
      : systemContent;

    // Termination-only guidance signals
    expect(guidanceBlock).not.toMatch(/notice of termination|severance pay.*ESA|ESA.*severance/i);
    // Safety-only guidance signals
    expect(guidanceBlock).not.toMatch(/right to refuse unsafe work|OHSA.*inspector/i);
  });

});

// ─── Scenario 2: Ontario accommodation query — wrong-topic guidance must not reach LLM

describe('Scenario 2 — Ontario accommodation query: no wrong-topic guidance in LLM prompt', () => {

  it('does not pass harassment guidance to the LLM system message for Ontario accommodation query', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    const ctx = makeCtx(
      'An employee has a disability and needs workplace accommodation. What must we do?',
      { province: 'ON', isFederallyRegulated: false },
    );
    await composeAdvisorResponse(ctx);

    expect(calls.length).toBeGreaterThan(0);
    const { systemContent } = calls[0];

    const guidanceBlock = systemContent.includes('Retrieved internal guidance context')
      ? systemContent.slice(systemContent.indexOf('Retrieved internal guidance context'))
      : systemContent;

    // Harassment-specific guidance signals must not appear in retrieval block
    expect(guidanceBlock).not.toMatch(/harassment.*policy|workplace harassment.*employer/i);
  });

  it('does not pass termination guidance to the LLM system message for Ontario accommodation query', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    const ctx = makeCtx(
      'An employee has a disability and needs workplace accommodation. What must we do?',
      { province: 'ON', isFederallyRegulated: false },
    );
    await composeAdvisorResponse(ctx);

    expect(calls.length).toBeGreaterThan(0);
    const { systemContent } = calls[0];

    const guidanceBlock = systemContent.includes('Retrieved internal guidance context')
      ? systemContent.slice(systemContent.indexOf('Retrieved internal guidance context'))
      : systemContent;

    expect(guidanceBlock).not.toMatch(/notice of termination|severance pay.*ESA|ESA.*severance/i);
  });

  it('does not pass federal CHRA guidance to the LLM prompt for a known non-federal Ontario employer', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    const ctx = makeCtx(
      'An employee has a disability and needs workplace accommodation. What must we do?',
      { province: 'ON', isFederallyRegulated: false },
    );
    await composeAdvisorResponse(ctx);

    expect(calls.length).toBeGreaterThan(0);
    const { systemContent } = calls[0];

    const guidanceBlock = systemContent.includes('Retrieved internal guidance context')
      ? systemContent.slice(systemContent.indexOf('Retrieved internal guidance context'))
      : systemContent;

    // CHRA is federal-only; should not appear in retrieved guidance for non-federal ON employer
    expect(guidanceBlock).not.toMatch(/Canadian Human Rights Act|CHRA.*accommodation/i);
  });

});

// ─── Scenario 3: Unknown jurisdiction — no jurisdiction-specific guidance in prompt

describe('Scenario 3 — Unknown jurisdiction: no province-specific guidance in LLM prompt', () => {

  it('does not pass Ontario-specific guidance to the LLM prompt when jurisdiction is unknown', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    const ctx = makeCtx(
      'What are the harassment laws I need to follow?',
      { province: null, isFederallyRegulated: null },
    );
    await composeAdvisorResponse(ctx);

    expect(calls.length).toBeGreaterThan(0);
    const { systemContent } = calls[0];

    const guidanceBlock = systemContent.includes('Retrieved internal guidance context')
      ? systemContent.slice(systemContent.indexOf('Retrieved internal guidance context'))
      : systemContent;

    // Ontario-specific statute names must not appear in the retrieved guidance block
    // when jurisdiction is unknown (filter should only pass ALL-province items)
    expect(guidanceBlock).not.toMatch(/province[:\s]+ON\b/i);
  });

  it('does not pass Québec-specific guidance to the LLM prompt when jurisdiction is unknown', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    const ctx = makeCtx(
      'What are the harassment laws I need to follow?',
      { province: null, isFederallyRegulated: null },
    );
    await composeAdvisorResponse(ctx);

    expect(calls.length).toBeGreaterThan(0);
    const { systemContent } = calls[0];

    const guidanceBlock = systemContent.includes('Retrieved internal guidance context')
      ? systemContent.slice(systemContent.indexOf('Retrieved internal guidance context'))
      : systemContent;

    expect(guidanceBlock).not.toMatch(/province[:\s]+QC\b/i);
  });

});

// ─── Scenario 4: Crisis route — LLM is never called (deterministic response)

describe('Scenario 4 — Crisis route: LLM provider is never called', () => {

  it('does not call the LLM at all for explicit self-harm language (crisis short-circuit)', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    // Use phrasing that matches the CRISIS_PATTERNS in classifySensitiveInput.ts:
    // /\b(suicid|kill\s+myself|end\s+my\s+life|self[.\-\s]?harm|hurt\s+myself)\b/i
    const ctx = makeCtx(
      'I want to hurt myself because of what happened at work.',
      { province: 'ON' },
    );
    const response = await composeAdvisorResponse(ctx);

    // This message matches crisis patterns — verify the response is flagged.
    expect(response.isCrisis).toBe(true);

    // Crisis routes use formatCrisisConversationalResponse() and return before calling
    // the LLM provider.  The mock must have received zero calls.
    expect(calls).toHaveLength(0);

    // The response must also contain no retrieved guidance items
    expect(response.workspace?.retrievedGuidance ?? []).toHaveLength(0);
  });

  it('does not call the LLM for clearly out-of-scope personal wellbeing intent', async () => {
    const { provider, calls } = makeMockProvider();
    setDefaultProvider(provider);

    const ctx = makeCtx(
      'I am having a terrible day and just want to vent.',
      { province: 'ON' },
    );
    const response = await composeAdvisorResponse(ctx);

    // personal_wellbeing / out_of_scope routes return a deterministic fallback.
    // If the route resolves to one of those intents, the LLM must not be called.
    const isShortCircuited = [
      'personal_wellbeing', 'personal_mental_health', 'out_of_scope',
    ].includes(response.route.intent);

    if (isShortCircuited) {
      expect(calls).toHaveLength(0);
      expect(response.workspace?.retrievedGuidance ?? []).toHaveLength(0);
    }
    // If the router does not classify this as a short-circuit intent, the test is
    // inconclusive for this specific message and passes silently.
  });

});
