import { z } from 'zod';

export const ALL_PROVINCES = [
  'FEDERAL', 'ON', 'QC', 'BC', 'AB',
  'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'PE', 'SK', 'YT',
] as const;

/**
 * Requested advisor mode — client hint only.
 * The deterministic router will override this for crisis, personal wellness,
 * out-of-scope, and high-risk routes.
 * Default: "hr_compliance"
 */
export const RequestedAdvisorModeSchema = z.enum([
  'hr_compliance',
  'legal_issue_spotting',
  'document_drafting',
  'supportive_triage',
]);

export const AdvisorRequestSchema = z.object({
  sessionId: z.string().min(1),
  userMessage: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .optional()
    .default([]),
  locale: z.enum(['en', 'fr']).optional().default('en'),

  // Province defaults to null — never silently assumed
  province: z.enum(ALL_PROVINCES).nullable().optional().default(null),
  employerProvince: z.enum(ALL_PROVINCES).nullable().optional().default(null),
  remoteWork: z.boolean().optional().default(false),

  /**
   * Requested advisor mode — hint only.
   * Default is "hr_compliance", not "hr_compliance_advisor" (the internal response mode).
   */
  mode: RequestedAdvisorModeSchema.optional().default('hr_compliance'),

  employerContext: z.string().optional(),
  employeeCount: z.number().int().positive().nullable().optional(),

  /**
   * Federal jurisdiction status.
   * true = known federally regulated
   * false = known NOT federally regulated
   * null / undefined = unknown — do not assume
   */
  isFederallyRegulated: z.boolean().nullable().optional().default(null),

  unionized: z.boolean().nullable().optional().default(null),

  userContext: z
    .object({
      role: z.enum(['owner', 'hr', 'manager', 'employee', 'unknown']).optional(),
      preferredProvince: z.enum(ALL_PROVINCES).nullable().optional(),
    })
    .optional(),

  companyContext: z
    .object({
      name: z.string().optional(),
      province: z.enum(ALL_PROVINCES).nullable().optional(),
      /**
       * Federal jurisdiction status for the company.
       * true = known federal, false = known non-federal, null/undefined = unknown.
       */
      federalJurisdiction: z.boolean().nullable().optional(),
      employeeCount: z.number().int().positive().nullable().optional(),
      industry: z.string().nullable().optional(),
    })
    .optional(),

  options: z
    .object({
      enableRetrieval: z.boolean().optional().default(true),
      enableWorkspacePayload: z.boolean().optional().default(true),
      enableDrafting: z.boolean().optional().default(true),
      /**
       * Per-request web search enable flag.
       * Both WEB_SEARCH_ENABLED=true (global) and enableWebSearch=true (per-request) must be set.
       * Defaults to false — safe default, no unexpected outbound calls.
       */
      enableWebSearch: z.boolean().optional().default(false),
      includeDebug: z.boolean().optional().default(false),
    })
    .optional()
    .default({}),
});

export type AdvisorRequestDto = z.infer<typeof AdvisorRequestSchema>;
export type RequestedAdvisorModeDto = z.infer<typeof RequestedAdvisorModeSchema>;

// ─── Response schemas ───────────────────────────────────────────────────────

const AdvisorIntentSchema = z.enum([
  'general_hr_compliance',
  'document_drafting',
  'employee_medical_or_accommodation',
  'personal_mental_health',
  'personal_wellbeing',
  'possible_crisis_or_self_harm',
  'harassment_or_workplace_violence',
  'termination_or_discipline',
  'leave_or_absence',
  'pay_hours_or_entitlements',
  'privacy_or_confidentiality',
  'out_of_scope',
  'ambiguous',
]);

const AdvisorResponseModeSchema = z.enum([
  'supportive_triage',
  'hr_compliance_advisor',
  'high_risk_escalation',
  'document_drafting',
  'legal_issue_spotting',
  'out_of_scope_redirect',
]);

const SurfaceSchema = z.enum(['advisor_chat', 'workspace', 'hybrid']);

const ComplianceRiskSchema = z.enum(['low', 'medium', 'high', 'critical']);
const SafetyRiskSchema = z.enum(['none', 'watch', 'urgent', 'critical']);
const ProfessionalReviewTypeSchema = z.enum(['hr', 'legal', 'medical', 'emergency', 'union', 'none']);
const JurisdictionStatusLabelSchema = z.enum(['known', 'unknown', 'assumed', 'not_applicable']);
const CitationValidationStatusSchema = z.enum(['valid', 'requires_review', 'suppressed']);
const MatchLabelSchema = z.enum(['High match', 'Medium match', 'Low match']);

const AdvisorRouteSchema = z.object({
  intent: AdvisorIntentSchema,
  responseMode: AdvisorResponseModeSchema,
  surface: SurfaceSchema,
  retrievalAllowed: z.boolean(),
  workspaceAllowed: z.boolean(),
  legalBasisAllowed: z.boolean(),
  suggestedDocumentsAllowed: z.boolean(),
  /** Gate: whether the consuming app may render web search sources for this response */
  webSearchAllowed: z.boolean(),
});

