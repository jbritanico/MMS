// D group through the UI.
const { as, click, attention, queueCards, typeInto, choose, valueOf } = require('../lib/ui');
const W = require('../lib/wizard');
const P = require('../lib/approvals');
const R = require('../lib/rect');
const A = require('../lib/assets');

const BB = 'Brass Bushing Condition Within Tolerance Limits';

async function tag(t, code) {
  const r = await A.tagOf(t.browser, code);
  return r;
}

module.exports = [
  {
    id: 'D1', who: 'Disantha Perera', title: 'Rectification Queue contents',
    async run(t) {
      const b = t.browser;
      await W.toMainMenu(b);
      const menu = await t.text(2000);
      const od = (menu.match(/Open Defects\s*\n?\s*(\d+)/) || [])[1];
      t.eq('Open Defects shows 4', od, '4');
      const badge = await b.execute(() => { const x = document.querySelector('button[aria-label="Open Fault Review"] .drawer-handle-avatar-count'); return x ? +x.innerText : null; });
      t.check('red circle counts at least 4', badge !== null && badge >= 4, String(badge));
      await t.shot('main_menu');
      await R.openQueue(b);
      const c = await R.cards(b);
      const got = c.map((x) => `${x.asset} ${x.item}`).sort();
      t.eq('four rows listed', got, ['ASSET1 Ball Valves', 'ASSET2 Agitator', 'ASSET2 Air Filter', 'ASSET2 Breather']);
      const reds = c.filter((x) => x.pills.includes('Red Tag'));
      t.check('the two Red rows show no technician', reds.length === 2 && reds.every((x) => x.tech === 'Unassigned'), JSON.stringify(reds.map((x) => [x.item, x.tech])));
      await t.shot('queue');
    },
  },
  {
    id: 'D2', who: 'Disantha Perera', title: 'One technician does not make the unit Yellow',
    async run(t) {
      const b = t.browser;
      await R.openQueue(b);
      const msg = await R.plan(b, 'Breather', 'ASSET2', { tech: 'Ahmed Khan' });
      t.check('plan saved', /Repair plan updated/.test(msg || ''), msg);
      await t.shot('breather_tech');
      t.eq('ASSET2 stays Red', (await tag(t, 'ASSET2')).tag, 'Red');
    },
  },
  {
    id: 'D3', who: 'Disantha Perera', title: 'Both repairs assigned makes the unit Yellow',
    async run(t) {
      const b = t.browser;
      await R.openQueue(b);
      const before = await R.summary(b);
      await R.plan(b, 'Agitator', 'ASSET2', { tech: 'Ahmed Khan' });
      const after = await R.summary(b);
      const ag = (await R.cards(b)).find((x) => x.item === 'Agitator' && x.asset === 'ASSET2');
      t.check('Agitator pill: amber wrench, hover Yellow Tag — repair in progress', ag && ag.pills.includes('Yellow Tag — repair in progress') && !ag.pills.includes('Red Tag'), ag && ag.pills.join(', '));
      const num = (arr, label) => { const s = arr.find((x) => x.includes(label)); return s ? +(s.match(/\d+/) || [NaN])[0] : NaN; };
      t.check('summary: Repair in progress +1, Red tag — not started −1', num(after, 'Repair in progress') === num(before, 'Repair in progress') + 1 && num(after, 'Red tag') === num(before, 'Red tag') - 1, `${before.join(' / ')} -> ${after.join(' / ')}`);
      await t.shot('agitator_tech');
      const tg = await tag(t, 'ASSET2');
      t.eq('ASSET2 turns Yellow', tg.tag, 'Yellow');
      t.check('tag reason names the technician', /Ahmed Khan/.test(tg.reason), tg.reason);
    },
  },
  {
    id: 'D3a', who: 'Disantha Perera', title: 'Show flow from the Rectification Queue (repairs still open)',
    async run(t) {
      const b = t.browser;
      await R.openQueue(b);
      await R.press(b, 'Agitator', 'ASSET2', 'Show flow');
      await b.pause(1500);
      const txt = await t.text(8000);
      await t.shot('flow');
      t.check('flow opens; Repair box shows Repair open with technician and parts', /Repair\s+open/i.test(txt) && /Ahmed Khan/.test(txt) && /Awaiting/.test(txt), txt.match(/Repair[^\n]*\n?[^\n]*\n?[^\n]*/)?.[0]);
      await click(b, '← Back', { exact: true });
      await b.pause(1200);
      t.check('Back returns to the Rectification Queue', await b.execute(() => document.body.innerText.includes('Rectification Queue')), '');
    },
  },
  {
    id: 'D4', who: 'Disantha Perera', title: 'Clearing a technician returns the unit to Red',
    async run(t) {
      const b = t.browser;
      await R.openQueue(b);
      await R.plan(b, 'Breather', 'ASSET2', { tech: '' });
      t.eq('step 1: ASSET2 back to Red', (await tag(t, 'ASSET2')).tag, 'Red');
      await R.openQueue(b);
      await R.plan(b, 'Breather', 'ASSET2', { tech: 'Ahmed Khan' });
      t.eq('step 2: Yellow again', (await tag(t, 'ASSET2')).tag, 'Yellow');
    },
  },
  {
    id: 'D5', who: 'Suganya Rajendran', title: 'Start Report 3 on ASSET2 and see the carried-forward fault',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET2', 'Left');
      t.shared.reports.r3 = await b.execute(() => { const m = document.body.innerText.match(/Report\s*#\s*(\d+)/); return m ? +m[1] : null; });
      const top = await t.text(6000);
      await t.shot('report3_top');
      t.check(`carried-forward faults list Brass Bushing, linked to Report #${t.shared.reports.r2}`, top.includes(BB) && new RegExp(`#${t.shared.reports.r2}`).test(top), (top.match(/[Cc]arried[^\n]*\n?[^\n]*\n?[^\n]*/) || [''])[0]);
      await W.stepTo(b, 'checklist');
      const s = await W.rowState(b, BB);
      t.check('Issue Details read-only text from Report 2', s.issueDisabled === true && s.issue === 'Light scoring on the brass bushing, still inside the wear limit.', JSON.stringify([s.issue, s.issueDisabled]));
      t.check('Action Taken lists the earlier entry (date/time, by Suganya Rajendran) and an empty box for this report', /Suganya Rajendran/.test(s.text) && /Measured and recorded as within the wear limit; to be monitored at the next report\./.test(s.text) && s.action === '', s.text.slice(0, 260));
      t.eq('defaults: Fail, Moderate, Pending, today', [s.status, s.severity, s.closure, s.date], ['Fail', 'Moderate', 'Pending', t.today()]);
      await t.shot('carried_row');
    },
  },
  {
    id: 'D6', who: 'Suganya Rajendran', title: 'Yellow unit: Pre-Job report is refused without an exemption',
    async run(t) {
      const b = t.browser;
      await W.stepTo(b, 'header');
      await choose(b, 'Client', 'Test Client');
      await typeInto(b, 'Location', 'Test Well TW-21');
      await choose(b, 'Compliance Stage', 'PRE-JOB');
      await typeInto(b, 'Pre-Mobilization Checklist ID', 'PMC-2026-0103');
      await W.stepTo(b, 'checklist');
      await W.rowType(b, BB, 1, 'Re-measured; still within wear limit, monitor at next report');
      await W.fillFooter(b, t.today());
      await W.stepTo(b, 'review');
      const rv = await W.reviewState(b);
      t.eq('no form issues listed', rv.issues, []);
      await click(b, 'Submit Report');
      await b.pause(2000);
      const txt = await t.text(5000);
      await t.shot('refused');
      const submitted = txt.includes('Report submitted');
      t.check('refused: unit Red / Yellow tagged with no valid MOC exemption', !submitted && /no valid MOC exemption/i.test(txt), (txt.match(/[^\n]*MOC exemption[^\n]*/) || [''])[0]);
      if (submitted) await click(b, 'OK', { exact: true });
      await W.toMainMenu(b);
    },
  },
  {
    id: 'D7', who: 'Disantha Perera', title: 'Record equipment limitations',
    async run(t) {
      const b = t.browser;
      await R.openQueue(b);
      t.matrix('D7 data: Informed by Abdulla Qais', 'the app has no "informed by" field: it records the signed-in user (Disantha Perera) as the person who informed the field team');
      const msg = await R.limits(b, 'Agitator', 'ASSET2', 'Do not run unit above 50% pump rate. Agitator isolated and locked out.');
      t.check('saved', /Equipment limitations recorded/.test(msg || ''), msg);
      const c = (await R.cards(b)).find((x) => x.item === 'Agitator' && x.asset === 'ASSET2');
      t.check('note, who informed the team and the date shown on the repair', c && /Field team told: Do not run unit above 50% pump rate\. Agitator isolated and locked out\./.test(c.limit) && /Disantha Perera/.test(c.limit) && /\d{4}|Nov/.test(c.limit), c && c.limit);
      await t.shot('limitations');
    },
  },
  {
    id: 'D8', who: 'Disantha Perera', title: 'Verify rules: function test, repair date, technician',
    async run(t) {
      const b = t.browser;
      await R.openQueue(b);
      t.matrix('Parts status "Received"', 'the app offers Awaiting / Ordered / Available; the run uses Available');
      let v = await R.verify(b, 'Breather', 'ASSET2', { functionTest: false, confirm: false });
      t.check('step 1: Confirm disabled with the function test empty', v.confirmState && v.confirmState.disabled, JSON.stringify(v.confirmState));
      await t.shot('step1');
      await R.press(b, 'Breather', 'ASSET2', 'Cancel');
      await R.plan(b, 'Breather', 'ASSET2', { tech: 'Ahmed Khan', parts: 'Available', date: '' });
      v = await R.verify(b, 'Breather', 'ASSET2', { functionTest: true });
      t.check('step 2: refused, a repair date is required for a Red repair', /repair date/i.test(v.toast || ''), v.toast);
      await t.shot('step2');
      if ((await R.cards(b)).find((x) => x.item === 'Breather' && x.asset === 'ASSET2')?.buttons.includes('Cancel')) await R.press(b, 'Breather', 'ASSET2', 'Cancel');
      await R.plan(b, 'Breather', 'ASSET2', { tech: 'Ahmed Khan', parts: 'Available', date: t.today() });
      v = await R.verify(b, 'Breather', 'ASSET2', { functionTest: true });
      t.check('step 3: repair verified (turns Green, leaves the queue)', /Verified — tag removed for Breather on ASSET2/.test(v.toast || '') && !(await R.cards(b)).some((x) => x.item === 'Breather' && x.asset === 'ASSET2'), v.toast);
      await t.shot('step3');
      t.eq('unit stays Yellow (other repair open)', (await tag(t, 'ASSET2')).tag, 'Yellow');
      t.info('verifier and date on the repair', 'stored values checked in Phase 1 (D8 ok)');
    },
  },
  {
    id: 'D9', who: 'Disantha Perera', title: 'Verify the second repair: unit turns Green',
    async run(t) {
      const b = t.browser;
      await R.openQueue(b);
      await R.plan(b, 'Agitator', 'ASSET2', { tech: 'Ahmed Khan', parts: 'Available', date: t.today() });
      const v = await R.verify(b, 'Agitator', 'ASSET2', { functionTest: true });
      t.check('repair verified', /Verified — tag removed for Agitator on ASSET2/.test(v.toast || ''), v.toast);
      await t.shot('verified');
      t.eq('ASSET2 turns Green', (await tag(t, 'ASSET2')).tag, 'Green');
      t.info('Green Tagged footer value true', 'stored value checked in Phase 1 (D9 ok)');
    },
  },
  {
    id: 'D10', who: 'Disantha Perera', title: 'Tag history',
    async run(t) {
      const b = t.browser;
      await A.openAsset(b, 'ASSET2');
      const h = await A.tagHistory(b);
      await t.shot('tag_history');
      const seq = h.map((x) => x.tag);
      t.eq('entries in order (first Green from the C1 Moderate decision)', seq, ['Green', 'Red', 'Yellow', 'Red', 'Yellow', 'Green']);
      t.matrix('D10 expects Red, Yellow, Red, Yellow, Green', 'the list starts with the Green set by C1 (Manual 8.1; see Phase 1)');
      t.check('every change listed with reason, report number and user', h.length > 0 && h.every((x) => /—/.test(x.text) && /#\d+/.test(x.text) && /\(by .+\)/.test(x.text)), h.map((x) => x.text).join(' | ').slice(0, 400));
      await W.toMainMenu(b);
    },
  },
  {
    id: 'D11', who: 'Disantha Perera', title: 'Close a Planned (Moderate) follow-up',
    async run(t) {
      const b = t.browser;
      await A.openAsset(b, 'ASSET2');
      const n0 = (await A.tagHistory(b)).length;
      await R.openQueue(b);
      const m = await R.plan(b, 'Air Filter', 'ASSET2', { tech: 'Ahmed Khan', parts: 'Available', date: t.today() });
      t.check('Update Plan saved', /Repair plan updated/.test(m || ''), m);
      t.eq('tag stays Green after the plan (no Yellow)', (await tag(t, 'ASSET2')).tag, 'Green');
      await R.openQueue(b);
      const v = await R.verify(b, 'Air Filter', 'ASSET2', { functionTest: true });
      t.check('Verify & Close Follow-up: verified, row leaves the queue', /Verified — follow-up closed for Air Filter on ASSET2/.test(v.toast || '') && !(await R.cards(b)).some((x) => x.item === 'Air Filter' && x.asset === 'ASSET2'), v.toast);
      await t.shot('closed');
      await A.openAsset(b, 'ASSET2');
      t.eq('tag never changed (no tag-history rows added)', (await A.tagHistory(b)).length, n0);
      await W.toMainMenu(b);
    },
  },
  {
    id: 'D12', who: 'Disantha Perera', title: 'Planned follow-up never changes the tag on a Green unit',
    async run(t) {
      const b = t.browser;
      t.eq('ASSET1 Green before', (await tag(t, 'ASSET1')).tag, 'Green');
      await R.openQueue(b);
      const m = await R.plan(b, 'Ball Valves', 'ASSET1', { tech: 'Bilal Ahmed' });
      t.check('plan saved', /Repair plan updated/.test(m || ''), m);
      await t.shot('planned');
      t.eq('ASSET1 stays Green', (await tag(t, 'ASSET1')).tag, 'Green');
    },
  },
  {
    id: 'D13', who: 'Suganya Rajendran', title: 'Submit and close Report 3 on a Green unit',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.r3;
      await W.openMR1(b, 'ASSET2', 'Left');
      await W.stepTo(b, 'review');
      const res = await W.submit(b);
      t.check('Submit succeeds now that ASSET2 is Green', res.ok, res.st.issues.join(' / '));
      await as(b, 'Abdulla Qais');
      await attention(b, 'Reports to Review');
      await click(b, `Endorse report #${n}`);
      await b.pause(1800);
      const bar = await b.execute(() => [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim()));
      await t.shot('next_step');
      t.check('Close & Approve not offered: Report 3 carries the Moderate Brass Bushing, so Endorse is required (Manual Table 3)', bar.includes('Endorse Report') && !bar.includes('Close & Approve Report'), bar.filter(Boolean).join(', '));
      t.matrix('D13 step 2 says press Close & Approve', 'Report 3 carries the Brass Bushing Fail (Moderate) as D5/D6 require; Manual Table 3 / Clarification: Moderate faults need review. The run endorsed to Disantha, Disantha approved, Abdulla closed.');
      await click(b, 'Endorse Report', { exact: true });
      await b.execute(() => { document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e')); [...document.querySelectorAll('.modal')].find((x) => /Escalate to/.test(x.innerText)).querySelector('select').setAttribute('data-e2e', '1'); });
      const sel = await b.$('[data-e2e="1"]');
      const opt = (await b.execute(() => [...document.querySelector('[data-e2e="1"]').options].map((o) => o.text))).find((o) => o.startsWith('Disantha Perera'));
      await sel.selectByVisibleText(opt);
      await click(b, 'Confirm & Endorse');
      await b.pause(1500);
      await as(b, 'Disantha Perera');
      await P.openPending(b);
      const d = await P.decideOn(b, BB, 'Approve', { asset: 'ASSET2', report: n, notes: 'Still within wear limit; approved (added by the test run per Table 3).' });
      t.check('Disantha approves Brass Bushing', /Approved — Brass Bushing/.test(d.toast || ''), d.toast || d.error);
      await as(b, 'Abdulla Qais');
      await attention(b, 'Reports to Review');
      await click(b, `Close report #${n}`);
      await b.pause(1800);
      await click(b, 'Close Report', { exact: true });
      await b.pause(2000);
      t.check('Report 3 closed (Approved)', !(await queueCards(b)).some((c) => c.text.includes(`Report #${n}`)), '');
      await t.shot('closed');
    },
  },
];
