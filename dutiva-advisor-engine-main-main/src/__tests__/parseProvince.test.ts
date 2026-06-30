/// <reference types="vitest/globals" />
import { parseProvince, resolveRemoteWorkJurisdiction } from '../core/normalizeProvince';

describe('parseProvince', () => {
  test('returns null for missing input — no Ontario default', () => {
    expect(parseProvince(undefined)).toBeNull();
    expect(parseProvince(null)).toBeNull();
    expect(parseProvince('')).toBeNull();
    expect(parseProvince('  ')).toBeNull();
  });

  test('parses ON correctly', () => {
    expect(parseProvince('ON')).toBe('ON');
    expect(parseProvince('Ontario')).toBe('ON');
    expect(parseProvince('ontario')).toBe('ON');
  });

  test('parses QC correctly', () => {
    expect(parseProvince('QC')).toBe('QC');
    expect(parseProvince('Québec')).toBe('QC');
    expect(parseProvince('PQ')).toBe('QC');
  });

  test('parses FEDERAL correctly', () => {
    expect(parseProvince('FEDERAL')).toBe('FEDERAL');
    expect(parseProvince('federal')).toBe('FEDERAL');
  });

  test('returns null for unknown string — no fallback', () => {
    expect(parseProvince('UNKNOWN_PLACE')).toBeNull();
  });

  test('generic "Canada" is NOT treated as federal jurisdiction', () => {
    expect(parseProvince('Canada')).toBeNull();
    expect(parseProvince('Canadian')).toBeNull();
    expect(parseProvince('canada')).toBeNull();
  });

  test('explicit federal signals are parsed as FEDERAL', () => {
    expect(parseProvince('Canada Labour Code')).toBe('FEDERAL');
    expect(parseProvince('federal jurisdiction')).toBe('FEDERAL');
    expect(parseProvince('federally regulated')).toBe('FEDERAL');
    expect(parseProvince('CLC')).toBe('FEDERAL');
  });
});

describe('resolveRemoteWorkJurisdiction', () => {
  test('does not silently default to Ontario when inputs are unknown', () => {
    expect(resolveRemoteWorkJurisdiction(null, null, false)).toBeNull();
  });

  test('returns FEDERAL when isFederallyRegulated is true', () => {
    expect(resolveRemoteWorkJurisdiction('ON', 'QC', true)).toBe('FEDERAL');
  });

  test('returns employer province when known', () => {
    expect(resolveRemoteWorkJurisdiction('ON', 'QC', false)).toBe('QC');
  });
});
