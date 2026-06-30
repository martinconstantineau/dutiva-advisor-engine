/// <reference types="vitest/globals" />
/**
 * Fallback topic-boundary tests.
 *
 * Verifies that deterministic fallbacks (used when no LLM key is configured) are
 * topic-scoped and do not bleed termination/severance facts into non-termination routes.
 *
 * Covers:
 *
 * Fix 2 — Accommodation fallback:
 *   - Does not mention severance, termination notice, pay in lieu, or length of service
 *   - Includes confidentiality/privacy, functional information, no diagnosis, accommodation/leave,
 *     documentation, anti-reprisal/non-discrimination, and jurisdiction
 *   - French accommodation fallback is French and includes equivalent concepts
 *   - Accommodation fallback does NOT ask for termination-specific missing facts
 *
 * Fix 6 — General HR fallback topic-scoping:
 *   - Harassment fallback does not ask for severance facts
 *   - Leave fallback does not ask for severance/termination facts
 *   - Pay/hours fallback does not ask for severance/termination facts
 *   - Termination fallback STILL asks for length of service, employment contract, etc.
 *   - Accommodation fallback does not ask for termination/discipline facts
 *
 * Fix 4 (regression) — Current-info fallback purity:
 *   - "What is the current minimum wage in Ontario?" with WEB_SEARCH_ENABLED=false:
 *       does not mention termination, severance, ESA notice, pay in lieu, harassment,
 *       accommodation, safety, reprisal, or "1 week per year"
 *   - "What changed in Ontario employment law this year?" remains bounded
 *   - "Current Canada Labour Code leave rules" with web disabled → current-verification warning
 *
 * Fix 5 (regression) — Jurisdiction + topic filtering not regressed:
 *   - Ontario harassment query does not expose federal retrievedGuidance
 *   - Ontario harassment query does not expose Ontario termination guidance
 *   - Ontario accommodation query does not expose harassment or termination guidance
 */

import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: `fallback-boundary-test-${Date.now()}`,
    userMessage,
    locale: 'en',
    province: null,
    isFederallyRegulated: null,
    enableRetrieval: false,
    enableWorkspacePayload: true,
    ...overrides,
  });
}

// Phrases that should never appear in accommodation/non-termination fallbacks
const TERMINATION_PHRASES = [
  /severance/i,
  /pay\s+in\s+lieu/i,
  /termination\s+(notice|pay|package|offer)/i,
  /without\s+cause/i,
  /length\s+of\s+service/i,
  /1\s+week\s+per\s+year/i,
  /employment\s+contract\s+terms/i,
  /offer\s+(or\s+severance|made)/i,
];

function containsTerminationFacts(text: string): boolean {
  return TERMINATION_PHRASES.some((p) => p.test(text));
}

// ─── Fix 2: Accommodation fallback content ────────────────────────────────────

