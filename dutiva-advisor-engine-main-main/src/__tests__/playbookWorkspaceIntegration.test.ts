/// <reference types="vitest/globals" />
/**
 * Integration coverage for the two "built but not wired in" gaps that are now wired:
 *
 *  1. Playbook content (confidentialityNotes, antiReprisalNotes, suggestedDocuments)
 *     is populated into workspace from the topic playbook.
 *  2. legalBasis reconciliation: an LLM citation is promoted to authoritative ONLY
 *     when it corroborates a citation carried by the vetted retrieved guidance.
 */
import { setDefaultProvider, type LLMProvider } from '../llm/provider';
import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { resetGuidanceCorpusCache } from '../retrieval/retrieveGuidance';
import { harassmentPlaybook } from '../playbooks';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: 'playbook-test',
    userMessage,
    locale: 'en',
    province: 'ON',
    isFederallyRegulated: null,
    enableRetrieval: true,
    enableWorkspacePayload: true,
    enableDrafting: true,
    ...overrides,
  });
}

const validLLM = (citations: string[] = []): LLMProvider => ({
  name: 'mock-valid',
  async generateCompletion(): Promise<string> {
    return JSON.stringify({
      conversationalResponse: 'Here is guidance.',
      summary: 'Summary',
      guidance: 'Guidance',
      immediateSteps: ['Step one'],
      documentationSteps: ['Document it'],
      missingFacts: [],
      followUpQuestions: [],
      complianceRisk: 'high',
      safetyRisk: 'none',
      professionalReviewType: 'legal',
      citationsUsed: citations,
    });
  },
});

afterEach(() => {
  setDefaultProvider(null);
  resetGuidanceCorpusCache();
});

describe('playbook content is wired into the workspace', () => {
  test('harassment query populates confidentiality, anti-reprisal, and suggested documents', async () => {
    setDefaultProvider(validLLM());
    const ctx = makeCtx('An employee submitted a harassment complaint against a coworker. What should we do?');
    const response = await composeAdvisorResponse(ctx);

    expect(response.workspace).toBeDefined();
    expect(response.workspace?.confidentialityNotes?.length).toBeGreaterThan(0);
    expect(response.workspace?.antiReprisalNotes?.length).toBeGreaterThan(0);

    // Sourced from the harassment playbook
    expect(response.workspace?.confidentialityNotes).toEqual(harassmentPlaybook.confidentialityNotes);
    const docTitles = (response.workspace?.suggestedDocuments ?? []).map((d) => d.title);
    expect(docTitles).toContain('Investigation Report');
  });
});

describe('legalBasis reconciliation', () => {
  test('an LLM citation matching a vetted retrieved statute is promoted to valid', async () => {
    setDefaultProvider(validLLM(['Canada Labour Code, Part III']));
    const ctx = makeCtx(
      'What notice must we give a federally regulated employee on termination without cause?',
      { province: null, isFederallyRegulated: true },
    );
    const response = await composeAdvisorResponse(ctx);

    expect(response.route.legalBasisAllowed).toBe(true);
    expect(response.workspace?.legalBasis).toBeDefined();
    const items = response.workspace?.legalBasis ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.validationStatus === 'valid')).toBe(true);
    expect(items.some((i) => /Canada Labour Code/i.test(i.citation))).toBe(true);
  });

  test('an LLM citation with no corroborating retrieved source is withheld', async () => {
    setDefaultProvider(validLLM(['Imaginary Employment Powers Act, s. 999']));
    const ctx = makeCtx(
      'What notice must we give a federally regulated employee on termination without cause?',
      { province: null, isFederallyRegulated: true },
    );
    const response = await composeAdvisorResponse(ctx);

    // Not corroborated → not in public legalBasis, and surfaced as an unvetted warning.
    const inLegalBasis = (response.workspace?.legalBasis ?? []).some((i) =>
      /Imaginary Employment Powers Act/i.test(i.citation),
    );
    expect(inLegalBasis).toBe(false);
    expect(response.quality.warnings.some((w) => /unvetted|withheld/i.test(w))).toBe(true);
  });
});
