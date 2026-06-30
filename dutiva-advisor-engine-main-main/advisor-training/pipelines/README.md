# Pipelines

This folder contains the TypeScript scripts that transform raw Canadian federal law XML into the advisor guidance index consumed by the live Dutiva Advisor. Scripts are executed at build time via `ts-node`.

---

## Pipeline Overview

```
raw-laws/          (untouched XML from Justice Canada)
    ↓
parse-laws-lois-xml.ts
    ↓
parsed/            (provision records, one file per law)
    ↓
normalize-provisions.ts
    ↓
normalized/        (cleaned + topic-classified records)
    ↓
build-guidance-layer.ts
    ↓
guidance/          (advisor-ready guidance cards with citations, risk levels, escalation flags)
    ↓ (choose one)
build-guidance-embeddings-hf.ts   (HuggingFace Inference API — requires HF_TOKEN)
  or
build-guidance-embeddings.ts      (local Xenova/transformers — requires internet on first run)
  or
build-guidance-index-keyword.ts   (offline keyword fallback — no internet required)
    ↓
data/advisor-guidance-index.json   (loaded at runtime by src/retrieval/generatedGuidanceLoader.ts)
    ↓ (optional)
build-semantic-chunk-index.ts
    ↓
data/advisor-semantic-chunks.json  (per-chunk search records for future semantic retrieval)
```

---

## Scripts

### `parse-laws-lois-xml.ts`

**Run:** `npm run pipeline:parse`

Reads all `.xml` files from `raw-laws/canada/federal/acts/` and `raw-laws/canada/federal/regulations/`.

Parses each file using `fast-xml-parser` and extracts individual provision records, including:
- Section numbers and labels
- Marginal notes and heading hierarchy
- Raw legal text
- Repealed/inactive flags

Output: one `*.provisions.json` per law file in `parsed/`, plus `manifest.json` summarising quality warnings.

---

### `normalize-provisions.ts`

**Run:** `npm run pipeline:normalize`

Reads provision records from `parsed/` and applies:
- Topic classification (Termination, Harassment, Accommodation, etc.)
- Risk level assignment (high / medium / low)
- Applies-to actor tagging (employer, employee, union, regulator)
- Jurisdiction tagging
- Deduplication and whitespace normalisation
- Flagging of repealed or inactive provisions

Output: one `*.normalized.json` per law file in `normalized/`, plus `manifest.json`.

---

### `build-guidance-layer.ts`

**Run:** `npm run pipeline:guidance`

Reads normalized records from `normalized/` and builds advisor-ready guidance cards, each containing:
- `id` — stable SHA-1 derived identifier
- `topic` — primary HR topic
- `risk_level` — high / medium / low
- `citation` — statute, part, and section reference
- `law_title` — official act/regulation name
- `advisor_answer_en` — plain-language guidance in English
- `advisor_answer_fr_placeholder` — placeholder for future validated French text
- `user_questions` — example prompts that would retrieve this card
- `legal_basis` — array of statute references
- `guardrails` — escalation flags
- `retrieval.search_text` — keyword-optimised text for retrieval

Output: one `*.guidance.json` per law file in `guidance/`, plus `manifest.json`.

---

### `build-guidance-embeddings-hf.ts`

**Run:** `npm run pipeline:embed:hf`

Reads guidance cards from the existing `data/advisor-guidance-index.json` (produced by `pipeline:index`) and annotates each item with a 384-dimensional vector embedding using the HuggingFace Inference API (`sentence-transformers/all-MiniLM-L6-v2`).

Requires `HF_TOKEN` environment variable (free token at huggingface.co/settings/tokens). Fully resumable — items that already have an `embedding` array are skipped.

Output: `data/advisor-guidance-index.json` updated in-place with `embedding` arrays for semantic vector search.

---

### `build-guidance-embeddings.ts`

**Run:** `npm run pipeline:embed`

Local alternative to `pipeline:embed:hf`. Generates embeddings using `@xenova/transformers` (sentence-transformers/all-MiniLM-L6-v2) downloaded and cached locally.

When `@xenova/transformers` is not installed in the project, this script auto-installs it on demand into `.cache/advisor-training/embedding-deps` (without adding it to root dependencies).

Requires outbound internet access on the first run to download the package and model weights from HuggingFace. Subsequent runs use the local cache.

Output: `data/advisor-guidance-index.json` with `embedding` arrays for semantic vector search.

---

### `build-guidance-index-keyword.ts`

**Run:** `npm run pipeline:index`

Offline-capable alternative to the embeddings pipeline. Builds the same `data/advisor-guidance-index.json` format without vector embeddings. The runtime retrieval layer (`src/retrieval/generatedGuidanceLoader.ts`) automatically uses keyword matching when embeddings are absent.

Use this script in CI/CD environments where HuggingFace is unreachable.

---

### `build-semantic-chunk-index.ts`

**Run:** `npm run pipeline:semantic-chunks`

Reads `data/advisor-guidance-index.json` (produced by `pipeline:index`) and generates a per-chunk search record file for future semantic retrieval experiments.

This script is a keyword-chunk variant — it does not produce vector embeddings. Use `pipeline:embed:hf` or `pipeline:embed` for vector embeddings.

Output: `data/advisor-semantic-chunks.json`

> **Not wired into runtime retrieval yet.** Nothing in `src/` reads this file — runtime retrieval uses `data/advisor-guidance-index.json` (keyword scoring) only. Because the output is large (~13 MB) and regenerated on demand, it is `.gitignore`d rather than committed. Run this script when you start the semantic-retrieval work; until then it is optional.

---

### Run All (Keyword Index)

```
npm run pipeline:all
```

Runs `pipeline:parse → pipeline:normalize → pipeline:guidance → pipeline:index` in sequence.

For semantic vector embeddings (optional, run after `pipeline:all`):

```sh
# HuggingFace Inference API (requires HF_TOKEN):
npm run pipeline:embed:hf

# Local Xenova/transformers (requires internet on first run):
npm run pipeline:embed
```

---

## Adding a New Law File

1. Download the XML from `https://github.com/justicecanada/laws-lois-xml` and place it in `raw-laws/canada/federal/acts/` or `raw-laws/canada/federal/regulations/`
2. Update `canada/federal/sources.md` with the new file's details
3. Run `npm run pipeline:all`
4. Review the new file's entry in `guidance/manifest.json` for quality warnings
5. Update `canada/acts/federal/coverage-index.md` with the ingestion status
