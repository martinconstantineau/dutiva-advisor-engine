import { z } from 'zod';

const boolFromEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return defaultValue;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }, z.boolean());

const intFromEnv = (defaultValue: number, min: number, max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return defaultValue;
    if (typeof value === 'number') return value;
    return Number.parseInt(String(value), 10);
  }, z.number().int().min(min).max(max));

const RuntimeEnvSchema = z.object({
  PORT: intFromEnv(3000, 1, 65535),
  QWEN_TIMEOUT_MS: intFromEnv(30000, 1000, 120000),
  QWEN_MAX_RETRIES: intFromEnv(2, 0, 10),
  WEB_SEARCH_ENABLED: boolFromEnv(false),
  STARTPAGE_TIMEOUT_MS: intFromEnv(10000, 500, 120000),
  STARTPAGE_MAX_RESULTS: intFromEnv(5, 1, 20),
  WEB_SEARCH_CACHE_TTL_SECONDS: intFromEnv(900, 60, 86400),
  WEB_FETCH_TIMEOUT_MS: intFromEnv(10000, 500, 120000),
  STARTPAGE_BASE_URL: z.string().optional(),
  STARTPAGE_API_KEY: z.string().optional(),
});

export interface RuntimeEnvValidationResult {
  ok: true;
  values: z.infer<typeof RuntimeEnvSchema>;
}

export function validateRuntimeEnvironment(): RuntimeEnvValidationResult {
  const parsed = RuntimeEnvSchema.parse(process.env);

  if (parsed.WEB_SEARCH_ENABLED) {
    if (!parsed.STARTPAGE_BASE_URL || parsed.STARTPAGE_BASE_URL.trim() === '') {
      throw new Error('WEB_SEARCH_ENABLED=true requires STARTPAGE_BASE_URL to be set');
    }
    if (!parsed.STARTPAGE_API_KEY || parsed.STARTPAGE_API_KEY.trim() === '') {
      throw new Error('WEB_SEARCH_ENABLED=true requires STARTPAGE_API_KEY to be set');
    }
  }

  return { ok: true, values: parsed };
}

