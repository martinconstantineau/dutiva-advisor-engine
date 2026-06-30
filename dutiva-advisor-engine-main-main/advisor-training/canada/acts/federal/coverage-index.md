# Federal Acts — Coverage Index

## Purpose

This file tracks which federal acts and regulations have been downloaded, parsed, and included in the guidance pipeline.

---

## Acts

### Canada Labour Code (L-2.xml)

| Status | Detail |
|--------|--------|
| Downloaded | ✅ raw-laws/canada/federal/acts/L-2.xml |
| Parsed | ✅ advisor-training/parsed/L-2.provisions.json |
| Normalized | ✅ advisor-training/normalized/L-2.normalized.json |
| Guidance layer | ✅ advisor-training/guidance/L-2.guidance.json |
| In guidance index | ✅ data/advisor-guidance-index.json |

**Coverage notes:**
- All major parts parsed (Part I through Part IV)
- Repealed provisions marked `is_repealed_or_inactive: true` and suppressed in guidance
- Very long nested provisions may have `very_long_text_possible_nested_capture` warning — review manually

**Known gaps:**
- Schedules not fully parsed as separate guidance cards
- French version (fra/acts/L-2.xml) not yet ingested — Phase 2

---

### Canadian Human Rights Act (H-6.xml)

| Status | Detail |
|--------|--------|
| Downloaded | ✅ raw-laws/canada/federal/acts/H-6.xml |
| Parsed | ✅ advisor-training/parsed/H-6.provisions.json |
| Normalized | ✅ advisor-training/normalized/H-6.normalized.json |
| Guidance layer | ✅ advisor-training/guidance/H-6.guidance.json |
| In guidance index | ✅ data/advisor-guidance-index.json |

**Coverage notes:**
- Protected grounds (s. 3), prohibited discrimination (s. 7–10), accommodation (s. 15), harassment (s. 14) all included
- CHRC procedure sections included for context

**Known gaps:**
- French version not yet ingested — Phase 2

---

## Regulations

### Canada Labour Standards Regulations (C.R.C., c. 986)

| Status | Detail |
|--------|--------|
| Downloaded | ✅ raw-laws/canada/federal/regulations/C.R.C.-c-986.xml |
| Parsed | ✅ advisor-training/parsed/C.R.C.-c-986.provisions.json |
| Normalized | ✅ advisor-training/normalized/C.R.C.-c-986.normalized.json |
| Guidance layer | ✅ advisor-training/guidance/C.R.C.-c-986.guidance.json |
| In guidance index | ✅ data/advisor-guidance-index.json |

---

### Work Place Harassment and Violence Prevention Regulations (SOR/2020-130)

| Status | Detail |
|--------|--------|
| Downloaded | ⏳ Pending — file not yet located in justicecanada/laws-lois-xml |
| Parsed | ⏳ Pending |
| Normalized | ⏳ Pending |
| Guidance layer | ⏳ Pending |
| In guidance index | ❌ Not included yet |

**Action required:** Download SOR-2020-130.xml from laws-lois.justice.gc.ca and add to raw-laws/canada/federal/regulations/. Re-run the full pipeline after download.

---

## Pipeline Run History

| Date | Files Parsed | Provisions | Guidance Cards | Notes |
|------|-------------|------------|----------------|-------|
| 2026-04-30 | 3 | See manifest | 4,252 | Initial MVP pipeline run — keyword-fallback index (no vector embeddings) |
