import { AdvisorPipelineContext } from '../workspace/workspaceTypes';
import { ScoredGuidanceItem } from '../retrieval/guidanceTypes';
import { formatCitationList } from '../retrieval/citationValidation';
import { localizedContent, localizedTitle } from '../bilingual/localizeGuidance';
import { LLMMessage } from './provider';
import type { WebSearchResult } from '../webSearch/webSearchTypes';

function buildJurisdictionContext(ctx: AdvisorPipelineContext): string {
  const lines: string[] = [];

  // isFederallyRegulated: null = unknown, true = known federal, false = known non-federal
  const federalKnown = ctx.isFederallyRegulated === true;
  const jurisdictionUnknown = ctx.province === null && ctx.isFederallyRegulated !== true;

  if (jurisdictionUnknown) {
    lines.push('Jurisdiction: UNKNOWN — the user has not specified a province or federal status. Provide jurisdiction-neutral guidance only. Do NOT assume Ontario or any province. Do NOT cite province-specific legislation.');
    return lines.join('\n');
  }

  if (federalKnown || ctx.province === 'FEDERAL') {
    lines.push('Governing legislation: Canada Labour Code (federally regulated employer).');
  } else if (ctx.province) {
    lines.push(`Governing jurisdiction: ${ctx.province}, Canada.`);
    if (ctx.province === 'QC') {
      lines.push(
        'Key statutes: Act Respecting Labour Standards (ARLS/LNT), Québec Charter of Human Rights and Freedoms, Act Respecting Occupational Health and Safety (LSST), QPIP for parental leave.',
        'Enforcement body: CNESST (Commission des normes, de l\'équité, de la santé et de la sécurité du travail).',
      );
    } else if (ctx.province === 'ON') {
      lines.push(
        'Key statutes: Employment Standards Act, 2000 (ESA), Ontario Human Rights Code (OHRC), Occupational Health and Safety Act (OHSA).',
        'Enforcement body: Ontario Ministry of Labour, Immigration, Training and Skills Development; Human Rights Tribunal of Ontario.',
      );
    }
  }

  if (ctx.remoteWork && ctx.employerProvince && ctx.employerProvince !== ctx.province) {
    lines.push(
      `CROSS-JURISDICTION NOTE: This is a remote work situation. Employee is in ${ctx.province ?? 'unknown province'} but the employer is in ${ctx.employerProvince}.`,
      'The engine identifies possible jurisdictional issues and avoids definitive conclusions where governing law may depend on the employment relationship, workplace location, employer operations, and applicable legislation.',
      'Flag likely jurisdictional issues and missing facts. Do NOT claim to resolve governing law. Recommend legal advice.',
    );
  }

  return lines.join('\n');
}

/**
 * Format validated web search results as structured source context for Qwen.
 *
 * Rules injected to Qwen:
 * - May reference only the provided source URLs — do NOT invent URLs, titles, dates, or citations.
 * - Startpage is the discovery mechanism; the underlying page URL is the canonical source.
 * - Web results are not legal authority — they are discovered sources that may require review.
 * - Official government/legislation sources (official_government, legislation) may support guidance.
 * - general_web / unknown sources must be flagged as requiring review.
 * - If web results are insufficient or unvalidated, say "current source verification was insufficient."
 */
function buildWebSearchContext(webResults: WebSearchResult[]): string {
  if (webResults.length === 0) return '';

  const lines: string[] = [
    'Real-time web sources discovered (Startpage discovery — cite underlying URLs only, never Startpage itself):',
    'You may reference these sources in your response. Do NOT invent additional URLs or citations.',
    'Official government and legislation sources (official_government, legislation, regulator_or_agency, court_or_tribunal) may support your guidance.',
    'Sources marked requires_review are from general or unclassified domains — flag them as "discovered source, may require independent verification".',
    'If these sources are insufficient or unvalidated for the question, say so explicitly.',
    '',
  ];

  webResults.forEach((r, i) => {
    const authorityNote =
      r.sourceType === 'official_government' || r.sourceType === 'legislation' || r.sourceType === 'regulator_or_agency'
        ? '[Official/authoritative source]'
        : r.sourceType === 'court_or_tribunal'
          ? '[Court/tribunal source]'
          : '[General web — requires verification]';
    lines.push(`[Web ${i + 1}] ${r.title}`);
    lines.push(`  URL: ${r.url}`);
    lines.push(`  Domain: ${r.sourceDomain} ${authorityNote}`);
    if (r.snippet) lines.push(`  Snippet: ${r.snippet.slice(0, 300)}`);
    lines.push('');
  });

  return lines.join('\n');
}

