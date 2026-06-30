/// <reference types="vitest/globals" />
/**
 * Jurisdiction handling and context conflict tests.
 *
 * Tests:
 * - Missing province + unknown federal = jurisdiction.status "unknown"
 * - No Ontario default
 * - isFederallyRegulated null stays unknown
 * - Province + companyContext conflict generates notes and quality warnings
 * - Federal status conflict generates notes and quality warnings
 */

import { vi } from 'vitest';
import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import { advisorRespond } from '../api/advisorRespond';
import type { Request, Response } from 'express';

function makeCtx(overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {}) {
  return buildPipelineContext({
    sessionId: `jur-test-${Date.now()}`,
    userMessage: 'What should I do about a harassment complaint?',
    locale: 'en',
    province: null,
    isFederallyRegulated: null,
    enableRetrieval: false,
    enableWorkspacePayload: true,
    ...overrides,
  });
}

describe('Jurisdiction — no Ontario default', () => {
  test('no province + unknown federal → jurisdiction.status = unknown', async () => {
    const ctx = makeCtx({ province: null, isFederallyRegulated: null });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.status).toBe('unknown');
    expect(response.jurisdiction.province).toBeFalsy();
  });

  test('no province + isFederallyRegulated false → jurisdiction.status = unknown', async () => {
    const ctx = makeCtx({ province: null, isFederallyRegulated: false });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.status).toBe('unknown');
    expect(response.jurisdiction.province).toBeFalsy();
  });

  test('isFederallyRegulated null stays null in response (not false)', async () => {
    const ctx = makeCtx({ province: null, isFederallyRegulated: null });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.isFederallyRegulated).toBeNull();
  });

  test('isFederallyRegulated true → province = FEDERAL, status = known', async () => {
    const ctx = makeCtx({ province: null, isFederallyRegulated: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.status).toBe('known');
    expect(response.jurisdiction.province).toBe('FEDERAL');
  });

  test('province ON provided → status = known, province = ON', async () => {
    const ctx = makeCtx({ province: 'ON', isFederallyRegulated: null });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.status).toBe('known');
    expect(response.jurisdiction.province).toBe('ON');
  });

  test('jurisdiction unknown → jurisdiction appears in workspace.missingFacts', async () => {
    const ctx = makeCtx({
      userMessage: 'An employee told me they are depressed. What should I do?',
      province: null,
      isFederallyRegulated: null,
      enableRetrieval: false,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.missingFacts) {
      const mentionsJurisdiction = response.workspace.missingFacts.some(
        (f) => /province|jurisdiction|federal/i.test(f),
      );
      expect(mentionsJurisdiction).toBe(true);
    }
    // jurisdiction.notes should mention unknown state
    expect(response.jurisdiction.notes.some((n) => /unknown/i.test(n))).toBe(true);
  });
});

