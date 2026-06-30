/**
 * Web search query builder with PII redaction.
 *
 * IMPORTANT: User messages may contain sensitive personal and employer details.
 * Before building a Startpage query these must be redacted:
 * - Employee names
 * - Employer names (unless user explicitly asks about public info on a named employer)
 * - Emails, phone numbers, SIN-like numbers, addresses
 * - Internal case numbers, medical details, personal identifiers
 *
 * The query is converted to a general legal/source query.
 *
 * Example:
 *   Input:  "Jane Smith at Acme Manufacturing in Ottawa disclosed depression and asked for leave."
 *   Output: "Ontario employee mental health accommodation leave guidance official"
 */

import type { Locale } from '../workspace/workspaceTypes';

// ─── PII redaction patterns ──────────────────────────────────────────────────

/** Email addresses */
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.]+\.[a-zA-Z]{2,}\b/g; // eslint-disable-line no-useless-escape

/** Phone numbers (North American and international) */
const PHONE_PATTERN = /\b(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

/** SIN-like 9-digit numbers (NNN-NNN-NNN or NNN NNN NNN) */
const SIN_PATTERN = /\b\d{3}[\s-]\d{3}[\s-]\d{3}\b/g;

/** Postal codes (Canadian: A1A 1A1) */
const POSTAL_CODE_PATTERN = /\b[A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d\b/g;

/** Street addresses (basic heuristic: number + street type words) */
const STREET_ADDRESS_PATTERN = /\b\d{1,6}\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Way|Lane|Ln|Court|Ct|Place|Pl|Crescent|Cres)\b/gi;

/** Case/file reference numbers (alpha-numeric with dashes) */
const CASE_NUMBER_PATTERN = /\b[A-Z]{1,4}[-\s]?\d{4,8}[-\s]?[A-Z0-9]{0,6}\b/g;

/** Common proper name patterns (Title + Name: Mr. John Smith, Mme. Marie Tremblay, Me. Côté) */
const TITLED_NAME_PATTERN = /\b(?:Mr|Mrs|Ms|Dr|Prof|Mme|Mlle|M\.|Me|Maitre|Maître)\.?\s+[A-Z\u00C0-\u017E][a-z\u00C0-\u017E]+(?:\s+[A-Z\u00C0-\u017E][a-z\u00C0-\u017E]+){1,3}\b/g;

/**
 * Person name heuristic: two or three capitalized words not at sentence start.
 * Excludes common question words, day/month names, provinces, country names, and
 * legal/HR terms that are legitimately capitalized.
 */
const PERSON_NAME_HEURISTIC = /(?<!\.\s{0,2})\b(?!Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Ontario|Quebec|British|Alberta|Manitoba|Saskatchewan|Nova|New|Prince|Northwest|Nunavut|Yukon|Federal|Federally|Canada|Canadian|What|Which|When|When|Where|Who|Why|How|The|An|Act|Code|Labour|Labor|Human|Rights|Employment|Standards|Canada|Québec|Under|From|With|Without|During|After|Before|This|That|These|Those|Their|Your|Our|His|Her|Its|Any|All|Some|No)([A-Z][a-z]{1,20})\s+([A-Z][a-z]{1,20})(?:\s+([A-Z][a-z]{1,20}))?\b/g;

/** Company name heuristic (ends with Inc, Ltd, Corp, Co., LP, LLP, LLC) */
const COMPANY_NAME_PATTERN = /\b[A-Z][A-Za-z0-9\s&,.']+(?:Inc\.?|Ltd\.?|Corp\.?|Corporation|Company|Co\.?|LP|LLP|LLC|Limited|Manufacturing|Industries|Services|Group|Holdings|Solutions|Technologies)\b/g;

/** Medical diagnosis keywords — do not send to Startpage verbatim (EN + FR accented variants) */
const MEDICAL_TERMS_PATTERN = /\b(?:depression|d[eé]pression|anxiety|anxi[eé]t[eé]|bipolar|PTSD|schizophrenia|schizophr[eé]nie|addiction|substance use|cancer|diabetes|diab[eè]te|HIV|AIDS|mental illness|maladie mentale|panic disorder|OCD|ADHD|autism|autisme|disability|invalidit[eé]|handicap)\b/gi;

export function redactPii(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[EMAIL]')
    .replace(PHONE_PATTERN, '[PHONE]')
    .replace(SIN_PATTERN, '[ID]')
    .replace(POSTAL_CODE_PATTERN, '[POSTAL]')
    .replace(STREET_ADDRESS_PATTERN, '[ADDRESS]')
    .replace(CASE_NUMBER_PATTERN, '[CASE_REF]')
    .replace(TITLED_NAME_PATTERN, '[PERSON]')
    .replace(COMPANY_NAME_PATTERN, '[EMPLOYER]')
    .replace(PERSON_NAME_HEURISTIC, '[PERSON]')
    .replace(MEDICAL_TERMS_PATTERN, '[MEDICAL_CONDITION]');
}

// ─── Pre-extraction: topic signals from original text ────────────────────────

/**
 * Extract safe legal topic signals from the ORIGINAL (pre-redaction) user message.
 *
 * Problem: redactPii() converts "depression" → "[MEDICAL_CONDITION]" before
 * distilToLegalQuery() can map it to "mental health accommodation". The
 * placeholder is then stripped, losing the topic signal entirely.
 *
 * Solution: scan the original text first and collect safe canonical topic tokens.
 * These tokens are appended to the redacted text so distilToLegalQuery sees them.
 * The tokens themselves contain no PII — they are generic legal keywords.
 */
interface TopicSignal {
  /** EN canonical topic tokens */
  en: string;
  /** FR canonical topic tokens */
  fr: string;
}

const PRE_EXTRACTION_RULES: Array<{ pattern: RegExp; signal: TopicSignal }> = [
  // Medical/mental-health diagnoses → generalized accommodation signal
  {
    pattern: /\b(depression|anxiety|bipolar|PTSD|schizophrenia|addiction|substance use|cancer|diabetes|HIV|AIDS|mental illness|panic disorder|OCD|ADHD|autism)\b/gi,
    signal: { en: 'mental health accommodation', fr: 'accommodement santé mentale' },
  },
  // Generic "disability" when not already covered above
  {
    pattern: /\b(disability|disabled|handicap)\b/gi,
    signal: { en: 'disability accommodation', fr: 'accommodement invalidité' },
  },
  // Leave requests — "asked for leave", "needs time off", "requesting leave", etc.
  {
    pattern: /\b(asked? for (a )?leave|request(ed|ing)? (a )?leave|needs? (time off|medical leave|sick leave)|medical leave|sick leave|illness leave|health leave|leave of absence)\b/gi,
    signal: { en: 'leave', fr: 'congé' },
  },
  // Accommodation — separate signal for explicit accommodation language
  {
    pattern: /\b(accommodat(e|ion|ing)|duty to accommodate)\b/gi,
    signal: { en: 'accommodation', fr: 'accommodement' },
  },
  // French medical/mental health keywords
  {
    pattern: /\b(dépression|anxiété|santé mentale|maladie mentale|invalidité|handicap)\b/gi,
    signal: { en: 'mental health accommodation', fr: 'accommodement santé mentale' },
  },
  // French leave keywords
  {
    pattern: /\b(demande(r)? (un )?congé|a demandé (un )?congé|congé (médical|maladie|pour invalidité))\b/gi,
    signal: { en: 'leave', fr: 'congé' },
  },
];

/**
 * Scan the original text and return deduplicated safe topic tokens.
 * Never returns PII, diagnoses, names, or raw user content.
 */
function extractTopicSignals(originalText: string, locale: Locale): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const { pattern, signal } of PRE_EXTRACTION_RULES) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    if (pattern.test(originalText)) {
      const token = locale === 'fr' ? signal.fr : signal.en;
      if (!seen.has(token)) {
        seen.add(token);
        tokens.push(token);
      }
    }
    pattern.lastIndex = 0;
  }
  return tokens;
}

