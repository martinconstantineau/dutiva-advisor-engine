export type Locale = 'en' | 'fr';

export type SupportedJurisdiction = 'FEDERAL' | 'ON' | 'QC';
export type ComingSoonJurisdiction = 'BC' | 'AB';
export type FutureJurisdiction = 'MB' | 'NB' | 'NL' | 'NS' | 'NT' | 'NU' | 'PE' | 'SK' | 'YT';

export type Province =
  | SupportedJurisdiction
  | ComingSoonJurisdiction
  | FutureJurisdiction;

export type JurisdictionStatus = 'supported' | 'coming_soon' | 'not_yet_available';

export const JURISDICTION_STATUS: Record<Province, JurisdictionStatus> = {
  FEDERAL: 'supported',
  ON: 'supported',
  QC: 'supported',
  BC: 'coming_soon',
  AB: 'coming_soon',
  MB: 'not_yet_available',
  NB: 'not_yet_available',
  NL: 'not_yet_available',
  NS: 'not_yet_available',
  NT: 'not_yet_available',
  NU: 'not_yet_available',
  PE: 'not_yet_available',
  SK: 'not_yet_available',
  YT: 'not_yet_available',
};

export const SUPPORTED_JURISDICTIONS: SupportedJurisdiction[] = ['FEDERAL', 'ON', 'QC'];

export type AdvisorIntent =
  | 'general_hr_compliance'
  | 'document_drafting'
  | 'employee_medical_or_accommodation'
  | 'personal_mental_health'
  | 'personal_wellbeing'
  | 'possible_crisis_or_self_harm'
  | 'harassment_or_workplace_violence'
  | 'termination_or_discipline'
  | 'leave_or_absence'
  | 'pay_hours_or_entitlements'
  | 'privacy_or_confidentiality'
  | 'out_of_scope'
  | 'ambiguous';

/**
 * Internal response mode — what the engine actually does.
 * This is set by the deterministic router, not directly by the client.
 */
export type AdvisorResponseMode =
  | 'supportive_triage'
  | 'hr_compliance_advisor'
  | 'high_risk_escalation'
  | 'document_drafting'
  | 'legal_issue_spotting'
  | 'out_of_scope_redirect';

/**
 * Requested advisor mode — the client hint.
 * Default is "hr_compliance". The router may override this.
 */
export type RequestedAdvisorMode =
  | 'hr_compliance'
  | 'legal_issue_spotting'
  | 'document_drafting'
  | 'supportive_triage';

export type ComplianceRisk = 'low' | 'medium' | 'high' | 'critical';
export type SafetyRisk = 'none' | 'watch' | 'urgent' | 'critical';
export type ProfessionalReviewType = 'hr' | 'legal' | 'medical' | 'emergency' | 'union' | 'none';
export type JurisdictionStatusLabel = 'known' | 'unknown' | 'assumed' | 'not_applicable';
export type CitationValidationStatus = 'valid' | 'requires_review' | 'suppressed';
export type MatchLabel = 'High match' | 'Medium match' | 'Low match';
export type Surface = 'advisor_chat' | 'workspace' | 'hybrid';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AdvisorRoute {
  intent: AdvisorIntent;
  responseMode: AdvisorResponseMode;
  surface: Surface;
  retrievalAllowed: boolean;
  workspaceAllowed: boolean;
  legalBasisAllowed: boolean;
  suggestedDocumentsAllowed: boolean;
  /**
   * Final effective rendering gate for public web-search sources.
   *
   * True ONLY when ALL of the following hold for this specific response:
   *   - Intent is HR/compliance-eligible (not personal/crisis/out-of-scope/ambiguous/document_drafting)
   *   - options.enableWebSearch was true in the request
   *   - WEB_SEARCH_ENABLED=true globally
   *   - Startpage endpoint and API key are configured
   *   - The query requires current/external information
   *
   * The consuming app MUST check this before rendering any webSearch results.
   * If false, the public webSearch field will be absent.
   * Never carry webSearch results from a prior turn when the current turn's gate is false.
   */
  webSearchAllowed: boolean;
}

export interface AdvisorJurisdiction {
  status: JurisdictionStatusLabel;
  province?: Province | null;
  employerProvince?: Province | null;
  /** null means unknown — do not treat as false/non-federal */
  isFederallyRegulated?: boolean | null;
  remoteWork?: boolean;
  notes: string[];
}

export interface AdvisorRisk {
  compliance: ComplianceRisk;
  safety: SafetyRisk;
}

