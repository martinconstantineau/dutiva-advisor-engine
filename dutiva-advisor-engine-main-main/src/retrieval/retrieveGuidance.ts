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
    title_fr: 'Cessation d’emploi en Ontario — minimums de la LNE 2000',
    content:
      'The Employment Standards Act, 2000 sets minimum notice or pay in lieu: 1 week per year of service up to 8 weeks. Severance pay (1 week per year, up to 26 weeks) applies separately if the employer has a payroll of $2.5M+ or terminates 50+ employees in a 6-month period and the employee has 5+ years of service. Both minimums are a floor — common law may provide more.',
    content_fr:
      'La Loi de 2000 sur les normes d’emploi (LNE) fixe un préavis minimal ou une indemnité qui en tient lieu : 1 semaine par année de service, jusqu’à 8 semaines. Une indemnité de cessation d’emploi (1 semaine par année, jusqu’à 26 semaines) s’applique séparément si la masse salariale de l’employeur est de 2,5 M$ ou plus, ou s’il met fin à l’emploi de 50 salariés ou plus sur une période de 6 mois et que le salarié compte 5 ans de service ou plus. Ces minimums sont un plancher — la common law peut exiger davantage.',
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
    title_fr: 'Harcèlement au travail en Ontario — LSST et projet de loi 168',
    content:
      'Ontario employers must have a written workplace harassment policy, conduct investigations into complaints that are appropriate in the circumstances, and provide results to both parties. The OHSA defines workplace harassment broadly to include personal harassment. Workplace sexual harassment is a distinct category with additional obligations.',
    content_fr:
      'Les employeurs de l’Ontario doivent avoir une politique écrite contre le harcèlement au travail, mener sur les plaintes une enquête appropriée dans les circonstances et communiquer les résultats aux deux parties. La LSST définit le harcèlement au travail de façon large, y compris le harcèlement personnel. Le harcèlement sexuel au travail constitue une catégorie distincte assortie d’obligations supplémentaires.',
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
    title_fr: 'Obligation d’accommodement en Ontario — Code des droits de la personne',
    content:
      'The Ontario Human Rights Code prohibits discrimination on 17 protected grounds including disability, family status, sex, and creed. Employers must accommodate to the point of undue hardship assessed by cost, outside sources of funding, and health and safety. The OHRC\'s Policy on Ableism and Discrimination Based on Disability is the key interpretive document.',
    content_fr:
      'Le Code des droits de la personne de l’Ontario interdit la discrimination fondée sur 17 motifs protégés, dont le handicap, l’état familial, le sexe et la croyance. L’employeur doit composer avec les besoins jusqu’au point de contrainte excessive, évaluée selon le coût, les sources extérieures de financement ainsi que la santé et la sécurité. La politique de la Commission ontarienne des droits de la personne (CODP) sur le capacitisme et la discrimination fondée sur le handicap constitue le principal document d’interprétation.',
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
    title_fr: 'Congés prévus par la loi en Ontario — LNE 2000',
    content:
      'Ontario provides: pregnancy leave (17 weeks), parental leave (up to 63 weeks), family medical leave (28 weeks), critical illness leave (up to 37 weeks for adults), domestic or sexual violence leave (10 days + 15 weeks), sick leave (3 days unpaid), and bereavement leave (2 days unpaid). All are job-protected.',
    content_fr:
      'L’Ontario prévoit : le congé de grossesse (17 semaines), le congé parental (jusqu’à 63 semaines), le congé familial pour raison médicale (28 semaines), le congé en cas de maladie grave (jusqu’à 37 semaines pour un adulte), le congé en cas de violence familiale ou sexuelle (10 jours + 15 semaines), le congé de maladie (3 jours non payés) et le congé de deuil (2 jours non payés). Tous sont protégés : l’emploi est garanti.',
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
    title_fr: 'Interdiction des représailles en Ontario — LNE 2000',
    content:
      'Under the ESA 2000, it is prohibited to intimidate, dismiss, or penalize an employee for exercising a right under the Act, including asking questions about entitlements or filing an ESA complaint. Reprisal complaints are filed with the Ministry of Labour.',
    content_fr:
      'En vertu de la LNE 2000, il est interdit d’intimider, de congédier ou de pénaliser un salarié parce qu’il exerce un droit prévu par la Loi, notamment poser des questions sur ses droits ou déposer une plainte en vertu de la LNE. Les plaintes pour représailles sont déposées auprès du ministère du Travail.',
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
    title_fr: 'Droit de refuser un travail dangereux en Ontario — LSST',
    content:
      'Ontario workers may refuse unsafe work under OHSA s. 43. The employer must investigate immediately with the worker and a worker representative. If unresolved, a Ministry of Labour inspector is called. Critical injuries must be reported to the Ministry within 48 hours.',
    content_fr:
      'Les travailleurs de l’Ontario peuvent refuser un travail dangereux en vertu de l’article 43 de la LSST. L’employeur doit faire enquête immédiatement avec le travailleur et un représentant des travailleurs. Si la situation n’est pas résolue, un inspecteur du ministère du Travail est appelé. Les blessures critiques doivent être signalées au ministère dans les 48 heures.',
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
    title_fr: 'Salaire, heures, temps supplémentaire et jours fériés en Ontario — LNE 2000',
    content:
      'Ontario\'s Employment Standards Act, 2000 sets a general minimum wage that is reviewed and adjusted annually (with separate rates for students and certain roles), so a current figure should always be confirmed against the Ontario Ministry of Labour rather than assumed. Overtime is generally payable at 1.5 times the regular rate after 44 hours in a work week. Vacation entitlement is two weeks (vacation pay of 4%) before five years of service and three weeks (6%) at five or more years. There are nine public holidays, with public holiday pay calculated under the ESA formula. Most deductions from wages require statutory authority, a court order, or the employee\'s written authorization.',
    content_fr:
      'La Loi de 2000 sur les normes d’emploi (LNE) de l’Ontario fixe un salaire minimum général révisé et ajusté chaque année (avec des taux distincts pour les étudiants et certains rôles); il faut donc toujours confirmer le taux courant auprès du ministère du Travail de l’Ontario plutôt que de le présumer. Le temps supplémentaire est généralement payable à 1,5 fois le taux horaire habituel après 44 heures dans une semaine de travail. Le droit aux vacances est de deux semaines (indemnité de 4 %) avant cinq ans de service et de trois semaines (6 %) à cinq ans ou plus. Il y a neuf jours fériés, l’indemnité étant calculée selon la formule de la LNE. La plupart des retenues sur le salaire exigent une autorisation légale, une ordonnance d’un tribunal ou l’autorisation écrite du salarié.',
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
    title_fr: 'Renseignements médicaux et limitations fonctionnelles en Ontario — Code des droits de la personne',
    content:
      'When accommodating a disability in Ontario, an employer may request the functional information needed to understand the employee\'s limitations and accommodation needs — not the diagnosis. The duty to accommodate flows from the Ontario Human Rights Code, and OHRC policy guidance distinguishes functional-abilities information from confidential medical diagnosis. Health information collected for accommodation must be kept confidential, stored securely, and shared only with those who need it to implement the accommodation. Health-sector employers may also be subject to PHIPA for personal health information.',
    content_fr:
      'Lorsqu’il accommode un handicap en Ontario, l’employeur peut demander les renseignements fonctionnels nécessaires pour comprendre les limitations du salarié et ses besoins d’accommodement — et non le diagnostic. L’obligation d’accommodement découle du Code des droits de la personne de l’Ontario, et les politiques de la CODP distinguent les renseignements sur les capacités fonctionnelles du diagnostic médical confidentiel. Les renseignements de santé recueillis aux fins d’accommodement doivent demeurer confidentiels, être conservés de façon sécuritaire et n’être communiqués qu’aux personnes qui en ont besoin pour mettre en œuvre l’accommodement. Les employeurs du secteur de la santé peuvent aussi être assujettis à la LPRPS pour les renseignements personnels sur la santé.',
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
    title_fr: 'Cessation d’emploi au Québec — Loi sur les normes du travail',
    content:
      'Under Québec\'s Act Respecting Labour Standards (ARLS/LNT), employees with 3+ months of uninterrupted service are entitled to a notice of termination or pay in lieu: 1 week (3 months–1 year), 2 weeks (1–5 years), 4 weeks (5–10 years), 8 weeks (10+ years). Employees with 2+ years may file a complaint for dismissal without good and sufficient cause (reinstatement available).',
    content_fr:
      'En vertu de la Loi sur les normes du travail (LNT) du Québec, le salarié qui justifie de 3 mois de service continu a droit à un préavis de cessation d’emploi ou à une indemnité qui en tient lieu : 1 semaine (3 mois à 1 an), 2 semaines (1 à 5 ans), 4 semaines (5 à 10 ans), 8 semaines (10 ans et plus). Le salarié qui justifie de 2 ans de service continu peut déposer une plainte pour congédiement sans cause juste et suffisante (la réintégration est possible).',
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
    title_fr: 'Harcèlement psychologique au Québec — LNT art. 81.18 à 81.20',
    content:
      'Québec has had explicit statutory protection against psychological harassment since 2004. The ARLS defines it as vexatious conduct that is repeated, hostile or unwanted, affecting dignity or psychological integrity, and creating a harmful work environment. A single serious incident may qualify. Employers must take reasonable means to prevent and stop harassment. Complaints are filed with the CNESST within 2 years.',
    content_fr:
      'Le Québec protège explicitement contre le harcèlement psychologique depuis 2004. La LNT le définit comme une conduite vexatoire se manifestant par des comportements, des paroles, des actes ou des gestes répétés, hostiles ou non désirés, qui portent atteinte à la dignité ou à l’intégrité psychologique de la personne et entraînent un milieu de travail néfaste. Une seule conduite grave peut aussi constituer du harcèlement. L’employeur doit prendre les moyens raisonnables pour prévenir le harcèlement et le faire cesser. Les plaintes se déposent à la CNESST dans un délai de 2 ans.',
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
    title_fr: 'Obligation d’accommodement au Québec — Charte des droits et libertés de la personne',
    content:
      'In Québec, the duty to accommodate flows from the Charter of Human Rights and Freedoms (not the Human Rights Code). Protected grounds include handicap, sex, pregnancy, civil status, and more. The Commission des droits de la personne et des droits de la jeunesse (CDPDJ) is the enforcement body.',
    content_fr:
      'Au Québec, l’obligation d’accommodement découle de la Charte des droits et libertés de la personne (et non d’un « code » des droits de la personne). Les motifs protégés comprennent le handicap, le sexe, la grossesse, l’état civil et d’autres. La Commission des droits de la personne et des droits de la jeunesse (CDPDJ) est l’organisme chargé de l’application.',
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
    title_fr: 'Congé parental au Québec — RQAP',
    content:
      'Québec operates its own parental insurance plan (QPIP/RQAP) which provides more generous benefits than federal EI: maternity (18 weeks standard or 15 weeks special plan), paternity (5 weeks), parental (up to 32 weeks shared). Benefits begin immediately with no 2-week waiting period. All employees in QC contribute to QPIP, not EI maternity/parental.',
    content_fr:
      'Le Québec administre son propre régime d’assurance parentale (RQAP), qui offre des prestations plus généreuses que l’assurance-emploi fédérale : maternité (18 semaines au régime de base ou 15 semaines au régime particulier), paternité (5 semaines), parental (jusqu’à 32 semaines partageables). Les prestations débutent sans délai de carence de 2 semaines. Au Québec, les salariés cotisent au RQAP plutôt qu’au volet maternité/parental de l’assurance-emploi.',
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
    title_fr: 'Interdiction des représailles au Québec — LNT',
    content:
      'The ARLS prohibits reprisals against employees who exercise rights under the Act, including filing CNESST complaints or participating in investigations. Sanctions include reinstatement and damages. The CNESST enforces reprisal complaints.',
    content_fr:
      'La LNT interdit les représailles (pratiques interdites) contre un salarié qui exerce un droit prévu par la Loi, notamment déposer une plainte à la CNESST ou participer à une enquête. Les sanctions comprennent la réintégration et des dommages-intérêts. La CNESST traite les plaintes pour pratiques interdites.',
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
    title_fr: 'Santé et sécurité du travail au Québec — Loi sur la santé et la sécurité du travail',
    content:
      'Québec\'s LSST gives workers the right to refuse work they have reasonable grounds to believe poses danger. Workers also have a right to preventive withdrawal for pregnant workers. The CNESST administers OHS in Québec. Employers must establish a prevention program and a joint OHS committee if they have 20+ employees.',
    content_fr:
      'La LSST du Québec confère au travailleur le droit de refuser d’exécuter un travail s’il a des motifs raisonnables de croire que celui-ci présente un danger. La travailleuse enceinte a aussi droit au retrait préventif. La CNESST administre la santé et la sécurité du travail au Québec. L’employeur doit mettre en place un programme de prévention et, s’il compte 20 travailleurs ou plus, un comité de santé et de sécurité.',
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
    title_fr: 'Salaire, heures, temps supplémentaire et jours fériés au Québec — Loi sur les normes du travail',
    content:
      'Under Québec\'s Act Respecting Labour Standards (LNT), the CNESST sets a general minimum wage that is reviewed annually (changes typically take effect May 1), with a separate lower rate for tipped employees — confirm the current rate with the CNESST rather than assuming a figure. The standard work week is 40 hours, after which overtime is payable at 1.5 times the regular wage (time off in lieu is possible by agreement). Annual leave increases with service: after one year of uninterrupted service, two weeks with vacation pay of 4%; after three years, three weeks at 6%. The LNT also provides statutory general holidays, in addition to the National Holiday (June 24).',
    content_fr:
      'En vertu de la Loi sur les normes du travail (LNT) du Québec, la CNESST fixe un salaire minimum général révisé chaque année (les changements prennent généralement effet le 1er mai), avec un taux distinct plus bas pour les salariés au pourboire — confirmez le taux courant auprès de la CNESST plutôt que de le présumer. La semaine normale de travail est de 40 heures; au-delà, le temps supplémentaire est payé à 1,5 fois le salaire horaire habituel (une reprise de temps est possible sur entente). Le congé annuel augmente avec l’ancienneté : après un an de service continu, deux semaines avec une indemnité de 4 %; après trois ans, trois semaines à 6 %. La LNT prévoit aussi des jours fériés, chômés et payés, en plus de la Fête nationale (24 juin).',
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
    title_fr: 'Renseignements médicaux et limitations fonctionnelles au Québec — Charte et Loi 25',
    content:
      'In Québec, the duty to accommodate flows from the Charter of Human Rights and Freedoms. An employer may request the functional information needed to assess accommodation, not the diagnosis. Employee personal information — including health information — is protected by the Act respecting the protection of personal information in the private sector (modernized by Law 25), which requires a serious and legitimate purpose for collection, consent or legal authority, confidentiality, and access limited to those who need it. Keep medical information to the functional limitations relevant to the job.',
    content_fr:
      'Au Québec, l’obligation d’accommodement découle de la Charte des droits et libertés de la personne. L’employeur peut demander les renseignements fonctionnels nécessaires pour évaluer l’accommodement, et non le diagnostic. Les renseignements personnels du salarié — y compris les renseignements de santé — sont protégés par la Loi sur la protection des renseignements personnels dans le secteur privé (modernisée par la Loi 25), qui exige un intérêt sérieux et légitime pour la collecte, le consentement ou une autorisation légale, la confidentialité, et un accès limité aux personnes qui en ont besoin. Limitez les renseignements médicaux aux limitations fonctionnelles pertinentes à l’emploi.',
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
