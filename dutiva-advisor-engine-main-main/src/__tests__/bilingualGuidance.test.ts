/// <reference types="vitest/globals" />
/**
 * Bilingual runtime: guidance content/title is served in the requested locale and
 * flows into the LLM prompt, so a French request is grounded in validated French
 * source text (not a live English→French translation). Falls back to English when
 * no French version exists.
 */
import { buildAdvisorPrompt } from '../llm/buildAdvisorPrompt';
import {
  localizedContent,
  localizedTitle,
  localizedAnswer,
  deriveFrenchSearchText,
} from '../bilingual/localizeGuidance';
import { buildPipelineContext } from '../workspace/buildWorkspacePayload';
import type { ScoredGuidanceItem, GuidanceItem } from '../retrieval/guidanceTypes';
import type { Locale } from '../workspace/workspaceTypes';

const bilingualItem: ScoredGuidanceItem = {
  id: 'qc-pay',
  category: 'compensation',
  province: 'QC',
  score: 10,
  title: 'Québec Pay',
  title_fr: 'Salaire au Québec',
  content: 'The general minimum wage is reviewed annually.',
  content_fr: 'Le salaire minimum général est révisé chaque année.',
  citations: [{ statute: 'Act Respecting Labour Standards', shortForm: 'LNT' }],
  keywords: ['pay', 'québec'],
};

describe('localizeGuidance helpers', () => {
  test('localizedContent prefers French when available, English otherwise', () => {
    expect(localizedContent(bilingualItem, 'fr')).toContain('salaire minimum');
    expect(localizedContent(bilingualItem, 'en')).toContain('minimum wage');
  });

  test('localizedContent falls back to English when French is absent', () => {
    const englishOnly: Pick<GuidanceItem, 'content' | 'content_fr'> = { content: 'English only.' };
    expect(localizedContent(englishOnly, 'fr')).toBe('English only.');
  });

  test('localizedTitle selects by locale', () => {
    expect(localizedTitle(bilingualItem, 'fr')).toBe('Salaire au Québec');
    expect(localizedTitle(bilingualItem, 'en')).toBe('Québec Pay');
  });

  test('localizedAnswer prefers the most specific French field', () => {
    expect(localizedAnswer(bilingualItem, 'fr')).toContain('salaire');
    expect(localizedAnswer(bilingualItem, 'en')).toContain('minimum wage');
  });

  test('deriveFrenchSearchText translates English keywords via the FR terminology map', () => {
    const fr = deriveFrenchSearchText(['minimum wage', 'overtime', 'harassment']);
    expect(fr).toMatch(/salaire minimum/);
    expect(fr).toMatch(/heures supplémentaires/);
    expect(fr).toMatch(/harcèlement/);
  });
});

describe('buildAdvisorPrompt injects locale-appropriate guidance content', () => {
  const ctx = (locale: Locale) =>
    buildPipelineContext({
      sessionId: 'bilingual-test',
      userMessage: 'question',
      locale,
      province: 'QC',
      isFederallyRegulated: null,
      enableRetrieval: true,
      enableWorkspacePayload: true,
    });

  test('French request injects the French guidance text, not the English', () => {
    const system = buildAdvisorPrompt(ctx('fr'), [bilingualItem], 'hr_compliance_advisor')[0].content;
    expect(system).toContain('Le salaire minimum général est révisé');
    expect(system).toContain('Salaire au Québec');
    expect(system).not.toContain('The general minimum wage is reviewed');
  });

  test('English request injects the English guidance text', () => {
    const system = buildAdvisorPrompt(ctx('en'), [bilingualItem], 'hr_compliance_advisor')[0].content;
    expect(system).toContain('The general minimum wage is reviewed');
    expect(system).not.toContain('Le salaire minimum général');
  });
});
