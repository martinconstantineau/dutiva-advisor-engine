#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const DEFAULT_INPUT_DIR = path.resolve('advisor-training/guidance');
const DEFAULT_OUTPUT_FILE = path.resolve('data/advisor-guidance-index.json');
const EMBEDDINGS_VERSION = '0.1.0';
const DEFAULT_MODEL = process.env.EMBEDDINGS_MODEL || 'Xenova/all-MiniLM-L6-v2';
const TRANSFORMERS_PACKAGE = '@xenova/transformers';
const TRANSFORMERS_VERSION = process.env.TRANSFORMERS_VERSION || '2.17.2';
const TRANSFORMERS_CACHE_DIR = path.resolve('.cache/advisor-training/embedding-deps');

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
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

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}`));
    });
  });
}

function isMissingTransformersModule(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as Record<string, unknown>;
  return e['code'] === 'ERR_MODULE_NOT_FOUND'
    && typeof e['message'] === 'string'
    && e['message'].includes(TRANSFORMERS_PACKAGE);
}

async function installTransformersInCache(): Promise<void> {
  const packageJsonPath = path.join(TRANSFORMERS_CACHE_DIR, 'package.json');
  await fs.mkdir(TRANSFORMERS_CACHE_DIR, { recursive: true });

  if (!(await pathExists(packageJsonPath))) {
    await fs.writeFile(
      packageJsonPath,
      JSON.stringify({ name: 'dutiva-embedding-deps', private: true }, null, 2),
      'utf8',
    );
  }

  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const dependencySpec = `${TRANSFORMERS_PACKAGE}@${TRANSFORMERS_VERSION}`;

  console.log(`Installing ${dependencySpec} into ${path.relative(process.cwd(), TRANSFORMERS_CACHE_DIR)} ...`);
  await runCommand(
    npmBin,
    ['install', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', dependencySpec],
    TRANSFORMERS_CACHE_DIR,
  );
}

async function importTransformersFromCache(): Promise<Record<string, unknown>> {
  const cacheRequire = createRequire(path.join(TRANSFORMERS_CACHE_DIR, 'package.json'));
  const resolvedEntry = cacheRequire.resolve(TRANSFORMERS_PACKAGE);
  return import(pathToFileURL(resolvedEntry).href) as Promise<Record<string, unknown>>;
}

async function ensureTransformersPackage(): Promise<Record<string, unknown>> {
  try {
    return await import(TRANSFORMERS_PACKAGE) as Record<string, unknown>;
  } catch (error) {
    if (!isMissingTransformersModule(error)) {
      throw error;
    }
  }

  await installTransformersInCache();
  return importTransformersFromCache();
}

function buildEmbeddingText(item: Record<string, unknown>): string {
  const retrieval = item['retrieval'] as Record<string, unknown> | undefined;
  const fields: string[] = [
    item['topic'],
    ...(Array.isArray(item['topics']) ? item['topics'] : []),
    item['law_title'],
    item['citation'],
    item['advisor_answer_en'],
    retrieval?.['search_text'],
    ...(Array.isArray(item['user_questions']) ? item['user_questions'] : []),
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);
  return normalizeWhitespace(fields.join(' '));
}

async function loadEmbedder(): Promise<unknown> {
  const { pipeline } = await ensureTransformersPackage();
  return (pipeline as (task: string, model: string) => Promise<unknown>)('feature-extraction', DEFAULT_MODEL);
}

async function embedText(embedder: unknown, text: string): Promise<number[]> {
  const output = await (embedder as (text: string, options: Record<string, unknown>) => Promise<{ data: ArrayLike<number> }>)(
    text, { pooling: 'mean', normalize: true },
  );
  return Array.from(output.data).map((value) => Number(value.toFixed(6)));
}

async function main(): Promise<void> {
  const inputDir = path.resolve(process.argv[2] || DEFAULT_INPUT_DIR);
  const outputFile = path.resolve(process.argv[3] || DEFAULT_OUTPUT_FILE);
  const files = await listGuidanceFiles(inputDir);

  if (!files.length) {
    console.warn(`No .guidance.json files found in ${inputDir}`);
  }

  const embedder = await loadEmbedder();
  const items: Record<string, unknown>[] = [];

  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
    const guidance = Array.isArray(raw['guidance']) ? raw['guidance'] as Record<string, unknown>[] : [];

    for (const item of guidance) {
      const embedding_text = buildEmbeddingText(item);
      if (!embedding_text) continue;

      items.push({
        ...item,
        embedding_id: stableId(['embedding', item['id'] as string, EMBEDDINGS_VERSION]),
        embedding_text,
        embedding: await embedText(embedder, embedding_text),
      });
    }
  }

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    embeddings_version: EMBEDDINGS_VERSION,
    model: DEFAULT_MODEL,
    dimensions: (items[0]?.['embedding'] as number[] | undefined)?.length ?? 0,
    guidance: items,
  }, null, 2));

  console.log(`Built semantic guidance index with ${items.length} item(s): ${path.relative(process.cwd(), outputFile)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  console.error('\nInstall dependency first: npm install @xenova/transformers');
  process.exit(1);
});
