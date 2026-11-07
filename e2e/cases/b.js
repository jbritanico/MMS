// B group through the UI.
const path = require('path');
const { as, click, attention, queueCards, typeInto, choose, valueOf } = require('../lib/ui');
const W = require('../lib/wizard');

const FX = (f) => path.resolve(__dirname, '..', 'fixtures', f);
const LADDER = 'Access Ladders & Handrails';

async function topBar(b) {
  return b.execute(() => {
    const btns = [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim());
    const m = document.body.innerText.match(/Next step:[^\n]*/);
    const status = ['Draft', 'Submitted', 'Endorsed', 'Escalated', 'Approved'].find((s) => [...document.querySelectorAll('span, div')].some((e) => e.children.length <= 2 && e.innerText.trim() === s && e.offsetParent !== null && e.getBoundingClientRect().top < 160));
    return { next: m ? m[0] : null, buttons: btns, status };
  });
}

async function openFromReview(b, reportNo, action) {
  await attention(b, 'Reports to Review');
  await click(b, `${action} report #${reportNo}`);
  await b.pause(2000);
}

const B5_FAILS = [
  ['Air Filter', 'Air filter element clogged, restriction indicator in the red.', 'Filter element removed and cleaned, replacement element ordered.', 0, 'air_filter.png'],
  ['Agitator', 'Agitator paddle shaft stiff, cannot confirm it turns freely.', 'Shaft lubricated, still stiff; bearing and seal inspection requested.', 0, null],
  ['Actuators on Control Panel', 'Control panel actuator sticks and responds slowly to the pump rate command.', 'Linkage cleaned and greased, response still slow.', -1, null],
  ['Breather', 'Breather cap missing, vent open to dust.', 'Temporary cap fitted, correct breather cap ordered.', 0, 'breather.png'],
  ['Brass Bushing Condition Within Tolerance Limits', 'Light scoring on the brass bushing, still inside the wear limit.', 'Measured and recorded as within the wear limit; to be monitored at the next report.', -2, null],
];

