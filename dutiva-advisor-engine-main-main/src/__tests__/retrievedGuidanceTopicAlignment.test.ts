/// <reference types="vitest/globals" />
/**
 * Topic-alignment regression tests for public workspace.retrievedGuidance.
 *
 * The central concern: for accommodation / medical-disclosure / modified-duties queries,
 * public workspace.retrievedGuidance must include ONLY topic-aligned items
 * (accommodation, medical_disclosure, and 'general') — even when the jurisdiction
 * is known (e.g. Ontario) and jurisdiction-matching items from other categories
 * (termination, harassment, leave, safety, reprisal) scored above the threshold.
 *
 * Covers:
 *
 * A — Medical restrictions / modified duties (no leave, no reprisal, no safety mentioned):
 *   - route.intent === employee_medical_or_accommodation
 *   - public retrievedGuidance has no termination items
 *   - public retrievedGuidance has no harassment items
 *   - public retrievedGuidance has no leave items (leave not mentioned)
 *   - public retrievedGuidance has no reprisal items (reprisal not mentioned)
 *   - public retrievedGuidance has no workplace_safety items (safety not mentioned)
 *
 * B — Doctor's note / functional abilities:
 *   - route.intent === employee_medical_or_accommodation
 *   - public retrievedGuidance includes medical_disclosure and/or accommodation items
 *   - no termination, no harassment, no safety, no reprisal, no leave
 *
 * C — Modified work / return to work restrictions:
 *   - route.intent === employee_medical_or_accommodation
 *   - retrievedGuidance topic-aligned to accommodation/medical_disclosure only
 *
 * D — Accommodation + leave explicitly mentioned:
 *   - route.intent === employee_medical_or_accommodation (or leave_or_absence)
 *   - retrievedGuidance may include accommodation/medical_disclosure AND leave items
 *   - no termination, no harassment, no safety (unless mentioned), no reprisal (unless mentioned)
 *
 * E — Reprisal explicitly mentioned:
 *   - retrievedGuidance may include accommodation AND reprisal items
 *   - no termination unless mentioned, no harassment unless mentioned
 *
 * F — Safety explicitly mentioned:
 *   - retrievedGuidance may include accommodation/medical_disclosure AND workplace_safety
 *   - no termination, no harassment unless mentioned, no reprisal unless mentioned
 *
 * G — Route-intent fallback topic-filter (Fix 3):
 *   - When getQueryTopicCategories() returns [] (unknown terms), route.intent drives filtering
 *   - employee_medical_or_accommodation intent → only accommodation/medical_disclosure allowed
 *   - harassment_or_workplace_violence intent → only harassment allowed
 *   - leave_or_absence intent → only leave allowed
 *   - pay_hours_or_entitlements intent → only compensation allowed
 *
 * H — Regression: existing current-info purity not broken
 *   - Minimum wage with web disabled: no termination guidance in response
 *   - Ontario harassment: no federal items, no termination items in retrievedGuidance
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
    sessionId: `topic-align-test-${Date.now()}`,
    userMessage,
    locale: 'en',
    province: 'ON',           // Ontario so there are jurisdiction-matching items of every category
    isFederallyRegulated: null,
    enableRetrieval: true,
    enableWorkspacePayload: true,
    includeDebug: false,
    ...overrides,
  });
}

/**
 * Check that no retrieved guidance item has a title matching the given category labels.
 * Since the public type only has `topic` (the title), we detect category by title keywords.
 */
function hasTopicByTitle(
  items: { topic: string }[],
  pattern: RegExp,
): boolean {
  return items.some((item) => pattern.test(item.topic));
}

// ─── Case A: Medical restrictions / modified duties ───────────────────────────

describe('Case A — medical restrictions and modified duties', () => {

  test('routes to employee_medical_or_accommodation', async () => {
    const ctx = makeCtx('What should we do with medical restrictions and modified duties?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
  });

  test('public retrievedGuidance has no termination items', async () => {
    const ctx = makeCtx('What should we do with medical restrictions and modified duties?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice|severance|ESA.*minim/i)).toBe(false);
    }
  });

  test('public retrievedGuidance has no harassment items', async () => {
    const ctx = makeCtx('What should we do with medical restrictions and modified duties?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|violence|bullying/i)).toBe(false);
    }
  });

  test('public retrievedGuidance has no leave items (leave not mentioned in query)', async () => {
    const ctx = makeCtx('What should we do with medical restrictions and modified duties?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /statutory leaves|leave entitlement|parental leave|maternity/i)).toBe(false);
    }
  });

  test('public retrievedGuidance has no reprisal items (reprisal not mentioned)', async () => {
    const ctx = makeCtx('What should we do with medical restrictions and modified duties?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /reprisal|retaliation/i)).toBe(false);
    }
  });

  test('public retrievedGuidance has no workplace safety / right-to-refuse items (safety not mentioned)', async () => {
    const ctx = makeCtx('What should we do with medical restrictions and modified duties?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /right to refuse|unsafe work|safety|OHSA/i)).toBe(false);
    }
  });

  test('public retrievedGuidance contains only accommodation or medical_disclosure items when items are returned', async () => {
    const ctx = makeCtx('What should we do with medical restrictions and modified duties?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance && response.workspace.retrievedGuidance.length > 0) {
      // Each item should be about accommodation or medical disclosure, not other topics
      for (const item of response.workspace.retrievedGuidance) {
        const isAccommodation = /accommodat|duty to accommodate|disability|undue hardship/i.test(item.topic);
        const isMedicalDisclosure = /medical disclosure|functional|doctor|medical information/i.test(item.topic);
        expect(isAccommodation || isMedicalDisclosure).toBe(true);
      }
    }
  });

  test('same query with French locale also returns only accommodation/medical items', async () => {
    const ctx = makeCtx('Que faire avec des restrictions médicales et des tâches modifiées?', { locale: 'fr', province: 'QC' });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice|severance/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|violence/i)).toBe(false);
    }
  });
});

