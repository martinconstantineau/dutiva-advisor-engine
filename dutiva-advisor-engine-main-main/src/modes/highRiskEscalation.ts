import { WorkspacePayload } from '../workspace/workspaceTypes';
import { AdvisorLLMResponse } from '../llm/parseAdvisorJson';

export function applyHighRiskEscalationMode(
  workspace: WorkspacePayload,
  response: AdvisorLLMResponse,
): AdvisorLLMResponse {
  const escalationBanner =
    workspace.locale === 'fr'
      ? '🚨 **SITUATION À HAUT RISQUE** — Nous recommandons fortement de consulter un avocat spécialisé en droit du travail immédiatement avant de prendre toute mesure.\n\n'
      : '🚨 **HIGH RISK SITUATION** — We strongly recommend consulting an employment lawyer immediately before taking any action.\n\n';

  return {
    ...response,
    guidance: escalationBanner + response.guidance,
    riskLevel: 'high',
    recommendLawyer: true,
  };
}
