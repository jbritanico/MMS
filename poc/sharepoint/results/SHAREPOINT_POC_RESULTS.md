# MMS SharePoint storage PoC – results

- **Site:** https://sprintogs.sharepoint.com/sites/MMS (future production site)
- **Run:** 8 Nov 2026, 13:50–14:00 (UTC+4), from Jess's PC. Node 24, Graph v1.0.
- **Raw numbers:** `results.json`; per-call logs in `results/raw/` (not committed).
- **Scenarios run:** S1–S4 and S6–S8 (13:50–14:00), then S5 on Jess's "go" (14:11–14:13).

## Summary

| ID | Scenario | Result | Key number | Verdict |
|---|---|---|---|---|
| S1 | Save a full MR-I report | `$batch` is 5× faster than item by item | 2.9 s / 5 calls per report vs 15.4 s / 45 calls | **Pass** (with `$batch`) |
| S2 | Interrupted save | A half-saved report stays online; recovery fixes it | 40 of 43 rows left behind; recovery 3–6 s; 54 lines of code | **Concern** |
| S3 | Edit conflict (ETag) | A stale save is rejected with 412; a save with no ETag silently overwrites | 412 / 412; merge 200 | **Pass** (only if `If-Match` is always sent) |
| S4 | 5,000-item threshold | Queries on indexed columns work; sorting on a non-indexed column fails | 5,520 rows; 422 "exceeds the list view threshold"; 16 throttled writes inside `$batch` | **Concern** |
| S5 | Throttling, 2 → 20 devices | No 429 in short bursts; speed levels off at about 2,000 requests per minute | 20 devices: 27 s per save; 37/37 complete | **Concern** (manageable) |
| S6 | Photos | The document library works; list-item attachments don't work through Graph | 1.09 s per photo; 20/20 verified; attachments 400 | **Pass** (library) |
| S7 | Dashboard query | Fetch and compute in code is fast at this size | 977 ms, 2 calls, 928 KB | **Pass now, Concern as data grows** |
| S8 | Orphans | Child rows survive when their report is deleted; lookups are not enforced | 42 orphan rows; lookup still points to a deleted asset | **Concern** |

## Setup

`npm run setup` created 9 lists and libraries, all prefixed `PoC_`, with the column names from the MMS tables in `lib.rs` (PascalCase). It made 93 calls, all on v1.0. Indexed columns, read back from SharePoint:

| List | Indexed columns |
|---|---|
| PoC_Assets | AssetCode |
| PoC_MriReports | ReportKey, Status, SubmittedDate, Country |
| PoC_ReportHeaderValues | ReportKey |
| PoC_ChecklistResults | ReportKey, Status, Severity, ClosureStatus |
| PoC_FaultApprovals | ReportKey, Decision |
| PoC_DecisionLog | ReportKey |
| PoC_Rectifications | ReportKey, TagStatus |
| PoC_TagHistory | AssetCode |
| PoC_ReportPhotos (library) | ReportKey |

Differences from the brief:
- `PoC_MriReports` has three extra columns copied from other tables: ServiceLine, MaintenanceType and JobOperatingHours. S7 needs them, because SharePoint cannot join tables.
- `PoC_ChecklistResults` has an extra column, PhotoRefs, for S6.
- `AssetLookup` is a real SharePoint lookup column to `PoC_Assets`.

## S1 – Save a full report

Each report was 1 report row + 15 header values + 24 checklist results (3 Fail) + 3 fault approvals + 1 photo of 177 KB. There were 10 runs of each method.

| | Item by item | `$batch` (20 per batch) |
|---|---|---|
| HTTP calls per report | 45 | 5 (3 batches + photo upload + photo metadata) |
| Time per report, median / slowest 5% | 15.4 s / 16.5 s | **2.9 s / 3.2 s** |
| Time per call, median / slowest 5% | list-item POST 329 / 396 ms | batch POST 602 / 829 ms |
| Photo upload / metadata | 635 / 380 ms | 641 / 386 ms |
| Failed writes, throttled responses | 0, 0 | 0, 0 |

**Plain English:** sending a report in batches of 20 takes about 3 seconds. Sending it row by row takes about 15. The photo always needs two calls of its own, about 1 second together.

