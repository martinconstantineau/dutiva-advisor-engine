#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const DEFAULT_INPUT_DIR = path.resolve('advisor-training/raw-laws');
const DEFAULT_OUTPUT_DIR = path.resolve('advisor-training/parsed');
const PARSER_VERSION = '1.0.0';

const PROVISION_NODE_NAMES = new Set([
  'Section',
  'Subsection',
  'Paragraph',
  'Subparagraph',
  'Clause',
  'Subclause',
  'Definition',
  'Item',
]);

const CONTAINER_NODE_NAMES = new Set([
  'Act',
  'Regulation',
  'Instrument',
  'Part',
  'Division',
  'Subdivision',
  'Schedule',
  'Chapter',
  'Heading',
]);

const TITLE_KEYS = ['ShortTitle', 'LongTitle', 'TitleText', 'Title', 'Heading'];
const LABEL_KEYS = ['Label', 'Number', 'Num', 'SectionNumber', 'ProvisionNumber', 'DefinitionTerm'];
const HEADING_KEYS = ['Heading', 'MarginalNote', 'TitleText', 'Title'];
const BODY_TEXT_KEYS = ['Text', 'ProvisionText', 'SectionText', 'SubsectionText', 'ParagraphText', 'DefinitionText'];
const IGNORED_TEXT_KEYS = new Set(['Label', 'Number', 'Num', 'Heading', 'MarginalNote', 'HistoricalNote', 'Footnote', 'Repealed', 'PreviousVersion']);

// ── Types ────────────────────────────────────────────────────────────────────

type XmlNode = Record<string, unknown>;

interface Reference {
  raw: string;
  target_label: string;
  index: number;
}

interface ContainerFrame {
  type: string;
  label: string | null;
  heading: string | null;
  xml_path: string;
}

interface ProvisionFrame {
  id: string;
  type: string;
  label: string | null;
  index: number;
}

interface DocumentMetadata {
  source_file: string;
  source: string;
  jurisdiction: string;
  language: string;
  law_title: string;
  short_title: string | null;
  long_title: string | null;
  consolidation_date: string | null;
}

