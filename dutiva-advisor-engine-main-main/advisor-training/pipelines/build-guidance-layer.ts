#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_INPUT_DIR = path.resolve('advisor-training/normalized');
const DEFAULT_OUTPUT_DIR = path.resolve('advisor-training/guidance');
const GUIDANCE_VERSION = '0.1.0';

const DISCLAIMER_EN = 'This is general HR compliance guidance, not legal advice. For high-risk matters, consult a qualified employment lawyer or HR professional.';
const DISCLAIMER_FR = 'Il s\u2019agit de renseignements g\u00e9n\u00e9raux en conformit\u00e9 RH, et non de conseils juridiques. Pour les situations \u00e0 risque \u00e9lev\u00e9, consultez un avocat en droit de l\u2019emploi ou un professionnel RH qualifi\u00e9.';

const QUESTION_TEMPLATES: Record<string, string[]> = {
  Termination: ['Can I terminate an employee in this situation?', 'What should I check before ending employment?', 'What termination risks should I consider?'],
  Harassment: ['What should I do if there is a workplace harassment concern?', 'What are the employer duties around harassment?', 'When should I escalate a harassment complaint?'],
  Accommodation: ['What should I consider for an accommodation request?', 'When is accommodation required?', 'What documentation should I collect for accommodation?'],
  Compensation: ['What pay obligations should I check?', 'Are there wage or overtime risks here?', 'What compensation records should I keep?'],
  Leave: ['What leave obligations apply?', 'Can an employee take this type of leave?', 'What should an employer document for leave?'],
  Hiring: ['What should I consider before hiring?', 'What employment terms should be documented?', 'Are there hiring compliance risks?'],
  'Workplace Safety': ['What workplace safety duties apply?', 'What should I do about a workplace hazard?', 'When should safety concerns be escalated?'],
  'Hours of Work': ['What hours-of-work rules should I check?', 'Are there scheduling or break risks?', 'What should I document about hours worked?'],
  'Records and Notices': ['What records or notices should I keep?', 'What documentation obligations apply?', 'What should I post or provide to employees?'],
  'Definitions and Application': ['What does this definition or application rule mean for HR compliance?', 'Who or what does this provision apply to?', 'Does this affect an employer obligation?'],
  'Administration and Enforcement': ['What enforcement, penalty, or complaint process does this provision establish?', 'What authority or procedure does this create?', 'What should an employer do to stay compliant?'],
  Unclassified: ['What does this legal provision mean for HR compliance?', 'Does this create an employer obligation?', 'What practical steps should I consider?'],
};

function stableId(parts: string[]): string {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 24);
}

