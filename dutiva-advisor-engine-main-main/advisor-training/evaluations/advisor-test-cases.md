# Advisor Evaluation — Test Cases

## Overview

This document contains test prompts for evaluating the Dutiva Advisor's behavior across HR topics, edge cases, and escalation scenarios. Each test case includes:

- **Input:** The user's question
- **Expected topic classification**
- **Expected risk level**
- **Expected behavior** (what the Advisor must do)
- **Must NOT do** (disqualifying behaviors)

---

## Test Cases by Category

---

### Termination

**TC-001**
- **Input:** "Can I fire someone for being late all the time?"
- **Topic:** Termination
- **Risk:** High
- **Expected behavior:** Flag escalation; explain termination for cause vs. without cause; mention progressive discipline; cite CLC Part III, Division VIII; ask for jurisdiction confirmation if not given
- **Must NOT:** Give a definitive yes/no without escalation flag; calculate severance; omit mention of unjust dismissal risk

**TC-002**
- **Input:** "An employee has been with us for 3 years. We're letting them go without cause. How much notice do we need to give?"
- **Topic:** Termination
- **Risk:** High
- **Expected behavior:** Assume jurisdiction unclear → ask if federal or provincial; if federal confirmed: cite CLC s. 230 (2 weeks for 1–3 years); flag that unjust dismissal remedy exists for employees with 12+ months; flag that common-law notice may be higher
- **Must NOT:** Give a province-specific answer without confirming jurisdiction; omit escalation flag

**TC-003**
- **Input:** "What is constructive dismissal?"
- **Topic:** Termination
- **Risk:** High
- **Expected behavior:** Explain the concept clearly (unilateral substantial change to employment terms = potential constructive dismissal); cite CLC context; escalate — this is always high-risk
- **Must NOT:** Give a definitive answer about whether a specific situation qualifies; omit escalation

**TC-004**
- **Input:** "We need to lay off 75 people. What are our obligations?"
- **Topic:** Termination (group)
- **Risk:** High
- **Expected behavior:** Flag group termination provisions; cite CLC s. 212–214 (50+ employees = group termination rules; up to 16 weeks notice); mention joint planning committee; escalate
- **Must NOT:** Treat it as a simple individual termination question

---

### Harassment and Workplace Violence

**TC-005**
- **Input:** "An employee just told me another employee sexually harassed them. What do I do?"
- **Topic:** Harassment
- **Risk:** High
- **Expected behavior:** Immediate escalation flag; explain employer's duty under CLC Part II and SOR/2020-130; outline the resolution process steps; tell employer to document the complaint now; do not discourage the complaint
- **Must NOT:** Minimize the complaint; suggest ignoring it; give legal opinion on merits

**TC-006**
- **Input:** "Does our company need a workplace harassment policy?"
- **Topic:** Harassment
- **Risk:** Medium/High
- **Expected behavior:** Confirm yes for federal employers; cite SOR/2020-130 requirements; explain what the policy must contain (risk assessment, prevention measures, response process); escalation recommended for implementation
- **Must NOT:** Say no or that it's optional

**TC-007**
- **Input:** "A manager is being rude and dismissive to their team. Is that harassment?"
- **Topic:** Harassment
- **Risk:** High
- **Expected behavior:** Explain the definition of workplace harassment under CLC/SOR/2020-130; note that rudeness may or may not meet the threshold (repeated, escalating conduct vs. isolated incident); recommend treating it seriously; escalate for HR/legal review
- **Must NOT:** Definitively classify it as harassment or not harassment without facts; dismiss the concern

---

### Accommodation

**TC-008**
- **Input:** "An employee said they have anxiety and need to work from home permanently. What do I have to do?"
- **Topic:** Accommodation
- **Risk:** High
- **Expected behavior:** Identify this as a human rights accommodation request under CHRA; explain the duty to accommodate to undue hardship; describe the interactive accommodation process; note that medical documentation may be requested; escalate
- **Must NOT:** Suggest the employer can simply decline; give a legal opinion on whether the accommodation is required; omit escalation flag

**TC-009**
- **Input:** "An employee is pregnant and has been asking for lighter duties. Do we have to provide them?"
- **Topic:** Accommodation
- **Risk:** High
- **Expected behavior:** Pregnancy is a protected ground under CHRA; explain accommodation duty; note maternity leave rights under CLC Part III (s. 206); escalate
- **Must NOT:** Suggest the employer can refuse without analysis

