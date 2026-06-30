/**
 * Web search eval suite.
 *
 * Validates:
 * - correct route and webSearchAllowed gate per intent
 * - web search called or not called as expected
 * - no leaked PII in queries
 * - no raw Startpage/proxy URLs as citations
 * - no legal basis when jurisdiction unknown
 * - no web search on personal/crisis/out-of-scope routes
 * - PII-heavy workplace query produces redacted search query
 *
 * Run: npm run evals
 * All cases are routing/gate-only — no live Startpage or LLM calls required.
 */

import { routeAdvisorMessage } from '../src/core/routeAdvisorMessage';
import { composeAdvisorResponse } from '../src/core/composeAdvisorResponse';
import { buildPipelineContext } from '../src/workspace/buildWorkspacePayload';
import { redactPii, buildWebSearchQuery, requiresCurrentInfo, shouldPerformWebSearch } from '../src/webSearch/buildWebSearchQuery';
import { validateWebUrl, classifyUrl } from '../src/webSearch/validateWebSource';
import { rankWebSources } from '../src/webSearch/rankWebSources';
import { setWebSearchProvider, resetWebSearchProvider } from '../src/webSearch/startpageSearchProvider';
import { loadWebSearchConfig, resetWebSearchConfig } from '../src/webSearch/webSearchConfig';
import type { AdvisorPipelineContext } from '../src/workspace/workspaceTypes';
import type { WebSearchResult } from '../src/webSearch/webSearchTypes';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: `web-eval-${Date.now()}`,
    userMessage,
    locale: 'en',
    province: null,
    isFederallyRegulated: null,
    enableWebSearch: true,
    ...overrides,
  });
}

type EvalCase = {
  name: string;
  message: string;
  overrides?: Partial<Parameters<typeof buildPipelineContext>[0]>;
  validate: (ctx: AdvisorPipelineContext) => string[];
};

// ─── routing gate cases ──────────────────────────────────────────────────────