function normalizeWhitespace(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Strip repeal/abrogation bracket markers from a string.
 * Examples removed:
 *   [Repealed, SOR/2019-168, s. 2]   →  ''
 *   [Abrogé, DORS/2019-168, art. 2]  →  ''
 *   [Repealed]                        →  ''
 * Collapses resulting extra whitespace so the surrounding sentence reads cleanly.
 */
function stripRepealBrackets(value: unknown): string {
  return String(value ?? '').replace(/\[(?:Repealed|Abrog[eé][e]?)[^\]]*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function riskLead(riskLevel: string): string {
  if (riskLevel === 'high') return 'High-risk issue. Treat this carefully and consider legal or senior HR review before acting.';
  if (riskLevel === 'medium') return 'Moderate-risk issue. Review the legal source, document your steps, and apply the rule consistently.';
  return 'Lower-risk informational issue, but still confirm the facts and jurisdiction before relying on it.';
}

// Use eslint-disable-next-line @typescript-eslint/no-explicit-any only on the record parameter since it comes from JSON
function makeAdvisorAnswer(record: Record<string, unknown>): string {
  const citation = record['citation'] || record['law_title'] || 'the applicable source';
  // Strip repeal bracket markers from raw text before embedding in the answer.
  const rawText = (record['plain_summary'] as string) || normalizeWhitespace(record['text']);
  const summary = stripRepealBrackets(rawText).slice(0, 360);
  const appliesTo = Array.isArray(record['applies_to']) && record['applies_to'].length
    ? `It may apply to: ${(record['applies_to'] as string[]).join(', ')}.`
    : 'Confirm who the rule applies to before acting.';
  return normalizeWhitespace([
    riskLead(record['risk_level'] as string),
    `Topic: ${record['topic']}.`,
    `Based on ${citation}, the relevant rule or source text indicates: ${summary}`,
    appliesTo,
    'Practical next step: confirm the employee location, governing jurisdiction, employment status, dates, and any written policy or contract before applying this guidance.',
    record['risk_level'] === 'high' ? 'Escalation: because this is high-risk, do not rely on this alone for a termination, harassment, accommodation, safety, or legal dispute decision.' : '',
  ].filter(Boolean).join(' '));
}

function makeFrenchPlaceholder(record: Record<string, unknown>): string {
  const citation = record['citation'] || record['law_title'] || 'la source applicable';
  return normalizeWhitespace([
    record['risk_level'] === 'high' ? 'Situation \u00e0 risque \u00e9lev\u00e9. Analysez avec prudence et envisagez une r\u00e9vision juridique ou RH.' : 'V\u00e9rifiez les faits, la juridiction applicable et les documents internes avant d\u2019agir.',
    `Sujet : ${record['topic']}.`,
    `Source : ${citation}.`,
    'R\u00e9sum\u00e9 fran\u00e7ais complet \u00e0 g\u00e9n\u00e9rer lors de la couche bilingue valid\u00e9e.',
  ].join(' '));
}

function makeGuidanceCard(record: Record<string, unknown>, sourceFile: string): Record<string, unknown> {
  const questions = QUESTION_TEMPLATES[record['topic'] as string] ?? QUESTION_TEMPLATES['Unclassified'];
  return {
    id: stableId(['guidance', record['id'] as string, GUIDANCE_VERSION]),
    source_normalized_id: record['id'],
    source_record_id: record['source_record_id'],
    source_file: record['source_file'] ?? sourceFile,
    guidance_version: GUIDANCE_VERSION,
    jurisdiction: record['jurisdiction'],
    language: record['language'],
    topic: record['topic'],
    topics: record['topics'] ?? [],
    risk_level: record['risk_level'],
    applies_to: record['applies_to'] ?? [],
    law_title: record['law_title'],
    citation: record['citation'],
    status: record['status'],
    user_questions: questions,
    advisor_answer_en: makeAdvisorAnswer(record),
    advisor_answer_fr_placeholder: makeFrenchPlaceholder(record),
    legal_basis: [record['citation'], record['law_title']].filter(Boolean),
    guardrails: {
      disclaimer_en: DISCLAIMER_EN,
      disclaimer_fr: DISCLAIMER_FR,
      requires_escalation: record['risk_level'] === 'high',
      do_not_present_as_legal_advice: true,
      verify_current_law_before_use: true,
    },
    retrieval: {
      // Strip repeal brackets from the raw law text before indexing it as search text.
      search_text: normalizeWhitespace(stripRepealBrackets([record['topic'], record['law_title'], record['heading'], record['citation'], record['text']].filter(Boolean).join(' '))),
      references: record['references'] ?? [],
      xml_path: record['xml_path'],
    },
    metadata: {
      normalizer_version: record['normalizer_version'],
      parser_version: record['parser_version'],
      quality_warnings: record['quality_warnings'] ?? [],
      source_content_hash: (record['metadata'] as Record<string, unknown>)?.['content_hash'] ?? null,
    },
  };
}

async function listNormalizedFiles(inputDir: string): Promise<string[]> {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(inputDir, entry.name);
    if (entry.isDirectory()) files.push(...await listNormalizedFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith('.normalized.json')) files.push(fullPath);
  }
  return files.sort();
}

async function main(): Promise<void> {
  const inputDir = path.resolve(process.argv[2] || DEFAULT_INPUT_DIR);
  const outputDir = path.resolve(process.argv[3] || DEFAULT_OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });
  const files = await listNormalizedFiles(inputDir);
  const manifest: unknown[] = [];
  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
    const records = Array.isArray(raw['records']) ? raw['records'] as Record<string, unknown>[] : [];
    const guidance = records.map((record) => makeGuidanceCard(record, path.relative(process.cwd(), file)));
    const outputName = `${path.basename(file, '.normalized.json')}.guidance.json`;
    const outputPath = path.join(outputDir, outputName);
    const summary = {
      guidance_version: GUIDANCE_VERSION,
      source_file: path.relative(process.cwd(), file),
      output_file: path.relative(process.cwd(), outputPath),
      record_count: guidance.length,
      high_risk_count: guidance.filter((item) => item['risk_level'] === 'high').length,
      escalation_count: guidance.filter((item) => (item['guardrails'] as Record<string, unknown>)?.['requires_escalation']).length,
      topic_counts: guidance.reduce((acc: Record<string, number>, item) => {
        const t = item['topic'] as string;
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {}),
    };
    await fs.writeFile(outputPath, JSON.stringify({ document: raw['document'], guidance, summary }, null, 2));
    manifest.push(summary);
  }
  await fs.writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), guidance_version: GUIDANCE_VERSION, files: manifest }, null, 2)
  );
  console.log(`Built guidance for ${files.length} normalized file(s) with guidance version ${GUIDANCE_VERSION}.`);
}

main().catch((error: unknown) => { console.error(error); process.exit(1); });
