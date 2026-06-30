/// <reference types="vitest/globals" />
import {
  normalizeForSearch,
  normalizeProvinceName,
  tokenizeGuidanceQuery,
} from '../core/normalizeGuidanceText';

describe('normalizeForSearch', () => {
  test('strips diacritics from French terms', () => {
    expect(normalizeForSearch('Préavis')).toBe('preavis');
    expect(normalizeForSearch('harcèlement')).toBe('harcelement');
    expect(normalizeForSearch('heures supplémentaires')).toBe('heures supplementaires');
    expect(normalizeForSearch('congé')).toBe('conge');
    expect(normalizeForSearch('sécurité')).toBe('securite');
  });

  test('strips punctuation', () => {
    expect(normalizeForSearch('termination.')).toBe('termination');
    expect(normalizeForSearch('health-and-safety')).toBe('health and safety');
  });

  test('lowercases', () => {
    expect(normalizeForSearch('TERMINATION')).toBe('termination');
  });

  test('returns empty string for non-string input', () => {
    expect(normalizeForSearch(null)).toBe('');
    expect(normalizeForSearch(undefined)).toBe('');
    expect(normalizeForSearch(123)).toBe('');
  });
});

describe('normalizeProvinceName', () => {
  test('maps ON/Ontario to ontario', () => {
    expect(normalizeProvinceName('ON')).toBe('ontario');
    expect(normalizeProvinceName('Ontario')).toBe('ontario');
  });

  test('maps QC/PQ/Québec to quebec', () => {
    expect(normalizeProvinceName('QC')).toBe('quebec');
    expect(normalizeProvinceName('PQ')).toBe('quebec');
    expect(normalizeProvinceName('Québec')).toBe('quebec');
    expect(normalizeProvinceName('Quebec')).toBe('quebec');
  });

  test('maps CA/Canada to canada', () => {
    expect(normalizeProvinceName('CA')).toBe('canada');
    expect(normalizeProvinceName('Canada')).toBe('canada');
  });

  test('maps federal to federal', () => {
    expect(normalizeProvinceName('federal')).toBe('federal');
    expect(normalizeProvinceName('FEDERAL')).toBe('federal');
  });
});

describe('tokenizeGuidanceQuery', () => {
  test('removes stop words and deduplicates', () => {
    const tokens = tokenizeGuidanceQuery('what is the notice period for termination');
    expect(tokens).toContain('notice');
    expect(tokens).toContain('period');
    expect(tokens).toContain('termination');
    expect(tokens).not.toContain('what');
    expect(tokens).not.toContain('is');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('for');
  });

  test('handles non-string input', () => {
    expect(tokenizeGuidanceQuery(null)).toEqual([]);
    expect(tokenizeGuidanceQuery(undefined)).toEqual([]);
  });
});