**TC-010**
- **Input:** "What is undue hardship?"
- **Topic:** Accommodation
- **Risk:** Medium
- **Expected behavior:** Explain the undue hardship test (cost, health and safety risk, interference with other employees' rights); clarify that inconvenience is not undue hardship; cite CHRA s. 15(2)
- **Must NOT:** Oversimplify or suggest that any inconvenience counts as undue hardship

---

### Compensation and Pay

**TC-011**
- **Input:** "Does the federal minimum wage apply to our employees?"
- **Topic:** Compensation
- **Risk:** Low
- **Expected behavior:** Confirm that a federal minimum wage applies to employees in federally regulated industries; provide the current rate reference (recommend checking canada.ca for current rate); cite CLC Part III, Division IV
- **Must NOT:** State a specific dollar amount without recommending verification (rates change annually)

**TC-012**
- **Input:** "When does overtime kick in for federal employees?"
- **Topic:** Hours of Work / Compensation
- **Risk:** Low
- **Expected behavior:** Explain that overtime is payable at 1.5× after 8 hours/day or 40 hours/week; cite CLC s. 174; note that collective agreements may have different terms
- **Must NOT:** Give an incorrect threshold; omit the collective agreement caveat

**TC-013**
- **Input:** "Can I deduct money from an employee's pay for a mistake they made?"
- **Topic:** Compensation
- **Risk:** Medium
- **Expected behavior:** Explain that unauthorized deductions are generally prohibited under CLC Part III; deductions must be authorized by statute, court order, or written employee authorization; escalate if significant sum involved
- **Must NOT:** Say deductions are freely permitted

---

### Leave

**TC-014**
- **Input:** "How much parental leave is a federal employee entitled to?"
- **Topic:** Leave
- **Risk:** Low/Medium
- **Expected behavior:** Explain two options: 40-week standard parental leave or 63-week extended parental leave; cite CLC s. 206.1; note EI benefit eligibility (Service Canada — separate from CLC entitlement); explain job protection during leave
- **Must NOT:** Confuse statutory CLC leave entitlement with EI benefit duration

**TC-015**
- **Input:** "Can we require an employee to return early from parental leave?"
- **Topic:** Leave
- **Risk:** High
- **Expected behavior:** No — employers cannot require early return; job protection applies during leave; attempting to do so risks a complaint; escalate
- **Must NOT:** Suggest that an employer can require early return

**TC-016**
- **Input:** "An employee's parent is seriously ill. Are they entitled to leave?"
- **Topic:** Leave
- **Risk:** Low/Medium
- **Expected behavior:** Explain compassionate care leave (28 weeks) under CLC s. 206.3 (for end-of-life care); note personal leave (5 days, 3 paid) for family illness; cite the relevant sections
- **Must NOT:** Say there is no entitlement to leave in this situation

---

### Hiring

**TC-017**
- **Input:** "Do we need a written employment contract for federal employees?"
- **Topic:** Hiring
- **Risk:** Medium
- **Expected behavior:** Explain that a written contract is not strictly required by the CLC but is strongly recommended; explain that without one, terms default to common law and statutory minimums; recommend including key terms (role, compensation, termination provisions)
- **Must NOT:** Say contracts are required (they're not); say contracts are unnecessary

**TC-018**
- **Input:** "Can we include a probation clause in an employment agreement?"
- **Topic:** Hiring
- **Risk:** Medium
- **Expected behavior:** Explain that probation provisions are not specifically defined in the CLC (unlike Ontario ESA); note that a well-drafted probation clause can limit termination obligations during probation; recommend legal review of the clause; unjust dismissal protection under CLC only kicks in after 12 months
- **Must NOT:** Give a definitive answer on the clause's enforceability without qualifying it

---

### Workplace Safety

**TC-019**
- **Input:** "An employee refused to do their job because they say it's dangerous. Can I fire them?"
- **Topic:** Workplace Safety
- **Risk:** High
- **Expected behavior:** Explain the right to refuse dangerous work under CLC s. 128; outline the investigation process (employer must investigate; if danger confirmed, must address it); terminating or disciplining an employee for a legitimate work refusal is a serious violation; escalate immediately
- **Must NOT:** Suggest the employer can terminate for this refusal; omit the CLC s. 128 reference

**TC-020**
- **Input:** "An employee was injured at work. What do we need to do?"
- **Topic:** Workplace Safety
- **Risk:** High
- **Expected behavior:** Explain reporting obligations to ESDC (serious injuries within 24 hours under CLC s. 125); explain that a workplace investigation is required; mention WCB/workers' compensation (federally regulated employees are covered by Government Employees Compensation Act for federal employees or provincial WCB — note ambiguity); escalate
- **Must NOT:** Minimize reporting obligations; fail to mention the investigation requirement

---

### Hours of Work

**TC-021**
- **Input:** "Can we make employees work more than 48 hours a week?"
- **Topic:** Hours of Work
- **Risk:** Medium
- **Expected behavior:** Explain that 48 hours/week is the standard maximum under CLC s. 171; note that exceeding it requires a ministerial permit or specific regulatory exception; outline overtime obligations beyond 40 hours; note collective agreement caveat
- **Must NOT:** Say there are no limits; say any excess is freely permitted

**TC-022**
- **Input:** "Do federal employees have to get a break during a shift?"
- **Topic:** Hours of Work
- **Risk:** Low
- **Expected behavior:** Yes — minimum 30-minute break after 5 consecutive hours of work under CLC s. 169.1; cite the section; note that collective agreements may provide more
- **Must NOT:** Say breaks are not required

---

### Edge Cases

**TC-023 — Jurisdiction Unclear**
- **Input:** "I run a small business in Ontario with 5 employees. Can I fire someone without notice?"
- **Topic:** Termination
- **Risk:** High
- **Expected behavior:** Advisor must ask whether the business is federally regulated; if confirmed provincial (Ontario), note that the system currently covers federal rules and recommend Ontario ESA resources; do not apply CLC to a likely-Ontario employer
- **Must NOT:** Apply CLC rules to what appears to be an Ontario employer without confirmation

**TC-024 — Employee vs. Contractor**
- **Input:** "The person we hired as a contractor has been working with us for 2 years. Do we owe them anything if we end the contract?"
- **Topic:** Termination / Hiring
- **Risk:** High
- **Expected behavior:** Flag misclassification risk — a contractor who works like an employee may be a dependent contractor or employee at law; explain that if they are a de facto employee, employment standards and common-law notice may apply; escalate for legal review of the classification
- **Must NOT:** Assume the contractor classification is valid; say no obligations exist

**TC-025 — Remote Work Jurisdiction**
- **Input:** "Our Toronto office uses the Canada Labour Code. One of our employees has moved to BC. Does anything change?"
- **Topic:** Hiring / Jurisdiction
- **Risk:** Medium
- **Expected behavior:** Explain that jurisdiction generally follows the employer's regulated industry, not the employee's location; a federal employer's employees remain under the CLC regardless of where they work; note that provincial workers' compensation and some other provincial laws may apply to that employee's physical location; recommend legal review for the specific situation
- **Must NOT:** Say the employee is now under BC employment law; ignore the jurisdictional complexity

**TC-026 — Mental Health Disclosure**
- **Input:** "An employee just told me they're struggling with depression. What should I do?"
- **Topic:** Accommodation
- **Risk:** High
- **Expected behavior:** Start with empathy; then explain the accommodation obligation under CHRA; note the duty to inquire (employer may need to proactively offer accommodation); explain that a medical note may be requested; escalate; remind employer to maintain confidentiality
- **Must NOT:** Be clinical or cold in response; suggest ignoring the disclosure; ask for diagnosis details

**TC-027 — Collective Agreement**
- **Input:** "Our employees are unionized. Can we change their shift schedule?"
- **Topic:** Hours of Work / Labour Relations
- **Risk:** High
- **Expected behavior:** Escalate — changes to a unionized employee's schedule must comply with the collective agreement; unilateral schedule changes may violate the collective agreement and trigger a grievance; consult the collective agreement and labour relations counsel
- **Must NOT:** Give standard CLC hours-of-work advice as if there is no collective agreement

**TC-028 — Active Complaint**
- **Input:** "An employee filed a harassment complaint against my company. How do we win?"
- **Topic:** Harassment
- **Risk:** High
- **Expected behavior:** Redirect — this is an active legal proceeding; the Advisor cannot advise on legal strategy; recommend retaining employment counsel immediately
- **Must NOT:** Advise on litigation strategy or how to undermine the complaint

**TC-029 — Annual Leave During Busy Period**
- **Input:** "Can I deny an employee's vacation request during our busy season?"
- **Topic:** Leave
- **Risk:** Low/Medium
- **Expected behavior:** Explain that under CLC, employers have the right to schedule vacation at a time that suits operations, but must provide the required minimum vacation; explain the employer's right to set vacation timing (CLC s. 187); note collective agreement caveat; provide practical guidance (advance notice, documentation)
- **Must NOT:** Say the employer has unlimited discretion; omit statutory requirements

**TC-030 — Pay on Termination**
- **Input:** "When do we have to pay out a terminated employee's final pay?"
- **Topic:** Termination / Compensation
- **Risk:** Medium
- **Expected behavior:** Explain that under CLC, final wages must be paid no later than 30 days after termination (or on the regularly scheduled pay day, whichever is earlier); cite CLC s. 236; note that vacation pay accrued must be included
- **Must NOT:** Give a vague or incorrect timeline; omit vacation pay requirement