## S2 – Interrupted save (no transactions)

The save was stopped by a forced error after the checklist results and before the fault approvals. The report row had been written first, and it carries a list of how many child rows to expect.

- **Left online after the failure:** the report row, 15 header values and 24 checklist results, with **0 of 3 fault approvals**. Anyone reading the site at that moment would have seen a report with failed items and no faults.
- **Completing it:** recovery re-sent only the 3 missing rows (2.96 s, 9 calls), and the report then checked as complete. A second run sent 0 rows, so it is safe to repeat.
- **Rolling it back:** recovery deleted all 40 rows, children first and the report last (5.7 s, 8 calls). Nothing for that report remained.
- **Extra code:** `src/lib/recovery.ts` is 54 lines.

**Verdict, Concern:** recovery works, but the app has to supply it itself. Between the failure and the recovery, a partial report is visible to anyone reading the site. Dashboards must hide reports whose status is still "Syncing", or whose children don't match the expected counts.

## S3 – Edit conflict (ETag)

| Step | HTTP | Status | ComplianceStage |
|---|---|---|---|
| A saves Status=Approved with A's ETag | 200 | Approved | POST JOB |
| B saves ComplianceStage=YARD with its **old** ETag (`/fields`) | **412** | Approved | POST JOB |
| Same, sent through `/items/{id}` | **412** | Approved | POST JOB |
| B re-reads, re-applies only its own field with the new ETag (merge) | 200 | Approved | YARD |
| B saves Status=Rejected with **no** `If-Match` | 200 | **Rejected** | YARD |

**Plain English:** SharePoint rejects a save based on an out-of-date read, but only when the app sends the ETag. A field-level merge (re-read, then re-apply only your own changes) works cleanly. A save without an ETag overwrites without any warning. **Rule: always send `If-Match`, and handle a 412 by re-reading and merging.**

## S4 – More than 5,000 items

The fill added 209 report rows and 5,016 checklist rows in 307 s, using 261 `$batch` calls, with 0 failures. The list then held **5,520** rows.

**Throttling during the fill:** 16 individual writes inside the batches got 429. The code waited as SharePoint asked and re-sent them, so all of them were saved. Batch times stayed flat at about 720 ms, and the waiting accounts for about 2 of the 5 minutes. **One PC writing batches one after another was enough to trigger throttling.**

The exact `Retry-After` values were not saved in this run, because the scenario's summary line counted only whole calls; this will be fixed before S5. Also, the app switched sessions while the last 1,000 rows were being written. It didn't interrupt the run, but timing from that period is less reliable.

| Query | Result | Time | Rows / pages |
|---|---|---|---|
| a1 Filter on an indexed column (Severity = 'Critical') | OK | 429 ms | 240 / 1 |
| a2 Filter on an indexed column (one ReportKey) | OK | 265 ms | 24 / 1 |
| b1 Filter on a **non-indexed** column (ItemName) | **400** "Field 'ItemName' cannot be referenced in filter or orderby as it is not indexed" | 296 ms | – |
| b2 Same, forced with the `HonorNonIndexedQueriesWarningMayFailRandomly` header | OK | 903 ms | 230 / 2 |
| c1 Sort on a non-indexed column | **400** (same message) | 270 ms | – |
| c2 Same, forced with the header | **422** "The attempted operation is prohibited because it exceeds the list view threshold." | 216 ms | – |
| c3 Sort on an indexed column (Severity) | OK | 5.1 s | 5,520 / 6 |
| e Read all rows, 5,000 per page | OK | 3.7 s | 5,520 / 2 |
| e2 Read all rows, default page size | OK | 10.5 s | 5,520 / 28 |
| d Open Critical faults by country (two indexed filters, then join to reports in code) | OK | 779 ms, 2 calls | Oman 43, Saudi Arabia 20, Qatar 21, Kuwait 18, UAE 13 |

**Verdict, Concern:**
- Every column used in a filter or sort must be indexed **before** the list passes 5,000 rows.
- Above the threshold, sorting on a non-indexed column fails, and the forcing header doesn't help.
- Ask for `$top=5000` pages: full reads are about 3× faster than with the default page size.
- Bulk writes must handle 429 responses inside `$batch`.

