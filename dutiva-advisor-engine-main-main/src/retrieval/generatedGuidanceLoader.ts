import * as fs from 'node:fs';
import * as path from 'node:path';
import { GeneratedGuidanceCard, GeneratedGuidanceIndex, isGeneratedGuidanceCard } from './generatedGuidanceTypes';

const DEFAULT_INDEX_PATH = path.resolve(process.cwd(), 'data/advisor-guidance-index.json');

/**
 * Load and validate the generated guidance index from disk.
 *
 * Returns an array of validated, active GeneratedGuidanceCard records.
 * - Returns empty array if the index file is absent (graceful degradation).
 * - Returns empty array if the file is malformed.
 * - Excludes records that fail validation.
 * - Excludes records with status === 'inactive_or_repealed'.
 * - Excludes records where language === 'unknown' (unknown-language records may carry translation placeholders).
 * - Excludes records where advisor_answer_en contains a repeal-bracket pattern (e.g. "[Repealed, SOR/..."]")
 *   as a defense-in-depth guard against stale index files produced by older pipeline versions.
 *
 * This function does NOT throw. Errors are logged via console.warn.
 */
export function loadGeneratedGuidanceIndex(indexPath?: string): GeneratedGuidanceCard[] {
  const filePath = indexPath ?? DEFAULT_INDEX_PATH;

  if (!fs.existsSync(filePath)) {
    return [];
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`[generatedGuidanceLoader] Failed to parse ${filePath}: ${String(err)}`);
    return [];
  }

  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as Record<string, unknown>)['guidance'])) {
    console.warn(`[generatedGuidanceLoader] Index file missing 'guidance' array: ${filePath}`);
    return [];
  }

  const index = raw as GeneratedGuidanceIndex;
  const result: GeneratedGuidanceCard[] = [];
  let skippedInvalid = 0;
  let skippedInactive = 0;
  let skippedUnknownLang = 0;
  let skippedRepealedContent = 0;

  // Defense-in-depth: catch any card whose advisor_answer_en still contains repeal
  // markers (e.g. "[Repealed, SOR/2019-168, s. 2]"). This should not happen after the
  // pipeline correctly sets status='inactive_or_repealed', but guards against stale
  // index files produced by an older pipeline version.
  const REPEAL_CONTENT_PATTERN = /\[Repealed[^[\]]*\]|\[Abrog[eé][^[\]]*\]/i;

  for (const item of index.guidance) {
    if (!isGeneratedGuidanceCard(item)) {
      skippedInvalid++;
      continue;
    }
    if (item.status === 'inactive_or_repealed') {
      skippedInactive++;
      continue;
    }
    // Skip unknown-language records — they may have untranslated or placeholder content
    if (item.language === 'unknown') {
      skippedUnknownLang++;
      continue;
    }
    // Defense-in-depth: skip any card whose answer text signals a repealed provision
    if (REPEAL_CONTENT_PATTERN.test(item.advisor_answer_en)) {
      skippedRepealedContent++;
      continue;
    }
    result.push(item);
  }

  if (skippedInvalid > 0 || skippedInactive > 0 || skippedUnknownLang > 0 || skippedRepealedContent > 0) {
    console.warn(
      `[generatedGuidanceLoader] Loaded ${result.length} records. ` +
      `Skipped: ${skippedInvalid} invalid, ${skippedInactive} inactive/repealed, ` +
      `${skippedUnknownLang} unknown-language, ${skippedRepealedContent} repeal-content-detected.`
    );
  }

  return result;
}