const AdvisorJurisdictionSchema = z.object({
  status: JurisdictionStatusLabelSchema,
  province: z.enum(ALL_PROVINCES).nullable().optional(),
  employerProvince: z.enum(ALL_PROVINCES).nullable().optional(),
  isFederallyRegulated: z.boolean().nullable().optional(),
  remoteWork: z.boolean().optional(),
  notes: z.array(z.string()),
});

const AdvisorRiskSchema = z.object({
  compliance: ComplianceRiskSchema,
  safety: SafetyRiskSchema,
});

const AdvisorProfessionalReviewSchema = z.object({
  recommended: z.boolean(),
  type: ProfessionalReviewTypeSchema,
  reason: z.string().optional(),
});

const AdvisorLegalBasisItemSchema = z.object({
  label: z.string(),
  citation: z.string(),
  jurisdiction: z.enum(ALL_PROVINCES).or(z.enum(['FED', 'CA'])),
  sourceType: z.enum(['statute', 'regulation', 'agency_guidance', 'internal_guidance']),
  validationStatus: CitationValidationStatusSchema,
  sourceId: z.string().optional(),
  qualityWarning: z.string().optional(),
});

const AdvisorRetrievedGuidanceItemSchema = z.object({
  topic: z.string(),
  matchLabel: MatchLabelSchema,
  jurisdiction: z.string().optional(),
  qualityWarnings: z.array(z.string()),
});

const AdvisorSuggestedDocumentSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  documentType: z.string().optional(),
});

const AdvisorWorkspacePayloadSchema = z.object({
  summary: z.string().optional(),
  guidance: z.string().optional(),
  missingFacts: z.array(z.string()).optional(),
  immediateSteps: z.array(z.string()).optional(),
  documentationSteps: z.array(z.string()).optional(),
  confidentialityNotes: z.array(z.string()).optional(),
  antiReprisalNotes: z.array(z.string()).optional(),
  legalBasis: z.array(AdvisorLegalBasisItemSchema).optional(),
  retrievedGuidance: z.array(AdvisorRetrievedGuidanceItemSchema).optional(),
  suggestedDocuments: z.array(AdvisorSuggestedDocumentSchema).optional(),
  followUpQuestions: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

const AdvisorQualitySchema = z.object({
  markdownCleaned: z.boolean(),
  citationsValidated: z.boolean(),
  blockedRendering: z.array(z.string()),
  warnings: z.array(z.string()),
});

const WebSearchValidationStatusSchema = z.enum(['valid', 'requires_review', 'suppressed']);

const WebSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string().optional(),
  sourceDomain: z.string(),
  retrievedAt: z.string(),
  publishedAt: z.string().nullable().optional(),
  sourceType: z.enum([
    'official_government',
    'court_or_tribunal',
    'legislation',
    'regulator_or_agency',
    'reputable_secondary',
    'general_web',
    'unknown',
  ]),
  validationStatus: WebSearchValidationStatusSchema,
  qualityWarnings: z.array(z.string()),
});

const AdvisorWebSearchMetaSchema = z.object({
  used: z.boolean(),
  provider: z.literal('startpage'),
  query: z.string().optional(),
  results: z.array(WebSearchResultSchema).optional(),
  warnings: z.array(z.string()),
});

const AdvisorDebugInfoSchema = z.object({
  matchedPlaybooks: z.array(z.string()).optional(),
  retrievalMatchLabels: z.array(z.string()).optional(),
  blockedRendering: z.array(z.string()).optional(),
  routeReasons: z.array(z.string()).optional(),
  legalBasisEligibleByIntent: z.boolean().optional(),
  /** Raw LLM-generated citations withheld from public legalBasis — debug only */
  unvettedCitations: z.array(z.string()).optional(),
  /** Web search debug info — only present when includeDebug is true */
  webSearch: z.object({
    query: z.string().optional(),
    resultCount: z.number().optional(),
    warnings: z.array(z.string()).optional(),
  }).optional(),
});

export const AdvisorResponseSchema = z.object({
  sessionId: z.string(),
  locale: z.enum(['en', 'fr']),
  conversationalResponse: z.string(),
  route: AdvisorRouteSchema,
  jurisdiction: AdvisorJurisdictionSchema,
  risk: AdvisorRiskSchema,
  professionalReview: AdvisorProfessionalReviewSchema,
  workspace: AdvisorWorkspacePayloadSchema.optional(),
  /** Web search metadata — present only when route.webSearchAllowed and web search ran */
  webSearch: AdvisorWebSearchMetaSchema.optional(),
  quality: AdvisorQualitySchema,
  isCrisis: z.boolean(),
  debug: AdvisorDebugInfoSchema.optional(),
});

export type AdvisorResponseDto = z.infer<typeof AdvisorResponseSchema>;
