/// <reference types="vitest/globals" />
/**
 * Doctor-note / functional-limitation / medical-information route precision tests.
 *
 * Verifies:
 * - English and French doctor-note/functional-limitation queries route to
 *   employee_medical_or_accommodation (not general_hr_compliance or ambiguous).
 * - Deterministic fallback for these queries is accommodation-specific, not
 *   termination/severance-style.
 * - Public workspace.retrievedGuidance is topic-aligned (accommodation/medical_disclosure
 *   only) and excludes termination, harassment, leave, safety, and reprisal items
 *   unless those topics are explicitly mentioned.
 * - Route-intent fallback protection: a query carrying a medical_disclosure or
 *   accommodation signal cannot be left as general_hr_compliance, while crisis,
 *   harassment, and termination remain correctly routed when they are explicit.
 */

import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { AdvisorPipelineContext } from '../workspace/workspaceTypes';

// ─── Environment safety ───────────────────────────────────────────────────────

const ORIGINAL_QWEN_API_KEY = process.env['QWEN_API_KEY'];
const ORIGINAL_WEB_SEARCH_ENABLED = process.env['WEB_SEARCH_ENABLED'];

beforeAll(() => {
  // Ensure deterministic fallback runs and no live web search calls are made.
  delete process.env['QWEN_API_KEY'];
  process.env['WEB_SEARCH_ENABLED'] = 'false';
});

