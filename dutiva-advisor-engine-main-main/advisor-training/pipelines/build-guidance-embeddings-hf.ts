#!/usr/bin/env node
/**
 * build-guidance-embeddings-hf.ts
 *
 * Generates dense vector embeddings for every item in the advisor guidance
 * index using the HuggingFace Inference API (no local model download needed).
 *
 *   Model : sentence-transformers/all-MiniLM-L6-v2  (384-dim, L2-normalised)
 *   Output: data/advisor-guidance-index.json  (in-place update)
 *
 * Usage
 * ─────
 *   export HF_TOKEN=hf_...
 *   npm run pipeline:embed:hf
 *
 * The script is fully resumable — items that already carry an `embedding`
 * array are skipped.  The index file is overwritten after every batch so a
 * crash or rate-limit never loses completed work.  Simply re-run to resume.
 *
 * Batch size: 32 items per HF API call (safe for the 512-token limit).
 * Retry strategy: exponential back-off on 429 / 503 responses.
 */

import fs from "node:fs/promises";
import path from "node:path";

const INDEX_FILE = path.resolve(process.argv[2] || "data/advisor-guidance-index.json");
const HF_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
const HF_API = `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_MODEL}`;
const EMBEDDINGS_VERSION = "0.2.0";
const BATCH_SIZE = 32;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2_000;
// Rounding precision for stored embeddings.
// 6 decimal places cuts file size ~20 % vs full float64 with negligible
// accuracy loss for cosine-similarity ranking.
const EMBEDDING_PRECISION = 1e6;

type GuidanceItem = Record<string, unknown>;

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

/** L2-normalise a float array so cosine similarity == dot product. */
function normalizeVector(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag > 0 ? vec.map((v) => v / mag) : vec;
}

/** Round to EMBEDDING_PRECISION dp — saves ~20 % file size with negligible accuracy loss. */
function compactVec(vec: number[]): number[] {
  return vec.map((v) => Math.round(v * EMBEDDING_PRECISION) / EMBEDDING_PRECISION);
}

/** Progress bar (no external deps). */
function progress(done: number, total: number, width: number = 30): string {
  const pct = done / total;
  const filled = Math.round(pct * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `[${bar}] ${done}/${total} (${Math.round(pct * 100)} %)`;
}

async function embedBatch(texts: string[], token: string): Promise<number[][]> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(HF_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
      });
    } catch (err: unknown) {
      if (attempt === MAX_RETRIES) throw err;
      const delay = BASE_DELAY_MS * 2 ** attempt;
      process.stderr.write(`  [network] ${(err as Error).message} — retry in ${delay}ms\n`);
      await sleep(delay);
      continue;
    }
    if (res.status === 503 || res.status === 429) {
      if (attempt === MAX_RETRIES) throw new Error(`HF API ${res.status} after ${MAX_RETRIES} retries`);
      const delay = BASE_DELAY_MS * 2 ** attempt;
      const label = res.status === 503 ? "model loading" : "rate limited";
      process.stderr.write(`  [${res.status}] ${label} — retry in ${delay}ms\n`);
      await sleep(delay);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => String(res.status));
      throw new Error(`HF API ${res.status}: ${body.slice(0, 300)}`);
    }
    const raw = (await res.json()) as (number[] | number[][])[];
    // The sentence-transformers pipeline returns one of:
    //   [[f32, ...], ...]              sentence-level embeddings (ideal)
    //   [[[f32, ...], ...], ...]       token-level → mean-pool ourselves
    const embeddings = raw.map((row) => {
      if (Array.isArray(row[0])) {
        // Token-level output — mean-pool over the token dimension
        const tokenRows = row as number[][];
        const dims = tokenRows[0].length;
        const mean = new Array(dims).fill(0);
        for (const tok of tokenRows) { for (let d = 0; d < dims; d++) mean[d] += tok[d]; }
        return mean.map((v) => v / tokenRows.length);
      }
      return (row as number[]).map(Number);
    });
    return embeddings.map((v) => compactVec(normalizeVector(v)));
  }
  throw new Error("Exceeded retry limit.");
}

async function main(): Promise<void> {
  const token = process.env.HF_TOKEN;
  if (!token) {
    console.error("\nError: HF_TOKEN environment variable is required.\n");
    console.error("  export HF_TOKEN=hf_...");
    console.error("  npm run pipeline:embed:hf\n");
    console.error("  Get a free token at https://huggingface.co/settings/tokens\n");
    process.exit(1);
  }

  // ── Load index ─────────────────────────────────────────────────────────────
  console.log(`\nLoading: ${path.relative(process.cwd(), INDEX_FILE)}`);
  let index: Record<string, unknown>;
  try { index = JSON.parse(await fs.readFile(INDEX_FILE, "utf8")); }
  catch (e: unknown) { console.error(`\nCannot read index file: ${(e as Error).message}\n`); process.exit(1); }

  const guidance: GuidanceItem[] = Array.isArray(index.guidance) ? [...index.guidance as GuidanceItem[]] : [];
  if (!guidance.length) { console.error("\nNo guidance items found in index file.\n"); process.exit(1); }

  // ── Identify pending items ─────────────────────────────────────────────────
  const pending = guidance.filter((item) => !Array.isArray(item['embedding']));
  const alreadyDone = guidance.length - pending.length;
  if (alreadyDone > 0) console.log(`  Resuming: ${alreadyDone} items already embedded, ${pending.length} remaining.`);
  if (!pending.length) { console.log("\nAll items already embedded. Nothing to do.\n"); return; }

  console.log(`  Embedding ${pending.length} items in batches of ${BATCH_SIZE}...\n`);

  // ── Embed in batches ───────────────────────────────────────────────────────
  let done = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const texts = batch.map((item) => {
      const embText = typeof item['embedding_text'] === 'string' ? item['embedding_text'] : '';
      const fallback = typeof item['id'] === 'string' ? item['id'] : '';
      return embText || fallback;
    });
    const vectors = await embedBatch(texts, token);
    for (let j = 0; j < batch.length; j++) { batch[j].embedding = vectors[j]; }
    done += batch.length;
    process.stdout.write(`\r  ${progress(done, pending.length)}`);
    // Persist after every batch so a crash never loses completed work.
    index.embeddings_version = EMBEDDINGS_VERSION;
    await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
  }
  process.stdout.write('\n');

  // ── Final write ────────────────────────────────────────────────────────────
  index.embeddings_version = EMBEDDINGS_VERSION;
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
  const relOut = path.relative(process.cwd(), INDEX_FILE);
  console.log(`\nDone. ${pending.length} embeddings written to ${relOut}\n`);
}

main().catch((error: unknown) => { console.error(error); process.exit(1); });
