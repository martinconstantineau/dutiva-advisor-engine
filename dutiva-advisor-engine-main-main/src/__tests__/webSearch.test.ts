/// <reference types="vitest/globals" />
/**
 * Web search unit tests.
 *
 * Covers:
 * - Config loading: WEB_SEARCH_ENABLED, STARTPAGE_* env vars
 * - No Startpage call when WEB_SEARCH_ENABLED=false
 * - No Startpage call when options.enableWebSearch=false
 * - No Startpage call for personal wellness / crisis / out-of-scope
 * - webSearchAllowed gate on routes
 * - PII redaction before query building
 * - URL validation: private/internal, proxy, malformed, tracking params
 * - Domain classification and source authority ranking
 * - Provider graceful failure (timeout, malformed response, missing config)
 * - Key redaction in errors
 * - shouldPerformWebSearch logic
 * - End-to-end mocked integration (composeAdvisorResponse with mock provider)
 */

import {
  loadWebSearchConfig,
  resetWebSearchConfig,
  isWebSearchConfigured,
  sanitizeWebSearchError,
} from '../webSearch/webSearchConfig';
import { redactPii, buildWebSearchQuery, requiresCurrentInfo, shouldPerformWebSearch } from '../webSearch/buildWebSearchQuery';
import { validateWebUrl, canonicalizeUrl } from '../webSearch/validateWebSource';
import { rankWebSources, filterToAuthoritative } from '../webSearch/rankWebSources';
import { setWebSearchProvider, resetWebSearchProvider } from '../webSearch/startpageSearchProvider';
import { runWebSearch } from '../webSearch/webSearchProvider';
import { routeAdvisorMessage } from '../core/routeAdvisorMessage';
import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import { classifyUrl } from '../webSearch/validateWebSource';
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '../webSearch/webSearchTypes';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<WebSearchResult> = {}): WebSearchResult {
  return {
    title: 'Test Source',
    url: 'https://ontario.ca/laws/statute/00e41',
    snippet: 'Employment Standards Act guidance',
    sourceDomain: 'ontario.ca',
    retrievedAt: new Date().toISOString(),
    publishedAt: null,
    sourceType: 'official_government',
    validationStatus: 'valid',
    qualityWarnings: [],
    ...overrides,
  };
}

function makeMockProvider(results: WebSearchResult[] = [], shouldThrow = false): WebSearchProvider {
  return {
    name: 'startpage',
    async search(_req: WebSearchRequest): Promise<WebSearchResult[]> {
      if (shouldThrow) throw new Error('Startpage timeout');
      return results;
    },
  };
}

// ─── 1. Config loading ────────────────────────────────────────────────────────

describe('webSearchConfig', () => {
  beforeEach(() => {
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
    delete process.env['STARTPAGE_TIMEOUT_MS'];
    delete process.env['STARTPAGE_MAX_RESULTS'];
  });

  afterEach(() => {
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
    delete process.env['STARTPAGE_TIMEOUT_MS'];
    delete process.env['STARTPAGE_MAX_RESULTS'];
  });

  it('defaults WEB_SEARCH_ENABLED to false', () => {
    const cfg = loadWebSearchConfig();
    expect(cfg.enabled).toBe(false);
  });

  it('reads WEB_SEARCH_ENABLED=true', () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    const cfg = loadWebSearchConfig();
    expect(cfg.enabled).toBe(true);
  });

  it('reads STARTPAGE_BASE_URL and STARTPAGE_API_KEY', () => {
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key-abc';
    const cfg = loadWebSearchConfig();
    expect(cfg.startpageBaseUrl).toBe('https://sp.example.com');
    expect(cfg.startpageApiKey).toBe('test-key-abc');
  });

  it('reads STARTPAGE_TIMEOUT_MS', () => {
    process.env['STARTPAGE_TIMEOUT_MS'] = '5000';
    const cfg = loadWebSearchConfig();
    expect(cfg.startpageTimeoutMs).toBe(5000);
  });

  it('reads STARTPAGE_MAX_RESULTS', () => {
    process.env['STARTPAGE_MAX_RESULTS'] = '3';
    const cfg = loadWebSearchConfig();
    expect(cfg.startpageMaxResults).toBe(3);
  });

  it('isWebSearchConfigured is false when enabled=false', () => {
    const cfg = loadWebSearchConfig();
    expect(isWebSearchConfigured(cfg)).toBe(false);
  });

  it('isWebSearchConfigured is false when URL is missing', () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_API_KEY'] = 'key';
    const cfg = loadWebSearchConfig();
    expect(isWebSearchConfigured(cfg)).toBe(false);
  });

  it('isWebSearchConfigured is false when key is missing', () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    const cfg = loadWebSearchConfig();
    expect(isWebSearchConfigured(cfg)).toBe(false);
  });

  it('isWebSearchConfigured is true when all required fields are set', () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'key';
    const cfg = loadWebSearchConfig();
    expect(isWebSearchConfigured(cfg)).toBe(true);
  });
});

// ─── 2. sanitizeWebSearchError ────────────────────────────────────────────────

describe('sanitizeWebSearchError', () => {
  it('redacts the API key from error messages', () => {
    const safe = sanitizeWebSearchError('Failed with key: abc123secret', 'abc123secret');
    expect(safe).not.toContain('abc123secret');
    expect(safe).toContain('[REDACTED]');
  });

  it('redacts bearer tokens', () => {
    const safe = sanitizeWebSearchError('Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload');
    expect(safe).not.toContain('eyJhbGciOiJSUzI1NiJ9');
    expect(safe).toContain('[REDACTED]');
  });

  it('does not crash on plain error messages', () => {
    const safe = sanitizeWebSearchError('Timeout connecting to host');
    expect(safe).toBe('Timeout connecting to host');
  });
});

// ─── 3. PII redaction ────────────────────────────────────────────────────────

describe('redactPii', () => {
  it('redacts email addresses', () => {
    expect(redactPii('Contact jane.smith@acme.com for details')).not.toContain('jane.smith@acme.com');
    expect(redactPii('Contact jane.smith@acme.com for details')).toContain('[EMAIL]');
  });

  it('redacts phone numbers', () => {
    expect(redactPii('Call 416-555-1234 for help')).not.toContain('416-555-1234');
    expect(redactPii('Call 416-555-1234 for help')).toContain('[PHONE]');
  });

  it('redacts SIN-like numbers', () => {
    expect(redactPii('SIN: 123-456-789')).not.toContain('123-456-789');
    expect(redactPii('SIN: 123-456-789')).toContain('[ID]');
  });

  it('redacts postal codes', () => {
    expect(redactPii('Located at K1A 0A9 Ottawa')).not.toContain('K1A 0A9');
  });

  it('redacts titled person names', () => {
    expect(redactPii('Mr. John Smith disclosed his condition')).not.toContain('John Smith');
  });

  it('redacts company names with Inc/Ltd/Corp suffixes', () => {
    const result = redactPii('Acme Manufacturing Inc. let me go last week');
    expect(result).not.toContain('Acme Manufacturing Inc.');
  });

  it('does not redact province names', () => {
    const result = redactPii('What Ontario employment law applies?');
    expect(result).toContain('Ontario');
  });

  it('does not redact jurisdiction terms', () => {
    const result = redactPii('Under the Canada Labour Code');
    // Canada is not a company name or person
    expect(result).toContain('Canada');
  });
});

