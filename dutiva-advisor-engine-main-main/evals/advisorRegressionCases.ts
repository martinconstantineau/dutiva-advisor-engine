/**
 * Advisor regression eval suite.
 * These cases validate deterministic routing, jurisdiction handling,
 * crisis detection, and route contract compliance.
 *
 * Run: npm run evals
 *
 * NOTE: Cases that use composeAdvisorResponse make live LLM calls if QWEN_API_KEY is set.
 * Routing-only cases use routeAdvisorMessage and do NOT require the LLM.
 */

import { routeAdvisorMessage } from '../src/core/routeAdvisorMessage';
import { buildPipelineContext } from '../src/workspace/buildWorkspacePayload';
import { AdvisorPipelineContext, AdvisorResponse } from '../src/workspace/workspaceTypes';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeCtx(
  userMessage: string,
  overrides: Partial<Parameters<typeof buildPipelineContext>[0]> = {},
): AdvisorPipelineContext {
  return buildPipelineContext({
    sessionId: `eval-${Date.now()}`,
    userMessage,
    locale: 'en',
    province: null,
    isFederallyRegulated: null,  // null = unknown — never default to false
    ...overrides,
  });
}

type RoutingCase = {
  name: string;
  message: string;
  overrides?: Partial<Parameters<typeof buildPipelineContext>[0]>;
  expectIntent?: string;
  expectMode?: string;
  expectSurface?: string;
  expectRetrievalAllowed?: boolean;
  expectWorkspaceAllowed?: boolean;
  expectLegalBasisAllowed?: boolean;
  expectSuggestedDocumentsAllowed?: boolean;
};

// ─── routing-only cases (no LLM required) ───────────────────────────────────

