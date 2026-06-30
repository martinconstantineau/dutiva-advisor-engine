/// <reference types="vitest/globals" />
/**
 * Unit coverage for the consolidated topic classifier — the single source of
 * truth now shared by composeAdvisorResponse and filterRetrievedGuidance
 * (previously two independent copies, plus a third dead one in
 * normalizeGuidanceText).
 */
import { getQueryTopicCategories, topicCategoriesFromIntent } from '../retrieval/topicClassification';

describe('getQueryTopicCategories — message → GuidanceCategory[]', () => {
  test('compensation terms (EN + FR)', () => {
    expect(getQueryTopicCategories('What is the overtime rule?')).toContain('compensation');
    expect(getQueryTopicCategories('heures supplémentaires')).toContain('compensation');
  });

  test('harassment terms', () => {
    expect(getQueryTopicCategories('a workplace harassment complaint')).toContain('harassment');
  });

  test('medical disclosure implies accommodation context', () => {
    const cats = getQueryTopicCategories('What functional limitations are on the doctor note?');
    expect(cats).toContain('medical_disclosure');
    expect(cats).toContain('accommodation');
  });

  test('termination terms (EN + FR)', () => {
    expect(getQueryTopicCategories('I was fired without cause')).toContain('termination');
    expect(getQueryTopicCategories('préavis de congédiement')).toContain('termination');
  });

  test('returns empty for a broad/topic-less query', () => {
    expect(getQueryTopicCategories('What changed this year?')).toEqual([]);
  });
});

describe('topicCategoriesFromIntent — intent → GuidanceCategory[]', () => {
  test('maps known intents', () => {
    expect(topicCategoriesFromIntent('employee_medical_or_accommodation')).toEqual(['accommodation', 'medical_disclosure']);
    expect(topicCategoriesFromIntent('harassment_or_workplace_violence')).toEqual(['harassment']);
    expect(topicCategoriesFromIntent('termination_or_discipline')).toEqual(['termination']);
    expect(topicCategoriesFromIntent('leave_or_absence')).toEqual(['leave']);
    expect(topicCategoriesFromIntent('pay_hours_or_entitlements')).toEqual(['compensation']);
  });

  test('returns empty for general/unmapped intents', () => {
    expect(topicCategoriesFromIntent('general_hr_compliance')).toEqual([]);
    expect(topicCategoriesFromIntent('out_of_scope')).toEqual([]);
  });
});
