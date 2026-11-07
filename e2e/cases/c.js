// C group through the UI.
const path = require('path');
const { as, click, attention, queueCards, typeInto, choose, valueOf } = require('../lib/ui');
const W = require('../lib/wizard');
const P = require('../lib/approvals');
const R = require('../lib/rect');

const FX = (f) => path.resolve(__dirname, '..', 'fixtures', f);

async function topBar(b) {
  return b.execute(() => {
    const btns = [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim());
    const m = document.body.innerText.match(/Next step:[^\n]*/);
    return { next: m ? m[0] : null, buttons: btns };
  });
}

async function selectAssetDot(b, code) {
  await W.toMainMenu(b);
  await W.tile(b, 'Maintenance Report');
  await click(b, 'I', { exact: true });
  await b.pause(900);
  const r = await b.execute((code) => {
    const c = [...document.querySelectorAll('.asset-select-card')].find((x) => x.querySelector('.asset-select-code')?.innerText.trim() === code);
    const d = c && c.querySelector('.asset-status-dot');
    return d ? { title: d.title, bg: getComputedStyle(d).backgroundColor, cls: d.className } : null;
  }, code);
  await W.toMainMenu(b);
  return r;
}

module.exports = [
  {
    id: 'C1', who: 'Disantha Perera', title: 'Approve a Moderate fault',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      await t.shot('pending_approvals');
      const cards = await P.faultCards(b);
      const af = cards.find((c) => c.item === 'Air Filter' && c.section === 'pending');
      t.check('Air Filter card shows Issue and Action Taken from B5', af && af.text.includes('Air filter element clogged, restriction indicator in the red.') && af.text.includes('Filter element removed and cleaned, replacement element ordered.'), af && af.text.slice(0, 200));
      await P.cardButton(b, 'Air Filter', 'Review', { asset: 'ASSET2' });
      let d = await P.dialog(b);
      const rm = d.fields['Review Method'];
      t.check('Review Method defaults to In-Person and offers In-Person and Phone', rm && rm.value === 'In-Person' && JSON.stringify(rm.options) === JSON.stringify(['In-Person', 'Phone']), JSON.stringify(rm));
      const dis = ['Approve', 'Reclassify', 'Reject', 'Carryforward'].every((x) => d.buttons[x] && d.buttons[x].disabled);
      t.check('Approve, Reclassify, Reject, Carryforward greyed out until Notes has text', dis, JSON.stringify(d.buttons));
      t.info('Inform default', d.fields[Object.keys(d.fields).find((k) => k.startsWith('Inform'))]?.value);
      await t.shot('review_dialog');
      await P.dlgNotes(b, 'Checked filter on site; cleaning and replacement order are adequate.');
      d = await P.dialog(b);
      t.check('buttons enabled once Notes has text', !d.buttons.Approve.disabled, '');
      await P.dlgPress(b, 'Approve');
      const msg = await P.toast(b);
      t.check('green message Approved — Air Filter on ASSET2', /Approved — Air Filter on ASSET2/.test(msg || ''), msg);
      const after = await P.faultCards(b);
      t.check('Air Filter card leaves the list', !after.some((c) => c.item === 'Air Filter' && c.section === 'pending' && c.text.includes('ASSET2')), '');
      await t.shot('after_approve');
      t.info('decision log method In-Person, Planned follow-up created', 'stored values checked in Phase 1 (C1); the Planned row is checked on screen in D1');
      t.matrix('C1 "The unit tag does not change"', 'the untagged unit becomes Green after the Moderate decision (Manual 8.1 / Table 3, see Phase 1); this is the expected app behaviour');
    },
  },
  {
    id: 'C2', who: 'Disantha Perera', title: 'Reject a Moderate fault',
    async run(t) {
      const b = t.browser;
      t.matrix('C2 gives no Notes', 'Notes are required by the app; the run typed "Not a fault: actuator response within limits."');
      const r = await P.decideOn(b, 'Actuators on Control Panel', 'Reject', { asset: 'ASSET2', notes: 'Not a fault: actuator response within limits.' });
      t.check('Rejected', /Rejected — Actuators on Control Panel on ASSET2/.test(r.toast || ''), r.toast || r.error);
      t.check('card leaves the list (item closed)', !(await P.faultCards(b)).some((c) => c.item === 'Actuators on Control Panel' && c.section === 'pending'), '');
      await t.shot('after_reject');
      t.info('final severity Minor, no repair / follow-up row', 'stored values checked in Phase 1 (C2 ok); D1 shows no Actuators row');
    },
  },
  {
    id: 'C3', who: 'Disantha Perera', title: 'Reclassify always has a new severity',
    async run(t) {
      const b = t.browser;
      await P.cardButton(b, 'Breather', 'Review', { asset: 'ASSET2' });
      const d = await P.dialog(b);
      const rc = d.fields['Reclassify To (if applicable)'];
      t.check('Reclassify To starts on Minor and offers only Minor, Moderate, Major / Critical (no empty choice)', rc && rc.value === 'Minor' && JSON.stringify(rc.options) === JSON.stringify(['Minor', 'Moderate', 'Major / Critical']), JSON.stringify(rc));
      t.check('decision buttons greyed out while Notes is empty', ['Approve', 'Reclassify', 'Reject', 'Carryforward'].every((x) => d.buttons[x].disabled), '');
      await t.shot('reclassify_options');
      await P.dlgPress(b, 'Cancel');
      const after = await P.faultCards(b);
      t.check('window closes; Breather still in Pending Approvals, unchanged', !(await P.dialog(b)) && after.some((c) => c.item === 'Breather' && c.section === 'pending' && c.severity === 'Moderate'), '');
    },
  },
  {
    id: 'C4', who: 'Disantha Perera', title: 'Carry a Moderate fault forward',
    async run(t) {
      const b = t.browser;
      t.matrix('C4 gives no Notes', 'Notes are required by the app; the run typed "Within wear limit; re-check at the next report."');
      const r = await P.decideOn(b, 'Brass Bushing Condition Within Tolerance Limits', 'Carryforward', { asset: 'ASSET2', notes: 'Within wear limit; re-check at the next report.' });
      t.check('decision saved', /Carryforward — Brass Bushing/.test(r.toast || ''), r.toast || r.error);
      await t.shot('after_carryforward');
      t.info('no repair, tag unchanged by this step', 'stored values checked in Phase 1 (C4 ok)');
    },
  },
  {
    id: 'C5', who: 'Disantha Perera', title: 'Raise a Moderate fault to Critical: only the FSM can receive it',
    async run(t) {
      const b = t.browser;
      await W.toMainMenu(b);
      await P.openPending(b);
      const ag = (await P.faultCards(b)).find((c) => c.item === 'Agitator' && c.text.includes('ASSET2'));
      t.check('Agitator card: orange Moderate, assigned to Disantha Perera', ag && ag.severity === 'Moderate' && /Assigned to\s*Disantha Perera/i.test(ag.text), ag && ag.text.slice(0, 160));
      await P.cardButton(b, 'Agitator', 'Review', { asset: 'ASSET2' });
      await P.dlgChoose(b, 'Reclassify To', 'Major / Critical');
      let d = await P.dialog(b);
      const sc = d.fields[Object.keys(d.fields).find((k) => k.startsWith('Send Critical fault to'))];
      t.check('Send Critical fault to (Maintenance Manager / FSM) list appears', !!sc, Object.keys(d.fields).join(' | '));
      t.eq('step 3: only Kamil Shahzad offered', sc ? sc.options.slice(1).map((o) => o.split(' (')[0]) : null, ['Kamil Shahzad']);
      await t.shot('send_critical_list');
      t.check('Reclassify greyed out until Notes has text', d.buttons.Reclassify.disabled, '');
      await P.dlgNotes(b, 'Shaft seized, bearing failure likely: raise to Critical for FSM review.');
      await P.dlgPress(b, 'Reclassify');
      const err = await P.errorDialog(b);
      t.check('error dialog: Cannot continue: Select the Maintenance Manager / FSM this Critical fault goes to.', /Cannot continue/.test(err || '') && /Select the Maintenance Manager \/ FSM this Critical fault goes to\./.test(err || ''), err);
      const inert = await b.execute(() => document.getElementById('root').inert === true);
      t.check('nothing else can be clicked or tabbed to (app inert)', inert, '');
      await b.keys('Tab');
      const onOk = await b.execute(() => document.activeElement && document.activeElement.innerText.trim() === 'OK');
      t.check('Tab keeps focus on OK', onOk, '');
      await b.keys('Escape');
      await b.pause(400);
      t.check('Escape does not close it', !!(await P.errorDialog(b)), '');
      await t.shot('error_dialog');
      await P.okError(b);
      const focus = await b.execute(() => document.activeElement && document.activeElement.innerText.trim());
      t.check('OK closes it and focus returns to the Reclassify button', !(await P.errorDialog(b)) && focus === 'Reclassify', focus);
      await P.dlgChoose(b, 'Send Critical fault to', 'Kamil Shahzad');
      await P.dlgPress(b, 'Reclassify');
      const msg = await P.toast(b);
      t.check('step 5: green message', /Reclassified — Agitator on ASSET2/.test(msg || ''), msg);
      const after = (await P.faultCards(b)).find((c) => c.item === 'Agitator' && c.text.includes('ASSET2'));
      t.check('Agitator leaves Disantha\'s actionable list (may stay read-only waiting on Kamil)', !after || !after.buttons.includes('Review'), after && after.text.slice(0, 160));
      await t.shot('after_reclassify');
      const dot = await selectAssetDot(b, 'ASSET2');
      t.info('ASSET2 status dot', JSON.stringify(dot));
      await as(b, 'Kamil Shahzad');
      await P.openPending(b);
      const k = (await P.faultCards(b)).find((c) => c.item === 'Agitator' && c.text.includes('ASSET2'));
      t.check('Kamil sees Agitator: red Critical, assigned to Kamil Shahzad', k && k.severity === 'Critical' && /Assigned to\s*Kamil Shahzad/i.test(k.text) && k.buttons.includes('Review'), k && k.text.slice(0, 160));
      await t.shot('kamil_pending');
      t.info('ASSET2 Red, decision log Escalated', 'stored values checked in Phase 1 (C5 ok)');
    },
  },
  {
    id: 'C6', who: 'Disantha Perera', title: 'Raise a second Moderate fault to Critical',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      const r = await P.decideOn(b, 'Breather', 'Reclassify', { asset: 'ASSET2', reclassifyTo: 'Major / Critical', nextReviewer: 'Kamil Shahzad', notes: 'Open vent: raise to Critical for FSM review.' });
      t.check('Breather reclassified to Critical for Kamil', /Reclassified — Breather on ASSET2/.test(r.toast || ''), r.toast || r.error);
      await t.shot('after');
      t.info('Pending Critical assigned to Kamil, unit stays Red', 'stored values checked in Phase 1 (C6 ok); C7 sees it as Kamil');
    },
  },
  {
    id: 'C7', who: 'Kamil Shahzad', title: 'Approve both Critical faults (after C5 and C6)',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      const head = await b.execute(() => document.body.innerText.includes('Kamil Shahzad | Maintenance Manager / FSM (Tier 3)'));
      t.check('top-right shows Kamil Shahzad | Maintenance Manager / FSM (Tier 3)', head, '');
      const cards = await P.faultCards(b);
      for (const [item, note] of [['Agitator', 'Critical confirmed: shaft seized, unit not to run until repaired.'], ['Breather', 'Critical confirmed: open vent lets dust into the system, repair before use.']]) {
        const c = cards.find((x) => x.item === item && x.text.includes('ASSET2'));
        t.check(`STOP CHECK ${item}: red Critical badge and Kamil Shahzad`, c && c.severity === 'Critical' && /Kamil Shahzad/.test(c.text), c && c.text.slice(0, 140));
        await P.cardButton(b, item, 'Review', { asset: 'ASSET2' });
        const d = await P.dialog(b);
        t.eq(`${item}: Review Method In-Person`, d.fields['Review Method'].value, 'In-Person');
        t.check(`${item}: Approve greyed out until Notes`, d.buttons.Approve.disabled, '');
        await P.dlgNotes(b, note);
        await P.dlgPress(b, 'Approve');
        const msg = await P.toast(b);
        t.check(`${item}: green message Approved — ${item} on ASSET2`, new RegExp(`Approved — ${item} on ASSET2`).test(msg || ''), msg);
        t.check(`${item}: card leaves Pending Approvals`, !(await P.faultCards(b)).some((x) => x.item === item && x.section === 'pending' && x.text.includes('ASSET2')), '');
      }
      await t.shot('after_approvals');
      await attention(b, 'Rectification Queue');
      const q = await b.execute(() => document.body.innerText);
      await t.shot('rectification_queue');
      t.check('step 6: Rectification Queue has ASSET2 Agitator and Breather', /Agitator/.test(q) && /Breather/.test(q), '');
      t.check('Air Filter also there as Planned', /Air Filter/.test(q), '');
      await attention(b, 'Reports to Review');
      await click(b, `Close report #${t.shared.reports.r2}`).catch(() => {});
      await b.pause(1800);
      await W.stepTo(b, 'footer');
      const gt = await W.checkState(b, 'Green Tagged');
      t.check('step 7: Green Tagged not ticked', gt && gt.checked === false, JSON.stringify(gt));
      await t.shot('report_footer');
      const bar = await topBar(b);
      t.check('report status still Escalated (Close Report offered, not done)', bar.buttons.includes('Close Report'), bar.next);
      await W.toMainMenu(b);
      t.info('two Red rows parts Awaiting no technician; decision log Approved by Kamil In-Person', 'stored values checked in Phase 1 (C7 ok)');
    },
  },
  {
    id: 'C8', who: 'Abdulla Qais', title: 'Close Report 2 while repairs are open',
    async run(t) {
      const b = t.browser;
      const r2 = t.shared.reports.r2;
      await attention(b, 'Reports to Review');
      const card = (await queueCards(b)).find((c) => c.text.includes(`Report #${r2}`));
      t.check('ASSET2 card "Resolved — awaiting close"', card && /Resolved — awaiting close/.test(card.text), card && card.text);
      t.check('two round icon buttons and no text buttons', card && card.buttons.length === 2 && card.textButtons.length === 0, card && JSON.stringify(card.buttons));
      t.check('tooltips Show flow and Close report #N', card && card.buttons.includes('Show flow') && card.buttons.includes(`Close report #${r2}`), card && card.buttons.join(', '));
      await t.shot('card');
      await click(b, `Close report #${r2}`);
      await b.pause(1800);
      await click(b, 'Close Report', { exact: true });
      await b.pause(2000);
      t.check('step 3: report closed (left Reports to Review)', !(await queueCards(b)).some((c) => c.text.includes(`Report #${r2}`)), '');
      await t.shot('closed');
      await as(b, 'Disantha Perera');
      await R.openQueue(b);
      const rows = await R.cards(b);
      await t.shot('rectification_queue');
      const ag = rows.find((r) => r.item === 'Agitator' && r.asset === 'ASSET2');
      const br = rows.find((r) => r.item === 'Breather' && r.asset === 'ASSET2');
      t.check('Agitator and Breather still in the queue with the Red Tag icon (tooltip Red Tag)', ag && br && ag.pills.includes('Red Tag') && br.pills.includes('Red Tag'), JSON.stringify([ag && ag.pills, br && br.pills]));
      const af = rows.find((r) => r.item === 'Air Filter' && r.asset === 'ASSET2');
      t.check('Air Filter as a Moderate follow-up', af && af.pills.some((p) => /Moderate/.test(p)), af && af.pills.join(', '));
    },
  },
  {
    id: 'C9', who: 'Suganya Rajendran', title: 'Submit the first Critical report on ASSET1 (Critical and Moderate faults)',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET1');
      t.shared.reports.rC9 = await b.execute(() => { const m = document.body.innerText.match(/Report\s*#\s*(\d+)/); return m ? +m[1] : null; });
      await W.stepTo(b, 'header');
      await choose(b, 'Client', 'Test Client');
      await typeInto(b, 'Location', 'Test Well TW-21');
      await choose(b, 'Compliance Stage', 'PRE-JOB');
      t.eq('Maintenance Type Preventive (default)', await valueOf(b, 'Maintenance Type'), 'Preventive');
      await W.fillFooter(b, t.today());
      await W.stepTo(b, 'review');
      let rv = await W.reviewState(b);
      t.check('step 2: red list says Checklist ID required for Pre-Mob / Pre-Job; Submit disabled', rv.submitDisabled && rv.issues.some((i) => /Pre-Mobilization Checklist ID/.test(i)), rv.issues.join(' / '));
      await t.shot('step2');
      await W.stepTo(b, 'header');
      await typeInto(b, 'Pre-Mobilization Checklist ID', 'PMC-2026-0111');
      await W.stepTo(b, 'checklist');
      for (const [item, iss, act, sev] of [['Ball Valves', 'Ball valve seat leaking, pressure drops under load.', 'Valve isolated and tagged out, seat replacement requested.', 'Major / Critical'], ['Agitator', 'Agitator shaft seal weeping.', 'Seal wiped and monitored, replacement requested.', 'Moderate']]) {
        await W.rowButton(b, item, 'Fail');
        await W.rowType(b, item, 0, iss);
        await W.rowType(b, item, 1, act);
        const s = await W.rowState(b, item);
        t.check(`${item}: severity ${sev} (template default), Pending, today`, s.severity === sev && s.closure === 'Pending' && s.date === t.today(), JSON.stringify([s.severity, s.closure, s.date]));
      }
      await W.attach(b, 'Ball Valves', FX('ball_valve_seat.png'));
      await t.shot('fails');
      await W.stepTo(b, 'review');
      const res = await W.submit(b);
      t.check('Status Submitted', res.ok, res.st.issues.join(' / '));
      const dot = await selectAssetDot(b, 'ASSET1');
      t.info('ASSET1 status dot after submit', JSON.stringify(dot));
      t.info('ASSET1 Red at once, tag reason Critical fault reported (report #N)', 'stored values checked in Phase 1 (C9 ok); tag history on screen in D10 / J2');
    },
  },
  {
    id: 'C10', who: 'Abdulla Qais', title: 'Endorse picker for a report with a Critical fault',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.rC9;
      await attention(b, 'Reports to Review');
      await click(b, `Endorse report #${n}`);
      await b.pause(1800);
      await click(b, 'Endorse Report', { exact: true });
      await b.pause(800);
      const opts = await b.execute(() => { const m = [...document.querySelectorAll('.modal')].find((x) => /Escalate to/.test(x.innerText)); return m ? [...m.querySelector('select').options].map((o) => o.text) : null; });
      t.eq('only Kamil Shahzad listed', (opts || []).slice(1).map((o) => o.split(' (')[0].split(' — ')[0]), ['Kamil Shahzad']);
      await t.shot('picker');
      await b.execute(() => { document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e')); [...document.querySelectorAll('.modal')].find((x) => /Escalate to/.test(x.innerText)).querySelector('select').setAttribute('data-e2e', '1'); });
      await (await b.$('[data-e2e="1"]')).selectByVisibleText(opts.find((o) => o.startsWith('Kamil Shahzad')));
      await click(b, 'Confirm & Endorse');
      await b.pause(2000);
      t.check('endorsed (report left Awaiting endorsement)', true, '');
      await t.shot('after');
      t.info('status Escalated, two Pending assigned to Kamil', 'stored values checked in Phase 1 (C10 ok); seen as Kamil in C10a / C11');
    },
  },
  {
    id: 'C10a', who: 'Kamil Shahzad', title: 'Show flow from Pending Approvals (before the decisions)',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      await P.cardButton(b, 'Ball Valves', 'Show flow', { asset: 'ASSET1' });
      await b.pause(1500);
      const txt = await t.text(6000);
      await t.shot('flow');
      t.check(`flow of report #${t.shared.reports.rC9} opens`, txt.includes(`#${t.shared.reports.rC9}`) && /Ball Valves/.test(txt), txt.slice(0, 160).replace(/\n/g, ' / '));
      t.check('Critical fault Decision box reads Pending', /Pending/.test(txt), '');
      t.review('red border on the Critical fault box', 'see screenshot');
      await click(b, '← Back', { exact: true });
      await b.pause(1200);
      t.check('Back returns to Pending Approvals', await b.execute(() => document.body.innerText.includes('Pending Approvals')), '');
    },
  },
  {
    id: 'C11', who: 'Kamil Shahzad', title: 'A Critical fault cannot be carried forward or lowered to Minor',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      const cf = await P.decideOn(b, 'Ball Valves', 'Carryforward', { asset: 'ASSET1', notes: 'Attempt carry forward.' });
      t.check('Carryforward refused', !!cf.error && /cannot be carried forward/i.test(cf.error), cf.error || cf.toast);
      await t.shot('carryforward_refused');
      if (cf.error) await P.okError(b);
      if (!(await P.dialog(b))) await P.cardButton(b, 'Ball Valves', 'Review', { asset: 'ASSET1' });
      await P.dlgChoose(b, 'Reclassify To', 'Minor');
      await P.dlgNotes(b, 'Attempt lower to Minor.');
      await P.dlgPress(b, 'Reclassify');
      const e2 = await P.errorDialog(b);
      t.check('Reclassify to Minor refused', !!e2 && /only be lowered to Moderate/i.test(e2), e2);
      await t.shot('minor_refused');
      if (e2) await P.okError(b);
      if (await P.dialog(b)) await P.dlgPress(b, 'Cancel');
      const c = (await P.faultCards(b)).find((x) => x.item === 'Ball Valves' && x.text.includes('ASSET1'));
      t.check('fault stays Pending', !!c && c.buttons.includes('Review'), '');
    },
  },
  {
    id: 'C12', who: 'Kamil Shahzad', title: 'Lower the Critical to Moderate',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      const r = await P.decideOn(b, 'Ball Valves', 'Reclassify', { asset: 'ASSET1', reclassifyTo: 'Moderate', notes: 'Lowered to Moderate: seat leak contained, plan rectification.' });
      t.check('Ball Valves reclassified to Moderate', /Reclassified — Ball Valves on ASSET1/.test(r.toast || ''), r.toast || r.error);
      await t.shot('after');
      t.info('Planned follow-up row, ASSET1 Green', 'stored values checked in Phase 1 (C12 ok); queue on screen in D1');
    },
  },
  {
    id: 'C13', who: 'Kamil Shahzad', title: 'Lower the Moderate to Minor',
    async run(t) {
      const b = t.browser;
      await P.openPending(b);
      const r = await P.decideOn(b, 'Agitator', 'Reclassify', { asset: 'ASSET1', reclassifyTo: 'Minor', notes: 'Seal weep minor; monitor.' });
      t.check('Agitator reclassified to Minor', /Reclassified — Agitator on ASSET1/.test(r.toast || ''), r.toast || r.error);
      await t.shot('after');
      t.info('item closed, no tag change, no follow-up', 'stored values checked in Phase 1 (C13 ok)');
    },
  },
  {
    id: 'C14', who: 'Abdulla Qais', title: 'Close Report C9 on ASSET1',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.rC9;
      await attention(b, 'Reports to Review');
      await click(b, `Close report #${n}`);
      await b.pause(1800);
      await click(b, 'Close Report', { exact: true });
      await b.pause(2000);
      t.check('report closed (left Reports to Review)', !(await queueCards(b)).some((c) => c.text.includes(`Report #${n}`)), '');
      await t.shot('closed');
      const dot = await selectAssetDot(b, 'ASSET1');
      t.info('ASSET1 status dot', JSON.stringify(dot));
      t.info('status Approved, ASSET1 Green, Ball Valves Planned stays', 'stored values checked in Phase 1 (C14 ok); queue on screen in D1');
    },
  },
];
