# Test Scenarios view (Consolidated Diagrams) – how to refresh

Files in this folder
- `ext_rs.py`  – reads `src-tauri/src/lib.rs` → `rs.json` (functions, SQL ops per table, Err texts, calls, permission checks)
- `ext_fe.py`  – reads `src/**/*.ts(x)` → `fe.json` (invoke sites, hooks, components)
- `ext_tc.py`  – reads `tests/mri_matrix_backend.rs` → `tc.json` (per case: command calls in order, refused/accepted branches)
- `src.json`   – lib.rs source of the functions the scenarios touch
- `phase1_backend.json`, `phase2_ui.json`, `results.json` – observed results of the e2e run (7 Nov 2026)
- `sv_build.py` – combines the above with the MR-I Test Matrix page into `_sv_data.json` (DATA.sv)
- `v10.js` – the Test Scenarios view

Refresh after code changes
1. In `src/desktop`: `python ext_rs.py src-tauri/src/lib.rs rs.json`
2. `python ext_fe.py src fe.json`
3. `python ext_tc.py src-tauri/tests/mri_matrix_backend.rs rs.json tc.json`
4. Ask Claude to rebuild and republish Consolidated Diagrams with the new files (and the latest Test Matrix page).

New Test Matrix cases appear automatically on the next build (Unmapped until a replay or mapping exists).
Between builds, the view's "Load matrix CSV" button takes the Test Matrix "Export CSV" file.
