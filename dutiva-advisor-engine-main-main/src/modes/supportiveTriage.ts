import { WorkspacePayload } from '../workspace/workspaceTypes';
import { AdvisorLLMResponse } from '../llm/parseAdvisorJson';

export function applySupportiveTriageMode(
  workspace: WorkspacePayload,
  response: AdvisorLLMResponse,
): AdvisorLLMResponse {
  const supportNote =
    workspace.locale === 'fr'
      ? '\n\n💬 **Soutien:** Nous comprenons que les situations d\'emploi peuvent être très stressantes. N\'hésitez pas à contacter un professionnel des ressources humaines ou un conseiller juridique pour obtenir un soutien personnalisé.'
      : '\n\n💬 **Support:** We understand employment situations can be very stressful. Please do not hesitate to reach out to an HR professional or legal advisor for personalized support.';

  return {
    ...response,
    guidance: response.guidance + supportNote,
  };
}
