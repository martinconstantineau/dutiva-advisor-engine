/**
 * Single source of truth for HR sub-topic classification.
 *
 * Two complementary derivations of GuidanceCategory, used together by retrieval
 * filtering and the current-info path:
 *
 *   getQueryTopicCategories(message)  — derive categories from the user's text.
 *   topicCategoriesFromIntent(intent) — derive categories from the route intent,
 *                                       used as a fallback when the text has no
 *                                       explicit topic terms.
 *
 * This module consolidates logic that previously lived (and risked drifting) in
 * both composeAdvisorResponse.ts and filterRetrievedGuidance.ts. NOTE: message →
 * *intent* routing lives separately in routeAdvisorMessage.ts — that is a distinct
 * concern (it produces AdvisorIntent with priority ordering and safety checks),
 * not a GuidanceCategory derivation, and is intentionally not merged here.
 */
import { GuidanceCategory } from './guidanceTypes';

/**
 * Map a user message to the set of GuidanceCategory values directly relevant to it.
 * Used to:
 *   1. Detect whether a current-info query has a specific HR sub-topic (not broad).
 *   2. Filter public workspace.retrievedGuidance to topic-aligned items only.
 *   3. Build a topic-aware "current-info unavailable" response.
 *
 * Returns an empty array when no specific topic is detected (broad query).
 */
