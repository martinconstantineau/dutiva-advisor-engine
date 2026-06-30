/// <reference types="vitest/globals" />
/**
 * Regression tests for parse-laws-lois-xml.ts parsing logic.
 *
 * These tests verify the behavior of key pure functions from the XML parser
 * pipeline using fast-xml-parser directly — the helpers below mirror the
 * internal logic of the pipeline script so these tests run under Vitest
 * without importing the pipeline file itself.
 *
 * Covers:
 *   - findRoot: must skip ?xml processing-instruction pseudo-keys so that files
 *     beginning with <?xml version="1.0"?> are handled the same as those without.
 *   - looksRepealed: must detect nested Text.Repealed patterns, not only direct
 *     text-node content, to avoid leaking repealed provisions into the guidance layer.
 */

import { XMLParser } from 'fast-xml-parser';

// ─── Helpers (mirrors parse-laws-lois-xml.ts internal logic) ─────────────────

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  preserveOrder: false,
  parseTagValue: false,
  parseAttributeValue: false,
  stopNodes: ['*.Table'],
};

function findRoot(document: Record<string, unknown>): { rootName: string; root: unknown } {
  // Filter out XML processing-instruction pseudo-keys (e.g. "?xml")
  const keys = Object.keys(document ?? {}).filter((k) => !k.startsWith('?'));
  if (keys.length === 1 && typeof document[keys[0]] === 'object') {
    return { rootName: keys[0], root: document[keys[0]] };
  }
  return { rootName: 'Document', root: document };
}

function directTextOf(node: Record<string, unknown>): string {
  if (!node || typeof node !== 'object') return '';
  const parts: string[] = [];
  if (typeof node['#text'] === 'string') parts.push(node['#text']);
  for (const key of ['Text', 'ProvisionText', 'SectionText']) {
    const val = node[key];
    if (typeof val === 'string') parts.push(val);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).replace(/\s+/g, ' ').trim();
  }
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.entries(obj)
      .filter(([k]) => !k.startsWith('@_'))
      .map(([, v]) => textOf(v))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

function looksRepealed(node: Record<string, unknown>): boolean {
  // 1. Fast-path: direct text fields
  const direct = directTextOf(node);
  if (/\b(repealed|abrogé|abroge|abrogée)\b/i.test(direct)) return true;

  // 2. Explicit <Repealed> child element
  if (node?.['Repealed']) return true;

  // 3. Nested repeal inside Text/ProvisionText objects
  for (const key of ['Text', 'ProvisionText', 'SectionText', 'SubsectionText', 'ParagraphText']) {
    const child = node?.[key];
    if (!child || typeof child !== 'object') continue;
    const childObj = child as Record<string, unknown>;
    if (childObj['Repealed']) return true;
    const childText = textOf(child);
    if (/\b(repealed|abrogé|abroge|abrogée)\b/i.test(childText)) return true;
  }

  // 4. @_status attribute
  const status = node?.['@_status'] ?? '';
  if (/repealed|abrogé/i.test(String(status))) return true;

  return false;
}

// ─── findRoot tests ──────────────────────────────────────────────────────────

