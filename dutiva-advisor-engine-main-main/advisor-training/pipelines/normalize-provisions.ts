#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_INPUT_DIR = path.resolve('advisor-training/parsed');
const DEFAULT_OUTPUT_DIR = path.resolve('advisor-training/normalized');
const NORMALIZER_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Interfaces / types
// ---------------------------------------------------------------------------

interface TopicRule {
  topic: string;
  risk_level: string;
  keywords: string[];
}

interface ScoredTopicRule extends TopicRule {
  score: number;
}

interface Classification {
  primary_topic: string;
  topics: string[];
  risk_level: string;
  classification_score: number;
}

interface NormalizedRecord {
  id: string;
  source_record_id: unknown;
  parent_id: unknown;
  children_ids: unknown[];
  source_file: unknown;
  source: unknown;
  parser_version: unknown;
  normalizer_version: string;
  jurisdiction: unknown;
  language: unknown;
  law_title: unknown;
  short_title: unknown;
  long_title: unknown;
  consolidation_date: unknown;
  citation: unknown;
  node_type: unknown;
  section_number: unknown;
  heading: unknown;
  topic: string;
  topics: string[];
  classification_score: number;
  risk_level: string;
  applies_to: string[];
  status: string;
  text: unknown;
  plain_summary: string;
  references: unknown[];
  xml_path: unknown;
  structural_context: unknown[];
  quality_warnings: unknown[];
  metadata: {
    content_hash: unknown;
    run_id: unknown;
    attributes: Record<string, unknown>;
  };
}

