#!/usr/bin/env node
// Keyword-fallback index builder (no vector embeddings)
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_INPUT_DIR = path.resolve('advisor-training/guidance');
const DEFAULT_OUTPUT_FILE = path.resolve('data/advisor-guidance-index.json');
const EMBEDDINGS_VERSION = '0.1.0';

// Matches citations that reference a bare subsection with no parent section,
// e.g. "Some Act, s. (a)" or "Some Act, s. (3)" — invalid standalone citations.
const BARE_SUBSECTION_RE = /^[^,]*, s\. \([\da-z]+\)$/i;

type GuidanceItem = Record<string, unknown>;

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Strip repeal/abrogation bracket markers from a string before indexing.
 * Prevents "[Repealed, SOR/2019-168, s. 2]" from leaking into search_text
 * or embedding_text for active records that have inline partial-repeal markers.
 */
function stripRepealBrackets(value: string | null | undefined): string {
  return (value ?? '').replace(/\[(?:Repealed|Abrogée?|Abrogé)[^\]]*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function stableId(parts: string[]): string {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 24);
}

async function listGuidanceFiles(inputDir: string): Promise<string[]> {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(inputDir, entry.name);
    if (entry.isDirectory()) files.push(...await listGuidanceFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith('.guidance.json')) files.push(fullPath);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function buildEmbeddingText(item: GuidanceItem): string {
  // Strip repeal brackets from each text field individually before concatenating,
  // so stale brackets in any field do not end up in the index's embedding_text.
  const retrieval = item['retrieval'] as Record<string, unknown> | undefined;
  const fields: string[] = [
    item['topic'],
    ...(Array.isArray(item['topics']) ? item['topics'] : []),
    item['law_title'],
    item['citation'],
    item['advisor_answer_en'],
    retrieval?.['search_text'],
    ...(Array.isArray(item['user_questions']) ? item['user_questions'] : []),
  ]
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return normalizeWhitespace(stripRepealBrackets(fields.join(' ')));
}

interface IndexAccumulator {
  items: GuidanceItem[];
  topicCounts: Record<string, number>;
  riskCounts: Record<string, number>;
  totalSourceRecords: number;
  excludedInactiveRepealed: number;
  excludedInvalidEmpty: number;
  excludedInvalidCitation: number;
}

/** Process a single guidance item, mutating the accumulator. Returns true if the item was indexed. */
function processItem(item: GuidanceItem, includeInactive: boolean, acc: IndexAccumulator): void {
  acc.totalSourceRecords++;

  // 1. Filter inactive_or_repealed unless --include-inactive is set
  if (!includeInactive && item['status'] === 'inactive_or_repealed') { acc.excludedInactiveRepealed++; return; }

  // 2. Validate citation — skip bare subsection citations
  const citation = typeof item['citation'] === 'string' ? item['citation'] : '';
  if (citation && BARE_SUBSECTION_RE.test(citation.trim())) { acc.excludedInvalidCitation++; return; }

  // 3. Require non-empty embedding text
  const embedding_text = buildEmbeddingText(item);
  if (!embedding_text) { acc.excludedInvalidEmpty++; return; }

  const topicKey = normalizeWhitespace(typeof item['topic'] === 'string' ? item['topic'] : 'unknown');
  acc.topicCounts[topicKey] = (acc.topicCounts[topicKey] ?? 0) + 1;

  const riskKey = normalizeWhitespace(typeof item['risk_level'] === 'string' ? item['risk_level'] : 'unknown');
  acc.riskCounts[riskKey] = (acc.riskCounts[riskKey] ?? 0) + 1;

  // Ensure retrieval.search_text is stripped of repeal brackets before indexing,
  // in case this item was produced by an older version of build-guidance-layer.ts.
  const retrieval = item['retrieval'] as Record<string, unknown> | undefined;
  const cleanedRetrieval = retrieval
    ? { ...retrieval, search_text: normalizeWhitespace(stripRepealBrackets(typeof retrieval['search_text'] === 'string' ? retrieval['search_text'] : '')) }
    : retrieval;

  acc.items.push({ ...item, retrieval: cleanedRetrieval, embedding_id: stableId(['embedding', item['id'] as string, EMBEDDINGS_VERSION]), embedding_text });
}

async function main(): Promise<void> {
  // Parse CLI arguments — positional args first, then flags
  const args = process.argv.slice(2);
  const includeInactive = args.includes('--include-inactive');
  const positional = args.filter((a) => !a.startsWith('--'));
  const inputDir = path.resolve(positional[0] || DEFAULT_INPUT_DIR);
  const outputFile = path.resolve(positional[1] || DEFAULT_OUTPUT_FILE);
  const files = await listGuidanceFiles(inputDir);
  if (!files.length) { console.warn(`No .guidance.json files found in ${inputDir}`); process.exit(1); }

  const acc: IndexAccumulator = {
    items: [], topicCounts: {}, riskCounts: {},
    totalSourceRecords: 0, excludedInactiveRepealed: 0, excludedInvalidEmpty: 0, excludedInvalidCitation: 0,
  };

  for (const file of files) {
    const raw: Record<string, unknown> = JSON.parse(await fs.readFile(file, 'utf8'));
    const guidance: GuidanceItem[] = Array.isArray(raw['guidance']) ? raw['guidance'] as GuidanceItem[] : [];
    for (const item of guidance) {
      processItem(item, includeInactive, acc);
    }
  }

  const { items, topicCounts, riskCounts, totalSourceRecords,
    excludedInactiveRepealed, excludedInvalidEmpty, excludedInvalidCitation } = acc;

  const generatedAt = new Date().toISOString();
  const manifest = {
    total_source_records: totalSourceRecords, indexed_records: items.length,
    excluded_inactive_repealed: excludedInactiveRepealed, excluded_invalid_empty: excludedInvalidEmpty,
    excluded_invalid_citation: excludedInvalidCitation, topic_counts: topicCounts, risk_counts: riskCounts,
    generated_at: generatedAt, embeddings_version: EMBEDDINGS_VERSION, include_inactive: includeInactive,
  };
  const output = { generated_at: generatedAt, embeddings_version: EMBEDDINGS_VERSION, model: 'keyword-fallback', dimensions: 0, manifest, guidance: items };
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(output, null, 2));
  const relOut = path.relative(process.cwd(), outputFile);
  console.log('');
  console.log('=== Keyword Guidance Index — Build Summary ===');
  console.log(`  Output file              : ${relOut}`);
  console.log(`  Generated at             : ${generatedAt}`);
  console.log(`  Embeddings version       : ${EMBEDDINGS_VERSION}`);
  console.log(`  Include inactive         : ${includeInactive}`);
  console.log('');
  console.log(`  Total source records     : ${totalSourceRecords}`);
  console.log(`  Indexed records          : ${items.length}`);
  console.log(`  Excluded — inactive/rep. : ${excludedInactiveRepealed}`);
  console.log(`  Excluded — invalid empty : ${excludedInvalidEmpty}`);
  console.log(`  Excluded — bad citation  : ${excludedInvalidCitation}`);
  console.log('');
  console.log('  Topic counts:');
  for (const [topic, count] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(5)}  ${topic}`);
  }
  console.log('');
  console.log('  Risk level counts:');
  for (const [risk, count] of Object.entries(riskCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(5)}  ${risk}`);
  }
  console.log('==============================================');
  console.log('');
}

main().catch((error: unknown) => { console.error(error); process.exit(1); });
