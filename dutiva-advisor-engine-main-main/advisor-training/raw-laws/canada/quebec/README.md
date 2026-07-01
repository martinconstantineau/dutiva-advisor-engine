# Québec raw statute XML

Drop Québec **LégisQuébec** statute/regulation XML here:

```
quebec/
  lois/           # e.g. Act respecting labour standards (N-1.1); Charter of Human Rights and Freedoms (C-12)
  reglements/
```

- Files placed anywhere under this directory are automatically labelled **`Quebec`** by
  the pipeline (`advisor-training/pipelines/jurisdiction.ts`), which the runtime maps to
  province `QC`.
- **Québec statutes are officially bilingual — obtain BOTH the English and French XML.**
  Save the English file with an `-eng` (or `/eng/`) marker or `xml:lang="en"`, and the
  French file with an `-fra` (or `/fra/`) marker or `xml:lang="fr"`. The pipeline emits a
  real, validated `advisor_answer_fr` (→ `content_fr`) from the French source, so French
  requests are grounded in official French text rather than a live translation.
- Source: https://www.legisquebec.gouv.qc.ca

See `advisor-training/PROVINCIAL_INGESTION.md` for the full workflow.
