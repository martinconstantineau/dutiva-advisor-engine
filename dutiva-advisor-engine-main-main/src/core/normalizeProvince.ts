import { Province, JURISDICTION_STATUS, JurisdictionStatus } from '../workspace/workspaceTypes';

const provinceMap: Record<string, Province> = {
  'alberta': 'AB',
  'ab': 'AB',
  'british columbia': 'BC',
  'bc': 'BC',
  'manitoba': 'MB',
  'mb': 'MB',
  'new brunswick': 'NB',
  'nb': 'NB',
  'newfoundland': 'NL',
  'newfoundland and labrador': 'NL',
  'nl': 'NL',
  'nova scotia': 'NS',
  'ns': 'NS',
  'northwest territories': 'NT',
  'nt': 'NT',
  'nunavut': 'NU',
  'nu': 'NU',
  'ontario': 'ON',
  'on': 'ON',
  'prince edward island': 'PE',
  'pei': 'PE',
  'pe': 'PE',
  'quebec': 'QC',
  'québec': 'QC',
  'pq': 'QC',
  'qc': 'QC',
  'saskatchewan': 'SK',
  'sk': 'SK',
  'yukon': 'YT',
  'yt': 'YT',
  'federal': 'FEDERAL',
  'federally regulated': 'FEDERAL',
};

/**
 * Phrases that explicitly signal federal jurisdiction. Generic words such as
 * "Canada" or "Canadian" alone are NOT federal signals.
 */
const FEDERAL_SIGNALS = [
  'canada labour code',
  'clc',
  'federal jurisdiction',
  'federally regulated',
  'federal',
];

const validProvinces = new Set<string>(Object.keys(JURISDICTION_STATUS));

/**
 * Parses a province string into a Province code.
 * Returns null if the input is not a recognised province — never defaults to Ontario.
 * Generic words like "Canada" or "Canadian" are NOT treated as federal jurisdiction.
 */
export function parseProvince(input: unknown): Province | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (validProvinces.has(upper)) return upper as Province;
  const lower = trimmed.toLowerCase();
  if (provinceMap[lower]) return provinceMap[lower];

  // Check for explicit federal signals (multi-word phrases), but not generic Canada.
  const lowerInput = ` ${lower} `;
  for (const signal of FEDERAL_SIGNALS) {
    const wrapped = ` ${signal} `;
    if (lowerInput.includes(wrapped)) return 'FEDERAL';
  }
  return null;
}

/**
 * @deprecated Use parseProvince. This function no longer falls back to Ontario.
 */
export function normalizeProvince(input: string): Province | null {
  return parseProvince(input);
}

export function getJurisdictionStatus(province: Province): JurisdictionStatus {
  return JURISDICTION_STATUS[province];
}

export function isJurisdictionSupported(province: Province): boolean {
  return JURISDICTION_STATUS[province] === 'supported';
}

/**
 * For a remote worker, identify the likely governing jurisdiction.
 * NOTE: This does NOT conclusively resolve governing law — employment relationships
 * can be complex and jurisdiction should be confirmed by legal counsel.
 * Returns the employer province unless federally regulated.
 */
export function likelyRemoteWorkJurisdiction(
  employeeProvince: Province | null,
  employerProvince: Province | null,
  isFederallyRegulated: boolean,
): Province | null {
  if (isFederallyRegulated) return 'FEDERAL';
  return employerProvince ?? employeeProvince;
}

/** @deprecated Use likelyRemoteWorkJurisdiction. No Ontario default. */
export const resolveRemoteWorkJurisdiction = (
  employeeProvince: Province | null,
  employerProvince: Province | null,
  isFederallyRegulated: boolean,
): Province | null => likelyRemoteWorkJurisdiction(employeeProvince, employerProvince, isFederallyRegulated);