afterAll(() => {
  if (ORIGINAL_QWEN_API_KEY === undefined) {
    delete process.env['QWEN_API_KEY'];
  } else {
    process.env['QWEN_API_KEY'] = ORIGINAL_QWEN_API_KEY;
  }
  if (ORIGINAL_WEB_SEARCH_ENABLED === undefined) {
    delete process.env['WEB_SEARCH_ENABLED'];
  } else {
    process.env['WEB_SEARCH_ENABLED'] = ORIGINAL_WEB_SEARCH_ENABLED;
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: `doctor-note-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userMessage,
    locale: 'en',
    province: 'ON',
    isFederallyRegulated: null,
    enableRetrieval: true,
    enableWorkspacePayload: true,
    enableWebSearch: false,
    includeDebug: false,
    ...overrides,
  });
}

function hasTopicByTitle(items: { topic: string }[], pattern: RegExp): boolean {
  return items.some((item) => pattern.test(item.topic));
}

// ─── Direct routing regression tests (English) ────────────────────────────────

describe('Doctor-note / functional-limitation English routing', () => {
  const cases = [
    'An employee gave us a doctor’s note with functional limitations. What can we ask for?',
    "An employee gave us a doctor's note with functional limitations. What can we ask for?",
    'An employee submitted medical documentation with functional restrictions. What can HR ask for?',
    'What medical information can we request for accommodation?',
    'What can the employer ask for in a functional abilities form?',
    'An employee provided a return-to-work note with restrictions.',
    'Do we need the diagnosis or just functional limitations?',
  ];

  test.each(cases)('%s routes to employee_medical_or_accommodation', async (query) => {
    const ctx = makeCtx(query);
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    expect(response.route.responseMode).toBe('hr_compliance_advisor');
    expect(response.route.surface).toBe('hybrid');
    expect(response.route.intent).not.toBe('general_hr_compliance');
    expect(response.route.intent).not.toBe('termination_or_discipline');
    expect(response.route.intent).not.toBe('leave_or_absence');
  });
});

// ─── Direct routing regression tests (French) ─────────────────────────────────

describe('Doctor-note / functional-limitation French routing', () => {
  const cases: { query: string; locale: 'fr' }[] = [
    {
      query: 'Un employé nous a donné un billet médical avec des limitations fonctionnelles. Que pouvons-nous demander?',
      locale: 'fr',
    },
    {
      query: 'Quels renseignements médicaux l’employeur peut-il demander pour un accommodement?',
      locale: 'fr',
    },
    {
      query: 'Un employé a fourni un certificat médical avec des restrictions fonctionnelles.',
      locale: 'fr',
    },
    {
      query: 'Avons-nous besoin du diagnostic ou seulement des limitations fonctionnelles?',
      locale: 'fr',
    },
  ];

  test.each(cases)('$query routes to employee_medical_or_accommodation in French', async ({ query, locale }) => {
    const ctx = makeCtx(query, { locale });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    expect(response.route.surface).toBe('hybrid');
    expect(response.route.intent).not.toBe('general_hr_compliance');
    if (locale === 'fr') {
      expect(response.conversationalResponse).toMatch(/divulgation|confidentialité|accommodement|fonctionnelle|limitation/i);
    }
  });
});

// ─── Accommodation-specific fallback protection ────────────────────────────────

describe('Doctor-note deterministic fallback is accommodation-specific', () => {
  test('does not mention termination or severance facts', async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    const text = response.conversationalResponse.toLowerCase();
    expect(text).not.toMatch(/\bseverance\b/);
    expect(text).not.toMatch(/termination\s+notice/);
    expect(text).not.toMatch(/pay\s+in\s+lieu/);
    expect(text).not.toMatch(/length\s+of\s+service/);
    expect(text).not.toMatch(/termination\s+offer/);
    expect(text).not.toMatch(/just\s+cause/);
    expect(text).not.toMatch(/wrongful\s+dismissal/);
  });

  test('mentions functional information or functional limitations', async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    const text = response.conversationalResponse.toLowerCase();
    expect(text).toMatch(/functional\s+(information|limitations?|restrictions?|abilities?|capacity)/);
  });

  test('mentions confidentiality or privacy', async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    const text = response.conversationalResponse.toLowerCase();
    expect(text).toMatch(/confidential|privacy|confidentialité|vie\s+privée/);
  });

  test('mentions not asking for a diagnosis unless necessary', async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    const text = response.conversationalResponse.toLowerCase();
    expect(text).toMatch(/do not ask for a diagnosis|not ask for a diagnosis|no\s+diagnosis|diagnosis\s+unless/i);
  });

  test('mentions accommodation or modified duties', async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    const text = response.conversationalResponse.toLowerCase();
    expect(text).toMatch(/accommodation|modified\s+duties|tâches\s+modifiées|retour\s+au\s+travail/);
  });

  test('French fallback includes equivalent French accommodation concepts', async () => {
    const ctx = makeCtx('Un employé nous a donné un billet médical avec des limitations fonctionnelles. Que pouvons-nous demander?', { locale: 'fr' });
    const response = await composeAdvisorResponse(ctx);
    const text = response.conversationalResponse.toLowerCase();
    expect(text).toMatch(/confidentialité|vie\s+privée/);
    expect(text).toMatch(/fonctionnelle|fonctionnels|limitation|restriction/);
    expect(text).toMatch(/accommodement|tâches\s+modifiées|retour\s+au\s+travail/);
    expect(text).not.toMatch(/severance|préavis|licenciement|indemnité|congédiement/);
  });
});

// ─── Public retrievedGuidance topic alignment ─────────────────────────────────

describe('Doctor-note retrievedGuidance topic alignment', () => {
  test("'An employee gave us a doctor’s note with functional limitations. What can we ask for?' returns only medical-disclosure/accommodation-aligned items", async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    if (response.workspace?.retrievedGuidance) {
      for (const item of response.workspace.retrievedGuidance) {
        const isAccommodation = /accommodat|duty to accommodate|disability|undue hardship|tâches modifiées|retour au travail/i.test(item.topic);
        const isMedicalDisclosure = /medical disclosure|functional|doctor|medical information|billet|certificat|note médicale|divulgation/i.test(item.topic);
        expect(isAccommodation || isMedicalDisclosure).toBe(true);
      }
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice|severance/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|violence|bullying/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /statutory leaves|leave entitlement|parental leave|maternity/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /right to refuse|unsafe work|safety|OHSA/i)).toBe(false);
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /reprisal|retaliation/i)).toBe(false);
    }
  });

  test('does not expose termination guidance', async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /terminat|dismiss|notice|severance/i)).toBe(false);
    }
  });

  test('does not expose harassment guidance', async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /harassment|violence|bullying/i)).toBe(false);
    }
  });

  test('does not expose leave guidance unless leave is mentioned', async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /statutory leaves|leave entitlement|parental leave|maternity/i)).toBe(false);
    }
  });

  test('does not expose safety / right-to-refuse guidance unless safety is mentioned', async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /right to refuse|unsafe work|safety|OHSA/i)).toBe(false);
    }
  });

  test('does not expose reprisal guidance unless reprisal is mentioned', async () => {
    const ctx = makeCtx('An employee gave us a doctor’s note with functional limitations. What can we ask for?');
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.retrievedGuidance) {
      expect(hasTopicByTitle(response.workspace.retrievedGuidance, /reprisal|retaliation/i)).toBe(false);
    }
  });
});

// ─── Route-intent fallback protection ─────────────────────────────────────────

describe('Route-intent fallback protection for medical-information terms', () => {
  test('medical_disclosure category signal cannot end as general_hr_compliance', async () => {
    const ctx = makeCtx('What medical information can we request for a doctor note?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    expect(response.route.intent).not.toBe('general_hr_compliance');
  });

  test('accommodation category signal cannot end as general_hr_compliance', async () => {
    const ctx = makeCtx('What is the duty to accommodate?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('employee_medical_or_accommodation');
    expect(response.route.intent).not.toBe('general_hr_compliance');
  });

  test('crisis still overrides everything', async () => {
    const ctx = makeCtx("I want to hurt myself and I have a doctor's note");
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('possible_crisis_or_self_harm');
  });

  test('harassment still routes to harassment when harassment is explicit', async () => {
    const ctx = makeCtx('There has been a harassment complaint in the workplace.');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('harassment_or_workplace_violence');
  });

  test('termination still routes to termination when termination is explicit', async () => {
    const ctx = makeCtx('What is the notice period for termination?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.intent).toBe('termination_or_discipline');
  });
});