describe('findRoot — processing-instruction filtering', () => {
  it('returns the single content element when document has only one content key', () => {
    const doc = { Statute: { Identification: {}, Body: {} } };
    const { rootName, root } = findRoot(doc as unknown as Record<string, unknown>);
    expect(rootName).toBe('Statute');
    expect(root).toBe(doc.Statute);
  });

  it('skips the ?xml pseudo-key when parsing XML with a declaration', () => {
    const parser = new XMLParser(PARSER_OPTIONS);
    const xml = '<?xml version="1.0" encoding="utf-8"?><Statute xml:lang="en"><Identification><ShortTitle>Test Act</ShortTitle></Identification></Statute>';
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const allKeys = Object.keys(parsed);
    // fast-xml-parser adds a ?xml key for the declaration
    expect(allKeys).toContain('?xml');
    // findRoot must skip it and return Statute as the root
    const { rootName, root } = findRoot(parsed);
    expect(rootName).toBe('Statute');
    expect(root).toBeTruthy();
  });

  it('after findRoot fix, xml:lang attribute is accessible on the root node', () => {
    const parser = new XMLParser(PARSER_OPTIONS);
    const xml = '<?xml version="1.0" encoding="utf-8"?><Statute xml:lang="en"><Body/></Statute>';
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const { root } = findRoot(parsed);
    const lang = (root as Record<string, unknown>)['@_xml:lang'];
    expect(lang).toBe('en');
  });

  it('returns the root without ?xml when there is no XML declaration', () => {
    const parser = new XMLParser(PARSER_OPTIONS);
    const xml = '<Act xml:lang="en"><Body/></Act>';
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const { rootName, root } = findRoot(parsed);
    expect(rootName).toBe('Act');
    const lang = (root as Record<string, unknown>)['@_xml:lang'];
    expect(lang).toBe('en');
  });

  it('falls back to Document root when document has multiple content keys', () => {
    // Edge case: multiple top-level elements (invalid XML but parser may produce it)
    const doc: Record<string, unknown> = { ElementA: {}, ElementB: {} };
    const { rootName } = findRoot(doc);
    expect(rootName).toBe('Document');
  });

  it('findRoot with declaration allows ShortTitle to be found via walker', () => {
    const parser = new XMLParser(PARSER_OPTIONS);
    const xml = '<?xml version="1.0" encoding="utf-8"?><Statute xml:lang="en"><Identification><ShortTitle>Canada Labour Code</ShortTitle></Identification></Statute>';
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const { root } = findRoot(parsed);
    const statute = root as Record<string, unknown>;
    const identification = statute['Identification'] as Record<string, unknown>;
    const shortTitle = identification?.['ShortTitle'];
    // ShortTitle may be a string or object with #text
    const title = typeof shortTitle === 'string' ? shortTitle : textOf(shortTitle);
    expect(title).toBe('Canada Labour Code');
  });
});

// ─── looksRepealed tests ──────────────────────────────────────────────────────

describe('looksRepealed — nested repeal detection', () => {
  it('returns false for a normal active section', () => {
    const node: Record<string, unknown> = {
      Label: '1',
      Text: 'This section defines the obligations of employers.',
    };
    expect(looksRepealed(node)).toBe(false);
  });

  it('returns true when #text contains "Repealed" directly', () => {
    const node: Record<string, unknown> = {
      '#text': '[Repealed, SOR/2019-168, s. 2]',
    };
    expect(looksRepealed(node)).toBe(true);
  });

  it('returns true when a child Repealed element exists', () => {
    const node: Record<string, unknown> = {
      Repealed: '[Repealed, 2021]',
    };
    expect(looksRepealed(node)).toBe(true);
  });

  it('returns true when Text is an object containing a Repealed child (C.R.C. pattern)', () => {
    // Matches the real XML shape:
    // <Section><Label>1</Label><Text><Repealed>[Repealed, SOR/2019-168, s. 2]</Repealed></Text></Section>
    const node: Record<string, unknown> = {
      Label: '1',
      Text: {
        Repealed: '[Repealed, SOR/2019-168, s. 2]',
      },
    };
    expect(looksRepealed(node)).toBe(true);
  });

  it('returns true when Text is an object whose text content contains the word "repealed"', () => {
    const node: Record<string, unknown> = {
      Label: '2',
      Text: {
        '#text': '[Repealed, 2020-05-01]',
      },
    };
    expect(looksRepealed(node)).toBe(true);
  });

  it('returns true when @_status is "repealed"', () => {
    const node: Record<string, unknown> = {
      '#text': 'Some provision text',
      '@_status': 'repealed',
    };
    expect(looksRepealed(node)).toBe(true);
  });

  it('returns true for French repeal marker "abrogé"', () => {
    const node: Record<string, unknown> = {
      Text: {
        Repealed: '[Abrogé, DORS/2019-168, art. 2]',
      },
    };
    expect(looksRepealed(node)).toBe(true);
  });

  it('returns false for a node with Text as a plain object with no repeal content', () => {
    const node: Record<string, unknown> = {
      Label: '3',
      Text: {
        '#text': 'Every employer shall maintain records.',
      },
    };
    expect(looksRepealed(node)).toBe(false);
  });
});
