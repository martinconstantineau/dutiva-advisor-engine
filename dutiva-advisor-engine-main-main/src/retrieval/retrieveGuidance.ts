import * as fs from 'node:fs';
import * as path from 'node:path';
import { GuidanceItem, ScoredGuidanceItem } from './guidanceTypes';
import { rankGuidanceItems, RetrieveOptions } from './scoreGuidanceItem';
import { loadGeneratedGuidanceIndex } from './generatedGuidanceLoader';
import { adaptGeneratedGuidanceCards } from './generatedGuidanceAdapter';

const knowledgeBase: GuidanceItem[] = [

  // ─── COMMON LAW (ALL jurisdictions) ───────────────────────────────────────

  {
    id: 'term-cl-001',
    category: 'termination',
    province: 'ALL',
    title: 'Termination Without Cause — Common Law Reasonable Notice',
    content:
      'Employees terminated without just cause are entitled to reasonable notice or pay in lieu at common law. Notice is determined by the Bardal factors: length of service, age, character of employment, and availability of similar positions. Statutory minimums are a floor, not a ceiling.',
    citations: [
      { statute: 'Common Law', shortForm: 'Bardal v Globe & Mail Ltd (1960) 24 DLR (2d) 140' },
    ],
    keywords: ['termination', 'fired', 'dismissed', 'notice', 'severance', 'without cause', 'let go', 'reasonable notice'],
  },
  {
    id: 'term-cl-002',
    category: 'termination',
    province: 'ALL',
    title: 'Just Cause Termination — Common Law Standard',
    content:
      'Just cause allows dismissal without notice. The standard is contextual and proportionate: courts assess whether the misconduct is serious enough to irrevocably break the employment relationship. Progressive discipline is generally expected absent egregious conduct.',
    citations: [
      { statute: 'Common Law', shortForm: 'McKinley v BC Tel [2001] 2 SCR 161' },
    ],
    keywords: ['just cause', 'misconduct', 'theft', 'dishonesty', 'serious misconduct', 'immediate termination'],
  },
  {
    id: 'accomm-cl-001',
    category: 'accommodation',
    province: 'ALL',
    title: 'Duty to Accommodate — General Principles',
    content:
      'Employers must accommodate employees with disabilities and other protected characteristics to the point of undue hardship. The process is collaborative: the employer must explore options, the employee must participate and accept reasonable accommodation. Undue hardship requires evidence of significant financial cost or operational disruption.',
    citations: [
      { statute: 'Canadian Human Rights Act', shortForm: 'CHRA', url: 'https://laws-lois.justice.gc.ca/eng/acts/h-6/' },
    ],
    keywords: ['accommodation', 'disability', 'duty to accommodate', 'undue hardship', 'modify duties', 'return to work'],
  },
  {
    id: 'leave-cl-001',
    category: 'leave',
    province: 'ALL',
    title: 'Pregnancy and Parental Leave — EI Benefits',
    content:
      'Employment Insurance provides maternity (15 weeks) and parental benefits (standard 40 weeks shared, or extended 69 weeks at a lower rate). Employers cannot terminate or penalize employees for taking statutory leave.',
    citations: [
      { statute: 'Employment Insurance Act', shortForm: 'EI Act', url: 'https://laws-lois.justice.gc.ca/eng/acts/E-5.6/' },
    ],
    keywords: ['maternity', 'parental leave', 'pregnancy', 'baby', 'EI', 'leave', 'newborn'],
  },
  {
    id: 'meddisc-cl-001',
    category: 'medical_disclosure',
    province: 'ALL',
    title: 'Employee Medical Disclosure — Functional Information Only',
    content:
      'Employees must provide sufficient medical information to establish a functional limitation requiring accommodation, but are not required to disclose their diagnosis. Employers may request a functional abilities form completed by a treating physician, not a diagnostic report.',
    citations: [
      { statute: 'Canadian Human Rights Act', shortForm: 'CHRA' },
    ],
    keywords: ['medical', 'doctor note', 'diagnosis', 'disclose', 'health information', 'functional limitations', 'privacy'],
  },

  // ─── FEDERAL (Canada Labour Code) ─────────────────────────────────────────

  {
    id: 'term-fed-001',
    category: 'termination',
    province: 'FEDERAL',
    title: 'Unjust Dismissal — Canada Labour Code Part III',
    content:
      'Non-managerial employees with 12 or more continuous months of service under federal jurisdiction may file an unjust dismissal complaint under the Canada Labour Code. Reinstatement is available as a remedy, which is not available under provincial ESA regimes. The complaint must be filed within 90 days of dismissal.',
    citations: [
      { statute: 'Canada Labour Code', section: 'ss. 240–246', shortForm: 'CLC Part III', url: 'https://laws-lois.justice.gc.ca/eng/acts/L-2/' },
    ],
    keywords: ['unjust dismissal', 'federal', 'CLC', 'reinstatement', '12 months', 'canada labour code'],
    federalOnly: true,
  },
  {
    id: 'term-fed-002',
    category: 'termination',
    province: 'FEDERAL',
    title: 'Federal Termination — Group Termination Notice',
    content:
      'Under the Canada Labour Code, if 50 or more employees are terminated within a 4-week period, the employer must provide 16 weeks notice to the Minister of Labour and affected employees. Individual minimums range from 2 weeks (1–3 years) up to 8 weeks (10+ years).',
    citations: [
      { statute: 'Canada Labour Code', section: 'ss. 212–213', shortForm: 'CLC Part III' },
    ],
    keywords: ['group termination', 'mass layoff', 'federal', 'minister of labour', 'notice period'],
    federalOnly: true,
  },
  {
    id: 'harass-fed-001',
    category: 'harassment',
    province: 'FEDERAL',
    title: 'Work Place Harassment and Violence Prevention — Bill C-65',
    content:
      'Federally regulated employers must have a work place harassment and violence prevention policy, conduct joint workplace assessments, respond to all notices of occurrences within 7 days, and offer negotiated resolution, conciliation, or investigation. The regime is under Canada Labour Code Part II and the WPHVP Regulations.',
    citations: [
      { statute: 'Canada Labour Code', section: 'Part II, ss. 122–135', shortForm: 'CLC Part II (Bill C-65)' },
      { statute: 'Work Place Harassment and Violence Prevention Regulations', shortForm: 'WPHVP Regs', url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2020-130/' },
    ],
    keywords: ['harassment', 'federal', 'bill c-65', 'WPHVP', 'violence prevention', 'occurrence', 'investigation'],
    federalOnly: true,
  },
  {
    id: 'safety-fed-001',
    category: 'workplace_safety',
    province: 'FEDERAL',
    title: 'Right to Refuse Dangerous Work — Canada Labour Code',
    content:
      'Federal employees may refuse work they reasonably believe is dangerous. The employer and a safety officer (Health Canada/ESDC) must investigate. The employee cannot be disciplined for exercising this right.',
    citations: [
      { statute: 'Canada Labour Code', section: 'ss. 128–132', shortForm: 'CLC Part II' },
    ],
    keywords: ['right to refuse', 'dangerous work', 'federal', 'safety officer', 'ESDC', 'health canada'],
    federalOnly: true,
  },
  {
    id: 'leave-fed-001',
    category: 'leave',
    province: 'FEDERAL',
    title: 'Federal Leave Entitlements — Canada Labour Code',
    content:
      'Federally regulated employees are entitled to: 17 weeks maternity leave, 63 weeks parental leave, 17 weeks personal medical leave, 10 days family responsibility leave (3 paid after 3 months), and up to 5 days bereavement leave (3 paid). These exceed many provincial minimums.',
    citations: [
      { statute: 'Canada Labour Code', section: 'Part III, Division VII', shortForm: 'CLC Part III' },
    ],
    keywords: ['federal leave', 'maternity', 'parental', 'family responsibility', 'bereavement', 'personal leave', 'CLC'],
    federalOnly: true,
  },
  {
    id: 'reprisal-fed-001',
    category: 'reprisal',
    province: 'FEDERAL',
    title: 'Reprisal Prohibition — Canada Labour Code',
    content:
      'Federal employers are prohibited from taking reprisal against employees who exercise rights under the Canada Labour Code, including filing complaints, refusing dangerous work, or participating in WPHVP processes. Complaints may be filed with the Canada Industrial Relations Board.',
    citations: [
      { statute: 'Canada Labour Code', section: 'ss. 133, 247.99', shortForm: 'CLC' },
    ],
    keywords: ['reprisal', 'federal', 'CIRB', 'retaliation', 'complaint', 'CLC', 'whistleblower'],
    federalOnly: true,
  },

  // ─── ONTARIO ───────────────────────────────────────────────────────────────

  {
    id: 'term-on-001',
    category: 'termination',
    province: 'ON',
    title: 'Ontario Termination — ESA 2000 Minimums',
    content:
      'The Employment Standards Act, 2000 sets minimum notice or pay in lieu: 1 week per year of service up to 8 weeks. Severance pay (1 week per year, up to 26 weeks) applies separately if the employer has a payroll of $2.5M+ or terminates 50+ employees in a 6-month period and the employee has 5+ years of service. Both minimums are a floor — common law may provide more.',
    citations: [
      { statute: 'Employment Standards Act, 2000', section: 'ss. 54–62, 64–65', shortForm: 'ESA 2000 (ON)', url: 'https://www.ontario.ca/laws/statute/00e41' },
    ],
    keywords: ['termination', 'ESA', 'ontario', 'notice', 'severance pay', 'payroll threshold', '2.5 million'],
  },
  {
    id: 'harass-on-001',
    category: 'harassment',
    province: 'ON',
    title: 'Ontario Workplace Harassment — OHSA and Bill 168',
    content:
      'Ontario employers must have a written workplace harassment policy, conduct investigations into complaints that are appropriate in the circumstances, and provide results to both parties. The OHSA defines workplace harassment broadly to include personal harassment. Workplace sexual harassment is a distinct category with additional obligations.',
    citations: [
      { statute: 'Occupational Health and Safety Act', section: 'ss. 32.0.1–32.0.7', shortForm: 'OHSA (ON)', url: 'https://www.ontario.ca/laws/statute/90o01' },
    ],
    keywords: ['harassment', 'ontario', 'OHSA', 'bill 168', 'workplace harassment policy', 'sexual harassment'],
  },
  {
    id: 'accomm-on-001',
    category: 'accommodation',
    province: 'ON',
    title: 'Ontario Duty to Accommodate — Human Rights Code',
    content:
      'The Ontario Human Rights Code prohibits discrimination on 17 protected grounds including disability, family status, sex, and creed. Employers must accommodate to the point of undue hardship assessed by cost, outside sources of funding, and health and safety. The OHRC\'s Policy on Ableism and Discrimination Based on Disability is the key interpretive document.',
    citations: [
      { statute: 'Human Rights Code', section: 'ss. 5, 11, 17', shortForm: 'OHRC (ON)', url: 'https://www.ontario.ca/laws/statute/90h19' },
    ],
    keywords: ['accommodation', 'ontario', 'human rights code', 'disability', 'family status', 'OHRC', 'protected grounds'],
  },
  {
    id: 'leave-on-001',
    category: 'leave',
    province: 'ON',
    title: 'Ontario Statutory Leaves — ESA 2000',
    content:
      'Ontario provides: pregnancy leave (17 weeks), parental leave (up to 63 weeks), family medical leave (28 weeks), critical illness leave (up to 37 weeks for adults), domestic or sexual violence leave (10 days + 15 weeks), sick leave (3 days unpaid), and bereavement leave (2 days unpaid). All are job-protected.',
    citations: [
      { statute: 'Employment Standards Act, 2000', section: 'Part XIV', shortForm: 'ESA 2000 (ON)' },
    ],
    keywords: ['ontario leave', 'parental', 'pregnancy', 'family medical', 'sick leave', 'bereavement', 'domestic violence leave', 'ESA'],
  },
  {
    id: 'reprisal-on-001',
    category: 'reprisal',
    province: 'ON',
    title: 'Ontario Reprisal Prohibition — ESA 2000',
    content:
      'Under the ESA 2000, it is prohibited to intimidate, dismiss, or penalize an employee for exercising a right under the Act, including asking questions about entitlements or filing an ESA complaint. Reprisal complaints are filed with the Ministry of Labour.',
    citations: [
      { statute: 'Employment Standards Act, 2000', section: 's. 74', shortForm: 'ESA 2000 (ON)' },
    ],
    keywords: ['reprisal', 'ontario', 'ESA', 'Ministry of Labour', 'retaliation', 'complaint'],
  },
  {
    id: 'safety-on-001',
    category: 'workplace_safety',
    province: 'ON',
    title: 'Ontario Right to Refuse Unsafe Work — OHSA',
    content:
      'Ontario workers may refuse unsafe work under OHSA s. 43. The employer must investigate immediately with the worker and a worker representative. If unresolved, a Ministry of Labour inspector is called. Critical injuries must be reported to the Ministry within 48 hours.',
    citations: [
      { statute: 'Occupational Health and Safety Act', section: 'ss. 43–46', shortForm: 'OHSA (ON)' },
    ],
    keywords: ['right to refuse', 'ontario', 'OHSA', 'unsafe work', 'Ministry of Labour', 'critical injury'],
  },
  {
    id: 'comp-on-001',
    category: 'compensation',
    province: 'ON',
    title: 'Ontario Pay, Hours, Overtime and Public Holidays — ESA 2000',
    content:
      'Ontario\'s Employment Standards Act, 2000 sets a general minimum wage that is reviewed and adjusted annually (with separate rates for students and certain roles), so a current figure should always be confirmed against the Ontario Ministry of Labour rather than assumed. Overtime is generally payable at 1.5 times the regular rate after 44 hours in a work week. Vacation entitlement is two weeks (vacation pay of 4%) before five years of service and three weeks (6%) at five or more years. There are nine public holidays, with public holiday pay calculated under the ESA formula. Most deductions from wages require statutory authority, a court order, or the employee\'s written authorization.',
    citations: [
      { statute: 'Employment Standards Act, 2000', section: 'Parts VII–XI', shortForm: 'ESA 2000 (ON)', url: 'https://www.ontario.ca/laws/statute/00e41' },
    ],
    keywords: ['ontario', 'minimum wage', 'overtime', 'hours of work', 'vacation pay', 'public holiday', 'statutory holiday', 'deductions', 'ESA', 'pay', 'wages'],
  },
  {
    id: 'meddisc-on-001',
    category: 'medical_disclosure',
    province: 'ON',
    title: 'Ontario Medical Information and Functional Limitations — Human Rights Code',
    content:
      'When accommodating a disability in Ontario, an employer may request the functional information needed to understand the employee\'s limitations and accommodation needs — not the diagnosis. The duty to accommodate flows from the Ontario Human Rights Code, and OHRC policy guidance distinguishes functional-abilities information from confidential medical diagnosis. Health information collected for accommodation must be kept confidential, stored securely, and shared only with those who need it to implement the accommodation. Health-sector employers may also be subject to PHIPA for personal health information.',
    citations: [
      { statute: 'Human Rights Code', section: 'ss. 5, 11, 17', shortForm: 'OHRC (ON)', url: 'https://www.ontario.ca/laws/statute/90h19' },
    ],
    keywords: ['ontario', 'medical', 'doctor note', 'functional limitations', 'diagnosis', 'accommodation', 'privacy', 'confidential', 'health information', 'PHIPA', 'human rights code'],
  },

  // ─── QUÉBEC ────────────────────────────────────────────────────────────────

  {
    id: 'term-qc-001',
    category: 'termination',
    province: 'QC',
    title: 'Québec Termination — Act Respecting Labour Standards',
    content:
      'Under Québec\'s Act Respecting Labour Standards (ARLS/LNT), employees with 3+ months of uninterrupted service are entitled to a notice of termination or pay in lieu: 1 week (3 months–1 year), 2 weeks (1–5 years), 4 weeks (5–10 years), 8 weeks (10+ years). Employees with 2+ years may file a complaint for dismissal without good and sufficient cause (reinstatement available).',
    citations: [
      { statute: 'Act Respecting Labour Standards', section: 'ss. 82, 124', shortForm: 'ARLS (QC)', url: 'https://www.legisquebec.gouv.qc.ca/en/document/cs/N-1.1' },
    ],
    keywords: ['termination', 'québec', 'LNT', 'ARLS', 'dismissal without good cause', 'reinstatement', 'notice', '2 years'],
  },
  {
    id: 'harass-qc-001',
    category: 'harassment',
    province: 'QC',
    title: 'Québec Psychological Harassment — ARLS ss. 81.18–81.20',
    content:
      'Québec has had explicit statutory protection against psychological harassment since 2004. The ARLS defines it as vexatious conduct that is repeated, hostile or unwanted, affecting dignity or psychological integrity, and creating a harmful work environment. A single serious incident may qualify. Employers must take reasonable means to prevent and stop harassment. Complaints are filed with the CNESST within 2 years.',
    citations: [
      { statute: 'Act Respecting Labour Standards', section: 'ss. 81.18–81.20', shortForm: 'ARLS (QC)' },
      { statute: 'Commission des normes, de l\'équité, de la santé et de la sécurité du travail', shortForm: 'CNESST', url: 'https://www.cnesst.gouv.qc.ca' },
    ],
    keywords: ['harassment', 'québec', 'psychological harassment', 'CNESST', 'LNT', 'ARLS', 'vexatious', 'harcèlement'],
  },
  {
    id: 'accomm-qc-001',
    category: 'accommodation',
    province: 'QC',
    title: 'Québec Duty to Accommodate — Charter of Human Rights and Freedoms',
    content:
      'In Québec, the duty to accommodate flows from the Charter of Human Rights and Freedoms (not the Human Rights Code). Protected grounds include handicap, sex, pregnancy, civil status, and more. The Commission des droits de la personne et des droits de la jeunesse (CDPDJ) is the enforcement body.',
    citations: [
      { statute: 'Charter of Human Rights and Freedoms', section: 'ss. 10, 16–20', shortForm: 'Québec Charter', url: 'https://www.legisquebec.gouv.qc.ca/en/document/cs/C-12' },
    ],
    keywords: ['accommodation', 'québec', 'charter', 'CDPDJ', 'handicap', 'disability', 'protected grounds', 'droits de la personne'],
  },
  {
    id: 'leave-qc-001',
    category: 'leave',
    province: 'QC',
    title: 'Québec Parental Leave — QPIP',
    content:
      'Québec operates its own parental insurance plan (QPIP/RQAP) which provides more generous benefits than federal EI: maternity (18 weeks standard or 15 weeks special plan), paternity (5 weeks), parental (up to 32 weeks shared). Benefits begin immediately with no 2-week waiting period. All employees in QC contribute to QPIP, not EI maternity/parental.',
    citations: [
      { statute: 'Act Respecting Parental Insurance', shortForm: 'QPIP/RQAP (QC)', url: 'https://www.rqap.gouv.qc.ca' },
      { statute: 'Act Respecting Labour Standards', section: 'ss. 81.1–81.17', shortForm: 'ARLS (QC)' },
    ],
    keywords: ['parental leave', 'québec', 'QPIP', 'RQAP', 'maternity', 'paternity', 'parental insurance', 'no waiting period'],
  },
  {
    id: 'reprisal-qc-001',
    category: 'reprisal',
    province: 'QC',
    title: 'Québec Reprisal Prohibition — ARLS',
    content:
      'The ARLS prohibits reprisals against employees who exercise rights under the Act, including filing CNESST complaints or participating in investigations. Sanctions include reinstatement and damages. The CNESST enforces reprisal complaints.',
    citations: [
      { statute: 'Act Respecting Labour Standards', section: 'ss. 122–123.1', shortForm: 'ARLS (QC)' },
    ],
    keywords: ['reprisal', 'québec', 'CNESST', 'ARLS', 'retaliation', 'représailles', 'LNT'],
  },
  {
    id: 'safety-qc-001',
    category: 'workplace_safety',
    province: 'QC',
    title: 'Québec OHS — Act Respecting Occupational Health and Safety',
    content:
      'Québec\'s LSST gives workers the right to refuse work they have reasonable grounds to believe poses danger. Workers also have a right to preventive withdrawal for pregnant workers. The CNESST administers OHS in Québec. Employers must establish a prevention program and a joint OHS committee if they have 20+ employees.',
    citations: [
      { statute: 'Act Respecting Occupational Health and Safety', section: 'ss. 12, 32', shortForm: 'LSST (QC)', url: 'https://www.legisquebec.gouv.qc.ca/en/document/cs/S-2.1' },
    ],
    keywords: ['safety', 'québec', 'LSST', 'CNESST', 'right to refuse', 'preventive withdrawal', 'pregnant worker', 'OHS'],
  },
  {
    id: 'comp-qc-001',
    category: 'compensation',
    province: 'QC',
    title: 'Québec Pay, Hours, Overtime and Statutory Holidays — Act Respecting Labour Standards',
    content:
      'Under Québec\'s Act Respecting Labour Standards (LNT), the CNESST sets a general minimum wage that is reviewed annually (changes typically take effect May 1), with a separate lower rate for tipped employees — confirm the current rate with the CNESST rather than assuming a figure. The standard work week is 40 hours, after which overtime is payable at 1.5 times the regular wage (time off in lieu is possible by agreement). Annual leave increases with service: after one year of uninterrupted service, two weeks with vacation pay of 4%; after three years, three weeks at 6%. The LNT also provides statutory general holidays, in addition to the National Holiday (June 24).',
    citations: [
      { statute: 'Act Respecting Labour Standards', section: 'ss. 40–59.0.1', shortForm: 'ARLS / LNT (QC)', url: 'https://www.legisquebec.gouv.qc.ca/en/document/cs/N-1.1' },
    ],
    keywords: ['québec', 'minimum wage', 'salaire minimum', 'overtime', 'heures supplémentaires', 'statutory holiday', 'jours fériés', 'vacation', 'congé annuel', 'CNESST', 'LNT', 'ARLS', 'pay'],
  },
  {
    id: 'meddisc-qc-001',
    category: 'medical_disclosure',
    province: 'QC',
    title: 'Québec Medical Information and Functional Limitations — Charter and Law 25',
    content:
      'In Québec, the duty to accommodate flows from the Charter of Human Rights and Freedoms. An employer may request the functional information needed to assess accommodation, not the diagnosis. Employee personal information — including health information — is protected by the Act respecting the protection of personal information in the private sector (modernized by Law 25), which requires a serious and legitimate purpose for collection, consent or legal authority, confidentiality, and access limited to those who need it. Keep medical information to the functional limitations relevant to the job.',
    citations: [
      { statute: 'Charter of Human Rights and Freedoms', section: 'ss. 10, 16, 20', shortForm: 'Québec Charter', url: 'https://www.legisquebec.gouv.qc.ca/en/document/cs/C-12' },
      { statute: 'Act respecting the protection of personal information in the private sector', shortForm: 'Law 25 / P-39.1 (QC)' },
    ],
    keywords: ['québec', 'medical', 'renseignements médicaux', 'functional limitations', 'limitations fonctionnelles', 'diagnosis', 'accommodation', 'privacy', 'law 25', 'charter', 'confidential'],
  },

  // ─── CROSS-JURISDICTION ────────────────────────────────────────────────────

  {
    id: 'remote-001',
    category: 'general',
    province: 'ALL',
    title: 'Remote Work — Jurisdiction Determination',
    content:
      'For remote workers, employment standards are generally governed by the province where the employer is incorporated or carries on business, not where the employee physically works. Exception: federally regulated employers are always governed by the Canada Labour Code regardless of employee location. Cross-border situations (e.g. ON employer, QC-resident employee) can create complexity around which provincial human rights code and employment standards apply — always verify which legislation the employment contract specifies and confirm with counsel.',
    citations: [
      { statute: 'Common Law / Provincial Employment Standards', shortForm: 'Multi-jurisdiction analysis required' },
    ],
    keywords: ['remote work', 'work from home', 'WFH', 'jurisdiction', 'cross-border', 'employer province', 'employee province', 'multi-jurisdiction'],
  },
];

export { knowledgeBase };

/**
 * Module-level corpus cache.
 *
 * The guidance index is read from disk once on the first call to retrieveGuidance()
 * and cached for the lifetime of the process. This avoids a synchronous disk read
 * and O(4000+) adapter pass on every single HTTP request.
 *
 * The cache is keyed on the index path so that tests that pass a custom path still
 * get their own isolated result. The default path (undefined) shares a single entry.
 *
 * For the default path (data/advisor-guidance-index.json), the cache is additionally
 * invalidated when the file's mtime or size changes.  This allows local development
 * workflows and long-running processes to pick up a newly-built index without restart.
 *
 * Use resetGuidanceCorpusCache() in tests that need to force a reload (e.g. when
 * writing a temp index file to disk and then loading it).
 */

interface CorpusCacheEntry {
  corpus: GuidanceItem[];
  source: 'generated_plus_curated' | 'curated_only';
  generatedItems: number;
  /** mtime in milliseconds, or null if the file wasn't present at load time. */
  mtimeMs: number | null;
  /** file size in bytes, or null if the file wasn't present at load time. */
  sizeBytes: number | null;
}

const corpusCache = new Map<string, CorpusCacheEntry>();

/** Default generated index path — mirrors the constant in generatedGuidanceLoader.ts. */
const DEFAULT_INDEX_PATH = path.resolve(process.cwd(), 'data/advisor-guidance-index.json');

/**
 * Stat the default index file and return { mtimeMs, sizeBytes }, or nulls if absent.
 * Never throws.
 */
function statDefaultIndex(filePath: string): { mtimeMs: number | null; sizeBytes: number | null } {
  try {
    const s = fs.statSync(filePath);
    return { mtimeMs: s.mtimeMs, sizeBytes: s.size };
  } catch {
    return { mtimeMs: null, sizeBytes: null };
  }
}

/**
 * Reset the corpus cache. Intended for use in tests only.
 * Calling this in production is a no-op in terms of correctness but causes the
 * next request to incur the reload cost.
 */
export function resetGuidanceCorpusCache(): void {
  corpusCache.clear();
}

/**
 * Build the combined guidance corpus for a query.
 *
 * Retrieval order:
 *   1. Generated guidance index (data/advisor-guidance-index.json) when present and valid.
 *   2. Curated hardcoded knowledgeBase as fallback (always included when index is absent or empty).
 *   3. Safe empty result if neither has matching records.
 *
 * The curated knowledgeBase is NOT replaced. Generated guidance is additive source-law
 * expansion. Curated fallback remains authoritative for tone, quality, and non-federal coverage.
 *
 * Safety guarantees (enforced by loader + adapter):
 * - inactive_or_repealed generated records are never included.
 * - unknown-language generated records are never included.
 * - French placeholder content is never included.
 * - Invalid bare-subsection citations are suppressed in the adapter.
 * - If the index file is absent, only knowledgeBase is used — no crash.
 * - For the default index path the cache is mtime/size-validated on every call so
 *   pipeline:all followed by a new request transparently picks up the rebuilt index.
 */
function buildGuidanceCorpus(indexPath?: string): GuidanceItem[] {
  const cacheKey = indexPath ?? '__default__';
  const resolvedPath = indexPath ?? DEFAULT_INDEX_PATH;

  const existing = corpusCache.get(cacheKey);
  if (existing !== undefined) {
    // For custom paths (used in tests) or non-default paths, trust the cache.
    // For the default path, invalidate if mtime or size changed.
    if (indexPath !== undefined) {
      // Custom path supplied by caller — always trust the cache (test isolation)
      return existing.corpus;
    }
    // Default path: stat to detect pipeline rebuilds
    const { mtimeMs, sizeBytes } = statDefaultIndex(resolvedPath);
    if (mtimeMs === existing.mtimeMs && sizeBytes === existing.sizeBytes) {
      return existing.corpus;
    }
    // File changed — fall through to reload
    corpusCache.delete(cacheKey);
  }

  const generatedCards = loadGeneratedGuidanceIndex(indexPath);
  const generatedItems = adaptGeneratedGuidanceCards(generatedCards);

  let corpus: GuidanceItem[];
  let source: CorpusCacheEntry['source'];
  if (generatedItems.length > 0) {
    // Merge: generated items first (source-law expansion), then curated fallback.
    // Deduplication by id is not required — generated ids (SHA-1 hex) will not
    // collide with curated ids (human-assigned short strings like 'term-fed-001').
    corpus = [...generatedItems, ...knowledgeBase];
    source = 'generated_plus_curated';
  } else {
    // Index absent or empty — use curated fallback only.
    corpus = knowledgeBase;
    source = 'curated_only';
  }

  const { mtimeMs, sizeBytes } = statDefaultIndex(resolvedPath);
  corpusCache.set(cacheKey, {
    corpus,
    source,
    generatedItems: generatedItems.length,
    mtimeMs,
    sizeBytes,
  });
  return corpus;
}

/**
 * Retrieve and rank guidance items for a query.
 *
 * By default, combines the generated guidance index (when available) with the
 * curated knowledgeBase fallback. You may pass an explicit items array to
 * override (e.g. in tests that target only the curated knowledge base).
 */
export function retrieveGuidance(
  query: unknown,
  items?: GuidanceItem[],
  options?: RetrieveOptions,
): ScoredGuidanceItem[] {
  const corpus = items ?? buildGuidanceCorpus();
  return rankGuidanceItems(corpus, query, options);
}

/**
 * Retrieve guidance using only the curated knowledgeBase (no generated index).
 * Use this in contexts where you explicitly want to bypass the generated index,
 * such as regression tests that validate the curated fallback.
 */
export function retrieveCuratedGuidance(
  query: unknown,
  options?: RetrieveOptions,
): ScoredGuidanceItem[] {
  return rankGuidanceItems(knowledgeBase, query, options);
}

export interface GuidanceCorpusStatus {
  source: 'generated_plus_curated' | 'curated_only';
  totalItems: number;
  generatedItems: number;
  curatedItems: number;
  indexPath: string;
  indexPresent: boolean;
  indexMtimeMs: number | null;
  indexSizeBytes: number | null;
}

export function getGuidanceCorpusStatus(indexPath?: string): GuidanceCorpusStatus {
  const cacheKey = indexPath ?? '__default__';
  const resolvedPath = indexPath ?? DEFAULT_INDEX_PATH;

  // Ensure the default corpus has been built so status reflects the active runtime.
  buildGuidanceCorpus(indexPath);

  const entry = corpusCache.get(cacheKey);
  const { mtimeMs, sizeBytes } = statDefaultIndex(resolvedPath);

  if (!entry) {
    return {
      source: 'curated_only',
      totalItems: knowledgeBase.length,
      generatedItems: 0,
      curatedItems: knowledgeBase.length,
      indexPath: resolvedPath,
      indexPresent: mtimeMs !== null && sizeBytes !== null,
      indexMtimeMs: mtimeMs,
      indexSizeBytes: sizeBytes,
    };
  }

  return {
    source: entry.source,
    totalItems: entry.corpus.length,
    generatedItems: entry.generatedItems,
    curatedItems: Math.max(entry.corpus.length - entry.generatedItems, 0),
    indexPath: resolvedPath,
    indexPresent: mtimeMs !== null && sizeBytes !== null,
    indexMtimeMs: mtimeMs,
    indexSizeBytes: sizeBytes,
  };
}
