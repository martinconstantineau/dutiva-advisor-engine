import { AdvisorPipelineContext, AdvisorRoute, AdvisorIntent, AdvisorResponseMode } from '../workspace/workspaceTypes';
import { classifySensitiveInput } from '../safety/classifySensitiveInput';

// Personal wellbeing — no workplace context indicators (EN + FR)
const PERSONAL_WELLBEING_PATTERNS = [
  /\bself[.\-\s]?care\b/i,
  /\bhow\s+(can\s+i|do\s+i)\s+(take\s+care|look\s+after)\s+(of\s+)?myself\b/i,
  /\b(relax|unwind|de-?stress|self[.\-\s]?care\s+strateg)\b/i,
  // French
  /\b(prendre\s+soin\s+de\s+moi|prendre\s+soin\s+de\s+soi|soin\s+de\s+soi|bien[.\-\s]?être\s+personnel)\b/i,
  /\bcomment\s+(puis[.\-\s]?je|faire\s+pour)\s+me\s+(détendre|reposer|ressourcer|sentir\s+mieux)\b/i,
];

// Personal mental health without employer/HR framing
const PERSONAL_MENTAL_HEALTH_PATTERNS = [
  /^\s*i\s+(feel|am|'?m)\s+(depressed|anxious|overwhelmed|burned?\s*out|stressed|struggling)\b/i,
  /^\s*i\s+(feel|am|'?m)\s+not\s+(okay|ok|well)\b/i,
  /^\s*i\s+(can'?t|cannot)\s+(cope|function|go\s+on)\b/i,
];

// Workplace mental health / employer perspective (EN + FR)
const WORKPLACE_MENTAL_HEALTH_PATTERNS = [
  /\b(an\s+employee|my\s+employee|my\s+worker|staff\s+member|team\s+member)\s+(told|said|says|disclosed|mentioned|reported|is|has)\b/i,
  /\b(employee|worker|staff)\s+(depression|anxiety|burnout|mental\s+health|distress)\b/i,
  /\b(accommodate|accommodation)\s+(mental|psychiatric|psychological)\b/i,
  /\bmental\s+health\s+leave\b/i,
  /\bmedical\s+leave\b/i,
  /\b(an\s+employee|my\s+employee)\s+(is\s+)?(burned?\s*out|depressed|anxious)\b/i,
  // French employer perspective patterns
  /\b(un\s+employ[eé]|mon\s+employ[eé]|un\s+travailleur|un\s+membre\s+du\s+personnel)\s+(m['']a|a)\s+(dit|inform[eé]|signal[eé]|mentionn[eé]|divulgu[eé])\b/i,
  /\b(employ[eé]|travailleur|personnel)\s+(d[eé]pression|anxiet[eé]|[eé]puisement|sant[eé]\s+mentale|d[eé]tresse)\b/i,
  /\bcong[eé]\s+(maladie|sant[eé]\s+mentale|m[eé]dical)\b/i,
  /\b(accommodement|mesures\s+d['']adaptation)\s+(sant[eé]\s+mentale|m[eé]dical|handicap)\b/i,
  /\b(est\s+)?d[eé]prim[eé](e)?\s+(et|,)\s+(a\s+besoin|demande|veut)\b/i,
];

// Accommodation / disability / medical-restriction requests (EN + FR)
// Covers queries that do not include mental health language but are clearly
// about the duty to accommodate, disability, functional limitations, medical notes,
// medical documentation, functional-information requests, or medical restrictions.
const ACCOMMODATION_PATTERNS = [
  // English — accommodation/disability request framing
  /\b(asked?\s+for|request(ed|ing)?|needs?|requires?|seeking)\s+(an?\s+)?accommodat/i,
  /\bduty\s+to\s+accommodat/i,
  /\bdisability\s+accommodat/i,
  /\bhuman\s+rights?\s+accommodat/i,
  /\baccommodat\w*\s+under\s+human\s+rights?\b/i,
  /\bundue\s+hardship\b/i,
  /\bmodified\s+(duties|work)\b/i,
  /\breturn[\s-]to[\s-]work\s+(restriction|plan|accommodat|modification)\b/i,
  /\bmedical\s+restrictions?\s+(create|present|pose|cause)\b/i,
  /\b(accommodate|accommodat)\s+(a\s+)?(disability|disabled|condition|restriction)\b/i,

  // Functional limitations / restrictions / abilities / capacity / information
  /\bfunctional\s+(limitations?|restrictions?|abilities?|ability|capacities?|capacity|information)\b/i,
  /\bfunctional\s+(abilities?|capacity)\s+form\b/i,

  // Doctor/physician note, medical note, medical certificate, medical documentation,
  // medical information, return-to-work note, fit-to-work note.
  // Handles straight and curly apostrophes, possessive, and plural forms.
  /\b(doctors?|physician[''\u2019s]*|doctor[''\u2019s]*)\s+notes?\b/i,
  /\bmedical\s+(notes?|certificate|documentation|information)\b/i,
  /\b(return[\s-]to[\s-]work|fitness[\s-]?for[\s-]?work|fit[\s-]?to[\s-]?work)\s+notes?\b/i,

  // Employee provided/gave/submitted/returned a medical note or documentation
  /\b(employee|worker|staff|employ[eé])\s+(gave|gives|provided|submitted|sent|returned|furnished)\s+(us\s+|me\s+)?(a\s+)?(doctor[''\u2019s]*\s+notes?|medical\s+(notes?|certificate|documentation|information)|functional\s+(abilities?\s+form|capacity\s+form|information))\b/i,

  // What can we ask for / request regarding medical or functional information
  /\bwhat\s+(medical\s+(information|details|documentation)|diagnosis|functional)\s+(can|may|should)\s+(we|i|the\s+employer|HR)\s+(ask\s+for|request|require)\b/i,
  /\bwhat\s+(can|may|should)\s+(we|i|the\s+employer|HR)\s+(ask\s+for|request|require)\s+(in\s+)?(a\s+)?(functional\s+(abilities?\s+form|capacity\s+form)|doctor[''\u2019s]*\s+notes?|medical\s+(notes?|certificate|documentation))\b/i,

  // Diagnosis information / details
  /\bdiagnosis\s+(information|details|rapport|or)\b/i,
  /\b(do\s+we|do\s+i|does)\s+need\s+(the\s+)?diagnosis\b/i,

  // What to do with a doctor's / medical note
  /\bwhat\s+(should\s+(i|we)|do\s+(i|we))\s+(do\s+)?(with|about|regarding)\s+(a\s+)?(doctor[''\u2019s]*\s+notes?|medical\s+(notes?|certificate|documentation|restriction|limitation))\b/i,

  // French — demande d'accommodement / limitations fonctionnelles / billet médical
  /\bdemande\s+d[''\u2019]accommodement\b/i,
  /\b(demand[eé]|demande)\s+(un[e]?\s+)?accommodement\b/i,
  /\bmesures?\s+d[''\u2019]adaptation\b/i,
  /\blimitations?\s+fonctionnelle?s?\b/i,
  /\brestrictions?\s+fonctionnelle?s?\b/i,
  /\bcapacit[eé]s?\s+fonctionnelle?s?\b/i,
  /\bformulaire\s+de\s+capacit[eé]s?\s+fonctionnelle?s?\b/i,
  /\brestrictions?\s+m[eé]dicale?s?\b/i,
  /\bretour\s+au\s+travail\s+(avec\s+)?(restriction|accommodement|modification|plan)\b/i,
  /\bcontrainte\s+excessive\b/i,
  /\bhandicap\b/i,
  /\bdroit[s]?\s+(de\s+la\s+personne|[aà]\s+l[''\u2019]accommodement)\b/i,
  /\bbillet\s+m[eé]dical\b/i,
  /\bnote\s+m[eé]dicale\b/i,
  /\bcertificat\s+m[eé]dical\b/i,
  /\bdocumentation\s+m[eé]dicale\b/i,
  /\brenseignements?\s+m[eé]dicaux\b/i,
  /\binformation\s+m[eé]dicale\b/i,
  /\baptitude\s+au\s+travail\b/i,
  /\bbillet\s+de\s+retour\s+au\s+travail\b/i,
  /\b(diagnostic|détails\s+du\s+diagnostic)\b/i,
  /\bquels\s+renseignements?\s+m[eé]dicaux\b/i,
  /\bque\s+(pouvons-nous|pouvez-vous|peut-on|puis-je)\s+(nous\s+)?demander\b/i,
  /\baccommodement\b/i,
];

/**
 * Lightweight topic-category guard used as a routing safety net.
 * If a query carries a medical-disclosure or accommodation signal, it should not
 * fall back to general_hr_compliance or ambiguous — it should be treated as an
 * employee medical/accommodation question. Higher-priority routes (crisis,
 * harassment, termination, leave, pay) are evaluated above this check.
 */
function hasMedicalOrAccommodationTopicSignal(message: string): boolean {
  const lower = message.toLowerCase();
  // Covers the same core terms as the medical_disclosure / accommodation categories
  // used in getQueryTopicCategories().
  return /\b(accommodation|accommodement|disability|handicap|modified\s+(duties|work)|return[\s-]to[\s-]work|light\s+duties|duty\s+to\s+accommodate|contrainte\s+excessive|undue\s+hardship)\b/i.test(lower)
    || /\bfunctional\s+(limitations?|restrictions?|abilities?|ability|capacities?|capacity|information)\b/i.test(lower)
    || /\b(medical\s+(notes?|certificate|documentation|information|disclosure|restriction|condition)|diagnosis|doctor[''\u2019s]*\s+notes?|doctors\s+notes?|physician[''\u2019s]*\s+notes?|fit[\s-]?to[\s-]?work|fitness[\s-]?for[\s-]?work|billet\s+m[eé]dical|certificat\s+m[eé]dical|note\s+m[eé]dicale|documentation\s+m[eé]dicale|renseignements?\s+m[eé]dicaux|information\s+m[eé]dicale|limitations?\s+fonctionnelle?s?|capacit[eé]s?\s+fonctionnelle?s?|restrictions?\s+m[eé]dicale?s?)\b/i.test(lower)
    || /\bwhat\s+(medical\s+(information|details|documentation)|diagnosis|functional)\s+(can|may|should)\s+(we|i|the\s+employer|HR)\s+(ask\s+for|request|require)\b/i.test(lower)
    || matchAny(ACCOMMODATION_PATTERNS, message);
}

// Harassment / violence (EN + FR)
const HARASSMENT_PATTERNS = [
  /\b(harassment|harass(ment)?|bullying|bully|hostile\s+work\s+environment|violence\s+in\s+the\s+workplace|workplace\s+violence)\b/i,
  /\b(sexual\s+harassment|sexual\s+assault)\b/i,
  /\bharassment\s+complaint\b/i,
  // French
  /\b(harc[eè]lement|intimidation|violence\s+au\s+travail|milieu\s+de\s+travail\s+hostile)\b/i,
  /\b(plainte\s+de\s+harc[eè]lement|signalement\s+de\s+harc[eè]lement)\b/i,
  /\bque\s+faire\s+face\s+[aà]\s+une\s+plainte\b/i,
];

// Termination / discipline (EN + FR)
const TERMINATION_PATTERNS = [
  /\b(terminat\w*|dismiss\w*|fired|let\s+go|layoff|lay\s+off|constructive\s+dismissal|wrongful\s+dismissal|disciplin\w*|performance\s+improvement\s+plan|\bpip\b)\b/i,
  // Notice period / severance
  /\b(notice\s+period|termination\s+notice|pay\s+in\s+lieu|severance\s+(package|pay|entitlement)|without\s+cause|unjust\s+dismissal)\b/i,
  // French — note: accented final chars (é) are not JS word chars, so \b after them fails;
  // use (?!\w) as a trailing guard for patterns ending in accented chars.
  /(?:préavis|pr[eé]avis(?:\s+de\s+cong[eé])?|cong[eé]di[eé](?!\w)|licenci[eé](?!\w)|licenciement|ind[eé]mnit[eé](?!\w)|mise\s+[aà]\s+pied|cong[eé]\s+sans\s+cause)/i,
];

// Leave / absence (EN + FR)
// Covers named leave types, CLC/federal leave references, and leave-entitlement framing.
const LEAVE_PATTERNS = [
  // Named leave types
  /\b(maternity|parental|sick\s+leave|medical\s+leave|leave\s+of\s+absence|bereavement|compassionate\s+leave|family\s+leave|EI\s+benefit|disability\s+leave)\b/i,
  /\b(personal\s+leave|family\s+responsibility\s+leave|protected\s+leave|leave\s+entitlements?|leave\s+rules?|leave\s+provisions?)\b/i,
  // Federal / CLC leave framing
  /\b(federal\s+leave|federally\s+regulated\s+leave|canada\s+labour\s+code\s+leave|CLC\s+leave)\b/i,
  /\bleave\s+(under|pursuant\s+to)\s+(the\s+)?(canada\s+labour\s+code|CLC)\b/i,
  // French — named leave types (note: \b fails after accented chars; use (?!\w) as trailing guard)
  /\bcong[eé]\s+de\s+(maternit[eé]|parental(?!\w)|maladie|m[eé]dical|deuil|compassion|famille|personnel)(?!\w)/i,
  /\bcong[eé]s?\s+(prot[eé]g[eé]s?|pr[eé]vus?|f[eé]d[eé]raux?|d[''']invalidit[eé])(?!\w)/i,
  // "règles de congé" / "droit au congé" — don't rely on \b after accented final char
  /r[eè]gles?\s+de\s+cong[eé]/i,
  /droits?\s+aux?\s+cong[eé]s?/i,
  /droit\s+au\s+cong[eé]/i,
  /\b(code\s+canadien\s+du\s+travail|CCT)\s+cong[eé]/i,
];

// Pay / hours (EN + FR)
const PAY_PATTERNS = [
  /\b(overtime|minimum\s+wage|wages|pay\s+equity|payroll|deduction|vacation\s+pay|holiday\s+pay|hours\s+of\s+work)\b/i,
  // French
  /\b(salaire\s+minimum|heures\s+suppl[eé]mentaires|[eé]galit[eé]\s+salariale|d[eé]duction\s+salariale|cong[eé]\s+annuel|indemnit[eé]\s+de\s+cong[eé]|jours\s+f[eé]ri[eé]s|r[eé]mun[eé]ration)\b/i,
];

// Document drafting
const DRAFTING_PATTERNS = [
  /\b(draft|template|letter\s+of|write\s+(a|the)|create\s+(a|the)\s+document|sample\s+(policy|letter|agreement|form))\b/i,
];

// Out of scope
const OUT_OF_SCOPE_PATTERNS = [
  /\b(recipe|cooking|cuisine|pasta|carbonara|chef|bake|baking|weather|sport|movie|music|game|celebrity|stock\s+market|crypto|bitcoin)\b/i,
  /\b(how\s+do\s+i\s+(draw|paint|sing|dance|code|program|cook|make\s+pasta))\b/i,
];

// Workplace context indicators — presence of these suggests HR context even in personal-sounding messages
const WORKPLACE_CONTEXT_INDICATORS = [
  /\b(employer|employee|workplace|at\s+work|manager|supervisor|HR|human\s+resources|my\s+job|my\s+boss|coworker|colleague)\b/i,
];

// HR keywords — used to distinguish a vague HR question from a truly ambiguous input
const HR_CONTEXT_KEYWORDS = [
  'hr', 'human resources', 'employment', 'employee', 'employer', 'workplace', 'work', 'manager', 'boss',
  'colleague', 'contract', 'pay', 'wage', 'salary', 'leave', 'termination', 'fired', 'dismiss', 'discipline',
  'harass', 'accommodat', 'disability', 'safety', 'overtime', 'vacation', 'sick', 'benefit', 'policy',
  'complaint', 'investigation', 'union', 'collective agreement', 'ei', 'compensation', 'notice', 'severance',
  'reprisal', 'retaliation', 'whistleblower', 'discriminat', 'wrongful', 'probation', 'probationary',
];

function hasWorkplaceContext(msg: string): boolean {
  return WORKPLACE_CONTEXT_INDICATORS.some((p) => p.test(msg));
}

function hasHRContextKeywords(msg: string): boolean {
  const lower = msg.toLowerCase();
  return HR_CONTEXT_KEYWORDS.some((kw) => lower.includes(kw));
}

function matchAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

function buildRoute(
  intent: AdvisorIntent,
  responseMode: AdvisorResponseMode,
  surface: 'advisor_chat' | 'workspace' | 'hybrid',
  retrievalAllowed: boolean,
  workspaceAllowed: boolean,
  legalBasisAllowed: boolean,
  suggestedDocumentsAllowed: boolean,
  webSearchAllowed = false,
): AdvisorRoute {
  return { intent, responseMode, surface, retrievalAllowed, workspaceAllowed, legalBasisAllowed, suggestedDocumentsAllowed, webSearchAllowed };
}

export function routeAdvisorMessage(ctx: AdvisorPipelineContext): AdvisorRoute {
  const msg = ctx.userMessage;

  // 1. Crisis — absolute priority; all gates false including webSearchAllowed
  const sensitivity = classifySensitiveInput(msg);
  if (sensitivity.level === 'crisis') {
    return buildRoute('possible_crisis_or_self_harm', 'supportive_triage', 'advisor_chat', false, false, false, false, false);
  }

  // 2. Out of scope — no web search.
  // Guard against false positives: bare topical words like "sport" or "game" must
  // not redirect a legitimate HR question that carries workplace/HR context
  // (e.g. "an employee was injured playing a sport at our company event").
  if (matchAny(OUT_OF_SCOPE_PATTERNS, msg) && !hasWorkplaceContext(msg) && !hasHRContextKeywords(msg)) {
    return buildRoute('out_of_scope', 'out_of_scope_redirect', 'advisor_chat', false, false, false, false, false);
  }

  // 3. Personal wellbeing (no workplace context) — no web search
  if (matchAny(PERSONAL_WELLBEING_PATTERNS, msg) && !hasWorkplaceContext(msg)) {
    return buildRoute('personal_wellbeing', 'supportive_triage', 'advisor_chat', false, false, false, false, false);
  }

  // 4. Personal mental health (no workplace context) — no web search
  if (matchAny(PERSONAL_MENTAL_HEALTH_PATTERNS, msg) && !hasWorkplaceContext(msg)) {
    return buildRoute('personal_mental_health', 'supportive_triage', 'advisor_chat', false, false, false, false, false);
  }

  // 5. Workplace mental health / accommodation / medical — web search eligible
  if (matchAny(WORKPLACE_MENTAL_HEALTH_PATTERNS, msg)) {
    const isHighRisk = /\b(safety|risk|harm|imminent)\b/i.test(msg);
    const mode: AdvisorResponseMode = isHighRisk ? 'high_risk_escalation' : 'hr_compliance_advisor';
    return buildRoute('employee_medical_or_accommodation', mode, 'hybrid', true, true, true, true, true);
  }

  // 5b. Accommodation / disability / medical restriction requests — web search eligible
  // Catches queries that frame the duty to accommodate, functional limitations, modified duties,
  // disability, or medical notes without using mental-health language (step 5 above).
  if (matchAny(ACCOMMODATION_PATTERNS, msg)) {
    const isHighRisk = /\b(safety|risk|harm|imminent)\b/i.test(msg);
    const mode: AdvisorResponseMode = isHighRisk ? 'high_risk_escalation' : 'hr_compliance_advisor';
    return buildRoute('employee_medical_or_accommodation', mode, 'hybrid', true, true, true, true, true);
  }

  // 6. Harassment / violence — web search eligible
  if (matchAny(HARASSMENT_PATTERNS, msg)) {
    return buildRoute('harassment_or_workplace_violence', 'high_risk_escalation', 'hybrid', true, true, true, true, true);
  }

  // 7. Termination / discipline — web search eligible
  if (matchAny(TERMINATION_PATTERNS, msg)) {
    return buildRoute('termination_or_discipline', 'hr_compliance_advisor', 'hybrid', true, true, true, true, true);
  }

  // 8. Leave / absence — web search eligible
  if (matchAny(LEAVE_PATTERNS, msg)) {
    return buildRoute('leave_or_absence', 'hr_compliance_advisor', 'hybrid', true, true, true, true, true);
  }

  // 9. Pay / hours — web search eligible (minimum wage, holiday pay often needs current data)
  if (matchAny(PAY_PATTERNS, msg)) {
    return buildRoute('pay_hours_or_entitlements', 'hr_compliance_advisor', 'hybrid', true, true, true, true, true);
  }

  // 10. Privacy / confidentiality — web search eligible
  if (/\b(privacy|confidential|personal\s+information|personal\s+data|PIPEDA|PIPPA|consent\s+to\s+disclose|right\s+to\s+privacy)\b/i.test(msg)) {
    return buildRoute('privacy_or_confidentiality', 'hr_compliance_advisor', 'hybrid', true, true, true, true, true);
  }

  // 11. Document drafting — web search not allowed by default (user must ask for source verification)
  if (ctx.mode === 'document_drafting' || matchAny(DRAFTING_PATTERNS, msg)) {
    return buildRoute('document_drafting', 'document_drafting', 'hybrid', true, true, false, true, false);
  }

  // 12. Legal issue spotting — web search eligible
  if (ctx.mode === 'legal_issue_spotting') {
    return buildRoute('general_hr_compliance', 'legal_issue_spotting', 'hybrid', true, true, true, true, true);
  }

  // 13. Sensitive (not crisis) — web search eligible
  if (sensitivity.level === 'sensitive') {
    return buildRoute('general_hr_compliance', 'high_risk_escalation', 'hybrid', true, true, true, false, true);
  }

  // 13b. Medical/accommodation topic fallback — a query that carries a medical-disclosure
  // or accommodation signal must not end up as general_hr_compliance or ambiguous. This is a
  // safety net after all higher-priority specific routes have had a chance.
  if (hasMedicalOrAccommodationTopicSignal(msg)) {
    const isHighRisk = /\b(safety|risk|harm|imminent)\b/i.test(msg);
    const mode: AdvisorResponseMode = isHighRisk ? 'high_risk_escalation' : 'hr_compliance_advisor';
    return buildRoute('employee_medical_or_accommodation', mode, 'hybrid', true, true, true, true, true);
  }

  // 14. Default — distinguish vague HR questions from truly ambiguous inputs
  if (hasHRContextKeywords(msg)) {
    return buildRoute('general_hr_compliance', 'hr_compliance_advisor', 'hybrid', true, true, true, true, true);
  }

  // 15. Truly ambiguous — ask for clarification, no web search
  return buildRoute('ambiguous', 'supportive_triage', 'advisor_chat', false, false, false, false, false);
}