describe('Fix 2 — accommodation fallback: no termination facts', () => {

  test('accommodation fallback does not mention severance', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability. What should I do?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings).toContain('LLM unavailable — using fallback response');
    const text = response.conversationalResponse;
    expect(text).not.toMatch(/severance/i);
    expect(text).not.toMatch(/pay\s+in\s+lieu/i);
    expect(text).not.toMatch(/length\s+of\s+service/i);
    expect(text).not.toMatch(/1\s+week\s+per\s+year/i);
    expect(text).not.toMatch(/termination\s+(notice|pay|package)/i);
  });

  test('accommodation fallback does not ask for termination-specific missing facts', async () => {
    const ctx = makeCtx('An employee asked for accommodation because of a medical condition. What should I do?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    expect(containsTerminationFacts(response.conversationalResponse)).toBe(false);
  });

  test('accommodation fallback includes confidentiality guidance', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability. What should I do?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/confidential/i);
  });

  test('accommodation fallback mentions not requesting unnecessary medical details / no diagnosis', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability. What should I do?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/diagnos/i);
  });

  test('accommodation fallback mentions accommodation or leave', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability. What should I do?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/accommodat|leave/i);
  });

  test('accommodation fallback mentions documentation', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability. What should I do?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/document/i);
  });

  test('accommodation fallback mentions anti-reprisal or non-discrimination', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability. What should I do?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/penali|discriminat|reprisal/i);
  });

  test('accommodation fallback mentions jurisdiction', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability. What should I do?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/jurisdiction|province|fédéral|feder/i);
  });

  test('French accommodation fallback is in French', async () => {
    const ctx = makeCtx('Un employé demande un accommodement pour un handicap. Que devons-nous faire?', { locale: 'fr' });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    // French response should include French accommodation concepts
    expect(response.conversationalResponse).toMatch(/accommodement|congé|confidentiel|handicap|diagnostic/i);
    // Should not contain termination facts
    expect(containsTerminationFacts(response.conversationalResponse)).toBe(false);
  });

  test('French accommodation fallback does not ask for termination facts', async () => {
    const ctx = makeCtx('Un employé a fourni des limitations fonctionnelles. Que faire?', { locale: 'fr' });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    expect(response.conversationalResponse).not.toMatch(/indemnité de départ|préavis de congédiement|durée du service/i);
  });
});

// ─── Fix 6: Non-termination routes do not get termination missing-facts ───────

