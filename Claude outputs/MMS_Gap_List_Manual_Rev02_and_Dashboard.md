# MMS Gap List — Code vs Manual Rev 02 (30 Jun 2026) and Dashboard Deck (08.10.2026)

Reviewed against repo `jbritanico/MMS` @ commit 0d2122d (clone). Local uncommitted edits (named-routing Stage 1–2) are not reflected. No code was changed; each item below becomes a find/replace block when you pick it up.

## A. MR-I workflow and approvals (Manual 6.1, 8.1, 8.2, 9.2)

| # | Gap | Manual ref | Code today | Change needed | Size |
|---|-----|-----------|------------|---------------|------|
| A1 | Yellow "Under Maintenance" tag missing | 8.1 | `assets.tag_status` and `mri_fault_rectifications.tag_status` only hold Red/Green; ReportWizard shows Green / Red / "Not yet tagged" | Add Yellow state. Set Yellow when a repair/MR-II/MR-III/BM starts, back to Green on release. Show in wizard banner, asset registry, dashboard | M |
| A2 | Moderate reclassified from Critical must Green-Tag and close | Table 3 | Reclassify Moderate→Critical re-opens as Pending (correct). Critical→Moderate path not confirmed to clear Red tag | Verify Critical→Moderate sets tag Green and closes the report | S |
| A3 | Red-tag deployment exemption via MOC | 6.1.5 | No MOC concept anywhere | Add "MOC exemption" record on a Red-tagged asset: approver, limitations, controls, validity date, return-to-service conditions. Block deployment/Pre-Job when Red and no valid exemption | M |
| A4 | Severity wording "Major" | Table 3 (Major / Critical) | Backend error string at lib.rs ~2773 says "Minor, Moderate, Major, or Critical" but `valid_severity` accepts only Minor/Moderate/Critical | Fix message; decide whether the UI label should read "Major / Critical" (Level 3) | XS |
| A5 | Moderate review authority | Table 3 | Ops Coordinator / Maintenance Supervisor reviews; Manager/FSM informed | Confirm an "informed" notice goes to Manager/FSM on every Moderate reclassification (partly covered by acknowledgment flow). Check "Ops Coordinator" exists as a role | S |
| A6 | Access tiers vs roles | 9.2, Table 4 | 6 roles (Data Miner View, Operator, Job Supervisor, Maintenance Supervisor, Manager/FSM, Administrator) | Map tiers: View Only = Data Miner View; Tier 1 = Operator (no edit after submit); Tier 2 = Maintenance Team / Lead Operator (close faults); Tier 3 = Supervisors/Coordinator. Add role(s) for Package In-Charge / Lead Operator / Maintenance Engineer / Lead Mechanic, or document the mapping | M |
| A7 | Tier 3: "Direct closure of Pre-Job MR-I" and "Approve Post-Job and Pre-Mobilization MR-I" | 9.2 | Closure rules key off fault severity only; Compliance Stage (PREMOB / PRE-JOB / POST JOB / YARD INSPECTION) is not used in any permission rule | Decide and implement stage-based rules: Pre-Job with no escalatable fault can be closed directly by Tier 3; Post-Job and Pre-Mob need Tier 3 approval. Needs your ruling (see Open Questions) | M |
| A8 | MR-I occasion types | 6.1.3 | Four stages exist as a header dropdown (PREMOB, PRE-JOB, POST JOB, YARD INSPECTION) | OK. Only gap is A7 and the Month-on-Month report (C3) | — |
| A9 | Tier 1 "no editing after submission" | 9.2 | `mri.edit_after_submit` permission exists on Maint Supervisor/Manager/Admin only | Compliant. Confirm Operator/Job Supervisor cannot edit once Submitted | XS |
| A10 | Named-recipient routing (your own requirement) | 4.5, 8.2 | Stages 1–2 written; read-side still broadcast | Stage 3 (reclassify picker, "Assigned to", Manager/Admin read-only + Send Reminder), Stage 4 (acknowledgment picker), read-side filtering by `assigned_to_user_id` with legacy-NULL fallback | L |

## B. MR-II, MR-III, Breakdown Maintenance (Manual 6.2–6.4, 7)

| # | Gap | Manual ref | Code today | Change needed | Size |
|---|-----|-----------|------------|---------------|------|
| B1 | Default trigger values | 6.2.3, 6.3.3 | `seed_triggers` creates OH/CA/KM/RIF/EH for MR-II and MR-III with interval 0, disabled | Seed defaults: MR-II 250 OH and 90 CA; MR-III 3,000 OH and 3 years (1,095 days). "Whichever occurs first" logic must be confirmed in compliance calc | S |
| B2 | MR-II compliance status colours | 9.6.4.1 | Triggers store `warning_value`; no dedicated MR-II Compliance Status report found | Build report: previous date, hours at last service, next due date/hours, status. Green compliant, Yellow if <50 engine hours or <1 month remaining, Red overdue | M |
| B3 | MR-III compliance status colours | 9.6.4.2 | None | Same report for MR-III: Green >12 months valid, Yellow <12 months, Red overdue | M |
| B4 | Breakdown Maintenance module | 5.2, 6.4 | No BM concept in code (grep for breakdown/BMER returns nothing) | New BM record: raised after the ongoing MR-I is closed with failed component noted; uses the MR-II form as acceptance inspection; sets asset Yellow while open; on completion resets MR-II interval from BM completion date | L |
| B5 | MR-II reset on BM completion | 6.2.5, 6.4.4 | `reset_trigger_running_values` exists for manual reset; no BM hook | Wire BM completion to reset MR-II triggers and `last_reset_date` | S (after B4) |
| B6 | MR-III Equipment Condition Classification | 6.3.7, Table 5 | None | Per-component classification Good / Normal Wear / Degraded / Critical in the MR-III report. Block MR-III completion while any component is Degraded or Critical; RCA required flag for Critical | M |
| B7 | Equipment testing before release | 7 | Not enforced | After MR-II/MR-III/major repair, require a functional/performance test sign-off (verified by Operations) before tag moves to Green | S |
| B8 | MR-III Planning and Budgeting | 8.3 | Dashboard tile "Budget & Planning" disabled, "Coming soon" | New module: forecast list, scope/duration, budget lines (parts, external services, NDT, logistics, other) with auto total, spare-parts/service readiness, plan approval workflow (prepare → technical review → Country Management approval), actuals, variance. A project doc `MR3 Planning & Budgeting Module` already exists to design from | XL |

