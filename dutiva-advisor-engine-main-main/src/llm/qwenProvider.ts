/**
 * Qwen LLM provider implementation.
 *
 * Qwen is accessed through an OpenAI-compatible chat-completions endpoint. This
 * file encapsulates the endpoint-specific details; the rest of the engine uses
 * the provider-neutral interface from ./provider.
 */

import OpenAI from 'openai';
import type { LLMCompletionOptions, LLMProvider } from './provider';

export interface QwenProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Safe default Qwen/DashScope OpenAI-compatible endpoint.
 * Override via QWEN_BASE_URL when using a different Qwen-compatible host.
 */
export const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

/** Keywords/phrases that should never appear in public error messages. */
const SENSITIVE_PATTERNS: RegExp[] = [
  // Authorization / Bearer tokens
  /Authorization\s*[:\s]\s*Bearer\s+[\w.-]+/gi,
  /Bearer\s+[\w.-]+/gi,
  // Common API-key query/body parameters
  /api_key\s*=\s*[\w.-]+/gi,
  /apikey\s*=\s*[\w.-]+/gi,
  /token\s*=\s*[\w.-]+/gi,
  /key\s*=\s*[\w.-]+/gi,
  // OpenAI-style long secret keys (sk-...)
  /sk-[a-zA-Z0-9]{20,}/g,
  // Any literal API key value we know about (redacted before regexes as a fallback)
];

function parseIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

/**
 * Sanitize a provider error message so secrets and raw request details cannot
 * leak into API responses or logs. Preserves the class/category of failure
 * (e.g. "connection refused", "timeout") but strips tokens, headers, and keys.
 */
export function sanitizeProviderError(message: string, apiKey?: string): string {
  let sanitized = message;

  // Redact the exact configured API key first so it cannot slip through later.
  if (apiKey) {
    const escaped = apiKey.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    sanitized = sanitized.replace(new RegExp(escaped, 'g'), '[REDACTED]');
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Collapse repeated redaction markers for readability.
  sanitized = sanitized.replace(/\[REDACTED\][,;:\s]+\[REDACTED\]/g, '[REDACTED]');

  return sanitized;
}

export function createQwenProvider(config?: QwenProviderConfig): LLMProvider {
  const apiKey = config?.apiKey ?? process.env['QWEN_API_KEY'];
  const baseUrl = config?.baseUrl ?? process.env['QWEN_BASE_URL'] ?? DEFAULT_QWEN_BASE_URL;
  const model = config?.model ?? process.env['QWEN_MODEL'];
  const timeout = config?.timeoutMs ?? parseIntEnv('QWEN_TIMEOUT_MS', 30000, 1000, 120000);
  const maxRetries = config?.maxRetries ?? parseIntEnv('QWEN_MAX_RETRIES', 2, 0, 10);

  if (!baseUrl) {
    throw new Error('QWEN_BASE_URL environment variable is required');
  }

  const client = apiKey
    ? new OpenAI({
        apiKey,
        baseURL: baseUrl,
        timeout,
        maxRetries,
      })
    : null;

  return {
    name: 'qwen',
    async generateCompletion(options: LLMCompletionOptions): Promise<string> {
      if (!client) {
        throw new Error('QWEN_API_KEY environment variable is not set');
      }
      if (!model) {
        throw new Error('QWEN_MODEL environment variable is not set');
      }

      try {
        const response = await client.chat.completions.create({
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2048,
          response_format:
            options.responseFormat === 'json_object'
              ? { type: 'json_object' }
              : { type: 'text' },
        });
        return response.choices[0]?.message?.content ?? '';
      } catch (err) {
        // Normalize provider errors into safe internal errors. Never expose the key.
        const rawMessage = err instanceof Error ? err.message : 'Qwen provider request failed';
        const safeMessage = sanitizeProviderError(rawMessage, apiKey);
        throw new Error(`Qwen provider request failed: ${safeMessage}`);
      }
    },
  };
}
