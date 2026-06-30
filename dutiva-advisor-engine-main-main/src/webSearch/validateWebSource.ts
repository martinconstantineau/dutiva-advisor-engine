/**
 * Web source URL validation and classification.
 *
 * Rules:
 * - Reject localhost / private IP / internal URLs.
 * - Reject non-http(s) schemes.
 * - Reject Startpage proxy/anonymous URLs (they are not canonical citations).
 * - Strip tracking parameters.
 * - Classify the domain into a source type for authority ranking.
 */

import type { WebSourceType, WebSearchValidationStatus } from './webSearchTypes';

// ─── Private / internal URL detection ──────────────────────────────────────

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  // ── IPv4 ──────────────────────────────────────────────────────────────────
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,             // loopback 127.0.0.0/8
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,               // "this" network 0.0.0.0/8 (incl. 0.0.0.0)
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,              // private 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,  // private 172.16.0.0/12
  /^192\.168\.\d{1,3}\.\d{1,3}$/,                 // private 192.168.0.0/16
  /^169\.254\.\d{1,3}\.\d{1,3}$/,                 // link-local 169.254.0.0/16 (incl. cloud metadata 169.254.169.254)
  // ── IPv6 (brackets / zone-id stripped before matching) ─────────────────────
  /^::1$/,                                         // loopback
  /^::$/,                                          // unspecified
  /^f[cd][\da-f]{2}:/i,                            // unique local fc00::/7 (fc.. / fd..)
  /^fe[89ab][\da-f]:/i,                            // link-local fe80::/10
  /^::ffff:/i,                                     // IPv4-mapped IPv6 — blocked defensively
];

/**
 * True when the hostname is a loopback / private / link-local / cloud-metadata
 * address that must never be treated as a citable external source.
 *
 * Node's URL parser wraps IPv6 hosts in brackets (e.g. "[::1]") and may append a
 * zone id (e.g. "fe80::1%eth0"). Both are normalised away first so the IPv6
 * patterns above actually apply — without this, "[::1]" never matched "^::1$".
 */
function isPrivateHost(hostname: string): boolean {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const zoneIdx = host.indexOf('%');
  if (zoneIdx !== -1) host = host.slice(0, zoneIdx);
  return PRIVATE_IP_PATTERNS.some((p) => p.test(host));
}

// ─── Startpage proxy URL detection ─────────────────────────────────────────

const STARTPAGE_PROXY_PATTERNS = [
  /ixquick-proxy\.com/i,
  /startpage\.com.*proxy/i,
  /startpage\.com\/sp\//i,
  /startpage\.com\/cgi-bin/i,
  /s1\.wp\.com/i,  // sometimes returned by SP anonymous view
];

function isStartpageProxy(url: string): boolean {
  return STARTPAGE_PROXY_PATTERNS.some((p) => p.test(url));
}

// ─── Tracking parameter stripping ──────────────────────────────────────────

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'gclid', 'msclkid', 'twclid', 'li_fat_id',
  'mc_eid', 'mc_cid', '_hsenc', '_hsmi', 'hs_email', 'hs_automation',
  'ref', 'referrer',
]);

export function canonicalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }
    // Normalize to lowercase scheme+host
    return u.toString();
  } catch {
    return rawUrl;
  }
}

// ─── Authoritative Canadian HR/legal domain classification ─────────────────

/**
 * Path-aware classification rules evaluated BEFORE hostname-only rules.
 *
 * Some hostnames serve both general government content and legislation
 * (e.g. ontario.ca serves both /laws/... and /page/...).  Path-aware rules
 * are checked first so that /laws/ paths are classified as `legislation`
 * rather than `official_government`.
 *
 * Each entry matches `hostname + pathname` (both normalized to lowercase,
 * hostname with www. stripped).
 */
