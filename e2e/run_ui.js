// Phase 2 runner: MR-I Test Matrix cases through the real app (debug build), in matrix order.
//
//   node e2e/run_ui.js --from A1 --to A3 [--fresh]
//
// --fresh   start from e2e/run/assets.start.db (the clean S5 state)
// otherwise start from the snapshot saved when the previous range ended
//           (e2e/run/snapshots/before_<from>.db), so ranges can be run one after another.
//
// Results are merged into e2e/results/phase2_ui.json (one entry per case id; a re-run of a
// case replaces its entry). Screenshots: e2e/screenshots/<case id>/<n>_<step>.png
const fs = require('fs');
const path = require('path');
const { withApp, shot, pageText, ROOT, RUN } = require('./lib/session');

const CASES = [
  ...require('./cases/s.js'),
  ...require('./cases/a.js'),
  ...require('./cases/b.js'),
  ...require('./cases/c.js'),
  ...require('./cases/d.js'),
  ...require('./cases/e.js'),
  ...require('./cases/f.js'),
  ...require('./cases/g.js'),
  ...require('./cases/j.js'),
  ...require('./cases/i.js'),
  ...require('./cases/kl.js'),
];

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const fromId = opt('--from') || CASES[0].id;
const toId = opt('--to') || CASES[CASES.length - 1].id;
const fresh = args.includes('--fresh');

const fromIdx = CASES.findIndex((c) => c.id === fromId);
const toIdx = CASES.findIndex((c) => c.id === toId);
if (fromIdx < 0 || toIdx < 0 || toIdx < fromIdx) { console.error('bad --from/--to'); process.exit(2); }

const SNAP = path.join(RUN, 'snapshots');
fs.mkdirSync(SNAP, { recursive: true });
for (const f of ['assets.db-wal', 'assets.db-shm']) { try { fs.unlinkSync(path.join(RUN, f)); } catch (e) {} }
// --start <file>: start from a named copy (re-tests); --record A,B: only these cases' results are saved.
const startOpt = opt('--start');
const recordOnly = opt('--record') ? opt('--record').split(',') : null;
const startFile = startOpt ? path.resolve(ROOT, startOpt) : fresh ? path.join(RUN, 'assets.start.db') : path.join(SNAP, `before_${fromId}.db`);
if (!fs.existsSync(startFile)) { console.error('missing start state ' + startFile + ' (use --fresh or run the earlier range first)'); process.exit(2); }
fs.copyFileSync(startFile, path.join(RUN, 'assets.db'));
console.log('start state:', path.relative(ROOT, startFile));

const RESULTS = path.join(ROOT, 'e2e', 'results', 'phase2_ui.json');
const results = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : { cases: {} };

function today(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

withApp(async (browser) => {
  const shared = { reports: results.reports || {} };
  for (const c of CASES.slice(fromIdx, toIdx + 1)) {
    console.log(`\n== ${c.id} ${c.title}`);
    const rec = { id: c.id, runner: c.runner || 'claude-code', title: c.title, checks: [], screenshots: [], date: new Date().toISOString(), error: null };
    let n = 0;
    const ctx = {
      browser, shared, today, rec,
      async shot(step) {
        const dir = recordOnly && !recordOnly.includes(c.id) ? `_setup/${c.id}` : c.id;
        const rel = `e2e/screenshots/${dir}/${String(++n).padStart(2, '0')}_${step.replace(/[^a-z0-9]+/gi, '_')}.png`;
        await shot(browser, rel); rec.screenshots.push(rel); return rel;
      },
      check(label, cond, detail = '') { const o = cond ? 'ok' : 'FAIL'; rec.checks.push({ label, outcome: o, detail: String(detail) }); console.log(`   [${o}] ${label}${detail ? ' -- ' + detail : ''}`); return cond; },
      eq(label, got, want) { return ctx.check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); },
      info(label, detail = '') { rec.checks.push({ label, outcome: 'info', detail: String(detail) }); console.log(`   [info] ${label} -- ${detail}`); },
      matrix(label, detail = '') { rec.checks.push({ label, outcome: 'MATRIX', detail: String(detail) }); console.log(`   [MATRIX] ${label} -- ${detail}`); },
      review(label, detail = '') { rec.checks.push({ label, outcome: 'review', detail: String(detail) }); console.log(`   [review] ${label} -- ${detail}`); },
      text: (max) => pageText(browser, max),
    };
    const retries = require('./lib/ui').chooseRetries;
    const r0 = retries.length;
    try {
      if (c.who) await require('./lib/ui').as(browser, c.who);
      await c.run(ctx);
      for (const r of retries.slice(r0)) ctx.info('dropdown value did not stick, re-selected', `${r.label} = "${r.value}" (attempt ${r.attempt}, screen showed "${r.shown}"). Possible race: the header resets unsaved values when saved values are re-read.`);
    } catch (e) {
      rec.error = String(e.message || e).slice(0, 500);
      console.log('   [BLOCKED]', rec.error);
      try { await ctx.shot('error'); } catch (e2) {}
    }
    const fails = rec.checks.some((x) => x.outcome === 'FAIL');
    rec.status = rec.error ? 'Blocked' : fails ? 'Fail' : rec.runner === 'claude-code+review' ? 'Needs review' : rec.checks.some((x) => x.outcome === 'ok') ? 'Pass' : 'Needs review';
    if (!recordOnly || recordOnly.includes(c.id)) results.cases[c.id] = rec;
    else console.log('   (setup only, not recorded)');
    results.reports = shared.reports;
    fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
    fs.writeFileSync(RESULTS, JSON.stringify(results, null, 1));
    console.log(`   => ${rec.status}`);
  }
})
  .then(() => {
    const nextCase = CASES[toIdx + 1];
    if (startOpt) {
      const end = path.join(RUN, `retest_after_${toId}.db`);
      fs.copyFileSync(path.join(RUN, 'assets.db'), end);
      console.log('\nre-test end state saved:', path.relative(ROOT, end), '(snapshots untouched)');
      return;
    }
    fs.copyFileSync(path.join(RUN, 'assets.db'), path.join(SNAP, `after_${toId}.db`));
    if (nextCase) fs.copyFileSync(path.join(RUN, 'assets.db'), path.join(SNAP, `before_${nextCase.id}.db`));
    console.log('\nsnapshot saved:', `after_${toId}.db`, nextCase ? `(= before_${nextCase.id}.db)` : '');
  })
  .catch((e) => { console.error('RUN FAILED:', e.message); process.exit(1); });
