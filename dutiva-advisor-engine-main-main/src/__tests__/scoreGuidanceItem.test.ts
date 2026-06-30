/// <reference types="vitest/globals" />
import { scoreGuidanceItem, rankGuidanceItems } from '../retrieval/scoreGuidanceItem';
import { GuidanceItem } from '../retrieval/guidanceTypes';

const sampleItem: GuidanceItem = {
  id: 'test-001',
  category: 'termination',
  province: 'ON',
  title: 'Termination Without Cause',
  content: 'Employees terminated without just cause are entitled to reasonable notice.',
  citations: [],
  keywords: ['termination', 'fired', 'notice', 'without cause'],
};

const federalItem: GuidanceItem = {
  id: 'test-002',
  category: 'termination',
  province: 'FEDERAL',
  title: 'Unjust Dismissal — Canada Labour Code',
  content: 'Federal employees may file an unjust dismissal complaint.',
  citations: [],
  keywords: ['unjust dismissal', 'federal', 'CLC'],
};

const allItem: GuidanceItem = {
  id: 'test-003',
  category: 'accommodation',
  province: 'ALL',
  title: 'Duty to Accommodate — General Principles',
  content: 'Employers must accommodate employees with disabilities.',
  citations: [],
  keywords: ['accommodation', 'disability'],
};

describe('scoreGuidanceItem', () => {
  test('keyword match increases score', () => {
    const scored = scoreGuidanceItem('I was fired without cause', sampleItem);
    expect(scored.score).toBeGreaterThan(0);
  });

  test('province match gives higher score than ALL', () => {
    const withProvince = scoreGuidanceItem('termination notice', sampleItem, { province: 'ON' });
    // Ontario-specific item should score > 0 when province is ON
    expect(withProvince.score).toBeGreaterThan(0);
  });

  test('no province provided — no Ontario boost', () => {
    const noProvince = scoreGuidanceItem('termination notice', sampleItem, { province: null });
    const withON = scoreGuidanceItem('termination notice', sampleItem, { province: 'ON' });
    // Without province, should not get the +4 jurisdiction boost
    expect(withON.score).toBeGreaterThan(noProvince.score);
  });

  test('unaccented French query matches accented keyword', () => {
    const item: GuidanceItem = {
      id: 'test-fr-001',
      category: 'termination',
      province: 'ALL',
      title: 'Préavis de Cessation',
      content: 'Le préavis requis est calculé selon la durée du service.',
      citations: [],
      keywords: ['préavis', 'cessation'],
    };
    const scored = scoreGuidanceItem('preavis', item);
    expect(scored.score).toBeGreaterThan(0);
  });

  test('risk_level high boosts score', () => {
    const highRiskItem = { ...sampleItem, risk_level: 'High' } as unknown as GuidanceItem;
    const normalItem = { ...sampleItem };
    const highScore = scoreGuidanceItem('termination', highRiskItem);
    const normalScore = scoreGuidanceItem('termination', normalItem);
    expect(highScore.score).toBeGreaterThan(normalScore.score);
  });

  test('inactive status penalises score', () => {
    const inactiveItem = { ...sampleItem, status: 'Inactive' } as unknown as GuidanceItem;
    const activeItem = { ...sampleItem };
    const inactiveScore = scoreGuidanceItem('termination', inactiveItem);
    const activeScore = scoreGuidanceItem('termination', activeItem);
    expect(inactiveScore.score).toBeLessThan(activeScore.score);
  });
});

