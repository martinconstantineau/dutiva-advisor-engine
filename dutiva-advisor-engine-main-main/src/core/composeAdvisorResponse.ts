import {
  AdvisorPipelineContext,
  AdvisorResponse,
  AdvisorRoute,
  AdvisorJurisdiction,
  AdvisorRisk,
  AdvisorProfessionalReview,
  AdvisorWorkspacePayload,
  AdvisorLegalBasisItem,
  AdvisorRetrievedGuidanceItem,
  AdvisorWebSearchMeta,
  MatchLabel,
  Province,
} from '../workspace/workspaceTypes';
import { parseAdvisorLLMOutput } from '../llm/parseAdvisorJson';
import { retrieveGuidance } from '../retrieval/retrieveGuidance';
import { buildAdvisorPrompt } from '../llm/buildAdvisorPrompt';
import { callLLM } from '../llm/provider';
import { sanitizeProviderError } from '../llm/qwenProvider';
import { cleanAdvisorText, cleanAdvisorTextArray, cleanLabel } from './cleanAdvisorText';
import { validateAdvisorResponse } from './validateAdvisorResponse';
import { routeAdvisorMessage } from './routeAdvisorMessage';
import { classifySensitiveInput } from '../safety/classifySensitiveInput';
import { formatCrisisConversationalResponse } from '../safety/crisisRouting';
import { classifyScopeBoundary, formatScopeBoundaryResponse } from '../safety/classifyScopeBoundary';
import { validateRawStringCitation, reconcileRawCitation } from '../retrieval/citationValidation';
import { getPlaybookForIntent } from '../playbooks';
import { getQueryTopicCategories } from '../retrieval/topicClassification';
import { ScoredGuidanceItem, GuidanceCategory } from '../retrieval/guidanceTypes';
import { runWebSearch } from '../webSearch/webSearchProvider';
import { getWebSearchConfig, isWebSearchConfigured } from '../webSearch/webSearchConfig';
import { requiresCurrentInfo } from '../webSearch/buildWebSearchQuery';
import type { WebSearchMeta } from '../webSearch/webSearchTypes';
import {
  filterRetrievedGuidanceForPromptAndWorkspace,
} from '../retrieval/filterRetrievedGuidance';

// ─── Current-info availability helpers ─────────────────────────────────────

// getQueryTopicCategories() now lives in ../retrieval/topicClassification (single
// source of truth, shared with filterRetrievedGuidance). Imported above.

/**
 * Returns true when the query asks for current/update information but does NOT
 * include a recognisable specific HR sub-topic. These "broad current-update"
 * queries (e.g. "What changed in Ontario employment law this year?") cannot be
 * meaningfully answered from internal static guidance because every piece of
 * internal guidance is topic-specific, and serving the top-scored item
 * (typically termination/ESA) would be misleading.
 */
function isBroadCurrentUpdateQuery(message: string): boolean {
  if (!requiresCurrentInfo(message)) return false;
  return getQueryTopicCategories(message).length === 0;
}

/**
 * Canonical display labels for each GuidanceCategory, used in unavailable responses.
 */
const CATEGORY_DISPLAY_EN: Partial<Record<GuidanceCategory, string>> = {
  compensation: 'minimum wage and compensation',
  harassment: 'workplace harassment and violence',
  accommodation: 'duty to accommodate',
  medical_disclosure: 'medical disclosure',
  leave: 'leave entitlements',
  termination: 'termination and notice',
  reprisal: 'anti-reprisal obligations',
  workplace_safety: 'workplace safety',
  general: 'HR compliance',
};

const CATEGORY_DISPLAY_FR: Partial<Record<GuidanceCategory, string>> = {
  compensation: 'salaire minimum et rémunération',
  harassment: 'harcèlement et violence au travail',
  accommodation: 'obligation d\'accommodement',
  medical_disclosure: 'divulgation médicale',
  leave: 'droits aux congés',
  termination: 'licenciement et préavis',
  reprisal: 'obligations anti-représailles',
  workplace_safety: 'sécurité au travail',
  general: 'conformité RH',
};

/**
 * Build a topic-specific "current-info unavailable" response.
 *
 * Unlike the broad-update version, this acknowledges the specific topic the user
 * asked about, explains why we cannot give a current figure/rule, and points to
 * the appropriate official source. It must NOT answer the current-number question
 * from internal static guidance.
 */
function buildTopicSpecificCurrentInfoUnavailableResponse(
  ctx: AdvisorPipelineContext,
  jurisdiction: AdvisorJurisdiction,
  topicCategories: GuidanceCategory[],
  webSearchDisabledReason: 'disabled' | 'unconfigured' | 'not_requested',
): string {
  const isEn = ctx.locale !== 'fr';
  const prov = jurisdiction.province;
  const isKnown = jurisdiction.status === 'known' && prov;

  const primaryCategory = topicCategories[0] ?? 'general';

  if (isEn) {
    const topicLabel = CATEGORY_DISPLAY_EN[primaryCategory] ?? 'this HR topic';

    const jurisdictionPhrase = isKnown
      ? prov === 'FEDERAL'
        ? 'for federally regulated employers'
        : `in ${prov}`
      : 'in the applicable jurisdiction';

    const reasonPhrase =
      webSearchDisabledReason === 'disabled'
        ? 'real-time web search is currently disabled'
        : webSearchDisabledReason === 'unconfigured'
          ? 'real-time web search is not fully configured for this deployment'
          : 'real-time web search was not enabled for this request';

    const sourceHint = isKnown
      ? prov === 'FEDERAL'
        ? 'canada.ca/en/employment-social-development, laws-lois.justice.gc.ca, or the Canada Industrial Relations Board'
        : prov === 'ON'
          ? 'ontario.ca (Employment Standards Act page) or the Ontario Ministry of Labour'
          : prov === 'QC'
            ? 'legisquebec.gouv.qc.ca, cnesst.gouv.qc.ca, or the Commission des normes, de l\'équité, de la santé et de la sécurité du travail'
            : 'the applicable provincial or federal government website'
      : 'the applicable provincial or federal government website';

    const jurisdictionMissing = !isKnown
      ? ' To provide jurisdiction-specific guidance, please confirm the province or whether the employer is federally regulated.'
      : '';

    return `I can't verify the current rules on ${topicLabel} ${jurisdictionPhrase} because ${reasonPhrase}. ` +
      `${primaryCategory === 'compensation' ? 'Minimum wage amounts and other rates can change at any time, so I should not provide a current figure without checking an official source. ' : ''}` +
      `To get accurate current information, please check ${sourceHint} directly, or enable and configure Startpage web search so this engine can retrieve and validate current official sources before responding.` +
      jurisdictionMissing;
  } else {
    // French
    const topicLabel = CATEGORY_DISPLAY_FR[primaryCategory] ?? 'ce sujet RH';

    const jurisdictionPhrase = isKnown
      ? prov === 'FEDERAL'
        ? 'pour les employeurs sous réglementation fédérale'
        : `en ${prov}`
      : 'dans la juridiction applicable';

    const reasonPhrase =
      webSearchDisabledReason === 'disabled'
        ? 'la recherche web en temps réel est actuellement désactivée'
        : webSearchDisabledReason === 'unconfigured'
          ? 'la recherche web en temps réel n\'est pas entièrement configurée pour ce déploiement'
          : 'la recherche web en temps réel n\'était pas activée pour cette demande';

    const sourceHint = isKnown && prov === 'QC'
      ? 'legisquebec.gouv.qc.ca, cnesst.gouv.qc.ca ou la Commission des normes'
      : isKnown && prov === 'FEDERAL'
        ? 'canada.ca/fr/emploi-developpement-social ou laws-lois.justice.gc.ca'
        : 'le site Web du gouvernement provincial ou fédéral applicable';

    const jurisdictionMissing = !isKnown
      ? ' Pour fournir des conseils spécifiques à la juridiction, veuillez confirmer la province ou si l\'employeur est réglementé au niveau fédéral.'
      : '';

    return `Je ne peux pas vérifier les règles actuelles sur ${topicLabel} ${jurisdictionPhrase} car ${reasonPhrase}. ` +
      `${primaryCategory === 'compensation' ? 'Les taux de salaire minimum peuvent changer à tout moment — je ne devrais pas fournir un chiffre actuel sans vérifier une source officielle. ' : ''}` +
      `Pour obtenir des informations actuelles précises, veuillez consulter ${sourceHint} directement.` +
      jurisdictionMissing;
  }
}

