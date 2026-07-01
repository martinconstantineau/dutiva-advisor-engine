/// <reference types="vitest/globals" />
/**
 * Jurisdiction inference for the ingestion pipeline — maps a raw-laws source path to
 * a jurisdiction label + source id so federal and provincial statutes can be ingested
 * from one tree. Federal is the backward-compatible default.
 */
import { inferJurisdiction, inferSource } from '../pipelines/jurisdiction';

describe('inferJurisdiction', () => {
  test('federal path (existing corpus) → Canada (Federal)', () => {
    expect(inferJurisdiction('advisor-training/raw-laws/canada/federal/acts/L-2.xml')).toBe('Canada (Federal)');
    expect(inferJurisdiction('advisor-training/raw-laws/canada/federal/regulations/C.R.C.-c-986.xml')).toBe('Canada (Federal)');
  });

  test('ontario path → Ontario', () => {
    expect(inferJurisdiction('advisor-training/raw-laws/canada/ontario/acts/esa-2000.xml')).toBe('Ontario');
  });

  test('quebec path → Quebec (ascii and accented)', () => {
    expect(inferJurisdiction('advisor-training/raw-laws/canada/quebec/lois/N-1.1.xml')).toBe('Quebec');
    expect(inferJurisdiction('advisor-training/raw-laws/canada/québec/lois/N-1.1.xml')).toBe('Quebec');
  });

  test('handles Windows backslash paths', () => {
    expect(inferJurisdiction('advisor-training\\raw-laws\\canada\\ontario\\acts\\x.xml')).toBe('Ontario');
  });

  test('unknown/other path defaults to federal', () => {
    expect(inferJurisdiction('some/other/path.xml')).toBe('Canada (Federal)');
  });
});

describe('inferSource', () => {
  test('maps jurisdiction to a provenance source id', () => {
    expect(inferSource('advisor-training/raw-laws/canada/federal/acts/L-2.xml')).toBe('justicecanada/laws-lois-xml');
    expect(inferSource('advisor-training/raw-laws/canada/ontario/acts/esa.xml')).toBe('ontario/e-laws');
    expect(inferSource('advisor-training/raw-laws/canada/quebec/lois/N-1.1.xml')).toBe('quebec/legisquebec');
  });
});