// ─── Case B: Doctor's note / functional abilities ────────────────────────────

describe("Case B — doctor's note and functional limitations", () => {

  test('routes to employee_medical_or_accommodation', async () => {
    const ctx = makeCtx("An employee gave us a doctor's note with functional limitations. What can we ask for?");
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
  });

  test('no termination items in retrievedGuidance', async () => {
    const ctx = makeCtx("An employee gave us a doctor's note with functional limitations. What can we ask for?");
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice|severance/i)).toBe(false);
    }
  });

  test('no harassment items in retrievedGuidance', async () => {
    const ctx = makeCtx("An employee gave us a doctor's note with functional limitations. What can we ask for?");
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|violence/i)).toBe(false);
    }
  });

  test('no workplace safety items (safety not mentioned)', async () => {
    const ctx = makeCtx("An employee gave us a doctor's note with functional limitations. What can we ask for?");
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /right to refuse|unsafe work|OHSA/i)).toBe(false);
    }
  });

  test('no reprisal items (reprisal not mentioned)', async () => {
    const ctx = makeCtx("An employee gave us a doctor's note with functional limitations. What can we ask for?");
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /reprisal|retaliation/i)).toBe(false);
    }
  });

  test('no leave items (leave not mentioned)', async () => {
    const ctx = makeCtx("An employee gave us a doctor's note with functional limitations. What can we ask for?");
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /statutory leaves|leave entitlement|parental|maternity/i)).toBe(false);
    }
  });
});

// ─── Case C: Modified work / return to work restrictions ─────────────────────

describe('Case C — return to work with restrictions and modified duties', () => {

  test('routes to employee_medical_or_accommodation', async () => {
    const ctx = makeCtx('An employee is returning to work with restrictions and needs modified duties.');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
  });

  test('retrievedGuidance is topic-aligned to accommodation/medical_disclosure only', async () => {
    const ctx = makeCtx('An employee is returning to work with restrictions and needs modified duties.');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|violence/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /reprisal|retaliat/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /right to refuse|unsafe work/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /statutory leaves|parental leave|maternity/i)).toBe(false);
    }
  });
});

// ─── Case D: Accommodation + leave explicitly mentioned ──────────────────────

describe('Case D — accommodation and leave both explicitly mentioned', () => {

  test('retrievedGuidance may include accommodation and leave items', async () => {
    const ctx = makeCtx('An employee has medical restrictions and asked for medical leave.');
    const response = await composeAdvisorResponse(ctx);
    // Route may be medical/accommodation or leave — either is acceptable
    expect(['employee_medical_or_accommodation', 'leave_or_absence']).toContain(response.route.intent);
    if (response.workspace?.retrievedGuidance) {
      // Must not include unrelated categories
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice\s+period|severance/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|violence/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /reprisal|retaliat/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /right to refuse|unsafe work/i)).toBe(false);
    }
  });

  test('accommodation with sick leave — no termination items', async () => {
    const ctx = makeCtx('Employee needs accommodation and sick leave for a medical condition.');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice|severance/i)).toBe(false);
    }
  });
});

// ─── Case E: Reprisal explicitly mentioned ───────────────────────────────────

describe('Case E — accommodation + reprisal explicitly mentioned', () => {

  test('retrievedGuidance may include accommodation and reprisal items', async () => {
    const ctx = makeCtx("An employee asked for accommodation and says their manager retaliated.");
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    if (response.workspace?.retrievedGuidance) {
      // Accommodation and reprisal items are allowed since reprisal is explicitly mentioned
      // But termination should not appear (not mentioned)
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice\s+period|severance/i)).toBe(false);
      // Harassment also not mentioned
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|bullying|workplace violence/i)).toBe(false);
    }
  });

  test('reprisal category allowed when retaliation is in query', async () => {
    const ctx = makeCtx('Employee requested accommodation and faced retaliation from supervisor.');
    const response = await composeAdvisorResponse(ctx);
    // The engine should not suppress reprisal items when retaliation is explicitly mentioned
    // (We can't guarantee items are returned since retrieval depends on scores,
    // but we can verify no forbidden categories appear)
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|severance/i)).toBe(false);
    }
  });
});

