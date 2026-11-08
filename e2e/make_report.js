// Phase 3: merge the Phase 1 backend results and the Phase 2 UI results into
//   e2e/results/results.csv, results.json and SUMMARY.md
// in Test Matrix order. Runner per case comes from the matrix file.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'e2e', 'results');
const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, 'Claude outputs', 'claude-code-testing', 'test_matrix_cases.json'), 'utf8'));
const p1 = JSON.parse(fs.readFileSync(path.join(OUT, 'phase1_backend.json'), 'utf8'));
const p2 = JSON.parse(fs.readFileSync(path.join(OUT, 'phase2_ui.json'), 'utf8'));
const p1ById = Object.fromEntries(p1.cases.map((c) => [c.id, c]));
const p2ById = p2.cases;

// App bugs found, with the fix proposed (or applied with approval).
const BUGS = {
  update_plan: {
    cases: ['D2', 'D3', 'D3a', 'D4', 'D8', 'D9', 'D11', 'D12', 'E10'],
    title: 'Rectification Queue "Update Plan" always failed',
    cause: 'useMriFaultRectifications.ts:59 sent flat camelCase fields; the Rust command update_mri_fault_rectification takes one `update` object with snake_case fields ("missing required key update").',
    fix: 'Wrap the plan as { update: { id, assigned_technician, parts_status, repair_date, updated_by } }.',
    status: 'FIXED with Jess\'s approval (frontend only, not committed); D and E re-run on the fixed build and pass.',
  },
  relay_menu: {
    cases: ['F4'],
    title: 'Job Supervisor cannot reach Pending Approvals from the main menu',
    cause: 'MainMenu.tsx:203 shows the Pending Approvals card/count only for mri.close_defect or mri.approve. The Job Supervisor holds mri.record_provisional (phone relay) only, so Attention Required never offers Pending Approvals to Abdulla (it is reachable only through a document flow\'s "Open Pending Approvals").',
    fix: 'Add effectivePermissions.includes("mri.record_provisional") to canReviewApprovals in MainMenu.tsx.',
    status: 'FIXED (not committed). F4 re-tested on e2e/run/retest_F4.db (copy of snapshots/before_F1.db; F1–F3 replayed as setup, not recorded): Pass. The Job Supervisor sees only Record (Phone Relay) cards.',
  },
  asset_country: {
    cases: ['G5'],
    title: 'Asset Registry ignores the user\'s country access',
    cause: 'get_assets has no viewer filter and AssetRegistry.tsx does not filter by the signed-in user\'s country rows (the review queues and flows do).',
    fix: 'get_assets(viewer_user_id) filters by the user\'s country rows (rule agreed with Jess: Maintenance Manager / FSM, Administrator and users with no country rows see every asset); Asset Registry and Select Asset use the new useAssetsForViewer() hook. Dashboard, menu KPIs, Data Purging and the wizard lookup still list all assets.',
    status: 'FIXED (not committed). G5 re-tested on e2e/run/retest_G5.db (copy of e2e/run/retest_after_H3.db, the state after G1–H3): Pass, including an FSM check (Kamil with a UAE row still sees both assets). The first attempt blocked before the case started (app start screen not shown in 30 s); the immediate re-run passed.',
  },
  raw_dates: {
    cases: ['J2', 'H3'],
    title: 'Dates shown as raw Unix seconds',
    cause: 'The backend stores dates as Unix seconds ("1794048477"). AssetFlow.tsx:72 shortDate() assumes an ISO string, so report and tag boxes and their details print the raw number; the cost panel (ReportWizard.tsx:5928) prints mr_cost_date raw too.',
    fix: 'Format all-digit date values as dates (seconds x 1000), DD/Mon/YYYY like Pending Approvals: AssetFlow shortDate() and its detail rows, the MR cost date (ReportWizard), the Asset Registry tag history, the Pending Approvals reminder time, and the report date on Review & Submit / print (ReportWizard fmtDate, DD-Mon-YYYY as elsewhere on the report).',
    status: 'FIXED (not committed). J2 re-tested on e2e/run/retest_J2.db (copy of snapshots/final_after_J9.db): Pass. H3 re-tested on e2e/run/retest_H3.db (copy of snapshots/before_G1.db; G1–H2 replayed as setup, not recorded): Pass.',
  },
  dashboard_back: {
    cases: ['J8'],
    title: 'Back from the asset flow opened on the Dashboard lands on the Dashboard start view',
    cause: 'Dashboard.tsx:592 keeps the chosen view and asset (selectedAsset) in local component state; opening the flow unmounts the Dashboard, so Back remounts it at "Choose a view" instead of the asset history panel.',
    fix: 'Keep the Dashboard view and selected asset in App.tsx (DashboardNav state passed to Dashboard); opening the Dashboard from the main menu still starts at its hub.',
    status: 'FIXED (not committed). J8 re-tested on e2e/run/retest_J8.db (copy of snapshots/final_after_J9.db): Pass.',
  },
  header_race: {
    cases: ['I6', 'I7'],
    title: 'Possible race: a header dropdown choice can be lost (to confirm by hand)',
    cause: 'In I6 the Compliance Stage was chosen as YARD INSPECTION but the screen fell back to "— Select —" and "" was saved. HeaderEntryStep resets its unsaved local values whenever saved values are re-read (useEffect on savedValues), so a choice made while an earlier field\'s save is being re-read can be wiped before the blur saves it. Seen only at automation speed; I7 was blocked because it needs I6\'s submitted report.',
    fix: 'HeaderEntryStep tracks fields changed but not yet saved and keeps them when savedValues refreshes (merge instead of replace).',
    status: 'FIXED (not committed). I6 and I7 re-tested on copies of snapshots/final_after_J9.db (I5 / I12 replayed as setup) with the test re-select retry switched off: Pass at automation speed (e2e/run/retest_I6.db, recorded) and with a 1-second pause between fields (e2e/run/retest_I6_slow.db). The Compliance Stage choice was kept both ways. The Distance Travelled and Footer steps use the same reset-on-refresh pattern and were not changed.',
  },
  tsc_case: {
    cases: [],
    title: 'Production build fails in tsc (file-name casing)',
    cause: 'src/features/administration/hooks/useMRiTemplates.ts is imported everywhere as useMriTemplates; tsc (npm run build / cargo tauri build) refuses the case-only difference. cargo tauri dev and vite build are not affected on Windows.',
    fix: 'Rename the file to useMriTemplates.ts (done by two filesystem renames; core.ignorecase=true, so record it at commit time with `git mv -f`).',
    status: 'FIXED (not committed). npm run build (tsc + vite) passes with no TypeScript errors; only Vite\'s existing chunk-size warning remains.',
  },
};
const bugFor = (id) => Object.values(BUGS).find((b) => b.cases.includes(id));

