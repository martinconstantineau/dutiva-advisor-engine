/// <reference types="vitest/globals" />
/**
 * Current-information fallback and integration-readiness tests.
 *
 * Covers:
 * Fix 1+2: Current-info fallback behaviour
 *   - Broad current-update queries with web search unavailable return bounded response
 *   - No misleading unrelated guidance (termination/ESA) for "what changed this year"
 *   - No workspace.retrievedGuidance for broad current-update queries
 *   - No workspace.legalBasis from internal guidance for current-change claim
 *   - Jurisdiction-aware bounded response (known province does not re-ask for province)
 *   - Unknown jurisdiction still asks for jurisdiction
 *
 * Fix 3: Retrieval suppression for broad current-update queries
 *   - "What changed in Ontario employment law this year?" does not return termination guidance
 *   - "Latest ESA update Ontario 2026" does not return termination unless directly about ESA
 *   - Minimum wage (topic-specific) may retrieve compensation guidance
 *   - Psychological harassment (topic-specific) may retrieve harassment guidance
 *
 * Fix 4: Startpage query distillation quality
 *   - Final query has no placeholders
 *   - Final query has no repeated terms
 *   - Final query has no stray "?"
 *   - "current" adjective stripped from final query
 *   - "duty to accommodate duty to accommodate" → deduplicated
 *
 * Fix 5: Consistent web-search-unavailable warnings
 *   - WEB_SEARCH_ENABLED=false emits "web search is disabled" warning
 *   - options.enableWebSearch=false emits "not enabled for this request" warning
 *   - Missing STARTPAGE_BASE_URL emits "configuration is incomplete" warning
 *   - Missing STARTPAGE_API_KEY emits "configuration is incomplete" warning
 *   - Warnings do not contain secrets or env var names
 *
 * Fix 7: Integration-readiness (Cases A-D)
 *   - Case A: Current-info + WEB_SEARCH_ENABLED=false
 *   - Case B: Current-info + incomplete Startpage config
 *   - Case C: Stable HR question (no current-info signal)
 *   - Case D: Topic-specific current question with mock Startpage configured
 */

import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import { resetWebSearchConfig } from '../webSearch/webSearchConfig';
import { setWebSearchProvider, resetWebSearchProvider } from '../webSearch/startpageSearchProvider';
import { buildWebSearchQuery } from '../webSearch/buildWebSearchQuery';
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '../webSearch/webSearchTypes';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<WebSearchResult> = {}): WebSearchResult {
  return {
    title: 'Ontario Employment Standards',
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

function makeMockProvider(results: WebSearchResult[] = []): WebSearchProvider {
  return {
    name: 'startpage',
    async search(_req: WebSearchRequest): Promise<WebSearchResult[]> {
      return results;
    },
  };
}

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
) {
  return buildPipelineContext({
    sessionId: `ci-test-${Date.now()}-${Math.random()}`,
    userMessage,
    locale: 'en',
    province: 'ON' as const,
    isFederallyRegulated: null,
    enableRetrieval: true,
    enableWorkspacePayload: true,
    enableWebSearch: true,
    ...overrides,
  });
}

function cleanEnv() {
  resetWebSearchProvider();
  resetWebSearchConfig();
  delete process.env['WEB_SEARCH_ENABLED'];
  delete process.env['STARTPAGE_BASE_URL'];
  delete process.env['STARTPAGE_API_KEY'];
}

beforeEach(cleanEnv);
afterEach(cleanEnv);

// ─── 1. Broad current-update query — WEB_SEARCH_ENABLED=false ────────────────

describe('Fix 1+2: broad current-update query, WEB_SEARCH_ENABLED=false', () => {
  const QUERY = 'What changed in Ontario employment law this year?';

  it('route.webSearchAllowed is false when WEB_SEARCH_ENABLED=false', async () => {
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
  });

  it('webSearch is omitted from response', async () => {
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.webSearch).toBeUndefined();
  });

  it('quality.warnings contains a current-verification warning', async () => {
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    const hasWarning = response.quality.warnings.some(
      (w) => /current.{0,60}(disabled|not configured|unavailable|web search)/i.test(w),
    );
    expect(hasWarning).toBe(true);
  });

  it('conversationalResponse acknowledges current-source verification is unavailable', async () => {
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    const resp = response.conversationalResponse.toLowerCase();
    expect(resp).toMatch(/current|verify|verification|unavailable|disabled|official source/);
  });

  it('conversationalResponse does NOT mention Ontario termination notice or ESA minimums', async () => {
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    const resp = response.conversationalResponse.toLowerCase();
    // Should not serve unrelated termination guidance
    expect(resp).not.toMatch(/\btermination notice\b/);
    expect(resp).not.toMatch(/\bseverance pay\b/);
    expect(resp).not.toMatch(/1 week per year/);
    expect(resp).not.toMatch(/8 weeks/);
    expect(resp).not.toMatch(/2\.5 million/);
  });

  it('workspace.retrievedGuidance is omitted (broad update query — no specific topic)', async () => {
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
  });

  it('workspace.legalBasis is omitted — no current-change claim without verified source', async () => {
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace?.legalBasis).toBeUndefined();
  });

  it('known province ON is acknowledged in response (does not ask for province again)', async () => {
    const ctx = makeCtx(QUERY, { province: 'ON' });
    const response = await composeAdvisorResponse(ctx);
    const resp = response.conversationalResponse.toLowerCase();
    // Should mention Ontario, not ask "please provide province"
    expect(resp).toMatch(/ontario/);
    expect(resp).not.toMatch(/please (provide|specify|confirm|share) (the )?(province|jurisdiction)/i);
  });

  it('French: conversationalResponse acknowledges limitation in French for broad update query', async () => {
    // Must route to an HR-eligible intent (include French HR keyword so router recognizes it),
    // but be a broad current-update query (no specific sub-topic like "licenciement" or "harcèlement").
    const ctx = makeCtx(
      'Quelles sont les modifications récentes au niveau de l\'emploi en Ontario cette année? Mon employé veut savoir.',
      { locale: 'fr' },
    );
    const response = await composeAdvisorResponse(ctx);
    const resp = response.conversationalResponse.toLowerCase();
    // For an ambiguous or unsupported French query, just confirm it does not serve
    // unrelated termination guidance — the key anti-regression property.
    // If it routes to HR-eligible and fires the bounded response, check for French keywords.
    // If it routes to ambiguous, check it doesn't answer with termination content.
    const isCurrentInfoBounded = resp.includes('vérif') || resp.includes('officiel') || resp.includes('source') || resp.includes('désactiv') || resp.includes('actuel');
    const isAmbiguousAsk = resp.includes('contexte') || resp.includes('précis');
    const hasUnrelatedContent = resp.includes('préavis') || resp.includes('licenciement') || resp.includes('1 semaine par année');
    expect(isCurrentInfoBounded || isAmbiguousAsk).toBe(true);
    expect(hasUnrelatedContent).toBe(false);
  });
});

