/// <reference types="vitest/globals" />
/**
 * Gate enforcement tests.
 *
 * Tests:
 * - Retrieval module is NOT called when route.retrievalAllowed is false
 * - Workspace is omitted when route.workspaceAllowed is false
 * - No stale retrieval/workspace from prior HR turn leaks into a personal/supportive turn
 * - No workspace on crisis route
 * - No workspace on personal wellness route
 */

import { vi, type MockInstance } from 'vitest';
import * as retrieveGuidanceModule from '../retrieval/retrieveGuidance';
import type { GuidanceItem, ScoredGuidanceItem } from '../retrieval/guidanceTypes';
import type { RetrieveOptions } from '../retrieval/scoreGuidanceItem';
import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { routeAdvisorMessage } from '../core/routeAdvisorMessage';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

function makeCtx(msg: string, overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {}): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: `gate-test-${Date.now()}`,
    userMessage: msg,
    locale: 'en',
    province: null,
    isFederallyRegulated: null,
    enableRetrieval: true,
    enableWorkspacePayload: true,
    enableDrafting: true,
    ...overrides,
  });
}

describe('Gate enforcement — retrieval not called when retrievalAllowed=false', () => {
  let retrieveSpy: MockInstance<(query: unknown, items?: GuidanceItem[], options?: RetrieveOptions) => ScoredGuidanceItem[]>;

  beforeEach(() => {
    retrieveSpy = vi.spyOn(retrieveGuidanceModule, 'retrieveGuidance');
  });

  afterEach(() => {
    retrieveSpy.mockRestore();
  });

  test('retrieval NOT called for personal_wellbeing route', async () => {
    const ctx = makeCtx('What self-care strategies could you recommend for me?');
    await composeAdvisorResponse(ctx);
    expect(retrieveSpy).not.toHaveBeenCalled();
  });

  test('retrieval NOT called for personal_mental_health route', async () => {
    const ctx = makeCtx('I feel depressed');
    await composeAdvisorResponse(ctx);
    expect(retrieveSpy).not.toHaveBeenCalled();
  });

  test('retrieval NOT called for crisis route', async () => {
    const ctx = makeCtx('I want to kill myself');
    await composeAdvisorResponse(ctx);
    expect(retrieveSpy).not.toHaveBeenCalled();
  });

  test('retrieval NOT called for out_of_scope route', async () => {
    const ctx = makeCtx('How do I make pasta carbonara?');
    await composeAdvisorResponse(ctx);
    expect(retrieveSpy).not.toHaveBeenCalled();
  });

  test('retrieval IS called for harassment HR route (verifying spy works)', async () => {
    const ctx = makeCtx('What should I do if there is a harassment complaint?', {
      province: 'ON',
      enableRetrieval: true,
    });
    await composeAdvisorResponse(ctx);
    expect(retrieveSpy).toHaveBeenCalled();
  });
});

describe('Gate enforcement — workspace absent when workspaceAllowed=false', () => {
  test('no workspace on personal_wellbeing response', async () => {
    const ctx = makeCtx('What self-care strategies could you recommend for me?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace).toBeUndefined();
  });

  test('no workspace on personal_mental_health response', async () => {
    const ctx = makeCtx('I feel depressed');
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace).toBeUndefined();
  });

  test('no workspace on crisis response', async () => {
    const ctx = makeCtx('I want to kill myself');
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace).toBeUndefined();
    expect(response.isCrisis).toBe(true);
  });

  test('no workspace on out_of_scope response', async () => {
    const ctx = makeCtx('How do I make pasta carbonara?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace).toBeUndefined();
  });
});

