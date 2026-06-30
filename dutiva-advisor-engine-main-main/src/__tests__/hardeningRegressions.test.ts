/// <reference types="vitest/globals" />
/**
 * Hardening regression tests.
 *
 * Covers:
 * - QWEN_API_KEY missing does not produce console.warn spam
 * - Unexpected provider failures still produce a quality warning and safe response
 * - Raw LLM citations are not returned as authoritative agency_guidance
 * - No workspace/legalBasis for unknown jurisdiction even if LLM emits citations
 * - API response does not expose raw provider errors
 */

import { vi } from 'vitest';
import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import { setDefaultProvider, type LLMProvider } from '../llm/provider';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: `hardening-test-${Date.now()}`,
    userMessage,
    locale: 'en',
    province: null,
    isFederallyRegulated: null,
    enableRetrieval: false,
    enableWorkspacePayload: true,
    ...overrides,
  });
}

const mockProviderWithCitations = (citations: string[]): LLMProvider => ({
  name: 'mock-citations',
  async generateCompletion(): Promise<string> {
    return JSON.stringify({
      conversationalResponse: 'Here is guidance with citations.',
      summary: 'Summary',
      guidance: 'Guidance',
      immediateSteps: ['Step one'],
      documentationSteps: [],
      missingFacts: [],
      followUpQuestions: [],
      complianceRisk: 'medium',
      safetyRisk: 'none',
      professionalReviewType: 'none',
      citationsUsed: citations,
    });
  },
});

const mockProviderThatThrows = (message: string): LLMProvider => ({
  name: 'mock-throws',
  async generateCompletion(): Promise<string> {
    throw new Error(message);
  },
});

afterEach(() => {
  setDefaultProvider(null);
});

describe('No console.warn spam on deterministic fallback', () => {
  test('missing QWEN_API_KEY does not trigger console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx('What are the notice period rules?', { province: 'ON' });
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings).toContain('LLM unavailable — using fallback response');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('Unexpected provider failures', () => {
  test('unexpected provider failure still returns safe response with quality warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setDefaultProvider(mockProviderThatThrows('connection refused'));
    const ctx = makeCtx('What are the notice period rules?', { province: 'ON' });
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings).toContain('LLM unavailable — using fallback response');
    expect(response.conversationalResponse).toBeTruthy();
    warnSpy.mockRestore();
  });

  test('API response does not expose raw provider error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setDefaultProvider(mockProviderThatThrows('connection refused to sk-secret-key'));
    const ctx = makeCtx('What are the notice period rules?', { province: 'ON' });
    const response = await composeAdvisorResponse(ctx);
    const responseString = JSON.stringify(response);
    expect(responseString).not.toContain('sk-secret-key');
    expect(responseString).not.toContain('connection refused');
    warnSpy.mockRestore();
  });
});

describe('Raw LLM citations are not authoritative', () => {
  // Fix 2 (polish pass): raw LLM citations that are unvetted/requires_review must NOT appear
  // in public workspace.legalBasis. They are moved to quality.warnings and optionally debug.
  test('raw LLM citation with requires_review is withheld from public legalBasis', async () => {
    setDefaultProvider(mockProviderWithCitations(['Employment Standards Act, 2000, s. 54 (ESA)']));
    const ctx = makeCtx('What are the notice period rules?', { province: 'ON' });
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace).toBeDefined();
    // Public legalBasis must be empty/undefined — unvetted citations are withheld
    expect(response.workspace?.legalBasis).toBeUndefined();
    // Quality warning must mention the unvetted citation
    const hasUnvettedWarning = response.quality.warnings.some((w) => /unvetted|withheld/i.test(w));
    expect(hasUnvettedWarning).toBe(true);
  });

  test('no legalBasis for unknown jurisdiction even when LLM emits citations', async () => {
    setDefaultProvider(mockProviderWithCitations(['Employment Standards Act, 2000, s. 54 (ESA)']));
    const ctx = makeCtx('What are the notice period rules?', { province: null, isFederallyRegulated: null });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.status).toBe('unknown');
    expect(response.route.legalBasisAllowed).toBe(false);
    expect(response.workspace?.legalBasis).toBeUndefined();
  });
});