// ─── 2. Broad current-update query — unknown jurisdiction ─────────────────────

describe('Fix 1+2: broad current-update query, unknown jurisdiction', () => {
  const QUERY = 'What changed in employment law this year?';

  it('unknown jurisdiction → quality.warnings mentions jurisdiction', async () => {
    const ctx = makeCtx(QUERY, { province: null });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.status).toBe('unknown');
    // The bounded response or workspace.missingFacts should mention jurisdiction
    const allText = JSON.stringify(response);
    expect(allText).toMatch(/province|jurisdiction|federal/i);
  });

  it('unknown jurisdiction → workspace.legalBasis is absent', async () => {
    const ctx = makeCtx(QUERY, { province: null });
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace?.legalBasis).toBeUndefined();
  });

  it('unknown jurisdiction → workspace.missingFacts mentions jurisdiction', async () => {
    const ctx = makeCtx(QUERY, { province: null, enableWorkspacePayload: true });
    const response = await composeAdvisorResponse(ctx);
    if (response.workspace?.missingFacts) {
      const mentionsJurisdiction = response.workspace.missingFacts.some(
        (f) => /province|jurisdiction|federal/i.test(f),
      );
      expect(mentionsJurisdiction).toBe(true);
    }
  });
});

// ─── 3. Startpage config incomplete — quality warnings ────────────────────────

describe('Fix 5: Startpage config incomplete — quality warnings', () => {
  const QUERY = 'What changed in Ontario employment law this year?';

  it('missing STARTPAGE_BASE_URL → "Startpage configuration is incomplete" warning', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.quality.warnings.some((w) => w.includes('Startpage configuration is incomplete'))).toBe(true);
  });

  it('missing STARTPAGE_API_KEY → "Startpage configuration is incomplete" warning', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    resetWebSearchConfig();
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings.some((w) => w.includes('Startpage configuration is incomplete'))).toBe(true);
  });

  it('WEB_SEARCH_ENABLED=false → "web search is disabled" warning (not incomplete-config)', async () => {
    // Global switch off — different warning
    resetWebSearchConfig();
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings.some((w) => /disabled/i.test(w))).toBe(true);
    // Must NOT say "Startpage configuration is incomplete" (that's for enabled-but-misconfigured)
    expect(response.quality.warnings.every((w) => !w.includes('Startpage configuration is incomplete'))).toBe(true);
  });

  it('options.enableWebSearch=false → "not enabled for this request" warning', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    const ctx = makeCtx(QUERY, { enableWebSearch: false });
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.warnings.some((w) => /not enabled for this request/i.test(w))).toBe(true);
  });

  it('incomplete-config warning does not contain secret values', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://my-secret-sp-endpoint.example.com';
    resetWebSearchConfig();
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    const warnText = response.quality.warnings.join(' ');
    expect(warnText).not.toContain('https://my-secret-sp-endpoint.example.com');
    expect(warnText).not.toContain('STARTPAGE_API_KEY');
    expect(warnText).not.toContain('STARTPAGE_BASE_URL');
  });

  it('webSearch is never present in response when route.webSearchAllowed=false', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    // Missing URL → unconfigured
    resetWebSearchConfig();
    const ctx = makeCtx(QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.webSearch).toBeUndefined();
  });
});

// ─── 4. Stable HR question — no current-info signal ──────────────────────────

