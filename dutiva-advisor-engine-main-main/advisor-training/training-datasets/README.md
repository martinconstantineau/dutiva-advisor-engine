# Training Datasets

## Purpose

This folder contains structured datasets derived from the guidance pipeline for use in fine-tuning or evaluation of AI models. Only cleaned, validated, and structured data should be stored here.

---

## Dataset Format

Datasets are stored in **JSONL format** (one JSON object per line) for compatibility with fine-tuning tools (OpenAI, HuggingFace, etc.).

### Prompt-Completion Format

```jsonl
{"prompt": "<user question>", "completion": "<advisor response>"}
{"prompt": "<user question>", "completion": "<advisor response>"}
```

### Chat Format (for instruction-tuned models)

```jsonl
{"messages": [{"role": "system", "content": "<system prompt>"}, {"role": "user", "content": "<question>"}, {"role": "assistant", "content": "<answer>"}]}
```

---

## Folder Structure

```
training-datasets/
  README.md
  federal/
    en/
      termination.jsonl
      harassment.jsonl
      accommodation.jsonl
      compensation.jsonl
      leave.jsonl
      hiring.jsonl
      workplace-safety.jsonl
      hours-of-work.jsonl
      records-and-notices.jsonl
      all-topics.jsonl
    fr/
      (validated French equivalents — Phase 2 only)
  evaluation/
    eval-set.jsonl          # held-out set for model evaluation (not training)
    eval-results.json       # results from last evaluation run
```

---

## Dataset Generation Process

1. **Source:** Guidance cards from `advisor-training/guidance/` (output of `build-guidance-layer.ts`)
2. **Filter:** Remove any records with `status: "inactive_or_repealed"` or `quality_warnings` that indicate unreliable text
3. **Format:** Convert each guidance card into one or more prompt-completion pairs using the `user_questions` and `advisor_answer_en` fields
4. **Validate:** Manually review a sample of records from each topic before including in training
5. **Split:** Reserve ~10% of records for evaluation (no overlap with training set)

---

## Validation Requirements Before Dataset Use

Before a dataset file is used for model fine-tuning, confirm:

- [ ] No placeholder FR text is included in EN datasets
- [ ] All high-risk records have escalation language in the completion
- [ ] No citations are fabricated (spot-check against source XML)
- [ ] No personally identifiable information is present
- [ ] Dataset has been reviewed by at least one qualified HR/legal reviewer
- [ ] `eval-set.jsonl` is kept separate from training data

---

## Current Status

| File | Status |
|------|--------|
| federal/en/*.jsonl | Not yet generated — pending guidance layer validation |
| evaluation/eval-set.jsonl | Not yet generated |

To generate datasets, run the guidance pipeline first, validate the guidance cards, and then use the dataset generation script (to be developed in Phase 2).