// ─── Case F: Safety explicitly mentioned ─────────────────────────────────────

describe('Case F — accommodation + immediate safety concern', () => {

  test('retrievedGuidance may include accommodation and workplace_safety items', async () => {
    const ctx = makeCtx("An employee's medical restrictions create an immediate safety concern with machine operation.");
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    if (response.workspace?.retrievedGuidance) {
      // Termination should not appear (not mentioned)
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice\s+period|severance/i)).toBe(false);
      // Reprisal should not appear (not mentioned)
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /reprisal|retaliat/i)).toBe(false);
    }
  });

  test('safety concern query uses high_risk_escalation mode', async () => {
    const ctx = makeCtx("An employee's medical restrictions create an immediate safety concern with machine operation.");
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.responseMode).toBe('high_risk_escalation');
  });
});

// ─── Case G: Route-intent fallback topic-filter ──────────────────────────────

describe('Case G — route-intent fallback when query category detection returns empty', () => {
  // These queries are contrived to use phrasing that won't match getQueryTopicCategories,
  // but the route.intent from routeAdvisorMessage is specific. The intent should drive filtering.

  test('employee_medical_or_accommodation intent: no termination items in retrievedGuidance', async () => {
    // Phrasing that matches ACCOMMODATION_PATTERNS via "functional abilities form"
    // (a known pattern in the router). Even if query-level topic detection could miss
    // some variants, the intent-based fallback ensures termination items are excluded.
    const ctx = makeCtx('The employee returned a completed functional abilities form. What are our next steps?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice\s+period|severance/i)).toBe(false);
    }
  });

  test('harassment_or_workplace_violence intent: no termination or accommodation items', async () => {
    const ctx = makeCtx('There has been a harassment complaint. What do we do?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('harassment_or_workplace_violence');
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice\s+period|severance/i)).toBe(false);
      // Accommodation items should not appear for a harassment-only query
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /duty to accommodate|disability accommodation/i)).toBe(false);
    }
  });

  test('leave_or_absence intent: no termination or harassment items', async () => {
    const ctx = makeCtx('What are the leave entitlements under the Canada Labour Code?', { isFederallyRegulated: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('leave_or_absence');
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|severance/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|bullying/i)).toBe(false);
    }
  });

  test('pay_hours_or_entitlements intent: no termination or harassment items', async () => {
    const ctx = makeCtx('What are the overtime rules in Ontario?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('pay_hours_or_entitlements');
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|severance/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|bullying/i)).toBe(false);
    }
  });
});

// ─── Case H: Current-info regression ─────────────────────────────────────────

describe('Case H — current-info purity regression', () => {

  const origWebSearchEnabled = process.env.WEB_SEARCH_ENABLED;
  beforeAll(() => { process.env.WEB_SEARCH_ENABLED = 'false'; });
  afterAll(() => {
    if (origWebSearchEnabled === undefined) {
      delete process.env.WEB_SEARCH_ENABLED;
    } else {
      process.env.WEB_SEARCH_ENABLED = origWebSearchEnabled;
    }
  });

  test('"What is the current minimum wage in Ontario?" with web disabled does not include termination guidance in conversationalResponse', async () => {
    const ctx = makeCtx('What is the current minimum wage in Ontario?', {
      enableWebSearch: false,
    });
    const response = await composeAdvisorResponse(ctx);
    const text = response.conversationalResponse;
    expect(text).not.toMatch(/1\s+week\s+per\s+year/i);
    expect(text).not.toMatch(/termination\s+notice/i);
    expect(text).not.toMatch(/severance\s+(pay|package)/i);
  });

  test('Ontario harassment query does not expose federal retrievedGuidance', async () => {
    const ctx = makeCtx('There has been a harassment complaint in the workplace.');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      for (const item of response.workspace.retrievedGuidance) {
        expect(item.jurisdiction).not.toBe('FEDERAL');
        if (item.jurisdiction !== undefined) {
          expect(item.jurisdiction).toBe('ON');
        }
      }
    }
  });

  test('Ontario harassment query does not expose termination items', async () => {
    const ctx = makeCtx('There has been a harassment complaint in the workplace.');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|severance|notice/i)).toBe(false);
    }
  });

  test('Ontario accommodation query does not expose harassment or termination items', async () => {
    const ctx = makeCtx('An employee requested accommodation for a disability.');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|workplace violence/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|severance/i)).toBe(false);
    }
  });
});