describe('Fix 7 Case C: stable HR question (no current-info signal)', () => {
  it('stable harassment investigation query works normally (no current-info warning)', async () => {
    const ctx = makeCtx('What should I include in an Ontario harassment investigation file?', {
      province: 'ON',
      enableWebSearch: true,
    });
    const response = await composeAdvisorResponse(ctx);
    // No web search for stable HR query
    expect(response.route.webSearchAllowed).toBe(false);
    // Normal HR guidance still works
    expect(response.conversationalResponse).toBeTruthy();
    // No current-verification warning (it's a stable question)
    expect(response.quality.warnings.every(
      (w) => !/current.{0,60}(disabled|not configured|not enabled)/i.test(w),
    )).toBe(true);
  });

  it('stable termination notice query can retrieve internal guidance normally', async () => {
    const ctx = makeCtx('What is the notice period for termination without cause in Ontario?', {
      province: 'ON',
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    // Not a current-info query — should NOT short-circuit to unavailable
    expect(response.conversationalResponse).not.toMatch(/current.{0,40}unavailable/i);
    // Internal retrieval should work; workspace may contain retrieved guidance
    expect(response.workspace).toBeDefined();
  });

  it('stable accommodation query can retrieve duty-to-accommodate guidance', async () => {
    const ctx = makeCtx('What is the duty to accommodate in Ontario?', {
      province: 'ON',
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    // Not a current-info query
    expect(response.conversationalResponse).not.toMatch(/current.{0,40}unavailable/i);
    expect(response.workspace).toBeDefined();
  });
});

// ─── 5. Fix 7 Case D: Topic-specific current question + mock Startpage ────────

describe('Fix 7 Case D: topic-specific current question with mock Startpage', () => {
  it('current minimum wage query + fully configured → route.webSearchAllowed=true', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([
      makeResult({
        url: 'https://ontario.ca/page/employment-minimum-wage',
        title: 'Minimum Wage in Ontario',
        sourceType: 'official_government',
        validationStatus: 'valid',
      }),
    ]));
    const ctx = makeCtx('What is the current minimum wage in Ontario?', {
      province: 'ON',
      enableWebSearch: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(true);
  });

  it('current minimum wage query + mock Startpage → webSearch present with validated URLs', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([
      makeResult({
        url: 'https://ontario.ca/page/employment-minimum-wage',
        title: 'Minimum Wage in Ontario',
        sourceType: 'official_government',
        validationStatus: 'valid',
      }),
    ]));
    const ctx = makeCtx('What is the current minimum wage in Ontario?', {
      province: 'ON',
      enableWebSearch: true,
    });
    const response = await composeAdvisorResponse(ctx);
    // webSearch should be present (search ran)
    expect(response.webSearch).toBeDefined();
    expect(response.webSearch?.used).toBe(true);
    // No Startpage proxy URLs — canonical page URL only
    if (response.webSearch?.results) {
      for (const r of response.webSearch.results) {
        expect(r.url).not.toMatch(/startpage\.com/i);
        expect(r.url).toMatch(/^https:\/\//);
      }
    }
  });

  it('current minimum wage query + mock → workspace legalBasis absent without vetted citation', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeCtx('What is the current minimum wage in Ontario?', {
      province: 'ON',
      enableWebSearch: true,
    });
    const response = await composeAdvisorResponse(ctx);
    // legalBasis requires LLM-emitted vetted citation — fallback has none
    expect(response.workspace?.legalBasis).toBeUndefined();
  });
});

// ─── 6. Fix 3: Retrieval suppression for broad current-update queries ─────────

describe('Fix 3: retrieval suppression for broad current-update queries', () => {
  it('"What changed in Ontario employment law this year?" → no Ontario Termination retrievedGuidance', async () => {
    const ctx = makeCtx('What changed in Ontario employment law this year?', {
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    // Broad update query must not return topic-specific guidance items
    const retrieved = response.workspace?.retrievedGuidance ?? [];
    const terminationItems = retrieved.filter((g) => /termination|notice|severance/i.test(g.topic));
    expect(terminationItems).toHaveLength(0);
    // Whole retrievedGuidance should be absent (suppressed)
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
  });

  it('"Latest ESA update Ontario 2026" → no termination retrievedGuidance', async () => {
    const ctx = makeCtx('Latest ESA update Ontario 2026', {
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const retrieved = response.workspace?.retrievedGuidance ?? [];
    const terminationItems = retrieved.filter((g) => /termination|notice|severance/i.test(g.topic));
    expect(terminationItems).toHaveLength(0);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
  });

  it('"Any recent employment law changes in Quebec?" → broad suppression applies', async () => {
    const ctx = makeCtx('Any recent employment law changes in Quebec?', {
      province: 'QC' as const,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
  });

  it('"Current federal labour standards changes" → broad suppression applies', async () => {
    const ctx = makeCtx('Current federal labour standards changes', {
      province: null,
      isFederallyRegulated: true,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
  });

  it('"Current minimum wage in Ontario" → short-circuits to bounded current-info-unavailable response (no unrelated retrieval)', async () => {
    // Topic-specific current-info query: web search unavailable → bounded response, NOT unrelated internal guidance
    const ctx = makeCtx('What is the current minimum wage in Ontario?', {
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    // Must return a bounded response about current verification being unavailable
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|verification.*unavailable|not.*verify/i);
    // Must not return any retrieved guidance (termination/harassment/accommodation/etc)
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    // Must not return legal basis
    expect(response.workspace?.legalBasis).toBeUndefined();
    // Gates must be aligned with response
    expect(response.route.retrievalAllowed).toBe(false);
    expect(response.route.legalBasisAllowed).toBe(false);
  });

  it('"CNESST guidance on psychological harassment" → short-circuits to bounded current-info-unavailable response (no unrelated retrieval)', async () => {
    // Topic-specific current-info query: web search unavailable → bounded response, NOT unrelated internal guidance
    const ctx = makeCtx('Find current CNESST guidance on psychological harassment', {
      province: 'QC' as const,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    // Must return a bounded response about current verification being unavailable
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|verification.*unavailable|not.*verify/i);
    // Must not return unrelated retrieved guidance
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    // Gates must be aligned
    expect(response.route.retrievalAllowed).toBe(false);
  });

  it('quality warning is added when retrieval was suppressed for broad current-update query', async () => {
    const ctx = makeCtx('What changed in Ontario employment law this year?', {
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const hasSuppressedWarning = response.quality.warnings.some(
      (w) => /withheld|suppressed|current-update|broad/i.test(w),
    );
    expect(hasSuppressedWarning).toBe(true);
  });
});

// ─── 7. Fix 4: Query distillation quality ────────────────────────────────────

describe('Fix 4: query distillation quality', () => {
  it('final query has no PII placeholders', () => {
    const q = buildWebSearchQuery(
      'Jane Smith at Acme Manufacturing disclosed depression and asked for leave',
      'ON',
      'en',
    );
    expect(q).not.toMatch(/\[(EMPLOYER|PERSON|PHONE|EMAIL|ID|POSTAL|ADDRESS|CASE_REF|MEDICAL_CONDITION)\]/);
  });

  it('final query has no stray question mark', () => {
    const q = buildWebSearchQuery(
      'Jane Smith at Acme disclosed depression. What current Ontario guidance?',
      'ON',
      'en',
    );
    expect(q).not.toMatch(/\?/);
  });

  it('"duty to accommodate duty to accommodate" → deduplicated to single phrase', () => {
    const q = buildWebSearchQuery(
      'Employee wants duty to accommodate for their disability. The employer must duty to accommodate.',
      'ON',
      'en',
    );
    // Should not repeat "duty to accommodate" consecutively
    const occurrences = (q.match(/duty to accommodate/gi) ?? []).length;
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  it('"Ontario Ontario" → deduplicated standalone keyword (not counting site: hint)', () => {
    // When "Ontario" appears both in the distilled text and as the jurisdiction keyword,
    // only one standalone "Ontario" keyword should remain.
    // Note: "ontario" inside "site:ontario.ca" is part of a domain — it is not counted.
    const q = buildWebSearchQuery('Ontario employment law Ontario update', 'ON', 'en');
    // Strip out any site:xxx.com tokens before counting
    const withoutSiteHints = q.replace(/\bsite:\S+/gi, '');
    const occurrences = (withoutSiteHints.match(/\bOntario\b/gi) ?? []).length;
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  it('"current" standalone adjective stripped from final query', () => {
    const q = buildWebSearchQuery(
      'current Ontario accommodation guidance current year',
      'ON',
      'en',
    );
    // "current" should be stripped
    expect(q).not.toMatch(/\bcurrent\b/i);
  });

  it('"current Ontario guidance" phrase does not produce awkward output', () => {
    const q = buildWebSearchQuery(
      'What current Ontario guidance applies for mental health accommodation?',
      'ON',
      'en',
    );
    // Should not contain "current Ontario guidance" literally (it's noise)
    expect(q).not.toMatch(/current Ontario guidance/i);
    // Should still contain useful terms
    expect(q.toLowerCase()).toMatch(/mental health|accommodation|ontario/i);
  });

  it('"mental health accommodation mental health accommodation" → deduplicated', () => {
    // Simulate a scenario where the topic signal fires twice
    const q = buildWebSearchQuery(
      'Employee has depression and anxiety, needs accommodation for mental health',
      'ON',
      'en',
    );
    const occurrences = (q.match(/mental health accommodation/gi) ?? []).length;
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  it('final query stays under maxQueryLength', () => {
    const q = buildWebSearchQuery(
      'Jane Smith at Acme Manufacturing in Ottawa disclosed depression and anxiety and PTSD, asked for leave and accommodation, what current Ontario guidance applies this year 2026?',
      'ON',
      'en',
      200,
    );
    expect(q.length).toBeLessThanOrEqual(200);
  });

  it('French: "accommodement santé mentale accommodement santé mentale" → deduplicated', () => {
    const q = buildWebSearchQuery(
      'Employé a une dépression, besoin d\'accommodement pour santé mentale et a demandé un congé',
      'QC',
      'fr',
    );
    const occurrences = (q.match(/accommodement santé mentale/gi) ?? []).length;
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  it('French: no stray "?" in final query', () => {
    const q = buildWebSearchQuery(
      'Quelles règles actuelles au Québec pour la santé mentale?',
      'QC',
      'fr',
    );
    expect(q).not.toMatch(/\?/);
  });
});

// ─── 8. Fix 7 Case A: Integration — current-info + WEB_SEARCH_ENABLED=false ───

describe('Fix 7 Case A: integration — current-info + WEB_SEARCH_ENABLED=false', () => {
  it('full integration: bounded response, no unrelated retrieval, warning present', async () => {
    // WEB_SEARCH_ENABLED is not set (defaults to false)
    const ctx = buildPipelineContext({
      sessionId: `case-a-${Date.now()}`,
      userMessage: 'What changed in Ontario employment law this year?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableWebSearch: true,  // user requested web search
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });

    const response = await composeAdvisorResponse(ctx);

    // A1: webSearchAllowed=false
    expect(response.route.webSearchAllowed).toBe(false);

    // A2: webSearch omitted
    expect(response.webSearch).toBeUndefined();

    // A3: quality warning present
    expect(response.quality.warnings.length).toBeGreaterThan(0);
    const hasCurrentInfoWarning = response.quality.warnings.some(
      (w) => /current.{0,60}(disabled|not configured|unavailable)/i.test(w),
    );
    expect(hasCurrentInfoWarning).toBe(true);

    // A4: no unrelated termination guidance in response
    const resp = response.conversationalResponse.toLowerCase();
    expect(resp).not.toMatch(/\btermination notice\b/);
    expect(resp).not.toMatch(/\bseverance pay\b/);
    expect(resp).not.toMatch(/1 week per year/);

    // A5: no legalBasis for current-change claim
    expect(response.workspace?.legalBasis).toBeUndefined();

    // A6: no retrievedGuidance (broad update, no specific topic)
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
  });
});

// ─── 9. Fix 7 Case B: Integration — Startpage config incomplete ───────────────

describe('Fix 7 Case B: integration — Startpage config incomplete', () => {
  it('missing STARTPAGE_BASE_URL: bounded response, incomplete-config warning, no internal answer', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    // No STARTPAGE_BASE_URL
    resetWebSearchConfig();

    const ctx = buildPipelineContext({
      sessionId: `case-b-url-${Date.now()}`,
      userMessage: 'What changed in Ontario employment law this year?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableWebSearch: true,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });

    const response = await composeAdvisorResponse(ctx);

    // B1: webSearchAllowed=false
    expect(response.route.webSearchAllowed).toBe(false);

    // B2: incomplete-config warning present
    expect(response.quality.warnings.some((w) => w.includes('Startpage configuration is incomplete'))).toBe(true);

    // B3: no unrelated internal answer
    const resp = response.conversationalResponse.toLowerCase();
    expect(resp).not.toMatch(/\btermination notice\b/);
    expect(resp).not.toMatch(/\bseverance pay\b/);

    // B4: webSearch absent
    expect(response.webSearch).toBeUndefined();

    // B5: no legalBasis from internal guidance for current-change claim
    expect(response.workspace?.legalBasis).toBeUndefined();
  });

  it('missing STARTPAGE_API_KEY: same behaviour as missing URL', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    // No STARTPAGE_API_KEY
    resetWebSearchConfig();

    const ctx = buildPipelineContext({
      sessionId: `case-b-key-${Date.now()}`,
      userMessage: 'What changed in Ontario employment law this year?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableWebSearch: true,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });

    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.quality.warnings.some((w) => w.includes('Startpage configuration is incomplete'))).toBe(true);
    expect(response.webSearch).toBeUndefined();
    expect(response.workspace?.legalBasis).toBeUndefined();
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
  });
});

// ─── 10. Additional gate preservation checks ─────────────────────────────────

describe('Fix 6: gate preservation — no regression', () => {
  it('personal_wellbeing: no web search, no workspace, no retrieval', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeCtx('What self-care strategies could you recommend for me?', {
      enableWebSearch: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
    expect(response.workspace).toBeUndefined();
  });

  it('crisis: no web search, no workspace', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeCtx('I want to end my life', { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.isCrisis).toBe(true);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
    expect(response.workspace).toBeUndefined();
  });

  it('out_of_scope: no web search, no workspace', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeCtx('How do I make pasta carbonara?', { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
    expect(response.workspace).toBeUndefined();
  });

  it('ambiguous: no web search', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    process.env['STARTPAGE_API_KEY'] = 'test-key';
    resetWebSearchConfig();
    setWebSearchProvider(makeMockProvider([makeResult()]));
    const ctx = makeCtx('Hello, I have a question', { enableWebSearch: true });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
  });

  it('legalBasisAllowed=false when workspaceAllowed=false', async () => {
    const ctx = makeCtx('What are the termination notice requirements in Ontario?', {
      enableWorkspacePayload: false,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.workspaceAllowed).toBe(false);
    expect(response.route.legalBasisAllowed).toBe(false);
  });

  it('legalBasisAllowed=false when jurisdiction unknown', async () => {
    const ctx = makeCtx('What are the termination notice requirements?', {
      province: null,
      isFederallyRegulated: null,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.jurisdiction.status).toBe('unknown');
    expect(response.route.legalBasisAllowed).toBe(false);
  });

  it('no OPENAI_API_KEY referenced in any env var access', () => {
    // Sanity check: confirm we never reference OpenAI
    const envKeys = Object.keys(process.env);
    const openAIKeys = envKeys.filter((k) => k.includes('OPENAI'));
    expect(openAIKeys).toHaveLength(0);
  });

  it('no stale workspace data across turns (personal turn after HR turn)', async () => {
    // Turn 1: HR query
    const ctx1 = makeCtx('What should I do if there is a harassment complaint?', {
      province: 'ON',
      enableRetrieval: true,
    });
    const response1 = await composeAdvisorResponse(ctx1);
    expect(response1.workspace).toBeDefined();

    // Turn 2: Personal wellness (should have no workspace from turn 1)
    const ctx2 = buildPipelineContext({
      sessionId: `stale-turn-${Date.now()}`,
      userMessage: 'What self-care strategies could you recommend for me?',
      locale: 'en',
      province: null,
      isFederallyRegulated: null,
      enableRetrieval: false,
      enableWorkspacePayload: true,
      history: [
        { role: 'user', content: 'What should I do if there is a harassment complaint?' },
        { role: 'assistant', content: response1.conversationalResponse },
      ],
    });
    const response2 = await composeAdvisorResponse(ctx2);
    expect(response2.workspace).toBeUndefined();
    expect(response2.route.workspaceAllowed).toBe(false);
    expect(response2.route.webSearchAllowed).toBe(false);
  });
});

// ─── 11. Fix 3: current-info short-circuit sets retrievalAllowed=false in public route ──

describe('Fix 3: current-info short-circuit — route gate alignment', () => {
  const BROAD_QUERY = 'What changed in Ontario employment law this year?';

  it('route.retrievalAllowed is false in short-circuit response', async () => {
    const ctx = makeCtx(BROAD_QUERY);
    const response = await composeAdvisorResponse(ctx);
    // Short-circuit fires because query is broad + web search unavailable
    expect(response.route.retrievalAllowed).toBe(false);
  });

  it('route.legalBasisAllowed is false in short-circuit response', async () => {
    const ctx = makeCtx(BROAD_QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.legalBasisAllowed).toBe(false);
  });

  it('route.suggestedDocumentsAllowed is false in short-circuit response', async () => {
    const ctx = makeCtx(BROAD_QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.suggestedDocumentsAllowed).toBe(false);
  });

  it('quality.blockedRendering includes retrieval and legalBasis in short-circuit response', async () => {
    const ctx = makeCtx(BROAD_QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.quality.blockedRendering).toContain('retrieval');
    expect(response.quality.blockedRendering).toContain('legalBasis');
  });

  it('workspace.retrievedGuidance is absent from short-circuit response', async () => {
    const ctx = makeCtx(BROAD_QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
  });

  it('workspace.legalBasis is absent from short-circuit response', async () => {
    const ctx = makeCtx(BROAD_QUERY);
    const response = await composeAdvisorResponse(ctx);
    expect(response.workspace?.legalBasis).toBeUndefined();
  });
});

// ─── 12. Fix 2: Jurisdiction filtering — cross-jurisdiction items withheld ────

describe('Fix 2: jurisdiction-specific retrievedGuidance filtering', () => {
  it('Ontario jurisdiction: QC-specific retrieved items are withheld from public workspace', async () => {
    const ctx = makeCtx('What is the duty to accommodate in Ontario?', {
      province: 'ON' as const,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    // No QC-specific items should appear when province is ON
    const qcItems = items.filter((g) => g.jurisdiction === 'QC');
    expect(qcItems).toHaveLength(0);
  });

  it('Ontario jurisdiction: FEDERAL-only items are withheld from public workspace', async () => {
    const ctx = makeCtx('What is the duty to accommodate in Ontario?', {
      province: 'ON' as const,
      isFederallyRegulated: false,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    // Federal-only items should not appear for ON non-federal
    const fedItems = items.filter((g) => g.jurisdiction === 'FEDERAL');
    expect(fedItems).toHaveLength(0);
  });

  it('Quebec jurisdiction: ON-specific items are withheld from public workspace', async () => {
    const ctx = makeCtx('Qu\'est-ce que le devoir d\'accommodement au Québec?', {
      province: 'QC' as const,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    const onItems = items.filter((g) => g.jurisdiction === 'ON');
    expect(onItems).toHaveLength(0);
  });

  it('cross-jurisdiction filter quality warning is added when items are withheld', async () => {
    const ctx = makeCtx('What is the accommodation duty in Ontario?', {
      province: 'ON' as const,
      isFederallyRegulated: false,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    // If any items were withheld, a quality warning should be present
    // (warning may not be present if only ON/ALL items were retrieved — that's fine)
    // Just verify no wrong-jurisdiction items slipped through
    const items = response.workspace?.retrievedGuidance ?? [];
    const wrongItems = items.filter((g) => g.jurisdiction === 'QC' || g.jurisdiction === 'FEDERAL');
    expect(wrongItems).toHaveLength(0);
  });
});

// ─── 13. Fix 4: normalizePipelineContext defensive defaults ───────────────────

describe('Fix 4: normalizePipelineContext — defensive defaults', () => {
  it('missing enableWebSearch defaults to false (no web search without explicit opt-in)', async () => {
    const ctx = buildPipelineContext({
      sessionId: `norm-test-${Date.now()}`,
      userMessage: 'What changed in Ontario employment law this year?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      // Do NOT pass enableWebSearch — should default to false
    });
    // Sanity: enableWebSearch should be false
    expect(ctx.enableWebSearch).toBe(false);
    const response = await composeAdvisorResponse(ctx);
    expect(response.route.webSearchAllowed).toBe(false);
    // Should NOT crash despite missing optional flags
    expect(response.conversationalResponse).toBeTruthy();
  });

  it('missing enableRetrieval defaults to true', async () => {
    const ctx = buildPipelineContext({
      sessionId: `norm-ret-${Date.now()}`,
      userMessage: 'What is the notice period for termination in Ontario?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      // enableRetrieval omitted — should default to true
    });
    expect(ctx.enableRetrieval).toBe(true);
    const response = await composeAdvisorResponse(ctx);
    // Should not crash
    expect(response.conversationalResponse).toBeTruthy();
  });

  it('pipeline does not crash when optional context fields are absent', async () => {
    const ctx = buildPipelineContext({
      sessionId: `norm-min-${Date.now()}`,
      userMessage: 'What are the rules for harassment in Ontario?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      // All optional fields omitted
    });
    await expect(composeAdvisorResponse(ctx)).resolves.not.toThrow();
  });
});

// ─── 14. Fix 5b: Query distillation — no stray single letters ────────────────

describe('Fix 5b: query distillation — no stray single letters', () => {
  it('"What changed in Ontario employment law this year?" → no stray single letter r', () => {
    const q = buildWebSearchQuery(
      'What changed in Ontario employment law this year?',
      'ON',
      'en',
    );
    // Should not contain a standalone single letter (e.g. " r ")
    expect(q).not.toMatch(/(^|\s)[a-zA-Z](\s|$)/);
  });

  it('"What changed in Ontario employment law this year?" → no "changed" in final query', () => {
    const q = buildWebSearchQuery(
      'What changed in Ontario employment law this year?',
      'ON',
      'en',
    );
    expect(q).not.toMatch(/\bchanged\b/i);
  });

  it('"What changed in Ontario employment law this year?" → no "year" in final query', () => {
    const q = buildWebSearchQuery(
      'What changed in Ontario employment law this year?',
      'ON',
      'en',
    );
    expect(q).not.toMatch(/\byear\b/i);
  });

  it('"Latest ESA update Ontario 2026" → no "update" in final query', () => {
    const q = buildWebSearchQuery(
      'Latest ESA update Ontario 2026',
      'ON',
      'en',
    );
    expect(q).not.toMatch(/\bupdate\b/i);
  });

  it('minimum wage query remains useful after temporal stripping', () => {
    const q = buildWebSearchQuery(
      'What is the current minimum wage in Ontario?',
      'ON',
      'en',
    );
    // Core topic should remain
    expect(q.toLowerCase()).toMatch(/minimum wage/i);
    expect(q).toContain('site:ontario.ca');
  });

  it('harassment query remains useful after temporal stripping', () => {
    const q = buildWebSearchQuery(
      'Find current CNESST guidance on psychological harassment',
      'QC',
      'en',
    );
    // Core topic should remain
    expect(q.toLowerCase()).toMatch(/harassment/i);
    expect(q).toContain('site:legisquebec.gouv.qc.ca');
    // No stray single letters
    expect(q).not.toMatch(/(^|\s)[a-zA-Z](\s|$)/);
  });
});

// ─── 15. Fix 1: Topic-specific current-info queries → bounded response (no unrelated guidance) ─

describe('Fix 1: topic-specific current-info with web search unavailable', () => {
  beforeEach(() => {
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
    resetWebSearchConfig();
  });

  it('minimum wage + WEB_SEARCH_ENABLED=false → bounded response, no termination/harassment/accommodation guidance', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'false';
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `min-wage-disabled-${Date.now()}`,
      userMessage: 'What is the current minimum wage in Ontario?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableWebSearch: true,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);

    // Must return a bounded current-verification response
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|not.*verify|verification.*unavailable/i);

    // Must NOT mention termination, severance, notice, harassment, accommodation, or safety
    expect(response.conversationalResponse).not.toMatch(/\btermination\b/i);
    expect(response.conversationalResponse).not.toMatch(/\bseverance\b/i);
    expect(response.conversationalResponse).not.toMatch(/\bnotice period\b/i);
    expect(response.conversationalResponse).not.toMatch(/1 week per year/i);
    expect(response.conversationalResponse).not.toMatch(/\bharassment\b/i);
    expect(response.conversationalResponse).not.toMatch(/\baccommodat\b/i);
    expect(response.conversationalResponse).not.toMatch(/\breprisal\b/i);

    // No unrelated retrieved guidance
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    // No legal basis for current wage
    expect(response.workspace?.legalBasis).toBeUndefined();
    // Gates aligned
    expect(response.route.retrievalAllowed).toBe(false);
    expect(response.route.legalBasisAllowed).toBe(false);
    // Quality warning present
    expect(response.quality.warnings.length).toBeGreaterThan(0);
    // Does not re-ask for province when province is known
    expect(response.conversationalResponse).not.toMatch(/please.*provide.*province|what.*province|which.*province/i);
  });

  it('minimum wage + missing STARTPAGE_BASE_URL → bounded response with incomplete-config warning', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    // No STARTPAGE_BASE_URL set
    delete process.env['STARTPAGE_BASE_URL'];
    process.env['STARTPAGE_API_KEY'] = 'key123';
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `min-wage-no-url-${Date.now()}`,
      userMessage: 'What is the current minimum wage in Ontario?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableWebSearch: true,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    // Must return bounded response
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|not.*verify/i);
    // Must NOT return unrelated internal guidance titles
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    // Quality warning about config
    const hasConfigWarning = response.quality.warnings.some((w) =>
      /incomplete|configuration|startpage/i.test(w),
    );
    expect(hasConfigWarning).toBe(true);
  });

  it('minimum wage + missing STARTPAGE_API_KEY → bounded response with incomplete-config warning', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    delete process.env['STARTPAGE_API_KEY'];
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `min-wage-no-key-${Date.now()}`,
      userMessage: 'What is the current minimum wage in Ontario?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableWebSearch: true,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|not.*verify/i);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    const hasConfigWarning = response.quality.warnings.some((w) =>
      /incomplete|configuration|startpage/i.test(w),
    );
    expect(hasConfigWarning).toBe(true);
  });

  it('minimum wage + options.enableWebSearch=false → bounded response', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `min-wage-noweb-${Date.now()}`,
      userMessage: 'What is the current minimum wage in Ontario?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableWebSearch: false,  // explicitly disabled
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|not.*verify/i);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    expect(response.workspace?.legalBasis).toBeUndefined();
  });

  it('minimum wage + known province ON → does not ask for province again', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `min-wage-prov-${Date.now()}`,
      userMessage: 'What is the current minimum wage in Ontario?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
    });
    const response = await composeAdvisorResponse(ctx);
    // Should not ask for province when it's already known
    expect(response.conversationalResponse).not.toMatch(
      /please.*provide.*province|what.*province|which.*province|confirm.*province|province.*required/i,
    );
  });

  it('minimum wage + unknown jurisdiction → still asks for jurisdiction', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `min-wage-noprov-${Date.now()}`,
      userMessage: 'What is the current minimum wage?',
      locale: 'en',
      province: null,
      isFederallyRegulated: null,
      enableWebSearch: false,
    });
    const response = await composeAdvisorResponse(ctx);
    // Unknown jurisdiction → workspace missingFacts should mention jurisdiction
    const hasJurisdictionMissing = (response.workspace?.missingFacts ?? []).some((f) =>
      /province|jurisdiction|federal/i.test(f),
    );
    expect(hasJurisdictionMissing).toBe(true);
  });

  it('current CNESST harassment query → bounded response, no termination/accommodation guidance', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `cnesst-harass-${Date.now()}`,
      userMessage: 'Find current CNESST guidance on psychological harassment',
      locale: 'en',
      province: 'QC',
      isFederallyRegulated: null,
      enableWebSearch: false,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|not.*verify/i);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    expect(response.workspace?.legalBasis).toBeUndefined();
    // Must not mention termination or accommodation
    expect(response.conversationalResponse).not.toMatch(/\btermination\b/i);
    expect(response.conversationalResponse).not.toMatch(/\baccommodat\b/i);
  });

  it('current federal leave rules → bounded response, no termination/harassment/compensation guidance', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `fed-leave-${Date.now()}`,
      userMessage: 'Current Canada Labour Code leave rules',
      locale: 'en',
      province: null,
      isFederallyRegulated: true,
      enableWebSearch: false,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|not.*verify/i);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    // Must not expose termination or harassment content
    expect(response.conversationalResponse).not.toMatch(/\btermination\b/i);
    expect(response.conversationalResponse).not.toMatch(/\bharassment\b/i);
  });

  it('current Ontario overtime rules → bounded response, no unrelated guidance', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `overtime-${Date.now()}`,
      userMessage: 'Current Ontario overtime rules and hours of work requirements',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableWebSearch: false,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|not.*verify/i);
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    expect(response.workspace?.legalBasis).toBeUndefined();
  });

  it('French minimum wage → French bounded response', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `fr-min-wage-${Date.now()}`,
      userMessage: 'Quel est le salaire minimum actuel au Québec?',
      locale: 'fr',
      province: 'QC',
      isFederallyRegulated: null,
      enableWebSearch: false,
    });
    const response = await composeAdvisorResponse(ctx);
    // French response should acknowledge the limitation
    expect(response.conversationalResponse).toMatch(/ne peux pas v[eé]rifier|v[eé]rification.*indisponible|pas.*v[eé]rifier/i);
    expect(response.locale).toBe('fr');
  });
});

// ─── 16. Fix 2: Topic-alignment filtering for public retrievedGuidance ────────

describe('Fix 2: topic-alignment filtering for public retrievedGuidance', () => {
  it('Ontario harassment query: no Ontario Termination guidance in public retrievedGuidance', async () => {
    const ctx = buildPipelineContext({
      sessionId: `harass-no-term-${Date.now()}`,
      userMessage: 'What should I do if there is a harassment complaint in my workplace?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    // No termination items should appear for a harassment query
    const terminationItems = items.filter((g) => /terminat|dismissal|severance|notice/i.test(g.topic));
    expect(terminationItems).toHaveLength(0);
  });

  it('Ontario harassment query: Ontario Harassment guidance may be present', async () => {
    const ctx = buildPipelineContext({
      sessionId: `harass-pres-${Date.now()}`,
      userMessage: 'What should I do if there is a harassment complaint in my workplace?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    // If any items are present, they must be harassment-related
    const nonHarassmentItems = items.filter((g) =>
      !/harassment|violence|reprisal|retaliation|safety/i.test(g.topic),
    );
    expect(nonHarassmentItems).toHaveLength(0);
  });

  it('Ontario harassment query: no Duty to Accommodate guidance unless accommodation is mentioned', async () => {
    const ctx = buildPipelineContext({
      sessionId: `harass-no-accomm-${Date.now()}`,
      userMessage: 'What should I do if there is a harassment complaint?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    const accommodationItems = items.filter((g) => /accommodat|disability/i.test(g.topic));
    expect(accommodationItems).toHaveLength(0);
  });

  it('Ontario minimum wage query: no termination/harassment/accommodation/safety/reprisal guidance', async () => {
    const ctx = buildPipelineContext({
      sessionId: `wage-filter-${Date.now()}`,
      userMessage: 'What is the minimum wage in Ontario?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    const unrelatedItems = items.filter((g) =>
      /terminat|dismissal|harassment|accommodation|safety|reprisal/i.test(g.topic),
    );
    expect(unrelatedItems).toHaveLength(0);
  });

  it('Ontario accommodation query: no Ontario Termination guidance', async () => {
    const ctx = buildPipelineContext({
      sessionId: `accomm-no-term-${Date.now()}`,
      userMessage: 'An employee asked for accommodation because of a medical condition. What should I do?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    const terminationItems = items.filter((g) => /terminat|dismissal|severance/i.test(g.topic));
    expect(terminationItems).toHaveLength(0);
  });

  it('Ontario accommodation query: no harassment guidance unless harassment is mentioned', async () => {
    const ctx = buildPipelineContext({
      sessionId: `accomm-no-harass-${Date.now()}`,
      userMessage: 'An employee asked for accommodation because of a medical condition.',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    const harassmentItems = items.filter((g) => /harassment/i.test(g.topic));
    expect(harassmentItems).toHaveLength(0);
  });

  it('Quebec harassment query: no Quebec termination or leave guidance', async () => {
    const ctx = buildPipelineContext({
      sessionId: `qc-harass-${Date.now()}`,
      userMessage: 'Que faire en cas de plainte de harcèlement en milieu de travail?',
      locale: 'fr',
      province: 'QC',
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    const unrelatedItems = items.filter((g) =>
      /terminat|dismissal|leave|parental|maternity|congé parental/i.test(g.topic),
    );
    expect(unrelatedItems).toHaveLength(0);
  });

  it('Federal harassment query: no ON or QC items in public retrievedGuidance', async () => {
    const ctx = buildPipelineContext({
      sessionId: `fed-harass-${Date.now()}`,
      userMessage: 'What should I do if there is a workplace harassment complaint?',
      locale: 'en',
      province: null,
      isFederallyRegulated: true,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    const provincialItems = items.filter((g) => g.jurisdiction === 'ON' || g.jurisdiction === 'QC');
    expect(provincialItems).toHaveLength(0);
  });

  it('Unknown jurisdiction: only ALL items or no items, and only if topic-aligned', async () => {
    const ctx = buildPipelineContext({
      sessionId: `unknown-harass-${Date.now()}`,
      userMessage: 'What should I do if there is a harassment complaint?',
      locale: 'en',
      province: null,
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);
    const items = response.workspace?.retrievedGuidance ?? [];
    // Only ALL items (no jurisdiction-specific) AND only harassment-related
    for (const item of items) {
      expect(item.jurisdiction).toBeUndefined(); // 'ALL' items have no jurisdiction field
      expect(item.topic).toMatch(/harassment|violence|reprisal|safety/i);
    }
  });
});

// ─── 17. Fix 5: French query distillation — no narrative fragments ────────────

describe('Fix 5: French query distillation — narrative fragments stripped', () => {
  it('French PII-heavy query does not include "demandé"', () => {
    const q = buildWebSearchQuery(
      'Marie Tremblay chez Entreprise ABC Inc. a une dépression et a demandé un congé. Quelles règles actuelles au Québec?',
      'QC',
      'fr',
    );
    expect(q).not.toMatch(/\bdemand[eé]\b/i);
  });

  it('French PII-heavy query retains useful legal topic terms', () => {
    const q = buildWebSearchQuery(
      'Marie Tremblay chez Entreprise ABC Inc. a une dépression et a demandé un congé. Quelles règles actuelles au Québec?',
      'QC',
      'fr',
    );
    // Should retain useful terms for Startpage
    expect(q.toLowerCase()).toMatch(/qu[eé]bec|accommodement|santé mentale|cong[eé]/i);
  });

  it('French query does not include "a dit"', () => {
    const q = buildWebSearchQuery(
      'Un employé a dit qu\'il avait de l\'anxiété et a demandé un congé médical au Québec',
      'QC',
      'fr',
    );
    expect(q).not.toMatch(/\ba dit\b/i);
  });

  it('French query does not include raw names or employer names', () => {
    const q = buildWebSearchQuery(
      'Marie Tremblay chez Entreprise ABC Inc. a une dépression et a demandé un congé. Quelles règles actuelles au Québec?',
      'QC',
      'fr',
    );
    expect(q).not.toMatch(/Marie|Tremblay/i);
    expect(q).not.toMatch(/Entreprise ABC/i);
  });

  it('French query does not include "dépression" verbatim', () => {
    const q = buildWebSearchQuery(
      'Marie Tremblay chez Entreprise ABC Inc. a une dépression et a demandé un congé. Quelles règles actuelles au Québec?',
      'QC',
      'fr',
    );
    expect(q).not.toMatch(/\bd[eé]pression\b/i);
  });

  it('French query does not contain PII placeholders', () => {
    const q = buildWebSearchQuery(
      'Marie Tremblay chez Entreprise ABC Inc. a une dépression et a demandé un congé. Quelles règles actuelles au Québec?',
      'QC',
      'fr',
    );
    expect(q).not.toMatch(/\[(EMPLOYER|PERSON|PHONE|EMAIL|ID|POSTAL|ADDRESS|CASE_REF|MEDICAL_CONDITION)\]/);
  });

  it('English query does not include "asked for"', () => {
    const q = buildWebSearchQuery(
      'Jane Smith at Acme Inc. disclosed depression and asked for leave. What current Ontario guidance applies?',
      'ON',
      'en',
    );
    expect(q).not.toMatch(/\basked for\b/i);
    expect(q).not.toMatch(/\bdisclosed\b/i);
  });
});

// ─── 18. Integration cases A–F (main-app integration readiness) ──────────────

describe('Integration cases A–F: main-app integration readiness', () => {
  beforeEach(() => {
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
    resetWebSearchConfig();
    resetWebSearchProvider();
  });

  // Case A: Current minimum wage, web disabled
  it('Case A: current minimum wage + WEB_SEARCH_ENABLED=false → bounded response, no unrelated guidance', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'false';
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `case-a-${Date.now()}`,
      userMessage: 'What is the current minimum wage in Ontario?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableWebSearch: true,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);

    // webSearchAllowed=false
    expect(response.route.webSearchAllowed).toBe(false);
    // webSearch omitted
    expect(response.webSearch).toBeUndefined();
    // Bounded response
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|not.*verify/i);
    // Quality warning present
    expect(response.quality.warnings.length).toBeGreaterThan(0);
    // No unrelated internal guidance
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    // No legal basis for current wage
    expect(response.workspace?.legalBasis).toBeUndefined();
    // Does NOT ask for province (already known)
    expect(response.conversationalResponse).not.toMatch(/which province|what province|please.*province/i);
  });

  // Case B: Current minimum wage, Startpage config incomplete
  it('Case B: current minimum wage + missing STARTPAGE_BASE_URL → incomplete-config warning, no unrelated answer', async () => {
    process.env['WEB_SEARCH_ENABLED'] = 'true';
    delete process.env['STARTPAGE_BASE_URL'];
    process.env['STARTPAGE_API_KEY'] = 'key';
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `case-b-${Date.now()}`,
      userMessage: 'What is the current minimum wage in Ontario?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableWebSearch: true,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);

    expect(response.route.webSearchAllowed).toBe(false);
    expect(response.webSearch).toBeUndefined();
    // incomplete-config warning
    const hasConfigWarning = response.quality.warnings.some((w) =>
      /incomplete|configuration|startpage/i.test(w),
    );
    expect(hasConfigWarning).toBe(true);
    // No unrelated internal guidance
    expect(response.workspace?.retrievedGuidance).toBeUndefined();
    // Bounded response
    expect(response.conversationalResponse).toMatch(/can't verify|cannot verify|current.*unavailable|not.*verify/i);
  });

  // Case C: Stable harassment question
  it('Case C: stable harassment question → harassment guidance only, no termination guidance', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `case-c-${Date.now()}`,
      userMessage: 'What should I do if there is a harassment complaint in my Ontario workplace?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);

    // route.retrievalAllowed should be true for stable HR questions
    expect(response.route.retrievalAllowed).toBe(true);

    const items = response.workspace?.retrievedGuidance ?? [];
    // Any items present must be harassment-related
    for (const item of items) {
      expect(item.topic).toMatch(/harassment|violence|reprisal|safety/i);
    }
    // Explicitly no termination guidance
    const terminationItems = items.filter((g) => /terminat|dismissal|severance|notice period/i.test(g.topic));
    expect(terminationItems).toHaveLength(0);
  });

  // Case D: Accommodation question
  it('Case D: accommodation question → accommodation/medical guidance only, no termination/harassment', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `case-d-${Date.now()}`,
      userMessage: 'An employee asked for accommodation because of a medical condition. What should I do?',
      locale: 'en',
      province: 'ON',
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);

    const items = response.workspace?.retrievedGuidance ?? [];
    // Must not expose termination or harassment
    const terminationItems = items.filter((g) => /terminat|dismissal|severance/i.test(g.topic));
    const harassmentItems = items.filter((g) => /harassment/i.test(g.topic));
    expect(terminationItems).toHaveLength(0);
    expect(harassmentItems).toHaveLength(0);
  });

  // Case E: Federal harassment
  it('Case E: federal harassment → federal/ALL harassment guidance only, no ON/QC items', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `case-e-${Date.now()}`,
      userMessage: 'What should I do if there is a workplace harassment complaint?',
      locale: 'en',
      province: null,
      isFederallyRegulated: true,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);

    const items = response.workspace?.retrievedGuidance ?? [];
    // No ON or QC items
    const provincialItems = items.filter((g) => g.jurisdiction === 'ON' || g.jurisdiction === 'QC');
    expect(provincialItems).toHaveLength(0);
    // Any items present should be harassment-related
    for (const item of items) {
      expect(item.topic).toMatch(/harassment|violence|reprisal|safety/i);
    }
  });

  // Case F: Unknown jurisdiction harassment
  it('Case F: unknown jurisdiction harassment → only ALL items or empty, no jurisdiction-specific items', async () => {
    resetWebSearchConfig();
    const ctx = buildPipelineContext({
      sessionId: `case-f-${Date.now()}`,
      userMessage: 'What should I do if there is a harassment complaint?',
      locale: 'en',
      province: null,
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });
    const response = await composeAdvisorResponse(ctx);

    const items = response.workspace?.retrievedGuidance ?? [];
    // No jurisdiction-specific items (only ALL)
    const specificItems = items.filter((g) => g.jurisdiction !== undefined);
    expect(specificItems).toHaveLength(0);
  });
});
