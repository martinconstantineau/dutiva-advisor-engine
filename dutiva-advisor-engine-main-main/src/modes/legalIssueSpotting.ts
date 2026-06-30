import { WorkspacePayload } from '../workspace/workspaceTypes';
import { AdvisorLLMResponse } from '../llm/parseAdvisorJson';

const issueKeywords: Record<string, string[]> = {
  'Potential wrongful/constructive dismissal': ['fired', 'terminated', 'constructive', 'forced to quit', 'resign'],
  'Harassment or discrimination': ['harass', 'discriminat', 'bully', 'hostile'],
  'Reprisal risk': ['complaint', 'report', 'whistleblow', 'retaliat'],
  'Human rights violation': ['disability', 'pregnancy', 'religion', 'race', 'age', 'gender'],
  'Occupational health and safety': ['unsafe', 'injury', 'accident', 'hazard'],
};

export function applyLegalIssueSpottingMode(
  workspace: WorkspacePayload,
  response: AdvisorLLMResponse,
): AdvisorLLMResponse {
  const spottedIssues: string[] = [];
  const msg = workspace.userMessage.toLowerCase();

  for (const [issue, keywords] of Object.entries(issueKeywords)) {
    if (keywords.some((kw) => msg.includes(kw))) {
      spottedIssues.push(issue);
    }
  }

  if (spottedIssues.length === 0) return response;

  const issueList = spottedIssues.map((i) => `• ${i}`).join('\n');
  const header =
    workspace.locale === 'fr'
      ? `**Problèmes juridiques potentiels identifiés:**\n${issueList}\n\n`
      : `**Potential legal issues identified:**\n${issueList}\n\n`;

  return {
    ...response,
    guidance: header + response.guidance,
    riskLevel: spottedIssues.length >= 2 ? 'high' : 'medium',
    recommendLawyer: true,
  };
}
