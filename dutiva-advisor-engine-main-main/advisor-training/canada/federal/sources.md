# Federal Law Sources

Primary source for this project:

- Justice Canada consolidated laws XML repository
  https://github.com/justicecanada/laws-lois-xml

---

## Ingested Files (MVP)

| Law | Statute ID | XML Path (in repo) | Local Path | Status |
|-----|------------|-------------------|------------|--------|
| Canada Labour Code | L-2 | `eng/acts/L-2.xml` | `raw-laws/canada/federal/acts/L-2.xml` | ✅ Downloaded |
| Canadian Human Rights Act | H-6 | `eng/acts/H-6.xml` | `raw-laws/canada/federal/acts/H-6.xml` | ✅ Downloaded |
| Canada Labour Standards Regulations | C.R.C., c. 986 | `eng/regulations/C.R.C.,_c._986.xml` | `raw-laws/canada/federal/regulations/C.R.C.-c-986.xml` | ✅ Downloaded |

---

## Pending Downloads

| Law | Statute ID | Notes |
|-----|------------|-------|
| Work Place Harassment and Violence Prevention Regulations | SOR/2020-130 | File path in justicecanada/laws-lois-xml not confirmed — verify before downloading |

---

## Important

All XML files must be downloaded and stored under:

```
advisor-training/raw-laws/canada/federal/acts/
advisor-training/raw-laws/canada/federal/regulations/
```

Do NOT store raw XML files in the `canada/` documentation folders.

After downloading a new file, re-run the full pipeline:

```
npm run pipeline:all
```

Then update `canada/acts/federal/coverage-index.md` with the new file's ingestion status.
