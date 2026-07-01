# Provincial statute ingestion — groundwork guide (ON / QC)

This is the checklist and reference for extending the automated `advisor-training`
pipeline beyond federal law to Ontario and Québec. The **plumbing is in place**; what
remains is dropping in provincial source XML and running the pipeline. Until then,
Ontario and Québec are served by the hand-curated, **bilingual** entries in
`src/retrieval/retrieveGuidance.ts`.

## What's already wired (groundwork done)

- **Jurisdiction is inferred from the file path**, not hardcoded. See
  `advisor-training/pipelines/jurisdiction.ts` (`inferJurisdiction` / `inferSource`):
  a file under `raw-laws/canada/ontario/…` is labelled `Ontario`, under
  `…/quebec/…` → `Quebec`, under `…/federal/…` → `Canada (Federal)` (the default).
  The runtime adapter already maps `Ontario → ON`, `Quebec → QC`,
  `Canada (Federal) → FEDERAL` (`generatedGuidanceAdapter.jurisdictionToProvince`).
- **Bilingual output is a first-class field.** `build-guidance-layer.ts` emits a real
  `advisor_answer_fr` for **French-language source records** (not the placeholder), and
  the adapter promotes it to `GuidanceItem.content_fr`. The runtime
  (`buildAdvisorPrompt`, deterministic fallbacks, workspace labels) serves French text
  when `locale === 'fr'` and falls back to English otherwise — see
  `src/bilingual/localizeGuidance.ts`.
- **Language is inferred per file** from the `xml:lang` attribute or an `-eng`/`-fra`
  (or `/eng/`, `/fra/`) marker in the path (`parse-laws-lois-xml.inferLanguage`).

## Directory layout to populate

```
advisor-training/raw-laws/canada/
  federal/        acts/ , regulations/        ← existing (L-2, H-6, C.R.C.-c-986)
  ontario/        acts/ , regulations/        ← drop Ontario e-Laws XML here
  quebec/         lois/ , reglements/         ← drop LégisQuébec XML here (EN + FR)
```

## Sources

| Jurisdiction | Source | Notes |
| --- | --- | --- |
| Ontario | **e-Laws** — ontario.ca/laws | Primary: Employment Standards Act, 2000 (`00e41`), OHSA (`90o01`), Human Rights Code (`90h19`). Mostly English; add French versions where published. |
| Québec | **LégisQuébec** — legisquebec.gouv.qc.ca | Primary: Act respecting labour standards (`N-1.1`), Charter of Human Rights and Freedoms (`C-12`), Act respecting OHS (`S-2.1`). **Officially bilingual — obtain BOTH the English and French XML.** |

## Bilingualism — how to get validated French (not live translation)

Québec statutes are official in both languages. To produce **validated** French
guidance (rather than the LLM translating English on the fly):

1. Save the **English** file with an `-eng`/`/eng/` marker (or `xml:lang="en"`) and the
   **French** file with an `-fra`/`/fra/` marker (or `xml:lang="fr"`).
2. Run the pipeline. English files produce `advisor_answer_en`; French files produce a
   real `advisor_answer_fr` (via `makeFrenchAnswer`), which the adapter promotes to
   `content_fr`.
3. At runtime, a `locale: 'fr'` request is grounded in that validated French text.

> Follow-up (out of scope for this groundwork): pair the EN and FR records of the same
> provision (by citation/section) into a single bilingual card so `content` and
> `content_fr` live on one item. Today they are separate cards keyed by language —
> functional for retrieval, but not yet merged.

## Run the pipeline after adding files

```
npm run pipeline:all      # parse → normalize → guidance → keyword index (data/advisor-guidance-index.json)
npm test                  # confirm the corpus still loads and all gates hold
```

`pipeline:all` regenerates `data/advisor-guidance-index.json`, which the runtime reads.
Jurisdiction filtering, topic alignment, and the leakage tests already ensure Ontario
guidance never reaches a Québec prompt (and vice-versa).

## Current status

- Federal: **deep** automated coverage (Canada Labour Code, CLSR, CHRA — thousands of
  section-cited records).
- Ontario / Québec: **curated, bilingual** entries only (`retrieveGuidance.ts`) until the
  statute XML above is ingested. `source-registry.json` tracks the ON/QC sources as
  `planned`.
