# MR-I Test Matrix Rev 6.8 — proposed corrections

Draft for Jess. Nothing here changes the Test Matrix itself; apply the wording you agree with in the matrix.
Basis: the Claude Code run (e2e/results/SUMMARY.md), Maintenance Management Manual Rev 02, and Clarification.docx (K. Shahzad).

## 1. Waiting on Kamil's written confirmation (C1 / D10 only; see the message draft at the end)

| Case | Field | Current text | Proposed text |
|---|---|---|---|
| C1 | Expected | A Planned follow-up row is created (see D11). The unit tag does not change. | A Planned follow-up row is created (see D11). The unit, untagged at the start, becomes Green (ready for service, Manual 8.1). |
| D10 | Data | Expected entries in order: Red, Yellow, Red, Yellow, Green | Expected entries in order: Green (C1), Red, Yellow, Red, Yellow, Green |
| F4, F5 | Data | (no source given for phone approval) | RESOLVED: K. Shahzad confirmed phone approval stays as in the legacy MMS. Add: "Basis: phone approval kept from the existing MMS — Moderate and Major/Critical only, Provisional until the reviewer confirms." (already in test_matrix_update_prompt.md) |

## 2. Contradicts the manual or the app's rules — rewrite the step

| Case | Field | Current text | Proposed text |
|---|---|---|---|
| D13 | Step 2 | As Abdulla press Close & Approve. | As Abdulla press Endorse Report and send it to Disantha Perera. As Disantha approve Brass Bushing Condition Within Tolerance Limits (Notes: Still within wear limit). As Abdulla press Close Report. |
| D13 | Expected | Submit succeeds now that ASSET2 is Green. Report 3 is Approved. | Submit succeeds now that ASSET2 is Green. Close & Approve is not offered because Report 3 carries a Moderate fault (Manual Table 3; tier table in Clarification.docx). After the endorsement and Disantha's decision, Report 3 is Approved. |
| E11 | Step 3 | Ask IT to delete the Draft: DELETE FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2'); | Ask IT to delete the Draft, child rows first: `DELETE FROM mri_report_header_values WHERE report_id IN (SELECT id FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2'));` then the same for mri_report_checklist_results, mri_report_mid_values, mri_report_footer_values and mri_report_attachments, then the current DELETE FROM mri_reports statement. (The current statement alone fails with FOREIGN KEY constraint failed.) |
| E12 | Step 2–3 | Suganya starts a new report for ASSET2. / IT deletes the Draft again (same SQL as E11). | Suganya opens ASSET2 > Left, reads the dialog and presses Cancel (no Draft is started). No delete is needed. |

## 3. Missing data the app requires — add the value

| Case | Field | Current text | Proposed text |
|---|---|---|---|
| C2 | Data | Fault: Actuators on Control Panel / Decision: Reject / Method: In-Person | Add: Notes: Not a fault: actuator response within limits. |
| C4 | Data | Fault: Brass Bushing … / Decision: Carryforward | Add: Notes: Within wear limit; re-check at the next report. |
| E7 | Data | (no return-to-service conditions) | Add: Conditions for return to service: Air supply line repaired and verified. |
| E9 | Data | Revoke: MOC-2026-014 | Revoke: MOC-2026-014. Reason: Exemption no longer needed (test E9). |
| S group / data pack | Data | Client "Test Client" (picked from the list in A3 and later cases) | Add "Test Client" to the CLIENT lookup list in the starting data (S2–S6), or replace "Test Client" in every case with an existing client name. |

## 4. Does not match what the app offers — change the wording

| Case | Field | Current text | Proposed text |
|---|---|---|---|
| A3 | Data and Distance grid | Distance Travelled Post-Job (KM): 300 | Distance Travelled Pre-Job (KM): 300 (a PRE-JOB report records the Pre-Job distance; confirmed by Jess: the app is right). |
| A6a | Expected | Step 2 is refused with Add an action taken entry before closing this item, and Closure Status stays Pending. | Step 2 is refused: a popup "Cannot close: Action Taken is blank. Closure Status reset to Pending." (press OK), and Closure Status stays Pending. |
| A8 | Expected | Refused: the earlier report is still Submitted and must be endorsed and closed first. | Refused: in "Which component?", Left is greyed out with "Report #N is Submitted — close it first". |
| D7 | Data / Steps | Informed by: Abdulla Qais / Enter the note and the name. | Remove "Informed by". Step: Enter the note. / Save. Expected: the note, the signed-in user (Disantha Perera) as the person who informed the team, and the date are shown. |
| D8, D9, D11, E10 | Data | Parts status: Received | Parts status: Available |

### Optional tidy-up

| Case | Field | Current text | Proposed text |
|---|---|---|---|
| D13, E7, E9 Report A | Distance grid | Distance Travelled Post-Job (KM) \| Leave blank | Remove the row, or "Not shown for PRE-JOB / PREMOB". (PRE-JOB shows only Pre-Job KM; PREMOB shows no distance field; a Yard inspection right after a POST JOB shows Post-Job KM.) |

## 5. Left for Jess to decide

- **F8**: the decision log has no "Pending" entry. Endorsing creates the Pending approval but does not log it, so the log starts at Escalated. Either change F8's expected list to "Escalated, Approved" or ask for a "Pending" log entry in the app.

## After the corrections

Re-run only the changed cases: C1, C2, C4, D7, D8, D10, D13, E7, E9, E11, E12 (plus A3, A6a, A8, which need no app change).

## Draft message to Kamil Shahzad

> **Subject:** MR-I testing: tag status after a Moderate fault is reviewed
>
> Dear Kamil,
>
> Good day.
>
> Thank you for confirming that phone approval stays as in the existing MMS (Moderate and Major/Critical faults, recorded as provisional and confirmed later by the reviewer). The new system already works that way.
>
> One point remains before we finalise the MR-I Test Matrix:
>
> **Tag after a Moderate fault is reviewed.** Table 3 (page 12) does not state the equipment tag for a Moderate fault; it says only to plan the rectification and monitor the condition until repaired. Section 8.1 requires every unit to show Green (ready for service), Yellow (under maintenance) or Red (not ready for service). The system therefore shows a unit with only a Moderate fault as **Green** once the Operations Coordinator / Maintenance Supervisor has reviewed it, while the repair is planned and monitored. A Critical fault keeps the unit Red until it is repaired and verified, or Green if you lower it to Moderate, as Table 3 states.
>
> Please confirm that a reviewed Moderate fault leaves the unit Green-tagged.
>
> Thank you.
>
> Best regards,
> Jess