const routingCases: EvalCase[] = [
  {
    name: 'Ontario ESA update query → webSearchAllowed true + current info signal',
    message: 'What changed in Ontario employment law this year?',
    overrides: { province: 'ON' },
    validate: (ctx) => {
      const errors: string[] = [];
      const route = routeAdvisorMessage(ctx);
      if (!route.webSearchAllowed) errors.push(`expected webSearchAllowed=true, got false (intent=${route.intent})`);
      if (!requiresCurrentInfo(ctx.userMessage)) errors.push('requiresCurrentInfo should be true');
      if (!shouldPerformWebSearch(ctx.userMessage, route.intent)) errors.push('shouldPerformWebSearch should be true');
      return errors;
    },
  },
  {
    name: 'Quebec CNESST harassment query → webSearchAllowed true + current info',
    message: 'Find current CNESST guidance on psychological harassment',
    overrides: { province: 'QC' },
    validate: (ctx) => {
      const errors: string[] = [];
      const route = routeAdvisorMessage(ctx);
      if (!route.webSearchAllowed) errors.push(`expected webSearchAllowed=true, got false`);
      if (!requiresCurrentInfo(ctx.userMessage)) errors.push('requiresCurrentInfo should be true');
      const q = buildWebSearchQuery(ctx.userMessage, 'QC', 'fr');
      if (!q.includes('site:legisquebec.gouv.qc.ca') && !q.includes('site:cnesst.gouv.qc.ca')) {
        errors.push(`expected QC site hint in query: "${q}"`);
      }
      return errors;
    },
  },
  {
    name: 'Federal CLC query → webSearchAllowed true + federal site hint',
    message: 'Current Canada Labour Code leave rules',
    overrides: { isFederallyRegulated: true },
    validate: (ctx) => {
      const errors: string[] = [];
      const route = routeAdvisorMessage(ctx);
      if (!route.webSearchAllowed) errors.push(`expected webSearchAllowed=true`);
      if (!requiresCurrentInfo(ctx.userMessage)) errors.push('requiresCurrentInfo should be true');
      const q = buildWebSearchQuery(ctx.userMessage, 'FEDERAL', 'en');
      if (!q.includes('site:canada.ca')) errors.push(`expected site:canada.ca in query: "${q}"`);
      return errors;
    },
  },
  {
    name: 'Current minimum wage query → webSearchAllowed true',
    message: 'What is the current minimum wage in Ontario?',
    overrides: { province: 'ON' },
    validate: (ctx) => {
      const errors: string[] = [];
      const route = routeAdvisorMessage(ctx);
      if (!route.webSearchAllowed) errors.push(`expected webSearchAllowed=true for pay intent`);
      if (route.intent !== 'pay_hours_or_entitlements') errors.push(`expected pay_hours_or_entitlements, got ${route.intent}`);
      if (!requiresCurrentInfo(ctx.userMessage)) errors.push('requiresCurrentInfo should be true for minimum wage');
      return errors;
    },
  },
  {
    name: 'Self-care query → webSearchAllowed false (no web search)',
    message: 'What self-care strategies could you recommend for me?',
    validate: (ctx) => {
      const errors: string[] = [];
      const route = routeAdvisorMessage(ctx);
      if (route.webSearchAllowed) errors.push('expected webSearchAllowed=false for personal_wellbeing');
      if (route.intent !== 'personal_wellbeing') errors.push(`expected personal_wellbeing, got ${route.intent}`);
      if (shouldPerformWebSearch(ctx.userMessage, route.intent)) errors.push('shouldPerformWebSearch should be false');
      return errors;
    },
  },
  {
    name: '"I feel depressed" → webSearchAllowed false',
    message: 'I feel depressed',
    validate: (ctx) => {
      const errors: string[] = [];
      const route = routeAdvisorMessage(ctx);
      if (route.webSearchAllowed) errors.push('expected webSearchAllowed=false for personal mental health');
      if (shouldPerformWebSearch(ctx.userMessage, route.intent)) errors.push('shouldPerformWebSearch should be false');
      return errors;
    },
  },
  {
    name: 'Crisis input → all gates false including webSearchAllowed',
    message: 'I want to end my life',
    validate: (ctx) => {
      const errors: string[] = [];
      const route = routeAdvisorMessage(ctx);
      if (route.webSearchAllowed) errors.push('webSearchAllowed must be false for crisis');
      if (route.retrievalAllowed) errors.push('retrievalAllowed must be false for crisis');
      if (route.workspaceAllowed) errors.push('workspaceAllowed must be false for crisis');
      if (route.legalBasisAllowed) errors.push('legalBasisAllowed must be false for crisis');
      if (route.intent !== 'possible_crisis_or_self_harm') errors.push(`expected crisis intent, got ${route.intent}`);
      return errors;
    },
  },
  {
    name: 'Unknown jurisdiction + current-law query → no province assumed in query',
    message: 'What are the current employment law changes this year?',
    validate: (ctx) => {
      const errors: string[] = [];
      const route = routeAdvisorMessage(ctx);
      // Web search may run (route allows it for HR compliance)
      // But query must not hardcode a province when jurisdiction is unknown
      const q = buildWebSearchQuery(ctx.userMessage, null, 'en');
      if (q.includes('site:ontario.ca')) errors.push('query must not hardcode site:ontario.ca when jurisdiction is unknown');
      if (q.includes('site:legisquebec.gouv.qc.ca')) errors.push('query must not hardcode QC site when jurisdiction is unknown');
      // Note: routeAdvisorMessage returns intent-level (base) legalBasisAllowed=true for HR compliance.
      // The final effective legalBasisAllowed is computed in computeEffectiveRoute and will be false
      // when jurisdiction.status === 'unknown'. This is tested in other test suites (jurisdictionAndConflicts).
      // Here we just verify the query is safe and jurisdiction-neutral.
      if (route.intent === 'possible_crisis_or_self_harm' || route.intent === 'personal_wellbeing') {
        errors.push(`unexpected route for HR query: ${route.intent}`);
      }
      return errors;
    },
  },
];

// ─── PII redaction cases ─────────────────────────────────────────────────────

type PiiCase = {
  name: string;
  input: string;
  mustNotContain: string[];
};