const PATH_AWARE_CLASSIFICATIONS: Array<{
  hostPattern: RegExp;
  pathPattern: RegExp;
  sourceType: WebSourceType;
}> = [
  // ontario.ca/laws/... → legislation
  {
    hostPattern: /^ontario\.ca$/i,
    pathPattern: /^\/laws\//i,
    sourceType: 'legislation',
  },
  // laws-lois.justice.gc.ca (all paths) → legislation
  {
    hostPattern: /^laws-lois\.justice\.gc\.ca$/i,
    pathPattern: /^/,
    sourceType: 'legislation',
  },
  // legisquebec.gouv.qc.ca (all paths) → legislation
  {
    hostPattern: /^legisquebec\.gouv\.qc\.ca$/i,
    pathPattern: /^/,
    sourceType: 'legislation',
  },
  // canlii.org (all paths) → legislation
  {
    hostPattern: /^canlii\.org$/i,
    pathPattern: /^/,
    sourceType: 'legislation',
  },
  // cnesst.gouv.qc.ca → regulator_or_agency
  {
    hostPattern: /^cnesst\.gouv\.qc\.ca$/i,
    pathPattern: /^/,
    sourceType: 'regulator_or_agency',
  },
  // ohrc.on.ca → regulator_or_agency
  {
    hostPattern: /^ohrc\.on\.ca$/i,
    pathPattern: /^/,
    sourceType: 'regulator_or_agency',
  },
  // humanrights.gov.on.ca → regulator_or_agency
  {
    hostPattern: /^humanrights\.gov\.on\.ca$/i,
    pathPattern: /^/,
    sourceType: 'regulator_or_agency',
  },
  // hrto.ca → court_or_tribunal
  {
    hostPattern: /^hrto\.ca$/i,
    pathPattern: /^/,
    sourceType: 'court_or_tribunal',
  },
  // chrc-ccdp.gc.ca / decisions.chrc-ccdp.gc.ca → court_or_tribunal
  {
    hostPattern: /^(?:decisions\.)?chrc-ccdp\.gc\.ca$/i,
    pathPattern: /^/,
    sourceType: 'court_or_tribunal',
  },
  // scc-csc.ca → court_or_tribunal
  {
    hostPattern: /^scc-csc\.ca$/i,
    pathPattern: /^/,
    sourceType: 'court_or_tribunal',
  },
  // fct-cf.gc.ca → court_or_tribunal
  {
    hostPattern: /^fct-cf\.gc\.ca$/i,
    pathPattern: /^/,
    sourceType: 'court_or_tribunal',
  },
];

/** Hostname-only classification table (lower authority than path-aware rules) */
const HOSTNAME_CLASSIFICATIONS: Array<{ pattern: RegExp; sourceType: WebSourceType }> = [
  { pattern: /^laws-lois\.justice\.gc\.ca$/i, sourceType: 'legislation' },
  { pattern: /^legisquebec\.gouv\.qc\.ca$/i, sourceType: 'legislation' },
  { pattern: /^canlii\.org$/i, sourceType: 'legislation' },
  { pattern: /^canada\.ca$/i, sourceType: 'official_government' },
  { pattern: /^ontario\.ca$/i, sourceType: 'official_government' },
  { pattern: /^québec\.ca$/i, sourceType: 'official_government' },
  { pattern: /^quebec\.ca$/i, sourceType: 'official_government' },
  { pattern: /^novascotia\.ca$/i, sourceType: 'official_government' },
  { pattern: /^gov\.bc\.ca$/i, sourceType: 'official_government' },
  { pattern: /^alberta\.ca$/i, sourceType: 'official_government' },
  { pattern: /^gov\.mb\.ca$/i, sourceType: 'official_government' },
  { pattern: /^gnb\.ca$/i, sourceType: 'official_government' },
  { pattern: /^gov\.nl\.ca$/i, sourceType: 'official_government' },
  { pattern: /^gov\.pe\.ca$/i, sourceType: 'official_government' },
  { pattern: /^gov\.sk\.ca$/i, sourceType: 'official_government' },
  { pattern: /^gov\.nt\.ca$/i, sourceType: 'official_government' },
  { pattern: /^gov\.nu\.ca$/i, sourceType: 'official_government' },
  { pattern: /^gov\.yk\.ca$/i, sourceType: 'official_government' },
  { pattern: /^cnesst\.gouv\.qc\.ca$/i, sourceType: 'regulator_or_agency' },
  { pattern: /^esdc\.gc\.ca$/i, sourceType: 'regulator_or_agency' },
  { pattern: /^ohrc\.on\.ca$/i, sourceType: 'regulator_or_agency' },
  { pattern: /^humanrights\.gov\.on\.ca$/i, sourceType: 'regulator_or_agency' },
  { pattern: /^iiroc\.ca$/i, sourceType: 'regulator_or_agency' },
  { pattern: /^wsib\.on\.ca$/i, sourceType: 'regulator_or_agency' },
  { pattern: /^ccohs\.ca$/i, sourceType: 'regulator_or_agency' },
  { pattern: /^hrsdc\.gc\.ca$/i, sourceType: 'regulator_or_agency' },
  { pattern: /^hrto\.ca$/i, sourceType: 'court_or_tribunal' },
  { pattern: /^chrc-ccdp\.gc\.ca$/i, sourceType: 'court_or_tribunal' },
  { pattern: /^decisions\.chrc-ccdp\.gc\.ca$/i, sourceType: 'court_or_tribunal' },
  { pattern: /^scc-csc\.ca$/i, sourceType: 'court_or_tribunal' },
  { pattern: /^fct-cf\.gc\.ca$/i, sourceType: 'court_or_tribunal' },
  { pattern: /^hrreporter\.com$/i, sourceType: 'reputable_secondary' },
  { pattern: /^hrprofessionals\.on\.ca$/i, sourceType: 'reputable_secondary' },
  { pattern: /^hrpa\.ca$/i, sourceType: 'reputable_secondary' },
  { pattern: /^cphr\.ca$/i, sourceType: 'reputable_secondary' },
  { pattern: /^legalline\.ca$/i, sourceType: 'reputable_secondary' },
  { pattern: /^mccarthy\.ca$/i, sourceType: 'reputable_secondary' },
  { pattern: /^blg\.com$/i, sourceType: 'reputable_secondary' },
  { pattern: /^stikeman\.com$/i, sourceType: 'reputable_secondary' },
  { pattern: /^fasken\.com$/i, sourceType: 'reputable_secondary' },
];