interface ProvisionRecord {
  id: string;
  parent_id: string | null;
  children_ids: string[];
  content_hash: string;
  source_file: string;
  source: string;
  parser_version: string;
  run_id: string;
  jurisdiction: string;
  language: string;
  law_title: string;
  short_title: string | null;
  long_title: string | null;
  consolidation_date: string | null;
  node_type: string;
  section_number: string | null;
  heading: string | null;
  text: string;
  references: Reference[];
  is_repealed_or_inactive: boolean;
  hierarchy: string[];
  xml_path: string;
  structural_context: ContainerFrame[];
  citation_hint: string;
  attributes: Record<string, unknown>;
  quality_warnings: string[];
  metadata: { root_node: string; sibling_index: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeWhitespace(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Sub-element tags whose text must never be merged into the English provision body.
 *
 * <DefinedTermFr> is the French label of an inline bilingual definition, e.g.
 *   <DefinedTermEn>Act</DefinedTermEn> means Part III of the
 *   <XRefExternal>Canada Labour Code</XRefExternal>; (<DefinedTermFr>Loi</DefinedTermFr>)
 * Because the parser runs with preserveOrder:false, all child fragments are
 * bucketed by tag name and reordered, so leaving the French term in interleaves
 * it into the reconstructed English text ("Act Canada Labour Code Loi means …").
 * It is the French term of an English provision and is dropped here.
 */
const EXCLUDED_TEXT_SUBKEYS = new Set(['DefinedTermFr']);

function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return normalizeWhitespace(value);
  if (Array.isArray(value)) return normalizeWhitespace(value.map(textOf).filter(Boolean).join(' '));
  if (typeof value === 'object') return normalizeWhitespace(Object.entries(value as XmlNode).filter(([key]) => !key.startsWith('@_') && !EXCLUDED_TEXT_SUBKEYS.has(key)).map(([, child]) => textOf(child)).filter(Boolean).join(' '));
  return '';
}

/**
 * Remove artifacts left behind once excluded sub-elements (e.g. <DefinedTermFr>)
 * are dropped from inline bilingual definitions: empty parentheses and a dangling
 * trailing semicolon (".. means Part III of the Canada Labour Code; ()" → "..").
 */
function cleanInlineArtifacts(text: string): string {
  return text
    .replace(/\(\s*\)/g, '')   // empty parens left by a removed term
    .replace(/\s*;\s*$/g, '')  // trailing semicolon
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function firstText(node: XmlNode | null | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = textOf(node?.[key]);
    if (value) return value;
  }
  return '';
}

function stableId(parts: string[]): string {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 24);
}

function contentHash(text: string): string {
  return crypto.createHash('sha256').update(normalizeWhitespace(text).toLowerCase()).digest('hex');
}

function inferLanguage(filename: string, xmlLangAttr = ''): string {
  if (xmlLangAttr) {
    const lang = xmlLangAttr.toLowerCase();
    if (lang.includes('fr')) return 'fr';
    if (lang.includes('en')) return 'en';
    return 'unknown';
  }
  const normalized = filename.toLowerCase().replace(/\\/g, '/');
  if (normalized.includes('/fra/') || normalized.includes('-fra') || normalized.includes('_fra') || /(^|[._-])fra([._-]|$)/.test(normalized)) return 'fr';
  if (normalized.includes('/eng/') || normalized.includes('-eng') || normalized.includes('_eng') || /(^|[._-])eng([._-]|$)/.test(normalized)) return 'en';
  return 'unknown';
}

function findRoot(document: XmlNode): { rootName: string; root: XmlNode } {
  // Filter out XML processing-instruction pseudo-keys emitted by fast-xml-parser
  // (e.g. "?xml" from <?xml version="1.0"?>) so that files that begin with an
  // XML declaration are handled the same as those that don't.
  const keys = Object.keys(document ?? {}).filter((k) => !k.startsWith('?'));
  if (keys.length === 1 && typeof document[keys[0]] === 'object') return { rootName: keys[0], root: document[keys[0]] as XmlNode };
  // Multiple content keys (unusual) — treat the whole document as root
  return { rootName: 'Document', root: document };
}

function walkNamed(
  node: XmlNode,
  visitor: (node: XmlNode, nodeName: string, ancestry: string[]) => void,
  nodeName = 'Document',
  ancestry: string[] = [],
): void {
  if (!node || typeof node !== 'object') return;
  visitor(node, nodeName, ancestry);
  for (const [key, value] of Object.entries(node)) {
    if (!value || key.startsWith('@_')) continue;
    for (const child of asArray(value)) {
      if (child && typeof child === 'object') walkNamed(child as XmlNode, visitor, key, [...ancestry, nodeName]);
    }
  }
}

function extractLawTitle(root: XmlNode, sourceFile: string): string {
  // 1. Direct ShortTitle property on root
  const shortDirect = firstText(root, ['ShortTitle']);
  if (shortDirect) return shortDirect;

  // 2. Walk tree looking ONLY for ShortTitle nodes
  let shortFound = '';
  walkNamed(root, (node, nodeName) => {
    if (!shortFound && nodeName === 'ShortTitle') shortFound = textOf(node);
  });
  if (shortFound) return shortFound;

  // 3. Direct lookup across all TITLE_KEYS (existing behaviour)
  const direct = firstText(root, TITLE_KEYS);
  if (direct) return direct;

  // 4. Walk tree for any TITLE_KEYS node (existing fallback)
  let found = '';
  walkNamed(root, (node, nodeName) => {
    if (!found && TITLE_KEYS.includes(nodeName)) found = textOf(node);
  });

  // 5. Final fallback: filename
  return found || path.basename(sourceFile, path.extname(sourceFile));
}

function getLabel(node: XmlNode): string | null {
  return firstText(node, LABEL_KEYS) || null;
}

function getHeading(node: XmlNode): string | null {
  return firstText(node, HEADING_KEYS) || null;
}

function extractBodyText(node: XmlNode): string {
  const preferred = firstText(node, BODY_TEXT_KEYS);
  if (preferred) return cleanInlineArtifacts(preferred);
  // Fallback for nodes without a direct Text child. Do NOT recursively flatten
  // child *provision* nodes (Section/Subsection/Definition/…): each is emitted as
  // its own record by the traversal, and slurping them here merges unrelated
  // provisions out of order — under preserveOrder:false this yields blobs like
  // "Act Canada Labour Code Loi means … Director … afficher means …".
  return cleanInlineArtifacts(
    normalizeWhitespace(
      Object.entries(node)
        .filter(([key]) => !key.startsWith('@_') && !IGNORED_TEXT_KEYS.has(key) && !PROVISION_NODE_NAMES.has(key))
        .map(([, value]) => textOf(value))
        .filter(Boolean)
        .join(' '),
    ),
  );
}

function directTextOf(node: XmlNode): string {
  if (!node || typeof node !== 'object') return '';
  const parts: string[] = [];
  if (typeof node['#text'] === 'string') parts.push(node['#text'] as string);
  for (const key of ['Text', 'ProvisionText', 'SectionText']) {
    const val = node[key];
    if (typeof val === 'string') parts.push(val as string);
  }
  return normalizeWhitespace(parts.join(' '));
}

function looksRepealed(node: XmlNode): boolean {
  // 1. Fast-path: direct text fields contain a repeal marker.
  const direct = directTextOf(node);
  if (/\b(repealed|abrogé|abroge|abrogée)\b/i.test(direct)) return true;

  // 2. Explicit <Repealed> child element (e.g. <Repealed>...</Repealed>).
  if (node?.['Repealed']) return true;

  // 3. Nested repeal inside Text/ProvisionText objects:
  //    e.g. <Text><Repealed>[Repealed, SOR/2019-168, s. 2]</Repealed></Text>
  for (const key of ['Text', 'ProvisionText', 'SectionText', 'SubsectionText', 'ParagraphText']) {
    const child = node?.[key];
    if (!child || typeof child !== 'object') continue;
    // child.Repealed exists, or textOf(child) contains the repeal marker
    if ((child as XmlNode)['Repealed']) return true;
    const childText = textOf(child);
    if (/\b(repealed|abrogé|abroge|abrogée)\b/i.test(childText)) return true;
  }

  // 4. @_status attribute used in some schemas to flag repealed provisions.
  const status = node?.['@_status'] ?? '';
  if (/repealed|abrogé/i.test(String(status))) return true;

  return false;
}

function collectAttributes(node: XmlNode): Record<string, unknown> {
  return Object.fromEntries(Object.entries(node ?? {}).filter(([key]) => key.startsWith('@_')).map(([key, value]) => [key.slice(2), value]));
}

function extractReferences(text: string): Reference[] {
  const refs: Reference[] = [];
  const patterns = [
    /\b(?:section|sections|subsection|subsections|paragraph|paragraphs|clause|clauses)\s+([0-9]+(?:\.[0-9]+)?(?:\([^)]+\))*)/gi,
    /\b(?:article|articles|paragraphe|paragraphes|alinéa|alinéas)\s+([0-9]+(?:\.[0-9]+)?(?:\([^)]+\))*)/gi,
    /\bs\.\s*([0-9]+(?:\.[0-9]+)?(?:\([^)]+\))*)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      refs.push({ raw: match[0], target_label: match[1], index: match.index });
    }
  }
  return refs;
}

