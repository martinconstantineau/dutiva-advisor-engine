export interface AdvisorPlaybook {
  id: string;
  topic: string;
  risk: {
    compliance: 'low' | 'medium' | 'high' | 'critical';
    safety: 'none' | 'watch' | 'urgent' | 'critical';
  };
  escalationRecommended: boolean;
  requiredConcepts: string[];
  requiredMissingFacts: string[];
  suggestedDocuments: string[];
  immediateSteps: string[];
  documentationSteps: string[];
  confidentialityNotes: string[];
  antiReprisalNotes: string[];
}
