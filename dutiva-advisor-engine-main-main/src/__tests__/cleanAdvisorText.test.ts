/// <reference types="vitest/globals" />
import { cleanAdvisorText, cleanLabel } from '../core/cleanAdvisorText';

describe('cleanAdvisorText', () => {
  test('removes bold markers', () => {
    expect(cleanAdvisorText('**Regular Exercise:** Engaging in physical activity can help.')).not.toContain('**');
  });

  test('removes italic markers', () => {
    expect(cleanAdvisorText('*Mindfulness and Meditation:* Consider breathing exercises.')).not.toContain('*');
  });

  test('removes heading markers', () => {
    const result = cleanAdvisorText('## Professional Help\nConsider support.');
    expect(result).not.toContain('##');
    expect(result).toContain('Professional Help');
  });

  test('cleans numbered-list Markdown emphasis', () => {
    const input = '1. **Professional Help:** Consider support.';
    const result = cleanAdvisorText(input);
    expect(result).not.toContain('**');
  });

  test('does not destroy legally meaningful punctuation', () => {
    const citation = 'Employment Standards Act, 2000 (ESA), s. 57(1)(a)-(b)';
    const result = cleanAdvisorText(citation);
    expect(result).toContain('ESA');
    expect(result).toContain('s. 57');
  });

  test('handles non-string input', () => {
    expect(cleanAdvisorText(null)).toBe('');
    expect(cleanAdvisorText(undefined)).toBe('');
  });

  test('strips underscore emphasis at word boundaries', () => {
    expect(cleanAdvisorText('This is _important_ context.')).toBe('This is important context.');
    expect(cleanAdvisorText('Use __bold__ sparingly.')).toBe('Use bold sparingly.');
  });

  test('preserves intra-word underscores in identifiers', () => {
    expect(cleanAdvisorText('Map the value into company_name_field exactly.')).toContain('company_name_field');
    expect(cleanAdvisorText('Set the column to employee_start_date.')).toContain('employee_start_date');
  });
});

describe('cleanLabel', () => {
  test('strips bold from label', () => {
    expect(cleanLabel('**Regular Exercise:**')).toBe('Regular Exercise:');
  });
});
