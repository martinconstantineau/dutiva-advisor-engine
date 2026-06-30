/**
 * Web search module public API.
 *
 * Three knowledge sources in the engine:
 * 1. Deterministic playbooks — static vetted guidance
 * 2. Internal vetted guidance retrieval — scored knowledge base
 * 3. External real-time Startpage web search (this module)
 *
 * These sources are distinct and must not be collapsed.
 */

export type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchMeta,
  WebSearchConfig,
  WebSourceType,
  WebSearchValidationStatus,
} from './webSearchTypes';

export { loadWebSearchConfig, getWebSearchConfig, resetWebSearchConfig, isWebSearchConfigured, sanitizeWebSearchError } from './webSearchConfig';
export { createStartpageProvider, getWebSearchProvider, setWebSearchProvider, resetWebSearchProvider } from './startpageSearchProvider';
export { runWebSearch } from './webSearchProvider';
export { buildWebSearchQuery, redactPii, requiresCurrentInfo, shouldPerformWebSearch } from './buildWebSearchQuery';
export { validateWebUrl, canonicalizeUrl, classifyDomain, classifyUrl } from './validateWebSource';
export { rankWebSources, filterToAuthoritative } from './rankWebSources';
