/// <reference types="vitest/globals" />
/**
 * Prompt-level guidance filter regression tests.
 *
 * These are unit-level tests for filterRetrievedGuidanceForPromptAndWorkspace(),
 * the single safety boundary that ensures wrong-jurisdiction or unrelated-topic
 * guidance never reaches buildAdvisorPrompt().
 *
 * The filter is applied upstream in composeAdvisorResponse.ts before
 * buildAdvisorPrompt() is called.  These tests directly exercise the filter
 * function for every safety-relevant scenario: wrong jurisdiction, wrong topic,
 * unknown jurisdiction, personal-wellness routes, and cross-category pairs.
 *
 * For integration-level prompt-content regression tests (verifying the actual
 * messages array passed to the LLM does not contain unsafe guidance), see:
 *   src/__tests__/promptContentRegression.test.ts
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  filterRetrievedGuidanceForPromptAndWorkspace,
} from '../retrieval/filterRetrievedGuidance';
import type { ScoredGuidanceItem, GuidanceCategory } from '../retrieval/guidanceTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(
  overrides: Partial<ScoredGuidanceItem> & { province: ScoredGuidanceItem['province'] },
): ScoredGuidanceItem {
  return {
    id: `item-${overrides.province}-${overrides.category ?? 'general'}-${Math.random().toString(36).slice(2)}`,
    category: 'general' as GuidanceCategory,
    title: `Test ${overrides.province} ${overrides.category ?? 'general'}`,
    content: `Guidance content for ${overrides.province} ${overrides.category ?? 'general'} topic.`,
    citations: [],
    keywords: [],
    score: 5,
    ...overrides,
  };
}

// Representative items that would be in the corpus for various scenarios
const onHarassmentItem = makeItem({ province: 'ON', category: 'harassment', title: 'ON Harassment' });
const onAccommodationItem = makeItem({ province: 'ON', category: 'accommodation', title: 'ON Accommodation' });
const onTerminationItem = makeItem({ province: 'ON', category: 'termination', title: 'ON Termination' });
const onSafetyItem = makeItem({ province: 'ON', category: 'workplace_safety', title: 'ON Safety' });

const federalHarassmentItem = makeItem({ province: 'FEDERAL', category: 'harassment', title: 'Federal Harassment (CLC)' });
const federalHarassmentCHRAItem = makeItem({ province: 'FEDERAL', category: 'harassment', title: 'Federal CHRA Harassment' });
const federalTerminationItem = makeItem({ province: 'FEDERAL', category: 'termination', title: 'Federal Termination (CLC)' });
const federalAccommodationItem = makeItem({ province: 'FEDERAL', category: 'accommodation', title: 'Federal Accommodation (CHRA)', federalOnly: true });

const qcHarassmentItem = makeItem({ province: 'QC', category: 'harassment', title: 'QC Harassment (LNT)' });
const qcTerminationItem = makeItem({ province: 'QC', category: 'termination', title: 'QC Termination (ARLS)' });

const allHarassmentItem = makeItem({ province: 'ALL', category: 'harassment', title: 'ALL Harassment (Common Law)' });
const allGeneralItem = makeItem({ province: 'ALL', category: 'general', title: 'ALL General' });
const allTerminationItem = makeItem({ province: 'ALL', category: 'termination', title: 'ALL Termination' });
const allAccommodationItem = makeItem({ province: 'ALL', category: 'accommodation', title: 'ALL Accommodation' });

// A mixed corpus that would emerge from a keyword search for "harassment"
const MIXED_HARASSMENT_CORPUS: ScoredGuidanceItem[] = [
  onHarassmentItem,
  onAccommodationItem,   // wrong topic for harassment query
  onTerminationItem,     // wrong topic
  onSafetyItem,          // wrong topic
  federalHarassmentItem,
  federalHarassmentCHRAItem,
  federalTerminationItem, // wrong topic
  federalAccommodationItem,
  qcHarassmentItem,
  qcTerminationItem,     // wrong topic
  allHarassmentItem,
  allGeneralItem,
  allTerminationItem,    // wrong topic
];

// ─── Unit tests for filterRetrievedGuidanceForPromptAndWorkspace ─────────────

describe('filterRetrievedGuidanceForPromptAndWorkspace — Ontario harassment query', () => {
  it('returns only ON and ALL harassment items (not FEDERAL, QC, wrong topic)', () => {
    const result = filterRetrievedGuidanceForPromptAndWorkspace(MIXED_HARASSMENT_CORPUS, {
      jurisdiction: { status: 'known', province: 'ON', isFederallyRegulated: false },
      hasConflict: false,
      queryCategories: ['harassment'],
      routeIntent: 'harassment_or_workplace_violence',
    });

    const ids = result.items.map((i) => i.id);

    // Expected: ON harassment + ALL harassment + ALL general
    expect(ids).toContain(onHarassmentItem.id);
    expect(ids).toContain(allHarassmentItem.id);
    expect(ids).toContain(allGeneralItem.id);

    // Must NOT include federal items
    expect(ids).not.toContain(federalHarassmentItem.id);
    expect(ids).not.toContain(federalHarassmentCHRAItem.id);
    expect(ids).not.toContain(federalTerminationItem.id);
    expect(ids).not.toContain(federalAccommodationItem.id);

    // Must NOT include QC items
    expect(ids).not.toContain(qcHarassmentItem.id);
    expect(ids).not.toContain(qcTerminationItem.id);

    // Must NOT include unrelated-topic ON items
    expect(ids).not.toContain(onAccommodationItem.id);
    expect(ids).not.toContain(onTerminationItem.id);
    expect(ids).not.toContain(onSafetyItem.id);

    // Must NOT include ALL termination (wrong topic)
    expect(ids).not.toContain(allTerminationItem.id);
  });

  it('withheld count is non-zero (some items were filtered)', () => {
    const result = filterRetrievedGuidanceForPromptAndWorkspace(MIXED_HARASSMENT_CORPUS, {
      jurisdiction: { status: 'known', province: 'ON', isFederallyRegulated: false },
      queryCategories: ['harassment'],
    });
    expect(result.jurisdictionWithheld + result.topicWithheld).toBeGreaterThan(0);
  });
});

describe('filterRetrievedGuidanceForPromptAndWorkspace — Ontario accommodation query', () => {
  it('returns only ON+ALL accommodation; excludes harassment, safety, termination, federal CHRA unless federally regulated', () => {
    const corpus: ScoredGuidanceItem[] = [
      onAccommodationItem,
      onHarassmentItem,       // wrong topic
      onSafetyItem,           // wrong topic
      onTerminationItem,      // wrong topic
      federalAccommodationItem, // federalOnly + not isFederal → excluded
      allAccommodationItem,
      allGeneralItem,
      allHarassmentItem,      // wrong topic
    ];

    const result = filterRetrievedGuidanceForPromptAndWorkspace(corpus, {
      jurisdiction: { status: 'known', province: 'ON', isFederallyRegulated: false },
      queryCategories: ['accommodation'],
    });

    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(onAccommodationItem.id);
    expect(ids).toContain(allAccommodationItem.id);
    expect(ids).toContain(allGeneralItem.id);

    // federalOnly items excluded for non-federal ON query
    expect(ids).not.toContain(federalAccommodationItem.id);
    // Wrong topics
    expect(ids).not.toContain(onHarassmentItem.id);
    expect(ids).not.toContain(onSafetyItem.id);
    expect(ids).not.toContain(onTerminationItem.id);
    expect(ids).not.toContain(allHarassmentItem.id);
  });
});

describe('filterRetrievedGuidanceForPromptAndWorkspace — Québec harassment query', () => {
  it('returns only QC and ALL harassment items; excludes ON and FEDERAL', () => {
    const result = filterRetrievedGuidanceForPromptAndWorkspace(MIXED_HARASSMENT_CORPUS, {
      jurisdiction: { status: 'known', province: 'QC', isFederallyRegulated: false },
      queryCategories: ['harassment'],
    });

    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(qcHarassmentItem.id);
    expect(ids).toContain(allHarassmentItem.id);
    expect(ids).toContain(allGeneralItem.id);

    // Must NOT include ON items
    expect(ids).not.toContain(onHarassmentItem.id);
    expect(ids).not.toContain(onAccommodationItem.id);
    expect(ids).not.toContain(onTerminationItem.id);

    // Must NOT include FEDERAL items
    expect(ids).not.toContain(federalHarassmentItem.id);
    expect(ids).not.toContain(federalHarassmentCHRAItem.id);
  });
});

describe('filterRetrievedGuidanceForPromptAndWorkspace — Federal harassment query', () => {
  it('returns only FEDERAL and ALL items; excludes ON and QC', () => {
    const result = filterRetrievedGuidanceForPromptAndWorkspace(MIXED_HARASSMENT_CORPUS, {
      jurisdiction: { status: 'known', province: 'FEDERAL', isFederallyRegulated: true },
      queryCategories: ['harassment'],
    });

    const ids = result.items.map((i) => i.id);

    // FEDERAL harassment items pass
    expect(ids).toContain(federalHarassmentItem.id);
    expect(ids).toContain(federalHarassmentCHRAItem.id);
    // ALL harassment + general pass
    expect(ids).toContain(allHarassmentItem.id);
    expect(ids).toContain(allGeneralItem.id);

    // ON items excluded
    expect(ids).not.toContain(onHarassmentItem.id);
    expect(ids).not.toContain(onAccommodationItem.id);
    expect(ids).not.toContain(onTerminationItem.id);
    expect(ids).not.toContain(onSafetyItem.id);

    // QC items excluded
    expect(ids).not.toContain(qcHarassmentItem.id);
    expect(ids).not.toContain(qcTerminationItem.id);

    // FEDERAL termination excluded (wrong topic)
    expect(ids).not.toContain(federalTerminationItem.id);
  });
});

describe('filterRetrievedGuidanceForPromptAndWorkspace — Unknown jurisdiction', () => {
  it('returns only ALL-province items regardless of topic query', () => {
    const result = filterRetrievedGuidanceForPromptAndWorkspace(MIXED_HARASSMENT_CORPUS, {
      jurisdiction: { status: 'unknown', province: null },
      queryCategories: ['harassment'],
    });

    const ids = result.items.map((i) => i.id);

    // Only ALL items survive jurisdiction filter
    for (const item of result.items) {
      expect(item.province).toBe('ALL');
    }

    // No province-specific items
    expect(ids).not.toContain(onHarassmentItem.id);
    expect(ids).not.toContain(federalHarassmentItem.id);
    expect(ids).not.toContain(qcHarassmentItem.id);
  });

  it('ALL-province wrong-topic items are still removed by topic filter', () => {
    const corpus: ScoredGuidanceItem[] = [
      allHarassmentItem,
      allTerminationItem, // wrong topic for harassment query
      allGeneralItem,
      onHarassmentItem,
    ];

    const result = filterRetrievedGuidanceForPromptAndWorkspace(corpus, {
      jurisdiction: { status: 'unknown', province: null },
      queryCategories: ['harassment'],
    });

    const ids = result.items.map((i) => i.id);
    expect(ids).toContain(allHarassmentItem.id);
    expect(ids).toContain(allGeneralItem.id);
    expect(ids).not.toContain(allTerminationItem.id);
    expect(ids).not.toContain(onHarassmentItem.id); // province-specific excluded
  });
});

describe('filterRetrievedGuidanceForPromptAndWorkspace — federalOnly flag', () => {
  it('federalOnly items excluded for non-federal provincial query', () => {
    const federalOnlyItem = makeItem({ province: 'FEDERAL', category: 'accommodation', federalOnly: true, title: 'Federal-Only CHRA' });
    const result = filterRetrievedGuidanceForPromptAndWorkspace([federalOnlyItem, allAccommodationItem], {
      jurisdiction: { status: 'known', province: 'ON', isFederallyRegulated: false },
      queryCategories: ['accommodation'],
    });
    expect(result.items.map((i) => i.id)).not.toContain(federalOnlyItem.id);
    expect(result.items.map((i) => i.id)).toContain(allAccommodationItem.id);
  });

  it('federalOnly items included when isFederallyRegulated === true', () => {
    const federalOnlyItem = makeItem({ province: 'FEDERAL', category: 'accommodation', federalOnly: true, title: 'Federal-Only CHRA' });
    const result = filterRetrievedGuidanceForPromptAndWorkspace([federalOnlyItem, allAccommodationItem], {
      jurisdiction: { status: 'known', province: 'FEDERAL', isFederallyRegulated: true },
      queryCategories: ['accommodation'],
    });
    expect(result.items.map((i) => i.id)).toContain(federalOnlyItem.id);
  });
});

describe('filterRetrievedGuidanceForPromptAndWorkspace — conflict flag', () => {
  it('hasConflict=true falls back to ALL-only even when jurisdiction is known', () => {
    const result = filterRetrievedGuidanceForPromptAndWorkspace(
      [onHarassmentItem, allHarassmentItem, federalHarassmentItem],
      {
        jurisdiction: { status: 'known', province: 'ON' },
        hasConflict: true,
        queryCategories: ['harassment'],
      },
    );
    for (const item of result.items) {
      expect(item.province).toBe('ALL');
    }
  });
});

describe('filterRetrievedGuidanceForPromptAndWorkspace — no jurisdiction supplied', () => {
  it('skips jurisdiction filter when no jurisdiction option provided', () => {
    // No jurisdiction → repeal-bracket and topic filters only
    const corpus = [onHarassmentItem, federalHarassmentItem, qcHarassmentItem, allHarassmentItem, onTerminationItem];
    const result = filterRetrievedGuidanceForPromptAndWorkspace(corpus, {
      queryCategories: ['harassment'],
    });
    const ids = result.items.map((i) => i.id);
    // All harassment items pass (no jurisdiction filter)
    expect(ids).toContain(onHarassmentItem.id);
    expect(ids).toContain(federalHarassmentItem.id);
    expect(ids).toContain(qcHarassmentItem.id);
    expect(ids).toContain(allHarassmentItem.id);
    // Wrong topic still excluded
    expect(ids).not.toContain(onTerminationItem.id);
  });
});

describe('filterRetrievedGuidanceForPromptAndWorkspace — personal wellness / crisis routes', () => {
  it('personal wellness route with no topic categories and personal_mental_health intent passes all items (no topic narrowing)', () => {
    // Personal wellness is not a GuidanceCategory topic — the filter should allow all items
    // when intent is not mappable to specific categories (intent fallback returns [])
    const corpus = [allGeneralItem, allAccommodationItem];
    const result = filterRetrievedGuidanceForPromptAndWorkspace(corpus, {
      jurisdiction: { status: 'unknown', province: null },
      queryCategories: [],
      routeIntent: 'personal_mental_health', // not mappable → no topic narrowing
    });
    // ALL items pass jurisdiction filter (unknown → ALL only is enforced)
    // No topic narrowing → all passing items remain
    expect(result.items.length).toBe(corpus.length);
  });

  it('passes empty input through cleanly', () => {
    const result = filterRetrievedGuidanceForPromptAndWorkspace([], {
      jurisdiction: { status: 'unknown', province: null },
      queryCategories: ['harassment'],
    });
    expect(result.items).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('filterRetrievedGuidanceForPromptAndWorkspace — repeal bracket stripping with full filter', () => {
  it('drops items whose content is entirely a repeal bracket even with jurisdiction match', () => {
    const repealedItem = makeItem({ province: 'ON', category: 'harassment', content: '[Repealed, SOR/2019-168, s. 2]' });
    const result = filterRetrievedGuidanceForPromptAndWorkspace([repealedItem, onHarassmentItem], {
      jurisdiction: { status: 'known', province: 'ON', isFederallyRegulated: false },
      queryCategories: ['harassment'],
    });
    expect(result.items.map((i) => i.id)).not.toContain(repealedItem.id);
    expect(result.items.map((i) => i.id)).toContain(onHarassmentItem.id);
    expect(result.repealStripped).toBe(1);
  });

  it('strips repeal bracket from search_text but keeps item when content is clean', () => {
    const item = makeItem({
      province: 'ON',
      category: 'harassment',
      content: 'Clean content about harassment.',
      search_text: 'Harassment [Repealed, SOR/2019-168, s. 2] policy',
    });
    const result = filterRetrievedGuidanceForPromptAndWorkspace([item], {
      jurisdiction: { status: 'known', province: 'ON' },
      queryCategories: ['harassment'],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].search_text).not.toContain('[Repealed');
    expect(result.items[0].content).toBe('Clean content about harassment.');
    expect(result.repealStripped).toBe(0);
  });
});

describe('filterRetrievedGuidanceForPromptAndWorkspace — result metadata', () => {
  it('returns accurate withheld counts', () => {
    const corpus = [
      onHarassmentItem,    // pass (ON + harassment)
      onTerminationItem,   // fail topic
      federalHarassmentItem, // fail jurisdiction (ON query)
      allHarassmentItem,   // pass (ALL + harassment)
    ];
    const result = filterRetrievedGuidanceForPromptAndWorkspace(corpus, {
      jurisdiction: { status: 'known', province: 'ON', isFederallyRegulated: false },
      queryCategories: ['harassment'],
    });
    expect(result.items).toHaveLength(2); // ON + ALL harassment
    expect(result.jurisdictionWithheld).toBe(1); // federalHarassmentItem
    expect(result.topicWithheld).toBe(1); // onTerminationItem
    expect(result.repealStripped).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
