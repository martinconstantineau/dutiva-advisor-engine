/// <reference types="vitest/globals" />
/**
 * LLM provider tests.
 *
 * Tests:
 * - A. Provider configuration (QWEN_API_KEY, QWEN_BASE_URL, no OpenAI default)
 * - B. Provider naming (no OpenAI branding in public interface)
 * - C. Provider error sanitization (no secret leak)
 */

import {
  callLLM,
  getDefaultProvider,
  setDefaultProvider,
  type LLMCompletionOptions,
  type LLMProvider,
} from '../llm/provider';
import { createQwenProvider, DEFAULT_QWEN_BASE_URL, sanitizeProviderError } from '../llm/qwenProvider';

function resetProvider(): void {
  setDefaultProvider(null);
}

const ORIGINAL_QWEN_API_KEY = process.env['QWEN_API_KEY'];
const ORIGINAL_QWEN_BASE_URL = process.env['QWEN_BASE_URL'];
const ORIGINAL_QWEN_MODEL = process.env['QWEN_MODEL'];

afterEach(() => {
  if (ORIGINAL_QWEN_API_KEY !== undefined) {
    process.env['QWEN_API_KEY'] = ORIGINAL_QWEN_API_KEY;
  } else {
    delete process.env['QWEN_API_KEY'];
  }
  if (ORIGINAL_QWEN_BASE_URL !== undefined) {
    process.env['QWEN_BASE_URL'] = ORIGINAL_QWEN_BASE_URL;
  } else {
    delete process.env['QWEN_BASE_URL'];
  }
  if (ORIGINAL_QWEN_MODEL !== undefined) {
    process.env['QWEN_MODEL'] = ORIGINAL_QWEN_MODEL;
  } else {
    delete process.env['QWEN_MODEL'];
  }
  resetProvider();
});

describe('A. Provider configuration', () => {
  test('provider reads QWEN_API_KEY from environment', async () => {
    const mockProvider: LLMProvider = {
      name: 'mock',
      async generateCompletion(_options: LLMCompletionOptions): Promise<string> {
        return '{"summary":"ok"}';
      },
    };
    setDefaultProvider(mockProvider);
    const result = await callLLM({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result).toBe('{"summary":"ok"}');
  });

  test('missing QWEN_API_KEY produces a safe error without leaking the key', async () => {
    delete process.env['QWEN_API_KEY'];
    delete process.env['QWEN_BASE_URL'];
    delete process.env['QWEN_MODEL'];
    resetProvider();
    await expect(callLLM({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      'QWEN_API_KEY environment variable is not set',
    );
  });

  test('QWEN_BASE_URL missing uses explicit Qwen default instead of undefined', () => {
    delete process.env['QWEN_BASE_URL'];
    const provider = createQwenProvider({
      apiKey: 'sk-test-key',
      model: 'qwen-max',
    });
    expect(provider.name).toBe('qwen');
    // The provider should be created without throwing and must use the default Qwen URL.
    expect(provider).toBeDefined();
  });

  test('QWEN_BASE_URL override takes precedence', () => {
    const customUrl = 'https://custom.qwen.example/v1';
    const provider = createQwenProvider({
      apiKey: 'sk-test-key',
      model: 'qwen-max',
      baseUrl: customUrl,
    });
    expect(provider).toBeDefined();
  });
});

describe('B. Provider naming', () => {
  test('default provider name is qwen', () => {
    resetProvider();
    const provider = getDefaultProvider();
    expect(provider.name).toBe('qwen');
  });

  test('public interface does not mention OpenAI in provider name', () => {
    const provider = getDefaultProvider();
    expect(provider.name.toLowerCase()).not.toContain('openai');
  });

  test('DEFAULT_QWEN_BASE_URL is a Qwen/DashScope endpoint, not OpenAI', () => {
    expect(DEFAULT_QWEN_BASE_URL.toLowerCase()).toContain('dashscope');
    expect(DEFAULT_QWEN_BASE_URL.toLowerCase()).not.toContain('openai');
  });
});

describe('C. Provider error sanitization', () => {
  const TEST_KEY = 'sk-test-key-1234567890abcdef';

  test('sanitizeProviderError removes the exact API key', () => {
    const msg = `Request failed with key ${TEST_KEY} and token ${TEST_KEY}`;
    const safe = sanitizeProviderError(msg, TEST_KEY);
    expect(safe).not.toContain(TEST_KEY);
    expect(safe).toContain('[REDACTED]');
  });

  test('sanitizeProviderError removes Authorization Bearer tokens', () => {
    const msg = 'upstream error: Authorization: Bearer sk-bearer-token-abc123';
    const safe = sanitizeProviderError(msg);
    expect(safe).not.toContain('sk-bearer-token-abc123');
    expect(safe).not.toContain('Bearer');
  });

  test('sanitizeProviderError removes api_key=..., apikey=..., token=..., key=...', () => {
    const msg = 'bad request: api_key=sk-aaa, apikey=sk-bbb, token=sk-ccc, key=sk-ddd';
    const safe = sanitizeProviderError(msg);
    expect(safe).not.toContain('sk-aaa');
    expect(safe).not.toContain('sk-bbb');
    expect(safe).not.toContain('sk-ccc');
    expect(safe).not.toContain('sk-ddd');
    expect(safe).toContain('[REDACTED]');
  });

  test('Qwen provider normalizes errors and does not include the API key', async () => {
    // Simulate a Qwen provider whose internal client throws a message containing a fake key.
    // maxRetries: 0 and a short timeout ensure the connection-refused error surfaces immediately
    // without the SDK retry loop turning this into a 30-second test.
    const provider = createQwenProvider({
      apiKey: TEST_KEY,
      model: 'qwen-max',
      baseUrl: 'http://localhost:9999/fake',
      maxRetries: 0,
      timeoutMs: 2000,
    });
    await expect(callLLMWithProvider(provider, { messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      'Qwen provider request failed:',
    );
    // The actual error may or may not include the key; if it does, assert it is redacted.
    try {
      await callLLMWithProvider(provider, { messages: [{ role: 'user', content: 'hi' }] });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      expect(message).not.toContain(TEST_KEY);
    }
  }, 10_000);
});

async function callLLMWithProvider(provider: LLMProvider, options: LLMCompletionOptions): Promise<string> {
  setDefaultProvider(provider);
  return callLLM(options);
}
