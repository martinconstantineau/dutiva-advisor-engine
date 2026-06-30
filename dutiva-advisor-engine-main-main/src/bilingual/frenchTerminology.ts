export const frenchTerminology: Record<string, string> = {
  'wrongful dismissal': 'congédiement injustifié',
  'constructive dismissal': 'congédiement déguisé',
  'just cause': 'cause juste et suffisante',
  'notice period': 'délai de préavis',
  'severance pay': 'indemnité de départ',
  'termination pay': 'indemnité de cessation d\'emploi',
  'harassment': 'harcèlement',
  'workplace harassment': 'harcèlement en milieu de travail',
  'discrimination': 'discrimination',
  'accommodation': 'mesures d\'adaptation',
  'duty to accommodate': 'obligation d\'accommodement',
  'undue hardship': 'contrainte excessive',
  'leave of absence': 'congé',
  'maternity leave': 'congé de maternité',
  'parental leave': 'congé parental',
  'sick leave': 'congé de maladie',
  'overtime': 'heures supplémentaires',
  'minimum wage': 'salaire minimum',
  'collective agreement': 'convention collective',
  'grievance': 'grief',
  'arbitration': 'arbitrage',
  'human rights': 'droits de la personne',
  'employment standards': 'normes d\'emploi',
  'occupational health and safety': 'santé et sécurité au travail',
  'reprisal': 'représailles',
  'whistleblower': 'lanceur d\'alerte',
};

export function translateTerm(term: string): string {
  return frenchTerminology[term.toLowerCase()] ?? term;
}
