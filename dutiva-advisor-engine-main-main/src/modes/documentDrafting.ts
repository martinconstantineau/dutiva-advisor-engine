import { WorkspacePayload } from '../workspace/workspaceTypes';
import { AdvisorLLMResponse } from '../llm/parseAdvisorJson';

export function applyDocumentDraftingMode(
  _workspace: WorkspacePayload,
  response: AdvisorLLMResponse,
): AdvisorLLMResponse {
  const draftingNote =
    _workspace.locale === 'fr'
      ? '\n\n📄 **Note de rédaction:** Ce projet de document doit être revu par un avocat avant utilisation. Adaptez les champs entre crochets à votre situation spécifique.'
      : '\n\n📄 **Drafting Note:** This draft document should be reviewed by legal counsel before use. Customize all fields in brackets to your specific situation.';

  return {
    ...response,
    guidance: response.guidance + draftingNote,
  };
}
