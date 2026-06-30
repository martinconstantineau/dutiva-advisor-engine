# Jurisdictions — Knowledge Base

## How the Dutiva Advisor Determines Jurisdiction

### Step 1: Ask

If the user has not stated jurisdiction, the Advisor asks:

> "Is your employer federally regulated (e.g., a bank, airline, telecom, or federal Crown corporation), or does a provincial employment standard apply in your province?"

### Step 2: Apply the Correct Law

| Answer | Law to Apply |
|--------|-------------|
| Federal | Canada Labour Code (RSC 1985, c L-2) |
| Ontario | Employment Standards Act, 2000 (S.O. 2000, c. 41) |
| Quebec | Act Respecting Labour Standards (CQLR c N-1.1) |
| British Columbia | Employment Standards Act (RSBC 1996, c. 113) |
| Alberta | Employment Standards Code (RSA 2000, c. E-9) |
| Manitoba | Employment Standards Code (CCSM c E110) |
| Saskatchewan | Saskatchewan Employment Act (SS 2013, c S-15.1) |
| Nova Scotia | Labour Standards Code (RSNS 1989, c 246) |
| New Brunswick | Employment Standards Act (SNB 1982, c E-7.2) |
| Newfoundland and Labrador | Labour Standards Act (RSNL 1990, c L-2) |
| Prince Edward Island | Employment Standards Act (RSPEI 1988, c E-6.2) |
| Northwest Territories | Employment Standards Act (SNWT 2007, c 13) |
| Nunavut | Labour Standards Act (RSNWT (Nu) 1988, c L-1) |
| Yukon | Employment Standards Act (RSY 2002, c 72) |

### Step 3: When Still Unclear

- Recommend the user confirm with their HR legal counsel
- Do not guess jurisdiction
- Flag that applying the wrong jurisdiction's rules is a compliance risk

---

## Federal Jurisdiction — Who Qualifies

Federal jurisdiction is determined by the **nature of the employer's core business**, not the employee's location or role.

### Industries and Sectors that are Federally Regulated

- **Banking and financial services** — all banks chartered under the Bank Act (Schedule I, II, III)
- **Air transport** — airlines, airports, air navigation, aircraft operations
- **Telecommunications** — telephone companies, cable and internet providers, broadcasting (TV and radio)
- **Interprovincial and international transportation:**
  - Rail (e.g., CN Rail, CP Rail, Via Rail)
  - Trucking that crosses provincial or international borders
  - Pipelines (interprovincial)
  - Shipping (navigation and shipping companies)
  - Ferries crossing provincial or international waters
- **Grain handling** — grain elevators, flour mills, feed mills at inland terminals
- **Nuclear industry** — facilities regulated under the Nuclear Safety and Control Act
- **Federal Crown corporations** — e.g., Canada Post, CBC/Radio-Canada, Export Development Canada, BDC
- **Indigenous band councils and some Indigenous enterprises** — depending on operations (consult legal counsel)
- **Port operations** — longshore workers and port authorities may be federal
- **First Nations self-government entities** — may or may not be federal depending on legislation

### Industries that are NOT Federally Regulated (Usually Provincial)

- Manufacturing, retail, restaurants, hotels, construction
- Healthcare (hospitals, clinics — provincial)
- Schools and universities (provincial)
- Most provincial Crown corporations
- Non-federal government employees

---

## Remote Work and Jurisdiction

**Key rule:** Remote work does NOT change jurisdiction.

If an employee of a federally regulated bank works from home in Ontario, the **Canada Labour Code** still applies — not the Ontario Employment Standards Act.

If an employee of an Ontario retailer works remotely from British Columbia, the **Ontario ESA** typically still applies (the employment relationship governs, not the employee's location).

**Edge case:** When an employee relocates to a different province permanently and continues working for the same employer, jurisdiction may shift. This requires case-by-case legal analysis.

**The Advisor must never say:** "Because you work remotely, federal law applies."

---

## Determining Jurisdiction — Practical Decision Tree

```
Is the employer in banking, airlines, telecom, broadcasting,
interprovincial transport, pipelines, or a federal Crown corp?
    → YES → Canada Labour Code (Federal)
    → NO
        → Which province is the employer operating in?
            → Apply that province's employment standards act
        → UNSURE
            → Flag ambiguity. Recommend legal confirmation.
```

---

## Multi-Jurisdiction Workforces

Some employers have employees in multiple jurisdictions:
- A federal bank has employees in all provinces — still federal for all of them
- A company with subsidiaries in different sectors may have some federal and some provincial employees
- Franchisors vs. franchisees: each franchise is typically assessed separately

---

## Provincial Laws — Phase 2 Scope

Provincial employment standards are explicitly **out of scope for Dutiva MVP**. The following provincial laws are not included in the current guidance pipeline:

- Ontario Employment Standards Act, 2000
- Quebec Act Respecting Labour Standards
- BC Employment Standards Act
- Alberta Employment Standards Code
- All other provincial acts

When a user asks a provincial question, the Advisor should:
1. Acknowledge the question
2. Indicate that the current system covers federal (Canada Labour Code) only
3. Recommend the user consult the relevant provincial Employment Standards ministry or a local HR professional
4. Reference the applicable provincial statute name so they know where to look

---

## Human Rights Jurisdiction

Human rights protections are dual-layered in Canada:

- **Federally regulated employers** → Canadian Human Rights Act (CHRA) + Canadian Human Rights Commission (CHRC)
- **Provincially regulated employers** → Provincial human rights codes (e.g., Ontario Human Rights Code, Quebec Charter of Human Rights and Freedoms)

The Advisor (MVP) applies the CHRA only. Provincial human rights codes are Phase 2.