const piiCases: PiiCase[] = [
  {
    name: 'PII-heavy workplace query — names redacted',
    input: 'Jane Smith at Acme Manufacturing Inc. disclosed depression and asked for leave in Ontario. Her SIN is 123-456-789 and she can be reached at jane@acme.com.',
    mustNotContain: ['Jane Smith', 'Acme Manufacturing', '123-456-789', 'jane@acme.com'],
  },
  {
    name: 'Phone number redacted',
    input: 'The employee called us at 416-555-1234 to report the issue.',
    mustNotContain: ['416-555-1234'],
  },
  {
    name: 'Postal code redacted',
    input: 'Our office is at K1A 0A9 and we need to know if the remote work rules apply.',
    mustNotContain: ['K1A 0A9'],
  },
];

// ─── Source validation cases ──────────────────────────────────────────────────

type SourceCase = {
  name: string;
  url: string;
  expectSuppressed?: boolean;
  expectSourceType?: string;
};

const sourceCases: SourceCase[] = [
  { name: 'Startpage proxy URL suppressed', url: 'https://ixquick-proxy.com/do/proxy?u=https://ontario.ca', expectSuppressed: true },
  { name: 'Private IP suppressed', url: 'http://192.168.1.1/admin', expectSuppressed: true },
  { name: 'Localhost suppressed', url: 'http://localhost:3000/data', expectSuppressed: true },
  { name: 'Ontario.ca classified official_government', url: 'https://ontario.ca/page', expectSourceType: 'official_government' },
  { name: 'canada.ca classified official_government', url: 'https://canada.ca/en/employment', expectSourceType: 'official_government' },
  { name: 'legisquebec classified legislation', url: 'https://legisquebec.gouv.qc.ca/en/document/cs/N-1.1', expectSourceType: 'legislation' },
  { name: 'cnesst classified regulator_or_agency', url: 'https://cnesst.gouv.qc.ca/fr/guide', expectSourceType: 'regulator_or_agency' },
  { name: 'canlii classified legislation', url: 'https://canlii.org/en/on/laws', expectSourceType: 'legislation' },
  { name: 'hrto classified court_or_tribunal', url: 'https://hrto.ca/decision/123', expectSourceType: 'court_or_tribunal' },
];

// ─── Ranking: official beats general ─────────────────────────────────────────

function makeWebResult(overrides: Partial<WebSearchResult> = {}): WebSearchResult {
  return {
    title: 'Test', url: 'https://ontario.ca', snippet: '', sourceDomain: 'ontario.ca',
    retrievedAt: new Date().toISOString(), publishedAt: null,
    sourceType: 'official_government', validationStatus: 'valid', qualityWarnings: [],
    ...overrides,
  };
}

// ─── Query distillation: no PII placeholders in final queries ────────────────

type QueryDistillCase = {
  name: string;
  input: string;
  jurisdiction: string | null;
  locale: 'en' | 'fr';
  mustNotContain: string[];   // forbidden tokens in the final query
  mustMatch?: RegExp;         // optional: final query must match this
};

