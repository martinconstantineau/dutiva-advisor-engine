import { WorkspacePayload } from '../workspace/workspaceTypes';
import { AdvisorLLMResponse } from '../llm/parseAdvisorJson';

export function applyHrComplianceMode(
  workspace: WorkspacePayload,
  response: AdvisorLLMResponse,
): AdvisorLLMResponse {
  const disclaimer =
    workspace.locale === 'fr'
      ? '\n\n⚠️ Ces informations sont fournies à titre indicatif et ne constituent pas un avis juridique.'
      : '\n\n⚠️ This information is for general guidance only and does not constitute legal advice.';

  return {
    ...response,
    guidance: response.guidance + disclaimer,
  };
}
