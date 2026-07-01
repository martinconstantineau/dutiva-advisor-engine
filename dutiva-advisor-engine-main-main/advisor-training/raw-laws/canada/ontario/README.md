# Ontario raw statute XML

Drop Ontario **e-Laws** statute/regulation XML here:

```
ontario/
  acts/           # e.g. Employment Standards Act, 2000; OHSA; Human Rights Code
  regulations/
```

- Files placed anywhere under this directory are automatically labelled
  **`Ontario`** by the pipeline (`advisor-training/pipelines/jurisdiction.ts`), which
  the runtime maps to province `ON`.
- Ontario statutes are primarily English. If a French version is published, save it with
  an `-fra` (or `/fra/`) marker in the filename/path or an `xml:lang="fr"` attribute so
  the pipeline emits validated French (`content_fr`) instead of relying on live
  translation.
- Source: https://www.ontario.ca/laws

See `advisor-training/PROVINCIAL_INGESTION.md` for the full workflow.