/**
 * Build the bounded "current-info unavailable" conversational response.
 *
 * Used when the user asks for current/recent information and web search
 * cannot run (disabled, unconfigured, or failed). The response must:
 * - Acknowledge the jurisdiction if known (don't re-ask for it)
 * - Explain that current-source verification is unavailable
 * - Give safe next steps (official sources, enable web search)
 * - NOT answer the current-law question from internal static guidance
 * - NOT mention termination notice, ESA minimums, or other unrelated topics
 */
function buildCurrentInfoUnavailableResponse(
  ctx: AdvisorPipelineContext,
  jurisdiction: AdvisorJurisdiction,
  webSearchDisabledReason: 'disabled' | 'unconfigured' | 'not_requested',
): string {
  const isEn = ctx.locale !== 'fr';
  const prov = jurisdiction.province;
  const isKnown = jurisdiction.status === 'known' && prov;

  if (isEn) {
    const jurisdictionPhrase = isKnown
      ? prov === 'FEDERAL'
        ? 'for federally regulated employers'
        : `for employers in ${prov}`
      : 'in the applicable jurisdiction';

    const reasonPhrase =
      webSearchDisabledReason === 'disabled'
        ? 'real-time web search is currently disabled'
        : webSearchDisabledReason === 'unconfigured'
          ? 'real-time web search is not fully configured for this deployment'
          : 'real-time web search was not enabled for this request';

    const sourceHint = isKnown
      ? prov === 'FEDERAL'
        ? 'canada.ca/en/employment-social-development, laws-lois.justice.gc.ca, or the Canada Industrial Relations Board'
        : prov === 'ON'
          ? 'ontario.ca/page/employment-standards-act, ohrc.on.ca, or wsib.on.ca'
          : prov === 'QC'
            ? 'legisquebec.gouv.qc.ca, cnesst.gouv.qc.ca, or cdpdj.qc.ca'
            : 'the applicable provincial or federal government website'
      : 'the applicable provincial or federal government website';

    return `I can't verify current employment law changes ${jurisdictionPhrase} because ${reasonPhrase}. ` +
      `I can provide general HR compliance context from internal vetted guidance on stable topics like accommodation, harassment procedures, or notice obligations, but I should not summarise "what changed this year" without checking current official sources — doing so risks surfacing outdated or unrelated guidance. ` +
      `To get accurate current information, please check ${sourceHint} directly, or enable and configure Startpage web search so this engine can retrieve and validate current official sources before responding.`;
  } else {
    // French
    const jurisdictionPhrase = isKnown
      ? prov === 'FEDERAL'
        ? 'pour les employeurs sous réglementation fédérale'
        : `pour les employeurs en ${prov}`
      : 'dans la juridiction applicable';

    const reasonPhrase =
      webSearchDisabledReason === 'disabled'
        ? 'la recherche web en temps réel est actuellement désactivée'
        : webSearchDisabledReason === 'unconfigured'
          ? 'la recherche web en temps réel n\'est pas entièrement configurée pour ce déploiement'
          : 'la recherche web en temps réel n\'était pas activée pour cette demande';

    const sourceHint = isKnown && prov === 'QC'
      ? 'legisquebec.gouv.qc.ca, cnesst.gouv.qc.ca ou cdpdj.qc.ca'
      : 'le site Web du gouvernement provincial ou fédéral applicable';

    return `Je ne peux pas vérifier les modifications actuelles du droit du travail ${jurisdictionPhrase} car ${reasonPhrase}. ` +
      `Je peux fournir un contexte général de conformité RH à partir de conseils internes vérifiés sur des sujets stables, mais je ne devrais pas résumer « ce qui a changé cette année » sans consulter les sources officielles actuelles. ` +
      `Pour obtenir des informations actuelles précises, veuillez consulter ${sourceHint} directement.`;
  }
}

// ─── Match label helpers ────────────────────────────────────────────────────

function scoreToMatchLabel(score: number): MatchLabel {
  if (score >= 8) return 'High match';
  if (score >= 4) return 'Medium match';
  return 'Low match';
}

// ─── Jurisdiction resolver ──────────────────────────────────────────────────

function resolveJurisdiction(ctx: AdvisorPipelineContext): AdvisorJurisdiction {
  const notes: string[] = [];
  let status: AdvisorJurisdiction['status'] = 'unknown';
  let effectiveProvince: Province | null = null;

  // isFederallyRegulated: null = unknown, true = known federal, false = known non-federal
  if (ctx.isFederallyRegulated === true) {
    effectiveProvince = 'FEDERAL';
    status = 'known';
  } else if (ctx.province) {
    effectiveProvince = ctx.province;
    status = 'known';
  } else if (ctx.isFederallyRegulated === false) {
    // Known non-federal but no province — still unknown jurisdiction for purposes of citations
    notes.push('Jurisdiction is unknown. The employer is not federally regulated but no province was provided. Guidance is jurisdiction-neutral.');
  } else {
    // isFederallyRegulated is null (unknown) and no province
    notes.push('Jurisdiction is unknown. No province or federal status was specified. Guidance is jurisdiction-neutral and does not cite province-specific legislation.');
  }

  // Remote-work cross-jurisdiction note — identify possible issues, do not resolve governing law
  if (ctx.remoteWork && effectiveProvince && ctx.employerProvince && ctx.employerProvince !== effectiveProvince) {
    notes.push(
      `Cross-jurisdiction remote work: employee in ${effectiveProvince}, employer in ${ctx.employerProvince}.`,
      'The engine identifies possible jurisdictional issues and avoids definitive conclusions where governing law may depend on the employment relationship, workplace location, employer operations, and applicable legislation. Legal advice is recommended.',
    );
  }

  // Surface any context conflicts detected by the request handler
  if (ctx.contextConflicts && ctx.contextConflicts.length > 0) {
    notes.push(...ctx.contextConflicts);
  }

  return {
    status,
    province: effectiveProvince,
    employerProvince: ctx.employerProvince,
    isFederallyRegulated: ctx.isFederallyRegulated,
    remoteWork: ctx.remoteWork,
    notes,
  };
}

// ─── Professional review resolver ──────────────────────────────────────────

function resolveProfessionalReview(
  reviewType: string,
  reviewReason: string | undefined,
  route: AdvisorRoute,
  isCrisis: boolean,
): AdvisorProfessionalReview {
  if (isCrisis) {
    return { recommended: true, type: 'emergency', reason: 'Immediate crisis support is needed.' };
  }

  const type = reviewType as AdvisorProfessionalReview['type'];

  // Ensure routing-level escalation recommendations are respected
  if (route.responseMode === 'high_risk_escalation' && (type === 'none' || !type)) {
    return { recommended: true, type: 'legal', reason: reviewReason ?? 'Situation involves elevated legal risk.' };
  }

  return {
    recommended: type !== 'none',
    type: type || 'none',
    reason: reviewReason,
  };
}