/**
 * Classify a URL by source type using path-aware rules first, then hostname rules.
 *
 * @param hostname - The URL hostname (with or without www.)
 * @param pathname - The URL pathname (e.g. "/laws/statute/00e41")
 */
export function classifyUrl(hostname: string, pathname: string): WebSourceType {
  const normHost = hostname.toLowerCase().replace(/^www\./, '');
  const normPath = pathname.toLowerCase();

  // Path-aware rules take priority
  for (const { hostPattern, pathPattern, sourceType } of PATH_AWARE_CLASSIFICATIONS) {
    if (hostPattern.test(normHost) && pathPattern.test(normPath)) return sourceType;
  }

  // Hostname-only fallback
  for (const { pattern, sourceType } of HOSTNAME_CLASSIFICATIONS) {
    if (pattern.test(normHost)) return sourceType;
  }

  return 'general_web';
}

/**
 * Classify by hostname only (no path context).
 * Used when only a domain/hostname is available.
 */
export function classifyDomain(hostname: string): WebSourceType {
  return classifyUrl(hostname, '/');
}

// ─── Main validator ─────────────────────────────────────────────────────────

export interface ValidatedWebUrl {
  url: string;
  hostname: string;
  sourceType: WebSourceType;
  validationStatus: WebSearchValidationStatus;
  qualityWarnings: string[];
}

export function validateWebUrl(rawUrl: string): ValidatedWebUrl {
  const warnings: string[] = [];

  // Must be a non-empty string
  if (!rawUrl || !rawUrl.trim()) {
    return {
      url: rawUrl,
      hostname: '',
      sourceType: 'unknown',
      validationStatus: 'suppressed',
      qualityWarnings: ['Empty URL'],
    };
  }

  // Must be http or https
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      url: rawUrl,
      hostname: '',
      sourceType: 'unknown',
      validationStatus: 'suppressed',
      qualityWarnings: [`Malformed URL: ${rawUrl.slice(0, 80)}`],
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      url: rawUrl,
      hostname: parsed.hostname,
      sourceType: 'unknown',
      validationStatus: 'suppressed',
      qualityWarnings: [`Non-http(s) URL scheme: ${parsed.protocol}`],
    };
  }

  // Reject private / internal hosts
  if (isPrivateHost(parsed.hostname)) {
    return {
      url: rawUrl,
      hostname: parsed.hostname,
      sourceType: 'unknown',
      validationStatus: 'suppressed',
      qualityWarnings: [`Private/internal URL rejected: ${parsed.hostname}`],
    };
  }

  // Reject Startpage proxy URLs — these are not canonical citations
  if (isStartpageProxy(rawUrl)) {
    return {
      url: rawUrl,
      hostname: parsed.hostname,
      sourceType: 'unknown',
      validationStatus: 'suppressed',
      qualityWarnings: ['Startpage proxy/anonymous URL is not a canonical citation'],
    };
  }

  // Canonicalize — strip tracking params
  const canonicalized = canonicalizeUrl(rawUrl);
  // Use path-aware classification so ontario.ca/laws/... → legislation
  const sourceType = classifyUrl(parsed.hostname, parsed.pathname);

  // General web sources require review before rendering as authoritative
  let validationStatus: WebSearchValidationStatus = 'valid';
  if (sourceType === 'general_web') {
    validationStatus = 'requires_review';
    warnings.push('General web source — requires editorial review before treating as authoritative');
  } else if (sourceType === 'unknown') {
    validationStatus = 'requires_review';
    warnings.push('Unknown source domain — requires editorial review');
  }

  return {
    url: canonicalized,
    hostname: parsed.hostname,
    sourceType,
    validationStatus,
    qualityWarnings: warnings,
  };
}
