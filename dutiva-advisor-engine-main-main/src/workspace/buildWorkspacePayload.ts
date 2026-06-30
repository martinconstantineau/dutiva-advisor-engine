import {
  AdvisorPipelineContext,
  ConversationTurn,
  Locale,
  Province,
  AdvisorResponseMode,
  RequestedAdvisorMode,
} from './workspaceTypes';

export interface BuildContextOptions {
  sessionId: string;
  userMessage: string;
  history?: ConversationTurn[];
  locale?: Locale;
  province?: Province | null;
  employerProvince?: Province | null;
  remoteWork?: boolean;
  /** Requested advisor mode — will be resolved to an internal response mode */
  mode?: RequestedAdvisorMode;
  employerContext?: string;
  employeeCount?: number | null;
  /** null = unknown, true = known federal, false = known non-federal */
  isFederallyRegulated?: boolean | null;
  unionized?: boolean | null;
  userRole?: 'owner' | 'hr' | 'manager' | 'employee' | 'unknown';
  companyName?: string;
  industry?: string | null;
  enableRetrieval?: boolean;
  enableWorkspacePayload?: boolean;
  enableDrafting?: boolean;
  /**
   * Whether real-time web search is permitted for this request.
   * Defaults to false — safe by default. Set to true only when the consuming
   * app explicitly enables it and WEB_SEARCH_ENABLED=true globally.
   */
  enableWebSearch?: boolean;
  includeDebug?: boolean;
  contextConflicts?: string[];
}

/**
 * Map requested advisor mode (client-facing) to internal response mode hint.
 * The deterministic router will override this for crisis, personal wellness,
 * out-of-scope, and high-risk routes.
 */
const REQUESTED_TO_RESPONSE_MODE: Record<RequestedAdvisorMode, AdvisorResponseMode> = {
  hr_compliance: 'hr_compliance_advisor',
  legal_issue_spotting: 'legal_issue_spotting',
  document_drafting: 'document_drafting',
  supportive_triage: 'supportive_triage',
};

function resolveMode(raw?: string): AdvisorResponseMode {
  if (!raw) return 'hr_compliance_advisor';
  return REQUESTED_TO_RESPONSE_MODE[raw as RequestedAdvisorMode] ?? 'hr_compliance_advisor';
}

export function buildPipelineContext(options: BuildContextOptions): AdvisorPipelineContext {
  return {
    sessionId: options.sessionId,
    userMessage: options.userMessage,
    history: options.history ?? [],
    locale: options.locale ?? 'en',
    province: options.province ?? null,
    employerProvince: options.employerProvince ?? null,
    remoteWork: options.remoteWork ?? false,
    mode: resolveMode(options.mode),
    employerContext: options.employerContext,
    employeeCount: options.employeeCount ?? null,
    // null = unknown — do not default to false
    isFederallyRegulated: options.isFederallyRegulated ?? null,
    unionized: options.unionized ?? null,
    userRole: options.userRole,
    companyName: options.companyName,
    industry: options.industry ?? null,
    enableRetrieval: options.enableRetrieval ?? true,
    enableWorkspacePayload: options.enableWorkspacePayload ?? true,
    enableDrafting: options.enableDrafting ?? true,
    // Default false — web search must be explicitly enabled per request
    enableWebSearch: options.enableWebSearch ?? false,
    includeDebug: options.includeDebug ?? false,
    timestamp: new Date().toISOString(),
    contextConflicts: options.contextConflicts,
  };
}

/** @deprecated Use buildPipelineContext */
export const buildWorkspacePayload = buildPipelineContext;