function buildCitation(lawTitle: string, provisionStack: ProvisionFrame[], currentLabel: string | null, _nodeName: string): string {
  if (!currentLabel) return lawTitle;

  if (currentLabel.startsWith('(')) {
    // Subsection / paragraph label — need a parent section number
    // Walk provisionStack from innermost outward to find nearest non-paren ancestor
    let parentLabel: string | null = null;
    // Also collect any paren labels between the non-paren ancestor and current
    const parenChain: string[] = [];
    for (let i = provisionStack.length - 1; i >= 0; i--) {
      const ancestor = provisionStack[i];
      if (!ancestor.label) continue;
      if (ancestor.label.startsWith('(')) {
        parenChain.unshift(ancestor.label);
      } else {
        parentLabel = ancestor.label;
        break;
      }
    }
    if (!parentLabel) return lawTitle;
    return `${lawTitle}, s. ${parentLabel}${parenChain.join('')}${currentLabel}`;
  }

  // Non-paren label (e.g. a plain section number)
  // Check if there are paren ancestors that should be chained
  const parenAncestors: string[] = [];
  for (let i = provisionStack.length - 1; i >= 0; i--) {
    const ancestor = provisionStack[i];
    if (ancestor.label && ancestor.label.startsWith('(')) {
      parenAncestors.unshift(ancestor.label);
    } else {
      break;
    }
  }
  return `${lawTitle}, s. ${currentLabel}${parenAncestors.join('')}`;
}