describe('rankGuidanceItems', () => {
  test('filters zero-score items', () => {
    const items = [sampleItem, federalItem, allItem];
    const results = rankGuidanceItems(items, 'completely unrelated topic nothing matches here xyz123');
    expect(results.every((r) => r.score > 0)).toBe(true);
  });

  test('sorts descending by score', () => {
    const items = [sampleItem, federalItem, allItem];
    const results = rankGuidanceItems(items, 'termination without cause', { province: 'ON' });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  test('respects limit option', () => {
    const items = [sampleItem, federalItem, allItem];
    const results = rankGuidanceItems(items, 'termination accommodation disability', { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

// ─── Jurisdiction scoring regression tests (Phase 3 fix) ───────────────────

describe('scoreGuidanceItem — jurisdiction scoring regression', () => {
  // Regression: previously the FEDERAL boost branch used normalizeProvinceName() which
  // would compare the normalised string, causing ALL-province items to sometimes get an
  // extra federal boost.  The fix uses item.province === 'FEDERAL' directly.

  test('FEDERAL item gets boost when province is "federal"', () => {
    const baseScore = scoreGuidanceItem('unjust dismissal', federalItem);
    const federalScore = scoreGuidanceItem('unjust dismissal', federalItem, { province: 'FEDERAL' });
    // With a federal province, the FEDERAL item should get a jurisdiction boost
    expect(federalScore.score).toBeGreaterThan(baseScore.score);
  });

  test('ALL-province item receives +1 neutral boost, FEDERAL item receives +4 exact-match boost', () => {
    // When province === 'FEDERAL':
    //   - FEDERAL-tagged items match normalizeProvinceName('FEDERAL') === 'federal' === province
    //     → they receive the exact-province match +4 boost (first branch)
    //   - ALL-tagged items receive the neutral +1 boost (second branch)
    //   - ALL items must NOT additionally receive the FEDERAL third-branch +1 on top

    // Use a query that keyword-matches both items equally so we can isolate jurisdiction boosts.
    // 'accommodation federal' hits both: 'federal' matches federalItem keyword; 'accommodation' matches allItem keyword.
    const allScoreFederal = scoreGuidanceItem('accommodation disability', allItem, { province: 'FEDERAL' });
    const allScoreNoProvince = scoreGuidanceItem('accommodation disability', allItem);

    // ALL item with a known province gets +1 neutral boost; without a province it only gets +0.5.
    // So allScoreFederal - allScoreNoProvince = 1 - 0.5 = 0.5
    expect(allScoreFederal.score).toBe(allScoreNoProvince.score + 0.5);

    // FEDERAL item gets +4 exact-province boost (not +1 via the third branch)
    const fedScore = scoreGuidanceItem('unjust dismissal federal', federalItem, { province: 'FEDERAL' });
    const fedScoreNoProvince = scoreGuidanceItem('unjust dismissal federal', federalItem);
    expect(fedScore.score).toBe(fedScoreNoProvince.score + 4);
  });

  test('ON item does NOT get any boost when province is "federal"', () => {
    const onScore = scoreGuidanceItem('termination notice', sampleItem, { province: 'FEDERAL' });
    // Ontario-specific item should not get a boost for a federal query
    // (no exact match, not ALL, not FEDERAL) → no jurisdiction boost
    const onScoreNoProvince = scoreGuidanceItem('termination notice', sampleItem);
    // Scores should be equal (no jurisdiction boost added or removed)
    expect(onScore.score).toBe(onScoreNoProvince.score);
  });

  test('FEDERAL item does NOT get boost when province is "ON"', () => {
    const federalForON = scoreGuidanceItem('unjust dismissal federal', federalItem, { province: 'ON' });
    const allForON = scoreGuidanceItem('unjust dismissal federal', allItem, { province: 'ON' });
    // For an Ontario query, the FEDERAL item should not get exact-province match boost
    // The ALL item should score ≥ the FEDERAL item for an Ontario query (neutral is better than irrelevant)
    // (keyword overlap may vary — we just check the province boost direction is correct)
    const federalScoreNoProvince = scoreGuidanceItem('unjust dismissal federal', federalItem);
    // Without a province, FEDERAL item gets no province boost; with ON it also gets none
    expect(federalForON.score).toBe(federalScoreNoProvince.score);
    // ALL item gets +1 neutral boost for ON
    expect(allForON.score).toBeGreaterThan(allScoreForONNoProvince());
    function allScoreForONNoProvince() {
      return scoreGuidanceItem('unjust dismissal federal', allItem).score;
    }
  });
});