// ─── Jurisdiction-to-site-hint mapping ──────────────────────────────────────

const JURISDICTION_SITE_HINTS: Record<string, string[]> = {
  ON: ['site:ontario.ca', 'site:ohrc.on.ca'],
  QC: ['site:legisquebec.gouv.qc.ca', 'site:cnesst.gouv.qc.ca'],
  FEDERAL: ['site:canada.ca', 'site:laws-lois.justice.gc.ca'],
  ALL: ['site:canada.ca', 'site:ontario.ca', 'site:canlii.org'],
};

// ─── Current-info query detection ───────────────────────────────────────────

/**
 * Patterns that indicate the user wants current/recent external information
 * rather than stable vetted guidance. Includes EN and FR variants.
 */
const CURRENT_INFO_PATTERNS = [
  // English
  /\b(latest|recent|current|new|updated?|changed?|this year|2024|2025|2026)\b/i,
  /\b(what('?s| is) (new|changed?|recent|current)\b)/i,
  /\b(find|check|look up|search for)\s+(current|latest|recent|official|government)/i,
  /\b(minimum wage|statutory holiday|public holiday|holiday pay)\b/i,
  /\b(esdc|cnesst|hrto|ohrc)\s+(guidance|decision|ruling|update)/i,
  /\b(canada labour code|clc)\s+(update|change|amendment|current|leave|rules?)/i,
  /\b(canlii|case law|precedent|recent decision)\b/i,
  // French — récent(e)(s), actuel(le)(s), nouveau/nouvelle, modif, changement, cette année
  /\b(r[eé]cent(?:e|es|s)?|actuel(?:le|les)?|nouveau|nouvelle|nouveaux)\b/i,
  /\b(modif(?:ication|ications|ié|iée)|changement(?:s)?|mise\s+[aà]\s+jour)\b/i,
  /\b(cette\s+ann[eé]e|derni[eè]re\s+ann[eé]e|ann[eé]e\s+en\s+cours)\b/i,
  /\b(trouver|v[eé]rifier|chercher)\s+(les?\s+)?(r[eé]gles?|directives?|guidance|r[eé]glement)\s+(actuell?e?s?|r[eé]cent)/i,
  /\b(salaire\s+minimum|cong[eé]\s+f[eé]ri[eé]|jour\s+f[eé]ri[eé]|indemnit[eé]\s+de\s+conge\s+ann)/i,
  /\b(code\s+canadien\s+du\s+travail|cct)\s+(mise\s+[aà]\s+jour|modification|actuel|conge|r[eè]gles?)/i,
];

export function requiresCurrentInfo(message: string): boolean {
  return CURRENT_INFO_PATTERNS.some((p) => p.test(message));
}

// ─── Query distillation ──────────────────────────────────────────────────────

/**
 * PII placeholder removal — strip redaction tags left by redactPii.
 *
 * After redactPii runs, the text may contain tokens like [EMPLOYER], [PERSON],
 * [PHONE], [EMAIL], [ID], [POSTAL], [ADDRESS], [CASE_REF], [MEDICAL_CONDITION].
 * These must NOT appear in the search query sent to Startpage.
 */
function stripPiiPlaceholders(text: string): string {
  return text
    // Remove all redaction placeholder tokens
    .replace(/\[(EMPLOYER|PERSON|PHONE|EMAIL|ID|POSTAL|ADDRESS|CASE_REF|MEDICAL_CONDITION)\]/g, ' ')
    // Strip leftover narrative fragments: common disclosure phrases (EN + FR)
    .replace(/\b(disclosed?|told me|admitted|mentioned|revealed|complained about|said that|claims? that)\b/gi, ' ')
    .replace(/\b(asked?\s+for|asked?\s+about|requesting|requested|reported|told|said)\b/gi, ' ')
    // French narrative verb fragments — "a demandé", "demandé un/une", "a dit", "a signalé", etc.
    .replace(/\b(a\s+demand[eé]|demand[eé](?:\s+un[e]?)?|a\s+dit|a\s+signal[eé]|a\s+inform[eé]|a\s+mentionn[eé]|a\s+divulgu[eé]|a\s+r[eé]v[eé]l[eé]|a\s+d[eé]clar[eé])\b/gi, ' ')
    // Strip locating prepositions that only add city/employer noise
    .replace(/\b(at|in|from|near|located in|based in|working in|employed at|employed by)\s+[A-Z][a-zA-Z\s,]{0,30}/g, ' ')
    // Strip possessive narrative filler
    .replace(/\b(his|her|their|my|your|our|its)\s+(condition|situation|case|matter|issue|problem)\b/gi, ' ')
    // Strip common workplace narrative subject-verb fragments left after PII removal
    .replace(/\b(an?\s+)?(employee|worker|employer|staff\s+member|manager)\s+(wants?|needs?|asks?|requires?|must|should|has|have|had|is|are|was|were)\b/gi, ' ')
    .replace(/\b(the\s+)?(employer|employee|worker)\s+(must|should|wants?|needs?|has|have)\b/gi, ' ')
    // Strip short connective prepositions left as noise
    .replace(/\b(and|for|their|the|an|a)\b\s*$/gi, ' ')
    // Collapse multiple spaces/punctuation
    .replace(/[,;:.]+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Legal topic keyword extraction — maps common HR phrases to canonical search terms */
const LEGAL_TOPIC_MAP: Array<{ pattern: RegExp; replacement: string; replacementFr: string }> = [
  { pattern: /\b(depression|anxiety|bipolar|PTSD|mental illness|panic disorder|OCD|ADHD|autism|mental health|psychological)\b/gi, replacement: 'mental health accommodation', replacementFr: 'accommodement santé mentale' },
  { pattern: /\b(disability|disabilities|disabled|handicap)\b/gi, replacement: 'disability accommodation', replacementFr: 'accommodement invalidité' },
  { pattern: /\b(medical leave|sick leave|illness leave|health leave)\b/gi, replacement: 'medical leave accommodation', replacementFr: "congé médical accommodement" },
  { pattern: /\b(harassment|harassing|harassed|bully|bullying|bullied)\b/gi, replacement: 'workplace harassment', replacementFr: 'harcèlement travail' },
  { pattern: /\b(sexual harassment|sexual violence)\b/gi, replacement: 'sexual harassment workplace', replacementFr: 'harcèlement sexuel travail' },
  { pattern: /\b(termination|terminated|fired|dismissal|dismissed|wrongful dismissal)\b/gi, replacement: 'termination employment standards', replacementFr: "fin d'emploi normes" },
  { pattern: /\b(notice period|working notice|termination notice|pay in lieu)\b/gi, replacement: 'termination notice period', replacementFr: 'préavis emploi' },
  { pattern: /\b(parental leave|maternity leave|paternity leave|baby leave)\b/gi, replacement: 'parental leave employment standards', replacementFr: 'congé parental normes emploi' },
  { pattern: /\b(minimum wage|min wage)\b/gi, replacement: 'minimum wage employment standards', replacementFr: 'salaire minimum normes emploi' },
  { pattern: /\b(overtime|over time|extra hours|additional hours)\b/gi, replacement: 'overtime employment standards', replacementFr: 'heures supplémentaires normes emploi' },
  { pattern: /\b(privacy|confidential|personal information|personal data)\b/gi, replacement: 'privacy employment human rights', replacementFr: 'vie privée emploi droits' },
  { pattern: /\b(accommodation|accommodating|accommodate)\b/gi, replacement: 'duty to accommodate', replacementFr: "obligation d'accommodement" },
  // "asked for leave", "requesting leave", "needs time off", etc.
  { pattern: /\b(asked? for (a )?leave|request(ed|ing)? (a )?leave|needs? (time off|a leave)|leave of absence|leave request)\b/gi, replacement: 'leave employment standards', replacementFr: 'congé normes emploi' },
];

/**
 * Distil a PII-redacted, placeholder-stripped message into a minimal legal/source query.
 *
 * Takes the text after `redactPii` + `stripPiiPlaceholders` and:
 * 1. Applies legal topic mapping (converts e.g. "depression" → "mental health accommodation")
 * 2. Strips conversational filler words
 * 3. Strips remaining narrative noise
 * 4. Adds a generic official-source term if none is present
 */
function distilToLegalQuery(text: string, locale: Locale): string {
  let q = text;

  // Protect canonical phrases that already exist in text before applying LEGAL_TOPIC_MAP.
  // This prevents "duty to accommodate" from having "accommodate" replaced again → "duty to duty to accommodate".
  // Strategy: temporarily replace canonical phrases with safe printable placeholders,
  // run all LEGAL_TOPIC_MAP replacements, then restore the originals.
  // Placeholders use a double-pipe token that cannot appear in natural text.
  const CANONICAL_PROTECT: Array<[RegExp, string, string]> = [
    [/\bduty to accommodate\b/gi, '||DTA||', 'duty to accommodate'],
    [/\bobligation\s+d['']accommodement\b/gi, '||ODA||', "obligation d'accommodement"],
    [/\bmental health accommodation\b/gi, '||MHA||', 'mental health accommodation'],
    [/\bdisability accommodation\b/gi, '||DISA||', 'disability accommodation'],
    [/\baccommodement\s+santé\s+mentale\b/gi, '||ASMA||', 'accommodement santé mentale'],
  ];

  for (const [phraseRe, placeholder] of CANONICAL_PROTECT) {
    q = q.replace(phraseRe, placeholder);
    phraseRe.lastIndex = 0;
  }

  // Apply legal topic map (locale-aware replacement)
  for (const { pattern, replacement, replacementFr } of LEGAL_TOPIC_MAP) {
    q = q.replace(pattern, locale === 'fr' ? replacementFr : replacement);
  }

  // Restore protected phrases
  for (const [, placeholder, original] of CANONICAL_PROTECT) {
    q = q.replace(new RegExp(placeholder.replace(/[|]/g, '\\|'), 'g'), original);
  }

  // Strip conversational filler (EN + FR)
  q = q
    .replace(/\b(please|can you|could you|i need to know|i want to know|tell me|find out|help me|i would like|i am wondering|just asking)\b/gi, ' ')
    .replace(/\b(what (is|are|should|would|were)|how (do|can|should|does) (i|we|an employer|an employee|a manager))\b/gi, ' ')
    .replace(/\b(applies?|apply|applicable|affect|regarding|related to|about|concerning|on the topic of)\b/gi, ' ')
    // Strip city/location noise not needed for query
    .replace(/\b(ottawa|toronto|montreal|calgary|vancouver|winnipeg|halifax|edmonton|victoria)\b/gi, ' ')
    // Strip raw English question words and determiners left over
    // Important: strip "to" only when NOT part of "duty to accommodate"
    .replace(/\b(what|which|when|where|who|why|how)\b/gi, ' ')
    .replace(/\b(the|an|a|and|or|for|of|in|at|by|with|from|their|its|is|are|was|were|has|have|had|this|that|these|those)\b/gi, ' ')
    // Strip temporal/meta noise that is never useful in Startpage queries:
    // "changed"/"changes" — describes intent, not the legal topic
    // "year"/"years" — temporal filler (e.g. "this year", "per year" are already stripped)
    // "updated"/"update" — filler describing intent
    .replace(/\b(changed?|changes?|year|years|updated?|updates?)\b/gi, ' ')
    // Strip French question/narrative words and connectors
    .replace(/\b(quelles?|quels?|qu['\u2019]est[- ]ce\s+que|qu['\u2019]est[- ]ce\s+qui|combien|pourquoi|comment|selon|afin\s+de|pour|avec|sans|dans|sur|sous)\b/gi, ' ')
    .replace(/\b(sont|est|les|des|du|un|une|au|aux|et|ou|de|la|le|mon|ma|mes|votre|notre|ses|leur|leurs)\b/gi, ' ')
    .replace(/\b(actuelle?s?|r[eé]cent(?:e|es|s)?|nouvelles?|derni[eè]re?s?)\b/gi, ' ') // French adjectives (handled by requiresCurrentInfo, noise in query)
    .replace(/\b(r[eè]gles?|r[eè]glement|directives?|règles?|r[eé]gles?)\b/gi, ' ') // strip raw French "rules" (will be re-added via source anchor)
    .replace(/\?+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Add official-source anchor if query is thin
  const hasSourceTerm = /official|guidance|standards?|employment|rights|code|law|act|règlement|norme|emploi/i.test(q);
  if (!hasSourceTerm) {
    q = q + (locale === 'fr' ? ' emploi normes officiel' : ' employment standards official guidance');
  }

  return q.trim();
}

// ─── Final query cleanup ─────────────────────────────────────────────────────

/**
 * Post-processing cleanup of the assembled Startpage query.
 *
 * Problems this fixes:
 * - Repeated multi-word phrases: "duty to accommodate duty to accommodate"
 * - Duplicate single-word terms: "Ontario Ontario" or "guidance guidance"
 * - Stray punctuation: isolated "?" or orphaned commas/semicolons
 * - Redundant jurisdiction adjectives: "current Ontario guidance" compresses to
 *   just the jurisdiction + legal terms (the adjective "current" is noise for Startpage)
 * - Double spaces
 *
 * Rules:
 * 1. Remove stray punctuation characters that are not part of a site: hint.
 * 2. Deduplicate consecutive identical tokens (case-insensitive).
 * 3. Deduplicate repeated multi-word phrases (greedy longest-first).
 * 4. Collapse whitespace.
 */
function cleanFinalQuery(query: string): string {
  let q = query;

  // 1. Remove ALL "?" characters from the query — they are never useful in Startpage queries
  //    and can appear as sentence-ending punctuation that survived distillation.
  //    Also remove other stray punctuation not part of site: notation.
  q = q.replace(/\?+/g, ' ');  // all question marks
  q = q.replace(/(?<![a-z0-9_])[!,;.]+(?![a-z0-9_])/gi, ' '); // stray punctuation not inside a word

  // 2. Remove "current" as a standalone adjective when it appears before
  //    jurisdiction terms — it's filler that adds noise to Startpage queries.
  //    "current Ontario" → "Ontario", "current guidance" → "guidance"
  q = q.replace(/\bcurrent\s+/gi, '');

  // 3. Deduplicate multi-word canonical topic phrases (longest first to avoid partial matches)
  const multiWordPhrases = [
    'mental health accommodation',
    'accommodement santé mentale',
    'disability accommodation',
    'accommodement invalidité',
    'duty to accommodate',
    "obligation d'accommodement",
    'medical leave accommodation',
    'congé médical accommodement',
    'workplace harassment',
    'harcèlement travail',
    'sexual harassment workplace',
    'harcèlement sexuel travail',
    'termination employment standards',
    "fin d'emploi normes",
    'termination notice period',
    'préavis emploi',
    'parental leave employment standards',
    'congé parental normes emploi',
    'minimum wage employment standards',
    'salaire minimum normes emploi',
    'overtime employment standards',
    'heures supplémentaires normes emploi',
    'privacy employment human rights',
    'vie privée emploi droits',
    'leave employment standards',
    'congé normes emploi',
    'employment standards official guidance',
    'emploi normes officiel',
    'official guidance',
  ];

  for (const phrase of multiWordPhrases) {
    // Escape for regex
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace 2+ consecutive occurrences of the phrase (with any whitespace between)
    const reConsecutive = new RegExp(`(${escaped})(\\s+(${escaped}))+`, 'gi');
    q = q.replace(reConsecutive, phrase);
    // Also collapse non-consecutive duplicates: keep first occurrence, remove later ones
    const reAll = new RegExp(`\\b${escaped}\\b`, 'gi');
    let phraseCount = 0;
    q = q.replace(reAll, (match) => {
      phraseCount++;
      return phraseCount > 1 ? '' : match;
    });
  }

  // 4a. Deduplicate consecutive identical single tokens (case-insensitive)
  //     "Ontario Ontario" → "Ontario", "guidance guidance" → "guidance"
  //     Run twice to catch AAA → AA → A chains
  q = q.replace(/\b(\w[\w'-]*)\s+\1\b/gi, '$1');
  q = q.replace(/\b(\w[\w'-]*)\s+\1\b/gi, '$1');

  // 4b. Deduplicate non-consecutive jurisdiction tokens (ON: "Ontario", QC: "Québec"/"Quebec")
  //     These appear when both the jurisdiction keyword and the distilled text contain the name.
  //     We keep only the first occurrence found OUTSIDE a site: prefix (e.g. site:ontario.ca).
  //     The site: prefix is never counted as an occurrence of the jurisdiction keyword.
  const jurisdictionTokens = ['ontario', 'québec', 'quebec', 'canada', 'federal'];
  for (const jt of jurisdictionTokens) {
    const jtEscaped = jt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Only match standalone words NOT preceded by "site:" or a dot (i.e. not inside a domain)
    const reJt = new RegExp(`(?<!site:)(?<!\\.)(\\s|^)${jtEscaped}(?=\\b)`, 'gi');
    let count = 0;
    q = q.replace(reJt, (match, _spaceBefore) => {
      count++;
      return count > 1 ? '' : match;
    });
  }

  // 5. Strip any remaining PII placeholder patterns that might have leaked through
  q = q.replace(/\[(EMPLOYER|PERSON|PHONE|EMAIL|ID|POSTAL|ADDRESS|CASE_REF|MEDICAL_CONDITION)\]/g, '');

  // 5b. Strip stray single letters not part of a domain/site hint (e.g. "r" left from "year" → "r")
  //     These are never useful in Startpage queries. Exempt single-digit numbers and colons.
  q = q.replace(/(^|\s)([a-zA-Z])(?=\s|$)/g, '$1');

  // 6. Collapse whitespace
  q = q.replace(/\s{2,}/g, ' ').trim();

  return q;
}

/**
 * Extract a search-safe legal query from user message.
 *
 * Pipeline:
 * 0. Pre-extract topic signals from original text (before PII redaction erases them)
 * 1. Redact PII (names, emails, phones, SINs, addresses, medical terms)
 * 2. Strip PII placeholder tokens ([EMPLOYER], [PERSON], etc.) — these must not reach Startpage
 * 3. Distil to a minimal legal/HR topic query (topic mapping + filler removal)
 *    Inject pre-extracted topic signals so medical terms survive the redaction step.
 * 4. Apply jurisdiction site hints
 * 5. Clean final query (dedup, strip stray punctuation)
 * 6. Trim to maxQueryLength
 *
 * Why step 0 is needed:
 *   redactPii() converts "depression" → "[MEDICAL_CONDITION]" before distilToLegalQuery()
 *   can map it to "mental health accommodation". Step 0 captures safe topic tokens first.
 *
 * Example:
 *   Input:  "Jane Smith at Acme Manufacturing in Ottawa disclosed depression and asked for leave"
 *   Step 0 signals: ["mental health accommodation", "leave"]
 *   After step 1: "[PERSON] at [EMPLOYER] disclosed [MEDICAL_CONDITION] and asked for leave"
 *   After step 2: "and asked for leave mental health accommodation leave"
 *   After step 3: "leave employment standards mental health accommodation"
 *   After step 4: "site:ontario.ca Ontario leave employment standards mental health accommodation official guidance"
 *   After step 5: clean, no duplicates, no stray punctuation
 */
export function buildWebSearchQuery(
  userMessage: string,
  jurisdiction: string | null | undefined,
  locale: Locale,
  maxQueryLength = 200,
): string {
  // Step 0: Pre-extract safe topic signals from original text before PII redaction erases them
  const topicSignals = extractTopicSignals(userMessage, locale);

  // Step 1: Redact PII
  const redacted = redactPii(userMessage);

  // Step 2: Strip PII placeholder tokens — [EMPLOYER], [PERSON], etc. must not appear in query
  const placeholderStripped = stripPiiPlaceholders(redacted);

  // Inject pre-extracted topic signals into the placeholder-stripped text.
  // This ensures that medical terms (e.g. "depression" → "mental health accommodation")
  // are present for distilToLegalQuery even though redactPii already replaced them.
  const withTopicSignals = topicSignals.length > 0
    ? `${placeholderStripped} ${topicSignals.join(' ')}`
    : placeholderStripped;

  // Step 3: Distil to minimal legal/HR topic query
  const distilled = distilToLegalQuery(withTopicSignals, locale);

  // Step 4: Add jurisdiction site hints and jurisdiction keyword
  const siteHints = jurisdiction ? (JURISDICTION_SITE_HINTS[jurisdiction] ?? []) : [];
  const sitePrefix = siteHints.length > 0 ? siteHints[0] : '';

  const jurisdictionKeyword: string = (() => {
    if (!jurisdiction) return '';
    if (jurisdiction === 'FEDERAL') return 'Canada federal';
    if (jurisdiction === 'ON') return 'Ontario';
    if (jurisdiction === 'QC') return locale === 'fr' ? 'Québec' : 'Quebec';
    return '';
  })();

  // Compose query
  const parts = [sitePrefix, jurisdictionKeyword, distilled].filter(Boolean);
  const assembled = parts.join(' ').replace(/\s{2,}/g, ' ').trim();

  // Step 5: Clean final query (dedup repeated phrases, strip stray punctuation)
  const cleaned = cleanFinalQuery(assembled);

  // Step 6: Trim to maxQueryLength
  return cleaned.slice(0, maxQueryLength).trim();
}

/**
 * Returns true if the user message and route context suggest that real-time
 * web search would add value (user is asking for current/recent information).
 */
export function shouldPerformWebSearch(
  userMessage: string,
  routeIntent: string,
): boolean {
  // Never for personal/crisis/out-of-scope intents (those are gated upstream,
  // but this is an additional safety check)
  const blockedIntents = new Set([
    'personal_wellbeing',
    'personal_mental_health',
    'possible_crisis_or_self_harm',
    'out_of_scope',
    'ambiguous',
  ]);
  if (blockedIntents.has(routeIntent)) return false;

  // For HR/compliance routes, check if the query asks for current info
  return requiresCurrentInfo(userMessage);
}
