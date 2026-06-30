# Advisor Training

This folder contains the source-law ingestion pipeline, normalization, guidance generation, safety rules, and evaluation resources for the Dutiva Advisor.

---

## What this folder does

`advisor-training` is a **build-time data pipeline** that:

1. Reads official federal law XML files from `raw-laws/`
2. Parses them into provision records (`parsed/`)
3. Normalizes provisions with topic, risk, and status classification (`normalized/`)
4. Generates advisor-ready guidance cards (`guidance/`)
5. Builds a keyword retrieval index (`data/advisor-guidance-index.json`)

The runtime advisor engine (`src/retrieval/retrieveGuidance.ts`) loads this index and combines it with the curated hardcoded knowledgeBase.

---

## What is currently generated (Federal only)

The pipeline currently ingests three federal source laws:

| Source | File | Status |
|--------|------|--------|
| Canada Labour Code (RSC 1985, c L-2) | `raw-laws/canada/federal/acts/L-2.xml` | Active in pipeline |
| Canadian Human Rights Act (RSC 1985, c H-6) | `raw-laws/canada/federal/acts/H-6.xml` | Active in pipeline |
| Canada Labour Standards Regulations (C.R.C., c. 986) | `raw-laws/canada/federal/regulations/C.R.C.-c-986.xml` | Active in pipeline |
| Work Place Harassment and Violence Prevention Regulations (SOR/2020-130) | `raw-laws/canada/federal/regulations/SOR-2020-130.xml` | Tracked (see raw-laws/README.md) — NOT YET ADDED |

Generated guidance output lives in:
- `guidance/L-2.guidance.json` — Canada Labour Code cards
- `guidance/H-6.guidance.json` — Canadian Human Rights Act cards
- `guidance/C.R.C.-c-986.guidance.json` — Canada Labour Standards Regulations cards
- `guidance/manifest.json` — pipeline build summary
- `data/advisor-guidance-index.json` — final keyword retrieval index (runtime input)

---

## What is runtime-connected

The following runtime files consume the generated index:

| File | Purpose |
|------|---------|
| `src/retrieval/generatedGuidanceTypes.ts` | TypeScript types for generated guidance cards |
| `src/retrieval/generatedGuidanceLoader.ts` | Loads and validates `data/advisor-guidance-index.json` |
| `src/retrieval/generatedGuidanceAdapter.ts` | Adapts generated cards to runtime `GuidanceItem` shape |
| `src/retrieval/retrieveGuidance.ts` | Merges generated guidance with curated knowledgeBase |

**Safety guarantees applied at runtime:**
- `inactive_or_repealed` records are excluded by the loader
- Records whose `advisor_answer_en` still contains `[Repealed, ...]` bracket text are excluded by the loader as a defense-in-depth guard against stale index files
- `unknown`-language records are excluded by the loader
- French placeholder content (`advisor_answer_fr_placeholder`) is never exposed
- Invalid bare-subsection citations (e.g. `s. (a)`, `s. (3)`) are suppressed by the adapter
- Unknown jurisdiction cards are dropped by the adapter
- `filterRetrievedGuidanceForPromptAndWorkspace` applies three ordered filters before guidance reaches the LLM prompt:
  1. Strips residual repeal-bracket text (`[Repealed, …]` / `[Abrogé, …]`) from every field; drops items whose content is empty after stripping
  2. Jurisdiction filter: unknown or conflicted jurisdiction → ALL-province items only; known provincial → matching province and ALL only (FEDERAL-only items excluded unless `isFederallyRegulated`); known federal → FEDERAL and ALL only
  3. Topic-alignment filter: removes items whose category does not match the detected query topic or route intent (accommodation ↔ medical_disclosure cross-category pair is always allowed together)
- The same filtered item set is passed to both `buildAdvisorPrompt()` and `buildWorkspace()` — no double-filtering, no divergence
- The guidance corpus is cached in-process with mtime/size validation on the default index path — no repeated disk reads per request, and a pipeline rebuild is transparently picked up without a process restart

**Safety guarantees applied at pipeline build time:**
- `build-guidance-layer.ts` strips `[Repealed, ...]` brackets from raw law text before writing it into `advisor_answer_en` and `retrieval.search_text`
- `build-guidance-index-keyword.ts` additionally strips brackets when building `embedding_text` and re-cleans `retrieval.search_text` to protect against stale guidance layer output

---

## Jurisdiction support matrix

| Scope | Federal | Ontario | Québec |
|-------|---------|---------|--------|
| Runtime routing support | Yes | Yes | Yes |
| Curated fallback guidance | Yes | Yes | Yes |
| Generated source-law ingestion | **Yes (current)** | No (future) | No (future) |

**Ontario and Québec generated source ingestion are not implemented.** Provincial law XML ingestion requires a separate pipeline pass and is tracked as future work in `metadata/source-registry.json`.

---

## Pipeline commands

Run from the project root:

```sh
npm run pipeline:parse      # Parse XML → advisor-training/parsed/
npm run pipeline:normalize  # Normalize provisions → advisor-training/normalized/
npm run pipeline:guidance   # Generate guidance cards → advisor-training/guidance/
npm run pipeline:index      # Build keyword index → data/advisor-guidance-index.json
npm run pipeline:all        # Run all four steps in sequence (keyword index)
```

