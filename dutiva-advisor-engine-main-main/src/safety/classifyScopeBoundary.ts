/**
 * Deterministic scope-of-practice boundary detection.
 *
 * Implements the mandatory "When to Refuse and Redirect" rules from
 * advisor-training/safety/escalation-rules.md as a pre-LLM gate (mirroring the
 * crisis-classifier architecture), so these refusals do not depend on the LLM
 * choosing to follow a soft prompt instruction:
 *
 *   1. Drafting a separation / severance / termination AGREEMENT (legal release)
 *   2. Legal opinions and predictions of a court/tribunal outcome
 *   3. Matters already before a tribunal or court (active proceedings)
 *   4. Employee-side claimants asking how to bring a claim (redirect, not advise)
 *
 * The patterns are intentionally narrow: explaining what a separation agreement
 * covers, or general compliance questions, are NOT refused — only the specific
 * out-of-scope requests above.
 */
import type { Locale } from '../workspace/workspaceTypes';

export type ScopeBoundaryType =
  | 'separation_agreement_drafting'
  | 'legal_opinion_or_outcome'
  | 'active_tribunal_proceeding'
  | 'employee_self_representation';

export interface ScopeBoundary {
  type: ScopeBoundaryType;
  reason: string;
}

// Drafting a separation/severance/termination AGREEMENT or release — not a plain
// termination notice letter (which is an ordinary HR document).
const SEPARATION_AGREEMENT_PATTERNS = [
  /\b(draft|write|prepare|create|generate|put\s+together|produce)\b[^.?!]{0,40}\b((separation|severance|termination)\s+agreement|(separation|severance|release)\s+(package|contract|deed)|release\s+of\s+claims|full\s+and\s+final\s+release)\b/i,
  /\b((separation|severance|termination)\s+agreement|release\s+of\s+claims)\b[^.?!]{0,30}\b(draft|write|prepare|template|for\s+me)\b/i,
  // French
  /\b(r[eé]diger|pr[eé]parer|cr[eé]er)\b[^.?!]{0,40}\b(entente|convention|quittance)\s+(de\s+)?(d[eé]part|s[eé]paration|cessation|r[eé]ciproque)\b/i,
];

// Legal opinions / predictions of litigation outcome.
const LEGAL_OPINION_PATTERNS = [
  /\b(give|provide|write|your)\s+(me\s+)?(a\s+)?legal\s+opinion\b/i,
  /\b(will|would|could|can|do|are)\s+(i|we|the\s+employer|they)\s+(win|lose|going\s+to\s+win|likely\s+to\s+win)\b[^.?!]{0,40}\b(case|court|tribunal|lawsuit|claim|hearing|arbitration)\b/i,
  /\b(what\s+are\s+(my|our|the)\s+(chances|odds|likelihood))\b[^.?!]{0,40}\b(court|tribunal|lawsuit|case|win|winning|losing)\b/i,
  /\b(predict|guarantee|chances\s+of)\b[^.?!]{0,40}\b(court|tribunal|outcome|ruling|judg(?:e)?ment|win)\b/i,
  /\bhow\s+(will|would)\s+(a|the)\s+(court|judge|tribunal|arbitrator|adjudicator)\s+(rule|decide|find)\b/i,
];

// A matter already before a tribunal / court / board (active proceeding).
const ACTIVE_TRIBUNAL_PATTERNS = [
  /\b(filed|lodged|commenced|brought|submitted)\b[^.?!]{0,60}\b(complaint|claim|grievance|application|case|suit)\b[^.?!]{0,40}\b(tribunal|court|board|commission|arbitrat)/i,
  /\b(ongoing|active|pending|current|currently)\b[^.?!]{0,40}\b(tribunal|court|arbitration|litigation|hearing|proceeding|grievance|labour\s+board|human\s+rights)\b/i,
  /\b(case|complaint|claim|matter|grievance|application)\b[^.?!]{0,40}\b(before|at|with|in\s+front\s+of)\s+(?:the\s+)?(tribunal|court|board|labour\s+board|human\s+rights\s+(?:tribunal|commission)|arbitrator|adjudicator)\b/i,
];

// Employee-side claimant asking how to bring a claim.
const EMPLOYEE_CLAIM_PATTERNS = [
  /\bhow\s+(do|can|should)\s+i\b[^.?!]{0,40}\b(sue|file\s+a\s+(complaint|claim|grievance)|make\s+a\s+claim|take\s+(legal\s+)?action|claim\s+(against|from)|get\s+(my\s+)?(severance|money|wages)\s+(owed|back))\b/i,
  /\bcan\s+i\s+sue\s+my\s+(employer|boss|company|manager)\b/i,
  /\bmy\s+(employer|boss|company|manager)\s+(fired|dismissed|terminated|let\s+go|laid\s+off)\s+me\b[^.?!]{0,70}\b(sue|claim|complaint|owed|rights|do\s+i\s+have)\b/i,
];

function matchAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Classify a message against the deterministic scope-of-practice boundaries.
 * Returns the first boundary matched, or null when the message is in scope.
 */
export function classifyScopeBoundary(message: string, userRole?: string): ScopeBoundary | null {
  if (matchAny(SEPARATION_AGREEMENT_PATTERNS, message)) {
    return {
      type: 'separation_agreement_drafting',
      reason: 'Drafting a separation/severance agreement requires an employment lawyer.',
    };
  }

  if (matchAny(LEGAL_OPINION_PATTERNS, message)) {
    return {
      type: 'legal_opinion_or_outcome',
      reason: 'Predicting a legal or court/tribunal outcome is a legal opinion the advisor cannot provide.',
    };
  }

  if (matchAny(ACTIVE_TRIBUNAL_PATTERNS, message)) {
    return {
      type: 'active_tribunal_proceeding',
      reason: 'A matter already before a tribunal or court requires legal representation.',
    };
  }

  // Employee-side claim — only when there is explicit employee-claimant framing,
  // either via userRole or first-person "my employer …" phrasing, so employer/HR
  // questions about the claims process are not caught.
  if (
    matchAny(EMPLOYEE_CLAIM_PATTERNS, message) &&
    (userRole === 'employee' || /\bmy\s+(employer|boss|company|manager)\b/i.test(message))
  ) {
    return {
      type: 'employee_self_representation',
      reason: 'The advisor supports employers and HR professionals; employee-side claims are redirected.',
    };
  }

  return null;
}

/**
 * Build the bilingual decline/redirect conversational response for a boundary.
 * Per escalation-rules.md these decline AND redirect — they do not refuse silently.
 */
export function formatScopeBoundaryResponse(boundary: ScopeBoundary, locale: Locale): string {
  const isEn = locale !== 'fr';
  switch (boundary.type) {
    case 'separation_agreement_drafting':
      return isEn
        ? "I can't draft a separation or severance agreement. These documents contain legal releases and waivers that should be prepared by an employment lawyer, not an AI advisor. I can still explain what such agreements typically cover, which statutory minimums apply, and what to confirm before signing — just ask."
        : "Je ne peux pas rédiger une entente de départ ou de cessation d'emploi. Ces documents contiennent des renonciations juridiques qui devraient être préparées par un avocat en droit du travail, et non par un conseiller IA. Je peux toutefois vous expliquer ce que ces ententes couvrent généralement et les minimums applicables.";
    case 'legal_opinion_or_outcome':
      return isEn
        ? "I can't provide a legal opinion or predict how a court or tribunal would rule — that depends on facts only a lawyer can weigh, and it's outside what this advisor does. An employment lawyer can advise you on litigation risk. I can still walk you through the relevant compliance obligations and what to document."
        : "Je ne peux pas fournir un avis juridique ni prédire la décision d'un tribunal — cela dépend de faits que seul un avocat peut évaluer. Un avocat en droit du travail peut vous conseiller sur le risque de litige. Je peux néanmoins vous expliquer les obligations de conformité pertinentes.";
    case 'active_tribunal_proceeding':
      return isEn
        ? "Since this matter is already before a tribunal or court, you'll need legal representation — I can't advise on active proceedings. Please consult the employment lawyer handling the file. I'm glad to help with general compliance questions that aren't part of the active case."
        : "Comme cette affaire est déjà devant un tribunal, vous aurez besoin d'une représentation juridique — je ne peux pas conseiller sur des procédures en cours. Veuillez consulter l'avocat qui gère le dossier. Je peux vous aider avec des questions générales de conformité qui ne font pas partie de l'affaire active.";
    case 'employee_self_representation':
      return isEn
        ? "I'm designed to help employers and HR professionals with compliance, so I can't advise you on bringing a claim against your employer. For employee-side help, contact the Canada Labour Program (1-800-641-4049) or your provincial labour standards office, or speak with an employment lawyer — many offer a free initial consultation."
        : "Je suis conçu pour aider les employeurs et les professionnels des RH en matière de conformité. Pour une réclamation contre votre employeur, communiquez avec le Programme du travail du Canada (1-800-641-4049) ou l'office provincial des normes du travail, ou consultez un avocat en droit du travail — plusieurs offrent une première consultation gratuite.";
  }
}