const queryDistillCases: QueryDistillCase[] = [
  {
    name: 'Named employee + depression → no raw name, no [MEDICAL_CONDITION]',
    input: 'Jane Smith at Acme Manufacturing disclosed depression and asked for leave in Ontario',
    jurisdiction: 'ON',
    locale: 'en',
    mustNotContain: ['Jane', 'Smith', 'Acme', '[EMPLOYER]', '[PERSON]', '[MEDICAL_CONDITION]', 'depression'],
    mustMatch: /ontario|accommodat|mental health|leave/i,
  },
  {
    name: 'Email + phone in query → stripped',
    input: 'Contact hr@corp.com or 416-555-1234 about current Ontario ESA minimum wage',
    jurisdiction: 'ON',
    locale: 'en',
    mustNotContain: ['hr@corp.com', '416-555-1234', '[EMAIL]', '[PHONE]'],
  },
  {
    name: 'SIN in query → stripped',
    input: 'SIN 123-456-789 current CLC leave entitlement federal',
    jurisdiction: 'FEDERAL',
    locale: 'en',
    mustNotContain: ['123-456-789', '[ID]'],
  },
  {
    name: 'Postal code → stripped',
    input: 'Office at K1A 0A9 current Ontario employment standards update',
    jurisdiction: 'ON',
    locale: 'en',
    mustNotContain: ['K1A 0A9', '[POSTAL]'],
  },
  {
    name: 'Case reference → stripped',
    input: 'Case ABC-2025-001 current minimum wage Ontario standards',
    jurisdiction: 'ON',
    locale: 'en',
    mustNotContain: ['ABC-2025-001', '[CASE_REF]'],
  },
  {
    name: 'French titled name (Mme.) → stripped, no [PERSON]',
    input: 'Mme. Marie Tremblay demande les règles actuelles sur le harcèlement au Québec',
    jurisdiction: 'QC',
    locale: 'fr',
    mustNotContain: ['Marie Tremblay', '[PERSON]', '[MEDICAL_CONDITION]'],
  },
  {
    name: 'PII-heavy query under 200 chars',
    input: 'Jane Smith (416-555-1234, jane@acme.com, SIN 123-456-789) at Acme Inc., 123 Main St K1A 0A9 — depression leave Ontario current guidance',
    jurisdiction: 'ON',
    locale: 'en',
    mustNotContain: ['Jane', 'Smith', '416-555-1234', 'jane@acme.com', '123-456-789', 'K1A 0A9', '[EMPLOYER]', '[PERSON]', '[PHONE]', '[EMAIL]', '[ID]', '[POSTAL]', '[MEDICAL_CONDITION]', 'depression'],
  },
];

// ─── Path-aware source classification evals ───────────────────────────────────

type PathClassifyCase = {
  name: string;
  hostname: string;
  pathname: string;
  expectedSourceType: string;
};

const pathClassifyCases: PathClassifyCase[] = [
  { name: 'ontario.ca/laws/... → legislation', hostname: 'ontario.ca', pathname: '/laws/statute/rso-1990-c-e14', expectedSourceType: 'legislation' },
  { name: 'www.ontario.ca/laws/... → legislation (www stripped)', hostname: 'www.ontario.ca', pathname: '/laws/statute/rso-1990-c-e14', expectedSourceType: 'legislation' },
  { name: 'ontario.ca/page/... → official_government', hostname: 'ontario.ca', pathname: '/page/esa', expectedSourceType: 'official_government' },
  { name: 'laws-lois.justice.gc.ca → legislation', hostname: 'laws-lois.justice.gc.ca', pathname: '/en/acts/l-2', expectedSourceType: 'legislation' },
  { name: 'www.laws-lois.justice.gc.ca → legislation (www stripped)', hostname: 'www.laws-lois.justice.gc.ca', pathname: '/en/acts/l-2', expectedSourceType: 'legislation' },
  { name: 'legisquebec.gouv.qc.ca → legislation', hostname: 'legisquebec.gouv.qc.ca', pathname: '/en/document/cs/N-1.1', expectedSourceType: 'legislation' },
  { name: 'canlii.org → legislation', hostname: 'canlii.org', pathname: '/en/on/laws/stat/rso-1990-c-e14', expectedSourceType: 'legislation' },
  { name: 'cnesst.gouv.qc.ca → regulator_or_agency', hostname: 'cnesst.gouv.qc.ca', pathname: '/fr/guide', expectedSourceType: 'regulator_or_agency' },
  { name: 'ohrc.on.ca → regulator_or_agency', hostname: 'ohrc.on.ca', pathname: '/en/guide', expectedSourceType: 'regulator_or_agency' },
  { name: 'hrto.ca → court_or_tribunal', hostname: 'hrto.ca', pathname: '/decision/123', expectedSourceType: 'court_or_tribunal' },
  { name: 'canada.ca/en/employment → official_government', hostname: 'canada.ca', pathname: '/en/employment-social-development', expectedSourceType: 'official_government' },
  { name: 'unknown blog → general_web', hostname: 'someblog.example.com', pathname: '/hr-tips', expectedSourceType: 'general_web' },
];

// ─── Final effective gate evals (composeAdvisorResponse) ─────────────────────