const csvQ = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const short = (s, n = 160) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const rows = [];
const matrixIssues = [];
for (const m of matrix) {
  if (m.runner === 'you') continue;
  const u = p2ById[m.id];
  const b = p1ById[m.id];
  if (!u && !b) continue;
  const checks = [];
  if (b) for (const c of b.checks) checks.push({ ...c, src: 'backend' });
  if (u) for (const c of u.checks) checks.push({ ...c, src: 'UI' });
  let status;
  if (m.runner === 'claude-code+review') status = 'Needs review';
  else if ((u && u.status === 'Blocked') || (!u && b && b.status === 'Blocked')) status = 'Blocked';
  else if (checks.some((c) => c.outcome === 'FAIL')) status = 'Fail';
  else if (checks.some((c) => c.outcome === 'ok')) status = 'Pass';
  else status = 'Blocked';
  const verdicts = checks.filter((c) => c.outcome === 'ok' || c.outcome === 'FAIL').map((c) => `${c.src === 'backend' ? '[DB] ' : ''}${c.label}: ${c.outcome === 'ok' ? 'ok' : 'FAIL'}`).join('; ');
  const fails = checks.filter((c) => c.outcome === 'FAIL').map((c) => `${c.label} -- ${short(c.detail, 200)}`);
  const mx = checks.filter((c) => c.outcome === 'MATRIX');
  for (const c of mx) matrixIssues.push({ id: m.id, label: c.label, detail: c.detail });
  const infos = checks.filter((c) => c.outcome === 'info' || c.outcome === 'review').map((c) => `${c.label}: ${short(c.detail, 140)}`);
  const evidence = [
    ...(u ? u.screenshots : []),
    b ? `backend test mri_matrix_backend.rs (${b.checks.filter((c) => c.outcome === 'ok').length} DB checks ok)` : '',
  ].filter(Boolean).join(' | ');
  const bug = bugFor(m.id);
  const notes = [
    u && u.error ? `Blocked: ${u.error}` : '',
    fails.length ? `Seen vs expected: ${fails.join(' / ')}` : '',
    mx.length ? `Matrix issue: ${mx.map((c) => c.label).join(' / ')}` : '',
    m.runner === 'claude-code+review' ? 'Look not judged by Claude Code; screenshots for Jess.' : '',
    !u ? 'Checked on stored data (Phase 1); no separate UI run.' : '',
    bug ? `${bug.title} (${bug.status})` : '',
    infos.length ? infos.slice(0, 4).join(' / ') : '',
  ].filter(Boolean).join(' ');
  rows.push({
    id: m.id, runner: m.runner, status, verdicts, evidence, notes,
    'proposed fix': bug && status === 'Fail' ? bug.fix : bug && /FIXED/.test(bug.status) ? `${bug.fix} (${bug.status})` : '',
    date: (u && u.date) || p1.run_at_local || '',
  });
}