describe('Fix 6 — non-termination route fallbacks have no termination missing facts', () => {

  test('harassment fallback does not ask for severance facts', async () => {
    const ctx = makeCtx('There has been a harassment complaint at work. What do we do?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('harassment_or_workplace_violence');
    expect(containsTerminationFacts(response.conversationalResponse)).toBe(false);
  });

  test('leave fallback does not ask for severance or termination facts', async () => {
    const ctx = makeCtx('What are the leave entitlements under the Canada Labour Code?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('leave_or_absence');
    expect(containsTerminationFacts(response.conversationalResponse)).toBe(false);
  });

  test('leave fallback mentions relevant leave facts (type of leave, jurisdiction)', async () => {
    const ctx = makeCtx('What leave entitlements apply under the Canada Labour Code?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('leave_or_absence');
    const text = response.conversationalResponse;
    expect(text).toMatch(/leave|congé/i);
    expect(text).toMatch(/jurisdiction|province|federal|fédéral/i);
  });

  test('pay/hours fallback does not ask for severance facts', async () => {
    const ctx = makeCtx('What are the overtime rules in Ontario?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('pay_hours_or_entitlements');
    expect(containsTerminationFacts(response.conversationalResponse)).toBe(false);
  });

  test('pay/hours fallback mentions pay-relevant facts', async () => {
    const ctx = makeCtx('What are the overtime rules in Ontario?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('pay_hours_or_entitlements');
    const text = response.conversationalResponse;
    expect(text).toMatch(/overtime|pay|wage|hours|heures|salaire/i);
  });

  test('termination fallback STILL asks for length of service and employment contract terms', async () => {
    const ctx = makeCtx('An employee was terminated without cause. What are they entitled to?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('termination_or_discipline');
    const text = response.conversationalResponse;
    // Termination route should mention termination-relevant missing facts
    expect(text).toMatch(/length\s+of\s+service|employment\s+contract|severance|offer/i);
  });

  test('accommodation fallback does not ask for termination facts when province is known', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability.', { province: 'ON' });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    // With province known, the general fallback would have kicked in — but accommodation has its own early return
    expect(containsTerminationFacts(response.conversationalResponse)).toBe(false);
  });

  test('general_hr_compliance fallback without termination keywords does not ask for termination facts', async () => {
    const ctx = makeCtx('What are the basic HR policies I need as an employer?', { province: 'ON' });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('general_hr_compliance');
    // Without termination keywords, should ask for general context not termination facts
    expect(response.conversationalResponse).not.toMatch(/severance/i);
    expect(response.conversationalResponse).not.toMatch(/pay\s+in\s+lieu/i);
    expect(response.conversationalResponse).not.toMatch(/length\s+of\s+service/i);
  });
});

// ─── Fix 4 (regression) — Current-info fallback purity ───────────────────────

describe('Fix 4 regression — current-info fallback does not bleed unrelated guidance', () => {

  const origWebSearchEnabled = process.env.WEB_SEARCH_ENABLED;
  beforeAll(() => { process.env.WEB_SEARCH_ENABLED = 'false'; });
  afterAll(() => {
    if (origWebSearchEnabled === undefined) {
      delete process.env.WEB_SEARCH_ENABLED;
    } else {
      process.env.WEB_SEARCH_ENABLED = origWebSearchEnabled;
    }
  });

  test('"What is the current minimum wage in Ontario?" with web disabled does not mention termination facts', async () => {
    const ctx = makeCtx('What is the current minimum wage in Ontario?', {
      province: 'ON',
      enableWebSearch: false,
    });
    const response = await composeAdvisorResponse(ctx);
    const text = response.conversationalResponse;
    expect(text).not.toMatch(/termination/i);
    expect(text).not.toMatch(/severance/i);
    expect(text).not.toMatch(/ESA\s+notice/i);
    expect(text).not.toMatch(/pay\s+in\s+lieu/i);
    expect(text).not.toMatch(/harassment/i);
    expect(text).not.toMatch(/accommodation/i);
    expect(text).not.toMatch(/1\s+week\s+per\s+year/i);
    // Must have a quality warning about current-source verification
    const hasCurrentInfoWarning = response.quality.warnings.some((w) => /current.source|web\s+search/i.test(w));
    expect(hasCurrentInfoWarning).toBe(true);
  });

  test('"What changed in Ontario employment law this year?" remains bounded', async () => {
    const ctx = makeCtx('What changed in Ontario employment law this year?', {
      province: 'ON',
      enableWebSearch: false,
    });
    const response = await composeAdvisorResponse(ctx);
    const text = response.conversationalResponse;
    // Should NOT answer from unrelated internal ESA termination guidance
    expect(text).not.toMatch(/1\s+week\s+per\s+year/i);
    expect(text).not.toMatch(/severance/i);
    // Should have a quality warning
    const hasCurrentInfoWarning = response.quality.warnings.some((w) => /current.source|web\s+search/i.test(w));
    expect(hasCurrentInfoWarning).toBe(true);
  });

  test('"Current Canada Labour Code leave rules" routes to leave_or_absence and emits current-verification warning when web disabled', async () => {
    const ctx = makeCtx('Current Canada Labour Code leave rules', {
      isFederallyRegulated: true,
      enableWebSearch: false,
    });
    const response = await composeAdvisorResponse(ctx);
    // Should route to leave_or_absence (not general_hr_compliance)
    expect(response.route.intent).toBe('leave_or_absence');
    // With web disabled, the current-info query should emit a warning
    const hasCurrentInfoWarning = response.quality.warnings.some((w) => /current.source|web\s+search/i.test(w));
    expect(hasCurrentInfoWarning).toBe(true);
  });

  test('"What is the current minimum wage in Ontario?" with missing Startpage config gives warning and no unrelated guidance', async () => {
    const savedBase = process.env.STARTPAGE_BASE_URL;
    const savedKey = process.env.STARTPAGE_API_KEY;
    delete process.env.STARTPAGE_BASE_URL;
    delete process.env.STARTPAGE_API_KEY;
    try {
      const ctx = makeCtx('What is the current minimum wage in Ontario?', {
        province: 'ON',
        enableWebSearch: true,
      });
      const response = await composeAdvisorResponse(ctx);
      const text = response.conversationalResponse;
      // No unrelated termination guidance
      expect(text).not.toMatch(/1\s+week\s+per\s+year/i);
      expect(text).not.toMatch(/termination\s+notice/i);
      // Must have a current-source warning
      const hasWarning = response.quality.warnings.some((w) => /current.source|web\s+search|Startpage|incomplete/i.test(w));
      expect(hasWarning).toBe(true);
    } finally {
      if (savedBase !== undefined) process.env.STARTPAGE_BASE_URL = savedBase;
      if (savedKey !== undefined) process.env.STARTPAGE_API_KEY = savedKey;
    }
  });
});

// ─── Fix 5 (regression) — Jurisdiction + topic filtering ─────────────────────
//
// Note: The public AdvisorRetrievedGuidanceItem type exposes `jurisdiction?: string`
// (set when the item's province !== 'ALL') and `topic: string`.
// Items with province=ALL have jurisdiction=undefined in the public payload.
// We verify that no cross-jurisdiction items appear:
//   - ON query: public items either have jurisdiction=undefined (ALL) or jurisdiction='ON'
//   - QC query: public items either have jurisdiction=undefined (ALL) or jurisdiction='QC'
//   - FEDERAL query: public items either have jurisdiction=undefined (ALL) or jurisdiction='FEDERAL'
//   - Unknown jurisdiction: all items have jurisdiction=undefined (ALL only)

describe('Fix 5 regression — public retrievedGuidance jurisdiction and topic filtering', () => {

  test('Ontario harassment query does not expose federal retrievedGuidance', async () => {
    const ctx = makeCtx('There has been a harassment complaint. What do we do?', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      for (const item of response.workspace.retrievedGuidance) {
        // Public jurisdiction field is set for province-specific items; must never be 'FEDERAL'
        expect(item.jurisdiction).not.toBe('FEDERAL');
        // May be undefined (ALL) or 'ON'; nothing else
        if (item.jurisdiction !== undefined) {
          expect(item.jurisdiction).toBe('ON');
        }
      }
    }
  });

  test('Ontario harassment query does not expose Ontario termination guidance (topic-alignment filter)', async () => {
    const ctx = makeCtx('There has been a harassment complaint. What do we do?', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      for (const item of response.workspace.retrievedGuidance) {
        // Topic field should not contain termination-related labels
        expect(item.topic).not.toMatch(/terminat|dismiss|notice\s+period|severance/i);
      }
    }
  });

  test('Ontario accommodation query does not expose harassment or termination guidance (topic-alignment)', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability.', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      for (const item of response.workspace.retrievedGuidance) {
        // Topic must not be harassment or termination guidance
        expect(item.topic).not.toMatch(/harassment|harc[eè]lement/i);
        expect(item.topic).not.toMatch(/terminat|dismiss|notice\s+period/i);
      }
    }
  });

  test('Unknown jurisdiction exposes only ALL items or no retrievedGuidance', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability.', {
      province: null,
      isFederallyRegulated: null,
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.status).toBe('unknown');
    if (response.workspace?.retrievedGuidance) {
      for (const item of response.workspace.retrievedGuidance) {
        // Unknown jurisdiction: only ALL items returned; jurisdiction field must be undefined
        expect(item.jurisdiction).toBeUndefined();
      }
    }
  });

  test('Québec harassment query does not expose Ontario or federal guidance', async () => {
    const ctx = makeCtx('There has been a harassment complaint. What do we do?', {
      province: 'QC',
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      for (const item of response.workspace.retrievedGuidance) {
        expect(item.jurisdiction).not.toBe('ON');
        expect(item.jurisdiction).not.toBe('FEDERAL');
        // May be undefined (ALL) or 'QC'
        if (item.jurisdiction !== undefined) {
          expect(item.jurisdiction).toBe('QC');
        }
      }
    }
  });

  test('Federal harassment query does not expose Ontario or Québec guidance', async () => {
    const ctx = makeCtx('There has been a harassment complaint. What do we do?', {
      isFederallyRegulated: true,
      enableRetrieval: true,
    });
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      for (const item of response.workspace.retrievedGuidance) {
        expect(item.jurisdiction).not.toBe('ON');
        expect(item.jurisdiction).not.toBe('QC');
        // May be undefined (ALL) or 'FEDERAL'
        if (item.jurisdiction !== undefined) {
          expect(item.jurisdiction).toBe('FEDERAL');
        }
      }
    }
  });
});
