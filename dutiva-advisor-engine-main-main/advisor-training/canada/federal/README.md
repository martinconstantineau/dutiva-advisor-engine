# Federal Jurisdiction (Canada)

This folder documents the federal scope for the Dutiva Advisor MVP.

## Scope

- Federally regulated employers
- Canada Labour Code (primary law)
- Federal workplace safety, harassment, and employment standards
- Remote work only where the employment relationship is federally regulated

## Out of scope (for now)

- Provincial employment standards (Ontario, Quebec, BC, Alberta, etc.)
- Provincial-only workplaces

## Purpose

This folder is for documentation and strategy only.

It should NOT contain raw XML law files.

All source law files must go into:

```
advisor-training/raw-laws/
```

---

## Law → HR Use Case Map

This table maps each Canada Labour Code part/section to the relevant HR use case and Dutiva product feature.

| CLC Part / Section | HR Topic | Risk | Dutiva Feature |
|--------------------|----------|------|----------------|
| Part I — Industrial Relations | Labour relations, collective bargaining, unions | High | Future: Union Relations module |
| Part II — Occupational Health and Safety | Workplace safety, work refusal (s. 128), safety committees (s. 135) | High | Advisor (safety escalation) |
| Part II + SOR/2020-130 | Workplace harassment and violence prevention, investigation process | High | Advisor (harassment escalation) |
| Part III, Division I — Hours of Work | Standard hours (s. 169), overtime (s. 174), rest periods (s. 169.1), max hours (s. 171) | Medium | Advisor (hours guidance) |
| Part III, Division II — Wages | Minimum wage, overtime pay, deductions | Medium | Compensation module, Advisor |
| Part III, Division IV — Vacations | Vacation entitlement (s. 184), vacation pay calculation | Medium | Advisor (leave guidance) |
| Part III, Division V — General Holidays | Holiday entitlement (s. 195–206), holiday pay | Medium | Advisor (holiday guidance) |
| Part III, Division VII — Leaves of Absence | Maternity (s. 206), parental (s. 206.1), compassionate care (s. 206.3), personal (s. 206.6), medical (s. 239), bereavement (s. 210), family violence (s. 206.7) | Medium–High | Advisor (leave guidance) |
| Part III, Division VIII — Individual Termination | Notice (s. 230), severance (s. 235), unjust dismissal (s. 240–245) | High | GuideTerminationDocumentationPage, Advisor (termination escalation) |
| Part III, Division IX — Group Termination | Group notice obligations (s. 212–214) | High | Advisor (termination escalation) |
| Part III, Division XI — Records | Pay statement requirements, record-keeping obligations | Low | Documents module |
| Canadian Human Rights Act | Accommodation duty (s. 15), prohibited grounds (s. 3), harassment (s. 14) | High | GuideAccommodationPage, Advisor (accommodation escalation) |

---

## Key Federal Law Files Ingested (MVP)

| Law | File | Status |
|-----|------|--------|
| Canada Labour Code (RSC 1985, c L-2) | raw-laws/canada/federal/acts/L-2.xml | ✅ Ingested |
| Canadian Human Rights Act (RSC 1985, c H-6) | raw-laws/canada/federal/acts/H-6.xml | ✅ Ingested |
| Canada Labour Standards Regulations (C.R.C., c. 986) | raw-laws/canada/federal/regulations/C.R.C.-c-986.xml | ✅ Ingested |
| Work Place Harassment and Violence Prevention Regulations (SOR/2020-130) | raw-laws/canada/federal/regulations/SOR-2020-130.xml | ⏳ Pending download |
