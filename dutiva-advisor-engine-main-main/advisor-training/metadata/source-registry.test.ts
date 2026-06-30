/// <reference types="vitest/globals" />
/**
 * Source registry integrity test.
 *
 * Runs under Vitest (npm test). Vitest globals (describe/it/expect) are
 * injected via `globals: true` in vitest.config.ts. The triple-slash
 * reference above gives the IDE language server the correct type declarations
 * for this file, which lives outside the src/ root covered by tsconfig.json.
 *
 * The legacy source-registry.test.js (original Vitest JS file) has been
 * deleted. This TypeScript file is the single source of truth.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Load registry and schema ────────────────────────────────────────────────

const registryPath = path.resolve(process.cwd(), 'advisor-training/metadata/source-registry.json');
const schemaPath = path.resolve(process.cwd(), 'advisor-training/metadata/source-registry.schema.json');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: Record<string, any> = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schema: Record<string, any> = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const REQUIRED_SOURCE_TYPES = [
  'Law',
  'Regulation',
  'Government guide',
  'Internal Dutiva template',
  'Internal Dutiva policy',
  'HR best-practice guidance',
  'PR/internal communications guidance',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sourceSchema: Record<string, any> = schema.properties.sources.items;
const sourceFields: string[] = sourceSchema.required as string[];

function enumValuesFor(field: string): string[] {
  return (sourceSchema.properties[field].enum as string[]) ?? [];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('source registry', () => {
  it('defines the required task source types', () => {
    expect(registry.source_types).toEqual(REQUIRED_SOURCE_TYPES);
  });

  it('records at least one source for each supported source type', () => {
    const registeredTypes = new Set<string>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registry.sources as any[]).map((source) => source.source_type as string),
    );

    for (const sourceType of REQUIRED_SOURCE_TYPES) {
      expect(registeredTypes.has(sourceType)).toBe(true);
    }
  });

  it('keeps source ids unique and URL-safe', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceIds: string[] = (registry.sources as any[]).map((source) => source.source_id as string);

    expect(new Set(sourceIds).size).toBe(sourceIds.length);

    for (const sourceId of sourceIds) {
      expect(sourceId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('includes the required fields on every source', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const source of registry.sources as any[]) {
      for (const field of sourceFields) {
        expect(source).toHaveProperty(field);
      }

      for (const [field, value] of Object.entries(source)) {
        // last_updated_at is nullable
        if (field === 'last_updated_at' && value === null) {
          continue;
        }

        expect(typeof value).toBe('string');
        expect((value as string).trim()).not.toBe('');
      }
    }
  });

  it('keeps values inside the declared registry vocabulary', () => {
    const allowedTypes: string[] = registry.source_types as string[];
    const allowedLanguages = enumValuesFor('language');
    const allowedAuthorityLevels = enumValuesFor('authority_level');
    const allowedStatuses = enumValuesFor('status');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const source of registry.sources as any[]) {
      expect(allowedTypes).toContain(source.source_type);
      expect(allowedLanguages).toContain(source.language);
      expect(allowedAuthorityLevels).toContain(source.authority_level);
      expect(allowedStatuses).toContain(source.status);
    }
  });

  it('uses ISO dates for registry review and source freshness fields', () => {
    expect(registry.last_reviewed_at as string).toMatch(DATE_PATTERN);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const source of registry.sources as any[]) {
      expect(source.last_checked_at as string).toMatch(DATE_PATTERN);

      if (source.last_updated_at !== null) {
        expect(source.last_updated_at as string).toMatch(DATE_PATTERN);
      }
    }
  });
});
