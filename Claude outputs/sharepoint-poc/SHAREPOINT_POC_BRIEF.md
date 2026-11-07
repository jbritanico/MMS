# MMS SharePoint storage proof-of-concept — brief for Claude Code

Paste this file (or point Claude Code at it) as the first instruction of a **new** Claude Code session.

## 1. Goal

Build a small test app that writes MMS MR-I-shaped data to a **test** SharePoint site through Microsoft Graph, run the scenarios in section 5, and produce a results report. That report lets Jess and the team decide between SharePoint Lists and Azure MySQL as the MMS online database. The question is *how SharePoint behaves for MMS*, measured, not argued.

Background (read first): the MMS OFFLINE TEAM project documents `Sharepoint As Storage Medium.docx`, `Offline First Sharepoint Path DEsign.docx` and `Azure MySQL as Storage.docx`. The known concerns to measure are: no multi-item transactions, no enforced lookups, the 5,000-item list view threshold, ETag concurrency, Graph throttling (429), and list-item attachments not manageable through Graph (so photos go to a document library).

## 2. Hard rules — never break these

1. Work **only** in `MMS-fresh\poc\sharepoint\`. Do not touch the MMS app code (`src\desktop\...`) or its database.
2. **Never commit, push or change git history.** Add `poc/sharepoint/.env` and `poc/sharepoint/results/raw/` to a local `.gitignore` inside the PoC folder.
3. **Secrets:** the tenant ID, client ID and secret/certificate go in `poc\sharepoint\.env` (Jess pastes them). Never print, log or write them anywhere else, including the results.
4. Talk **only** to the test site URL in `.env`. Before any write, check the site URL contains `MMSStoragePoC` (or the value Jess gives) and stop if it doesn't.
5. **Throttling scenario:** cap it (section 5, S5). Stop at the first sustained 429 and obey `Retry-After`. Ask Jess before running it.
6. **Ask before installing** anything. Use Node.js (already installed) unless Jess agrees otherwise.
7. Provide a clean-up command that deletes everything the PoC created on the site. Run it only when Jess says so.

## 3. Setup

- Node.js + TypeScript, `@azure/identity` (client credentials) and `@microsoft/microsoft-graph-client` (or plain `fetch` to `https://graph.microsoft.com/v1.0`). App-only auth with `Sites.Selected` (write on the test site only).
- `npm run setup`: create the lists and library below, with indexed columns. Idempotent.
- `npm run scenario -- <id>`: run one scenario. `npm run all`: run all except S5. `npm run cleanup`: remove everything.
- Write a **Phase 0** check first: authenticate, resolve the site, confirm write access with one test item, then delete it. Report the result to Jess before going further.

## 4. SharePoint structure (mirrors the MMS local tables)

Lists (internal names), with the columns needed for the scenarios. Use real MMS field names; see `src\desktop\src-tauri\src\lib.rs` (`CREATE TABLE` statements) for reference.

- `Assets`: AssetCode (indexed), Country, ServiceLine, TagStatus
- `MriReports`: ReportKey (indexed, unique by app logic), AssetLookup, Component, Status (indexed), ComplianceStage, SubmittedBy, SubmittedDate (indexed), Country (indexed), RowVersionNote
- `ReportHeaderValues`: ReportLookup / ReportKey (indexed), FieldLabel, Value
- `ChecklistResults`: ReportKey (indexed), ItemName, Status (indexed), Severity (indexed), IssueDetails, ActionTaken, DateObserved, ClosureStatus (indexed)
- `FaultApprovals`: ReportKey (indexed), ItemName, OriginalSeverity, Decision (indexed), Reviewer, ReviewMethod, AssignedTo
- `DecisionLog`, `Rectifications` (TagStatus indexed, PartsStatus), `TagHistory`
- Document library `ReportPhotos` with metadata ReportKey (indexed) and ItemName

Test data: the two templates' real checklist item names (CTU 19 items, PUMP UNIT 24 items; listed in `Claude outputs\claude-code-testing\test_matrix_cases.json` and the MMS database), realistic header values, and small generated JPEGs (~200 KB).

## 5. Scenarios (measure, then report each one)

| ID | Scenario | What to do | What to record |
|---|---|---|---|
| S1 | Save a full MR-I report | 1 report + 15 header values + 24 checklist results (3 Fail) + 3 fault approvals + 1 photo. Do it item by item, then again with Graph `$batch` (20 per batch). | Total time, number of HTTP calls, per-call latency (p50 / p95), for both methods; repeat 10 times |
| S2 | Interrupted save (no transactions) | Start S1 and kill the network or process after the checklist results but before the faults (simulate with a forced exception). Then run the app's recovery: detect the partial report and either complete it (idempotent re-send using ReportKey) or roll it back by deleting what was written. | What was left online after the failure; whether recovery restored a consistent state; extra code needed (lines) |
| S3 | Edit conflict (ETag) | Read the same report as "device A" and "device B", change different fields, save A, then save B with the old ETag. | Whether B is rejected (412), what data each version holds, how a merge or last-writer-wins would be done |
| S4 | 5,000-item threshold | Fill `ChecklistResults` to about 5,500 items (use `$batch`). Then run: (a) filter on an indexed column, (b) filter on a non-indexed column, (c) order by a non-indexed column, (d) count of open Critical faults by country. | Which queries succeed or fail (and the error text), time taken, paging behaviour |
| S5 | Throttling (ask Jess first) | Simulate 20 devices syncing at once: parallel S1 saves, ramping up. **Cap**: at most 2,000 requests or 10 minutes; stop at the first sustained 429 run and honour `Retry-After`. | Requests per minute before 429 appears; Retry-After values; whether all saves completed after back-off |
| S6 | Photos | Upload 20 photos to `ReportPhotos` with ReportKey metadata; link each to its checklist result; download and verify. Also try attaching a file directly to a list item through Graph and record the result. | Upload time per photo; whether list-item attachments work through Graph |
| S7 | Dashboard query | Compute, for the S4 data: open defects by severity, defect aging buckets, and the Breakdown Maintenance Event Rate inputs. Done the only way SharePoint allows (fetch and compute in code). | Time, number of calls, data transferred; compare with the single SQL query it would take in MySQL (write that SQL in the report) |
| S8 | Orphans (no enforced lookups) | Delete a report while its checklist results exist; then query results for that report. | Whether orphans remain; what clean-up code is needed |

## 6. Report

Write `poc\sharepoint\results\SHAREPOINT_POC_RESULTS.md` (for people) and `results\results.json` (raw numbers). For each scenario: what was done, the measurements, Pass / Concern / Fail for MMS, and a plain-English explanation. Finish with:

- a summary table across all scenarios
- an estimate of the extra code the full SharePoint path would need (integrity, recovery, throttling, archiving), based on what the PoC needed
- confirmation that only the test site was touched and that no secrets were written to the results

Keep each finding factual. Note anything that may have been distorted by the test setup (e.g. tenant load at the time).

## 7. When done

Tell Jess where the results are and ask whether to run `npm run cleanup`. Do not delete anything without her OK.
