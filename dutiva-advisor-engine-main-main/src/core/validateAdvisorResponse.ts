import {
  AdvisorResponse,
  AdvisorRoute,
  AdvisorJurisdiction,
  AdvisorRisk,
  AdvisorProfessionalReview,
  AdvisorQuality,
  AdvisorWorkspacePayload,
} from '../workspace/workspaceTypes';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateRoute(route: unknown): string[] {
  const errors: string[] = [];
  if (!route || typeof route !== 'object') { errors.push('route is missing'); return errors; }
  const r = route as Partial<AdvisorRoute>;
  if (!r.intent) errors.push('route.intent is missing');
  if (!r.responseMode) errors.push('route.responseMode is missing');
  if (!r.surface) errors.push('route.surface is missing');
  if (typeof r.retrievalAllowed !== 'boolean') errors.push('route.retrievalAllowed must be boolean');
  if (typeof r.workspaceAllowed !== 'boolean') errors.push('route.workspaceAllowed must be boolean');
  if (typeof r.legalBasisAllowed !== 'boolean') errors.push('route.legalBasisAllowed must be boolean');
  if (typeof r.suggestedDocumentsAllowed !== 'boolean') errors.push('route.suggestedDocumentsAllowed must be boolean');
  return errors;
}

function validateJurisdiction(j: unknown): string[] {
  const errors: string[] = [];
  if (!j || typeof j !== 'object') { errors.push('jurisdiction is missing'); return errors; }
  const jj = j as Partial<AdvisorJurisdiction>;
  const validStatuses = ['known', 'unknown', 'assumed', 'not_applicable'];
  if (!jj.status || !validStatuses.includes(jj.status)) {
    errors.push(`jurisdiction.status must be one of: ${validStatuses.join(', ')}`);
  }
  if (!Array.isArray(jj.notes)) errors.push('jurisdiction.notes must be an array');
  return errors;
}

function validateRisk(risk: unknown): string[] {
  const errors: string[] = [];
  if (!risk || typeof risk !== 'object') { errors.push('risk is missing'); return errors; }
  const r = risk as Partial<AdvisorRisk>;
  const complianceValues = ['low', 'medium', 'high', 'critical'];
  const safetyValues = ['none', 'watch', 'urgent', 'critical'];
  if (!r.compliance || !complianceValues.includes(r.compliance)) {
    errors.push(`risk.compliance must be one of: ${complianceValues.join(', ')}`);
  }
  if (!r.safety || !safetyValues.includes(r.safety)) {
    errors.push(`risk.safety must be one of: ${safetyValues.join(', ')}`);
  }
  return errors;
}

function validateProfessionalReview(pr: unknown): string[] {
  const errors: string[] = [];
  if (!pr || typeof pr !== 'object') { errors.push('professionalReview is missing'); return errors; }
  const p = pr as Partial<AdvisorProfessionalReview>;
  if (typeof p.recommended !== 'boolean') errors.push('professionalReview.recommended must be boolean');
  const validTypes = ['hr', 'legal', 'medical', 'emergency', 'union', 'none'];
  if (!p.type || !validTypes.includes(p.type)) {
    errors.push(`professionalReview.type must be one of: ${validTypes.join(', ')}`);
  }
  return errors;
}

export function validateAdvisorResponse(response: unknown): ValidationResult {
  const errors: string[] = [];

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['response is not an object'] };
  }
  const r = response as Partial<AdvisorResponse>;

  if (!r.sessionId || typeof r.sessionId !== 'string') errors.push('sessionId is missing');
  if (!r.locale || !['en', 'fr'].includes(r.locale)) errors.push('locale must be "en" or "fr"');
  if (!r.conversationalResponse || typeof r.conversationalResponse !== 'string' || r.conversationalResponse.trim().length === 0) {
    errors.push('conversationalResponse is empty');
  }
  if (typeof r.isCrisis !== 'boolean') errors.push('isCrisis must be boolean');

  errors.push(...validateRoute(r.route));
  errors.push(...validateJurisdiction(r.jurisdiction));
  errors.push(...validateRisk(r.risk));
  errors.push(...validateProfessionalReview(r.professionalReview));

  if (!r.quality || typeof r.quality !== 'object') {
    errors.push('quality is missing');
  } else {
    const q = r.quality as Partial<AdvisorQuality>;
    if (typeof q.markdownCleaned !== 'boolean') errors.push('quality.markdownCleaned must be boolean');
    if (typeof q.citationsValidated !== 'boolean') errors.push('quality.citationsValidated must be boolean');
    if (!Array.isArray(q.blockedRendering)) errors.push('quality.blockedRendering must be an array');
    if (!Array.isArray(q.warnings)) errors.push('quality.warnings must be an array');
  }

  // Gate consistency: workspace and gated fields must not appear when their route gates are false
  const route = r.route as Partial<AdvisorRoute> | undefined;
  const workspace = r.workspace as Partial<AdvisorWorkspacePayload> | undefined;
  if (route) {
    if (workspace && route.workspaceAllowed === false) {
      errors.push('workspace present but route.workspaceAllowed is false');
    }
    if (workspace?.legalBasis && workspace.legalBasis.length > 0 && route.legalBasisAllowed === false) {
      errors.push('workspace.legalBasis present but route.legalBasisAllowed is false');
    }
    if (workspace?.retrievedGuidance && workspace.retrievedGuidance.length > 0 && route.retrievalAllowed === false) {
      errors.push('workspace.retrievedGuidance present but route.retrievalAllowed is false');
    }
    if (workspace?.suggestedDocuments && workspace.suggestedDocuments.length > 0 && route.suggestedDocumentsAllowed === false) {
      errors.push('workspace.suggestedDocuments present but route.suggestedDocumentsAllowed is false');
    }
  }

  return { valid: errors.length === 0, errors };
}