const routingCases: RoutingCase[] = [
  // A. Self-care
  {
    name: 'Self-care → personal_wellbeing / supportive_triage / advisor_chat (no retrieval)',
    message: 'What self-care strategies could you recommend for me?',
    expectIntent: 'personal_wellbeing',
    expectMode: 'supportive_triage',
    expectSurface: 'advisor_chat',
    expectRetrievalAllowed: false,
    expectWorkspaceAllowed: false,
    expectLegalBasisAllowed: false,
    expectSuggestedDocumentsAllowed: false,
  },
  {
    name: 'Self-care take care of myself → personal_wellbeing',
    message: 'How can I take care of myself?',
    expectIntent: 'personal_wellbeing',
    expectMode: 'supportive_triage',
    expectRetrievalAllowed: false,
  },
  // B. Personal mental health
  {
    name: '"I feel depressed" → personal_mental_health / supportive_triage',
    message: 'I feel depressed',
    expectMode: 'supportive_triage',
    expectRetrievalAllowed: false,
    expectWorkspaceAllowed: false,
    expectLegalBasisAllowed: false,
  },
  {
    name: '"I am overwhelmed" → supportive_triage',
    message: 'I am overwhelmed',
    expectMode: 'supportive_triage',
    expectRetrievalAllowed: false,
  },
  // C. Crisis
  {
    name: 'Crisis language → possible_crisis_or_self_harm (not high_risk_escalation)',
    message: 'I want to kill myself because of what my employer did',
    expectIntent: 'possible_crisis_or_self_harm',
    expectMode: 'supportive_triage',
    expectSurface: 'advisor_chat',
    expectRetrievalAllowed: false,
    expectWorkspaceAllowed: false,
    expectLegalBasisAllowed: false,
    expectSuggestedDocumentsAllowed: false,
  },
  // D. Employee mental health (HR perspective)
  {
    name: 'Employee depression disclosure → employee_medical_or_accommodation',
    message: 'An employee told me they are depressed. What should I do?',
    expectIntent: 'employee_medical_or_accommodation',
    expectRetrievalAllowed: true,
    expectWorkspaceAllowed: true,
    expectLegalBasisAllowed: true,
  },
  {
    name: 'Employee burnout time off → employee_medical_or_accommodation',
    message: 'An employee says they are burned out and needs time off',
    expectIntent: 'employee_medical_or_accommodation',
    expectRetrievalAllowed: true,
  },
  {
    name: 'Mental health leave → employee_medical_or_accommodation',
    message: 'My employee needs mental health leave',
    expectIntent: 'employee_medical_or_accommodation',
    expectRetrievalAllowed: true,
  },
  // E. Harassment
  {
    name: 'Harassment complaint → harassment_or_workplace_violence / high_risk_escalation',
    message: 'What should I do if there is a harassment complaint?',
    expectIntent: 'harassment_or_workplace_violence',
    expectMode: 'high_risk_escalation',
    expectSurface: 'hybrid',
    expectRetrievalAllowed: true,
    expectWorkspaceAllowed: true,
  },
  // F. Termination
  {
    name: 'Termination without cause → termination_or_discipline',
    message: 'I was terminated without cause after 5 years. What am I entitled to?',
    expectIntent: 'termination_or_discipline',
    expectRetrievalAllowed: true,
    expectWorkspaceAllowed: true,
  },
  // G. Out of scope
  {
    name: 'Recipe → out_of_scope / out_of_scope_redirect',
    message: 'How do I make pasta carbonara?',
    expectIntent: 'out_of_scope',
    expectMode: 'out_of_scope_redirect',
    expectRetrievalAllowed: false,
    expectWorkspaceAllowed: false,
  },
  // H. No Ontario default — unknown jurisdiction
  {
    name: 'No province + null federal → jurisdiction unknown, no Ontario default',
    message: 'What notice period am I entitled to?',
    overrides: { province: null, isFederallyRegulated: null },
    expectRetrievalAllowed: true,
  },
  // I. Mode naming — request "hr_compliance" is a client hint, response mode is "hr_compliance_advisor"
  {
    name: 'Mode: general HR query routes to hr_compliance_advisor internal mode',
    message: 'What are the basic HR policies I need?',
    expectMode: 'hr_compliance_advisor',
    expectSurface: 'hybrid',
  },
  // J. Mode naming — crisis overrides requested mode
  {
    name: 'Mode override: crisis overrides any requested mode → supportive_triage',
    message: 'I want to kill myself because of what happened at work',
    expectIntent: 'possible_crisis_or_self_harm',
    expectMode: 'supportive_triage',
    expectSurface: 'advisor_chat',
  },
  // K. French personal wellness smoke test
  {
    name: 'FR: self-care → personal_wellbeing (supportive chat only)',
    message: 'Comment puis-je prendre soin de moi?',
    overrides: { locale: 'fr' },
    expectIntent: 'personal_wellbeing',
    expectMode: 'supportive_triage',
    expectRetrievalAllowed: false,
    expectWorkspaceAllowed: false,
  },
  // L. French employee medical smoke test
  {
    name: 'FR: employee medical disclosure → employee_medical_or_accommodation',
    message: 'Un employé m\'a dit qu\'il est déprimé. Que dois-je faire?',
    overrides: { locale: 'fr' },
    expectIntent: 'employee_medical_or_accommodation',
    expectRetrievalAllowed: true,
    expectWorkspaceAllowed: true,
  },
  // M. French harassment smoke test
  {
    name: 'FR: harassment query → harassment / high_risk_escalation',
    message: 'Que faire face à une plainte de harcèlement?',
    overrides: { locale: 'fr' },
    expectIntent: 'harassment_or_workplace_violence',
    expectMode: 'high_risk_escalation',
    expectRetrievalAllowed: true,
  },
  // N. Privacy/confidentiality route
  {
    name: 'Privacy query → privacy_or_confidentiality intent',
    message: 'What are our obligations under PIPEDA for employee personal data?',
    expectIntent: 'privacy_or_confidentiality',
    expectRetrievalAllowed: true,
  },
  // O. Ambiguous input
  {
    name: 'Ambiguous input → ambiguous / supportive_triage / advisor_chat',
    message: 'Hello, I have a question',
    expectIntent: 'ambiguous',
    expectMode: 'supportive_triage',
    expectSurface: 'advisor_chat',
    expectRetrievalAllowed: false,
    expectWorkspaceAllowed: false,
    expectLegalBasisAllowed: false,
    expectSuggestedDocumentsAllowed: false,
  },
];

