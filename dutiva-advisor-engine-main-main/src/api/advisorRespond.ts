import { Request, Response } from 'express';
import { AdvisorRequestSchema, AdvisorResponseSchema } from './schemas';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import { composeAdvisorResponse } from '../core/composeAdvisorResponse';
import { parseProvince } from '../core/normalizeProvince';
import { sanitizeProviderError } from '../llm/qwenProvider';
import { JURISDICTION_STATUS } from '../workspace/workspaceTypes';
import type { Province } from '../workspace/workspaceTypes';

/**
 * Detect conflicts between request-level, companyContext-level, and userContext-level fields.
 * Returns an array of human-readable conflict notes.
 */
function detectContextConflicts(
  province: Province | null,
  employerProvince: Province | null,
  companyProvince: Province | null,
  userPreferredProvince: Province | null,
  isFederallyRegulated: boolean | null,
  companyFederalJurisdiction: boolean | null | undefined,
): string[] {
  const conflicts: string[] = [];

  if (
    province !== null &&
    companyProvince !== null &&
    province !== companyProvince
  ) {
    conflicts.push(
      `Conflicting jurisdiction context: request province is ${province} but companyContext.province is ${companyProvince}. The applicable jurisdiction should be confirmed before relying on province-specific guidance.`,
    );
  }

  if (
    province !== null &&
    userPreferredProvince !== null &&
    province !== userPreferredProvince
  ) {
    conflicts.push(
      `Conflicting province context: request province is ${province} but userContext.preferredProvince is ${userPreferredProvince}. The applicable jurisdiction should be confirmed.`,
    );
  }

  if (
    isFederallyRegulated !== null &&
    companyFederalJurisdiction !== null &&
    companyFederalJurisdiction !== undefined &&
    isFederallyRegulated !== companyFederalJurisdiction
  ) {
    conflicts.push(
      `Conflicting federal jurisdiction: request isFederallyRegulated is ${isFederallyRegulated} but companyContext.federalJurisdiction is ${companyFederalJurisdiction}. Federal status should be confirmed.`,
    );
  }

  if (
    employerProvince !== null &&
    companyProvince !== null &&
    employerProvince !== companyProvince
  ) {
    conflicts.push(
      `Conflicting employer province: request employerProvince is ${employerProvince} but companyContext.province is ${companyProvince}. Employer location should be confirmed.`,
    );
  }

  return conflicts;
}

/**
 * Resolve federal jurisdiction status using context precedence:
 * 1. Explicit request field (isFederallyRegulated)
 * 2. companyContext.federalJurisdiction
 * 3. null (unknown)
 */
function resolveFederalStatus(
  requestField: boolean | null,
  companyField: boolean | null | undefined,
): boolean | null {
  if (requestField !== null) return requestField;
  if (companyField !== null && companyField !== undefined) return companyField;
  return null;
}

/**
 * Detect an explicit jurisdiction stated in a single block of free text.
 * Province mentions take precedence over federal signals within the same text.
 * Federal is only inferred from explicit signals, never a generic "Canada".
 * Returns null when no explicit jurisdiction is stated.
 */
function detectProvinceInText(text: string): Province | null {
  const provincePatterns: [RegExp, Province][] = [
    [/\bontario\b/i, 'ON'],
    [/\bquebec\b|\bquébec\b/i, 'QC'],
  ];
  for (const [pattern, province] of provincePatterns) {
    if (pattern.test(text)) return province;
  }
  // Federal must come from explicit signals, not generic "Canada".
  const federalSignals = [
    /\bcanada labour code\b/i,
    /\bfederal jurisdiction\b/i,
    /\bfederally regulated\b/i,
    /\bclc\b/i,
    /\bfederal\b/i,
  ];
  for (const pattern of federalSignals) {
    if (pattern.test(text)) return 'FEDERAL';
  }
  return null;
}

/**
 * Extract a province from prior conversation history as a last-resort fallback.
 * Scans user turns newest-first and returns the first explicit jurisdiction found.
 */
function extractProvinceFromHistory(history: { role: 'user' | 'assistant'; content: string }[]): Province | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== 'user') continue;
    const detected = detectProvinceInText(turn.content);
    if (detected) return detected;
  }
  return null;
}