Optional — generate vector embeddings after `pipeline:all`:

```sh
# HuggingFace Inference API (no local model download, requires HF_TOKEN):
npm run pipeline:embed:hf

# Local Xenova/transformers (requires internet on first run to download model):
npm run pipeline:embed

# Build per-chunk search records (keyword variant, no vectors):
npm run pipeline:semantic-chunks
```

After running `pipeline:all`, the runtime advisor will automatically use the generated index on the next request. The corpus cache is mtime/size-validated on every request, so a pipeline rebuild is picked up without restarting the process.

---

## Safe for runtime use

The following outputs are safe for runtime use after `pipeline:all`:

- `data/advisor-guidance-index.json` — generated federal guidance index

The following are NOT safe to expose directly to users:

- `advisor_answer_fr_placeholder` fields — French content is a pipeline placeholder, not reviewed or validated. The runtime adapter gates these out.
- Any record with `status: "inactive_or_repealed"` — excluded by the loader.
- Any record with `language: "unknown"` — excluded by the loader.

---

## French / bilingual status

**Current state:** English only. All French content in guidance cards is a machine-generated placeholder marked `advisor_answer_fr_placeholder`. It has NOT been reviewed or validated and is NEVER exposed to users.

**Future phase:** Validated French guidance requires translation and review by a qualified Canadian French speaker familiar with legal HR terminology. See `prompts/response-style-guide.md` and `bilingual/` for the bilingual strategy.

---

## Folder structure

```
advisor-training/
  README.md                     ← This file

  raw-laws/                     ← Untouched official source XML files
    canada/federal/acts/        ← Federal acts (L-2.xml, H-6.xml)
    canada/federal/regulations/ ← Federal regulations (C.R.C.-c-986.xml)

  parsed/                       ← Parsed provision records (pipeline output)
  normalized/                   ← Normalized, classified provisions (pipeline output)
  guidance/                     ← Advisor-ready guidance cards (pipeline output)

  pipelines/                    ← Pipeline scripts (build-time TypeScript, run via ts-node)
    parse-laws-lois-xml.ts           ← Step 1: XML → provisions
    normalize-provisions.ts          ← Step 2: provisions → normalized records
    build-guidance-layer.ts          ← Step 3: normalized → guidance cards
    build-guidance-index-keyword.ts  ← Step 4: guidance → keyword retrieval index
    build-guidance-embeddings-hf.ts  ← Optional: annotate index with HF Inference API embeddings
    build-guidance-embeddings.ts     ← Optional: annotate index with local Xenova embeddings
    build-semantic-chunk-index.ts    ← Optional: per-chunk keyword search records

  metadata/                     ← Taxonomy, schemas, source registry
    source-registry.json        ← Registry of all source inputs and their status
    source-registry.schema.json ← JSON Schema for the source registry
    source-registry.test.ts     ← Vitest tests for source registry integrity
    generated-guidance-card.schema.json  ← Schema for pipeline-generated guidance cards
    guidance-card.schema.json   ← Schema for FUTURE curated-review cards (not pipeline output)
    taxonomy.json               ← Topic taxonomy with risk levels
    jurisdictions.json          ← Jurisdiction metadata (engine codes: FEDERAL, ON, QC, etc.)

  prompts/                      ← Advisor prompt and style instructions
    advisor-system-prompt.md    ← System prompt for the LLM
    response-style-guide.md     ← Response formatting rules (incl. no-Markdown rule)

  safety/                       ← Escalation and guardrail rules
  evaluations/                  ← Test prompts and expected behaviours
    advisor-test-cases.md       ← HR scenario test cases (human-readable)

  examples/                     ← Good/bad response examples
  bilingual/                    ← EN/FR strategy and future bilingual outputs
  knowledge-base/               ← Internal HR compliance knowledge documents
  canada/                       ← Jurisdiction strategy, scope notes, source maps
  training-datasets/            ← Future fine-tuning/evaluation datasets
```

---

## Important architectural note

Pipeline scripts (`.ts` files in `pipelines/`) are **build-time utilities only**, executed via `ts-node`. They must NOT be imported by any `src/` runtime code. Runtime-facing code is TypeScript only (`src/retrieval/generatedGuidance*.ts`).

The pipeline produces data; the TypeScript runtime consumes it. These are intentionally separate layers.

---

## Running tests

```
npm test              # run all tests once (Vitest)
npm run test:watch    # run in watch mode
npm run test:coverage # run with V8 coverage report
```

This runs all Vitest tests including:
- `advisor-training/metadata/source-registry.test.ts` — source registry integrity
- `src/__tests__/generatedGuidanceIntegration.test.ts` — generated guidance integration regression tests
- All existing `src/__tests__/*.test.ts` tests

---

## Future work

- Add `SOR-2020-130.xml` (Work Place Harassment and Violence Prevention Regulations) to the pipeline (see `raw-laws/README.md`)
- Ontario employment standards source ingestion (ESA 2000)
- Québec labour standards source ingestion (CQLR c N-1.1)
- Validated bilingual (FR) guidance layer
- Semantic/vector embedding index (`pipeline:embed:hf` when an embedding API is available)
- Fine-tuning dataset generation (after the corpus is validated)
