Update the MR-I Test Matrix Rev 6.8 with the corrections below. They come from a full test run of the app against Maintenance Management Manual Rev 02 and K. Shahzad's clarification. The app is correct in every case listed; only the Test Matrix wording changes.

RULES
- Change only the cases and fields listed below. Leave every other case, field, value table (grid), runner and ID exactly as it is.
- Keep each case's existing structure and style: Data rows, Steps (with sub-steps), Expected results and the copy-and-paste value tables.
- Where a change also affects a value table (grid), update the table to match.
- Do not renumber cases. Do not add or remove cases.
- Raise the revision to 6.9 and add one change-log line: "Rev 6.9: wording aligned with the app after the Claude Code test run (cases A3, A6a, A8, C2, C4, D7, D8, D9, D11, D13, E7, E9, E10, E11, E12, F4, F5)."
- When done, list every case you changed and, per case, the field you changed.

CORRECTIONS

A3 — Fill in Report 1
- Data: change "Distance Travelled Post-Job (KM): 300" to "Distance Travelled Pre-Job (KM): 300".
- Distance Travelled value table: change the row "Distance Travelled Post-Job (KM) | 300" to "Distance Travelled Pre-Job (KM) | 300". (A PRE-JOB report shows only the Pre-Job distance field; POST JOB, and a Yard inspection right after a POST JOB, show the Post-Job field.)

A6a — Action Taken is needed before an item can be closed
- Expected, first item: change "Step 2 is refused with Add an action taken entry before closing this item, and Closure Status stays Pending." to "Step 2 is refused: a popup says Cannot close: Action Taken is blank. Closure Status reset to Pending. Press OK. Closure Status stays Pending."

A8 — No new report while Report 1 is Submitted
- Steps: change "Select ASSET2 and the same template and try to start a new report." to "Select ASSET2 and look at the Which component? window."
- Expected: change "Refused: the earlier report is still Submitted and must be endorsed and closed first." to "Refused: Left is greyed out with Report #N is Submitted — close it first, and no new report starts."

C2 — Reject a Moderate fault
- Data: add a row "Notes (required): Not a fault: actuator response within limits."
- Steps: after "Choose Reject." make it "Type the Notes. / Press Reject."

C4 — Carry a Moderate fault forward
- Data: add a row "Notes (required): Within wear limit; re-check at the next report."
- Steps: after "Choose Carryforward." make it "Type the Notes. / Press Carryforward."

D7 — Record equipment limitations
- Data: remove the row "Informed by: Abdulla Qais".
- Steps: change "Enter the note and the name. / Save." to "Enter the note. / Save."
- Expected: change to "The note is saved and shown on the repair with the signed-in user (Disantha Perera) as the person who informed the field team, and the date."

D8, D9, D11, E10 — parts status
- Data: change "Parts status: Received" to "Parts status: Available" in each of these four cases (the app offers Awaiting, Ordered and Available).

D13 — Submit and close Report 3 on a Green unit
- Steps: replace step 2 "As Abdulla press Close & Approve." with:
  "As Abdulla open Report 3 from Reports to Review and press Endorse Report. Choose Disantha Perera. Press Confirm & Endorse." then
  "As Disantha open Pending Approvals, review Brass Bushing Condition Within Tolerance Limits, type Notes: Still within wear limit, and press Approve." then
  "As Abdulla open Report 3 from Reports to Review and press Close Report."
- Expected: change to "Submit succeeds now that ASSET2 is Green. Close & Approve is not offered because Report 3 carries a Moderate fault (Manual Table 3; reports with Moderate faults need review). After the endorsement and Disantha's decision, Report 3 is Approved."
- Distance Travelled value table: remove the row "Distance Travelled Post-Job (KM) | Leave blank" (a PRE-JOB report does not show it).

E7 — Record a MOC exemption and submit
- Data: add a row "Conditions for return to service: Air supply line repaired and verified."
- Distance Travelled value table: remove the row "Distance Travelled Post-Job (KM) | Leave blank" (a PREMOB report shows no distance field).

E9 — Revoke the exemption
- Data: change "Revoke: MOC-2026-014" to "Revoke: MOC-2026-014. Reason (asked when you press Revoke): Exemption no longer needed (test E9)."
- Report A Distance Travelled value table: remove the row "Distance Travelled Post-Job (KM) | Leave blank".
- Leave Report B (POST JOB, Post-Job KM 20) as it is.

E11 — Copy last Post-Job report
- Steps, the IT delete step: replace the SQL with these statements, run in this order (the current single DELETE fails with FOREIGN KEY constraint failed because the Draft has child rows):
  DELETE FROM mri_report_header_values WHERE report_id IN (SELECT id FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2'));
  DELETE FROM mri_report_checklist_results WHERE report_id IN (SELECT id FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2'));
  DELETE FROM mri_report_mid_values WHERE report_id IN (SELECT id FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2'));
  DELETE FROM mri_report_footer_values WHERE report_id IN (SELECT id FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2'));
  DELETE FROM mri_report_attachments WHERE report_id IN (SELECT id FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2'));
  DELETE FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2');

E12 — Over 72 hours: no copy option
- Steps: change "Suganya starts a new report for ASSET2." to "Suganya opens Main Menu > Maintenance Report > MR-I > ASSET2 > Left, reads the window, then presses Cancel (no Draft is started)."
- Steps: remove "IT deletes the Draft again (same SQL as E11)."

F4, F5 — phone relay
- Data: add a row "Basis: K. Shahzad — phone approval is part of the existing (legacy) MMS and is kept: allowed for Moderate and Major/Critical faults (not applicable to Minor), recorded as Provisional and confirmed later by the reviewer in MMS. Not covered by Manual Rev 02."

Test Client (data pack, S group)
- In the S-group starting data, add "Test Client" to the CLIENT reference list (Administration > Lookups > CLIENT), so cases that say "Client: Test Client (pick from the list)" can pick it.

ADD ONLY AFTER KAMIL CONFIRMS IN WRITING (leave out until then)

C1 — Approve a Moderate fault
- Expected: change "A Planned follow-up row is created (see D11). The unit tag does not change." to "A Planned follow-up row is created (see D11). The unit, untagged at the start, becomes Green (ready for service, Manual 8.1)."

D10 — Tag history
- Data: change "Expected entries in order: Red, Yellow, Red, Yellow, Green" to "Expected entries in order: Green (from C1), Red, Yellow, Red, Yellow, Green".

ADD ONLY IF I CHOOSE THE MATRIX OPTION FOR F8 (leave out until I decide)

F8 — Decision log
- Expected: change "The log lists Pending, Escalated, Approved in order with reviewer, method, provisional flag and recorder." to "The log lists Escalated, Approved in order with reviewer, method, provisional flag and recorder (endorsing creates the Pending entry but does not log it)."