## C. Reports module (Manual 9.6.4)

| # | Gap | Code today | Change needed | Size |
|---|-----|-----------|---------------|------|
| C1 | MR-II / MR-III Compliance Status reports | Missing | See B2, B3 | — |
| C2 | Report Database | Dashboard "Asset MR-I History" covers MR-I only | Extend to MR-II/MR-III/BM history per asset | M |
| C3 | Month-on-Month MR Occasion Count | Missing | Counts by month, by MR level (and MR-I stage), country filter | M |
| C4 | Pending Fault Analysis Dashboard | Dashboard tile "Fault Trends" disabled | Severity vs aging matrix, distribution by service line, equipment-wise summary, fault register (description, action, severity, age) | M |
| C5 | Fixed Asset List per location | Asset Registry exists | Confirm location filter and export match the manual | S |
| C6 | Downloads module, My Profile (User List, Change Password, My Reports) | My Reports queue exists; no Downloads | Add Downloads (manual, procedures, country guidelines) | S |
| C7 | Home Dashboard country selection | Country access exists in admin | Confirm a country picker on entry filters all screens | S |

## D. Dashboard deck (08.10.2026)

| # | KPI / element | Code today | Change needed | Size |
|---|---------------|-----------|---------------|------|
| D1 | Main-menu KPI footer | `KPI_DATA` in MainMenu.tsx is hard-coded (91.4 % availability, 47 open defects) | Replace with live queries; otherwise it shows fake numbers | S |
| D2 | BMER (Breakdown Maintenance Event Rate) | Missing; blocked by B4 | Monthly trend line, country comparison bar, service-line comparison; drilldown Service Line → Equipment Type. Needs a formula decision (events per operating hour? per asset-month?) | M |
| D3 | MR2 / MR3 Compliance % | Missing | Reuse chart from current MMS (deck says "same chart as current MMS") — see B2/B3 | M |
| D4 | Equipment Availability % | Missing | Monthly trend + gauge; drilldown Service Line → Equipment Type → Unit. Needs downtime data from Yellow/Red tag duration (A1, B4) | L |
| D5 | Maintenance Downtime Hours | Missing | Stacked monthly column, planned vs unplanned (planned = MR-II/MR-III, unplanned = BM/Red-tag) | M |
| D6 | Open Defect Count | Missing (fault data exists) | Monthly trend + severity distribution; drilldown Severity → Equipment → Unit | M |
| D7 | Defect Aging | Missing | Aging buckets, measured on open age at month-end. Thresholds: Minor/Moderate >30 days, Major/Critical >7 days. Monthly trend, country/location filter | M |
| D8 | Faults Closure Rate | Missing | Monthly, by severity group; highlight Major/Critical when ≥95 % | M |
| D9 | Availability vs Risk bubble chart | Missing | Bubble by service line | M |
| D10 | MR3 budget vs actual, cost variance %, planner approval status | Disabled tile | Blocked by B8 | — |
| D11 | Dashboard hub tiles | 1 live tile, 3 "Coming soon" | Restructure to the four deck groups: Reliability, Compliance, Defect Management, Planning & Budgeting | S |
| D12 | Filters | Not present on dashboard | Country/location + month filter shared across all widgets | M |

## E. Suggested order

1. Quick fixes: A4, D1, B1, A2.
2. Finish named routing (A10) since you are mid-test on the MR-I checklist.
3. Yellow tag + tag-history data (A1) — prerequisite for availability and downtime KPIs.
4. Defect dashboards that need only existing data: D6, D7, D8, C4.
5. MR-II/MR-III compliance reports (B2, B3, D3).
6. Breakdown Maintenance (B4, B5, D2).
7. Availability and downtime (D4, D5, D9).
8. MR-III condition classification and Planning & Budgeting (B6, B8, D10).

## F. Open questions needing your ruling

1. A7: should Pre-Job reports with no escalatable fault be closeable directly by Job Supervisor, or only by Maintenance Supervisor+? And who "approves" Post-Job / Pre-Mob reports?
2. A6: add new roles for Package In-Charge / Lead Operator / Maintenance Engineer / Lead Mechanic, or map them onto existing six?
3. D2: BMER formula.
4. D4: availability formula (hours Green-tagged ÷ calendar hours? exclude planned maintenance?).
5. A3: should a MOC exemption be recorded in MMS or only referenced by number?

## Caveats

Findings come from keyword search and reading key sections of the clone, not a line-by-line audit of all 26k lines. "Missing" means no matching code found; a feature may exist under a different name. Figures in the manual (flowcharts, screen mock-ups) are images and were not readable from the PDF text, so workflow diagrams (Figures 1–10) were not compared.
