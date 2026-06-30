/// <reference types="vitest/globals" />
/**
 * The request handler now detects an explicit jurisdiction stated inline in the
 * current message (not only in structured fields or prior history), so a first
 * message like "I'm an Ontario employer…" resolves jurisdiction without the
 * frontend setting `province`. Structured fields still take precedence, and a
 * message with no explicit jurisdiction still resolves to unknown.
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

async function resolveJurisdiction(body: Record<string, unknown>) {
  const req = makeReq({ options: { enableRetrieval: false }, ...body });
  const res = makeRes();
  await advisorRespond(req, res as unknown as Response);
  return res.getData() as { jurisdiction?: { status: string; province?: string | null } };
}

describe('inline jurisdiction detection in the current message', () => {
  test('"I\'m an Ontario employer" resolves ON without a structured province', async () => {
    const body = await resolveJurisdiction({
      sessionId: 'inline-on',
      userMessage: "I'm an Ontario employer and an employee just resigned. What notice do I owe?",
    });
    expect(body.jurisdiction?.status).toBe('known');
    expect(body.jurisdiction?.province).toBe('ON');
  });

  test('"federally regulated" resolves FEDERAL', async () => {
    const body = await resolveJurisdiction({
      sessionId: 'inline-fed',
      userMessage: 'We are a federally regulated trucking company. What are the termination rules?',
    });
    expect(body.jurisdiction?.status).toBe('known');
    expect(body.jurisdiction?.province).toBe('FEDERAL');
  });

  test('"au Québec" resolves QC', async () => {
    const body = await resolveJurisdiction({
      sessionId: 'inline-qc',
      userMessage: 'Nous sommes au Québec. Quelles sont les règles de congé applicables?',
    });
    expect(body.jurisdiction?.status).toBe('known');
    expect(body.jurisdiction?.province).toBe('QC');
  });

  test('a message with no explicit jurisdiction stays unknown', async () => {
    const body = await resolveJurisdiction({
      sessionId: 'inline-none',
      userMessage: 'What notice do I owe an employee I am letting go?',
    });
    expect(body.jurisdiction?.status).toBe('unknown');
  });

  test('a structured province takes precedence over an inline mention', async () => {
    const body = await resolveJurisdiction({
      sessionId: 'inline-precedence',
      userMessage: 'I think we might be in Ontario, but confirm — what are the rules?',
      province: 'QC',
    });
    expect(body.jurisdiction?.province).toBe('QC');
  });
});