// ─── 4. buildWebSearchQuery ───────────────────────────────────────────────────

describe('buildWebSearchQuery', () => {
  it('builds a clean query with site hint for Ontario', () => {
    const q = buildWebSearchQuery('What is the current minimum wage in Ontario?', 'ON', 'en');
    expect(q).toContain('site:ontario.ca');
    expect(q.length).toBeLessThanOrEqual(200);
  });

  it('builds a clean query with site hint for Quebec', () => {
    const q = buildWebSearchQuery('Find current CNESST guidance on harassment', 'QC', 'fr');
    expect(q).toContain('site:legisquebec.gouv.qc.ca');
  });

  it('builds a clean query with federal site hint', () => {
    const q = buildWebSearchQuery('Current Canada Labour Code leave rules', 'FEDERAL', 'en');
    expect(q).toContain('site:canada.ca');
  });

  it('does not include PII in the query', () => {
    const q = buildWebSearchQuery(
      'Jane Smith at Acme Manufacturing Inc. disclosed depression and asked for leave in Ontario',
      'ON',
      'en',
    );
    expect(q).not.toMatch(/Jane\s+Smith/);
    expect(q).not.toContain('Acme Manufacturing');
    // Medical info should be redacted
    expect(q).not.toContain('depression');
  });

  it('strips conversational filler', () => {
    const q = buildWebSearchQuery('Can you tell me what is the current ESA notice period?', 'ON', 'en');
    expect(q).not.toContain('Can you');
    expect(q).not.toContain('tell me');
  });
});

// ─── 5. requiresCurrentInfo ──────────────────────────────────────────────────

describe('requiresCurrentInfo', () => {
  it.each([
    'What changed in Ontario employment law this year?',
    'Latest ESA update Ontario 2026',
    'Current minimum wage Ontario',
    'Find current CNESST guidance on psychological harassment',
    'Recent HRTO decision about accommodation',
    'Has Québec changed harassment rules recently?',
  ])('returns true for: %s', (msg) => {
    expect(requiresCurrentInfo(msg)).toBe(true);
  });

  it.each([
    'What is the notice period for termination?',
    'How does the duty to accommodate work?',
    'I feel depressed',
    'What self-care strategies could you recommend?',
    'Can I get a copy of my personnel file?',
  ])('returns false for stable/non-current query: %s', (msg) => {
    expect(requiresCurrentInfo(msg)).toBe(false);
  });
});

// ─── 6. shouldPerformWebSearch ────────────────────────────────────────────────

describe('shouldPerformWebSearch', () => {
  it('returns false for personal_wellbeing intent', () => {
    expect(shouldPerformWebSearch('What self-care strategies could you recommend?', 'personal_wellbeing')).toBe(false);
  });

  it('returns false for personal_mental_health intent', () => {
    expect(shouldPerformWebSearch('I feel depressed', 'personal_mental_health')).toBe(false);
  });

  it('returns false for possible_crisis_or_self_harm', () => {
    expect(shouldPerformWebSearch('I want to hurt myself', 'possible_crisis_or_self_harm')).toBe(false);
  });

  it('returns false for out_of_scope', () => {
    expect(shouldPerformWebSearch('Write me a Python script', 'out_of_scope')).toBe(false);
  });

  it('returns false for ambiguous intent', () => {
    expect(shouldPerformWebSearch('I need help', 'ambiguous')).toBe(false);
  });

  it('returns false for HR intent without current-info signal', () => {
    expect(shouldPerformWebSearch('What is the notice period?', 'termination_or_discipline')).toBe(false);
  });

  it('returns true for HR intent with current-info signal', () => {
    expect(shouldPerformWebSearch('What changed in Ontario employment law this year?', 'general_hr_compliance')).toBe(true);
  });

  it('returns true for pay intent with minimum-wage signal', () => {
    expect(shouldPerformWebSearch('What is the current minimum wage in Ontario?', 'pay_hours_or_entitlements')).toBe(true);
  });
});

// ─── 7. validateWebUrl ───────────────────────────────────────────────────────

describe('validateWebUrl', () => {
  it('suppresses empty URLs', () => {
    expect(validateWebUrl('').validationStatus).toBe('suppressed');
  });

  it('suppresses malformed URLs', () => {
    expect(validateWebUrl('not-a-url').validationStatus).toBe('suppressed');
  });

  it('suppresses non-http(s) URLs', () => {
    expect(validateWebUrl('ftp://example.com/file.txt').validationStatus).toBe('suppressed');
    expect(validateWebUrl('javascript:alert(1)').validationStatus).toBe('suppressed');
  });

  it('suppresses localhost URLs', () => {
    expect(validateWebUrl('http://localhost:3000/data').validationStatus).toBe('suppressed');
  });

  it('suppresses private IP URLs', () => {
    expect(validateWebUrl('http://192.168.1.1/admin').validationStatus).toBe('suppressed');
    expect(validateWebUrl('http://10.0.0.1/page').validationStatus).toBe('suppressed');
    expect(validateWebUrl('http://172.16.0.1/page').validationStatus).toBe('suppressed');
  });

  it('suppresses Startpage proxy URLs', () => {
    expect(validateWebUrl('https://ixquick-proxy.com/do/proxy?').validationStatus).toBe('suppressed');
    expect(validateWebUrl('https://www.startpage.com/sp/proxy?ep=&u=https%3A//example.com').validationStatus).toBe('suppressed');
  });

  it('classifies ontario.ca as official_government', () => {
    const result = validateWebUrl('https://www.ontario.ca/page/employment-standards-act');
    expect(result.sourceType).toBe('official_government');
    expect(result.validationStatus).toBe('valid');
  });

  it('classifies canada.ca as official_government', () => {
    const result = validateWebUrl('https://www.canada.ca/en/employment-social-development/programs/employment-insurance.html');
    expect(result.sourceType).toBe('official_government');
    expect(result.validationStatus).toBe('valid');
  });

  it('classifies legisquebec.gouv.qc.ca as legislation', () => {
    const result = validateWebUrl('https://legisquebec.gouv.qc.ca/en/document/cs/N-1.1');
    expect(result.sourceType).toBe('legislation');
  });

  it('classifies cnesst.gouv.qc.ca as regulator_or_agency', () => {
    const result = validateWebUrl('https://www.cnesst.gouv.qc.ca/fr/guide');
    expect(result.sourceType).toBe('regulator_or_agency');
  });

  it('classifies canlii.org as legislation', () => {
    const result = validateWebUrl('https://www.canlii.org/en/on/laws/stat/rso-1990-c-e14');
    expect(result.sourceType).toBe('legislation');
  });

  it('classifies hrto.ca as court_or_tribunal', () => {
    const result = validateWebUrl('https://www.hrto.ca/hrto/decision/12345');
    expect(result.sourceType).toBe('court_or_tribunal');
  });

  it('marks general_web URLs as requires_review', () => {
    const result = validateWebUrl('https://someblog.example.com/hr-tips');
    expect(result.sourceType).toBe('general_web');
    expect(result.validationStatus).toBe('requires_review');
  });
});