## S5 – Throttling (many devices at once)

**Run:** Sunday 8 Nov 2026, 14:11 local time, on Jess's "go". Devices were ramped up in steps of 2, 5, 10 and 20, saving at the same time. Each device saved one full report with `$batch` (45 requests).

**Caps:** at most 2,000 requests (every write inside a batch counted) or 10 minutes. New saves stop at the first sustained run of 429 responses.

| Devices at once | Requests | Time | Requests per minute | Time per save (median / max) | Throttled | Saves OK |
|---|---|---|---|---|---|---|
| 2 | 90 | 4.6 s | 1,171 | 4.4 s / 4.6 s | 0 | 2 / 2 |
| 5 | 225 | 7.4 s | 1,820 | 7.4 s / 7.4 s | 0 | 5 / 5 |
| 10 | 450 | 12.6 s | 2,144 | 12.1 s / 12.6 s | 0 | 10 / 10 |
| 20 | 900 | 27.2 s | 1,986 | 26.6 s / 27.2 s | 0 | 20 / 20 |

- **Totals:** 1,813 requests in 1.6 minutes, within the caps. **No throttling**, so no `Retry-After` values were recorded. All **37 / 37** reports were checked afterwards and found complete on the site.
- **The ceiling is speed, not refusals.** Throughput levelled off at about **2,000 requests per minute** (about 44 reports per minute) whether 10 or 20 devices were sending. More devices didn't make it faster; each device just waited longer. With 20 devices at once, each save took about **27 s** instead of about 3 s.
- **S4 and S5 compared:** S4 was throttled (16 writes) at a *lower* rate, about 1,650 per minute, but it kept that up for 5 minutes. S5's bursts lasted under 30 s each. This suggests SharePoint throttles on **sustained load over several minutes**, not short peaks. That fits Microsoft's published approach of resource limits measured over time windows; it's our reading, not proven here.

**Verdict, Concern (manageable):**
- A morning rush of 20 devices syncing at once works, but each sync slows to about half a minute.
- Long continuous loads, such as a first-time upload of historic data or a big re-sync, will be throttled. They must be spread over time and must honour `Retry-After`.
- **Rules for production:**
  - Cap each device to one batch in flight at a time.
  - Add a random delay before syncing (jitter), so devices don't all start together.
  - Back off on 429 and 503, using the `Retry-After` value.
  - Run bulk migrations slowly, below about 1,500 requests per minute, outside working hours.

**Distortion:**
- All 20 "devices" ran from one PC on one network connection, with one app identity. Real devices on separate connections may reach SharePoint's per-app limit sooner, because throttling is counted per app across all devices.
- The run was on a Sunday afternoon, a working day in the region, so tenant load was normal rather than quiet.

## S6 – Photos

- **Uploads:** 20 photos (177 KB each) went to `PoC_ReportPhotos`, with ReportKey and ItemName as metadata. Each took a median of **1,091 ms** (slowest 5%: 1,194 ms) for two calls: upload, then metadata.
- **Finding and linking:** filtering the library on ReportKey found **20 / 20**. Each photo is linked from its checklist result through PhotoRefs, which holds the photo's ID.
- **Integrity:** all **20 / 20** downloaded identical to what was uploaded (SHA-256 checked); download median 420 ms, slowest 5% 629 ms.
- **List-item attachment through Graph:** v1.0 **400** and beta **400**, "Resource not found for the segment 'attachments'". This was the PoC's only deliberate beta call.

**Verdict, Pass:** photos go in a document library, tagged with ReportKey. List-item attachments are not an option through Graph.

## S7 – Dashboard figures

The dashboard was computed from the S4 data by fetching with indexed filters and calculating in code.

- **Cost:** **977 ms, 2 calls, 928 KB** downloaded (504 failed checklist rows + 232 reports).
- **Open defects by severity:** Critical 116, Moderate 87, Minor 61.
- **Aging of open defects:** 0–30 days 89, 31–90 days 33, 91–180 days 28, 181–365 days 57, over 365 days 57.
- **BMER inputs:** reports, breakdown events and operating hours per month for the last 12 months, in `results.json`. For example, 2026-09: 12 reports, 2 breakdowns, 401 h. MMS has no agreed BMER formula yet (gap list item D2), so only the inputs are computed.