export function buildAdvisorPrompt(
  ctx: AdvisorPipelineContext,
  guidance: ScoredGuidanceItem[],
  responseMode: string,
  webSearchResults?: WebSearchResult[],
): LLMMessage[] {
  const lang = ctx.locale === 'fr' ? 'French' : 'English';
  const jurisdictionContext = buildJurisdictionContext(ctx);

  // Serve validated French guidance text when responding in French; fall back to
  // English text (never a placeholder) when a French version is not available.
  const guidanceContext = guidance
    .map((g, i) => {
      const citations = formatCitationList(g.citations);
      const title = localizedTitle(g, ctx.locale);
      const content = localizedContent(g, ctx.locale);
      return `[${i + 1}] ${title}\n${content}${citations ? `\nCitations: ${citations}` : ''}`;
    })
    .join('\n\n');

  const webSearchContext = webSearchResults && webSearchResults.length > 0
    ? buildWebSearchContext(webSearchResults)
    : '';

  const modeInstruction = buildModeInstruction(responseMode, ctx);

  const systemPrompt = `You are Dutiva, an expert Canadian HR and employment law advisor. You provide accurate, jurisdiction-specific, natural conversational guidance to HR professionals and employees.

Language: Respond entirely in ${lang}.
${jurisdictionContext}
${ctx.unionized === true ? 'Note: The workplace is unionized. Consider collective agreement implications in your guidance.' : ''}

${modeInstruction}

You must respond with a JSON object in this exact format:
{
  "conversationalResponse": "<natural, empathetic, thorough response — no raw Markdown bold/italic markers, no structured labels like 'Summary:', 'Jurisdiction note:', 'Risk level:'>",
  "summary": "<1-2 sentence workspace summary>",
  "guidance": "<detailed guidance with practical steps — clean prose, no raw Markdown>",
  "immediateSteps": ["<step 1>", "<step 2>"],
  "documentationSteps": ["<step 1>"],
  "missingFacts": ["<fact needed to provide more specific advice>"],
  "followUpQuestions": ["<question 1>", "<question 2>"],
  "complianceRisk": "low" | "medium" | "high" | "critical",
  "safetyRisk": "none" | "watch" | "urgent" | "critical",
  "professionalReviewType": "hr" | "legal" | "medical" | "emergency" | "union" | "none",
  "professionalReviewReason": "<brief reason if review is recommended, otherwise omit>",
  "citationsUsed": ["<citation string from retrieved guidance only — do NOT invent citations>"]
}

Rules:
- conversationalResponse must sound natural and human — not like a structured report.
- Do NOT include labels like "Summary:", "Jurisdiction note:", "Employer-size note:", "Risk level:", "Legal basis:", "Suggested document:", "Escalation:" in conversationalResponse.
- Do NOT output raw Markdown: no **bold**, no *italic*, no ## headings, no bullet list hyphens in conversationalResponse or guidance.
- Do NOT invent legal citations. Only include citations from the retrieved guidance below.
- Do NOT invent web source URLs, titles, dates, or citations not provided in the web sources section below.
- Do NOT silently assume jurisdiction. If unknown, say so and provide jurisdiction-neutral guidance.
- Do NOT impersonate a therapist, doctor, lawyer, emergency service, or government agency.
- Do NOT provide specific legal advice. Provide general guidance and recommend appropriate professional review.
- For personal wellness/mental-health queries: keep response supportive and brief. Do NOT produce HR legal guidance, citations, or workspace cards.
- For crisis/self-harm language: provide only supportive triage and crisis resource direction. No legal guidance.
- Distinguish clearly between: (1) internal validated guidance context, (2) external web sources, (3) user-provided facts, (4) missing facts, (5) assumptions.
- A web source is not automatically a legal citation. Do not place web source URLs in citationsUsed.

${guidanceContext ? `Retrieved internal guidance context (validated source-law/corpus entries — cite only what is listed here):\n${guidanceContext}` : 'No specific internal guidance retrieved. Use general knowledge only. Do NOT invent citations.'}

${webSearchContext || 'No real-time web sources were retrieved for this query.'}`;

  const history: LLMMessage[] = ctx.history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  return [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: ctx.userMessage },
  ];
}

function buildModeInstruction(responseMode: string, ctx: AdvisorPipelineContext): string {
  switch (responseMode) {
    case 'high_risk_escalation':
      return `Mode: HIGH RISK. This situation involves elevated compliance or safety risk. Be thorough, identify immediate risks, and recommend appropriate professional review (HR or legal). Do not overstate urgency or repeat escalation language more than once.`;
    case 'legal_issue_spotting':
      return `Mode: LEGAL ISSUE SPOTTING. Identify potential legal claims and employer exposure. Be specific about which legal frameworks may apply. Flag missing facts needed for a more definitive assessment.`;
    case 'document_drafting':
      return `Mode: DOCUMENT DRAFTING. Help structure a compliant document. Be explicit about assumptions made. Flag all fields that need to be customized for the specific situation.`;
    case 'supportive_triage':
      return ctx.province !== null
        ? `Mode: SUPPORTIVE TRIAGE with HR context. The situation may have personal and workplace dimensions. Respond with empathy first. If there is a workplace issue, help identify next steps without being prescriptive.`
        : `Mode: SUPPORTIVE TRIAGE. Respond with empathy and clarity. Do not produce legal guidance, citations, or workspace cards.`;
    default:
      return `Mode: HR COMPLIANCE ADVISOR. Provide practical, accurate, jurisdiction-specific guidance. Identify what facts are missing for a more complete answer.`;
  }
}