// ─── 8. canonicalizeUrl ──────────────────────────────────────────────────────

describe('canonicalizeUrl', () => {
  it('strips UTM tracking parameters', () => {
    const clean = canonicalizeUrl('https://ontario.ca/page?utm_source=google&utm_campaign=test');
    expect(clean).not.toContain('utm_source');
    expect(clean).toContain('ontario.ca');
  });

  it('strips fbclid', () => {
    const clean = canonicalizeUrl('https://ontario.ca/page?fbclid=IwAR123abc');
    expect(clean).not.toContain('fbclid');
  });

  it('preserves non-tracking params', () => {
    const clean = canonicalizeUrl('https://ontario.ca/laws/statute/00e41?lang=en');
    expect(clean).toContain('lang=en');
  });

  it('returns the original string if URL is unparseable', () => {
    expect(canonicalizeUrl('not-a-url')).toBe('not-a-url');
  });
});

// ─── 9. rankWebSources ───────────────────────────────────────────────────────

describe('rankWebSources', () => {
  it('ranks legislation above official_government above general_web', () => {
    const results = [
      makeResult({ sourceType: 'general_web', validationStatus: 'requires_review', url: 'https://example.com' }),
      makeResult({ sourceType: 'official_government', validationStatus: 'valid', url: 'https://ontario.ca/page' }),
      makeResult({ sourceType: 'legislation', validationStatus: 'valid', url: 'https://canlii.org/en/on/laws' }),
    ];
    const ranked = rankWebSources(results);
    expect(ranked[0].sourceType).toBe('legislation');
    expect(ranked[1].sourceType).toBe('official_government');
    expect(ranked[2].sourceType).toBe('general_web');
  });

  it('excludes suppressed results', () => {
    const results = [
      makeResult({ validationStatus: 'suppressed', url: 'https://ixquick-proxy.com' }),
      makeResult({ sourceType: 'official_government', validationStatus: 'valid', url: 'https://ontario.ca' }),
    ];
    const ranked = rankWebSources(results);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].url).toContain('ontario.ca');
  });
});

describe('filterToAuthoritative', () => {
  it('filters out general_web by default', () => {
    const results = [
      makeResult({ sourceType: 'general_web', validationStatus: 'requires_review' }),
      makeResult({ sourceType: 'official_government', validationStatus: 'valid' }),
    ];
    const filtered = filterToAuthoritative(results);
    expect(filtered.every((r) => r.sourceType !== 'general_web')).toBe(true);
  });
});

// ─── 10. runWebSearch gating ─────────────────────────────────────────────────

describe('runWebSearch', () => {
  beforeEach(() => {
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
  });

  afterEach(() => {
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
  });

  it('returns used=false when WEB_SEARCH_ENABLED is false', async () => {
    const meta = await runWebSearch({
      userMessage: 'What changed in Ontario employment law this year?',
      routeIntent: 'general_hr_compliance',
      jurisdiction: 'ON',
      locale: 'en',
      enableWebSearch: true,
    });
    expect(meta.used).toBe(false);
    expect(meta.warnings).toHaveLength(0);
  });

  it('returns used=false when enableWebSearch is false', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'key';
    resetWebSearchConfig();

    const meta = await runWebSearch({
      userMessage: 'What changed in Ontario employment law this year?',
      routeIntent: 'general_hr_compliance',
      jurisdiction: 'ON',
      locale: 'en',
      enableWebSearch: false,
    });
    expect(meta.used).toBe(false);
  });

  it('returns used=false for personal_wellbeing route', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([makeResult()]));

    const meta = await runWebSearch({
      userMessage: 'What self-care strategies could you recommend?',
      routeIntent: 'personal_wellbeing',
      jurisdiction: null,
      locale: 'en',
      enableWebSearch: true,
    });
    expect(meta.used).toBe(false);
  });

  it('returns used=false for crisis route', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([makeResult()]));

    const meta = await runWebSearch({
      userMessage: 'I want to kill myself',
      routeIntent: 'possible_crisis_or_self_harm',
      jurisdiction: null,
      locale: 'en',
      enableWebSearch: true,
    });
    expect(meta.used).toBe(false);
  });

  it('returns used=false and warning when config is missing (URL/key not set)', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    // No URL or key
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([makeResult()]));

    const meta = await runWebSearch({
      userMessage: 'What changed in Ontario employment law this year?',
      routeIntent: 'general_hr_compliance',
      jurisdiction: 'ON',
      locale: 'en',
      enableWebSearch: true,
    });
    expect(meta.used).toBe(false);
    expect(meta.warnings.some((w) => w.includes('not configured'))).toBe(true);
  });

  it('returns used=false and quality warning when provider throws (timeout/failure)', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([], true /* shouldThrow */));

    const meta = await runWebSearch({
      userMessage: 'What changed in Ontario employment law this year?',
      routeIntent: 'general_hr_compliance',
      jurisdiction: 'ON',
      locale: 'en',
      enableWebSearch: true,
    });
    expect(meta.used).toBe(false);
    expect(meta.warnings.length).toBeGreaterThan(0);
    // Warning must not contain the real provider key
    expect(meta.warnings.join('')).not.toContain('key');
  });

  it('returns used=true with results when all gates pass', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([makeResult()]));

    const meta = await runWebSearch({
      userMessage: 'What changed in Ontario employment law this year?',
      routeIntent: 'general_hr_compliance',
      jurisdiction: 'ON',
      locale: 'en',
      enableWebSearch: true,
    });
    expect(meta.used).toBe(true);
    expect(meta.results).toHaveLength(1);
    expect(meta.query).toBeTruthy();
  });

  it('does not leak the API key in warning messages', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'SUPER_SECRET_KEY_XYZ';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([], true));

    const meta = await runWebSearch({
      userMessage: 'Current minimum wage in Ontario?',
      routeIntent: 'pay_hours_or_entitlements',
      jurisdiction: 'ON',
      locale: 'en',
      enableWebSearch: true,
    });
    expect(meta.warnings.join('')).not.toContain('SUPER_SECRET_KEY_XYZ');
  });
});

// ─── 11. Intent-level webSearchAllowed from routeAdvisorMessage ──────────────
// NOTE: routeAdvisorMessage returns intent-level eligibility.
// The FINAL EFFECTIVE gate (global config + per-request option + current-info
// predicate + Startpage config check) is applied in computeEffectiveRoute
// inside composeAdvisorResponse. See section 16 for final effective gate tests.