module.exports = [
  {
    id: 'B1', who: 'Suganya Rajendran', title: 'Who sees what on a Submitted report',
    async run(t) {
      const b = t.browser;
      const r1 = t.shared.reports.r1, ra10 = t.shared.reports.rA10;
      await attention(b, 'My Reports');
      await click(b, `View report #${r1}`);
      await b.pause(1800);
      const bar = await topBar(b);
      t.check('Suganya has no Close or Endorse control', !bar.buttons.some((x) => /Endorse|Close & Approve|Close Report/.test(x)), bar.buttons.filter((x) => x).join(', '));
      await t.shot('suganya_view');
      await as(b, 'Abdulla Qais');
      await attention(b, 'Reports to Review');
      const cards = await queueCards(b);
      await t.shot('reports_to_review');
      const c2 = cards.find((c) => c.text.includes(`Report #${r1}`));
      const c1 = cards.find((c) => c.text.includes(`Report #${ra10}`));
      t.check('ASSET2 Report 1 card "Awaiting endorsement" with Endorse', !!c2 && c2.code === 'ASSET2' && /Awaiting endorsement/.test(c2.text) && c2.buttons.includes(`Endorse report #${r1}`), c2 && c2.text);
      t.check('ASSET1 Pre-Mob card "Awaiting endorsement" with Endorse', !!c1 && c1.code === 'ASSET1' && /Awaiting endorsement/.test(c1.text) && c1.buttons.includes(`Endorse report #${ra10}`), c1 && c1.text);
      await click(b, `Endorse report #${r1}`);
      await b.pause(2000);
      t.check('pressing Endorse on ASSET2 opens the MR-I report', await b.execute((n) => document.body.innerText.includes(`Report #${n}`) && document.body.innerText.includes('ASSET2'), r1), '');
      await t.shot('report_opened');
    },
  },
  {
    id: 'B2', who: 'Abdulla Qais', title: 'Endorse is not offered on a Minor-only report',
    async run(t) {
      const b = t.browser;
      const bar = await topBar(b);
      t.check('Next step bar says close and approve, with Close & Approve Report', /close and approve/i.test(bar.next || '') && bar.buttons.includes('Close & Approve Report'), bar.next);
      t.check('Endorse Report not shown', !bar.buttons.includes('Endorse Report'), '');
      await t.shot('next_step_bar');
    },
  },
  {
    id: 'B3', who: 'Abdulla Qais', title: 'Close & Approve Report 1',
    async run(t) {
      const b = t.browser;
      const r1 = t.shared.reports.r1;
      await click(b, 'Close & Approve Report', { exact: true });
      await b.pause(2000);
      await t.shot('after_close');
      const cards = await queueCards(b);
      t.check('report leaves Reports to Review (closed)', !cards.some((c) => c.text.includes(`Report #${r1}`)), cards.map((c) => c.text).join(' / '));
      await W.openMR1(b, 'ASSET2');
      const left = await b.execute(() => { const x = [...document.querySelectorAll('.modal button')].find((y) => y.innerText.trim().startsWith('Left')); return x ? { text: x.innerText.replace(/\s+/g, ' '), disabled: x.disabled } : null; });
      t.check('ASSET2 Left is free again (report no longer pending)', left && !left.disabled && /Start new report/.test(left.text), left && left.text);
      const dot = await assetTag(b, 'ASSET2');
      t.info('ASSET2 status dot on Select asset', dot);
      await t.shot('asset2_free');
      await b.execute(() => { const x = [...document.querySelectorAll('.modal button')].find((y) => y.innerText.trim() === 'Cancel'); x && x.click(); });
      t.info('status Approved, unit untagged, Minor fault stays Pending', 'stored values checked in Phase 1 (B3 ok); the carry-forward is seen on screen in B5');
    },
  },
  {
    id: 'B4', who: 'Abdulla Qais', title: 'Close & Approve the ASSET1 Pre-Mob report',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.rA10;
      await openFromReview(b, n, 'Endorse');
      const bar = await topBar(b);
      t.check('Close & Approve offered', bar.buttons.includes('Close & Approve Report'), bar.next);
      await click(b, 'Close & Approve Report', { exact: true });
      await b.pause(2000);
      const cards = await queueCards(b);
      t.check('ASSET1 report closed (left the queue)', !cards.some((c) => c.text.includes(`Report #${n}`)), '');
      await t.shot('after_close');
      t.info('status Approved, ASSET1 untagged', 'stored values checked in Phase 1 (B4 ok)');
    },
  },
  {
    id: 'B5', who: 'Suganya Rajendran', title: 'Create and submit Report 2 with five Moderate faults',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET2', 'Left');
      const no = await b.execute(() => { const m = document.body.innerText.match(/Report\s*#\s*(\d+)/); return m ? +m[1] : null; });
      t.shared.reports.r2 = no;
      t.info('Report 2 number in the app', `#${no}`);
      await W.stepTo(b, 'header');
      t.eq('Previous Engine Hours 150 (auto)', await valueOf(b, 'Previous Engine Hours'), '150');
      await choose(b, 'Client', 'Test Client');
      await typeInto(b, 'Location', 'Test Well TW-21');
      await choose(b, 'Compliance Stage', 'PRE-JOB');
      await typeInto(b, 'Pre-Mobilization Checklist ID', 'PMC-2026-0102');
      await typeInto(b, 'Current Engine Hours', '220');
      t.eq('Engine Hours (This Report) 70', await valueOf(b, 'Engine Hours (This Report)'), '70.0');
      await t.shot('header');
      await W.stepTo(b, 'checklist');
      let s = await W.rowState(b, LADDER);
      t.check('Access Ladders & Handrails already Fail with Report 1 text, greyed out', s.status === 'Fail' && s.issue === 'Ladder rung paint worn, needs touch-up.' && s.issueDisabled === true, JSON.stringify([s.status, s.issue, s.issueDisabled]));
      await t.shot('carried_forward');
      for (const [item, iss, act, day, photo] of B5_FAILS) {
        await W.rowButton(b, item, 'Fail');
        await W.rowType(b, item, 0, iss);
        await W.rowType(b, item, 1, act);
        if (day) await W.rowDate(b, item, t.today(day));
        if (photo) await W.attach(b, item, FX(photo));
        const st = await W.rowState(b, item);
        t.check(`${item}: Fail / Moderate / Pending`, st.status === 'Fail' && st.severity === 'Moderate' && st.closure === 'Pending', JSON.stringify([st.status, st.severity, st.closure]));
      }
      await W.rowType(b, LADDER, 1, 'Touch-up paint applied to worn ladder rungs.');
      await W.rowSelect(b, LADDER, 'closure', 'Closed');
      const pop = await W.closeAlert(b);
      s = await W.rowState(b, LADDER);
      t.check('after adding Action taken Suganya can set Access Ladders & Handrails to Closed', !pop && s.closure === 'Closed', pop || s.closure);
      const af = await W.rowState(b, 'Air Filter');
      const r = await W.rowSelect(b, 'Air Filter', 'closure', 'Closed');
      t.check('Air Filter Closed refused for the Operator (list disabled)', r === 'disabled' || af.closureDisabled === true, `${r} / ${af.closureTitle}`);
      await t.shot('fails_entered');
      await W.fillFooter(b, t.today(), { ticks: ['Cleaned', 'Pressure Tested', 'Function Tested'] });
      for (const l of ['Green Tagged', 'Job Ready']) {
        const c = await W.checkState(b, l);
        t.check(`${l} greyed out (report has Moderate faults)`, c && c.disabled && /Set automatically once the Moderate\/Critical fault on this report is reviewed/.test(c.title), c && c.title);
      }
      await t.shot('footer');
      await W.stepTo(b, 'review');
      const rv = await W.reviewState(b);
      t.eq('no issues before submit', rv.issues, []);
      const res = await W.submit(b);
      t.check('Status Submitted', res.ok, res.st.submitText);
      await attention(b, 'My Reports');
      await click(b, `View report #${no}`);
      await b.pause(1800);
      await W.stepTo(b, 'checklist');
      for (const [item, , act, day, photo] of B5_FAILS) {
        const st = await W.rowState(b, item);
        t.check(`${item}: Action Taken read-only with date, time and Suganya Rajendran`, new RegExp(`by Suganya Rajendran: ${act.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(st.text) && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(st.text), st.text.slice(0, 160));
        t.eq(`${item}: date observed`, st.date, t.today(day));
        t.eq(`${item}: photo`, st.attachments, photo ? 1 : 0);
      }
      await t.shot('submitted_checklist');
      t.info('unit stays untagged', 'stored value checked in Phase 1 (B5 ok)');
    },
  },
  {
    id: 'B6', who: 'Abdulla Qais', title: 'Moderate faults cannot be closed directly',
    async run(t) {
      const b = t.browser;
      await openFromReview(b, t.shared.reports.r2, 'Endorse');
      const bar = await topBar(b);
      t.check('Next step bar says endorse this report, with Endorse Report', /endorse this report/i.test(bar.next || '') && bar.buttons.includes('Endorse Report'), bar.next);
      t.check('Close & Approve not offered', !bar.buttons.includes('Close & Approve Report'), '');
      await t.shot('next_step_bar');
    },
  },
  {
    id: 'B7', who: 'Abdulla Qais', title: 'Endorse needs a named reviewer',
    async run(t) {
      const b = t.browser;
      await click(b, 'Endorse Report', { exact: true });
      await b.pause(800);
      const dlg = await b.execute(() => {
        const m = [...document.querySelectorAll('.modal')].find((x) => x.offsetParent !== null && /Escalate to/.test(x.innerText));
        if (!m) return null;
        const btn = [...m.querySelectorAll('button')].find((x) => /Confirm & Endorse/.test(x.innerText));
        return { text: m.innerText.replace(/\s+/g, ' '), disabled: btn.disabled, title: btn.title, options: [...m.querySelector('select').options].map((o) => o.text) };
      });
      t.check('step 1: Confirm & Endorse greyed out; window says select who first', dlg && dlg.disabled && /Select who this is for/.test(dlg.text), dlg && dlg.text.slice(0, 200));
      t.check('hover on the button says the same', dlg && /Select a Maintenance Supervisor \/ FSM first/.test(dlg.title), dlg && dlg.title);
      const names = (dlg ? dlg.options.slice(1) : []).map((o) => o.split(' (')[0].split(' — ')[0].trim());
      t.check('list has reviewers (Disantha, Jan-Albert, Kamil)', ['Disantha Perera', 'Jan-Albert Victorino', 'Kamil Shahzad'].every((n) => names.some((x) => x.startsWith(n))), dlg && dlg.options.join(' | '));
      t.check('Administrator, Operator, Data Miner not listed', !['Jess Britanico', 'Suganya Rajendran', 'Marilyn Tabay'].some((n) => names.some((x) => x.startsWith(n))), '');
      await t.shot('escalate_window');
      await b.execute(() => { document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e')); const m = [...document.querySelectorAll('.modal')].find((x) => /Escalate to/.test(x.innerText)); m.querySelector('select').setAttribute('data-e2e', '1'); });
      const sel = await b.$('[data-e2e="1"]');
      const opt = dlg.options.find((o) => o.startsWith('Disantha Perera'));
      await sel.selectByVisibleText(opt);
      await b.pause(400);
      await click(b, 'Confirm & Endorse');
      await b.pause(2000);
      await t.shot('after_endorse');
      const txt = await t.text(3000);
      t.info('screen after endorse', txt.slice(0, 160).replace(/\n/g, ' / '));
      t.info('status Escalated, five Pending approvals assigned to Disantha', 'stored values checked in Phase 1 (B7 ok); C1 sees them in Disantha\'s Pending Approvals');
    },
  },
  {
    id: 'B8', who: 'Abdulla Qais', title: 'Closing is not offered while decisions are pending',
    async run(t) {
      const b = t.browser;
      const r2 = t.shared.reports.r2;
      const cards = await attention(b, 'Reports to Review');
      if (cards === null) {
        t.check('step 1: ASSET2 report not waiting for Abdulla (no Attention Required tab)', true, 'tab absent');
      } else {
        const q = await queueCards(b);
        t.check('step 1: ASSET2 report not in Reports to Review', !q.some((c) => c.text.includes(`Report #${r2}`)), q.map((c) => c.text).join(' / '));
      }
      await t.shot('step1');
      await W.openMR1(b, 'ASSET2');
      const left = await b.execute(() => { const x = [...document.querySelectorAll('.modal button')].find((y) => y.innerText.trim().startsWith('Left')); return x ? { text: x.innerText.replace(/\s+/g, ' '), disabled: x.disabled } : null; });
      t.check('step 2: no new report; says the Left report is still Escalated and must be closed first', left && left.disabled && /Escalated/.test(left.text), left && left.text);
      await t.shot('step2');
      await b.execute(() => { const x = [...document.querySelectorAll('.modal button')].find((y) => y.innerText.trim() === 'Cancel'); x && x.click(); });
      t.info('step 3 (optional read-only view)', 'not run');
    },
  },
];

async function assetTag(b, code) {
  return b.execute((code) => {
    const c = [...document.querySelectorAll('.asset-select-card')].find((x) => x.querySelector('.asset-select-code')?.innerText.trim() === code);
    const d = c && c.querySelector('.asset-status-dot');
    return d ? (d.title || d.getAttribute('aria-label') || d.className) : null;
  }, code);
}