// ─── Effective route resolver ───────────────────────────────────────────────

/**
 * Compute the final effective route gates.
 *
 * The deterministic router sets intent-level eligibility (e.g., an HR topic is
 * generally eligible for legal basis). This function converts those into final
 * rendering permissions for this specific response by applying:
 *   - feature options (enableRetrieval, enableWorkspacePayload, enableDrafting)
 *   - jurisdiction safety (known or explicitly assumed)
 *   - context conflict detection (no silent legal conclusion from conflicting context)
 *
 * `route.legalBasisAllowed` is the final gate: it is false unless the topic is
 * eligible, the workspace is allowed, the jurisdiction is safe, and there are no
 * unresolved conflicts. Because legal basis is part of workspace rendering,
 * `legalBasisAllowed` is also false whenever `workspaceAllowed` is false.
 *
 * `route.webSearchAllowed` is the final rendering gate for public web-search sources.
 * It is true ONLY when all of the following are satisfied:
 *   1. Intent is HR/compliance-eligible (baseRoute.webSearchAllowed)
 *   2. Per-request option ctx.enableWebSearch is true
 *   3. WEB_SEARCH_ENABLED=true globally
 *   4. Startpage endpoint + key are configured (STARTPAGE_BASE_URL, STARTPAGE_API_KEY)
 *   5. The user query requires current/external information
 * This means the consuming app can treat a `true` value as a definitive signal
 * that web search ran (or may run) and results are safe to display, without needing
 * to re-check config, options, or intent.
 */
function computeEffectiveRoute(
  baseRoute: AdvisorRoute,
  jurisdiction: AdvisorJurisdiction,
  ctx: AdvisorPipelineContext,
): AdvisorRoute {
  const isJurisdictionSafe = jurisdiction.status === 'known' || jurisdiction.status === 'assumed';
  const hasUnresolvedConflict = (ctx.contextConflicts?.length ?? 0) > 0;

  // Web search final effective gate: all five conditions must be true
  const webCfg = getWebSearchConfig();
  const webSearchAllowed =
    baseRoute.webSearchAllowed &&          // intent allows it
    ctx.enableWebSearch &&                 // per-request option
    webCfg.enabled &&                      // WEB_SEARCH_ENABLED=true
    isWebSearchConfigured(webCfg) &&       // endpoint + key present
    requiresCurrentInfo(ctx.userMessage);  // query needs current/external info

  // workspaceAllowed: option gate applied
  const workspaceAllowed = baseRoute.workspaceAllowed && ctx.enableWorkspacePayload;

  // legalBasisAllowed: legal basis is part of workspace rendering, so it requires
  // workspaceAllowed=true in addition to jurisdiction safety and no conflicts.
  const legalBasisAllowed =
    baseRoute.legalBasisAllowed &&
    workspaceAllowed &&              // workspace must be enabled
    isJurisdictionSafe &&
    !hasUnresolvedConflict;

  return {
    ...baseRoute,
    retrievalAllowed: baseRoute.retrievalAllowed && ctx.enableRetrieval,
    workspaceAllowed,
    legalBasisAllowed,
    suggestedDocumentsAllowed:
      baseRoute.suggestedDocumentsAllowed &&
      ctx.enableDrafting &&
      baseRoute.workspaceAllowed &&
      ctx.enableWorkspacePayload,
    webSearchAllowed,
  };
}

// ─── Workspace payload builder ──────────────────────────────────────────────

/**
 * Build the workspace payload, strictly enforcing gate rules.
 * If a gate is false, the corresponding field MUST be omitted.
 *
 * `route` here is the final effective route from computeEffectiveRoute, so
 * legalBasisAllowed already reflects jurisdiction safety and context conflicts.
 */
interface BuildWorkspaceResult {
  payload: AdvisorWorkspacePayload | undefined;
  unvettedCitations: string[];
}