function extractDocumentMetadata(root: XmlNode, sourceFile: string, xmlLangAttr = ''): DocumentMetadata {
  const language = inferLanguage(sourceFile, xmlLangAttr);
  return {
    source_file: sourceFile,
    source: 'justicecanada/laws-lois-xml',
    jurisdiction: 'Canada (Federal)',
    language,
    law_title: extractLawTitle(root, sourceFile),
    short_title: firstText(root, ['ShortTitle']) || null,
    long_title: firstText(root, ['LongTitle']) || null,
    consolidation_date: firstText(root, ['ConsolidationDate', 'CurrentTo', 'LastAmendedDate']) || null,
  };
}

function validateRecord(record: ProvisionRecord): string[] {
  const warnings: string[] = [];
  if (!record.law_title) warnings.push('missing_law_title');
  if (!record.language || record.language === 'unknown') warnings.push('unknown_language');
  if (!record.text || record.text.length < 10) warnings.push('short_or_missing_text');
  if (!record.section_number && record.node_type === 'Section') warnings.push('missing_section_number');
  if (record.text && record.text.length > 10000) warnings.push('very_long_text_possible_nested_capture');
  if (record.parent_id && !record.xml_path.includes('/')) warnings.push('parent_without_deep_xml_path');
  return warnings;
}

