/**
 * Provider-neutral LLM interface.
 *
 * The advisor pipeline calls the abstraction below, never a specific provider
 * SDK directly. The concrete Qwen implementation lives in ./qwenProvider and
 * may use an OpenAI-compatible endpoint under the hood; that detail is hidden
 * from the rest of the engine.
 */

import { createQwenProvider } from './qwenProvider';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
}

export interface LLMProvider {
  readonly name: string;
  generateCompletion(options: LLMCompletionOptions): Promise<string>;
}

let defaultProvider: LLMProvider | null = null;

export function getDefaultProvider(): LLMProvider {
  if (!defaultProvider) {
    defaultProvider = createQwenProvider();
  }
  return defaultProvider;
}

export function setDefaultProvider(provider: LLMProvider | null): void {
  defaultProvider = provider;
}

export async function callLLM(options: LLMCompletionOptions): Promise<string> {
  const provider = getDefaultProvider();
  return provider.generateCompletion(options);
}
