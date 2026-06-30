#!/usr/bin/env node
/**
 * build-semantic-chunk-index.ts
 *
 * NOTE: This script previously imported from `../../src/lib/dataPipeline/embeddings.ts`
 * and `../../src/lib/dataPipeline/searchContext.ts`, which do not exist in this repo.
 * Those imports have been removed. This script is now a self-contained keyword-chunk
 * variant that re-reads the keyword guidance index and produces per-chunk search records
 * without vector embeddings.
 *
 * For real vector embeddings, a separate pipeline:embed step (e.g., pipeline:embed:hf)
 * that calls an embedding API should be added. This file is intentionally a stub that
 * demonstrates the correct shape while remaining importable without crashing.
 *
 * This is a BUILD-TIME utility only. It must NOT be imported by src/ runtime code.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_INPUT_FILE = path.resolve('data/advisor-guidance-index.json');
const DEFAULT_OUTPUT_FILE = path.resolve('data/advisor-semantic-chunks.json');
const MODEL_NAME = 'keyword-chunk-v1';

interface GuidanceItem {
  id: string;
  topic?: string;
  law_title?: string;
  citation?: string;
  advisor_answer_en?: string;
  jurisdiction?: string;
  risk_level?: string;
  status?: string;
  user_questions?: string[];
  retrieval?: { search_text?: string };
}

interface Chunk {
  chunk_id: string;
  source_id: string;
  chunk_type: string;
  text: string;
  topic: string | undefined;
  jurisdiction: string | undefined;
  risk_level: string | undefined;
  status: string | undefined;
  law_title: string | undefined;
  citation: string | undefined;
}

interface ChunkIndexPayload {
  generated_at: string;
  source_index: string;
  model: string;
  dimensions: number;
  note: string;
  total_source_items: number;
  active_source_items: number;
  excluded_inactive: number;
  chunks: Chunk[];
}

interface BuildOptions {
  inputFile?: string;
  outputFile?: string;
  includeInactive?: boolean;
  timestamp?: string;
}

function normalizeWhitespace(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stableId(parts: string[]): string {
  return crypto
    .createHash('sha1')
    .update(parts.filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 24);
}

/**
 * Convert a guidance item into a set of overlapping keyword chunks.
 * Each chunk is a self-contained search unit drawn from the item's fields.
 * No vector embedding is produced here — this is a keyword-based approximation.
 */
function guidanceItemToChunks(item: GuidanceItem): Chunk[] {
  const chunks: Chunk[] = [];

  // Primary chunk: topic + citation + advisor answer
  const primaryText = normalizeWhitespace(
    [item.topic, item.law_title, item.citation, item.advisor_answer_en].filter(Boolean).join(' '),
  );
  if (primaryText) {
    chunks.push({
      chunk_id: stableId(['chunk-primary', item.id]),
      source_id: item.id,
      chunk_type: 'primary',
      text: primaryText,
      topic: item.topic,
      jurisdiction: item.jurisdiction,
      risk_level: item.risk_level,
      status: item.status,
      law_title: item.law_title,
      citation: item.citation,
    });
  }

  // Retrieval chunk: search_text if different from primary
  const searchText = normalizeWhitespace(item.retrieval?.search_text ?? '');
  if (searchText && searchText !== primaryText) {
    chunks.push({
      chunk_id: stableId(['chunk-retrieval', item.id]),
      source_id: item.id,
      chunk_type: 'retrieval',
      text: searchText,
      topic: item.topic,
      jurisdiction: item.jurisdiction,
      risk_level: item.risk_level,
      status: item.status,
      law_title: item.law_title,
      citation: item.citation,
    });
  }

  // Question chunks: each user_question as a distinct searchable unit
  const questions = item.user_questions ?? [];
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const qText = normalizeWhitespace(question);
    if (qText) {
      chunks.push({
        chunk_id: stableId(['chunk-question', item.id, String(i)]),
        source_id: item.id,
        chunk_type: 'question',
        text: qText,
        topic: item.topic,
        jurisdiction: item.jurisdiction,
        risk_level: item.risk_level,
        status: item.status,
        law_title: item.law_title,
        citation: item.citation,
      });
    }
  }

  return chunks;
}

async function readGuidanceIndex(inputFile: string): Promise<GuidanceItem[]> {
  const raw = JSON.parse(await fs.readFile(inputFile, 'utf8')) as Record<string, unknown>;
  return Array.isArray(raw['guidance']) ? raw['guidance'] as GuidanceItem[] : [];
}

export async function buildSemanticChunkIndex({
  inputFile = DEFAULT_INPUT_FILE,
  outputFile = DEFAULT_OUTPUT_FILE,
  includeInactive = false,
  timestamp = new Date().toISOString(),
}: BuildOptions = {}): Promise<ChunkIndexPayload> {
  const guidance = await readGuidanceIndex(inputFile);

  const activeGuidance = includeInactive
    ? guidance
    : guidance.filter((item) => item.status !== 'inactive_or_repealed');

  const chunks = activeGuidance.flatMap(guidanceItemToChunks);

  const payload: ChunkIndexPayload = {
    generated_at: timestamp,
    source_index: path.relative(process.cwd(), inputFile),
    model: MODEL_NAME,
    dimensions: 0,
    note: 'This is a keyword-chunk index. Vector embeddings require a separate pipeline:embed step.',
    total_source_items: guidance.length,
    active_source_items: activeGuidance.length,
    excluded_inactive: guidance.length - activeGuidance.length,
    chunks,
  };

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`);

  return payload;
}

async function main(): Promise<void> {
  const inputFile = path.resolve(process.argv[2] || DEFAULT_INPUT_FILE);
  const outputFile = path.resolve(process.argv[3] || DEFAULT_OUTPUT_FILE);
  const includeInactive = process.argv.includes('--include-inactive');
  const payload = await buildSemanticChunkIndex({ inputFile, outputFile, includeInactive });
  console.log(
    `Built ${payload.chunks.length} keyword chunk(s) from ${payload.active_source_items} active items` +
      ` (excluded ${payload.excluded_inactive} inactive/repealed): ${path.relative(process.cwd(), outputFile)}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
