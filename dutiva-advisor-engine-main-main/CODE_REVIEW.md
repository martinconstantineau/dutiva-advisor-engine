# Code Review — dutiva-advisor-engine

_Repository review and remediation pass. Scope: the full runtime engine (`src/`), the
safety layer, retrieval/citation pipeline, web-search module, and the
`advisor-training` data pipeline and reference docs._

## Health baseline

| Check | Result |
| --- | --- |
| `npx tsc` (build) | ✅ clean |
| `npm run lint` | ✅ clean |
| `npm test` | ✅ 743 tests / 35 files passing |
| `npm audit` | ✅ 0 findings (from prior pass) |

This is a well-engineered codebase. The gating philosophy (every sensitive field has
a boolean route gate, and `validateAdvisorResponse.ts` self-checks gate/payload
consistency on every response), the jurisdiction-leakage test suite (which spies on
the literal text sent to the LLM to prove Québec guidance never reaches an Ontario
prompt), the two-pass PII redaction in `webSearch/buildWebSearchQuery.ts`, and the
conservative citation philosophy are all well above par for a project this size.

---

## Fixed in this pass

All items below are implemented and covered by regression tests; the full suite is green.

### 1. Crisis classifier — weapon-noun false positives (safety)
`src/safety/classifySensitiveInput.ts` — the crisis pattern matched any bare
`weapon|gun|knife` with no context, so benign HR questions ("is a nail gun regulated
for warehouse staff?", "an employee cut themselves with a knife while prepping food")
were classified as a crisis and short-circuited into the self-harm hotline response
with **zero** HR guidance. The weapon patterns now require explicit violence intent
(`shoot/stab/kill/attack` + a person target, or a weapon noun within 30 chars of a
violence verb). Self-harm and credible-threat recall is unchanged and explicitly
asserted. Tests: `src/__tests__/safetyClassifierPrecision.test.ts`.

### 2. Out-of-scope routing — false positives (correctness)
`src/core/routeAdvisorMessage.ts` — bare topical words like "sport" and "game"
redirected legitimate HR questions ("an employee was injured playing a sport at our
company event, do we have liability?") to `out_of_scope`. The out-of-scope check is
now suppressed when the message carries workplace/HR context. Genuinely off-topic
queries (recipes, weather) still redirect. Tests: same file as #1.

### 3. Web-source validator — SSRF / private-host gaps (security hardening)
`src/webSearch/validateWebSource.ts` — `isPrivateHost()` had inert IPv6 checks
(Node wraps IPv6 hostnames in brackets — `"[::1]"` — which the `^::1$` / `^fc..`
patterns never matched) and was missing the cloud-metadata endpoint
`169.254.169.254`, `0.0.0.0`, and the `fe80::/10` link-local range. Now strips
brackets/zone-id before matching and covers loopback, RFC1918, link-local, metadata,
unique-local, and IPv4-mapped IPv6. (Not a live SSRF vector today — result URLs are
classified, not fetched — but the guard now matches its docstring.) Tests:
`src/__tests__/validateWebSource.test.ts`.

### 4. Bilingual XML parsing artifact (data quality)
`advisor-training/pipelines/parse-laws-lois-xml.ts` — inline bilingual definitions
in the Justice Canada XML were mangled by the `preserveOrder:false` parser:
`<DefinedTermFr>` French labels were interleaved into the English provision text, and
`Section`-level container nodes recursively flattened all child definitions into one
scrambled blob ("Act Canada Labour Code Loi means … Director … afficher means …").
This text was fed directly into the LLM prompt. Fix: drop `<DefinedTermFr>` from
English extraction, stop recursively flattening child *provision* nodes (each is
already emitted as its own record), and clean up the empty-paren artifact left behind.
The corpus was regenerated (`npm run pipeline:all`): French-term interleave
**5 → 0**, empty-paren `means … ()` **44 → 0**, with leaf definitions preserved as
clean individual records.

### 5. `cleanAdvisorText` — underscore stripping ate identifiers (correctness)
`src/core/cleanAdvisorText.ts` — the underscore-emphasis regex collapsed real
identifiers (`company_name_field` → `companynamefield`). Underscore emphasis is now
only stripped at word boundaries (matching CommonMark's intra-word rule), preserving
identifiers. Tests added to `src/__tests__/cleanAdvisorText.test.ts`.

### 6. Documentation drift
- `README.md` — jurisdiction table now surfaces the federal-vs-provincial **coverage
  depth** disparity (federal = automated section-cited pipeline; ON/QC = a handful of
  curated entries) instead of a flat "Supported".
- `advisor-training/prompts/advisor-system-prompt.md` — In/Out-of-scope updated:
  ON/QC are supported (curated), not "Phase 2"; BC/AB/others remain out of scope.
- `advisor-training/prompts/response-style-guide.md` — corrected the "English only"
  claim; the runtime generates French live (LLM translation from English context,
  not validated French source) when `locale: 'fr'`.
- `src/retrieval/filterRetrievedGuidance.ts` — fixed a stale comment pointing at a
  renamed function (`getTopicCategoriesFromIntent`, which no longer exists).

---

## Implemented after product decision

The three items below carried product/legal/API-contract weight; each was confirmed
with the owner and then implemented and tested.

### A. Playbooks wired into the workspace _(decision: wire in)_
`buildWorkspace()` now populates `confidentialityNotes`, `antiReprisalNotes`, and
`suggestedDocuments` from the curated topic playbook via a new intent→playbook
registry (`src/playbooks/index.ts`, `getPlaybookForIntent()`). Confidentiality and
anti-reprisal notes are gated by `workspaceAllowed`; suggested documents by
`suggestedDocumentsAllowed`. The `src/playbooks/*` trees are no longer orphaned.
Tests: `src/__tests__/playbookWorkspaceIntegration.test.ts`.

### B. `legalBasis` reconciliation _(decision: build it)_
New `reconcileRawCitation()` (`citationValidation.ts`) matches an LLM-cited string
against the citations carried by the **vetted guidance actually retrieved** for the
query, and promotes a corroborated citation to `valid` — rendering the engine's
canonical vetted form, never the raw LLM text. An LLM citation is still never
authoritative on its own: with retrieval off (or no match) it stays withheld, so the
`hardeningRegressions.test.ts` invariant continues to hold. Tests:
`citationValidation.test.ts` (unit) + `playbookWorkspaceIntegration.test.ts` (e2e).

### C. Deterministic scope-of-practice refusal gates _(decision: deterministic gates)_
New `classifyScopeBoundary()` (`src/safety/classifyScopeBoundary.ts`) enforces the
four `escalation-rules.md` refusals as a pre-LLM short-circuit (mirroring crisis
gating): drafting a separation/severance agreement, legal-opinion / outcome
predictions, active tribunal matters, and employee-side claims (now reading
`userRole`). Each returns a bilingual decline+redirect with all content gates off and
`professionalReview: legal`. Patterns are narrow — explaining what a separation
agreement covers, or drafting a plain termination notice letter, are not refused.
Tests: `src/__tests__/scopeBoundary.test.ts`.

---

## Follow-ups completed

### Topic-classification consolidation
The category-deriving logic that lived in three places is now a single source of
truth: `src/retrieval/topicClassification.ts` exports `getQueryTopicCategories()`
(message → category) and `topicCategoriesFromIntent()` (intent → category); both
`composeAdvisorResponse.ts` and `filterRetrievedGuidance.ts` import it, and the dead
`inferGuidanceTopics()` / `TOPIC_PHRASES` in `normalizeGuidanceText.ts` were removed.
(`routeAdvisorMessage.ts` keeps its own patterns — that is message → *intent* routing,
a distinct concern, intentionally not merged.) Tests: `topicClassification.test.ts`.

### Federal-vs-provincial depth — curated ON/QC coverage deepened
Ontario and Québec had no province-specific curated entry for **compensation**
(pay/hours/overtime/holidays) or **medical disclosure** — the two biggest gaps vs the
federal corpus. Added accurate, framework-level entries (`comp-on-001`, `meddisc-on-001`,
`comp-qc-001`, `meddisc-qc-001`) in `retrieveGuidance.ts`, with citations and no
current dollar figures (consistent with the engine's no-stale-numbers philosophy).
Tests: `provincialCoverage.test.ts`. Deep automated provincial *statute* ingestion
remains future work (no provincial source XML in-repo; `source-registry.json` tracks it
as `planned`).

### Unused 13 MB semantic-chunks artifact — removed
`data/advisor-semantic-chunks.json` (~13 MB) was produced by
`build-semantic-chunk-index.ts` but read by nothing in `src/` (runtime retrieval uses
`data/advisor-guidance-index.json` keyword scoring only). The committed artifact was
deleted and `.gitignore`d (regenerated on demand); the generator script is kept for the
future semantic-retrieval work, and `pipelines/README.md` now states it is not wired in.

### Inline first-message jurisdiction detection — added
The request handler now scans the *current* message for an explicit jurisdiction via a
shared `detectProvinceInText()` (also used by the history scan), so "I'm an Ontario
employer…" or "we're federally regulated…" in a first turn resolves jurisdiction without
the frontend setting `province`. It sits below structured fields and above history in the
precedence chain (structured input still wins). Tests: `inlineJurisdiction.test.ts`.

### "Unclassified" corpus share — reduced 41.9% → 26.1%
The classifier in `normalize-provisions.ts` now uses two tiers: substantive HR topics are
scored first and **unchanged**; only provisions that match no substantive topic fall
through to new structural classes (`Definitions and Application`, `Administration and
Enforcement`), which map to the `general` runtime category exactly as `Unclassified` did
(so retrieval behaviour is unchanged, the labels and question templates are just
accurate). A few targeted substantive keywords were also added for rate/record
provisions. Result on regeneration: Unclassified 1575 → 983 of 3760, with the residue
being genuine fragment sub-clauses.

### ON/QC groundwork + proper bilingualism — added
Laid the infrastructure for provincial support and made the runtime genuinely bilingual:
- **Bilingual data model end-to-end.** `GuidanceItem` gained `content_fr` / `title_fr` /
  `advisor_answer_fr`; `src/bilingual/localizeGuidance.ts` (which finally wires in the
  previously-dead `frenchTerminology` + `locale` primitives) selects text by locale and
  falls back to English — never a placeholder. Selection flows through `buildAdvisorPrompt`,
  the deterministic fallbacks, and workspace labels.
- **Curated ON/QC content is bilingual.** All 8 Québec (francophone — French-first) and
  all 8 Ontario curated entries in `retrieveGuidance.ts` now carry validated French.
- **Jurisdiction-aware ingestion.** `parse-laws-lois-xml.ts` no longer hardcodes federal;
  `advisor-training/pipelines/jurisdiction.ts` infers jurisdiction + source from the
  raw-laws path (federal/ontario/quebec), and `build-guidance-layer.ts` emits a real
  `advisor_answer_fr` for French-language source records (adapter promotes it to
  `content_fr`).
- **Scaffolding.** `raw-laws/canada/{ontario,quebec}/` directories with source READMEs,
  `advisor-training/PROVINCIAL_INGESTION.md`, updated `source-registry.json` notes, and an
  updated bilingual README. Tests: `bilingualGuidance.test.ts`, `jurisdiction.test.ts`.

## Noted (remaining)

- **Deep automated provincial statute ingestion** (ON/QC and beyond) — the larger,
  near-term effort. The pipeline is now jurisdiction-aware and bilingual-ready; what
  remains is dropping in the e-Laws / LégisQuébec XML and running `pipeline:all` (see
  `advisor-training/PROVINCIAL_INGESTION.md`). A later refinement is pairing EN/FR
  provision records into single bilingual cards. Needs provincial
  source data; not yet started.
- **"Hiring" over-capture.** The `Hiring` rule keys on the very common `employee`/
  `employer` terms, so ~25% of the federal corpus lands there; a future pass could
  tighten it the way the structural tier tightened `Unclassified`.

---

_Generated as part of the repository code-review pass. Items under "Fixed in this
pass", "Implemented after product decision", and "Follow-ups completed" are implemented
and tested (743 tests passing). The "Noted" items are remaining future work._