export function getQueryTopicCategories(message: string): GuidanceCategory[] {
  const cats: GuidanceCategory[] = [];

  // compensation / pay / minimum wage / overtime / hours
  // Uses word-start anchors only (no trailing \b) for prefix stems like "pay"
  if (/\b(minimum wage|min wage|salaire minimum|wage rate|hourly rate|overtime|heures suppl[eé]mentaires|hours of work|extra hours|pay\b|compensation|r[eé]mun[eé]ration|statutory holiday|holiday pay|public holiday|vacation pay)/i.test(message)) {
    cats.push('compensation');
  }

  // harassment / workplace violence / bullying
  if (/\b(harassment|harass\w*|bullying|bully\b|hostile work|workplace violence|violence au travail|harc[eè]lement|intimidation)/i.test(message)) {
    cats.push('harassment');
  }

  // accommodation / disability / medical condition / duty to accommodate
  // Broad set: covers explicit accommodation terms, disability, health conditions,
  // modified duties, return-to-work, functional restrictions, and French equivalents.
  if (
    /\baccommodat/i.test(message) ||
    /\bduty to accommodate\b/i.test(message) ||
    /\bdisabilit/i.test(message) ||
    /\bdisabled\b/i.test(message) ||
    /\bhandicap\b/i.test(message) ||
    /\baccommodement\b/i.test(message) ||
    /\bobligation d.accommodement/i.test(message) ||
    /\bmodified (duties|work)\b/i.test(message) ||
    /\blight duties\b/i.test(message) ||
    /\bmodified work\b/i.test(message) ||
    /\breturn.to.work\s+(restriction|plan|accommodat|modification)\b/i.test(message) ||
    /\bretour\s+au\s+travail/i.test(message) ||
    /\btâches\s+(modifi[eé]es?|l[eé]g[eè]res?)\b/i.test(message) ||
    /\btravail\s+modifi[eé]\b/i.test(message) ||
    /\bundue hardship\b/i.test(message) ||
    /\bcontrainte\s+excessive\b/i.test(message) ||
    /\bmedical condition\b/i.test(message) ||
    /\bhealth condition\b/i.test(message) ||
    /\b[eé]tat\s+de\s+sant[eé]\b/i.test(message) ||
    /\bfit\s+to\s+work\b/i.test(message) ||
    /\bfitness\s+to\s+work\b/i.test(message) ||
    /\baptitude\s+au\s+travail\b/i.test(message) ||
    /\bbillet\s+de\s+retour\s+au\s+travail\b/i.test(message)
  ) {
    cats.push('accommodation');
  }

  // medical disclosure / functional abilities / functional limitations / medical restrictions
  // Also covers doctor's note, medical certificate, return-to-work notes — all require
  // the functional-information framework, not a diagnosis.
  if (
    /\b(medical disclosure|functional abilities|functional limitation|diagnosis|doctor.?s? note|divulgation m[eé]dical)/i.test(message) ||
    /\bmedical restriction/i.test(message) ||
    /\bwork restriction/i.test(message) ||
    /\bworkplace restriction/i.test(message) ||
    /\bfunctional restriction/i.test(message) ||
    /\bfunctional information\b/i.test(message) ||
    /\bmedical note\b/i.test(message) ||
    /\bmedical certificate\b/i.test(message) ||
    /\bmedical documentation\b/i.test(message) ||
    /\bmedical information\b/i.test(message) ||
    /\bdiagnosis\s+(information|details)\b/i.test(message) ||
    /\bdiagnostic\b/i.test(message) ||
    /\bbillet\s+m[eé]dical\b/i.test(message) ||
    /\bcertificat\s+m[eé]dical\b/i.test(message) ||
    /\bnote\s+m[eé]dicale\b/i.test(message) ||
    /\bdocumentation\s+m[eé]dicale\b/i.test(message) ||
    /\brenseignements?\s+m[eé]dicaux\b/i.test(message) ||
    /\binformation\s+m[eé]dicale\b/i.test(message) ||
    /\blimitations?\s+fonctionnelle?s?\b/i.test(message) ||
    /\bcapacit[eé]s?\s+fonctionnelle?s?\b/i.test(message) ||
    /\brestrictions?\s+m[eé]dicale?s?\b/i.test(message) ||
    /\bdivulgation\s+m[eé]dicale?\b/i.test(message)
  ) {
    cats.push('medical_disclosure');
    // Medical restrictions and return-to-work docs also imply accommodation context
    if (!cats.includes('accommodation')) {
      cats.push('accommodation');
    }
  }

  // leave / absence — only when leave/time-off/absence words are present
  if (/\b(leave\b|absence\b|cong[eé]\b|maternity|paternity|parental leave|sick leave|medical leave|bereavement|family responsibility|personal leave|cong[eé] de maternit[eé]|cong[eé] parental|time.?off\b|time\s+off|d[eé]lay de carence)/i.test(message)) {
    cats.push('leave');
  }

  // termination / discipline / dismissal / notice / severance
  if (/\b(terminat\w*|dismiss\w*|fired\b|let go|layoff|laid.?off|wrongful dismissal|just cause|notice period|severance|pay in lieu|licenciement|cong[eé]diement|pr[eé]avis\b|ind[eé]mnit[eé] de d[eé]part|mise [aà] pied)/i.test(message)) {
    cats.push('termination');
  }

  // reprisal / retaliation / whistleblower — only when explicitly mentioned
  if (/\b(reprisal|retaliation|retaliated|whistleblower|anti.?reprisal|repr[eé]sailles|r[eé]taliation|d[eé]nonciateur)/i.test(message)) {
    cats.push('reprisal');
  }

  // workplace safety / right to refuse / OHSA — only when explicitly mentioned
  if (/\b(workplace safety|right to refuse|unsafe work|safety concern|hazard|dangerous|OHSA\b|LSST\b|occupational health|s[eé]curit[eé] au travail|refus de travail|travail dangereux|machine operation|operating equipment)/i.test(message)) {
    cats.push('workplace_safety');
  }

  return cats;
}

/**
 * Derive GuidanceCategory values implied by a specific route intent.
 *
 * Used as a fallback topic signal when the user message has no explicit topic
 * terms — getQueryTopicCategories() (above) is tried first; this intent-based
 * derivation supplies categories when the text alone is ambiguous.
 */
export function topicCategoriesFromIntent(intent: string): GuidanceCategory[] {
  switch (intent) {
    case 'employee_medical_or_accommodation':
      return ['accommodation', 'medical_disclosure'];
    case 'harassment_or_workplace_violence':
      return ['harassment'];
    case 'termination_or_discipline':
      return ['termination'];
    case 'leave_or_absence':
      return ['leave'];
    case 'pay_hours_or_entitlements':
      return ['compensation'];
    default:
      return [];
  }
}