describe('intent-level webSearchAllowed from routeAdvisorMessage', () => {
  function makeCtx(msg: string, overrides: Record<string, unknown> = {}) {
    return buildPipelineContext({
      sessionId: 'test',
      userMessage: msg,
      locale: 'en',
      province: null,
      isFederallyRegulated: null,
      enableWebSearch: true,
      ...overrides,
    });
  }

  it('webSearchAllowed is false for personal_wellbeing', () => {
    const ctx = makeCtx('What self-care strategies could you recommend?');
    const route = routeAdvisorMessage(ctx);
    expect(route.webSearchAllowed).toBe(false);
  });

  it('webSearchAllowed is false for personal_mental_health', () => {
    const ctx = makeCtx('I feel depressed');
    const route = routeAdvisorMessage(ctx);
    expect(route.webSearchAllowed).toBe(false);
  });

  it('webSearchAllowed is false for crisis', () => {
    const ctx = makeCtx('I want to kill myself');
    const route = routeAdvisorMessage(ctx);
    expect(route.webSearchAllowed).toBe(false);
    expect(route.intent).toBe('possible_crisis_or_self_harm');
  });

  it('webSearchAllowed is false for out_of_scope', () => {
    const ctx = makeCtx('Write me a Python script to scrape LinkedIn');
    const route = routeAdvisorMessage(ctx);
    expect(route.webSearchAllowed).toBe(false);
  });

  it('webSearchAllowed is false for ambiguous', () => {
    // Truly ambiguous — no HR keywords at all
    const ctx = makeCtx('xyzzy plugh');
    const route = routeAdvisorMessage(ctx);
    expect(route.webSearchAllowed).toBe(false);
  });

  it('webSearchAllowed is false for document_drafting (pure drafting request)', () => {
    // Use a drafting message that has no HR topic keywords so it routes to document_drafting
    const ctx = makeCtx('Please draft a letter');
    const route = routeAdvisorMessage(ctx);
    expect(route.webSearchAllowed).toBe(false);
    expect(route.intent).toBe('document_drafting');
  });

  it('"Please draft a termination letter" routes to termination_or_discipline (termination patterns take priority)', () => {
    // "termination" in the message hits TERMINATION_PATTERNS first — this is correct.
    // The drafting pattern only applies when there is no HR-topic match earlier.
    const ctx = makeCtx('Please draft a termination letter');
    const route = routeAdvisorMessage(ctx);
    // Termination route — webSearchAllowed is true
    expect(route.intent).toBe('termination_or_discipline');
    expect(route.webSearchAllowed).toBe(true);
  });

  it('intent-level webSearchAllowed is true for termination_or_discipline', () => {
    const ctx = makeCtx('What is the notice period for termination in Ontario?');
    const route = routeAdvisorMessage(ctx);
    expect(route.intent).toBe('termination_or_discipline');
    // Intent-level gate: true for HR routes. Final effective gate requires config + current-info.
    expect(route.webSearchAllowed).toBe(true);
  });

  it('webSearchAllowed is true for pay_hours_or_entitlements', () => {
    const ctx = makeCtx('What is the minimum wage in Ontario?');
    const route = routeAdvisorMessage(ctx);
    expect(route.webSearchAllowed).toBe(true);
  });

  it('webSearchAllowed is true for harassment route', () => {
    const ctx = makeCtx('An employee is being harassed at work');
    const route = routeAdvisorMessage(ctx);
    expect(route.webSearchAllowed).toBe(true);
  });

  it('webSearchAllowed is true for leave route', () => {
    const ctx = makeCtx('What are the parental leave rules?');
    const route = routeAdvisorMessage(ctx);
    expect(route.webSearchAllowed).toBe(true);
  });
});

// ─── 12. Integration: "I feel depressed" does not trigger web search ─────────

describe('integration: personal/crisis do not trigger web search', () => {
  beforeEach(() => {
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
  });

  afterEach(() => {
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
  });

  it.each([
    ['I feel depressed', 'personal/mental health'],
    ['What self-care strategies could you recommend for me?', 'personal wellbeing'],
    ['I want to end my life', 'crisis'],
    ['Write me a poem about dogs', 'out of scope'],
  ])('does not invoke Startpage for: %s (%s)', async (msg) => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'key';
    resetWebSearchConfig();

    let searchCalled = false;
    setWebSearchProvider({
      name: 'startpage',
      async search() {
        searchCalled = true;
        return [];
      },
    });

    const ctx = buildPipelineContext({
      sessionId: 'integ-test',
      userMessage: msg,
      locale: 'en',
      province: null,
      isFederallyRegulated: null,
      enableWebSearch: true,
    });
    const route = routeAdvisorMessage(ctx);
    // Ensure webSearchAllowed is false — so the pipeline will gate it
    expect(route.webSearchAllowed).toBe(false);

    // runWebSearch respects the route intent gate even if called directly
    const meta = await runWebSearch({
      userMessage: msg,
      routeIntent: route.intent,
      jurisdiction: null,
      locale: 'en',
      enableWebSearch: true,
    });
    expect(meta.used).toBe(false);
    expect(searchCalled).toBe(false);
  });
});

// ─── 13. Unknown jurisdiction + current-law query ────────────────────────────

describe('unknown jurisdiction + current law query', () => {
  it('webSearch may run but query must be jurisdiction-neutral (no province assumed)', () => {
    // When jurisdiction is unknown, the query should not hardcode a province
    const query = buildWebSearchQuery(
      'What are the current employment law changes this year?',
      null,  // unknown jurisdiction
      'en',
    );
    // Should not assume Ontario or QC
    expect(query).not.toContain('site:ontario.ca');
    expect(query).not.toContain('site:legisquebec.gouv.qc.ca');
    // Should be a valid query string
    expect(query.length).toBeGreaterThan(10);
  });
});

// ─── 14. Startpage proxy URLs are not canonical citations ────────────────────

describe('Startpage proxy URL suppression', () => {
  it('rejects ixquick-proxy.com URLs', () => {
    const result = validateWebUrl('https://ixquick-proxy.com/do/proxy?ep=&u=https://ontario.ca/page');
    expect(result.validationStatus).toBe('suppressed');
    expect(result.qualityWarnings[0]).toContain('Startpage proxy');
  });

  it('rejects startpage.com/sp/ URLs', () => {
    const result = validateWebUrl('https://www.startpage.com/sp/proxy?ep=&u=https://ontario.ca');
    expect(result.validationStatus).toBe('suppressed');
  });
});

// ─── 15. Official source site preference in queries ──────────────────────────

describe('official source preference in queries', () => {
  it('uses site:canada.ca for federal jurisdiction queries', () => {
    const q = buildWebSearchQuery('Current CLC leave rules', 'FEDERAL', 'en');
    expect(q).toContain('site:canada.ca');
  });

  it('uses site:ontario.ca for Ontario queries', () => {
    const q = buildWebSearchQuery('Current ESA overtime rules', 'ON', 'en');
    expect(q).toContain('site:ontario.ca');
  });

  it('uses site:legisquebec.gouv.qc.ca for Quebec queries', () => {
    const q = buildWebSearchQuery('Règles actuelles sur le harcèlement', 'QC', 'fr');
    expect(q).toContain('site:legisquebec.gouv.qc.ca');
  });
});

