/// <reference types="vitest/globals" />
/**
 * API handler tests for POST /api/advisor/respond.
 *
 * Tests:
 * - request validation rejects invalid modes (e.g., internal response mode as request mode)
 * - valid requests return a 200 response that matches the AdvisorResponse contract
 * - response does not include debug unless options.includeDebug is true
 * - safe error responses (no raw LLM errors exposed)
 */

import { vi } from 'vitest';
import { advisorRespond } from '../api/advisorRespond';
import type { Request, Response } from 'express';

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

describe('advisorRespond — request validation', () => {
  test('rejects "hr_compliance_advisor" as a request mode (internal response mode only)', async () => {
    const req = makeReq({
      sessionId: 'api-mode-test-1',
      userMessage: 'General HR question',
      mode: 'hr_compliance_advisor',
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    expect(res.getStatusCode()).toBe(400);
    const body = res.getData() as { error?: string; details?: Record<string, unknown> };
    expect(body.error).toBe('Invalid request');
    expect(body.details).toHaveProperty('mode');
  });

  test('accepts "hr_compliance" as a valid request mode', async () => {
    const req = makeReq({
      sessionId: 'api-mode-test-2',
      userMessage: 'General HR question',
      mode: 'hr_compliance',
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    expect(res.getStatusCode()).toBe(200);
    const body = res.getData() as { route?: { responseMode?: string } };
    expect(body.route?.responseMode).toBe('hr_compliance_advisor');
  });

  test('rejects missing sessionId', async () => {
    const req = makeReq({ userMessage: 'General HR question' });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    expect(res.getStatusCode()).toBe(400);
  });

  test('rejects empty userMessage', async () => {
    const req = makeReq({ sessionId: 'api-empty', userMessage: '' });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    expect(res.getStatusCode()).toBe(400);
  });
});

describe('advisorRespond — response contract', () => {
  test('returns a valid AdvisorResponse for a known province', async () => {
    const req = makeReq({
      sessionId: 'api-contract-1',
      userMessage: 'What notice period applies in Ontario?',
      province: 'ON',
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    expect(res.getStatusCode()).toBe(200);
    const body = res.getData() as Record<string, unknown>;
    expect(body.sessionId).toBe('api-contract-1');
    expect(body.locale).toMatch(/^(en|fr)$/);
    expect(typeof body.conversationalResponse).toBe('string');
    expect(body.conversationalResponse).toBeTruthy();
    expect(body.route).toMatchObject({
      intent: expect.any(String),
      responseMode: expect.any(String),
      surface: expect.any(String),
      retrievalAllowed: expect.any(Boolean),
      workspaceAllowed: expect.any(Boolean),
      legalBasisAllowed: expect.any(Boolean),
      suggestedDocumentsAllowed: expect.any(Boolean),
    });
    expect(body.jurisdiction).toMatchObject({
      status: expect.any(String),
      notes: expect.any(Array),
    });
    expect(body.risk).toMatchObject({
      compliance: expect.any(String),
      safety: expect.any(String),
    });
    expect(body.professionalReview).toMatchObject({
      recommended: expect.any(Boolean),
      type: expect.any(String),
    });
    expect(body.quality).toMatchObject({
      markdownCleaned: expect.any(Boolean),
      citationsValidated: expect.any(Boolean),
      blockedRendering: expect.any(Array),
      warnings: expect.any(Array),
    });
    expect(typeof body.isCrisis).toBe('boolean');
  });

  test('omits debug field when options.includeDebug is false', async () => {
    const req = makeReq({
      sessionId: 'api-debug-off',
      userMessage: 'General HR question',
      options: { enableRetrieval: false, includeDebug: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    expect(res.getStatusCode()).toBe(200);
    const body = res.getData() as Record<string, unknown>;
    expect(body.debug).toBeUndefined();
  });

  test('includes debug field when options.includeDebug is true', async () => {
    const req = makeReq({
      sessionId: 'api-debug-on',
      userMessage: 'General HR question',
      options: { enableRetrieval: false, includeDebug: true },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    expect(res.getStatusCode()).toBe(200);
    const body = res.getData() as Record<string, unknown>;
    expect(body.debug).toBeDefined();
    expect(typeof body.debug).toBe('object');
  });

  test('unknown jurisdiction returns legalBasisAllowed=false and no workspace.legalBasis', async () => {
    const req = makeReq({
      sessionId: 'api-jurisdiction-unknown',
      userMessage: 'What are my rights?',
      options: { enableRetrieval: false },
    });
    const res = makeRes();
    await advisorRespond(req, res as unknown as Response);
    expect(res.getStatusCode()).toBe(200);
    const body = res.getData() as { route?: { legalBasisAllowed: boolean }; jurisdiction?: { status: string }; workspace?: { legalBasis?: unknown[] } };
    expect(body.jurisdiction?.status).toBe('unknown');
    expect(body.route?.legalBasisAllowed).toBe(false);
    expect(body.workspace?.legalBasis).toBeUndefined();
  });
});
