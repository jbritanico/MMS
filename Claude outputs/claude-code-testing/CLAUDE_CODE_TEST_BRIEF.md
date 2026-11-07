# MMS MR-I testing with Claude Code — brief

Paste this file (or point Claude Code at it) as the first instruction of the session.
Files in this folder:

- `CLAUDE_CODE_TEST_BRIEF.md` — this brief.
- `test_matrix_cases.json` — all 136 cases of the MR-I Test Matrix Rev 6.8: id, group, who performs it, title, data, steps (with sub-steps), expected results, and copy-and-paste value tables (`grids`) for every report form. Each case has a `runner` field.
- `case_split.csv` — the same list in run order with the runner for each case.

## 1. Goal

Run every Test Matrix case that can be checked automatically, in matrix order, and report Pass / Fail / Blocked per expected result with evidence. The human tester (Jess) will then run only what is left.

| runner | cases | what Claude Code does |
|---|---|---|
| `claude-code` | 114 | Run the steps and judge every expected result. |
| `claude-code+review` | 20 | Run the steps, check whatever is functional, and save screenshots. Jess judges the look. Do not mark Pass on visuals yourself. |
| `you` | 2 (S1, J5) | Skip the in-app Save / Open dialog steps. For S1, take the backup by copying the database file (section 3). |

## 2. Hard rules — never break these

1. **Never push to GitHub, never commit, never change git history** (no commit, push, rebase, reset, stash, checkout of tracked files). Work in the working tree only.
2. **Never touch the real database** `src/desktop/src-tauri/assets.db`. All tests run on a copy (section 3). Before and after every run, check the real file's size and last-modified time are unchanged and say so in the report.
3. **Never print, log or write the database encryption key** anywhere (it is `DB_ENCRYPTION_KEY` in `src-tauri/src/lib.rs`). Read it in code only when needed.
4. **Do not change app behaviour.** If a case fails because of an app bug, stop that case, record it as Fail with the reason, and list a proposed fix. Make code changes only after Jess approves each one. Test-only files (under `src-tauri/tests/` and `e2e/`) are fine to add.
5. **Ask before installing anything** (tauri-driver, msedgedriver, npm packages). Say what and why.
6. Never edit the Test Matrix wording. If a case is wrong or unclear (it happens), note it in the report with what you saw.
7. Keep the CRLF / LF line endings of any file you edit.

## 3. The test database

The app opens `assets.db` **relative to the folder it is started in** (`Connection::open("assets.db")` in `open_and_migrate_connection`, `src-tauri/src/lib.rs`). So:

- Create `e2e/run/` (or a temp folder) and copy a starting database into it as `assets.db`.
- Start the app (or the Rust test process) **with that folder as the current directory**, so it opens the copy.
- For Rust tests: call `std::env::set_current_dir(<test folder>)` before the first database call (the connection is created once and cached).
- Confirm which file changed (size / modified time) the first time, before relying on it.

**Starting state.** The matrix expects the data pack described in S2–S6 (7 users, ASSET1 on COILED TUBING UNIT, ASSET2 on PUMP UNIT with Left / Right components, permissions per Manual Rev 02). Jess's current `assets.db` already contains reports from manual testing (A–C done by hand). Ask Jess which starting point to use:

- (a) a clean copy prepared from the current database by removing test reports (use the app's admin purge logic on the copy, then reset asset tags and triggers to S5), or
- (b) continue from the current state and run only the cases not yet done.

Keep a fresh copy of the starting database as `e2e/run/assets.start.db` so any run can be repeated.

## 4. Environment

- Windows. Repo: `C:\Users\JessBritanico\Documents\GitHub\MMS-fresh`. App: `src/desktop` (Tauri 2, React 19, TanStack Query, Rust + rusqlite with bundled SQLCipher).
- UI code: `src/desktop/src`; backend commands: `src/desktop/src-tauri/src/lib.rs`.
- Jess normally runs `cargo tauri dev`. For automated UI runs, build once and drive the built app with **tauri-driver** (Tauri's official WebDriver bridge) plus the matching **Microsoft Edge WebDriver** for WebView2, using WebdriverIO or Selenium from `e2e/`.
- Users sign in by picking a name on the start screen (no password). Use the ‹ › arrows or the picker to choose the user named in each case's `who`.

## 5. How to work

**Phase 0 — check setup.** Report versions of Rust, Cargo, Node, and whether tauri-driver / msedgedriver are installed. Ask before installing.

**Phase 1 — backend rule tests (fast, most value).** Write Rust integration tests under `src-tauri/tests/` that call the `#[tauri::command]` functions directly on the test database copy. Cover the rules behind groups A–H and J: submit checks (Compliance Stage, Pre-Mobilization Checklist ID for PREMOB / PRE-JOB, Job Number for POST JOB, footer Operator Date / Supervisor / Supervisor Date, Fail needs issue details and action taken), closure and endorse rules, fault decisions (approve, reject, reclassify, carry forward, phone relay / provisional, acknowledgement), Red / Yellow / Green tags, repairs and verification, triggers (EH, KM, OH; OH adds Job Operating Hours on close), the 72-hour copy and day-8 stand-by, carry-forward per component, permissions and country access. Map each test to its matrix case id in the test name.

**Phase 2 — end-to-end runs through the real app.** Follow the matrix in order (cases depend on the state the previous case left). For each case: sign in as the case's user, perform the steps using exactly the values in the case's `grids` tables (Value column; `Automatic`, `Leave blank`, `Do not tick`, `Cannot tick` mean do nothing), then check each expected result on screen and, where it is stored, in the test database. Save a screenshot after each step to `e2e/screenshots/<case id>/<step>.png`.

- Attachments use a normal HTML file input: send a small test image (create one under `e2e/fixtures/`).
- "IT runs the SQL" steps (E1, E11, E12, E13, G7, H8): run them on the test database yourself.
- Dates: "Today" / "Yesterday" mean the real dates of the run.
- Errors on Pending Approvals open a modal dialog that must be closed with OK.

**Phase 3 — report.** Save everything inside the repo root, exactly here:

- `MMS-fresh\e2e\results\results.csv` (and the same data as `results.json`)
- `MMS-fresh\e2e\results\SUMMARY.md`
- screenshots in `MMS-fresh\e2e\screenshots\<case id>\`

`results.csv` must have a header row with these columns (Jess imports it into the Test Matrix with its **Import Claude Code results** button):

| column | content |
|---|---|
| `id` | matrix case id, e.g. `C9` |
| `runner` | `claude-code` or `claude-code+review` |
| `status` | exactly `Pass`, `Fail`, `Blocked` or `Needs review` (`Needs review` for every `claude-code+review` case; never mark visuals Pass yourself) |
| `verdicts` | one verdict per expected result, e.g. `Step 2 refused: ok; Unit Red: ok; Tag reason: FAIL` |
| `evidence` | screenshot paths and database values you checked |
| `notes` | short explanation; for a Fail, what was seen versus expected |
| `proposed fix` | for a Fail caused by an app bug, the fix you propose (not applied) |
| `date` | when the case ran (ISO date-time) |

Quote any value containing commas, quotes or line breaks. Leave cases you did not run out of the file (or give them status `Not run`).

`SUMMARY.md` lists: failures with the likely cause and proposed fix, matrix cases that were wrong or unclear, the 20 `claude-code+review` cases with their screenshot folders for Jess, and confirmation that the real `assets.db` was not modified.

## 6. Values and rules the cases rely on

- Location: PRE-JOB and POST JOB at the well (`Test Well TW-21`); PREMOB and YARD INSPECTION at `Karachi Yard`.
- Job Operating Hours: entered only on POST JOB (E2 = 12, E9 Report B = 8, F9 = 10); blank otherwise.
- Maintenance Type: dropdown Preventive / Breakdown, starts on Preventive (A3a tests it).
- Every checklist item on both templates is required and starts as Pass; only the items a case fails need entry.
- Reviewer for Critical faults can only be the Maintenance Manager / FSM (Kamil Shahzad).

## 7. When done

Tell Jess: how many cases passed / failed / blocked / need review, where the results are, and which cases are left for her (the 20 review cases' screenshots and the S1 / J5 dialog steps). Do not mark anything in the claude.ai Test Matrix; Jess imports `results.csv` there with the **Import Claude Code results** button.
