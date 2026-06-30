import { WorkspacePayload } from '../workspace/workspaceTypes';
import { AdvisorLLMResponse } from '../llm/parseAdvisorJson';

export function buildOutOfScopeResponse(workspace: WorkspacePayload): AdvisorLLMResponse {
  const isEn = workspace.locale !== 'fr';

  return {
    summary: isEn
      ? 'This question is outside the scope of HR and employment law guidance.'
      : 'Cette question dépasse le cadre des conseils en droit du travail et des ressources humaines.',
    guidance: isEn
      ? 'Dutiva specializes in Canadian HR compliance and employment law. Your question does not appear to fall within this scope. Please consult the appropriate professional for assistance.'
      : 'Dutiva est spécialisé dans la conformité des ressources humaines et le droit du travail canadien. Votre question ne semble pas relever de ce domaine. Veuillez consulter le professionnel approprié pour obtenir de l\'aide.',
    citations: [],
    riskLevel: 'low',
    recommendLawyer: false,
    followUpQuestions: isEn
      ? ['Do you have an HR or employment law question I can help with?']
      : ['Avez-vous une question en ressources humaines ou en droit du travail à laquelle je peux répondre?'],
  };
}
