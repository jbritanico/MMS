// F group through the UI.
const path = require('path');
const { as, click, attention, queueCards, typeInto, choose, valueOf } = require('../lib/ui');
const W = require('../lib/wizard');
const P = require('../lib/approvals');
const A = require('../lib/assets');
const F = require('../lib/flow');
const { itRow } = require('../lib/it');

const FX = (f) => path.resolve(__dirname, '..', 'fixtures', f);
const AH = 'Air Hose & Coupling Connection';
const CD = 'Chain & Drive System';
const BV = 'Ball Valves';
const reportNo = (b) => b.execute(() => { const m = document.body.innerText.match(/Report\s*#\s*(\d+)/); return m ? +m[1] : null; });

async function endorseTo(b, n, who) {
  await attention(b, 'Reports to Review');
  await click(b, `Endorse report #${n}`);
  await b.pause(1800);
  await click(b, 'Endorse Report', { exact: true });
  await b.execute(() => { document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e')); [...document.querySelectorAll('.modal')].find((x) => /Escalate to/.test(x.innerText)).querySelector('select').setAttribute('data-e2e', '1'); });
  const opt = (await b.execute(() => [...document.querySelector('[data-e2e="1"]').options].map((o) => o.text))).find((o) => o.startsWith(who));
  await (await b.$('[data-e2e="1"]')).selectByVisibleText(opt);
  await click(b, 'Confirm & Endorse');
  await b.pause(1800);
}

// Tick "Repaired on site" in the row with a real click; returns the wizard message shown (if any).
async function tickRepaired(b, item) {
  await W.row(b, item);
  await b.execute(() => {
    document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e'));
    const l = [...document.querySelectorAll('label')].find((x) => x.offsetParent !== null && /Repaired on site/.test(x.innerText) && (x.closest('[data-e2e-row="1"]') || (document.querySelector('[data-e2e-row="1"]').nextElementSibling || {}).contains?.(x)));
    l.querySelector('input').setAttribute('data-e2e', '1');
  });
  await (await b.$('[data-e2e="1"]')).click();
  await b.pause(900);
  return b.execute(() => { const t = [...document.querySelectorAll('.toast')].find((x) => x.offsetParent !== null); return t ? t.innerText.trim() : null; });
}

module.exports = [
  {
    id: 'F1', who: 'Suganya Rajendran', title: 'Submit Report F1 (ASSET1) with two Moderate faults',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET1');
      const n = await reportNo(b);
      t.shared.reports.rF1 = n;
      await W.stepTo(b, 'header');
      await choose(b, 'Client', 'Test Client');
      await typeInto(b, 'Location', 'Test Well TW-21');
      await choose(b, 'Compliance Stage', 'PRE-JOB');
      await typeInto(b, 'Pre-Mobilization Checklist ID', 'PMC-2026-0112');
      await W.stepTo(b, 'checklist');
      for (const [item, iss, act, day] of [[AH, 'Coupling connection leaking at the 3,000 psi test.', 'Coupling retightened, leak persists at 3,000 psi; hose replacement requested.', -1], [CD, 'Chain link stretched, roller seized on drive side.', 'Chain lubricated and adjusted, replacement requested.', 0]]) {
        await W.rowButton(b, item, 'Fail');
        await W.rowType(b, item, 0, iss);
        await W.rowType(b, item, 1, act);
        if (day) await W.rowDate(b, item, t.today(day));
        const s = await W.rowState(b, item);
        t.eq(`${item}: Moderate (template default), Pending`, [s.severity, s.closure, s.date], ['Moderate', 'Pending', t.today(day)]);
      }
      await W.fillFooter(b, t.today());
      await W.stepTo(b, 'review');
      const res = await W.submit(b);
      t.check('submitted', res.ok, res.st.issues.join(' / '));
      await as(b, 'Abdulla Qais');
      await endorseTo(b, n, 'Disantha Perera');
      t.info('Escalated with two Pending approvals for Disantha', 'seen in Disantha\'s Pending Approvals in F3 / F4; stored values checked in Phase 1 (F1 ok)');
      t.eq('ASSET1 stays Green', (await A.tagOf(b, 'ASSET1')).tag, 'Green');
    },
  },
  {
    id: 'F2', who: 'Kamil Shahzad', title: 'Send a reminder on a Pending fault',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      await P.cardButton(b, AH, 'Send Reminder', { asset: 'ASSET1' });
      const msg = await P.toast(b);
      t.check('reminder sent', /Reminder sent to Disantha Perera/.test(msg || ''), msg);
      const c = (await P.faultCards(b)).find((x) => x.item === AH && x.text.includes('ASSET1'));
      t.check('row shows Reminder from Kamil Shahzad with the time', c && /Reminder from Kamil Shahzad · \S+/.test(c.text), c && c.text.slice(0, 260));
      await t.shot('reminder');
    },
  },
  {
    id: 'F3', who: 'Disantha Perera', title: 'Approve and name a person to be informed',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      const r = await P.decideOn(b, CD, 'Approve', { asset: 'ASSET1', inform: 'Kamil Shahzad', notes: 'Approved: replace chain at next planned maintenance.' });
      t.check('Decision Approved', /Approved — Chain & Drive System on ASSET1/.test(r.toast || ''), r.toast || r.error);
      await t.shot('approved');
      await as(b, 'Kamil Shahzad');
      await P.openPending(b);
      const ack = (await P.faultCards(b)).find((x) => x.item === CD && x.section === 'other' && x.buttons.includes('Acknowledge'));
      t.check('an acknowledgement is queued for Kamil Shahzad', !!ack, ack && ack.text.slice(0, 160));
      await t.shot('kamil_needs_ack');
    },
  },
  {
    id: 'F4', who: 'Abdulla Qais', title: 'Phone relay is recorded as Provisional',
    async run(t) {
      const b = t.browser;
      const cards = await attention(b);
      const viaMenu = !!cards && cards.some((x) => x.name === 'Pending Approvals');
      t.check('Abdulla can open Pending Approvals from the main menu', viaMenu, cards ? cards.map((x) => x.name).join(', ') : 'no Attention Required tab');
      if (!viaMenu) {
        t.info('cause', 'MainMenu.tsx:203 shows the Pending Approvals card only for mri.close_defect or mri.approve; the Job Supervisor holds mri.record_provisional (phone relay) only. Proposed fix (not applied): add effectivePermissions.includes("mri.record_provisional") to canReviewApprovals.');
        await t.shot('no_pending_approvals_entry');
        // Reachable another way: report flow -> fault box -> Open Pending Approvals.
        await F.openReportFlowVia(b, 'ASSET1', t.shared.reports.rF1);
        const list = await F.nodes(b);
        await F.select(b, F.find(list, AH));
        await click(b, 'Open Pending Approvals', { exact: true });
        await b.pause(1500);
        t.info('route used to continue', 'Asset Registry > ASSET1 Show history flow > Report box > Show flow of this report > Air Hose fault box > Open Pending Approvals');
      } else {
        await P.openPending(b);
        const all = await P.faultCards(b);
        const extra = all.filter((x) => x.buttons.some((y) => !['Show flow', 'Record (Phone Relay)'].includes(y)));
        t.check('Pending Approvals shows Abdulla only what he can act on (Record (Phone Relay) + read-only Show flow)', all.length > 0 && extra.length === 0, extra.map((x) => `${x.item}: ${x.buttons.join('/')}`).join(' | ') || `${all.length} card(s)`);
        const heads = await b.execute(() => [...document.querySelectorAll('h1')].filter((h) => h.offsetParent !== null).map((h) => h.innerText.trim()));
        t.check('no Awaiting Confirmation or Needs Acknowledgment section for the Job Supervisor', !heads.some((h) => /Awaiting Confirmation|Needs Acknowledgment/.test(h)), heads.join(', '));
        await t.shot('pending_approvals_job_supervisor');
      }
      const c = (await P.faultCards(b)).find((x) => x.item === AH && x.text.includes('ASSET1'));
      t.check('Abdulla is offered Record (Phone Relay), not Approve / Reject buttons', c && c.buttons.includes('Record (Phone Relay)') && !c.buttons.includes('Review'), c && c.buttons.join(', '));
      await P.cardButton(b, AH, 'Record (Phone Relay)', { asset: 'ASSET1' });
      let d = await P.dialog(b);
      t.check('Review Method fixed to Phone', d.fields['Review Method'] && d.fields['Review Method'].value === 'Phone' && d.fields['Review Method'].disabled, JSON.stringify(d.fields['Review Method']));
      await t.shot('relay_dialog');
      await P.dlgChoose(b, 'Escalate To', 'Disantha Perera');
      await P.dlgNotes(b, 'Approve, relayed by phone from Disantha Perera.');
      await P.dlgPress(b, 'Approve');
      const msg = await P.toast(b);
      t.check('relay recorded', /Approved — Air Hose & Coupling Connection on ASSET1/.test(msg || ''), msg || (await P.errorDialog(b)));
      const n = t.shared.reports.rF1;
      const row = itRow(`SELECT provisional_status, review_method, reviewer, recorded_by FROM mri_fault_approvals WHERE report_id=${n} AND decision='Approved' AND review_method='Phone'`);
      t.eq('decision shows Provisional (Phone, for Disantha, recorded by Abdulla)', row && [row.provisional_status, row.reviewer, row.recorded_by], ['Provisional', 'Disantha Perera', 'Abdulla Qais']);
      const rtr = await attention(b, 'Reports to Review').catch(() => null);
      const q = rtr === null ? [] : await queueCards(b);
      const rc = q.find((x) => x.text.includes(`Report #${n}`));
      if (!rc) {
        t.check('close refused while a decision is Provisional (report not offered for closing)', true, 'report not in Reports to Review');
      } else {
        await click(b, rc.buttons.find((x) => /report #/.test(x)));
        await b.pause(1800);
        await click(b, 'Close Report', { exact: true }).catch(() => {});
        await b.pause(1500);
        const txt = await t.text(3000);
        t.check('close refused while a decision is Provisional', /confirm/i.test(txt) && (await queueCards(b).catch(() => [])).length >= 0, (txt.match(/[^\n]*confirm[^\n]*/i) || [''])[0]);
      }
      await t.shot('close_check');
    },
  },
  {
    id: 'F5', who: 'Disantha Perera', title: 'Confirm the provisional decision',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      const c = (await P.faultCards(b)).find((x) => x.item === AH && x.buttons.includes('Confirm'));
      t.check('provisional decision listed under Awaiting Confirmation', !!c, c && c.text.slice(0, 160));
      await P.cardButton(b, AH, 'Confirm', { asset: 'ASSET1', section: 'any' });
      const msg = await P.toast(b);
      t.check('Confirmed', /Confirmed — Air Hose & Coupling Connection on ASSET1/.test(msg || ''), msg);
      const row = itRow(`SELECT provisional_status, confirmed_by, confirmed_date FROM mri_fault_approvals WHERE report_id=${t.shared.reports.rF1} AND review_method='Phone'`);
      t.check('status Confirmed with name and date', row && row.provisional_status === 'Confirmed' && row.confirmed_by === 'Disantha Perera' && !!row.confirmed_date, JSON.stringify(row));
      await t.shot('confirmed');
    },
  },
  {
    id: 'F6', who: 'Abdulla Qais', title: 'Close without waiting for the acknowledgement',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.rF1;
      await attention(b, 'Reports to Review');
      await click(b, `Close report #${n}`);
      await b.pause(1800);
      await click(b, 'Close Report', { exact: true });
      await b.pause(2000);
      t.check('Status Approved (closed) although Kamil has not acknowledged', !(await queueCards(b)).some((c) => c.text.includes(`Report #${n}`)), '');
      const row = itRow(`SELECT status FROM mri_reports WHERE id=${n}`);
      t.eq('stored status', row && row.status, 'Approved');
      await t.shot('closed');
    },
  },
  {
    id: 'F7', who: 'Kamil Shahzad', title: 'Acknowledge the decision',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      await P.cardButton(b, CD, 'Acknowledge', { asset: 'ASSET1', section: 'any' });
      const msg = await P.toast(b);
      t.check('acknowledged', /Acknowledged — Chain & Drive System on ASSET1/.test(msg || ''), msg);
      const row = itRow(`SELECT acknowledged_by, acknowledged_date FROM mri_fault_approvals WHERE report_id=${t.shared.reports.rF1} AND decision='Approved' AND review_method='In-Person'`);
      t.check('name and date recorded', row && row.acknowledged_by === 'Kamil Shahzad' && !!row.acknowledged_date, JSON.stringify(row));
      const again = (await P.faultCards(b)).some((x) => x.item === CD && x.buttons.includes('Acknowledge'));
      t.check('a second attempt is not possible (entry leaves Needs Acknowledgment)', !again, '');
      t.info('server refusal "already acknowledged"', 'checked in Phase 1 (F7 ok); the screen no longer offers the button');
      await t.shot('acknowledged');
    },
  },
  {
    id: 'F8', who: 'Disantha Perera', title: 'Decision log',
    async run(t) {
      const b = t.browser;
      // Report 2 is closed, so its flow is reached through ASSET2's asset history flow.
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2);
      const list = await F.nodes(b);
      const i = F.decisionFor(list, 'Breather');
      await F.select(b, i);
      const d = await F.detail(b);
      await t.shot('breather_decision');
      const audits = d.rows.filter((r) => /^Audit \d+/.test(r[0]));
      t.check('log lists the decisions in order (Escalated, then Approved)', audits.length >= 2 && /Escalated/.test(audits[0][0]) && /Approved/.test(audits[audits.length - 1][0]), audits.map((x) => x[0]).join(' | '));
      t.check('each row: reviewer, method, provisional flag, recorder', audits.every((a) => /In-Person|Phone/.test(a[1]) && /by|recorded/i.test(a[1])), audits.map((x) => x[1]).join(' | ').slice(0, 300));
      if (!audits.some((a) => /Pending/.test(a[0]))) t.matrix('F8 expects Pending, Escalated, Approved', 'the log starts at Escalated: endorsing creates the Pending approval but does not log it (also seen in Phase 1)');
      t.check('cannot be edited (no edit control)', !d.buttons.some((x) => /Edit/i.test(x.text)), d.buttons.map((x) => x.text).join(', '));
    },
  },
  {
    id: 'F9', who: 'Suganya Rajendran', title: 'Critical repaired on site: no Red tag, no review',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET1');
      const n = await reportNo(b);
      t.shared.reports.rF9 = n;
      await W.stepTo(b, 'header');
      await choose(b, 'Client', 'Test Client');
      await typeInto(b, 'Location', 'Test Well TW-21');
      await choose(b, 'Compliance Stage', 'POST JOB');
      await typeInto(b, 'Job Number', 'JSR-2026-0163');
      await typeInto(b, 'Job Operating Hours', '10');
      await W.stepTo(b, 'checklist');
      await W.rowButton(b, BV, 'Fail');
      let m = await tickRepaired(b, BV);
      t.check('tick refused: Add issue details before marking this fault as repaired on site', /Add issue details before marking this fault as repaired on site/.test(m || ''), m);
      await W.rowType(b, BV, 0, 'Ball valve seat replaced on site during job.');
      await b.pause(5200);
      m = await tickRepaired(b, BV);
      t.check('tick refused: Describe the repair in Action Taken first', /Describe the repair in Action Taken first/.test(m || ''), m);
      await W.rowType(b, BV, 1, 'Seat replaced and function test performed at 3,000 psi.');
      await b.pause(5200);
      m = await tickRepaired(b, BV);
      const s = await W.rowState(b, BV);
      t.check('tick accepted and the item shows Closed', s.closure === 'Closed' && !/err/.test(m || ''), JSON.stringify([s.closure, m]));
      await W.attach(b, BV, FX('ball_valve_repair.png'));
      await t.shot('repaired_on_site');
      await W.fillFooter(b, t.today());
      await W.stepTo(b, 'review');
      const res = await W.submit(b);
      t.check('step 2: Submitted', res.ok, res.st.issues.join(' / '));
      t.eq('ASSET1 stays Green', (await A.tagOf(b, 'ASSET1')).tag, 'Green');
      const st = itRow(`SELECT r.date_observed, (SELECT COUNT(*) FROM mri_report_attachments a WHERE a.report_id=r.report_id AND a.template_checklist_item_id=r.template_checklist_item_id) AS photos FROM mri_report_checklist_results r JOIN template_checklist_items x ON x.id=r.template_checklist_item_id JOIN checklist_databank c ON c.id=x.checklist_item_id WHERE r.report_id=${n} AND c.description='Ball Valves'`);
      t.check('photo still attached, Date Observed today', st && st.photos === 1 && st.date_observed === t.today(), JSON.stringify(st));
      await as(b, 'Abdulla Qais');
      await attention(b, 'Reports to Review');
      await click(b, `Endorse report #${n}`);
      await b.pause(1800);
      const btns = await b.execute(() => [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim()));
      t.check('step 3: Close & Approve available without escalation (not pressed)', btns.includes('Close & Approve Report') && !btns.includes('Endorse Report'), btns.filter(Boolean).join(', '));
      await t.shot('close_and_approve_offered');
      const log = itRow(`SELECT COUNT(*) AS n FROM mri_onsite_repair_log l JOIN template_checklist_items x ON x.id=l.template_checklist_item_id JOIN checklist_databank c ON c.id=x.checklist_item_id WHERE l.report_id=${n} AND c.description='Ball Valves'`);
      t.eq('IT check: mri_onsite_repair_log has one row', log && log.n, 1);
      await W.toMainMenu(b);
    },
  },
];