function buildWorkspace(
  llmOutput: ReturnType<typeof parseAdvisorLLMOutput>,
  route: AdvisorRoute,
  jurisdiction: AdvisorJurisdiction,
  retrievedGuidance: ScoredGuidanceItem[],
  ctx: AdvisorPipelineContext,
  qualityWarnings: string[],
): BuildWorkspaceResult {
  // Gate: if workspace is not allowed, return nothing
  if (!route.workspaceAllowed) return { payload: undefined, unvettedCitations: [] };

  const warnings: string[] = [];
  const unvettedCitations: string[] = [];

  // Gate: legal basis — only when final gate allows it.
  // Raw LLM-generated citations are unvetted and must NOT appear in public workspace.legalBasis.
  // They are moved to quality.warnings / debug.unvettedCitations so the consuming app is not
  // responsible for filtering them out.
  let legalBasis: AdvisorLegalBasisItem[] | undefined;
  if (route.legalBasisAllowed && llmOutput.citationsUsed.length > 0) {
    // Pool of citations carried by the vetted guidance items actually retrieved for
    // this query. An LLM citation only enters public legalBasis when it corroborates
    // one of these (reconcileRawCitation) — it is never authoritative on its own.
    const vettedPool = retrievedGuidance.flatMap((g) => g.citations ?? []);
    const vettedItems: AdvisorLegalBasisItem[] = [];
    const seenCitations = new Set<string>();

    for (const raw of llmOutput.citationsUsed) {
      const validated = validateRawStringCitation(raw);
      if (validated.validationStatus === 'suppressed') {
        const msg = `Citation suppressed — did not meet quality threshold: "${raw}"`;
        warnings.push(msg);
        qualityWarnings.push(msg);
        continue;
      }

      const match = reconcileRawCitation(raw, vettedPool);
      if (match) {
        // Render the VETTED citation's canonical form, never the raw LLM text.
        const citationText = match.section ? `${match.statute}, ${match.section}` : match.statute;
        if (!seenCitations.has(citationText)) {
          seenCitations.add(citationText);
          vettedItems.push({
            label: cleanLabel(match.shortForm || match.statute),
            citation: citationText,
            jurisdiction: (jurisdiction.province ?? 'CA') as Province | 'FED' | 'CA',
            sourceType: /regulation/i.test(match.statute) ? 'regulation' : 'statute',
            validationStatus: 'valid',
            qualityWarning: undefined,
          });
        }
      } else {
        // Not corroborated by any retrieved vetted citation — withhold from public legalBasis.
        unvettedCitations.push(raw);
        qualityWarnings.push(`Unvetted citation withheld from public legal basis: "${raw}"`);
      }
    }

    legalBasis = vettedItems.length > 0 ? vettedItems : undefined;
  }
  // If legalBasisAllowed is false, legalBasis stays undefined — never leak citations

  // Gate: retrieved guidance — convert pre-filtered items to workspace shape.
  // Jurisdiction and topic filtering has already been applied upstream by
  // filterRetrievedGuidanceForPromptAndWorkspace() before buildAdvisorPrompt().
  // buildWorkspace() trusts that retrievedGuidance is already safe.
  let retrievedItems: AdvisorRetrievedGuidanceItem[] | undefined;
  if (route.retrievalAllowed && retrievedGuidance.length > 0) {
    retrievedItems = retrievedGuidance.map((g) => ({
      topic: cleanLabel(g.title),
      matchLabel: scoreToMatchLabel(g.score),
      jurisdiction: g.province !== 'ALL' ? String(g.province) : undefined,
      qualityWarnings: [],
    }));
  }
  // If retrievalAllowed is false, retrievedItems stays undefined — never leak retrieval results

  // Missing facts — always include jurisdiction if unknown
  const missingFacts = [...(llmOutput.missingFacts || [])];
  if (jurisdiction.status === 'unknown') {
    missingFacts.unshift('Province or federal jurisdiction is required for jurisdiction-specific guidance.');
  }

  // Curated playbook content for this topic. Populates the workspace fields the LLM
  // does not produce: confidentiality reminders, anti-reprisal reminders, and the
  // list of suggested documents.
  const playbook = getPlaybookForIntent(route.intent);

  // Gate: suggested documents — only when allowed; sourced from the topic playbook.
  let suggestedDocuments: AdvisorWorkspacePayload['suggestedDocuments'];
  if (route.suggestedDocumentsAllowed && playbook && playbook.suggestedDocuments.length > 0) {
    suggestedDocuments = playbook.suggestedDocuments.map((title) => ({ title: cleanLabel(title) }));
  }

  // Confidentiality / anti-reprisal reminders are workspace content. workspaceAllowed
  // is already true here (buildWorkspace returns early otherwise).
  const confidentialityNotes =
    playbook && playbook.confidentialityNotes.length > 0
      ? cleanAdvisorTextArray(playbook.confidentialityNotes)
      : undefined;
  const antiReprisalNotes =
    playbook && playbook.antiReprisalNotes.length > 0
      ? cleanAdvisorTextArray(playbook.antiReprisalNotes)
      : undefined;

  // Surface context conflicts in workspace warnings
  if (ctx.contextConflicts && ctx.contextConflicts.length > 0) {
    for (const conflict of ctx.contextConflicts) {
      if (!warnings.includes(conflict)) warnings.push(conflict);
    }
  }

  return {
    payload: {
      summary: cleanAdvisorText(llmOutput.summary),
      guidance: cleanAdvisorText(llmOutput.guidance),
      missingFacts: missingFacts.length > 0 ? missingFacts : undefined,
      immediateSteps: cleanAdvisorTextArray(llmOutput.immediateSteps || []),
      documentationSteps: cleanAdvisorTextArray(llmOutput.documentationSteps || []),
      confidentialityNotes,
      antiReprisalNotes,
      legalBasis: legalBasis && legalBasis.length > 0 ? legalBasis : undefined,
      retrievedGuidance: retrievedItems,
      suggestedDocuments,
      followUpQuestions: cleanAdvisorTextArray(llmOutput.followUpQuestions || []),
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    unvettedCitations,
  };
}

// ─── Deterministic fallbacks (no LLM key configured) ───────────────────────

function buildDeterministicFallback(
  ctx: AdvisorPipelineContext,
  route: AdvisorRoute,
  jurisdiction: AdvisorJurisdiction,
  retrievedGuidance?: ScoredGuidanceItem[],
): string {
  const isEn = ctx.locale !== 'fr';

  if (route.intent === 'out_of_scope') {
    return isEn
      ? 'This question falls outside the scope of Canadian HR and employment law guidance. If you have an HR or workplace question, I\'m happy to help.'
      : 'Cette question dépasse le cadre des conseils en droit du travail et des ressources humaines canadien. Si vous avez une question RH, je suis là pour vous aider.';
  }

  if (route.intent === 'personal_wellbeing') {
    return isEn
      ? 'I can offer some general well-being ideas, keeping this separate from HR compliance unless there is a workplace issue involved.\n\nSome low-risk strategies that may help: take a short walk, get outside briefly, eat something simple, drink water, reduce stimulation, write down what feels heavy, or reach out to someone you trust. If this has been persistent or affecting your ability to function, speaking with a healthcare professional is a good step.\n\nIf this is connected to work — workload, burnout, accommodation, leave, harassment, or conflict — let me know the workplace context and I can help with the HR compliance side.'
      : 'Je peux vous offrir quelques conseils généraux de bien-être, en gardant cela séparé de la conformité RH à moins qu\'il y ait un problème en milieu de travail.\n\nSi cela est lié au travail — charge de travail, épuisement, accommodement, congé, harcèlement ou conflit — donnez-moi le contexte du lieu de travail et je pourrai vous aider avec l\'aspect conformité RH.';
  }

  if (route.intent === 'personal_mental_health') {
    return isEn
      ? 'I hear that you\'re going through a difficult time. I want to make sure I understand what you need.\n\nAre you asking about this personally — for yourself — or is this about an employee or workplace situation? Knowing the context helps me give you the right kind of support.\n\nIf this is personal and you have been feeling this way for a while, speaking with a healthcare professional is worth considering. If it is connected to a workplace issue, I can help with the HR side.'
      : 'Je comprends que vous traversez une période difficile. Je voudrais m\'assurer de comprendre ce dont vous avez besoin.\n\nEst-ce que vous posez cette question pour vous-même, ou s\'agit-il d\'un employé ou d\'une situation en milieu de travail?';
  }

  if (route.intent === 'ambiguous') {
    return isEn
      ? 'I want to make sure I understand your question. Could you give me a bit more context about the situation — particularly whether this is a personal matter, a workplace issue, or something you are dealing with as an employer or HR professional?'
      : 'Je veux m\'assurer de bien comprendre votre question. Pourriez-vous me donner un peu plus de contexte sur la situation — notamment s\'il s\'agit d\'un problème personnel, d\'un problème au travail, ou de quelque chose que vous gérez en tant qu\'employeur ou professionnel RH?';
  }

  if (route.intent === 'employee_medical_or_accommodation') {
    return isEn
      ? 'An employee medical or disability-related disclosure must be handled sensitively. Treat the information as sensitive medical/disability-related information and preserve confidentiality and privacy. Limit access to need-to-know personnel. Do not ask for a diagnosis unless it is legally necessary and justified by the specific context; request only the functional information needed to assess accommodation. Ask what work restrictions or functional limitations were provided, and whether accommodation, modified duties, leave, or return-to-work planning is involved. Document factually without medical speculation. Avoid any reprisal, discrimination, or penalty because of the disclosure. Confirm the applicable jurisdiction, and escalate to HR or legal counsel if the situation is complex.'
      : 'La divulgation d\'informations médicales ou liées à un handicap par un employé doit être traitée avec sensibilité. Considérez ces informations comme une divulgation médicale liée à un handicap et préservez la confidentialité et la vie privée. Limitez l\'accès aux personnes qui ont besoin de savoir. Ne demandez pas de diagnostic à moins qu\'il ne soit légalement nécessaire et justifié par le contexte; demandez seulement les renseignements fonctionnels nécessaires pour évaluer l\'accommodement. Demandez quelles restrictions de travail ou limitations fonctionnelles ont été fournies, et si un accommodement, des tâches modifiées, un congé ou une planification de retour au travail est envisagé. Documentez factuellement sans spéculation médicale. Évitez toute représaille, discrimination ou pénalité liée à la divulgation. Confirmez la juridiction applicable et escaladez vers les RH ou un conseiller juridique si la situation est complexe.';
  }

  if (route.intent === 'harassment_or_workplace_violence') {
    // Provide both the immediate action guidance AND ask for missing facts
    const jurisdictionAsk = jurisdiction.status !== 'known'
      ? (isEn ? ' Please confirm the province or whether the employer is federally regulated.' : ' Veuillez confirmer la province ou si l\'employeur est réglementé au niveau fédéral.')
      : '';
    const missingFactsAsk = isEn
      ? ' To provide more specific guidance, it would also help to know: the nature of the complaint (harassment, violence, sexual harassment); whether a formal complaint has been made; who the parties are; what immediate safety concerns exist; and what the employer\'s current harassment policy and investigation process is.'
      : ' Pour vous donner des conseils plus précis, il serait utile de savoir: la nature de la plainte; si une plainte formelle a été déposée; les parties en cause; les préoccupations immédiates en matière de sécurité; et la politique de harcèlement et le processus d\'enquête actuels de l\'employeur.';
    return isEn
      ? `A harassment or workplace-violence complaint is a serious matter. Acknowledge the complaint promptly, assess whether anyone is in immediate safety risk, and keep the complaint confidential. Do not make premature credibility findings. Document the complaint, the parties involved, dates, and any immediate steps taken. Confirm the workplace jurisdiction and relevant harassment policy. Assign an impartial investigator or escalate to HR or legal counsel if the situation is complex. Communicate next steps to the parties and preserve all records. Anti-reprisal protections apply.${missingFactsAsk}${jurisdictionAsk}`
      : `Une plainte de harcèlement ou de violence au travail est une affaire sérieuse. Accusez réception de la plainte rapidement, évaluez si une personne est en risque immédiat, et gardez la plainte confidentielle. Ne portez pas de conclusions prématurées sur la crédibilité. Documentez la plainte, les parties, les dates et les mesures prises. Confirmez la juridiction et la politique applicable. Assignez un enquêteur impartial ou escaladez vers les RH ou un conseiller juridique. Communiquez les prochaines étapes et conservez tous les documents. Les protections contre les représailles s'appliquent.${missingFactsAsk}${jurisdictionAsk}`;
  }

  // ─── Topic-specific fallbacks for non-termination routes ──────────────────

  // Leave / absence fallback — ask for leave-relevant facts, not termination facts
  if (route.intent === 'leave_or_absence') {
    const jurisdictionAsk = jurisdiction.status !== 'known'
      ? (isEn ? ' Please confirm the province or whether the employer is federally regulated.' : ' Veuillez confirmer la province ou si l\'employeur est réglementé au niveau fédéral.')
      : '';
    return isEn
      ? `Leave entitlements vary by jurisdiction and the type of leave requested. To give you accurate guidance, it would help to know: the type of leave requested (sick, parental, bereavement, medical, personal, family responsibility); whether the employer is provincially or federally regulated; how long the employee has been employed; and whether there is a relevant collective agreement or employment policy.${jurisdictionAsk}`
      : `Les droits aux congés varient selon la juridiction et le type de congé demandé. Pour vous donner des conseils précis, il serait utile de savoir: le type de congé demandé (maladie, parental, deuil, médical, personnel, responsabilités familiales); si l'employeur est de compétence provinciale ou fédérale; depuis combien de temps l'employé est en poste; et s'il existe une convention collective ou une politique d'emploi applicable.${jurisdictionAsk}`;
  }

  // Pay / hours fallback — ask for pay-relevant facts
  if (route.intent === 'pay_hours_or_entitlements') {
    const jurisdictionAsk = jurisdiction.status !== 'known'
      ? (isEn ? ' Please confirm the province or whether the employer is federally regulated.' : ' Veuillez confirmer la province ou si l\'employeur est réglementé au niveau fédéral.')
      : '';
    return isEn
      ? `Pay and hours entitlements depend on jurisdiction, the type of employment, and any applicable collective agreement. To provide accurate guidance, it would help to know: the province or whether the employer is federally regulated; the type of pay or hours question (minimum wage, overtime, vacation pay, holiday pay, deductions); the employee's role and status (full-time, part-time, contract); and any applicable collective agreement.${jurisdictionAsk}`
      : `Les droits en matière de salaire et d'heures dépendent de la juridiction, du type d'emploi et de toute convention collective applicable. Pour vous donner des conseils précis, il serait utile de savoir: la province ou si l'employeur est réglementé au niveau fédéral; le type de question (salaire minimum, heures supplémentaires, indemnité de congés, jours fériés, retenues); le rôle et le statut de l'employé; et toute convention collective applicable.${jurisdictionAsk}`;
  }

  // Privacy / confidentiality fallback
  if (route.intent === 'privacy_or_confidentiality') {
    const jurisdictionAsk = jurisdiction.status !== 'known'
      ? (isEn ? ' Please confirm the province or whether the employer is federally regulated.' : ' Veuillez confirmer la province ou si l\'employeur est réglementé au niveau fédéral.')
      : '';
    return isEn
      ? `Privacy and confidentiality obligations in the workplace depend on the type of information involved and the applicable legislation. To provide accurate guidance, it would help to know: the nature of the information (employee health data, personal information, confidential business information); who collected it and why; whether PIPEDA, a provincial privacy law, or a sector-specific regime applies; and what action is being considered.${jurisdictionAsk}`
      : `Les obligations en matière de confidentialité au travail dépendent du type d'information et de la législation applicable. Pour vous donner des conseils précis, il serait utile de savoir: la nature de l'information; qui l'a collectée et pourquoi; si la LPRPDE, une loi provinciale sur la protection de la vie privée ou un régime sectoriel s'applique; et quelle mesure est envisagée.${jurisdictionAsk}`;
  }

  // ─── General HR fallback — jurisdiction-aware ──────────────────────────────

  // Determine whether this is a termination-related route to decide which missing facts to ask for.
  // Only ask for length of service, severance, and contract terms when the query is about termination/discipline.
  const isTerminationRoute = route.intent === 'termination_or_discipline';
  const hasTerminationKeywords = /\b(terminat|dismiss|fired|let\s+go|layoff|severance|notice\s+period|pay\s+in\s+lieu|without\s+cause|wrongful)\b/i.test(ctx.userMessage);
  const askTerminationFacts = isTerminationRoute || hasTerminationKeywords;

  // If jurisdiction is known, use it and any retrieved guidance to build a more helpful answer.
  // Do not ask for jurisdiction that the user already supplied.
  if (jurisdiction.status === 'known' && jurisdiction.province) {
    const prov = jurisdiction.province;

    // Build a concise jurisdiction note for the user
    const jurisdictionIntro = isEn
      ? prov === 'FEDERAL'
        ? 'For federally regulated employers, the Canada Labour Code applies.'
        : `For employers in ${prov}, provincial employment standards apply.`
      : prov === 'FEDERAL'
        ? 'Pour les employeurs sous réglementation fédérale, le Code canadien du travail s\'applique.'
        : `Pour les employeurs en ${prov}, les normes d'emploi provinciales s'appliquent.`;

    // Use the top retrieved guidance item if available (jurisdiction-neutral or matching province)
    const topItem = retrievedGuidance?.find(
      (g) => g.province === 'ALL' || g.province === prov,
    );

    const guidanceSummary = topItem
      ? (isEn
        ? ` Based on available guidance: ${topItem.title} — ${topItem.content.slice(0, 200)}${topItem.content.length > 200 ? '...' : ''}`
        : ` D'après les informations disponibles: ${topItem.title} — ${topItem.content.slice(0, 200)}${topItem.content.length > 200 ? '...' : ''}`)
      : '';

    const missingFactsNote = askTerminationFacts
      ? (isEn
        ? ' To give you more specific advice, it would help to know the length of service, role, any employment contract terms, and whether any offer or severance was made.'
        : ' Pour vous donner des conseils plus précis, il serait utile de connaître la durée du service, le poste, les modalités du contrat de travail et si une offre ou une indemnité a été faite.')
      : (isEn
        ? ' To give you more specific advice, it would help to know the employer type (provincial or federally regulated), the employee group or role, and what action or situation you are dealing with.'
        : ' Pour vous donner des conseils plus précis, il serait utile de connaître le type d\'employeur (provincial ou fédéral), le groupe ou le poste de l\'employé et la situation ou mesure envisagée.');

    return isEn
      ? `${jurisdictionIntro}${guidanceSummary}${missingFactsNote}`
      : `${jurisdictionIntro}${guidanceSummary}${missingFactsNote}`;
  }

  // Jurisdiction is unknown — ask for it
  const jurisdictionNote = isEn
    ? ' (Jurisdiction not specified — guidance is general and not province-specific.)'
    : ' (Juridiction non spécifiée — les conseils sont généraux et non spécifiques à une province.)';

  const unknownJurisdictionMissingFacts = askTerminationFacts
    ? (isEn
      ? ' It would also help to know the length of service, role, any employment contract terms, and whether any offer or severance was made.'
      : ' Il serait également utile de connaître la durée du service, le poste, les modalités du contrat de travail et si une offre ou une indemnité a été faite.')
    : '';

  return isEn
    ? `Thank you for your question.${jurisdictionNote} I can provide general Canadian HR guidance on this topic. To give you the most accurate advice, it would help to know the specific province or whether the employer is federally regulated. Could you share that context?${unknownJurisdictionMissingFacts}`
    : `Merci pour votre question.${jurisdictionNote} Je peux fournir des conseils généraux en matière de ressources humaines canadiennes sur ce sujet. Pour vous donner les conseils les plus précis, il serait utile de connaître la province spécifique ou si l'employeur est réglementé par le gouvernement fédéral.${unknownJurisdictionMissingFacts}`;
}

// ─── Main pipeline ──────────────────────────────────────────────────────────

/**
 * Normalize pipeline context to ensure all boolean flags have safe defaults.
 * Guards against callers that partially construct AdvisorPipelineContext.
 */
function normalizePipelineContext(ctx: AdvisorPipelineContext): AdvisorPipelineContext {
  return {
    ...ctx,
    enableRetrieval: ctx.enableRetrieval ?? true,
    enableWorkspacePayload: ctx.enableWorkspacePayload ?? true,
    enableDrafting: ctx.enableDrafting ?? true,
    // Safe default: web search must be explicitly enabled
    enableWebSearch: ctx.enableWebSearch ?? false,
    includeDebug: ctx.includeDebug ?? false,
    locale: ctx.locale ?? 'en',
    history: ctx.history ?? [],
    province: ctx.province ?? null,
    employerProvince: ctx.employerProvince ?? null,
    remoteWork: ctx.remoteWork ?? false,
    isFederallyRegulated: ctx.isFederallyRegulated ?? null,
    unionized: ctx.unionized ?? null,
  };
}

export async function composeAdvisorResponse(
  rawCtx: AdvisorPipelineContext,
): Promise<AdvisorResponse> {
  const ctx = normalizePipelineContext(rawCtx);
  const routeReasons: string[] = [];

  // 1. Deterministic safety check — crisis overrides everything
  const sensitivity = classifySensitiveInput(ctx.userMessage);
  const isCrisis = sensitivity.level === 'crisis';

  // 2. Deterministic routing (intent-level eligibility)
  const baseRoute = routeAdvisorMessage(ctx);
  routeReasons.push(`intent=${baseRoute.intent}`, `mode=${baseRoute.responseMode}`);

  // 3. Jurisdiction resolution
  const jurisdiction = resolveJurisdiction(ctx);

  // 3b. Compute final effective route gates based on intent, options, jurisdiction, and conflicts
  const route = computeEffectiveRoute(baseRoute, jurisdiction, ctx);

  // 4. Quality tracking
  const qualityWarnings: string[] = [];
  const blockedRendering: string[] = [];

  // Populate blocked rendering for all false gates
  if (!route.retrievalAllowed) blockedRendering.push('retrieval');
  if (!route.workspaceAllowed) blockedRendering.push('workspace');
  if (!route.legalBasisAllowed) blockedRendering.push('legalBasis');
  if (!route.suggestedDocumentsAllowed) blockedRendering.push('suggestedDocuments');
  if (!route.webSearchAllowed) blockedRendering.push('webSearch');

  // Web search availability warnings — emitted only when the query requires current info,
  // the route would normally allow web search, and something prevents it from running.
  // We distinguish three cases so the consuming app and operator can act appropriately.
  const needsCurrentInfo = !isCrisis && baseRoute.webSearchAllowed && requiresCurrentInfo(ctx.userMessage);
  const webCfg = getWebSearchConfig();
  if (needsCurrentInfo) {
    if (ctx.enableWebSearch && webCfg.enabled && !isWebSearchConfigured(webCfg)) {
      // Case 1: Config enabled but endpoint/key missing → incomplete config warning
      qualityWarnings.push('Web search was requested but Startpage configuration is incomplete.');
    } else if (!webCfg.enabled && ctx.enableWebSearch) {
      // Case 2: WEB_SEARCH_ENABLED=false but user explicitly asked for current info
      qualityWarnings.push('Current-source verification was requested but web search is disabled (WEB_SEARCH_ENABLED=false).');
    } else if (!ctx.enableWebSearch) {
      // Case 3: Per-request enableWebSearch=false but current info was requested
      qualityWarnings.push('Current-source verification was requested but web search was not enabled for this request (options.enableWebSearch=false).');
    }
  }

  // Propagate context conflicts into quality warnings
  if (ctx.contextConflicts && ctx.contextConflicts.length > 0) {
    qualityWarnings.push(...ctx.contextConflicts.map((c) => `Context conflict: ${c}`));
  }

  // 5. Crisis route — fully deterministic, no LLM, no workspace, no retrieval
  if (isCrisis) {
    const conversationalResponse = cleanAdvisorText(formatCrisisConversationalResponse(ctx.locale));

    const response: AdvisorResponse = {
      sessionId: ctx.sessionId,
      locale: ctx.locale,
      conversationalResponse,
      route,
      jurisdiction,
      risk: { compliance: 'low', safety: 'critical' },
      professionalReview: { recommended: true, type: 'emergency', reason: 'Immediate crisis support is required.' },
      workspace: undefined,  // Never present for crisis
      quality: {
        markdownCleaned: true,
        citationsValidated: true,
        blockedRendering,
        warnings: qualityWarnings,
      },
      isCrisis: true,
      debug: ctx.includeDebug ? { routeReasons, blockedRendering } : undefined,
    };
    return response;
  }

  // 5b. Scope-of-practice boundary — deterministic decline/redirect (pre-LLM).
  // Mirrors the crisis short-circuit: these are the mandatory refusals from
  // escalation-rules.md (drafting a separation agreement, legal opinions / outcome
  // predictions, active tribunal matters, employee-side claims) and must not depend
  // on the LLM choosing to follow a soft prompt instruction.
  const scopeBoundary = classifyScopeBoundary(ctx.userMessage, ctx.userRole);
  if (scopeBoundary) {
    routeReasons.push(`scope_boundary=${scopeBoundary.type}`);
    const declineWarning = `Declined (scope-of-practice): ${scopeBoundary.reason}`;
    if (!qualityWarnings.includes(declineWarning)) qualityWarnings.push(declineWarning);

    // Force every content gate off — this is a refusal/redirect, not guidance.
    const declineRoute: AdvisorRoute = {
      ...route,
      retrievalAllowed: false,
      workspaceAllowed: false,
      legalBasisAllowed: false,
      suggestedDocumentsAllowed: false,
      webSearchAllowed: false,
    };
    const declineBlocked = ['retrieval', 'workspace', 'legalBasis', 'suggestedDocuments', 'webSearch'];

    return {
      sessionId: ctx.sessionId,
      locale: ctx.locale,
      conversationalResponse: cleanAdvisorText(formatScopeBoundaryResponse(scopeBoundary, ctx.locale)),
      route: declineRoute,
      jurisdiction,
      risk: { compliance: 'medium', safety: 'none' },
      professionalReview: { recommended: true, type: 'legal', reason: scopeBoundary.reason },
      workspace: undefined,
      quality: {
        markdownCleaned: true,
        citationsValidated: true,
        blockedRendering: declineBlocked,
        warnings: qualityWarnings,
      },
      isCrisis: false,
      debug: ctx.includeDebug ? { routeReasons, blockedRendering: declineBlocked } : undefined,
    };
  }

  // 6. Non-LLM supportive/out-of-scope routes — no workspace, no retrieval
  if (
    route.intent === 'personal_wellbeing' ||
    route.intent === 'personal_mental_health' ||
    route.intent === 'out_of_scope' ||
    route.intent === 'ambiguous'
  ) {
    const conversationalResponse = cleanAdvisorText(buildDeterministicFallback(ctx, route, jurisdiction));
    const risk: AdvisorRisk = {
      compliance: 'low',
      safety: route.intent === 'personal_mental_health' ? 'watch' : 'none',
    };

    const response: AdvisorResponse = {
      sessionId: ctx.sessionId,
      locale: ctx.locale,
      conversationalResponse,
      route,
      jurisdiction,
      risk,
      professionalReview: { recommended: false, type: 'none' },
      workspace: undefined,  // Never present for personal/out-of-scope routes
      quality: {
        markdownCleaned: true,
        citationsValidated: true,
        blockedRendering,
        warnings: qualityWarnings,
      },
      isCrisis: false,
      debug: ctx.includeDebug ? { routeReasons, blockedRendering } : undefined,
    };
    return response;
  }

  // 7. Determine topic categories from the user message.
  // Used throughout: current-info short-circuit, retrieval suppression, workspace filtering.
  const topicCategories = getQueryTopicCategories(ctx.userMessage);
  const isBroadUpdate = isBroadCurrentUpdateQuery(ctx.userMessage); // requiresCurrentInfo AND no topic detected

  // 7a. Current-info unavailable short-circuit — applies to BOTH:
  //   - Broad current-update queries (no specific HR topic), e.g. "What changed this year?"
  //   - Topic-specific current queries (e.g. "current minimum wage"), when web search cannot run
  //
  // In both cases the engine must NOT answer the current question from unrelated internal
  // static guidance. It must return a bounded response and add a quality warning.
  //
  // Conditions:
  //   - requiresCurrentInfo(message) is true
  //   - route.webSearchAllowed is false (config, options, or intent blocks it)
  //   - the route IS an HR-eligible intent (webSearchAllowed was true on baseRoute)
  //     (personal/crisis/out-of-scope routes are already handled above)
  const isCurrentInfoQuery = requiresCurrentInfo(ctx.userMessage);
  const currentInfoUnavailable = isCurrentInfoQuery && !route.webSearchAllowed && baseRoute.webSearchAllowed;

  if (currentInfoUnavailable) {
    // Determine the reason web search is unavailable for the response text
    const wsDisabledReason: 'disabled' | 'unconfigured' | 'not_requested' =
      !webCfg.enabled ? 'disabled'
      : !ctx.enableWebSearch ? 'not_requested'
      : 'unconfigured';

    // Add a retrieval-suppressed quality warning for the short-circuit path.
    // This ensures consuming apps (and tests) can identify that retrieval was withheld.
    qualityWarnings.push(
      isBroadUpdate
        ? 'Internal retrieved guidance was withheld: broad current-update query requires current-source verification via web search.'
        : 'Internal retrieved guidance was withheld: current-info query requires current-source verification. Enable Startpage web search.',
    );

    // Use the topic-specific response for topic-specific queries; broad response for broad queries
    const currentInfoResponse = cleanAdvisorText(
      isBroadUpdate
        ? buildCurrentInfoUnavailableResponse(ctx, jurisdiction, wsDisabledReason)
        : buildTopicSpecificCurrentInfoUnavailableResponse(ctx, jurisdiction, topicCategories, wsDisabledReason),
    );

    // missingFacts for workspace: flag jurisdiction if unknown
    const missingFacts: string[] = [];
    if (jurisdiction.status === 'unknown') {
      missingFacts.push('Province or federal jurisdiction is required for jurisdiction-specific guidance.');
    }
    missingFacts.push('Enable and configure Startpage web search to allow current-source verification.');

    // Build minimal workspace (no retrievedGuidance, no legalBasis)
    const currentInfoWorkspace: AdvisorWorkspacePayload | undefined = route.workspaceAllowed
      ? {
          summary: 'Current-source verification unavailable.',
          guidance: currentInfoResponse,
          missingFacts,
          immediateSteps: [],
          documentationSteps: [],
          legalBasis: undefined,
          retrievedGuidance: undefined,
          suggestedDocuments: undefined,
          followUpQuestions: [],
          warnings: qualityWarnings.length > 0 ? [...qualityWarnings] : undefined,
        }
      : undefined;

    // For the short-circuit path: retrieval and legalBasis were suppressed entirely.
    // Override those gates in the public route so the consuming app knows they are inactive
    // for this response (not "allowed but empty" — actually blocked for this path).
    const currentInfoRoute: AdvisorRoute = {
      ...route,
      retrievalAllowed: false,
      legalBasisAllowed: false,
      suggestedDocumentsAllowed: false,
      webSearchAllowed: false,
    };
    const currentInfoBlockedRendering = [...blockedRendering];
    if (!currentInfoBlockedRendering.includes('retrieval')) currentInfoBlockedRendering.push('retrieval');
    if (!currentInfoBlockedRendering.includes('legalBasis')) currentInfoBlockedRendering.push('legalBasis');

    const currentInfoFinalResponse: AdvisorResponse = {
      sessionId: ctx.sessionId,
      locale: ctx.locale,
      conversationalResponse: currentInfoResponse,
      route: currentInfoRoute,
      jurisdiction,
      risk: { compliance: 'medium', safety: 'none' },
      professionalReview: { recommended: false, type: 'none' },
      workspace: currentInfoWorkspace,
      webSearch: undefined,
      quality: {
        markdownCleaned: true,
        citationsValidated: true,
        blockedRendering: currentInfoBlockedRendering,
        warnings: qualityWarnings,
      },
      isCrisis: false,
      debug: ctx.includeDebug
        ? {
            routeReasons,
            blockedRendering: currentInfoBlockedRendering,
            legalBasisEligibleByIntent: baseRoute.legalBasisAllowed,
            webSearch: {
              query: undefined,
              resultCount: 0,
              warnings: ['Current-info unavailable short-circuit: web search could not run.'],
            },
          }
        : undefined,
    };

    const currentInfoValidation = validateAdvisorResponse(currentInfoFinalResponse);
    if (!currentInfoValidation.valid) {
      console.warn('[composeAdvisorResponse] Current-info response validation warnings:', currentInfoValidation.errors);
    }

    return currentInfoFinalResponse;
  }

  // 7b. Retrieval — strictly gated: do NOT call retrieval if not allowed
  let retrievedGuidance: ScoredGuidanceItem[] = [];
  const matchLabels: string[] = [];

  if (route.retrievalAllowed && ctx.enableRetrieval) {
    // Use the resolved jurisdiction province (not raw ctx.province) so that the
    // scoring boost reflects the same jurisdiction the engine has committed to.
    const rawGuidance = retrieveGuidance(ctx.userMessage, undefined, {
      province: jurisdiction.province ?? ctx.province,
      isFederallyRegulated: jurisdiction.isFederallyRegulated ?? ctx.isFederallyRegulated,
      limit: 10, // retrieve more than needed so the filter can narrow down
    });

    // Apply the authoritative pre-prompt safety filter:
    //   1. Strip residual repeal-bracket text (defense-in-depth)
    //   2. Jurisdiction filter (unknown/conflicted → ALL only; known → matching)
    //   3. Topic-alignment filter (matching query/intent categories only)
    //
    // This is the single safety boundary for guidance reaching buildAdvisorPrompt().
    // buildWorkspace() receives the already-filtered items and only converts them
    // to AdvisorRetrievedGuidanceItem — it does not re-filter.
    const filterResult = filterRetrievedGuidanceForPromptAndWorkspace(rawGuidance, {
      jurisdiction: {
        status: jurisdiction.status,
        province: jurisdiction.province,
        isFederallyRegulated: jurisdiction.isFederallyRegulated,
      },
      hasConflict: (ctx.contextConflicts?.length ?? 0) > 0,
      queryCategories: topicCategories,
      routeIntent: route.intent,
    });

    retrievedGuidance = filterResult.items.slice(0, 5); // cap at 5 for prompt
    qualityWarnings.push(...filterResult.warnings);
    matchLabels.push(...retrievedGuidance.map((g) => `${g.title}: ${scoreToMatchLabel(g.score)}`));
  }
  // If retrievalAllowed is false, retrievedGuidance stays empty — enforced above

  // 7c. Web search — strictly gated (route.webSearchAllowed && ctx.enableWebSearch)
  // Runs after deterministic routing and jurisdiction gating, before LLM.
  // Never throws — returns warnings on failure.
  let webSearchMeta: WebSearchMeta = { used: false, provider: 'startpage', warnings: [] };

  if (route.webSearchAllowed) {
    webSearchMeta = await runWebSearch({
      userMessage: ctx.userMessage,
      routeIntent: route.intent,
      jurisdiction: jurisdiction.province ?? null,
      locale: ctx.locale,
      enableWebSearch: ctx.enableWebSearch,
    });
    // Propagate web search warnings to quality
    if (webSearchMeta.warnings.length > 0) {
      qualityWarnings.push(...webSearchMeta.warnings);
    }
  }

  // 8. LLM generation — inject both internal guidance and web search context
  let llmOutput: ReturnType<typeof parseAdvisorLLMOutput>;
  const messages = buildAdvisorPrompt(ctx, retrievedGuidance, route.responseMode, webSearchMeta.used ? webSearchMeta.results : undefined);

  try {
    const raw = await callLLM({ messages, responseFormat: 'json_object' });
    llmOutput = parseAdvisorLLMOutput(raw);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'LLM unavailable';
    const safeMsg = sanitizeProviderError(rawMsg);
    const isExpectedMissingKey = safeMsg.includes('QWEN_API_KEY environment variable is not set');
    // Expected deterministic fallback (no key configured) should not spam warnings.
    if (!isExpectedMissingKey) {
      console.warn('[composeAdvisorResponse] LLM call failed, using fallback:', safeMsg);
    }
    qualityWarnings.push('LLM unavailable — using fallback response');
    const fallback = buildDeterministicFallback(ctx, route, jurisdiction, retrievedGuidance);
    llmOutput = {
      conversationalResponse: fallback,
      summary: '',
      guidance: fallback,
      immediateSteps: [],
      documentationSteps: [],
      missingFacts: [],
      followUpQuestions: [],
      complianceRisk: 'medium',
      safetyRisk: 'none',
      professionalReviewType: 'none',
      citationsUsed: [],
    };
  }

  // 9. Clean text — strip all raw Markdown from conversationalResponse
  const conversationalResponse = cleanAdvisorText(llmOutput.conversationalResponse);
  const rawMarkdownFound = /\*{1,3}|^#{1,6}\s/m.test(llmOutput.conversationalResponse);
  if (rawMarkdownFound) qualityWarnings.push('Raw Markdown was detected in LLM output and cleaned.');

  // 10. Risk and professional review
  const risk: AdvisorRisk = {
    compliance: llmOutput.complianceRisk || 'medium',
    safety: llmOutput.safetyRisk || 'none',
  };

  // Override risk for high-risk routes — compliance must not be lower than high
  if (route.responseMode === 'high_risk_escalation') {
    if (risk.compliance === 'low' || risk.compliance === 'medium') risk.compliance = 'high';
  }

  const professionalReview = resolveProfessionalReview(
    llmOutput.professionalReviewType,
    llmOutput.professionalReviewReason,
    route,
    false,
  );

  // 11. Workspace payload — strictly gate-enforced
  const workspaceResult = buildWorkspace(llmOutput, route, jurisdiction, retrievedGuidance, ctx, qualityWarnings);
  const workspace = workspaceResult.payload;
  const unvettedCitations = workspaceResult.unvettedCitations;

  // 12. Debug metadata
  const matchedPlaybooks: string[] = [];
  if (route.intent === 'harassment_or_workplace_violence') matchedPlaybooks.push('harassment');
  if (route.intent === 'employee_medical_or_accommodation') matchedPlaybooks.push('employee_medical_disclosure');
  if (route.intent === 'termination_or_discipline') matchedPlaybooks.push('termination');

  // Build public webSearch metadata (gated on webSearchAllowed)
  const publicWebSearch: AdvisorWebSearchMeta | undefined = route.webSearchAllowed && webSearchMeta.used
    ? {
        used: webSearchMeta.used,
        provider: webSearchMeta.provider,
        query: webSearchMeta.query,
        results: webSearchMeta.results,
        warnings: webSearchMeta.warnings,
      }
    : undefined;

  const finalResponse: AdvisorResponse = {
    sessionId: ctx.sessionId,
    locale: ctx.locale,
    conversationalResponse,
    route,
    jurisdiction,
    risk,
    professionalReview,
    workspace: route.workspaceAllowed ? workspace : undefined,
    webSearch: publicWebSearch,
    quality: {
      markdownCleaned: true,
      citationsValidated: true, // validation step was attempted for any citations present
      blockedRendering,
      warnings: qualityWarnings,
    },
    isCrisis: false,
    debug: ctx.includeDebug
      ? {
          matchedPlaybooks,
          retrievalMatchLabels: matchLabels,
          blockedRendering,
          routeReasons,
          legalBasisEligibleByIntent: baseRoute.legalBasisAllowed,
          ...(unvettedCitations && unvettedCitations.length > 0 ? { unvettedCitations } : {}),
          // Web search debug info (even when no results) — useful to diagnose why search did/didn't run
          webSearch: {
            query: webSearchMeta.query,
            resultCount: webSearchMeta.results?.length ?? 0,
            warnings: webSearchMeta.warnings.length > 0 ? webSearchMeta.warnings : undefined,
          },
        }
      : undefined,
  };

  const validation = validateAdvisorResponse(finalResponse);
  if (!validation.valid) {
    console.warn('[composeAdvisorResponse] Response validation warnings:', validation.errors);
  }

  return finalResponse;
}
