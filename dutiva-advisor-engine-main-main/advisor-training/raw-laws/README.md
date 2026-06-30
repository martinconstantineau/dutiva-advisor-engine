# Raw Laws

This folder stores **untouched source law files** downloaded from official legal repositories.

## Rules

- **Do not modify any file in this folder.** Every file here is a source of truth.
- **Do not run pipelines on files in this folder directly.** Pipelines read from here and write to `parsed/`.
- **Do not store documentation or strategy files here.** Strategy and scope notes belong in `canada/`.

## Source

All XML files are downloaded from the Justice Canada consolidated laws repository:

```
https://github.com/justicecanada/laws-lois-xml
```

## Structure

```
raw-laws/
  canada/
    federal/
      acts/          ← Federal acts (e.g., L-2.xml, H-6.xml)
      regulations/   ← Federal regulations (e.g., C.R.C.-c-986.xml)
```

## Current Files (MVP)

| File | Law | Downloaded |
|------|-----|------------|
| `canada/federal/acts/L-2.xml` | Canada Labour Code (RSC 1985, c L-2) | ✅ |
| `canada/federal/acts/H-6.xml` | Canadian Human Rights Act (RSC 1985, c H-6) | ✅ |
| `canada/federal/regulations/C.R.C.-c-986.xml` | Canada Labour Standards Regulations (C.R.C., c. 986) | ✅ |
| `canada/federal/regulations/SOR-2020-130.xml` | Work Place Harassment and Violence Prevention Regulations (SOR/2020-130) | ⏳ Pending |

## TODO: Work Place Harassment and Violence Prevention Regulations (SOR/2020-130)

**Source ID:** `reg-canada-federal-sor-2020-130` (tracked in `advisor-training/metadata/source-registry.json`)

The Work Place Harassment and Violence Prevention Regulations (SOR/2020-130) are the primary federal regulatory instrument for workplace harassment prevention under Canada Labour Code Part II. They are currently referenced in the curated knowledgeBase (`src/retrieval/retrieveGuidance.ts`, item `harass-fed-001`) but are NOT yet ingested through the source-law pipeline.

**To add this source:**
1. Download the official XML from Justice Laws: https://laws-lois.justice.gc.ca/eng/regulations/SOR-2020-130/
   - Use the XML download from the justicecanada/laws-lois-xml repository when available, or the Justice Laws XML export.
   - Do NOT fabricate or modify the file. Use only official Justice Laws / Justice Canada source material.
2. Save to: `advisor-training/raw-laws/canada/federal/regulations/SOR-2020-130.xml`
3. Run: `npm run pipeline:all`
4. Verify `guidance/manifest.json` shows the new records.
5. Update `source-registry.json` entry `reg-canada-federal-sor-2020-130` status from `planned` to `active`.
6. Run `npm test` to confirm no regressions.

**Why this matters:** SOR/2020-130 governs negotiated resolution, conciliation, and investigation processes for harassment occurrences in federally regulated workplaces. Adding it to the generated index will expand the harassment guidance coverage significantly.

## Updating a File

If a law is amended and a new consolidated XML is published on Justice Canada:

1. Download the updated file from `justicecanada/laws-lois-xml`
2. Replace the existing file in this folder
3. Re-run the full pipeline: `npm run pipeline:all`
4. Review `guidance/manifest.json` for changes