function extractProvisions(
  document: XmlNode,
  sourceFile: string,
  runId: string,
): { document: DocumentMetadata; records: ProvisionRecord[]; summary: Record<string, unknown> } {
  const { rootName, root } = findRoot(document);
  const xmlLangAttr = (root?.['@_xml:lang'] ?? root?.['@_xml_lang'] ?? '') as string;
  const doc = extractDocumentMetadata(root, sourceFile, xmlLangAttr);
  const records: ProvisionRecord[] = [];
  const containerStack: ContainerFrame[] = [];
  const provisionStack: ProvisionFrame[] = [];

  function buildPath(nodeName: string, label: string | null, index: number): string[] {
    const containerPath = containerStack.map((item) => `${item.type}:${item.label ?? ''}:${item.heading ?? ''}`);
    const provisionPath = provisionStack.map((item) => `${item.type}:${item.label ?? item.index}`);
    return [doc.law_title, ...containerPath, ...provisionPath, `${nodeName}:${label ?? index}`];
  }

  function visit(node: XmlNode, nodeName: string, ancestry: string[], xmlPath: string, siblingIndex: number): void {
    const label = getLabel(node);
    const heading = getHeading(node);
    const attributes = collectAttributes(node);

    if (CONTAINER_NODE_NAMES.has(nodeName)) containerStack.push({ type: nodeName, label, heading, xml_path: xmlPath });
    if (!PROVISION_NODE_NAMES.has(nodeName)) return;

    const text = extractBodyText(node);
    if (!text || text.length < 10) return;

    const parent = provisionStack.at(-1) ?? null;
    const sectionPath = buildPath(nodeName, label, siblingIndex);
    const id = stableId([sourceFile, ...sectionPath, text]);
    const parentId = parent?.id ?? null;

    const record: ProvisionRecord = {
      id,
      parent_id: parentId,
      children_ids: [],
      content_hash: contentHash(text),
      source_file: doc.source_file,
      source: doc.source,
      parser_version: PARSER_VERSION,
      run_id: runId,
      jurisdiction: doc.jurisdiction,
      language: doc.language,
      law_title: doc.law_title,
      short_title: doc.short_title,
      long_title: doc.long_title,
      consolidation_date: doc.consolidation_date,
      node_type: nodeName,
      section_number: label,
      heading,
      text,
      references: extractReferences(text),
      is_repealed_or_inactive: looksRepealed(node),
      hierarchy: ancestry.filter(Boolean).concat(nodeName),
      xml_path: xmlPath,
      structural_context: containerStack.filter((item) => item.heading || item.label).map((item) => ({ ...item })),
      citation_hint: buildCitation(doc.law_title, provisionStack, label, nodeName),
      attributes,
      quality_warnings: [],
      metadata: { root_node: rootName, sibling_index: siblingIndex },
    };

    record.quality_warnings = validateRecord(record);

    // Detect active parents that have at least one repealed direct child provision
    if (!record.is_repealed_or_inactive) {
      const hasRepealedChild = Object.entries(node).some(([key, value]) => {
        if (key.startsWith('@_') || !PROVISION_NODE_NAMES.has(key)) return false;
        return asArray(value).some((child) => child && typeof child === 'object' && looksRepealed(child as XmlNode));
      });
      if (hasRepealedChild) record.quality_warnings.push('active_parent_has_repealed_children');
    }

    if (parentId) records.find((item) => item.id === parentId)?.children_ids.push(id);
    records.push(record);
    provisionStack.push({ id, type: nodeName, label, index: siblingIndex });
  }

  function traverse(node: XmlNode, nodeName = rootName, ancestry: string[] = [], xmlPath = rootName, siblingIndex = 0): void {
    if (!node || typeof node !== 'object') return;
    const containerDepth = containerStack.length;
    const provisionDepth = provisionStack.length;
    visit(node, nodeName, ancestry, xmlPath, siblingIndex);
    for (const [key, value] of Object.entries(node)) {
      if (!value || key.startsWith('@_')) continue;
      asArray(value).forEach((child, index) => {
        if (child && typeof child === 'object') traverse(child as XmlNode, key, [...ancestry, nodeName], `${xmlPath}/${key}[${index}]`, index);
      });
    }
    containerStack.length = containerDepth;
    provisionStack.length = provisionDepth;
  }

  traverse(root, rootName, [], rootName, 0);
  records.sort((a, b) => a.xml_path.localeCompare(b.xml_path));

  const duplicateHashes = records.reduce((acc, record) => {
    acc[record.content_hash] = (acc[record.content_hash] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  for (const record of records) {
    if (duplicateHashes[record.content_hash] > 1) record.quality_warnings.push('duplicate_text_hash');
  }

  return {
    document: doc,
    records,
    summary: {
      parser_version: PARSER_VERSION,
      run_id: runId,
      record_count: records.length,
      warning_count: records.reduce((sum, record) => sum + record.quality_warnings.length, 0),
      duplicate_text_count: Object.values(duplicateHashes).filter((count) => count > 1).length,
      reference_count: records.reduce((sum, record) => sum + record.references.length, 0),
      node_type_counts: records.reduce((acc, record) => {
        acc[record.node_type] = (acc[record.node_type] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
  };
}

async function listXmlFiles(inputDir: string): Promise<string[]> {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(inputDir, entry.name);
    if (entry.isDirectory()) files.push(...await listXmlFiles(fullPath));
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) files.push(fullPath);
  }
  return files.sort();
}

async function main(): Promise<void> {
  const inputDir = path.resolve(process.argv[2] || DEFAULT_INPUT_DIR);
  const outputDir = path.resolve(process.argv[3] || DEFAULT_OUTPUT_DIR);
  const runId = `${new Date().toISOString()}-${crypto.randomUUID()}`;

  await fs.mkdir(outputDir, { recursive: true });

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    preserveOrder: false,
    parseTagValue: false,
    parseAttributeValue: false,
    stopNodes: ['*.Table'],
  });

  const files = await listXmlFiles(inputDir);
  const manifest: object[] = [];

  for (const file of files) {
    const xml = await fs.readFile(file, 'utf8');
    const parsed = parser.parse(xml) as XmlNode;
    const relativeFile = path.relative(process.cwd(), file);
    const result = extractProvisions(parsed, relativeFile, runId);
    const outputName = `${path.basename(file, path.extname(file))}.provisions.json`;
    const outputPath = path.join(outputDir, outputName);

    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

    manifest.push({
      source_file: relativeFile,
      output_file: path.relative(process.cwd(), outputPath),
      language: result.document.language,
      law_title: result.document.law_title,
      record_count: result.summary.record_count,
      warning_count: result.summary.warning_count,
      duplicate_text_count: result.summary.duplicate_text_count,
      reference_count: result.summary.reference_count,
      node_type_counts: result.summary.node_type_counts,
      parser_version: PARSER_VERSION,
    });
  }

  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ generated_at: new Date().toISOString(), parser_version: PARSER_VERSION, run_id: runId, files: manifest }, null, 2));
  console.log(`Parsed ${files.length} XML file(s) with parser ${PARSER_VERSION}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
