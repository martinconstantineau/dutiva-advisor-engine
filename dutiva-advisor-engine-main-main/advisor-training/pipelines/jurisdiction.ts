/**
 * Map a raw-laws source-file path to a jurisdiction label and a source id.
 *
 * This lets the ingestion pipeline handle federal AND provincial statutes from one
 * tree, keyed on the province directory in the path:
 *
 *   raw-laws/canada/federal/...   → 'Canada (Federal)', 'justicecanada/laws-lois-xml'
 *   raw-laws/canada/ontario/...   → 'Ontario',          'ontario/e-laws'
 *   raw-laws/canada/quebec/...    → 'Quebec',           'quebec/legisquebec'
 *   raw-laws/canada/british-columbia/... → 'British Columbia', 'bclaws'
 *   raw-laws/canada/alberta/...   → 'Alberta',          'alberta/kings-printer'
 *
 * The jurisdiction string is what generatedGuidanceAdapter.jurisdictionToProvince()
 * consumes at runtime ('Ontario' → 'ON', 'Quebec' → 'QC', 'Canada (Federal)' →
 * 'FEDERAL'). Defaults to federal for backward compatibility with the existing
 * all-federal corpus (whose files live under .../canada/federal/).
 */
export function inferJurisdiction(sourceFile: string): string {
  const p = sourceFile.toLowerCase().replace(/\\/g, '/');
  if (p.includes('/ontario/')) return 'Ontario';
  if (p.includes('/quebec/') || p.includes('/québec/')) return 'Quebec';
  if (p.includes('/british-columbia/')) return 'British Columbia';
  if (p.includes('/alberta/')) return 'Alberta';
  return 'Canada (Federal)';
}

/** Source id (provenance) for a raw-laws file, derived from its jurisdiction. */
export function inferSource(sourceFile: string): string {
  switch (inferJurisdiction(sourceFile)) {
    case 'Ontario':
      return 'ontario/e-laws';
    case 'Quebec':
      return 'quebec/legisquebec';
    case 'British Columbia':
      return 'bclaws';
    case 'Alberta':
      return 'alberta/kings-printer';
    default:
      return 'justicecanada/laws-lois-xml';
  }
}