const cols = ['id', 'runner', 'status', 'verdicts', 'evidence', 'notes', 'proposed fix', 'date'];
fs.writeFileSync(path.join(OUT, 'results.csv'), [cols.join(','), ...rows.map((r) => cols.map((c) => csvQ(r[c])).join(','))].join('\r\n') + '\r\n');
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(rows, null, 1));

const count = (s) => rows.filter((r) => r.status === s).length;
const realDb = p1.real_db_unchanged;
let md = '# MR-I Test Matrix Rev 6.8 — Claude Code run\r\n\r\n';
md += `Run date: ${new Date().toISOString().slice(0, 10)}. Cases in results.csv: ${rows.length} (Pass ${count('Pass')}, Fail ${count('Fail')}, Blocked ${count('Blocked')}, Needs review ${count('Needs review')}).\r\n\r\n`;
md += 'Phase 1 ran the backend rules through the app\'s own Rust commands (src-tauri/tests/mri_matrix_backend.rs). Phase 2 drove the real app (debug build, tauri-driver + msedgedriver 157) through every case in matrix order from a clean database (e2e/run/assets.start.db). Status combines both; [DB] verdicts come from Phase 1.\r\n\r\n';
md += '## Failures, likely cause and proposed fix\r\n\r\n';
for (const b of Object.values(BUGS)) {
  md += `### ${b.title}\r\n- Cases: ${b.cases.join(', ') || 'build only'}\r\n- Cause: ${b.cause}\r\n- Fix: ${b.fix}\r\n- Status: ${b.status}\r\n\r\n`;
}
const otherFails = rows.filter((r) => r.status === 'Fail' && !bugFor(r.id));
if (otherFails.length) {
  md += '### Other failures\r\n';
  for (const r of otherFails) md += `- ${r.id}: ${r.notes}\r\n`;
  md += '\r\n';
}
const blocked = rows.filter((r) => r.status === 'Blocked');
if (blocked.length) {
  md += '## Blocked\r\n\r\n';
  for (const r of blocked) md += `- ${r.id}: ${r.notes}\r\n`;
  md += '\r\n';
}
md += '## Matrix cases that are wrong or unclear\r\n\r\n';
const seen = new Set();
for (const x of matrixIssues) {
  const k = `${x.id}|${x.label}`; if (seen.has(k)) continue; seen.add(k);
  md += `- **${x.id}** — ${x.label}: ${x.detail}\r\n`;
}
md += '- **F4/F5** — phone relay: resolved. K. Shahzad confirmed phone approval is part of the existing (legacy) MMS and stays: allowed for Moderate and Major/Critical faults (not for Minor), recorded as Provisional and confirmed later by the reviewer. The app already does this (F4 and F5 pass); only the Test Matrix gets a basis line.\r\n';
md += '- **A3** — confirmed by Jess: the app is right (PRE-JOB records Distance Travelled Pre-Job; POST JOB, and a Yard inspection right after it, record Post-Job). Matrix to read "Distance Travelled Pre-Job (KM): 300".\r\n';
md += '- **C1/D10** — basis: Manual Rev 02 §8.1 (every item Green / Yellow / Red; a Moderate-only unit is ready for service) and Table 3; Table 3\'s Moderate row itself says nothing about tags.\r\n\r\n';
md += '## Cases for Jess\r\n\r\n### claude-code+review (look not judged; screenshots)\r\n\r\n| case | screenshots |\r\n|---|---|\r\n';
for (const r of rows.filter((x) => x.runner === 'claude-code+review')) md += `| ${r.id} | e2e/screenshots/${r.id}/ |\r\n`;
md += '\r\n### runner "you"\r\n\r\n- **S1** — backup: the run took its backup by copying the database to e2e/run/assets.source.db (brief section 3); the in-app Save / Open dialog step is left for Jess.\r\n- **J5** — automated part Pass (e2e/run/retest_J5.db, copy of final_after_J9.db): Data Tools lists Browser, Removal, Purging, Backup; Backup shows Export and Import for Jess (Administrator holds backups.export and backups.import); Users has no backup panel and still has Clear all users; export_full_backup() returns all 40 tables. Left for Jess: press Export full backup in her own app, check the file is saved (Downloads or the Save dialog) and mark J5. Screenshots: e2e/screenshots/J5/.\r\n\r\n';
md += '## Real database\r\n\r\n';
md += `src/desktop/src-tauri/assets.db was never opened by any test: size ${p1.real_db_size} bytes and modified time 2026-11-07 12:52:05 (+04:00) were checked before and after every Phase 1 run and every Phase 2 session, and were unchanged each time (${realDb ? 'confirmed' : 'NOT confirmed'} in the last Phase 1 run; see phase2_run.log for the UI sessions).\r\n\r\n`;
md += '## Code changed (none committed)\r\n\r\n';
md += '- Update Plan (D/E): `src/desktop/src/features/mri-reporting/hooks/useMriFaultRectifications.ts`\r\n';
md += '- Fix 1 F4 (Pending Approvals for the Job Supervisor): `src/desktop/src/features/main-menu/MainMenu.tsx`\r\n';
md += '- Fix 2 J2 / H3 (dates): `src/desktop/src/features/mri-reporting/AssetFlow.tsx`, `src/desktop/src/features/mri-reporting/ReportWizard.tsx` (MR cost date, report date on Review / print), `src/desktop/src/features/asset-registry/AssetRegistry.tsx` (tag history), `src/desktop/src/features/mri-reporting/PendingApprovals.tsx` (reminder time)\r\n';
md += '- Fix 3 J8 (Dashboard view kept): `src/desktop/src/App.tsx`, `src/desktop/src/features/dashboard/Dashboard.tsx`\r\n';
md += '- Fix 4 I6 / I7 (header choice kept): `src/desktop/src/features/mri-reporting/ReportWizard.tsx` (HeaderEntryStep)\r\n';
md += '- Fix 5 build (file-name casing): `src/desktop/src/features/administration/hooks/useMRiTemplates.ts` renamed to `useMriTemplates.ts` (record with `git mv -f` at commit time)\r\n';
md += '- Fix 6 G5 (asset lists by country): `src/desktop/src-tauri/src/lib.rs` (get_assets), `src/desktop/src/features/asset-registry/hooks/useAssets.ts`, `src/desktop/src/features/asset-registry/AssetRegistry.tsx`, `src/desktop/src/features/mri-reporting/SelectAssetForReport.tsx`\r\n';
md += '- Previous Engine Hours on Review & Submit / print (Jess: show 0 when there is no earlier reading): `src/desktop/src/features/mri-reporting/ReportWizard.tsx` (ReviewStep uses the same previous reading as the Header step, else 0). Re-tested in A7.\r\n';
md += '- Test-only files: `src/desktop/src-tauri/tests/{db_inspect,prep_clean_db,mri_matrix_backend,it_sql}.rs`, everything under `e2e/`.\r\n\r\n';
md += '## Not changed (by decision)\r\n\r\n- F8: no "Pending" entry in the decision log (Jess to decide).\r\n- Everything under "Matrix cases that are wrong or unclear" (to be fixed in the Test Matrix).\r\n';
fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), md);
console.log(`results.csv: ${rows.length} cases — Pass ${count('Pass')}, Fail ${count('Fail')}, Blocked ${count('Blocked')}, Needs review ${count('Needs review')}`);