export async function advisorRespond(req: Request, res: Response): Promise<void> {
  const parseResult = AdvisorRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const data = parseResult.data;

  // Resolve raw context sources — null means unknown, never default to ON
  const requestProvince: Province | null = data.province ? parseProvince(data.province) : null;
  const employerProvince: Province | null = data.employerProvince ? parseProvince(data.employerProvince) : null;
  const companyProvince: Province | null = data.companyContext?.province
    ? parseProvince(data.companyContext.province)
    : null;
  const userPreferredProvince: Province | null = data.userContext?.preferredProvince
    ? parseProvince(data.userContext.preferredProvince)
    : null;
  const messageProvince: Province | null = detectProvinceInText(data.userMessage);
  const historyProvince: Province | null = extractProvinceFromHistory(data.history);

  // Context precedence for employee province:
  // 1. Explicit request province
  // 2. companyContext.province
  // 3. userContext.preferredProvince
  // 4. Explicit jurisdiction stated in the current message
  // 5. Conversation history
  // 6. null (unknown)
  const employeeProvince: Province | null =
    requestProvince ?? companyProvince ?? userPreferredProvince ?? messageProvince ?? historyProvince;

  // Validate supported jurisdictions — only when province is explicitly known
  if (employeeProvince !== null) {
    const status = JURISDICTION_STATUS[employeeProvince];
    if (status !== 'supported') {
      const message =
        status === 'coming_soon'
          ? `Jurisdiction ${employeeProvince} is coming soon. Dutiva currently supports FEDERAL, ON, and QC.`
          : `Jurisdiction ${employeeProvince} is not yet available. Dutiva currently supports FEDERAL, ON, and QC.`;
      res.status(422).json({
        error: 'Unsupported jurisdiction',
        jurisdiction: employeeProvince,
        status,
        message,
      });
      return;
    }
  }

  // Context precedence for employer province:
  // 1. Explicit request employerProvince
  // 2. companyContext.province
  // 3. null (unknown)
  const resolvedEmployerProvince: Province | null = employerProvince ?? companyProvince;

  const isFederallyRegulated = resolveFederalStatus(
    data.isFederallyRegulated,
    data.companyContext?.federalJurisdiction,
  );

  // Detect context conflicts — do not silently resolve them
  const contextConflicts = detectContextConflicts(
    requestProvince,
    employerProvince,
    companyProvince,
    userPreferredProvince,
    data.isFederallyRegulated,
    data.companyContext?.federalJurisdiction,
  );

  const ctx = buildPipelineContext({
    sessionId: data.sessionId,
    userMessage: data.userMessage,
    history: data.history,
    locale: data.locale,
    province: employeeProvince,
    employerProvince: resolvedEmployerProvince,
    remoteWork: data.remoteWork,
    mode: data.mode,
    employerContext: data.employerContext,
    employeeCount: data.employeeCount ?? data.companyContext?.employeeCount ?? null,
    isFederallyRegulated,
    unionized: data.unionized,
    userRole: data.userContext?.role,
    companyName: data.companyContext?.name,
    industry: data.companyContext?.industry ?? null,
    enableRetrieval: data.options?.enableRetrieval ?? true,
    enableWorkspacePayload: data.options?.enableWorkspacePayload ?? true,
    enableDrafting: data.options?.enableDrafting ?? true,
    // Default false — both global WEB_SEARCH_ENABLED and per-request flag must be true
    enableWebSearch: data.options?.enableWebSearch ?? false,
    includeDebug: data.options?.includeDebug ?? false,
    contextConflicts: contextConflicts.length > 0 ? contextConflicts : undefined,
  });

  try {
    const response = await composeAdvisorResponse(ctx);

    // Runtime contract validation: every successful response must match the final AdvisorResponse schema
    const responseValidation = AdvisorResponseSchema.safeParse(response);
    if (!responseValidation.success) {
      console.error('[advisorRespond] Response validation failed:', responseValidation.error.errors);
      res.status(500).json({ error: 'Advisor engine error', message: 'An internal error occurred.' });
      return;
    }

    res.status(200).json(response);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Unknown error';
    const safeMessage = sanitizeProviderError(rawMessage);
    console.error('[advisorRespond] Error:', safeMessage);
    res.status(500).json({ error: 'Advisor engine error', message: 'An internal error occurred.' });
  }
}
