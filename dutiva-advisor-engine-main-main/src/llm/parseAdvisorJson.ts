import { ComplianceRisk, SafetyRisk, ProfessionalReviewType } from '../workspace/workspaceTypes';

/** Raw structured output we ask the LLM to produce */
export interface AdvisorLLMOutput {
  conversationalResponse: string;
  summary: string;
  guidance: string;
  immediateSteps: string[];
  documentationSteps: string[];
  missingFacts: string[];
  followUpQuestions: string[];
  complianceRisk: ComplianceRisk;
  safetyRisk: SafetyRisk;
  professionalReviewType: ProfessionalReviewType;
  professionalReviewReason?: string;
  citationsUsed: string[];
}

/** Legacy shape kept for evals/backward-compat code that imports it */
export type RiskLevel = 'low' | 'medium' | 'high';
export interface AdvisorLLMResponse {
  summary: string;
  guidance: string;
  citations: string[];
  riskLevel: RiskLevel;
  recommendLawyer: boolean;
  followUpQuestions: string[];
}

const COMPLIANCE_RISKS = new Set<ComplianceRisk>(['low', 'medium', 'high', 'critical']);
const SAFETY_RISKS = new Set<SafetyRisk>(['none', 'watch', 'urgent', 'critical']);
const REVIEW_TYPES = new Set<ProfessionalReviewType>(['hr', 'legal', 'medical', 'emergency', 'union', 'none']);

function isComplianceRisk(v: unknown): v is ComplianceRisk {
  return typeof v === 'string' && COMPLIANCE_RISKS.has(v as ComplianceRisk);
}
function isSafetyRisk(v: unknown): v is SafetyRisk {
  return typeof v === 'string' && SAFETY_RISKS.has(v as SafetyRisk);
}
function isReviewType(v: unknown): v is ProfessionalReviewType {
  return typeof v === 'string' && REVIEW_TYPES.has(v as ProfessionalReviewType);
}
function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).filter((x): x is string => typeof x === 'string');
}

export function parseAdvisorLLMOutput(raw: string): AdvisorLLMOutput {
  let parsed: unknown;
  try {
    const jsonMatch = /\{[\s\S]*\}/.exec(raw);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return buildFallbackOutput(raw);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return buildFallbackOutput(raw);
  }

  const obj = parsed as Record<string, unknown>;

  return {
    conversationalResponse:
      typeof obj['conversationalResponse'] === 'string' && obj['conversationalResponse'].trim()
        ? obj['conversationalResponse']
        : typeof obj['guidance'] === 'string'
          ? obj['guidance']
          : raw,
    summary: typeof obj['summary'] === 'string' ? obj['summary'] : '',
    guidance: typeof obj['guidance'] === 'string' ? obj['guidance'] : '',
    immediateSteps: toStringArray(obj['immediateSteps']),
    documentationSteps: toStringArray(obj['documentationSteps']),
    missingFacts: toStringArray(obj['missingFacts']),
    followUpQuestions: toStringArray(obj['followUpQuestions']),
    complianceRisk: isComplianceRisk(obj['complianceRisk']) ? obj['complianceRisk'] : 'medium',
    safetyRisk: isSafetyRisk(obj['safetyRisk']) ? obj['safetyRisk'] : 'none',
    professionalReviewType: isReviewType(obj['professionalReviewType']) ? obj['professionalReviewType'] : 'none',
    professionalReviewReason: typeof obj['professionalReviewReason'] === 'string' ? obj['professionalReviewReason'] : undefined,
    citationsUsed: toStringArray(obj['citationsUsed']),
  };
}

function buildFallbackOutput(raw: string): AdvisorLLMOutput {
  return {
    conversationalResponse: raw || 'I was unable to generate a response. Please try again.',
    summary: '',
    guidance: raw,
    immediateSteps: [],
    documentationSteps: [],
    missingFacts: [],
    followUpQuestions: [],
    complianceRisk: 'medium',
    safetyRisk: 'none',
    professionalReviewType: 'none',
    citationsUsed: [],
  };
}

/** @deprecated Use parseAdvisorLLMOutput */
export function parseAdvisorJson(raw: string): AdvisorLLMResponse {
  const output = parseAdvisorLLMOutput(raw);
  return {
    summary: output.summary || output.conversationalResponse,
    guidance: output.guidance || output.conversationalResponse,
    citations: output.citationsUsed,
    riskLevel: output.complianceRisk === 'critical' ? 'high' : (output.complianceRisk as RiskLevel),
    recommendLawyer: output.professionalReviewType === 'legal',
    followUpQuestions: output.followUpQuestions,
  };
}
