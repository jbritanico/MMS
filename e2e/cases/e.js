// E group through the UI ("IT runs the SQL" steps use e2e/lib/it.js on the test database).
const path = require('path');
const { as, click, attention, queueCards, typeInto, choose, valueOf } = require('../lib/ui');
const W = require('../lib/wizard');
const P = require('../lib/approvals');
const R = require('../lib/rect');
const A = require('../lib/assets');
const { itSql, itRow } = require('../lib/it');

const FX = (f) => path.resolve(__dirname, '..', 'fixtures', f);
const ASL = 'Air Supply Line';
const MATRIX_DELETE = "DELETE FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2')";

const reportNo = (b) => b.execute(() => { const m = document.body.innerText.match(/Report\s*#\s*(\d+)/); return m ? +m[1] : null; });

function triggers() {
  const [r] = itSql("SELECT trigger_type, running_value, interval_value, warning_value FROM maintenance_triggers WHERE asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2') AND mr_level='MR-II' AND enabled=1");
  const o = {}; for (const x of r.rows) o[x.trigger_type] = x; return o;
}

async function chips(b, code) {
  await W.toMainMenu(b);
  await W.tile(b, 'Maintenance Report');
  await click(b, 'I', { exact: true });
  await b.pause(900);
  const c = await b.execute((code) => {
    const card = [...document.querySelectorAll('.asset-select-card')].find((x) => x.querySelector('.asset-select-code')?.innerText.trim() === code);
    return card ? [...card.querySelectorAll('.trigger-icon-chip')].map((x) => `${x.title} ${x.innerText.trim()}`) : [];
  }, code);
  return c;
}

// The matrix's "IT deletes the Draft" SQL; when it fails (child rows + foreign keys), record a
// matrix issue and delete the Draft properly so the next case starts as the matrix intends.
function itDeleteDraft(t) {
  const [r] = itSql(MATRIX_DELETE);
  if (r.ok) { t.info('IT deletes the Draft (matrix SQL)', `${r.changed} row(s)`); return; }
  t.matrix('IT delete SQL fails as written', `"${MATRIX_DELETE}" -> ${r.error}. The run deleted the Draft's child rows first.`);
  const sub = "(SELECT id FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2'))";
  const res = itSql(...['mri_report_header_values', 'mri_report_checklist_results', 'mri_report_mid_values', 'mri_report_footer_values', 'mri_report_attachments', 'mri_checklist_action_log'].map((x) => `DELETE FROM ${x} WHERE report_id IN ${sub}`), MATRIX_DELETE);
  t.info('corrected cleanup', JSON.stringify(res.map((x) => x.changed ?? x.error)));
}

async function fillAndSubmit(t, b, { stage, pmc, job, current, km, joh, client = 'Test Client', location }) {
  await W.stepTo(b, 'header');
  await choose(b, 'Client', client);
  await typeInto(b, 'Location', location || (/POST|PRE-JOB/.test(stage) ? 'Test Well TW-21' : 'Karachi Yard'));
  await choose(b, 'Compliance Stage', stage);
  if (pmc) await typeInto(b, 'Pre-Mobilization Checklist ID', pmc);
  if (job) await typeInto(b, 'Job Number', job);
  if (joh) await typeInto(b, 'Job Operating Hours', joh);
  if (current) await typeInto(b, 'Current Engine Hours', current);
  if (km) {
    await W.stepTo(b, 'distance');
    const lab = await b.execute(() => { const l = [...document.querySelectorAll('label')].find((x) => x.offsetParent !== null && /Distance Travelled Post-Job \(KM\)/.test(x.innerText)); return l ? l.innerText.trim() : null; });
    if (lab) await typeInto(b, lab, km); else t.info('Post-Job KM field', 'not shown on this step');
  }
  await W.fillFooter(b, t.today());
  await W.stepTo(b, 'review');
}

async function trySubmit(b) {
  const st = await W.reviewState(b);
  if (st.submitDisabled) return { ok: false, text: st.issues.join(' / '), issues: st.issues };
  await click(b, 'Submit Report');
  await b.pause(2000);
  const txt = await b.execute(() => document.body.innerText);
  const ok = txt.includes('Report submitted');
  if (ok) { await click(b, 'OK', { exact: true }); await b.pause(1000); }
  return { ok, text: (txt.match(/[^\n]*(exemption|required|refused|cannot)[^\n]*/i) || [''])[0], issues: st.issues };
}

async function closeAsAbdulla(t, b, n, closeLabel) {
  await as(b, 'Abdulla Qais');
  await attention(b, 'Reports to Review');
  const card = (await queueCards(b)).find((c) => c.text.includes(`Report #${n}`));
  const btn = card && card.buttons.find((x) => /report #/.test(x));
  if (!btn) throw new Error(`report #${n} not in Reports to Review`);
  await click(b, btn);
  await b.pause(1800);
  await click(b, closeLabel || 'Close & Approve Report', { exact: true });
  await b.pause(2000);
  return !(await queueCards(b)).some((c) => c.text.includes(`Report #${n}`));
}

module.exports = [
  {
    id: 'E1', title: 'Load a cached open-job list',
    async run(t) {
      const [r] = itSql("INSERT OR REPLACE INTO open_job_numbers (job_number, downloaded_at) VALUES ('JSR-2026-0900', datetime('now'))");
      t.check('IT SQL ran', r.ok, r.error || `${r.changed} row`);
      const [q] = itSql('SELECT job_number FROM open_job_numbers');
      t.eq('the list holds one job number, JSR-2026-0900', q.rows.map((x) => x.job_number), ['JSR-2026-0900']);
    },
  },
  {
    id: 'E2', who: 'Suganya Rajendran', title: 'Post Job report with a Critical fault',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET2', 'Left');
      t.shared.reports.rE2 = await reportNo(b);
      await W.stepTo(b, 'header');
      const prev = await valueOf(b, 'Previous Engine Hours');
      t.check('Previous Engine Hours 220 (auto)', parseFloat(prev) === 220, prev);
      await W.stepTo(b, 'checklist');
      await W.rowButton(b, ASL, 'Fail');
      await W.rowType(b, ASL, 0, 'Air supply line fitting cracked, supply pressure dropping.');
      await W.rowType(b, ASL, 1, 'Line isolated and depressurised, fitting replacement requested. Not repaired on site.');
      await W.attach(b, ASL, FX('air_line_fitting.png'));
      const s = await W.rowState(b, ASL);
      t.eq('Air Supply Line Fail / Major / Critical / Pending', [s.status, s.severity, s.closure], ['Fail', 'Major / Critical', 'Pending']);
      await fillAndSubmit(t, b, { stage: 'POST JOB', current: '370', km: '300', joh: '12' });
      await W.stepTo(b, 'header');
      t.eq('Engine Hours (This Report) reads 150', await valueOf(b, 'Engine Hours (This Report)'), '150.0');
      await W.stepTo(b, 'review');
      let r = await trySubmit(b);
      t.check('step 2: refused, Job Number is required for POST JOB', !r.ok && /Job Number/i.test(r.text + r.issues.join(' ')), r.text || r.issues.join(' / '));
      await t.shot('job_number_refused');
      await W.stepTo(b, 'header');
      await typeInto(b, 'Job Number', 'JSR-2026-0142');
      await W.stepTo(b, 'review');
      r = await trySubmit(b);
      t.check('step 3: Submitted', r.ok, r.text);
      const tg = await A.tagOf(b, 'ASSET2');
      t.eq('ASSET2 turns Red at once', tg.tag, 'Red');
      t.check('reason Critical fault reported', /Critical fault reported/.test(tg.reason), tg.reason);
      const row = itRow(`SELECT job_number_status FROM mri_reports WHERE id=${t.shared.reports.rE2}`);
      t.eq('IT check: job_number_status', row && row.job_number_status, 'Not on open-job list - supervisor to check');
    },
  },
  {
    id: 'E3', who: 'Abdulla Qais', title: 'Escalate and approve the Critical fault',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.rE2;
      await attention(b, 'Reports to Review');
      await click(b, `Endorse report #${n}`);
      await b.pause(1800);
      await click(b, 'Endorse Report', { exact: true });
      await b.execute(() => { document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e')); [...document.querySelectorAll('.modal')].find((x) => /Escalate to/.test(x.innerText)).querySelector('select').setAttribute('data-e2e', '1'); });
      const opt = (await b.execute(() => [...document.querySelector('[data-e2e="1"]').options].map((o) => o.text))).find((o) => o.startsWith('Kamil Shahzad'));
      await (await b.$('[data-e2e="1"]')).selectByVisibleText(opt);
      await click(b, 'Confirm & Endorse');
      await b.pause(1500);
      await as(b, 'Kamil Shahzad');
      await P.openPending(b);
      const d = await P.decideOn(b, ASL, 'Approve', { asset: 'ASSET2', notes: 'Critical confirmed: replace the fitting before use.' });
      t.check('Kamil approves Air Supply Line', /Approved — Air Supply Line on ASSET2/.test(d.toast || ''), d.toast || d.error);
      await R.openQueue(b);
      const c = (await R.cards(b)).find((x) => x.item === ASL && x.asset === 'ASSET2');
      t.check('a Red repair is created', c && c.pills.includes('Red Tag'), c && c.pills.join(', '));
      await t.shot('red_repair');
      t.eq('ASSET2 stays Red', (await A.tagOf(b, 'ASSET2')).tag, 'Red');
    },
  },
  {
    id: 'E4', who: 'Abdulla Qais', title: 'Close the Post Job report and check the MR-II triggers',
    async run(t) {
      const b = t.browser;
      const ca0 = triggers().CA;
      const closed = await closeAsAbdulla(t, b, t.shared.reports.rE2, 'Close Report');
      t.check('Status Approved (closed)', closed, '');
      const tr = triggers();
      t.eq('EH 370 of 400', [tr.EH.running_value, tr.EH.interval_value], [370, 400]);
      t.check('EH in warning (>= 350)', tr.EH.running_value >= tr.EH.warning_value && tr.EH.running_value < tr.EH.interval_value, '');
      t.eq('KM 600 of 1000', [tr.KM.running_value, tr.KM.interval_value], [600, 1000]);
      t.eq('OH 0 -> 12', tr.OH.running_value, 12);
      t.eq('CA unchanged', tr.CA.running_value, ca0.running_value);
      const ch = await chips(b, 'ASSET2');
      t.info('triggers shown on the ASSET2 card', ch.join(' | '));
      await t.shot('trigger_chips');
      await W.toMainMenu(b);
      t.eq('ASSET2 stays Red', (await A.tagOf(b, 'ASSET2')).tag, 'Red');
    },
  },
  {
    id: 'E5', who: 'Suganya Rajendran', title: 'Red unit: Pre-Mob is refused without an exemption',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET2', 'Left');
      t.shared.reports.rE5 = await reportNo(b);
      await fillAndSubmit(t, b, { stage: 'PREMOB', pmc: 'PMC-2026-0090' });
      const r = await trySubmit(b);
      await t.shot('refused');
      t.check('refused: no valid MOC exemption (Manual 6.1.5)', !r.ok && /MOC exemption/i.test(r.text), r.text);
    },
  },
  {
    id: 'E6', who: 'Suganya Rajendran', title: 'Red unit: Pre-Job is refused too',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET2', 'Left');
      await W.stepTo(b, 'header');
      await choose(b, 'Compliance Stage', 'PRE-JOB');
      await W.stepTo(b, 'review');
      const r = await trySubmit(b);
      await t.shot('refused');
      t.check('refused for the same reason', !r.ok && /MOC exemption/i.test(r.text), r.text);
    },
  },
  {
    id: 'E7', who: 'Kamil Shahzad', title: 'Record a MOC exemption and submit',
    async run(t) {
      const b = t.browser;
      await A.openAsset(b, 'ASSET2');
      let p = await A.exemptionPanel(b);
      t.check('exemption area shows No valid exemption and Record exemption', p && /No valid exemption/.test(p.text) && p.buttons.includes('Record exemption'), p && p.text.slice(0, 150));
      await click(b, 'Record exemption', { exact: true });
      t.matrix('E7 gives no "Conditions for return to service"', 'the app requires it; the run typed "Air supply line repaired and verified."');
      const put = async (ph, v) => { await b.execute((ph) => { document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e')); [...document.querySelectorAll('input, textarea')].find((x) => x.placeholder === ph).setAttribute('data-e2e', '1'); }, ph); const el = await b.$('[data-e2e="1"]'); await el.click(); await b.keys(v.split('')); };
      await put('MOC reference', 'MOC-2026-014');
      await put('Approved by', 'Kamil Shahzad');
      await put('Equipment limitations', 'Operate below 50% pump rate, air supply line monitored.');
      await put('Required controls', 'Supervisor on location, daily valve check.');
      await put('Conditions for return to service', 'Air supply line repaired and verified.');
      await b.execute((iso) => { const els = [...document.querySelectorAll('label')].filter((l) => /Valid until/.test(l.innerText)).map((l) => l.querySelector('input')); const e = els[0]; const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, iso); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, t.today(7));
      await t.shot('exemption_form');
      await click(b, 'Save exemption', { exact: true });
      await b.pause(1500);
      p = await A.exemptionPanel(b);
      await t.shot('exemption_saved');
      t.check('exemption saved and shown Active (valid)', p && /MOC-2026-014 — Active \(valid\)/.test(p.text) && /Exemption valid until/.test(p.text), p && p.text.slice(0, 250));
      await as(b, 'Suganya Rajendran');
      await W.openMR1(b, 'ASSET2', 'Left');
      await W.stepTo(b, 'header');
      await choose(b, 'Compliance Stage', 'PREMOB');
      t.eq('Checklist ID kept', await valueOf(b, 'Pre-Mobilization Checklist ID'), 'PMC-2026-0090');
      await W.stepTo(b, 'review');
      const r = await trySubmit(b);
      t.check('the Pre-Mob report submits', r.ok, r.text);
    },
  },
  {
    id: 'E8', who: 'Abdulla Qais', title: 'Close the Pre-Mob report',
    async run(t) {
      const ok = await closeAsAbdulla(t, t.browser, t.shared.reports.rE5);
      t.check('Status Approved (closed)', ok, '');
    },
  },
  {
    id: 'E9', who: 'Kamil Shahzad', title: 'Revoke the exemption: Yard and Post Job stay allowed',
    async run(t) {
      const b = t.browser;
      await A.openAsset(b, 'ASSET2');
      t.matrix('E9 gives no revoke reason', 'the app asks for one; the run typed "Test E9: exemption no longer needed"');
      await click(b, 'Revoke', { exact: true });
      await b.pause(800);
      let viaAlert = true;
      try {
        await b.sendAlertText('Test E9: exemption no longer needed');
        await b.acceptAlert();
      } catch (e) {
        // The webview does not expose window.prompt to WebDriver: answer it the way a user typing
        // the reason would, by supplying the text to the page's prompt, then press Revoke again.
        viaAlert = false;
        await b.execute(() => { window.prompt = () => 'Test E9: exemption no longer needed'; });
        await click(b, 'Revoke', { exact: true });
      }
      await b.pause(1500);
      if (!viaAlert) t.info('revoke reason prompt', 'WebDriver could not reach the reason prompt; the run supplied the reason to the page\'s prompt and pressed Revoke again. Jess may want to check the prompt by hand.');
      const p = await A.exemptionPanel(b);
      await t.shot('revoked');
      t.check('registry shows Revoked', p && /MOC-2026-014 — Revoked/.test(p.text), p && p.text.slice(0, 200));
      await as(b, 'Suganya Rajendran');
      await W.openMR1(b, 'ASSET2', 'Left');
      t.shared.reports.rE9A = await reportNo(b);
      await fillAndSubmit(t, b, { stage: 'PREMOB', pmc: 'PMC-2026-0091' });
      let r = await trySubmit(b);
      t.check('step 2: Pre-Mob refused (no exemption)', !r.ok && /MOC exemption/i.test(r.text), r.text);
      await W.stepTo(b, 'header');
      await choose(b, 'Compliance Stage', 'YARD INSPECTION');
      await W.stepTo(b, 'review');
      r = await trySubmit(b);
      t.check('Yard submits', r.ok, r.text);
      t.check('Abdulla closes Report A', await closeAsAbdulla(t, b, t.shared.reports.rE9A), '');
      await as(b, 'Suganya Rajendran');
      await W.openMR1(b, 'ASSET2', 'Left');
      const choice = await b.execute(() => [...document.querySelectorAll('.modal button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim()));
      if (choice.includes('Start a new report')) { await click(b, 'Start a new report', { exact: true }); await b.pause(2500); }
      t.shared.reports.rE9B = await reportNo(b);
      await W.stepTo(b, 'header');
      t.check('Report B Previous Engine Hours 370 (auto)', parseFloat(await valueOf(b, 'Previous Engine Hours')) === 370, await valueOf(b, 'Previous Engine Hours'));
      await fillAndSubmit(t, b, { stage: 'POST JOB', job: 'JSR-2026-0144', current: '380', km: '20', joh: '8' });
      r = await trySubmit(b);
      t.check('Post Job submits', r.ok, r.text);
      t.check('Abdulla closes Report B', await closeAsAbdulla(t, b, t.shared.reports.rE9B), '');
      const tr = triggers();
      t.eq('triggers EH 380, KM 620, OH 20', [tr.EH.running_value, tr.KM.running_value, tr.OH.running_value], [380, 620, 20]);
    },
  },
  {
    id: 'E10', who: 'Disantha Perera', title: 'Repair and verify the ASSET2 Critical',
    async run(t) {
      const b = t.browser;
      await R.openQueue(b);
      await R.plan(b, ASL, 'ASSET2', { tech: 'Bilal Ahmed' });
      t.eq('step 1: ASSET2 Yellow', (await A.tagOf(b, 'ASSET2')).tag, 'Yellow');
      await R.openQueue(b);
      await R.plan(b, ASL, 'ASSET2', { tech: 'Bilal Ahmed', parts: 'Available', date: t.today() });
      const v = await R.verify(b, ASL, 'ASSET2', { functionTest: true });
      t.check('verified', /Verified — tag removed for Air Supply Line on ASSET2/.test(v.toast || ''), v.toast);
      t.eq('step 2: ASSET2 Green', (await A.tagOf(b, 'ASSET2')).tag, 'Green');
    },
  },
  {
    id: 'E11', who: 'Suganya Rajendran', title: 'Copy last Post-Job report (within 72 hours)',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET2', 'Left', { postJob: 'ask' });
      const btns = await b.execute(() => [...document.querySelectorAll('.modal button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim()));
      await t.shot('dialog');
      t.check('the dialog offers both options', btns.includes('Copy last Post-Job report') && btns.includes('Start a new report'), btns.join(', '));
      await click(b, 'Copy last Post-Job report', { exact: true });
      await b.pause(2500);
      const no = await reportNo(b);
      await W.stepTo(b, 'header');
      t.eq('Client copied', await valueOf(b, 'Client'), 'Test Client');
      t.eq('Location copied', await valueOf(b, 'Location'), 'Test Well TW-21');
      t.eq('Compliance Stage set to PREMOB', await valueOf(b, 'Compliance Stage'), 'PREMOB');
      t.eq('Job Number not copied', await valueOf(b, 'Job Number'), '');
      t.eq('Checklist ID not copied', await valueOf(b, 'Pre-Mobilization Checklist ID'), '');
      const mtB = itRow(`SELECT v.value FROM mri_report_header_values v JOIN template_header_fields f ON f.id=v.template_header_field_id JOIN header_field_catalog c ON c.id=f.header_field_id WHERE v.report_id=${t.shared.reports.rE9B} AND c.label='Maintenance Type'`);
      t.eq('Maintenance Type same as Report B', await valueOf(b, 'Maintenance Type'), mtB ? mtB.value : null);
      const copied = itSql(`SELECT c.label, v.value FROM mri_report_header_values v JOIN template_header_fields f ON f.id=v.template_header_field_id JOIN header_field_catalog c ON c.id=f.header_field_id WHERE v.report_id=${no} ORDER BY c.label`)[0].rows;
      t.info('header values on the copy (incl. the wizard\'s own defaults: MR Initization Date = today, Current Engine Hours = previous reading)', copied.map((x) => `${x.label}=${x.value}`).join('; '));
      t.info('engine hours / MR initiation date', 'not copied from Report B; the wizard itself fills MR Initization Date (today) and Current Engine Hours (the previous reading, 380) on every new report');
      await t.shot('copy_header');
      await W.stepTo(b, 'checklist');
      for (const n of ['Access Ladders & Handrails', 'Air Hoses', 'Alternator']) t.eq(`Pass on ${n}`, (await W.rowState(b, n)).status, 'Pass');
      await W.toMainMenu(b);
      itDeleteDraft(t);
    },
  },
  {
    id: 'E12', who: 'Suganya Rajendran', title: 'Over 72 hours: no copy option',
    async run(t) {
      const b = t.browser;
      const [r] = itSql("UPDATE mri_reports SET submitted_date = CAST(CAST(strftime('%s','now') AS INTEGER) - 96*3600 AS TEXT) WHERE id = (SELECT MAX(id) FROM mri_reports WHERE asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2') AND status<>'Draft')");
      t.check('IT SQL ran (1 row)', r.ok && r.changed === 1, r.error || r.changed);
      await W.openMR1(b, 'ASSET2', 'Left', { postJob: 'ask' });
      const btns = await b.execute(() => [...document.querySelectorAll('.modal button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim()));
      await t.shot('dialog');
      t.check('only Start a new report is offered', btns.includes('Start a new report') && !btns.includes('Copy last Post-Job report'), btns.join(', '));
      await click(b, 'Cancel', { exact: true }).catch(() => {});
      t.info('step 3', 'the run cancelled the dialog instead of starting a Draft, so there was nothing for IT to delete');
      itDeleteDraft(t);
    },
  },
  {
    id: 'E13', who: 'Suganya Rajendran', title: 'Day-8 stand-by reminder',
    async run(t) {
      const b = t.browser;
      const [r] = itSql("UPDATE mri_reports SET submitted_date = CAST(CAST(strftime('%s','now') AS INTEGER) - 170*3600 AS TEXT) WHERE id = (SELECT MAX(id) FROM mri_reports WHERE asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2') AND status<>'Draft')");
      t.check('IT SQL ran (1 row)', r.ok && r.changed === 1, r.error || r.changed);
      await W.toMainMenu(b);
      await W.tile(b, 'Maintenance Report');
      await click(b, 'I', { exact: true });
      await b.pause(1200);
      const txt = await t.text(3000);
      await t.shot('banner');
      t.check('banner: Pre-Job MR-I due, lists ASSET2, day 8 since its Post-Job report', /Pre-Job MR-I due/.test(txt) && /ASSET2[^\n]*day 8 since its Post-Job report/.test(txt), (txt.match(/Pre-Job MR-I due[^\n]*\n?[^\n]*/) || [''])[0]);
      await W.toMainMenu(b);
    },
  },
];