export interface AdvisorProfessionalReview {
  recommended: boolean;
  type: ProfessionalReviewType;
  reason?: string;
}

export interface AdvisorLegalBasisItem {
  label: string;
  citation: string;
  jurisdiction: Province | 'FED' | 'CA';
  sourceType: 'statute' | 'regulation' | 'agency_guidance' | 'internal_guidance';
  validationStatus: CitationValidationStatus;
  sourceId?: string;
  qualityWarning?: string;
}

export interface AdvisorRetrievedGuidanceItem {
  topic: string;
  matchLabel: MatchLabel;
  jurisdiction?: string;
  qualityWarnings: string[];
}

export interface AdvisorSuggestedDocument {
  title: string;
  description?: string;
  documentType?: string;
}

export interface AdvisorWorkspacePayload {
  summary?: string;
  guidance?: string;
  missingFacts?: string[];
  immediateSteps?: string[];
  documentationSteps?: string[];
  confidentialityNotes?: string[];
  antiReprisalNotes?: string[];
  legalBasis?: AdvisorLegalBasisItem[];
  retrievedGuidance?: AdvisorRetrievedGuidanceItem[];
  suggestedDocuments?: AdvisorSuggestedDocument[];
  followUpQuestions?: string[];
  warnings?: string[];
}

export interface AdvisorQuality {
  markdownCleaned: boolean;
  citationsValidated: boolean;
  blockedRendering: string[];
  warnings: string[];
}

export interface AdvisorDebugInfo {
  matchedPlaybooks?: string[];
  retrievalMatchLabels?: string[];
  blockedRendering?: string[];
  routeReasons?: string[];
  /** Internal: whether the intent was generally eligible for legal basis before jurisdiction/conflict gating */
  legalBasisEligibleByIntent?: boolean;
  /** Raw LLM-generated citations withheld from public legalBasis because they are unvetted. Debug only. */
  unvettedCitations?: string[];
  /** Web search debug details — only present when includeDebug is true */
  webSearch?: {
    query?: string;
    resultCount?: number;
    warnings?: string[];
  };
}

/**
 * Web search metadata returned in the public response.
 * Only present when route.webSearchAllowed is true and web search ran.
 */
export interface AdvisorWebSearchMeta {
  used: boolean;
  provider: 'startpage';
  query?: string;
  results?: Array<{
    title: string;
    url: string;
    snippet?: string;
    sourceDomain: string;
    retrievedAt: string;
    publishedAt?: string | null;
    sourceType: string;
    validationStatus: string;
    qualityWarnings: string[];
  }>;
  warnings: string[];
}

export interface AdvisorResponse {
  sessionId: string;
  locale: Locale;
  conversationalResponse: string;
  route: AdvisorRoute;
  jurisdiction: AdvisorJurisdiction;
  risk: AdvisorRisk;
  professionalReview: AdvisorProfessionalReview;
  workspace?: AdvisorWorkspacePayload;
  /** Web search metadata — present only when route.webSearchAllowed and web search ran */
  webSearch?: AdvisorWebSearchMeta;
  quality: AdvisorQuality;
  isCrisis: boolean;
  debug?: AdvisorDebugInfo;
}

/** Internal pipeline context (not returned to callers) */
export interface AdvisorPipelineContext {
  sessionId: string;
  userMessage: string;
  history: ConversationTurn[];
  locale: Locale;
  province: Province | null;
  employerProvince: Province | null;
  remoteWork: boolean;
  /** Internal response mode hint — set by request handler from RequestedAdvisorMode */
  mode: AdvisorResponseMode;
  employerContext?: string;
  employeeCount?: number | null;
  /** null = unknown, true = known federal, false = known non-federal */
  isFederallyRegulated: boolean | null;
  unionized: boolean | null;
  userRole?: 'owner' | 'hr' | 'manager' | 'employee' | 'unknown';
  companyName?: string;
  industry?: string | null;
  enableRetrieval: boolean;
  enableWorkspacePayload: boolean;
  enableDrafting: boolean;
  /**
   * Whether real-time web search is permitted for this request.
   * Both WEB_SEARCH_ENABLED (global) and this flag must be true for web search to run.
   */
  enableWebSearch: boolean;
  includeDebug: boolean;
  timestamp: string;
  /** Detected context conflicts — populated by the request handler */
  contextConflicts?: string[];
}

/** Legacy WorkspacePayload — kept as alias for existing code that imports it */
export type WorkspacePayload = AdvisorPipelineContext;
