/// <reference types="vitest/globals" />
/**
 * Regression tests for the repeal-bracket stripping layer of
 * filterRetrievedGuidanceForPromptAndWorkspace (no jurisdiction / topic options).
 *
 * Covers:
 * - Items with repeal brackets in content are dropped
 * - Items with repeal brackets only in search_text are cleaned (content preserved)
 * - Items with repeal brackets only in advisor_answer_en are cleaned (content preserved)
 * - Clean items pass through unchanged
 * - Multiple repeal bracket variants are handled
 * - Empty-content items after stripping are dropped
 */

import { filterRetrievedGuidanceForPromptAndWorkspace } from '../retrieval/filterRetrievedGuidance';
import type { ScoredGuidanceItem } from '../retrieval/guidanceTypes';

/** Thin helper — calls the full filter with no jurisdiction/topic options (repeal-strip only). */
function filterRetrievedGuidance(items: ScoredGuidanceItem[]): ScoredGuidanceItem[] {
  return filterRetrievedGuidanceForPromptAndWorkspace(items, {}).items;
}

function makeItem(overrides: Partial<ScoredGuidanceItem> = {}): ScoredGuidanceItem {
  return {
    id: 'test-item-001',
    category: 'general',
    province: 'FEDERAL',
    title: 'Test Provision',
    content: 'An employee is entitled to notice before termination.',
    search_text: 'Notice termination employee entitlement',
    advisor_answer_en: 'An employee is entitled to notice before termination.',
    citations: [{ statute: 'Canada Labour Code', shortForm: 'CLC' }],
    keywords: ['notice', 'termination'],
    score: 5,
    ...overrides,
  };
}

describe('filterRetrievedGuidance — clean items pass through', () => {
  it('returns clean item unchanged', () => {
    const item = makeItem();
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(item.content);
    expect(result[0].search_text).toBe(item.search_text);
    expect(result[0].advisor_answer_en).toBe(item.advisor_answer_en);
  });

  it('preserves all non-text fields unchanged', () => {
    const item = makeItem();
    const result = filterRetrievedGuidance([item]);
    expect(result[0].id).toBe(item.id);
    expect(result[0].category).toBe(item.category);
    expect(result[0].province).toBe(item.province);
    expect(result[0].score).toBe(item.score);
    expect(result[0].citations).toEqual(item.citations);
    expect(result[0].keywords).toEqual(item.keywords);
  });

  it('returns empty array for empty input', () => {
    expect(filterRetrievedGuidance([])).toEqual([]);
  });
});

describe('filterRetrievedGuidance — drops items whose content becomes empty after stripping', () => {
  it('drops item whose content is entirely a repeal bracket', () => {
    const item = makeItem({ content: '[Repealed, SOR/2019-168, s. 2]' });
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(0);
  });

  it('drops item whose content is multiple repeal brackets', () => {
    const item = makeItem({ content: '[Repealed, SOR/2019-168, s. 2] [Repealed, SOR/2020-1, s. 1]' });
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(0);
  });

  it('drops item with French abrogation bracket only', () => {
    const item = makeItem({ content: '[Abrogé, DORS/2019-168, art. 2]' });
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(0);
  });

  it('drops item with [Repealed] bare bracket only', () => {
    const item = makeItem({ content: '[Repealed]' });
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(0);
  });
});

describe('filterRetrievedGuidance — cleans items with repeal text in search_text or advisor_answer_en', () => {
  it('strips repeal bracket from search_text, keeps item', () => {
    const item = makeItem({
      content: 'Employees must be given notice.',
      search_text: 'Notice employee [Repealed, SOR/2019-168, s. 2] termination',
    });
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Employees must be given notice.');
    expect(result[0].search_text).not.toContain('[Repealed');
    expect(result[0].search_text).toContain('Notice employee');
    expect(result[0].search_text).toContain('termination');
  });

  it('strips repeal bracket from advisor_answer_en, keeps item', () => {
    const item = makeItem({
      content: 'Employees must be given notice.',
      advisor_answer_en: 'Based on s. 2: [Repealed, SOR/2019-168, s. 2] The employer must...',
    });
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(1);
    expect(result[0].advisor_answer_en).not.toContain('[Repealed');
    expect(result[0].advisor_answer_en).toContain('The employer must');
  });

  it('falls back to content when search_text becomes empty after stripping', () => {
    const item = makeItem({
      content: 'Employees must be given notice.',
      search_text: '[Repealed, SOR/2019-168, s. 2]',
    });
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(1);
    expect(result[0].search_text).toBe('Employees must be given notice.');
  });

  it('falls back to content when advisor_answer_en becomes empty after stripping', () => {
    const item = makeItem({
      content: 'Employees must be given notice.',
      advisor_answer_en: '[Abrogé, DORS/2019-168, art. 2]',
    });
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(1);
    expect(result[0].advisor_answer_en).toBe('Employees must be given notice.');
  });
});

describe('filterRetrievedGuidance — handles mixed arrays', () => {
  it('drops only items with empty content; keeps others', () => {
    const items: ScoredGuidanceItem[] = [
      makeItem({ id: 'clean-1', content: 'Valid guidance text.' }),
      makeItem({ id: 'repeal-1', content: '[Repealed]' }),
      makeItem({ id: 'clean-2', content: 'Another valid item.' }),
      makeItem({ id: 'repeal-2', content: '[Abrogé, DORS/2020-1, art. 1]' }),
    ];
    const result = filterRetrievedGuidance(items);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['clean-1', 'clean-2']);
  });

  it('handles item with no search_text or advisor_answer_en (uses content for both)', () => {
    const item: ScoredGuidanceItem = {
      id: 'no-search-text',
      category: 'general',
      province: 'ALL',
      title: 'No Search Text',
      content: 'Valid content only.',
      citations: [],
      keywords: [],
      score: 3,
      // search_text and advisor_answer_en intentionally absent
    };
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Valid content only.');
  });
});

describe('filterRetrievedGuidance — repeal bracket variants', () => {
  it.each([
    ['[Repealed, SOR/2019-168, s. 2]', 'SOR-style EN'],
    ['[Repealed]', 'bare EN'],
    ['[Abrogé, DORS/2020-1, art. 1]', 'SOR-style FR (é)'],
    ['[Abrogée, DORS/2020-1, art. 1]', 'SOR-style FR (ée)'],
    ['[REPEALED, SOR/2019-168, s. 2]', 'uppercase EN'],
  ])('strips "%s" (%s) from search_text', (bracket) => {
    const item = makeItem({
      content: 'Valid content.',
      search_text: `before ${bracket} after`,
    });
    const result = filterRetrievedGuidance([item]);
    expect(result).toHaveLength(1);
    expect(result[0].search_text).not.toContain('[');
    expect(result[0].search_text).toContain('before');
    expect(result[0].search_text).toContain('after');
  });
});