type FinalGateCase = {
  name: string;
  message: string;
  province?: 'ON' | 'QC' | null;
  enableWebSearch: boolean;
  envEnabled: boolean;
  envHasUrl: boolean;
  envHasKey: boolean;
  expectedWebSearchAllowed: boolean;
  expectedWebSearchUsed?: boolean;
};

const finalGateCases: FinalGateCase[] = [
  {
    name: 'WEB_SEARCH_ENABLED=false → route.webSearchAllowed=false',
    message: 'What changed in Ontario employment law this year?',
    province: 'ON', enableWebSearch: true,
    envEnabled: false, envHasUrl: true, envHasKey: true,
    expectedWebSearchAllowed: false,
  },
  {
    name: 'options.enableWebSearch=false → route.webSearchAllowed=false',
    message: 'What changed in Ontario employment law this year?',
    province: 'ON', enableWebSearch: false,
    envEnabled: true, envHasUrl: true, envHasKey: true,
    expectedWebSearchAllowed: false,
  },
  {
    name: 'Missing STARTPAGE_BASE_URL → route.webSearchAllowed=false',
    message: 'What changed in Ontario employment law this year?',
    province: 'ON', enableWebSearch: true,
    envEnabled: true, envHasUrl: false, envHasKey: true,
    expectedWebSearchAllowed: false,
  },
  {
    name: 'Missing STARTPAGE_API_KEY → route.webSearchAllowed=false',
    message: 'What changed in Ontario employment law this year?',
    province: 'ON', enableWebSearch: true,
    envEnabled: true, envHasUrl: true, envHasKey: false,
    expectedWebSearchAllowed: false,
  },
  {
    name: 'Fully configured + current-info query → route.webSearchAllowed=true',
    message: 'What changed in Ontario employment law this year?',
    province: 'ON', enableWebSearch: true,
    envEnabled: true, envHasUrl: true, envHasKey: true,
    expectedWebSearchAllowed: true, expectedWebSearchUsed: true,
  },
  {
    name: 'Stable HR query (no current-info signal) → route.webSearchAllowed=false',
    message: 'What is the notice period for termination without cause?',
    province: 'ON', enableWebSearch: true,
    envEnabled: true, envHasUrl: true, envHasKey: true,
    expectedWebSearchAllowed: false,
  },
  {
    name: 'personal_wellbeing → route.webSearchAllowed=false regardless of config',
    message: 'What self-care strategies could you recommend for me?',
    province: null, enableWebSearch: true,
    envEnabled: true, envHasUrl: true, envHasKey: true,
    expectedWebSearchAllowed: false,
  },
  {
    name: 'crisis → route.webSearchAllowed=false regardless of config',
    message: 'I want to kill myself',
    province: null, enableWebSearch: true,
    envEnabled: true, envHasUrl: true, envHasKey: true,
    expectedWebSearchAllowed: false,
  },
  {
    name: 'ambiguous → route.webSearchAllowed=false regardless of config',
    message: 'xyzzy plugh frobozz',
    province: null, enableWebSearch: true,
    envEnabled: true, envHasUrl: true, envHasKey: true,
    expectedWebSearchAllowed: false,
  },
];

// ─── Runner and main ─────────────────────────────────────────────────────────