// ─── route validation helpers ────────────────────────────────────────────────

function runRoutingCases(): { passed: number; failed: number } {
  console.log('\n=== ROUTING CASES (deterministic, no LLM) ===\n');
  let passed = 0;
  let failed = 0;

  for (const tc of routingCases) {
    process.stdout.write(`  [${tc.name}] ... `);
    try {
      const ctx = makeCtx(tc.message, tc.overrides);
      const route = routeAdvisorMessage(ctx);
      const errors: string[] = [];

      if (tc.expectIntent !== undefined && route.intent !== tc.expectIntent) {
        errors.push(`expected intent=${tc.expectIntent}, got ${route.intent}`);
      }
      if (tc.expectMode !== undefined && route.responseMode !== tc.expectMode) {
        errors.push(`expected mode=${tc.expectMode}, got ${route.responseMode}`);
      }
      if (tc.expectSurface !== undefined && route.surface !== tc.expectSurface) {
        errors.push(`expected surface=${tc.expectSurface}, got ${route.surface}`);
      }
      if (tc.expectRetrievalAllowed !== undefined && route.retrievalAllowed !== tc.expectRetrievalAllowed) {
        errors.push(`expected retrievalAllowed=${tc.expectRetrievalAllowed}, got ${route.retrievalAllowed}`);
      }
      if (tc.expectWorkspaceAllowed !== undefined && route.workspaceAllowed !== tc.expectWorkspaceAllowed) {
        errors.push(`expected workspaceAllowed=${tc.expectWorkspaceAllowed}, got ${route.workspaceAllowed}`);
      }
      if (tc.expectLegalBasisAllowed !== undefined && route.legalBasisAllowed !== tc.expectLegalBasisAllowed) {
        errors.push(`expected legalBasisAllowed=${tc.expectLegalBasisAllowed}, got ${route.legalBasisAllowed}`);
      }
      if (tc.expectSuggestedDocumentsAllowed !== undefined && route.suggestedDocumentsAllowed !== tc.expectSuggestedDocumentsAllowed) {
        errors.push(`expected suggestedDocumentsAllowed=${tc.expectSuggestedDocumentsAllowed}, got ${route.suggestedDocumentsAllowed}`);
      }

      if (errors.length > 0) {
        console.log(`FAIL: ${errors.join('; ')}`);
        failed++;
      } else {
        console.log('PASS');
        passed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg}`);
      failed++;
    }
  }

  return { passed, failed };
}

// ─── response contract validation (requires LLM) ────────────────────────────

type LLMCase = {
  name: string;
  message: string;
  overrides?: Partial<Parameters<typeof buildPipelineContext>[0]>;
  validate: (r: AdvisorResponse) => string[];
};

async function runLLMCases(): Promise<{ passed: number; failed: number }> {
  if (!process.env['QWEN_API_KEY']) {
    console.log('\n=== LLM CASES (skipped — QWEN_API_KEY not set) ===\n');
    return { passed: 0, failed: 0 };
  }

  const { composeAdvisorResponse } = await import('../src/core/composeAdvisorResponse');

  const llmCases: LLMCase[] = [
    {
      name: 'Response contract — all required fields present',
      message: 'What notice am I entitled to after 3 years?',
      overrides: { province: 'ON' },
      validate: (r) => {
        const errors: string[] = [];
        if (!r.conversationalResponse) errors.push('missing conversationalResponse');
        if (!r.route) errors.push('missing route');
        if (!r.jurisdiction) errors.push('missing jurisdiction');
        if (!r.risk) errors.push('missing risk');
        if (!r.professionalReview) errors.push('missing professionalReview');
        if (!r.quality) errors.push('missing quality');
        if (typeof r.isCrisis !== 'boolean') errors.push('missing isCrisis');
        return errors;
      },
    },
    {
      name: 'No Ontario default — unknown jurisdiction',
      message: 'What is the minimum notice period?',
      overrides: { province: null },
      validate: (r) => {
        const errors: string[] = [];
        if (r.jurisdiction.status !== 'unknown') errors.push(`expected jurisdiction.status=unknown, got ${r.jurisdiction.status}`);
        if (r.jurisdiction.province === 'ON') errors.push('Ontario was silently applied');
        // No Ontario-specific citation should appear
        const text = JSON.stringify(r);
        if (/Employment Standards Act.*2000.*s\. \d/i.test(text) && r.jurisdiction.status !== 'known') {
          errors.push('Ontario-specific citation appeared without known jurisdiction');
        }
        return errors;
      },
    },
    {
      name: 'Crisis route — isCrisis=true, no workspace, no retrieval',
      message: 'I want to kill myself',
      validate: (r) => {
        const errors: string[] = [];
        if (!r.isCrisis) errors.push('expected isCrisis=true');
        if (r.route.intent !== 'possible_crisis_or_self_harm') errors.push(`expected intent=possible_crisis_or_self_harm, got ${r.route.intent}`);
        if (r.route.responseMode !== 'supportive_triage') errors.push(`expected responseMode=supportive_triage, got ${r.route.responseMode}`);
        if (r.workspace) errors.push('workspace should be absent for crisis');
        if (r.risk.safety !== 'critical') errors.push(`expected safety=critical, got ${r.risk.safety}`);
        if (r.professionalReview.type !== 'emergency') errors.push(`expected professionalReview.type=emergency, got ${r.professionalReview.type}`);
        return errors;
      },
    },
    {
      name: 'Self-care — no retrieval, no workspace, no raw Markdown',
      message: 'What self-care strategies could you recommend for me?',
      validate: (r) => {
        const errors: string[] = [];
        if (r.route.retrievalAllowed) errors.push('retrievalAllowed should be false');
        if (r.workspace) errors.push('workspace should be absent');
        if (/\*{1,3}/.test(r.conversationalResponse)) errors.push('raw Markdown ** found in conversationalResponse');
        if (/\bRetrieved Guidance\b/i.test(r.conversationalResponse)) errors.push('Retrieved Guidance label found in response');
        if (/\bLegal basis\b/i.test(r.conversationalResponse)) errors.push('Legal basis label found in response');
        return errors;
      },
    },
    {
      name: 'Harassment — high-risk route, workspace present',
      message: 'What should I do if there is a harassment complaint?',
      overrides: { province: 'ON' },
      validate: (r) => {
        const errors: string[] = [];
        if (r.route.intent !== 'harassment_or_workplace_violence') errors.push(`expected harassment intent, got ${r.route.intent}`);
        if (r.isCrisis) errors.push('harassment should not set isCrisis');
        // Response must not have raw Markdown
        if (/\*{1,3}/.test(r.conversationalResponse)) errors.push('raw Markdown found in conversationalResponse');
        return errors;
      },
    },
  ];

  console.log('\n=== LLM CASES (live calls) ===\n');
  let passed = 0;
  let failed = 0;

  for (const tc of llmCases) {
    process.stdout.write(`  [${tc.name}] ... `);
    try {
      const ctx = makeCtx(tc.message, tc.overrides);
      const response = await composeAdvisorResponse(ctx);
      const errors = tc.validate(response);
      if (errors.length > 0) {
        console.log(`FAIL: ${errors.join('; ')}`);
        failed++;
      } else {
        console.log('PASS');
        passed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg}`);
      failed++;
    }
  }

  return { passed, failed };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Dutiva Advisor Engine — Regression Evals\n');

  const routingResult = runRoutingCases();
  const llmResult = await runLLMCases();

  const totalPassed = routingResult.passed + llmResult.passed;
  const totalFailed = routingResult.failed + llmResult.failed;
  const total = routingResult.passed + routingResult.failed + llmResult.passed + llmResult.failed;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${totalPassed} passed, ${totalFailed} failed out of ${total} cases.`);
  if (llmResult.passed === 0 && llmResult.failed === 0) {
    console.log('(LLM cases skipped — set QWEN_API_KEY to run them.)');
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Eval runner error:', err);
  process.exit(1);
});
