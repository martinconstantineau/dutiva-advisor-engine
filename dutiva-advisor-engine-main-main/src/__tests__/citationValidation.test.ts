/// <reference types="vitest/globals" />
import { validateCitation, validateRawStringCitation, formatCitationList, reconcileRawCitation } from '../retrieval/citationValidation';
import { LegalCitation } from '../retrieval/guidanceTypes';

describe('validateCitation', () => {
  test('valid citation passes', () => {
    const c: LegalCitation = { statute: 'Employment Standards Act, 2000', shortForm: 'ESA', section: 's. 57' };
    const result = validateCitation(c);
    expect(result.validationStatus).toBe('valid');
  });

  test('malformed section "s. (3)" is requires_review', () => {
    const c: LegalCitation = { statute: 'Some Act', shortForm: 'SA', section: 's. (3)' };
    const result = validateCitation(c);
    expect(result.validationStatus).toBe('requires_review');
    expect(result.qualityWarning).toMatch(/malformed section/i);
  });

  test('malformed section "s. (4)" is requires_review', () => {
    const c: LegalCitation = { statute: 'Some Act', shortForm: 'SA', section: 's. (4)' };
    const result = validateCitation(c);
    expect(result.validationStatus).toBe('requires_review');
  });

  test('generic statute "An Act to consolidate certain statutes respecting labour" is requires_review', () => {
    const c: LegalCitation = { statute: 'An Act to consolidate certain statutes respecting labour', shortForm: 's. (3)' };
    const result = validateCitation(c);
    expect(['requires_review', 'suppressed']).toContain(result.validationStatus);
  });

  test('null citation is suppressed', () => {
    const result = validateCitation(null);
    expect(result.validationStatus).toBe('suppressed');
  });

  test('missing statute is suppressed', () => {
    const result = validateCitation({ shortForm: 'ESA' });
    expect(result.validationStatus).toBe('suppressed');
  });
});

describe('validateRawStringCitation', () => {
  test('empty string is suppressed', () => {
    const result = validateRawStringCitation('');
    expect(result.validationStatus).toBe('suppressed');
  });

  test('malformed "An Act to consolidate...s. (3)" is requires_review', () => {
    const result = validateRawStringCitation('An Act to consolidate certain statutes respecting labour, s. (3)');
    expect(['requires_review', 'suppressed']).toContain(result.validationStatus);
  });

  test('normal citation string is requires_review (LLM-generated default)', () => {
    const result = validateRawStringCitation('Employment Standards Act, 2000, s. 57');
    expect(result.validationStatus).toBe('requires_review');
    expect(result.qualityWarning).toMatch(/LLM-generated/i);
  });
});

describe('formatCitationList', () => {
  test('suppressed citations do not appear in output', () => {
    const citations: LegalCitation[] = [
      { statute: 'An Act to consolidate certain statutes respecting labour', shortForm: 's. (3)', section: 's. (3)' },
    ];
    const result = formatCitationList(citations);
    // Should not render the raw malformed form as authoritative
    expect(result).not.toMatch(/^An Act to consolidate/);
  });
});

describe('reconcileRawCitation — promote LLM citations only when corroborated by vetted retrieval', () => {
  const vetted: LegalCitation[] = [
    { statute: 'Canada Labour Code', section: 'ss. 240–246', shortForm: 'CLC Part III' },
    { statute: 'Employment Standards Act, 2000', section: 's. 54', shortForm: 'ESA 2000 (ON)' },
    { statute: 'Canada Labour Standards Regulations', shortForm: 'CLSR' },
  ];

  test('promotes a raw citation that names a vetted statute', () => {
    const m = reconcileRawCitation('Canada Labour Code, Part III', vetted);
    expect(m?.statute).toBe('Canada Labour Code');
  });

  test('prefers the section-corroborated vetted citation when the section number appears', () => {
    const m = reconcileRawCitation('Employment Standards Act, 2000, s. 54', vetted);
    expect(m?.statute).toBe('Employment Standards Act, 2000');
    expect(m?.section).toBe('s. 54');
  });

  test('matches a statute-only vetted citation', () => {
    const m = reconcileRawCitation('Canada Labour Standards Regulations, s. 5', vetted);
    expect(m?.statute).toBe('Canada Labour Standards Regulations');
  });

  test('returns null when the raw citation names no vetted statute', () => {
    expect(reconcileRawCitation('Some Unrelated Provincial Act, s. 1', vetted)).toBeNull();
  });

  test('returns null when the vetted pool is empty (hardening invariant: no retrieval → no promotion)', () => {
    expect(reconcileRawCitation('Canada Labour Code, s. 240', [])).toBeNull();
  });
});
