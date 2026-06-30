/**
 * Web search configuration loader.
 *
 * Reads environment variables and validates them. Never throws for missing
 * optional Startpage config — fails gracefully with a quality warning at
 * call time instead.
 *
 * WEB_SEARCH_ENABLED defaults to false so tests and dev environments are safe
 * by default with no unexpected outbound calls.
 */

import type { WebSearchConfig } from './webSearchTypes';

function parsePositiveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function loadWebSearchConfig(): WebSearchConfig {
  const enabled = process.env['WEB_SEARCH_ENABLED'] === 'true';

  return {
    enabled,
    provider: 'startpage',
    startpageBaseUrl: process.env['STARTPAGE_BASE_URL'] ?? '',
    startpageApiKey: process.env['STARTPAGE_API_KEY'] ?? '',
    startpageTimeoutMs: parsePositiveIntEnv('STARTPAGE_TIMEOUT_MS', 10000, 500, 120000),
    startpageMaxResults: parsePositiveIntEnv('STARTPAGE_MAX_RESULTS', 5, 1, 20),
    startpageRegion: process.env['STARTPAGE_REGION'] ?? 'ca',
    startpageLanguage: process.env['STARTPAGE_LANGUAGE'] ?? 'en',
    cacheTtlSeconds: parsePositiveIntEnv('WEB_SEARCH_CACHE_TTL_SECONDS', 900, 60, 86400),
    fetchTimeoutMs: parsePositiveIntEnv('WEB_FETCH_TIMEOUT_MS', 10000, 500, 120000),
  };
}

/** Singleton config for the current process lifetime */
let _config: WebSearchConfig | null = null;

export function getWebSearchConfig(): WebSearchConfig {
  if (!_config) _config = loadWebSearchConfig();
  return _config;
}

/** Reset config (for tests that modify process.env) */
export function resetWebSearchConfig(): void {
  _config = null;
}

/**
 * Returns true if Startpage is properly configured:
 * - WEB_SEARCH_ENABLED=true
 * - STARTPAGE_BASE_URL is set
 * - STARTPAGE_API_KEY is set
 */
export function isWebSearchConfigured(cfg: WebSearchConfig): boolean {
  return cfg.enabled && cfg.startpageBaseUrl.trim() !== '' && cfg.startpageApiKey.trim() !== '';
}

/**
 * Sanitize Startpage config errors — redact API keys before logging.
 */
export function sanitizeWebSearchError(message: string, apiKey?: string): string {
  let sanitized = message;
  if (apiKey && apiKey.trim()) {
    sanitized = sanitized.split(apiKey).join('[REDACTED]');
  }
  // Redact any bearer/authorization patterns
  sanitized = sanitized.replace(/bearer\s+\S+/gi, 'bearer [REDACTED]');
  sanitized = sanitized.replace(/authorization:\s*[^\s,]+/gi, 'Authorization: [REDACTED]');
  sanitized = sanitized.replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[REDACTED]');
  return sanitized;
}
