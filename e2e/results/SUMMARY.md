# MR-I Test Matrix Rev 6.8 — Claude Code run

Run date: 2026-11-07. Cases in results.csv: 134 (Pass 114, Fail 0, Blocked 0, Needs review 20).

Phase 1 ran the backend rules through the app's own Rust commands (src-tauri/tests/mri_matrix_backend.rs). Phase 2 drove the real app (debug build, tauri-driver + msedgedriver 157) through every case in matrix order from a clean database (e2e/run/assets.start.db). Status combines both; [DB] verdicts come from Phase 1.

## Failures, likely cause and proposed fix

### Rectification Queue "Update Plan" always failed
- Cases: D2, D3, D3a, D4, D8, D9, D11, D12, E10
- Cause: useMriFaultRectifications.ts:59 sent flat camelCase fields; the Rust command update_mri_fault_rectification takes one `update` object with snake_case fields ("missing required key update").
- Fix: Wrap the plan as { update: { id, assigned_technician, parts_status, repair_date, updated_by } }.
- Status: FIXED with Jess's approval (frontend only, not committed); D and E re-run on the fixed build and pass.

### Job Supervisor cannot reach Pending Approvals from the main menu
- Cases: F4
- Cause: MainMenu.tsx:203 shows the Pending Approvals card/count only for mri.close_defect or mri.approve. The Job Supervisor holds mri.record_provisional (phone relay) only, so Attention Required never offers Pending Approvals to Abdulla (it is reachable only through a document flow's "Open Pending Approvals").
- Fix: Add effectivePermissions.includes("mri.record_provisional") to canReviewApprovals in MainMenu.tsx.
- Status: FIXED (not committed). F4 re-tested on e2e/run/retest_F4.db (copy of snapshots/before_F1.db; F1–F3 replayed as setup, not recorded): Pass. The Job Supervisor sees only Record (Phone Relay) cards.

### Asset Registry ignores the user's country access
- Cases: G5
- Cause: get_assets has no viewer filter and AssetRegistry.tsx does not filter by the signed-in user's country rows (the review queues and flows do).
- Fix: get_assets(viewer_user_id) filters by the user's country rows (rule agreed with Jess: Maintenance Manager / FSM, Administrator and users with no country rows see every asset); Asset Registry and Select Asset use the new useAssetsForViewer() hook. Dashboard, menu KPIs, Data Purging and the wizard lookup still list all assets.
- Status: FIXED (not committed). G5 re-tested on e2e/run/retest_G5.db (copy of e2e/run/retest_after_H3.db, the state after G1–H3): Pass, including an FSM check (Kamil with a UAE row still sees both assets). The first attempt blocked before the case started (app start screen not shown in 30 s); the immediate re-run passed.

### Dates shown as raw Unix seconds
- Cases: J2, H3
- Cause: The backend stores dates as Unix seconds ("1794048477"). AssetFlow.tsx:72 shortDate() assumes an ISO string, so report and tag boxes and their details print the raw number; the cost panel (ReportWizard.tsx:5928) prints mr_cost_date raw too.
- Fix: Format all-digit date values as dates (seconds x 1000), DD/Mon/YYYY like Pending Approvals: AssetFlow shortDate() and its detail rows, the MR cost date (ReportWizard), the Asset Registry tag history, the Pending Approvals reminder time, and the report date on Review & Submit / print (ReportWizard fmtDate, DD-Mon-YYYY as elsewhere on the report).
- Status: FIXED (not committed). J2 re-tested on e2e/run/retest_J2.db (copy of snapshots/final_after_J9.db): Pass. H3 re-tested on e2e/run/retest_H3.db (copy of snapshots/before_G1.db; G1–H2 replayed as setup, not recorded): Pass.

### Back from the asset flow opened on the Dashboard lands on the Dashboard start view
- Cases: J8
- Cause: Dashboard.tsx:592 keeps the chosen view and asset (selectedAsset) in local component state; opening the flow unmounts the Dashboard, so Back remounts it at "Choose a view" instead of the asset history panel.
- Fix: Keep the Dashboard view and selected asset in App.tsx (DashboardNav state passed to Dashboard); opening the Dashboard from the main menu still starts at its hub.
- Status: FIXED (not committed). J8 re-tested on e2e/run/retest_J8.db (copy of snapshots/final_after_J9.db): Pass.

### Possible race: a header dropdown choice can be lost (to confirm by hand)
- Cases: I6, I7
- Cause: In I6 the Compliance Stage was chosen as YARD INSPECTION but the screen fell back to "— Select —" and "" was saved. HeaderEntryStep resets its unsaved local values whenever saved values are re-read (useEffect on savedValues), so a choice made while an earlier field's save is being re-read can be wiped before the blur saves it. Seen only at automation speed; I7 was blocked because it needs I6's submitted report.
- Fix: HeaderEntryStep tracks fields changed but not yet saved and keeps them when savedValues refreshes (merge instead of replace).
- Status: FIXED (not committed). I6 and I7 re-tested on copies of snapshots/final_after_J9.db (I5 / I12 replayed as setup) with the test re-select retry switched off: Pass at automation speed (e2e/run/retest_I6.db, recorded) and with a 1-second pause between fields (e2e/run/retest_I6_slow.db). The Compliance Stage choice was kept both ways. The Distance Travelled and Footer steps use the same reset-on-refresh pattern and were not changed.

### Production build fails in tsc (file-name casing)
- Cases: build only
- Cause: src/features/administration/hooks/useMRiTemplates.ts is imported everywhere as useMriTemplates; tsc (npm run build / cargo tauri build) refuses the case-only difference. cargo tauri dev and vite build are not affected on Windows.
- Fix: Rename the file to useMriTemplates.ts (done by two filesystem renames; core.ignorecase=true, so record it at commit time with `git mv -f`).
- Status: FIXED (not committed). npm run build (tsc + vite) passes with no TypeScript errors; only Vite's existing chunk-size warning remains.

## Matrix cases that are wrong or unclear

- **A3** — A3 data: Distance Travelled Post-Job (KM) 300: on a PRE-JOB report the Distance Travelled step offers only "Distance Travelled Pre-Job (KM)". The run entered 300 there; the KM trigger uses Post-Job, else Pre-Job, so E4's KM total is unaffected.
- **A6a** — A6a expects the text "Add an action taken entry before closing this item": the screen shows "Cannot close this item Cannot close: Action Taken is blank. Closure Status reset to Pending. OK" (A6e's wording); the quoted text is the server message
- **C1** — C1 expects 'The unit tag does not change': After the Moderate decision the untagged unit becomes Green (one tag-history row). Manual Table 3's Moderate row says nothing about tags (its 'closed and Green-Tagged' wording is only for a Critical reclassified to Moderate), but Manual 8.1 requires every item to show Green / Yellow / Red, and a Moderate-only unit is ready for service = Green. The Clarification (Table 3 summary agreed with K. Shahzad) gives the same picture: Minor 'Unit stays Green', Moderate 'Plan the repair and keep an eye on it until fixed' (no Red/Yellow), Critical lowered to Moderate 'the unit goes Green'. The app is consistent with the manual; the matrix should expect Green.
- **C1** — C1 "The unit tag does not change": the untagged unit becomes Green after the Moderate decision (Manual 8.1 / Table 3, see Phase 1); this is the expected app behaviour
- **C2** — C2 gives no Notes: Notes are required by the app; the run typed "Not a fault: actuator response within limits."
- **C4** — C4 gives no Notes: Notes are required by the app; the run typed "Within wear limit; re-check at the next report."
- **D7** — D7 data: Informed by Abdulla Qais: the app has no "informed by" field: it records the signed-in user (Disantha Perera) as the person who informed the field team
- **D8** — Parts status "Received": the app offers Awaiting / Ordered / Available; the run uses Available
- **D10** — D10 expects Red, Yellow, Red, Yellow, Green: the history starts with the Green status set by the C1 Moderate decision (Manual 8.1: a serviceable unit is Green / Ready for Service), so the matrix list is missing that first Green entry.
- **D13** — D13 step 2 says press Close & Approve: Report 3 carries the Brass Bushing Fail (Moderate), as D5/D6 require. Manual Table 3, Moderate row: 'Review Authority: Operations Coordinator / Maintenance Supervisor'; Clarification (K. Shahzad, tier table): reports with moderate/major/critical faults cannot be closed independently and Tier 2 'review Moderate faults and confirm their classification', so the report must be endorsed, reviewed and then closed. The run did that: endorse to Disantha, Approve Brass Bushing, Close.
- **E7** — E7 gives no "Conditions for return to service": the app requires it; the run typed "Air supply line repaired and verified."
- **E9** — E9 gives no revoke reason: the app asks for one; the run typed "Test E9: exemption no longer needed"
- **E11** — IT delete SQL fails as written: "DELETE FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2')" -> FOREIGN KEY constraint failed. The Draft has child rows (header values, checklist results...) and the app enables foreign keys, so the matrix SQL cannot delete it. The run deleted the child rows first, then the Draft.
- **F8** — F8 expects Pending, Escalated, Approved: the log starts at Escalated: endorsing creates the Pending approval but does not log it (also seen in Phase 1)
- **F4/F5** — phone relay: the manual does not mention phone decisions and Kamil's written reply (Clarification.docx) does not answer question 3; the app records them as Provisional until confirmed. Needs Kamil's written confirmation.
- **A3** — confirmed by Jess: the app is right (PRE-JOB records Distance Travelled Pre-Job; POST JOB, and a Yard inspection right after it, record Post-Job). Matrix to read "Distance Travelled Pre-Job (KM): 300".
- **C1/D10** — basis: Manual Rev 02 §8.1 (every item Green / Yellow / Red; a Moderate-only unit is ready for service) and Table 3; Table 3's Moderate row itself says nothing about tags.

## Cases for Jess

### claude-code+review (look not judged; screenshots)

| case | screenshots |
|---|---|
| A3a | e2e/screenshots/A3a/ |
| A7 | e2e/screenshots/A7/ |
| I1 | e2e/screenshots/I1/ |
| I4 | e2e/screenshots/I4/ |
| K2 | e2e/screenshots/K2/ |
| K3 | e2e/screenshots/K3/ |
| K4 | e2e/screenshots/K4/ |
| K5 | e2e/screenshots/K5/ |
| K6 | e2e/screenshots/K6/ |
| K7 | e2e/screenshots/K7/ |
| K8 | e2e/screenshots/K8/ |
| K9 | e2e/screenshots/K9/ |
| K10 | e2e/screenshots/K10/ |
| K11 | e2e/screenshots/K11/ |
| L1 | e2e/screenshots/L1/ |
| L2 | e2e/screenshots/L2/ |
| L3 | e2e/screenshots/L3/ |
| L4 | e2e/screenshots/L4/ |
| L5 | e2e/screenshots/L5/ |
| L6 | e2e/screenshots/L6/ |

### runner "you"

- **S1** — backup: the run took its backup by copying the database to e2e/run/assets.source.db (brief section 3); the in-app Save / Open dialog step is left for Jess.
- **J5** — Data Tools backup Save / Open dialog: not run.

## Real database

src/desktop/src-tauri/assets.db was never opened by any test: size 11829248 bytes and modified time 2026-11-07 12:52:05 (+04:00) were checked before and after every Phase 1 run and every Phase 2 session, and were unchanged each time (confirmed in the last Phase 1 run; see phase2_run.log for the UI sessions).

## Code changed (none committed)

- Update Plan (D/E): `src/desktop/src/features/mri-reporting/hooks/useMriFaultRectifications.ts`
- Fix 1 F4 (Pending Approvals for the Job Supervisor): `src/desktop/src/features/main-menu/MainMenu.tsx`
- Fix 2 J2 / H3 (dates): `src/desktop/src/features/mri-reporting/AssetFlow.tsx`, `src/desktop/src/features/mri-reporting/ReportWizard.tsx` (MR cost date, report date on Review / print), `src/desktop/src/features/asset-registry/AssetRegistry.tsx` (tag history), `src/desktop/src/features/mri-reporting/PendingApprovals.tsx` (reminder time)
- Fix 3 J8 (Dashboard view kept): `src/desktop/src/App.tsx`, `src/desktop/src/features/dashboard/Dashboard.tsx`
- Fix 4 I6 / I7 (header choice kept): `src/desktop/src/features/mri-reporting/ReportWizard.tsx` (HeaderEntryStep)
- Fix 5 build (file-name casing): `src/desktop/src/features/administration/hooks/useMRiTemplates.ts` renamed to `useMriTemplates.ts` (record with `git mv -f` at commit time)
- Fix 6 G5 (asset lists by country): `src/desktop/src-tauri/src/lib.rs` (get_assets), `src/desktop/src/features/asset-registry/hooks/useAssets.ts`, `src/desktop/src/features/asset-registry/AssetRegistry.tsx`, `src/desktop/src/features/mri-reporting/SelectAssetForReport.tsx`
- Test-only files: `src/desktop/src-tauri/tests/{db_inspect,prep_clean_db,mri_matrix_backend,it_sql}.rs`, everything under `e2e/`.

## Not changed (by decision)

- F8: no "Pending" entry in the decision log (Jess to decide).
- Everything under "Matrix cases that are wrong or unclear" (to be fixed in the Test Matrix).