**Verdict, Pass now, Concern as data grows:**
- The download grows with the number of failed rows and reports, and a filter on one indexed column is limited to 5,000 rows.
- Production should either keep totals up to date as reports are saved, or limit each query by date (SubmittedDate is indexed).
- Any dashboard field has to be copied onto the row being queried, because SharePoint cannot join lists.

## S8 – Orphans (no enforced lookups)

- **Deleting the report:** the report row was deleted (204), and **all 42 child rows stayed** (15 header values, 24 checklist results, 3 faults).
- **Clean-up when the ReportKey is known:** an indexed filter plus `$batch` delete took 6.0 s and 7 calls, and left 0 rows.
- **Clean-up sweep when the key isn't known:** reading every ReportKey in 3 child lists and comparing against the reports took 5.3 s and 5 calls, but downloaded **7.0 MB**. The cost grows with the size of the lists.
- **Lookup column:** deleting an asset that a report points to **succeeded (204)**. The report still holds `AssetLookupLookupId = 11`, pointing to an asset that no longer exists, and its display value is empty.

**Verdict, Concern:**
- Deletes must go through app code that removes children first. Nothing on the server stops orphans.
- A scheduled sweep is needed. Reports should be marked "Deleted" before their children are removed, rather than removed outright.

## Estimated extra code for the full SharePoint path

These estimates are based on what the PoC needed, in lines of TypeScript excluding comments.

| Area | PoC needed | Production estimate | Notes |
|---|---|---|---|
| Integrity and recovery (manifest, complete or roll back) | 54 | 150–250 | Per report type and per child list, plus a status flag and tests |
| `$batch`, retry and back-off (429 / 503 / `Retry-After`) | ~80 (in `graph.ts`) | 150–250 | Also needs logging and limits on how many requests run at once; S5 will set the timings |
| Conflict handling (`If-Match`, 412, field merge) | ~25 | 100–200 | Per editable entity, plus a UI decision for real conflicts |
| Orphan clean-up and soft delete | ~40 | 100–150 | Scheduled sweep, delete order |
| Indexing, archiving and dashboard totals | setup ~80 | 200–400 | Index management, yearly archive lists or date-limited queries, keeping totals up to date |
| **Total** | ~280 | **~700–1,250** | On top of the normal sync code |

## Things that may have distorted the results

- **Single client:** everything ran from one PC, one request at a time, during a weekend afternoon. Load on the tenant wasn't measured.
- **Session switch:** the Claude Code session switched apps while S4's last 1,000 rows were being written. The run continued, but timing in that period is less reliable.
- **Throttle details:** the `Retry-After` values for S4's 16 throttled writes weren't saved; only the count was.
- **Slow delete in Phase 0:** one delete took 3.1 s. Later batched deletes didn't show this.
- **Checklist item names:** the MMS database copy is encrypted. 9 PUMP UNIT and 4 CTU item names are real (taken from the MMS backend tests); the rest are realistic placeholders. The counts (24 and 19) and the header labels (15) are real.
- **Test data:** each S4 report has 0–4 failed items, which is more than real MR-I reports usually have, so S7 has more open faults to fetch.

## Safety confirmation

- **Only the MMS site was touched.** Every write was checked against `SP_SITE_URL` and against a list or library named `PoC_…`. The site's other lists (Events, Documents, Web Template Extensions) were read once, for the record, and never written to.
- **Beta endpoints:** used for the recycle bin read in Phase 0 (v1.0 doesn't support it) and for the deliberate S6 attachment test. Everything else used v1.0.
- **No secrets in the results:** `results.json` and every file in `results/raw/` were scanned for the client secret, tenant ID, client ID and access tokens, and none were found.
- **No git commits** were made.
- **Clean-up has not been run.** `npm run cleanup` (with an optional `--dry-run` first) deletes all `PoC_` lists and libraries and purges their recycle bin entries. It runs only on Jess's OK.
