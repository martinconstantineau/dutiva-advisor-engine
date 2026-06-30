/// <reference types="vitest/globals" />
/**
 * Curated ON/QC coverage was deepened in the two biggest gaps vs the federal
 * corpus — compensation (pay/hours/overtime) and medical disclosure — which
 * previously had no province-specific curated entry for Ontario or Québec.
 */
import { retrieveCuratedGuidance } from '../retrieval/retrieveGuidance';

function ids(query: string, province: 'ON' | 'QC'): string[] {
  return retrieveCuratedGuidance(query, { province, limit: 10 }).map((g) => g.id);
}

describe('expanded Ontario curated coverage', () => {
  test('pay / overtime / hours query retrieves the ON compensation entry', () => {
    expect(ids('minimum wage, overtime and hours of work and vacation pay in Ontario', 'ON'))
      .toContain('comp-on-001');
  });

  test('medical / functional-information query retrieves the ON medical-disclosure entry', () => {
    expect(ids('what functional limitations or medical information can we request in Ontario', 'ON'))
      .toContain('meddisc-on-001');
  });
});

describe('expanded Québec curated coverage', () => {
  test('pay / overtime query retrieves the QC compensation entry', () => {
    expect(ids('salaire minimum, heures supplémentaires et congé annuel au Québec', 'QC'))
      .toContain('comp-qc-001');
  });

  test('medical / functional-information query retrieves the QC medical-disclosure entry', () => {
    expect(ids('limitations fonctionnelles et renseignements médicaux pour accommodement au Québec', 'QC'))
      .toContain('meddisc-qc-001');
  });
});