export async function runWebSearchEvals(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  console.log('\n=== WEB SEARCH EVALS: ROUTING GATES ===\n');
  for (const tc of routingCases) {
    process.stdout.write(`  [${tc.name}] ... `);
    const ctx = makeCtx(tc.message, tc.overrides ?? {});
    const errors = tc.validate(ctx);
    if (errors.length > 0) {
      console.log(`FAIL: ${errors.join('; ')}`);
      failed++;
    } else {
      console.log('PASS');
      passed++;
    }
  }

  console.log('\n=== WEB SEARCH EVALS: PII REDACTION ===\n');
  for (const tc of piiCases) {
    process.stdout.write(`  [${tc.name}] ... `);
    const redacted = redactPii(tc.input);
    const errors: string[] = [];
    for (const forbidden of tc.mustNotContain) {
      if (redacted.includes(forbidden)) errors.push(`PII not redacted: "${forbidden}"`);
    }
    if (errors.length > 0) {
      console.log(`FAIL: ${errors.join('; ')}`);
      failed++;
    } else {
      console.log('PASS');
      passed++;
    }
  }

  console.log('\n=== WEB SEARCH EVALS: SOURCE VALIDATION ===\n');
  for (const tc of sourceCases) {
    process.stdout.write(`  [${tc.name}] ... `);
    const result = validateWebUrl(tc.url);
    const errors: string[] = [];
    if (tc.expectSuppressed && result.validationStatus !== 'suppressed') {
      errors.push(`expected suppressed, got ${result.validationStatus}`);
    }
    if (tc.expectSourceType && result.sourceType !== tc.expectSourceType) {
      errors.push(`expected sourceType=${tc.expectSourceType}, got ${result.sourceType}`);
    }
    if (errors.length > 0) {
      console.log(`FAIL: ${errors.join('; ')}`);
      failed++;
    } else {
      console.log('PASS');
      passed++;
    }
  }

  console.log('\n=== WEB SEARCH EVALS: RANKING ===\n');
  {
    const results = [
      makeWebResult({ url: 'https://example.com', sourceType: 'general_web', validationStatus: 'requires_review' }),
      makeWebResult({ url: 'https://ontario.ca', sourceType: 'official_government', validationStatus: 'valid' }),
      makeWebResult({ url: 'https://canlii.org/test', sourceType: 'legislation', validationStatus: 'valid' }),
    ];
    const ranked = rankWebSources(results);
    process.stdout.write('  [Official sources rank above general web] ... ');
    if (ranked[0].sourceType !== 'legislation' && ranked[0].sourceType !== 'official_government') {
      console.log(`FAIL: expected legislation/official_government first, got ${ranked[0].sourceType}`);
      failed++;
    } else {
      console.log('PASS');
      passed++;
    }

    process.stdout.write('  [Suppressed results excluded from ranking] ... ');
    const withSuppressed = [
      makeWebResult({ url: 'https://ixquick-proxy.com', validationStatus: 'suppressed' }),
      makeWebResult({ url: 'https://ontario.ca', sourceType: 'official_government', validationStatus: 'valid' }),
    ];
    const rankedWithSuppressed = rankWebSources(withSuppressed);
    if (rankedWithSuppressed.some((r) => r.validationStatus === 'suppressed')) {
      console.log('FAIL: suppressed result appeared in ranked output');
      failed++;
    } else {
      console.log('PASS');
      passed++;
    }
  }

  console.log('\n=== WEB SEARCH EVALS: NO PROXY URLS AS CITATIONS ===\n');
  {
    const proxyUrls = [
      'https://ixquick-proxy.com/do/proxy?u=https://ontario.ca',
      'https://www.startpage.com/sp/proxy?ep=&u=https://ontario.ca',
    ];
    for (const url of proxyUrls) {
      process.stdout.write(`  [Proxy URL suppressed: ${url.slice(0, 60)}...] ... `);
      const result = validateWebUrl(url);
      if (result.validationStatus !== 'suppressed') {
        console.log(`FAIL: expected suppressed, got ${result.validationStatus}`);
        failed++;
      } else {
        console.log('PASS');
        passed++;
      }
    }
  }

  console.log('\n=== WEB SEARCH EVALS: QUERY DISTILLATION (NO PII PLACEHOLDERS) ===\n');
  for (const tc of queryDistillCases) {
    process.stdout.write(`  [${tc.name}] ... `);
    const query = buildWebSearchQuery(tc.input, tc.jurisdiction, tc.locale);
    const errors: string[] = [];
    for (const forbidden of tc.mustNotContain) {
      if (query.includes(forbidden)) errors.push(`forbidden token in query: "${forbidden}"`);
    }
    if (tc.mustMatch && !tc.mustMatch.test(query)) {
      errors.push(`query does not match expected pattern ${tc.mustMatch}: "${query}"`);
    }
    if (query.length > 200) {
      errors.push(`query too long (${query.length} chars, max 200)`);
    }
    if (errors.length > 0) {
      console.log(`FAIL: ${errors.join('; ')}`);
      failed++;
    } else {
      console.log('PASS');
      passed++;
    }
  }

  console.log('\n=== WEB SEARCH EVALS: PATH-AWARE SOURCE CLASSIFICATION ===\n');
  for (const tc of pathClassifyCases) {
    process.stdout.write(`  [${tc.name}] ... `);
    const sourceType = classifyUrl(tc.hostname, tc.pathname);
    if (sourceType !== tc.expectedSourceType) {
      console.log(`FAIL: expected ${tc.expectedSourceType}, got ${sourceType} (${tc.hostname}${tc.pathname})`);
      failed++;
    } else {
      console.log('PASS');
      passed++;
    }
  }

  console.log('\n=== WEB SEARCH EVALS: FINAL EFFECTIVE GATE (composeAdvisorResponse) ===\n');
  for (const tc of finalGateCases) {
    process.stdout.write(`  [${tc.name}] ... `);
    // Setup env
    resetWebSearchConfig();
    resetWebSearchProvider();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];
    if (tc.envEnabled) process.env['WEB_SEARCH_ENABLED'] = 'true';
    if (tc.envHasUrl) process.env['STARTPAGE_BASE_URL'] = 'https://sp.example.com';
    if (tc.envHasKey) process.env['STARTPAGE_API_KEY'] = 'eval-test-key';
    loadWebSearchConfig();  // reload after env changes

    // Install a mock provider that returns one valid result
    setWebSearchProvider({
      name: 'startpage',
      async search() {
        return [{
          title: 'Ontario ESA Guide',
          url: 'https://ontario.ca/laws/statute/00e41',
          snippet: 'Employment Standards Act guidance',
          sourceDomain: 'ontario.ca',
          retrievedAt: new Date().toISOString(),
          publishedAt: null,
          sourceType: 'official_government',
          validationStatus: 'valid',
          qualityWarnings: [],
        }];
      },
    });

    const ctx = buildPipelineContext({
      sessionId: `fg-eval-${Date.now()}`,
      userMessage: tc.message,
      locale: 'en',
      province: tc.province ?? null,
      isFederallyRegulated: null,
      enableWebSearch: tc.enableWebSearch,
      enableRetrieval: false,
      enableWorkspacePayload: false,
    });

    const errors: string[] = [];
    try {
      const response = await composeAdvisorResponse(ctx);
      if (response.route.webSearchAllowed !== tc.expectedWebSearchAllowed) {
        errors.push(`route.webSearchAllowed: expected ${tc.expectedWebSearchAllowed}, got ${response.route.webSearchAllowed}`);
      }
      if (tc.expectedWebSearchUsed !== undefined) {
        const used = response.webSearch?.used ?? false;
        if (used !== tc.expectedWebSearchUsed) {
          errors.push(`webSearch.used: expected ${tc.expectedWebSearchUsed}, got ${used}`);
        }
      }
      // Safety: webSearch field should only be present when webSearchAllowed=true AND used=true
      if (!response.route.webSearchAllowed && response.webSearch !== undefined) {
        errors.push('webSearch field present but route.webSearchAllowed=false');
      }
    } catch (err) {
      errors.push(`threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Teardown
    resetWebSearchProvider();
    resetWebSearchConfig();
    delete process.env['WEB_SEARCH_ENABLED'];
    delete process.env['STARTPAGE_BASE_URL'];
    delete process.env['STARTPAGE_API_KEY'];

    if (errors.length > 0) {
      console.log(`FAIL: ${errors.join('; ')}`);
      failed++;
    } else {
      console.log('PASS');
      passed++;
    }
  }

  return { passed, failed };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== Web Search Evals ===');
  console.log('Validates web search gating, PII redaction, source validation, and ranking.\n');

  const result = await runWebSearchEvals();
  const total = result.passed + result.failed;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${result.passed} passed, ${result.failed} failed out of ${total} cases.`);

  if (result.failed > 0) {
    console.error('\nSome web search evals FAILED. See above for details.');
    process.exit(1);
  } else {
    console.log('\nAll web search evals PASSED.');
  }
}

main().catch((err) => {
  console.error('Eval runner error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