// ─── 16. Final effective webSearchAllowed gate (via composeAdvisorResponse) ───
// These tests verify that route.webSearchAllowed in the RESPONSE is the fully
// evaluated final gate — not just intent-level eligibility.

describe('final effective webSearchAllowed gate (composeAdvisorResponse)', () => {
  const CURRENT_QUERY = 'What changed in Ontario employment law this year?';

  function makeFullCtx(msg: string, extra: Partial<Parameters<typeof buildPipelineContext>[0]> = {}) {
    return buildPipelineContext({
      sessionId: `final-gate-${Date.now()}`,
      userMessage: msg,
      locale: 'en',
      province: 'ON' as const,
      isFederallyRegulated: null,
      enableWebSearch: true,
      enableRetrieval: false,
      enableWorkspacePayload: false,
      ...extra,
    });
  }

  function setupEnv(enabled: boolean, hasUrl: boolean, hasKey: boolean) {
    resetWebSearchConfig();
    if (enabled) process.env['WEB_SEARCH_ENABLED'] = 'true';
    else delete process.env['WEB_SEARCH_ENABLED'];
    if (hasUrl) process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    else delete process.env['STARTPAGE_BASE_URL'];
    if (hasKey) process.env['STARTPAGE_API_KEY'] = 'test-key';
    else delete process.env['STARTPAGE_API_KEY'];
  }

  beforeEach(() => {
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
  });

  afterEach(() => {
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
  });

  it('WEB_SEARCH_ENABLED=false → route.webSearchAllowed=false in final response', async () => {
    setupEnv(false, true, true);
    // Install mock so if search runs we can detect it
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeFullCtx(CURRENT_QUERY, { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
  });

  it('options.enableWebSearch=false → route.webSearchAllowed=false in final response', async () => {
    setupEnv(true, true, true);
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeFullCtx(CURRENT_QUERY, { enableWebSearch: false });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
  });

  it('missing STARTPAGE_BASE_URL → route.webSearchAllowed=false + quality warning', async () => {
    setupEnv(true, false, true);  // no URL
    const ctx = makeFullCtx(CURRENT_QUERY, { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
  });

  it('missing STARTPAGE_API_KEY → route.webSearchAllowed=false', async () => {
    setupEnv(true, true, false);  // no key
    const ctx = makeFullCtx(CURRENT_QUERY, { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
  });

  it('fully configured + current-info query → route.webSearchAllowed=true + webSearch present', async () => {
    setupEnv(true, true, true);
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeFullCtx(CURRENT_QUERY, { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(true);
    expect(response.webSearch).toBeDefined();
    expect(response.webSearch!.used).toBe(true);
  });

  it('stable HR query (no current-info signal) → route.webSearchAllowed=false even when fully configured', async () => {
    setupEnv(true, true, true);
    setWebSearchProvider(makeMockProvider([makeResult()]));
    // Stable query — no "latest", "current", "recent", "this year", "minimum wage" etc.
    const ctx = makeFullCtx('What is the notice period for termination without cause?', { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
  });

  it('personal_wellbeing → route.webSearchAllowed=false regardless of config', async () => {
    setupEnv(true, true, true);
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeFullCtx('What self-care strategies could you recommend for me?', { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
  });

  it('personal_mental_health → route.webSearchAllowed=false regardless of config', async () => {
    setupEnv(true, true, true);
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeFullCtx('I feel depressed', { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
  });

  it('crisis → route.webSearchAllowed=false regardless of config', async () => {
    setupEnv(true, true, true);
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeFullCtx('I want to kill myself', { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
    expect(response.isCrisis).toBe(true);
  });

  it('ambiguous → route.webSearchAllowed=false regardless of config', async () => {
    setupEnv(true, true, true);
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeFullCtx('xyzzy plugh frobozz', { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
  });

  it('out_of_scope → route.webSearchAllowed=false regardless of config', async () => {
    setupEnv(true, true, true);
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeFullCtx('Write me a poem about dogs', { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
  });

  it('provider failure → route.webSearchAllowed=true but webSearch.used=false + quality warning', async () => {
    setupEnv(true, true, true);
    setWebSearchProvider(makeMockProvider([], true /* shouldThrow */));
    const ctx = makeFullCtx(CURRENT_QUERY, { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    // Gate is true (all conditions met), but search failed
    expect(response.route.webSearchAllowed).toBe(true);
    // webSearch field absent because used=false when search fails
    // (pipeline only includes publicWebSearch when route.webSearchAllowed && webSearchMeta.used)
    expect(response.webSearch).toBeUndefined();
    // Quality warning should mention the failure
    expect(response.quality.warnings.some((w) => w.includes('Web search'))).toBe(true);
  });

  it('STARTPAGE_API_KEY never appears in quality.warnings or response', async () => {
    setupEnv(true, true, true);
    process.env['STARTPAGE_API_KEY'] = 'SUPER_SECRET_KEY_12345';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([], true /* shouldThrow */));
    const ctx = makeFullCtx(CURRENT_QUERY, { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    const allWarnings = response.quality.warnings.join(' ');
    expect(allWarnings).not.toContain('SUPER_SECRET_KEY_12345');
    const responseStr = JSON.stringify(response);
    expect(responseStr).not.toContain('SUPER_SECRET_KEY_12345');
  });
});

// ─── 17. Query distillation: no PII placeholders in final query ───────────────

describe('query distillation: PII placeholders stripped', () => {
  it('no [EMPLOYER] in final query', () => {
    const q = buildWebSearchQuery('Jane Smith at Acme Manufacturing in Ottawa disclosed depression and asked for leave', 'ON', 'en');
    expect(q).not.toContain('[EMPLOYER]');
  });

  it('no [PERSON] in final query', () => {
    const q = buildWebSearchQuery('Mr. John Smith reported harassment to HR at ABC Corp', 'ON', 'en');
    expect(q).not.toContain('[PERSON]');
  });

  it('no [PHONE] in final query', () => {
    const q = buildWebSearchQuery('Call 416-555-1234 to report the Ontario minimum wage issue', 'ON', 'en');
    expect(q).not.toContain('[PHONE]');
  });

  it('no [EMAIL] in final query', () => {
    const q = buildWebSearchQuery('Contact jane@acme.com about the ESA rules this year', 'ON', 'en');
    expect(q).not.toContain('[EMAIL]');
  });

  it('no [ID] in final query', () => {
    const q = buildWebSearchQuery('SIN 123-456-789 used to verify current CLC leave entitlements', 'FEDERAL', 'en');
    expect(q).not.toContain('[ID]');
  });

  it('no [POSTAL] in final query', () => {
    const q = buildWebSearchQuery('Office at K1A 0A9 Ontario current employment standards', 'ON', 'en');
    expect(q).not.toContain('[POSTAL]');
  });

  it('no [ADDRESS] in final query', () => {
    const q = buildWebSearchQuery('Employer at 123 Main Street Ottawa current leave rules Ontario', 'ON', 'en');
    expect(q).not.toContain('[ADDRESS]');
  });

  it('no [CASE_REF] in final query', () => {
    const q = buildWebSearchQuery('Case ABC-2025-001 current minimum wage Ontario standards', 'ON', 'en');
    expect(q).not.toContain('[CASE_REF]');
  });

  it('no [MEDICAL_CONDITION] in final query', () => {
    const q = buildWebSearchQuery('Employee disclosed depression, current Ontario accommodation guidance', 'ON', 'en');
    expect(q).not.toContain('[MEDICAL_CONDITION]');
  });

  it('depression → mental health or accommodation term in query (not raw diagnosis)', () => {
    const q = buildWebSearchQuery('Employee has depression, current Ontario accommodation guidance', 'ON', 'en');
    expect(q).not.toContain('depression');
    // The distiller maps depression → "mental health accommodation" or keeps "accommodation"/"accommodate"
    expect(q.toLowerCase()).toMatch(/mental health|accommodat/);
  });

  it('final query preserves jurisdiction keyword', () => {
    const q = buildWebSearchQuery('Latest ESA update this year', 'ON', 'en');
    expect(q).toContain('Ontario');
  });

  it('final query preserves federal jurisdiction keyword', () => {
    const q = buildWebSearchQuery('Current Canada Labour Code leave rules', 'FEDERAL', 'en');
    expect(q.toLowerCase()).toMatch(/canada|federal/);
  });

  it('French query redaction: no [EMPLOYER] in output', () => {
    const q = buildWebSearchQuery('Marie Tremblay chez Entreprise ABC Inc. a signalé du harcèlement actuel', 'QC', 'fr');
    expect(q).not.toContain('[EMPLOYER]');
    expect(q).not.toContain('[PERSON]');
  });

  it('French query does not contain raw person name', () => {
    const q = buildWebSearchQuery('Mme. Marie Tremblay demande les règles actuelles sur le harcèlement au Québec', 'QC', 'fr');
    expect(q).not.toContain('Marie Tremblay');
  });

  it('PII-heavy query produces a short, clean legal query', () => {
    const q = buildWebSearchQuery(
      'Jane Smith (416-555-1234 / jane@acme.com, SIN 123-456-789) at Acme Manufacturing Inc., 123 Main Street Ottawa K1A 0A9, disclosed depression and asked for leave. What current Ontario guidance applies?',
      'ON',
      'en',
    );
    // No PII
    expect(q).not.toContain('[EMPLOYER]');
    expect(q).not.toContain('[PERSON]');
    expect(q).not.toContain('[PHONE]');
    expect(q).not.toContain('[EMAIL]');
    expect(q).not.toContain('[ID]');
    expect(q).not.toContain('[POSTAL]');
    expect(q).not.toContain('[ADDRESS]');
    expect(q).not.toContain('[CASE_REF]');
    expect(q).not.toContain('[MEDICAL_CONDITION]');
    expect(q).not.toContain('jane@acme.com');
    expect(q).not.toContain('416-555-1234');
    expect(q).not.toContain('depression');
    // Has legal content
    expect(q.toLowerCase()).toMatch(/ontario|accommodation|leave|employment|mental health/);
    // Reasonably short
    expect(q.length).toBeLessThanOrEqual(200);
  });
});

// ─── 18. Path-aware source classification ────────────────────────────────────

describe('path-aware source classification (classifyUrl)', () => {
  it('ontario.ca/laws/statute/... → legislation', () => {
    expect(classifyUrl('ontario.ca', '/laws/statute/rso-1990-c-e14')).toBe('legislation');
  });

  it('www.ontario.ca/laws/statute/... → legislation (www. stripped)', () => {
    expect(classifyUrl('www.ontario.ca', '/laws/statute/rso-1990-c-e14')).toBe('legislation');
  });

  it('ontario.ca/page/... → official_government (not laws path)', () => {
    expect(classifyUrl('ontario.ca', '/page/employment-standards-act')).toBe('official_government');
  });

  it('laws-lois.justice.gc.ca → legislation', () => {
    expect(classifyUrl('laws-lois.justice.gc.ca', '/en/acts/l-2/index.html')).toBe('legislation');
  });

  it('www.laws-lois.justice.gc.ca → legislation (www. stripped)', () => {
    expect(classifyUrl('www.laws-lois.justice.gc.ca', '/en/acts/l-2/index.html')).toBe('legislation');
  });

  it('legisquebec.gouv.qc.ca → legislation', () => {
    expect(classifyUrl('legisquebec.gouv.qc.ca', '/en/document/cs/N-1.1')).toBe('legislation');
  });

  it('www.legisquebec.gouv.qc.ca → legislation (www. stripped)', () => {
    expect(classifyUrl('www.legisquebec.gouv.qc.ca', '/en/document/cs/N-1.1')).toBe('legislation');
  });

  it('canlii.org → legislation', () => {
    expect(classifyUrl('canlii.org', '/en/on/laws/stat/rso-1990-c-e14')).toBe('legislation');
  });

  it('www.canlii.org → legislation (www. stripped)', () => {
    expect(classifyUrl('www.canlii.org', '/en/on/laws/stat/rso-1990-c-e14')).toBe('legislation');
  });

  it('cnesst.gouv.qc.ca → regulator_or_agency', () => {
    expect(classifyUrl('cnesst.gouv.qc.ca', '/fr/guide')).toBe('regulator_or_agency');
  });

  it('www.cnesst.gouv.qc.ca → regulator_or_agency (www. stripped)', () => {
    expect(classifyUrl('www.cnesst.gouv.qc.ca', '/fr/guide')).toBe('regulator_or_agency');
  });

  it('ohrc.on.ca → regulator_or_agency', () => {
    expect(classifyUrl('ohrc.on.ca', '/en/guide')).toBe('regulator_or_agency');
  });

  it('www.ohrc.on.ca → regulator_or_agency (www. stripped)', () => {
    expect(classifyUrl('www.ohrc.on.ca', '/en/guide')).toBe('regulator_or_agency');
  });

  it('hrto.ca → court_or_tribunal', () => {
    expect(classifyUrl('hrto.ca', '/decision/123')).toBe('court_or_tribunal');
  });

  it('canada.ca → official_government (general government, not legislation path)', () => {
    expect(classifyUrl('canada.ca', '/en/employment-social-development')).toBe('official_government');
  });

  it('general blog → general_web', () => {
    expect(classifyUrl('someblog.example.com', '/hr-tips')).toBe('general_web');
  });

  // Verify validateWebUrl uses path-aware classification
  it('validateWebUrl: ontario.ca/laws/... → sourceType=legislation', () => {
    const result = validateWebUrl('https://www.ontario.ca/laws/statute/rso-1990-c-e14');
    expect(result.sourceType).toBe('legislation');
  });

  it('validateWebUrl: ontario.ca/page/... → sourceType=official_government', () => {
    const result = validateWebUrl('https://www.ontario.ca/page/employment-standards-act');
    expect(result.sourceType).toBe('official_government');
  });

  it('ranking: ontario.ca/laws (legislation) ranked above ontario.ca/page (official_government)', () => {
    const results = [
      makeResult({ url: 'https://ontario.ca/page/esa', sourceType: 'official_government', validationStatus: 'valid' }),
      makeResult({ url: 'https://ontario.ca/laws/statute/00e41', sourceType: 'legislation', validationStatus: 'valid' }),
    ];
    const ranked = rankWebSources(results);
    expect(ranked[0].sourceType).toBe('legislation');
    expect(ranked[1].sourceType).toBe('official_government');
  });
});

// ─── 19. Query quality: medical terms → safe legal topic (Fix 1) ──────────────
// These tests verify the pre-extraction pipeline preserves useful legal topics
// even after PII redaction strips the original diagnostic words.

describe('query quality: medical terms mapped to safe legal topics (pre-extraction)', () => {
  it('depression in original message → mental health accommodation in final query', () => {
    const q = buildWebSearchQuery(
      'Jane Smith at Acme Manufacturing in Ottawa disclosed depression and asked for leave. What current Ontario guidance applies?',
      'ON',
      'en',
    );
    // No PII or raw diagnosis
    expect(q).not.toContain('Jane');
    expect(q).not.toContain('Smith');
    expect(q).not.toContain('Acme');
    expect(q).not.toContain('Manufacturing');
    expect(q).not.toContain('Ottawa');
    expect(q).not.toContain('depression');
    expect(q).not.toContain('[MEDICAL_CONDITION]');
    expect(q).not.toContain('[EMPLOYER]');
    expect(q).not.toContain('[PERSON]');
    // Must contain legal topic terms
    expect(q.toLowerCase()).toMatch(/mental health|accommodation/);
    // Must contain "leave" (from "asked for leave")
    expect(q.toLowerCase()).toContain('leave');
    // Must contain Ontario
    expect(q).toContain('Ontario');
    // Must contain site hint
    expect(q).toContain('site:ontario.ca');
    // Query must not be excessively long
    expect(q.length).toBeLessThanOrEqual(200);
  });

  it('query is not merely "current Ontario guidance" — it contains useful topic terms', () => {
    const q = buildWebSearchQuery(
      'Jane Smith at Acme Manufacturing in Ottawa disclosed depression and asked for leave. What current Ontario guidance applies?',
      'ON',
      'en',
    );
    // Query should contain substantive legal topic terms, not just thin filler
    const meaningfulTerms = /accommodation|mental health|leave|employment standards|human rights/i;
    expect(meaningfulTerms.test(q)).toBe(true);
  });

  it('anxiety → mental health accommodation (not raw "anxiety")', () => {
    const q = buildWebSearchQuery('Employee has anxiety and wants current Ontario accommodation info', 'ON', 'en');
    expect(q).not.toContain('anxiety');
    expect(q.toLowerCase()).toMatch(/mental health|accommodation/);
  });

  it('PTSD → mental health accommodation', () => {
    const q = buildWebSearchQuery('PTSD disclosure current Ontario accommodation guidance', 'ON', 'en');
    expect(q).not.toContain('PTSD');
    expect(q.toLowerCase()).toMatch(/mental health|accommodation/);
  });

  it('"asked for leave" preserves leave in final query', () => {
    const q = buildWebSearchQuery('Employee asked for leave, what current rules apply in Ontario?', 'ON', 'en');
    expect(q.toLowerCase()).toContain('leave');
  });

  it('"needs time off" preserves leave in final query', () => {
    const q = buildWebSearchQuery('Employee needs time off due to illness, current Ontario rules?', 'ON', 'en');
    expect(q.toLowerCase()).toContain('leave');
  });

  it('"sick leave" preserves leave in final query', () => {
    const q = buildWebSearchQuery('What is the current sick leave entitlement in Ontario?', 'ON', 'en');
    expect(q.toLowerCase()).toContain('leave');
  });

  it('PII-heavy query with email, phone, SIN, postal, address → no placeholders, no raw PII', () => {
    const q = buildWebSearchQuery(
      'Jane Smith (416-555-1234 / jane@acme.com, SIN 123-456-789) at Acme Manufacturing Inc., 123 Main Street Ottawa K1A 0A9, disclosed depression and asked for leave. What current Ontario guidance applies?',
      'ON',
      'en',
    );
    expect(q).not.toContain('[EMPLOYER]');
    expect(q).not.toContain('[PERSON]');
    expect(q).not.toContain('[PHONE]');
    expect(q).not.toContain('[EMAIL]');
    expect(q).not.toContain('[ID]');
    expect(q).not.toContain('[POSTAL]');
    expect(q).not.toContain('[ADDRESS]');
    expect(q).not.toContain('[CASE_REF]');
    expect(q).not.toContain('[MEDICAL_CONDITION]');
    expect(q).not.toContain('jane@acme.com');
    expect(q).not.toContain('416-555-1234');
    expect(q).not.toContain('depression');
    expect(q).not.toContain('Jane');
    expect(q).not.toContain('Smith');
    expect(q).not.toContain('Acme');
    expect(q).not.toContain('Ottawa');
    // Has substantive legal content
    expect(q.toLowerCase()).toMatch(/accommodation|leave|mental health|employment/);
    expect(q.length).toBeLessThanOrEqual(200);
  });

  it('French: dépression → accommodement santé mentale in query', () => {
    const q = buildWebSearchQuery(
      'Marie Tremblay chez Entreprise ABC Inc. a une dépression et a demandé un congé. Quelles règles actuelles au Québec?',
      'QC',
      'fr',
    );
    expect(q).not.toContain('dépression');
    expect(q).not.toContain('[MEDICAL_CONDITION]');
    expect(q).not.toContain('[EMPLOYER]');
    expect(q).not.toContain('Marie Tremblay');
    // Should contain French safe topic terms
    expect(q.toLowerCase()).toMatch(/accommodement|santé mentale|congé/);
    // Site hint for Quebec
    expect(q).toContain('site:legisquebec.gouv.qc.ca');
  });

  it('French: "a demandé un congé" → congé preserved in query', () => {
    const q = buildWebSearchQuery(
      'Mme. Sophie Côté a demandé un congé médical, quelles sont les règles actuelles au Québec?',
      'QC',
      'fr',
    );
    expect(q).not.toContain('Sophie Côté');
    expect(q.toLowerCase()).toContain('congé');
  });

  it('final query includes source site hint when jurisdiction is known', () => {
    const qOn = buildWebSearchQuery('Current Ontario mental health accommodation rules', 'ON', 'en');
    expect(qOn).toContain('site:ontario.ca');

    const qFed = buildWebSearchQuery('Current Canada Labour Code accommodation rules', 'FEDERAL', 'en');
    expect(qFed).toContain('site:canada.ca');
  });

  it('final query remains under maxQueryLength', () => {
    const q = buildWebSearchQuery(
      'Jane Smith at Acme Manufacturing in Ottawa has depression, anxiety, PTSD and asked for leave and accommodation. What current Ontario guidance applies this year?',
      'ON',
      'en',
      200,
    );
    expect(q.length).toBeLessThanOrEqual(200);
  });
});

// ─── 20. Missing-config web search quality warning (Fix 3) ───────────────────
// When web search is requested and eligible but Startpage config is missing,
// quality.warnings must include a safe warning message.

describe('missing-config web search quality warning', () => {
  function makeWebCtx(msg: string, extra: Partial<Parameters<typeof buildPipelineContext>[0]> = {}) {
    return buildPipelineContext({
      sessionId: `missing-config-${Date.now()}`,
      userMessage: msg,
      locale: 'en',
      province: 'ON' as const,
      isFederallyRegulated: null,
      enableWebSearch: true,
      enableRetrieval: false,
      enableWorkspacePayload: false,
      ...extra,
    });
  }

  const CURRENT_QUERY = 'What changed in Ontario employment law this year?';

  beforeEach(() => {
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
  });

  afterEach(() => {
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
  });

  it('missing STARTPAGE_BASE_URL → quality.warnings contains incomplete-config message', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    // No STARTPAGE_BASE_URL
    resetWebSearchConfig();
    const ctx = makeWebCtx(CURRENT_QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.quality.warnings.some((w) => w.includes('Startpage configuration is incomplete'))).toBe(true);
  });

  it('missing STARTPAGE_API_KEY → quality.warnings contains incomplete-config message', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    // No STARTPAGE_API_KEY
    resetWebSearchConfig();
    const ctx = makeWebCtx(CURRENT_QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.quality.warnings.some((w) => w.includes('Startpage configuration is incomplete'))).toBe(true);
  });

  it('warning must not contain any secret values', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    // key missing
    resetWebSearchConfig();
    const ctx = makeWebCtx(CURRENT_QUERY);
    const response = await composeAdvisorResponse(ctx);
    const warnText = response.quality.warnings.join(' ');
    // Should not contain env var values
    expect(warnText).not.toContain('https://sp.example.com');
    expect(warnText).not.toContain('STARTPAGE_API_KEY');
    expect(warnText).not.toContain('STARTPAGE_BASE_URL');
  });

  it('WEB_SEARCH_ENABLED=false does not produce the incomplete-config warning', async () => {
    // When global switch is off, no warning about missing config — it is intentionally off
    resetWebSearchConfig();
    const ctx = makeWebCtx(CURRENT_QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings.every((w) => !w.includes('Startpage configuration is incomplete'))).toBe(true);
  });

  it('stable HR query (no current-info signal) does not produce incomplete-config warning', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    // key missing
    resetWebSearchConfig();
    // Stable query — does not require current info
    const ctx = makeWebCtx('What is the notice period for termination without cause?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings.every((w) => !w.includes('Startpage configuration is incomplete'))).toBe(true);
  });

  it('personal_wellbeing does not produce incomplete-config warning', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    // no URL or key
    resetWebSearchConfig();
    const ctx = makeWebCtx('What self-care strategies could you recommend for me?');
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings.every((w) => !w.includes('Startpage configuration is incomplete'))).toBe(true);
  });

  it('crisis route does not produce incomplete-config warning', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    // no URL or key
    resetWebSearchConfig();
    const ctx = makeWebCtx('I want to end my life');
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings.every((w) => !w.includes('Startpage configuration is incomplete'))).toBe(true);
  });

  it('fully configured → no incomplete-config warning', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeWebCtx(CURRENT_QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings.every((w) => !w.includes('Startpage configuration is incomplete'))).toBe(true);
  });
});

// ─── 21. legalBasisAllowed/workspaceAllowed alignment (Fix 4) ────────────────
// legalBasisAllowed must be false whenever workspaceAllowed is false.

describe('legalBasisAllowed false when workspaceAllowed false', () => {
  beforeEach(() => {
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
  });

  afterEach(() => {
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
  });

  it('enableWorkspacePayload=false → workspaceAllowed=false and legalBasisAllowed=false', async () => {
    const ctx = buildPipelineContext({
      sessionId: `legal-gate-${Date.now()}`,
      userMessage: 'What are the termination notice requirements in Ontario?',
      locale: 'en',
      province: 'ON' as const,
      isFederallyRegulated: null,
      enableWorkspacePayload: false,
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.workspaceAllowed).toBe(false);
    expect(response.route.legalBasisAllowed).toBe(false);
    expect(response.workspace).toBeUndefined();
  });

  it('enableWorkspacePayload=false → workspace.legalBasis is absent', async () => {
    const ctx = buildPipelineContext({
      sessionId: `legal-gate-2-${Date.now()}`,
      userMessage: 'What are the termination notice requirements in Ontario?',
      locale: 'en',
      province: 'ON' as const,
      isFederallyRegulated: null,
      enableWorkspacePayload: false,
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace).toBeUndefined();
  });

  it('known province ON with workspace disabled → legalBasisAllowed=false', async () => {
    const ctx = buildPipelineContext({
      sessionId: `legal-gate-3-${Date.now()}`,
      userMessage: 'What is the duty to accommodate in Ontario?',
      locale: 'en',
      province: 'ON' as const,
      isFederallyRegulated: null,
      enableWorkspacePayload: false,
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.legalBasisAllowed).toBe(false);
  });

  it('unknown jurisdiction → legalBasisAllowed=false even with workspace enabled', async () => {
    const ctx = buildPipelineContext({
      sessionId: `legal-gate-4-${Date.now()}`,
      userMessage: 'What is the duty to accommodate?',
      locale: 'en',
      province: null,
      isFederallyRegulated: null,
      enableWorkspacePayload: true,
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.legalBasisAllowed).toBe(false);
  });

  it('workspace enabled + known jurisdiction ON → legalBasisAllowed eligible (may be true)', async () => {
    // With workspace enabled and known jurisdiction, legalBasisAllowed is true
    // if the base route also allows it. Even without LLM (fallback mode), the gate
    // should be open (true = eligible); whether citations appear depends on LLM output.
    const ctx = buildPipelineContext({
      sessionId: `legal-gate-5-${Date.now()}`,
      userMessage: 'What are the termination notice requirements in Ontario?',
      locale: 'en',
      province: 'ON' as const,
      isFederallyRegulated: null,
      enableWorkspacePayload: true,
      enableRetrieval: false,
    });
    const response = await composeAdvisorResponse(ctx);
    // Gate should be open when workspace is enabled, jurisdiction is known, no conflict
    expect(response.route.legalBasisAllowed).toBe(true);
  });
});