describe('Context conflicts — province and federal jurisdiction', () => {
  test('request province ON + companyContext province QC → conflict note in jurisdiction.notes', async () => {
    const ctx = buildPipelineContext({
      sessionId: 'conflict-test-1',
      userMessage: 'An employee told me they are depressed. What should I do?',
      province: 'ON',
      isFederallyRegulated: null,
      contextConflicts: [
        'Conflicting jurisdiction context: request province is ON but companyContext.province is QC. The applicable jurisdiction should be confirmed before relying on province-specific guidance.',
      ],
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    const allNotes = response.jurisdiction.notes.join(' ');
    expect(allNotes).toMatch(/conflicting|conflict|QC|ON/i);
  });

  test('conflict → quality.warnings includes conflict warning', async () => {
    const ctx = buildPipelineContext({
      sessionId: 'conflict-test-2',
      userMessage: 'An employee told me they are depressed. What should I do?',
      province: 'ON',
      isFederallyRegulated: null,
      contextConflicts: [
        'Conflicting jurisdiction context: request province is ON but companyContext.province is QC. The applicable jurisdiction should be confirmed before relying on province-specific guidance.',
      ],
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    const allWarnings = response.quality.warnings.join(' ');
    expect(allWarnings).toMatch(/conflict/i);
  });

  test('conflict → route.legalBasisAllowed is false and workspace.legalBasis is omitted', async () => {
    const ctx = buildPipelineContext({
      sessionId: 'conflict-test-3',
      userMessage: 'What are the notice period rules?',
      province: 'ON',
      isFederallyRegulated: null,
      contextConflicts: [
        'Conflicting jurisdiction context: request province is ON but companyContext.province is QC. The applicable jurisdiction should be confirmed.',
      ],
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    // legal basis gate must be false for the final response
    expect(response.route.legalBasisAllowed).toBe(false);
    expect(response.workspace?.legalBasis).toBeUndefined();
    // legal basis items (if any) must not silently mix ON and QC law
    if (response.workspace?.legalBasis) {
      for (const item of response.workspace.legalBasis) {
        expect(['requires_review', 'suppressed']).toContain(item.validationStatus);
      }
    }
  });
});

describe('Context precedence — userContext.preferredProvince and history', () => {
  function makeReq(body: unknown): Request {
    return { body } as Request;
  }

  function makeRes() {
    let statusCode = 200;
    const data: unknown[] = [];
    const res = {
      status: vi.fn().mockImplementation((code: number) => { statusCode = code; return res; }),
      json: vi.fn().mockImplementation((d: unknown) => { data.push(d); return res; }),
      getStatusCode: () => statusCode,
      getData: () => data[0],
    };
    return res as unknown as Response & { getStatusCode: () => number; getData: () => unknown };
  }

  test('userContext.preferredProvince is used when request province is omitted', async () => {
    const req = makeReq({
      sessionId: 'precedence-test-1',
      userMessage: 'What are my termination rights?',
      userContext: { preferredProvince: 'ON' },
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    const body = res.getData() as { jurisdiction?: { status?: string; province?: string | null } };
    expect(res.getStatusCode()).toBe(200);
    expect(body.jurisdiction?.status).toBe('known');
    expect(body.jurisdiction?.province).toBe('ON');
  });

  test('request province overrides userContext.preferredProvince', async () => {
    const req = makeReq({
      sessionId: 'precedence-test-2',
      userMessage: 'What are my termination rights?',
      province: 'QC',
      userContext: { preferredProvince: 'ON' },
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    const body = res.getData() as { jurisdiction?: { status?: string; province?: string | null } };
    expect(body.jurisdiction?.province).toBe('QC');
  });

  test('province extracted from history is used as last resort', async () => {
    const req = makeReq({
      sessionId: 'precedence-test-3',
      userMessage: 'What are my rights?',
      history: [
        { role: 'user', content: 'I work in Ontario' },
      ],
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    const body = res.getData() as { jurisdiction?: { status?: string; province?: string | null } };
    expect(body.jurisdiction?.province).toBe('ON');
  });

  test('history "I need Canadian HR guidance" does not infer FEDERAL', async () => {
    const req = makeReq({
      sessionId: 'history-canada-test',
      userMessage: 'What are my rights?',
      history: [
        { role: 'user', content: 'I need Canadian HR guidance' },
      ],
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    const body = res.getData() as { jurisdiction?: { status?: string; province?: string | null } };
    expect(res.getStatusCode()).toBe(200);
    expect(body.jurisdiction?.status).toBe('unknown');
    expect(body.jurisdiction?.province).toBeFalsy();
  });

  test('history "federally regulated" infers FEDERAL', async () => {
    const req = makeReq({
      sessionId: 'history-federal-test',
      userMessage: 'What are my rights?',
      history: [
        { role: 'user', content: 'The employer is federally regulated' },
      ],
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    const body = res.getData() as { jurisdiction?: { status?: string; province?: string | null } };
    expect(res.getStatusCode()).toBe(200);
    expect(body.jurisdiction?.status).toBe('known');
    expect(body.jurisdiction?.province).toBe('FEDERAL');
  });

  test('history "Canada Labour Code applies" infers FEDERAL', async () => {
    const req = makeReq({
      sessionId: 'history-clc-test',
      userMessage: 'What are my rights?',
      history: [
        { role: 'user', content: 'Canada Labour Code applies' },
      ],
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    const body = res.getData() as { jurisdiction?: { status?: string; province?: string | null } };
    expect(res.getStatusCode()).toBe(200);
    expect(body.jurisdiction?.status).toBe('known');
    expect(body.jurisdiction?.province).toBe('FEDERAL');
  });

  test('userContext.preferredProvince conflict with request province surfaces warning and disables legalBasis', async () => {
    const req = makeReq({
      sessionId: 'precedence-test-4',
      userMessage: 'What are my termination rights?',
      province: 'ON',
      userContext: { preferredProvince: 'QC' },
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    const body = res.getData() as {
      jurisdiction?: { notes?: string[] };
      quality?: { warnings?: string[] };
      route?: { legalBasisAllowed?: boolean };
    };
    const notes = body.jurisdiction?.notes?.join(' ') ?? '';
    const warnings = body.quality?.warnings?.join(' ') ?? '';
    expect(notes + warnings).toMatch(/conflict/i);
    expect(body.route?.legalBasisAllowed).toBe(false);
  });
});

describe('Context conflict detection via request handler', () => {
  function makeReq(body: unknown): Request {
    return { body } as Request;
  }

  function makeRes() {
    let statusCode = 200;
    const data: unknown[] = [];
    const res = {
      status: vi.fn().mockImplementation((code: number) => { statusCode = code; return res; }),
      json: vi.fn().mockImplementation((d: unknown) => { data.push(d); return res; }),
      getStatusCode: () => statusCode,
      getData: () => data[0],
    };
    return res as unknown as Response & { getStatusCode: () => number; getData: () => unknown };
  }

  test('province ON + companyContext.province QC → 200 with conflict notes in response', async () => {
    const req = makeReq({
      sessionId: 'handler-conflict-test',
      userMessage: 'What should I do about a harassment complaint?',
      province: 'ON',
      companyContext: { province: 'QC' },
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    const body = res.getData() as { jurisdiction?: { notes?: string[] }; quality?: { warnings?: string[] } };
    // Should return a response, not an error
    expect(res.getStatusCode()).toBe(200);
    // Should surface conflict in notes or warnings
    const notes = body?.jurisdiction?.notes?.join(' ') ?? '';
    const warnings = body?.quality?.warnings?.join(' ') ?? '';
    expect(notes + warnings).toMatch(/conflict/i);
  });
});