describe('Gate enforcement — no stale retrieval/workspace across turns', () => {
  let retrieveSpy: MockInstance<(query: unknown, items?: GuidanceItem[], options?: RetrieveOptions) => ScoredGuidanceItem[]>;

  beforeEach(() => {
    retrieveSpy = vi.spyOn(retrieveGuidanceModule, 'retrieveGuidance');
  });

  afterEach(() => {
    retrieveSpy.mockRestore();
  });

  test('second turn (personal wellness) does not receive retrieval data from first turn (HR)', async () => {
    // First turn — HR question that would trigger retrieval
    const ctx1 = makeCtx('What should I do if there is a harassment complaint?', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response1 = await composeAdvisorResponse(ctx1);
    expect(response1.route.retrievalAllowed).toBe(true);
    // route may include workspace/retrieval from turn 1

    // Second turn — personal wellness (new context, no history leakage)
    retrieveSpy.mockClear();
    const ctx2 = makeCtx('What self-care strategies could you recommend for me?', {
      // Pass prior conversation as history (simulating session continuity)
      history: [
        { role: 'user', content: 'What should I do if there is a harassment complaint?' },
        { role: 'assistant', content: response1.conversationalResponse },
      ],
    });
    const response2 = await composeAdvisorResponse(ctx2);

    // Retrieval must NOT have been called for this personal wellness turn
    expect(retrieveSpy).not.toHaveBeenCalled();

    // Response must not contain workspace/retrieval data
    expect(response2.workspace).toBeUndefined();
    expect(response2.route.retrievalAllowed).toBe(false);
    expect(response2.route.workspaceAllowed).toBe(false);
    expect(response2.route.legalBasisAllowed).toBe(false);
    expect(response2.route.suggestedDocumentsAllowed).toBe(false);
  });
});

describe('Gate enforcement — no legal basis when jurisdiction unknown', () => {
  test('no legalBasis when jurisdiction is unknown', async () => {
    const ctx = makeCtx('An employee told me they are depressed. What should I do?', {
      province: null,
      isFederallyRegulated: null,  // unknown
    });
    const response = await composeAdvisorResponse(ctx);
    // Jurisdiction should be unknown
    expect(response.jurisdiction.status).toBe('unknown');
    // legalBasis must not be present (gate: legalBasisAllowed only active when jurisdiction known)
    if (response.workspace?.legalBasis) {
      expect(response.workspace.legalBasis).toHaveLength(0);
    } else {
      expect(response.workspace?.legalBasis).toBeUndefined();
    }
  });
});

describe('Mode naming contract', () => {
  test('request mode "hr_compliance" maps to internal hr_compliance_advisor', () => {
    const ctx = buildPipelineContext({
      sessionId: 'mode-test',
      userMessage: 'General HR question',
      mode: 'hr_compliance',
    });
    expect(ctx.mode).toBe('hr_compliance_advisor');
  });

  test('request mode "legal_issue_spotting" maps to legal_issue_spotting', () => {
    const ctx = buildPipelineContext({
      sessionId: 'mode-test-2',
      userMessage: 'Legal question',
      mode: 'legal_issue_spotting',
    });
    expect(ctx.mode).toBe('legal_issue_spotting');
  });

  test('request mode "document_drafting" maps to document_drafting', () => {
    const ctx = buildPipelineContext({
      sessionId: 'mode-test-3',
      userMessage: 'Draft a letter',
      mode: 'document_drafting',
    });
    expect(ctx.mode).toBe('document_drafting');
  });

  test('response.route.responseMode is the actual internal mode, not the requested mode', async () => {
    const ctx = makeCtx('What self-care strategies could you recommend for me?');
    const response = await composeAdvisorResponse(ctx);
    // Router overrides to supportive_triage regardless of requested mode
    expect(response.route.responseMode).toBe('supportive_triage');
  });
});

describe('Effective route gates — final permissions, not abstract eligibility', () => {
  test('legalBasisAllowed is false when jurisdiction is unknown', async () => {
    const ctx = makeCtx('What are the notice period rules?', {
      province: null,
      isFederallyRegulated: null,
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.status).toBe('unknown');
    expect(response.route.legalBasisAllowed).toBe(false);
    expect(response.workspace?.legalBasis).toBeUndefined();
  });

  test('legalBasisAllowed is true when jurisdiction is known', async () => {
    const ctx = makeCtx('What are the notice period rules?', {
      province: 'ON',
      isFederallyRegulated: null,
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.status).toBe('known');
    expect(response.route.legalBasisAllowed).toBe(true);
  });

  test('retrievalAllowed is false when enableRetrieval option is false', async () => {
    const ctx = makeCtx('What should I do if there is a harassment complaint?', {
      province: 'ON',
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.retrievalAllowed).toBe(false);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
  });

  test('workspaceAllowed is false when enableWorkspacePayload option is false', async () => {
    const ctx = makeCtx('What should I do if there is a harassment complaint?', {
      province: 'ON',
      enableRetrieval: false,
      enableWorkspacePayload: false,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.workspaceAllowed).toBe(false);
    expect(response.workspace).toBeUndefined();
  });

  test('suggestedDocumentsAllowed is false when enableDrafting option is false', async () => {
    const ctx = makeCtx('What should I do if there is a harassment complaint?', {
      province: 'ON',
      enableRetrieval: false,
      enableDrafting: false,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.suggestedDocumentsAllowed).toBe(false);
    expect(response.workspace?.suggestedDocuments).toBeUndefined();
  });
});

describe('Ambiguous routing', () => {
  test('vague input with no HR keywords routes to ambiguous / supportive_triage', () => {
    const ctx = makeCtx('Hello, I have a question');
    const response = routeAdvisorMessage(ctx);
    expect(response.intent).toBe('ambiguous');
    expect(response.responseMode).toBe('supportive_triage');
    expect(response.surface).toBe('advisor_chat');
    expect(response.retrievalAllowed).toBe(false);
    expect(response.workspaceAllowed).toBe(false);
    expect(response.legalBasisAllowed).toBe(false);
    expect(response.suggestedDocumentsAllowed).toBe(false);
  });
});