interface FileSummary {
  normalizer_version: string;
  source_file: string;
  output_file: string;
  record_count: number;
  topic_counts: Record<string, number>;
  risk_counts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOPIC_RULES: TopicRule[] = [
  {
    topic: 'Termination',
    risk_level: 'high',
    keywords: [
      'termination', 'terminate', 'dismissal', 'dismiss', 'severance', 'notice of termination',
      'wrongful dismissal', 'layoff', 'notice period', 'cessation of employment',
      'licenciement', 'préavis de licenciement', 'indemnité de départ', 'cessation d\'emploi'
    ],
  },
  {
    topic: 'Harassment',
    risk_level: 'high',
    keywords: [
      'harassment', 'violence', 'sexual harassment', 'workplace violence', 'reprisal', 'retaliation',
      'harcèlement', 'violence au travail', 'harcèlement sexuel', 'représailles'
    ],
  },
  {
    topic: 'Accommodation',
    risk_level: 'high',
    keywords: [
      'accommodation', 'disability', 'undue hardship', 'human rights', 'medical leave', 'family status',
      'adaptation', 'accommodement', 'handicap', 'contrainte excessive', 'droits de la personne'
    ],
  },
  {
    topic: 'Compensation',
    risk_level: 'medium',
    keywords: [
      'wage', 'wages', 'pay', 'salary', 'overtime', 'minimum wage', 'vacation pay', 'deduction',
      'remuneration', 'regular rate', 'rate of wages', 'pay period', 'allowance', 'meal', 'living quarters', 'board and lodging',
      'rémunération', 'salaire', 'heures supplémentaires', 'paie', 'retenue'
    ],
  },
  {
    topic: 'Leave',
    risk_level: 'medium',
    keywords: [
      'leave', 'sick leave', 'vacation', 'holiday', 'parental leave', 'maternity leave', 'bereavement',
      'personal leave', 'leave of absence', 'compassionate', 'reservist', 'critical illness', 'family responsibility',
      'congé', 'congé de maladie', 'vacances', 'jour férié', 'congé parental', 'congé de maternité'
    ],
  },
  {
    topic: 'Hiring',
    risk_level: 'medium',
    keywords: [
      'employment contract', 'offer of employment', 'hiring', 'probation', 'employee', 'employer',
      'contrat de travail', 'offre d\'emploi', 'embauche', 'période probatoire', 'employé', 'employeur'
    ],
  },
  {
    topic: 'Workplace Safety',
    risk_level: 'high',
    keywords: [
      'health and safety', 'occupational health', 'workplace safety', 'hazard', 'danger', 'injury',
      'santé et sécurité', 'sécurité au travail', 'danger', 'blessure', 'risque'
    ],
  },
  {
    topic: 'Hours of Work',
    risk_level: 'medium',
    keywords: [
      'hours of work', 'standard hours', 'rest period', 'break', 'shift', 'work schedule',
      'heures de travail', 'heures normales', 'période de repos', 'pause', 'quart'
    ],
  },
  {
    topic: 'Records and Notices',
    risk_level: 'low',
    keywords: [
      'record', 'records', 'notice', 'posting', 'document', 'statement', 'certificate',
      'register', 'pay statement', 'wage statement',
      'dossier', 'avis', 'affichage', 'document', 'déclaration', 'certificat'
    ],
  },
];

/**
 * Structural / procedural provision classes.
 *
 * Applied ONLY when no substantive topic (TOPIC_RULES) matched, so they re-label
 * the residual "Unclassified" bucket — definitions, application/exemption clauses,
 * and administration/enforcement machinery — without ever overriding a substantive
 * classification. These map to the 'general' guidance category at runtime, exactly
 * as Unclassified did, so retrieval behaviour is unchanged; the labels and question
 * templates are simply more accurate.
 */
const STRUCTURAL_TOPIC_RULES: TopicRule[] = [
  {
    topic: 'Definitions and Application',
    risk_level: 'low',
    keywords: [
      'definition', 'definitions', 'interpretation', 'means', 'in this section', 'in this part',
      'in this division', 'in these regulations', 'in this act', 'for the purposes of',
      'application', 'applies', 'does not apply', 'exemption', 'exempt', 'prescribed',
      'définition', 'définitions', 'interprétation', 'la présente partie', 'le présent règlement',
      "pour l'application", "ne s'applique", "s'applique"
    ],
  },
  {
    topic: 'Administration and Enforcement',
    risk_level: 'medium',
    keywords: [
      'inspector', 'compliance order', 'administrative monetary penalty', 'penalty', 'offence',
      'prosecution', 'appeal', 'order to pay', 'payment order', 'wage recovery', 'complaint',
      'adjudicator', 'industrial relations board', 'enforcement', 'debt due', 'violation',
      'head of compliance', 'powers of the minister',
      'inspecteur', 'sanction administrative', 'infraction', 'poursuite', 'appel', 'révision',
      'ordre de paiement', 'plainte', 'arbitre', 'exécution', 'recouvrement'
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeWhitespace(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stableId(parts: unknown[]): string {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 24);
}

function scoreTopic(text: string, rule: TopicRule): number {
  const lower = text.toLowerCase();
  return rule.keywords.reduce((score, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = lower.match(new RegExp(`\\b${escaped.toLowerCase()}\\b`, 'g'));
    return score + (matches?.length ?? 0);
  }, 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classifyProvision(record: any): Classification {
  const searchable = normalizeWhitespace([
    record.law_title,
    record.short_title,
    record.long_title,
    record.heading,
    record.citation_hint,
    record.text,
  ].filter(Boolean).join(' '));

  const scoreRules = (rules: TopicRule[]): ScoredTopicRule[] =>
    rules
      .map((rule) => ({ ...rule, score: scoreTopic(searchable, rule) }))
      .filter((rule) => rule.score > 0)
      .sort((a, b) => b.score - a.score);

  // Tier 1: substantive HR topics. Tier 2 (structural/procedural) is only consulted
  // when no substantive topic matched, so substantive classifications never change.
  let scored = scoreRules(TOPIC_RULES);
  if (scored.length === 0) {
    scored = scoreRules(STRUCTURAL_TOPIC_RULES);
  }

  const primary = scored[0] ?? null;

  return {
    primary_topic: primary?.topic ?? 'Unclassified',
    topics: scored.map((rule) => rule.topic),
    risk_level: record.is_repealed_or_inactive ? 'low' : primary?.risk_level ?? 'low',
    classification_score: primary?.score ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inferAppliesTo(record: any): string[] {
  const text = `${record.heading ?? ''} ${record.text ?? ''}`.toLowerCase();
  const appliesTo = new Set<string>();

  if (/\b(employer|employeur)\b/.test(text)) appliesTo.add('employer');
  if (/\b(employee|employé|employée|worker|travailleur|travailleuse)\b/.test(text)) appliesTo.add('employee');
  if (/\bunion|trade union|syndicat\b/.test(text)) appliesTo.add('union');
  if (/\bminister|inspector|commission|tribunal|ministre|inspecteur|commission|tribunal\b/.test(text)) appliesTo.add('regulator');

  return [...appliesTo];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPlainSummary(record: any): string {
  const text = normalizeWhitespace(record.text);
  if (!text) return '';
  return text.length <= 360 ? text : `${text.slice(0, 357).trim()}...`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRecord(record: any, sourceFile: string): NormalizedRecord {
  const classification = classifyProvision(record);

  return {
    id: stableId(['normalized', record.id, record.parser_version, NORMALIZER_VERSION]),
    source_record_id: record.id,
    parent_id: record.parent_id,
    children_ids: record.children_ids ?? [],
    source_file: record.source_file ?? sourceFile,
    source: record.source,
    parser_version: record.parser_version,
    normalizer_version: NORMALIZER_VERSION,
    jurisdiction: record.jurisdiction,
    language: record.language,
    law_title: record.law_title,
    short_title: record.short_title,
    long_title: record.long_title,
    consolidation_date: record.consolidation_date,
    citation: record.citation_hint,
    node_type: record.node_type,
    section_number: record.section_number,
    heading: record.heading,
    topic: classification.primary_topic,
    topics: classification.topics,
    classification_score: classification.classification_score,
    risk_level: classification.risk_level,
    applies_to: inferAppliesTo(record),
    status: record.is_repealed_or_inactive ? 'inactive_or_repealed' : 'active_or_current_unknown',
    text: record.text,
    plain_summary: buildPlainSummary(record),
    references: record.references ?? [],
    xml_path: record.xml_path,
    structural_context: record.structural_context ?? [],
    quality_warnings: record.quality_warnings ?? [],
    metadata: {
      content_hash: record.content_hash,
      run_id: record.run_id,
      attributes: record.attributes ?? {},
    },
  };
}

async function listProvisionFiles(inputDir: string): Promise<string[]> {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(inputDir, entry.name);
    if (entry.isDirectory()) files.push(...await listProvisionFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith('.provisions.json')) files.push(fullPath);
  }

  return files.sort();
}

async function main(): Promise<void> {
  const inputDir = path.resolve(process.argv[2] || DEFAULT_INPUT_DIR);
  const outputDir = path.resolve(process.argv[3] || DEFAULT_OUTPUT_DIR);

  await fs.mkdir(outputDir, { recursive: true });

  const files = await listProvisionFiles(inputDir);
  const manifest: FileSummary[] = [];

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = JSON.parse(await fs.readFile(file, 'utf8'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records: any[] = Array.isArray(raw.records) ? raw.records : [];
    const normalized = records.map((record) => normalizeRecord(record, path.relative(process.cwd(), file)));
    const outputName = `${path.basename(file, '.provisions.json')}.normalized.json`;
    const outputPath = path.join(outputDir, outputName);

    const summary: FileSummary = {
      normalizer_version: NORMALIZER_VERSION,
      source_file: path.relative(process.cwd(), file),
      output_file: path.relative(process.cwd(), outputPath),
      record_count: normalized.length,
      topic_counts: normalized.reduce((acc, record) => {
        acc[record.topic] = (acc[record.topic] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      risk_counts: normalized.reduce((acc, record) => {
        acc[record.risk_level] = (acc[record.risk_level] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    await fs.writeFile(outputPath, JSON.stringify({ document: raw.document, records: normalized, summary }, null, 2));
    manifest.push(summary);
  }

  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ generated_at: new Date().toISOString(), normalizer_version: NORMALIZER_VERSION, files: manifest }, null, 2));
  console.log(`Normalized ${files.length} provision file(s) with normalizer ${NORMALIZER_VERSION}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
