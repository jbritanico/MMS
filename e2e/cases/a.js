// A group through the UI.
const path = require('path');
const { as, click, hasText, typeInto, choose, valueOf } = require('../lib/ui');
const W = require('../lib/wizard');

const FX = (f) => path.resolve(__dirname, '..', 'fixtures', f);
const LADDER = 'Access Ladders & Handrails';
const ISSUE = 'Ladder rung paint worn, needs touch-up.';
const ACTION = 'Rungs sanded and repainted, touch-up coat to be re-checked at the next yard visit.';

async function reportNo(b) {
  return b.execute(() => { const m = document.body.innerText.match(/Report\s*#\s*(\d+)/); return m ? +m[1] : null; });
}

module.exports = [
  {
    id: 'A1', who: 'Suganya Rajendran', title: 'Start the first report',
    async run(t) {
      const b = t.browser;
      await as(b, 'Suganya Rajendran');
      await W.openMR1(b, 'ASSET2', 'Left');
      await t.shot('form_opened');
      const no = await reportNo(b);
      t.check('Draft created and the form opens', (await hasText(b, 'Draft')) && no !== null, `Report #${no}`);
      t.shared.reports.r1 = no;
      t.info('template', 'the app picks the asset type\'s active template (PUMP UNIT) itself; there is no separate template choice or Start report button, the component button starts it');
    },
  },
  {
    id: 'A2', who: 'Suganya Rajendran', title: 'Starting again reopens the same Draft',
    async run(t) {
      const b = t.browser;
      await W.toMainMenu(b);
      await W.openMR1(b, 'ASSET2', 'Left');
      await t.shot('reopened');
      t.eq('the same Draft opens', await reportNo(b), t.shared.reports.r1);
    },
  },
  {
    id: 'A3', who: 'Suganya Rajendran', title: 'Fill in Report 1 and check it is saved',
    async run(t) {
      const b = t.browser;
      await W.stepTo(b, 'header');
      await choose(b, 'Client', 'Test Client');
      await typeInto(b, 'Location', 'Test Well TW-21');
      await choose(b, 'Compliance Stage', 'PRE-JOB');
      t.eq('Maintenance Type shows Preventive (default)', await valueOf(b, 'Maintenance Type'), 'Preventive');
      await typeInto(b, 'Pre-Mobilization Checklist ID', 'PMC-2026-0101');
      t.eq('Previous Engine Hours shows 0 (auto)', await valueOf(b, 'Previous Engine Hours'), '0');
      await typeInto(b, 'Current Engine Hours', '150');
      t.eq('Engine Hours (This Report) shows 150 by itself', await valueOf(b, 'Engine Hours (This Report)'), '150.0');
      await t.shot('header_filled');
      await W.next(b); // Checklist
      await W.rowButton(b, LADDER, 'Fail');
      let s = await W.rowState(b, LADDER);
      t.eq('Date Observed shows today', s.date, t.today());
      t.eq('Closure Status shows Pending', s.closure, 'Pending');
      t.eq('Severity shows Minor', s.severity, 'Minor');
      await W.rowType(b, LADDER, 0, ISSUE);
      await W.rowType(b, LADDER, 1, ACTION);
      const att = await W.attach(b, LADDER, FX('photo.png'));
      t.check('photo added with the + under Attachments', att, '');
      await t.shot('checklist_fail_filled');
      await W.next(b); // Distance Travelled
      const kmLabel = await kmField(b);
      if (kmLabel !== 'Distance Travelled Post-Job (KM)') {
        t.matrix('A3 data: Distance Travelled Post-Job (KM) 300', `on a PRE-JOB report the Distance Travelled step offers only "${kmLabel}". The run entered 300 there; the KM trigger uses Post-Job, else Pre-Job, so E4's KM total is unaffected.`);
      }
      await typeInto(b, kmLabel, '300');
      await t.shot('mid_values');
      // Close the report and open it again from the Draft list
      await W.toMainMenu(b);
      await W.openMR1(b, 'ASSET2', 'Left');
      await W.stepTo(b, 'header');
      t.eq('Compliance Stage kept', await valueOf(b, 'Compliance Stage'), 'PRE-JOB');
      t.eq('Maintenance Type kept', await valueOf(b, 'Maintenance Type'), 'Preventive');
      t.eq('Checklist ID kept', await valueOf(b, 'Pre-Mobilization Checklist ID'), 'PMC-2026-0101');
      t.eq('Client kept', await valueOf(b, 'Client'), 'Test Client');
      t.eq('Location kept', await valueOf(b, 'Location'), 'Test Well TW-21');
      t.eq('Engine Hours (This Report) kept', await valueOf(b, 'Engine Hours (This Report)'), '150.0');
      await t.shot('header_reopened');
      await W.next(b);
      s = await W.rowState(b, LADDER);
      t.eq('Fail, issue, action, today, Pending, Minor kept', [s.status, s.issue, s.action, s.date, s.closure, s.severity], ['Fail', ISSUE, ACTION, t.today(), 'Pending', 'Minor']);
      t.check('photo thumbnail kept', s.attachments >= 1, `${s.attachments} image(s) in the row`);
      await t.shot('checklist_reopened');
      await W.next(b);
      t.eq('Distance Travelled kept', await valueOf(b, await kmField(b)), '300');
    },
  },
  {
    id: 'A3a', who: 'Suganya Rajendran', runner: 'claude-code+review', title: 'Maintenance Type: Preventive / Breakdown, default and saving',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET2', 'Right');
      await W.stepTo(b, 'header');
      t.eq('step 2: new Right draft shows Preventive', await valueOf(b, 'Maintenance Type'), 'Preventive');
      const lab = await b.execute(() => { const r = [...document.querySelectorAll('.mri-preview-table-row')].find((x) => x.querySelector('label')?.innerText.startsWith('Maintenance Type')); return r ? { label: r.querySelector('label').innerText, opts: [...r.querySelector('select').options].map((o) => o.text), tag: r.querySelector('select').tagName } : null; });
      t.check('no red * on the Maintenance Type label', lab && !lab.label.includes('*'), lab && lab.label);
      t.eq('choices are — Select —, Preventive, Breakdown (no Corrective)', lab && lab.opts, ['— Select —', 'Preventive', 'Breakdown']);
      t.check('cannot type your own value (a fixed list, not a text box)', lab && lab.tag === 'SELECT', lab && lab.tag);
      await t.shot('step2_default');
      await choose(b, 'Maintenance Type', 'Breakdown');
      await W.next(b); await W.prev(b);
      t.eq('step 3: Breakdown kept after Next / Previous', await valueOf(b, 'Maintenance Type'), 'Breakdown');
      await W.toMainMenu(b); await W.openMR1(b, 'ASSET2', 'Right'); await W.stepTo(b, 'header');
      t.eq('step 3: Breakdown kept after reopening', await valueOf(b, 'Maintenance Type'), 'Breakdown');
      await t.shot('step3_breakdown');
      await choose(b, 'Maintenance Type', 'Preventive');
      await W.toMainMenu(b); await W.openMR1(b, 'ASSET2', 'Right'); await W.stepTo(b, 'header');
      t.eq('step 4: Preventive kept after reopening', await valueOf(b, 'Maintenance Type'), 'Preventive');
      await choose(b, 'Maintenance Type', '');
      await W.toMainMenu(b); await W.openMR1(b, 'ASSET2', 'Right'); await W.stepTo(b, 'header');
      t.eq('step 5: deliberate blank stays blank after reopening', await valueOf(b, 'Maintenance Type'), '— Select —');
      await W.stepTo(b, 'review');
      let rv = await W.reviewState(b);
      t.check('step 5: red list does not mention Maintenance Type', !rv.issues.some((i) => /maintenance type/i.test(i)), rv.issues.join(' / '));
      t.eq('step 5: details box shows Maintenance type —', W.detail(rv.details, 'Maintenance type'), '—');
      await t.shot('step5_review_blank');
      await W.stepTo(b, 'header');
      await choose(b, 'Maintenance Type', 'Preventive');
      await W.stepTo(b, 'review');
      rv = await W.reviewState(b);
      t.eq('step 6: details box shows Maintenance type Preventive', W.detail(rv.details, 'Maintenance type'), 'Preventive');
      await t.shot('step6_review_preventive');
      t.review('look and PDF preview', 'screens saved for Jess (PDF preview not opened by the run)');
      await W.toMainMenu(b);
    },
  },
  {
    id: 'A4', who: 'Suganya Rajendran', title: 'Compliance Stage is required',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET2', 'Left');
      await W.stepTo(b, 'header');
      await choose(b, 'Compliance Stage', '');
      await W.stepTo(b, 'review');
      let rv = await W.reviewState(b);
      t.check('Submit refused: list says Compliance Stage is required, Submit disabled', rv.submitDisabled && rv.issues.some((i) => /compliance stage/i.test(i)), rv.issues.join(' / '));
      await t.shot('compliance_blank');
      await W.stepTo(b, 'header');
      await choose(b, 'Compliance Stage', 'PRE-JOB');
      await W.stepTo(b, 'review');
      rv = await W.reviewState(b);
      t.check('after setting PRE-JOB the Compliance Stage refusal no longer applies', !rv.issues.some((i) => /compliance stage/i.test(i)), rv.issues.join(' / '));
      await t.shot('compliance_restored');
    },
  },
  {
    id: 'A5', who: 'Suganya Rajendran', title: 'Checklist ID is required for a Pre-Job report',
    async run(t) {
      const b = t.browser;
      await W.stepTo(b, 'header');
      await typeInto(b, 'Pre-Mobilization Checklist ID', '');
      await W.stepTo(b, 'review');
      const rv = await W.reviewState(b);
      t.check('refused: Pre-Mobilization Checklist ID required for Pre-Mob / Pre-Job (from the JSR)', rv.submitDisabled && rv.issues.some((i) => /Pre-Mobilization Checklist ID/i.test(i)), rv.issues.join(' / '));
      await t.shot('checklist_id_blank');
    },
  },
  {
    id: 'A6', who: 'Suganya Rajendran', title: 'A Fail must have an issue description',
    async run(t) {
      const b = t.browser;
      await W.stepTo(b, 'header');
      await typeInto(b, 'Pre-Mobilization Checklist ID', 'PMC-2026-0101');
      await W.stepTo(b, 'checklist');
      await W.rowType(b, LADDER, 0, '');
      await W.stepTo(b, 'review');
      let rv = await W.reviewState(b);
      t.check('Submit refused: the Fail has no issue details', rv.submitDisabled && rv.issues.some((i) => i.includes(LADDER) && /no issue details/.test(i)), rv.issues.join(' / '));
      await t.shot('no_issue_details');
      await W.stepTo(b, 'checklist');
      await W.rowType(b, LADDER, 0, ISSUE);
      await W.stepTo(b, 'review');
      rv = await W.reviewState(b);
      t.check('after restoring the text the refusal no longer applies', !rv.issues.some((i) => /no issue details/.test(i)), rv.issues.join(' / '));
    },
  },
  {
    id: 'A6a', who: 'Suganya Rajendran', title: 'Action Taken is needed before an item can be closed',
    async run(t) {
      const b = t.browser;
      await W.stepTo(b, 'checklist');
      await W.rowType(b, LADDER, 1, '');
      await W.rowSelect(b, LADDER, 'closure', 'Closed');
      const pop = await W.closeAlert(b);
      t.check('step 2 refused', !!pop && /Action Taken is blank/.test(pop), pop);
      if (pop && !pop.includes('Add an action taken entry before closing this item')) {
        t.matrix('A6a expects the text "Add an action taken entry before closing this item"', `the screen shows "${pop}" (A6e's wording); the quoted text is the server message`);
      }
      let s = await W.rowState(b, LADDER);
      t.eq('Closure Status stays Pending', s.closure, 'Pending');
      await t.shot('closed_refused');
      await W.rowType(b, LADDER, 1, ACTION);
      s = await W.rowState(b, LADDER);
      t.eq('after step 3 the text is saved and the item is still Pending', [s.action, s.closure], [ACTION, 'Pending']);
    },
  },
  {
    id: 'A6d', who: 'Suganya Rajendran', title: 'A Fail must also have an Action Taken before Submit',
    async run(t) {
      const b = t.browser;
      await W.stepTo(b, 'checklist');
      await W.rowType(b, LADDER, 1, '');
      await W.stepTo(b, 'review');
      let rv = await W.reviewState(b);
      t.check('Submit refused (disabled)', rv.submitDisabled === true, rv.submitText);
      t.check('list says Access Ladders & Handrails is marked Fail but has no action taken', rv.issues.some((i) => i.includes(LADDER) && /no action taken/.test(i)), rv.issues.join(' / '));
      await t.shot('no_action_taken');
      await W.stepTo(b, 'checklist');
      await W.rowType(b, LADDER, 1, ACTION);
      await W.stepTo(b, 'review');
      rv = await W.reviewState(b);
      t.check('after restoring the text the refusal no longer applies', !rv.issues.some((i) => /no action taken/.test(i)), rv.issues.join(' / '));
    },
  },
  {
    id: 'A6e', who: 'Suganya Rajendran', title: 'A Fail cannot be Closed with blank Issue Details or Action Taken',
    async run(t) {
      const b = t.browser;
      await W.stepTo(b, 'checklist');
      await W.rowType(b, LADDER, 0, '');
      await W.rowType(b, LADDER, 1, '');
      await W.rowSelect(b, LADDER, 'closure', 'Closed');
      await t.shot('step1_popup');
      let pop = await W.closeAlert(b);
      t.check('step 1: popup Issue Details and Action Taken are both blank', !!pop && /both blank/.test(pop), pop);
      t.eq('step 1: dropdown back to Pending', (await W.rowState(b, LADDER)).closure, 'Pending');
      await W.rowType(b, LADDER, 1, ACTION);
      await W.rowSelect(b, LADDER, 'closure', 'Closed');
      pop = await W.closeAlert(b);
      t.check('step 2: popup says Issue Details is blank', !!pop && /Issue Details is blank/.test(pop), pop);
      t.eq('step 2: dropdown back to Pending', (await W.rowState(b, LADDER)).closure, 'Pending');
      await W.rowType(b, LADDER, 1, '');
      await W.rowType(b, LADDER, 0, ISSUE);
      await W.rowSelect(b, LADDER, 'closure', 'Closed');
      pop = await W.closeAlert(b);
      t.check('step 3: popup says Action Taken is blank', !!pop && /Action Taken is blank/.test(pop), pop);
      t.eq('step 3: dropdown back to Pending', (await W.rowState(b, LADDER)).closure, 'Pending');
      await W.rowType(b, LADDER, 1, ACTION);
      await W.rowSelect(b, LADDER, 'closure', 'Closed');
      pop = await W.closeAlert(b);
      let s = await W.rowState(b, LADDER);
      t.check('step 4: Closed accepted with both filled', !pop && s.closure === 'Closed', pop || s.closure);
      await t.shot('step4_closed');
      await W.rowType(b, LADDER, 1, '');
      s = await W.rowState(b, LADDER);
      t.eq('step 4: clearing a box puts Closure Status back to Pending', s.closure, 'Pending');
      await W.rowType(b, LADDER, 1, ACTION);
      s = await W.rowState(b, LADDER);
      t.eq('restored: both texts, Pending', [s.issue, s.action, s.closure], [ISSUE, ACTION, 'Pending']);
    },
  },
  {
    id: 'A6b', who: 'Suganya Rajendran', title: 'Date Observed, Severity and Closure Status on a Fail',
    async run(t) {
      const b = t.browser;
      await W.stepTo(b, 'checklist');
      await W.rowDate(b, LADDER, t.today(-1));
      await W.toMainMenu(b); await W.openMR1(b, 'ASSET2', 'Left'); await W.stepTo(b, 'checklist');
      t.eq('Date Observed keeps yesterday after reopening', (await W.rowState(b, LADDER)).date, t.today(-1));
      await W.rowDate(b, LADDER, t.today());
      t.eq('back to today', (await W.rowState(b, LADDER)).date, t.today());
      await W.rowSelect(b, LADDER, 'severity', 'Moderate');
      let s = await W.rowState(b, LADDER);
      t.check('Moderate - Required Action panel appears', /Moderate — Required Action/.test(s.nextText + ' ' + s.text), (s.nextText || '').slice(0, 200));
      t.check('Repaired on site tick box shows', /Repaired on site/.test(s.text + s.nextText), '');
      t.check('Closure Status list disabled for the Operator', s.closureDisabled === true, s.closureTitle);
      t.check('hover text: Moderate faults require Maintenance Supervisor review authority to close', /Moderate faults require Maintenance Supervisor.*review authority to close/.test(s.closureTitle || ''), s.closureTitle);
      await t.shot('moderate_panel');
      const r = await W.rowSelect(b, LADDER, 'closure', 'Closed');
      t.check('Closed cannot be chosen; stays Pending', r === 'disabled' && (await W.rowState(b, LADDER)).closure === 'Pending', r);
      await W.rowSelect(b, LADDER, 'severity', 'Minor');
      s = await W.rowState(b, LADDER);
      t.check('at Minor the Moderate panel and the Repaired on site tick box go away', !/Moderate — Required Action|Repaired on site/.test(s.text + s.nextText), '');
      if (/Minor — Required Action/.test(s.nextText)) t.info('Minor panel', 'at Minor the app shows its own "Minor — Required Action" panel (no approval required)');
      t.eq('Closure Status available again', s.closureDisabled, false);
      t.eq('nothing left changed from A3', [s.status, s.issue, s.action, s.date, s.closure, s.severity], ['Fail', ISSUE, ACTION, t.today(), 'Pending', 'Minor']);
    },
  },
  {
    id: 'A6c', who: 'Suganya Rajendran', title: 'Attachments on a Fail',
    async run(t) {
      const b = t.browser;
      await W.stepTo(b, 'checklist');
      await W.attach(b, LADDER, FX('page.pdf'));
      let s = await W.rowState(b, LADDER);
      t.check('PDF shows as a small thumbnail next to the photo', s.attachmentNames.includes('page.pdf') && s.attachmentNames.includes('photo.png'), s.attachmentNames.join(', '));
      await t.shot('pdf_added');
      await W.attach(b, LADDER, FX('too_large_6mb.png'));
      const err = await b.execute(() => document.body.innerText.includes('File is too large (max 5MB)'));
      const s2 = await W.rowState(b, LADDER);
      t.check('too large refused with File is too large (max 5MB), nothing added', err && s2.attachments === s.attachments, `images ${s.attachments} -> ${s2.attachments}`);
      await t.shot('too_large');
      await W.row(b, LADDER);
      await (await b.$('[data-e2e-row="1"] img[title="photo.png"]')).click();
      await b.pause(1000);
      const viewerOpen = () => b.execute(() => [...document.querySelectorAll('button')].some((x) => x.offsetParent !== null && x.innerText.trim() === 'Download'));
      const big = await viewerOpen();
      await t.shot('photo_large_view');
      t.check('photo opens in a larger view', big, '');
      await b.execute(() => { const c = [...document.querySelectorAll('button')].find((x) => x.offsetParent !== null && (x.innerText.trim() === 'Close' || x.getAttribute('aria-label') === 'Close')); c && c.click(); });
      await b.pause(700);
      const closed = !(await viewerOpen());
      t.check('larger view closes again', closed, '');
      await W.row(b, LADDER);
      const removed = await b.execute(() => {
        const r = document.querySelector('[data-e2e-row="1"]');
        const pdf = r.querySelector('div[title="page.pdf"]');
        const btn = pdf && pdf.parentElement.querySelector('button[aria-label="Remove attachment"]');
        if (!btn) return false; btn.click(); return true;
      });
      await b.pause(1200);
      s = await W.rowState(b, LADDER);
      t.check('only the PDF removed, the photo stays', removed && JSON.stringify(s.attachmentNames) === '["photo.png"]', `removed=${removed}, left: ${s.attachmentNames.join(', ')}`);
      await W.toMainMenu(b); await W.openMR1(b, 'ASSET2', 'Left'); await W.stepTo(b, 'checklist');
      s = await W.rowState(b, LADDER);
      t.eq('after reopening only the photo is attached', s.attachmentNames, ['photo.png']);
    },
  },
  {
    id: 'A7', who: 'Suganya Rajendran', runner: 'claude-code+review', title: 'Submit Report 1',
    async run(t) {
      const b = t.browser;
      await W.stepTo(b, 'header');
      t.eq('Compliance Stage is PRE-JOB', await valueOf(b, 'Compliance Stage'), 'PRE-JOB');
      t.eq('Checklist ID is PMC-2026-0101', await valueOf(b, 'Pre-Mobilization Checklist ID'), 'PMC-2026-0101');
      await W.stepTo(b, 'review');
      let rv = await W.reviewState(b);
      const want = ['Operator Date', 'Supervisor', 'Supervisor Date'];
      t.check('step 2 refused: Footer - Operator Date, Supervisor, Supervisor Date required; Submit disabled', rv.submitDisabled && want.every((w) => rv.issues.some((i) => /Footer/.test(i) && i.includes(w))), rv.issues.join(' / '));
      await t.shot('empty_footer_review');
      await W.fillFooter(b, t.today(), { ticks: ['Cleaned', 'Pressure Tested', 'Function Tested', 'Green Tagged', 'Job Ready'], remarks: 'Unit cleaned and pressure tested at Karachi Yard.' });
      t.eq('Operator fills itself in', await valueOf(b, 'Operator'), 'Suganya Rajendran');
      await t.shot('footer_filled');
      await W.stepTo(b, 'review');
      rv = await W.reviewState(b);
      t.eq('no issues left', rv.issues, []);
      const rtxt = await t.text(8000);
      t.check('Review shows the Remarks text', rtxt.includes('Unit cleaned and pressure tested at Karachi Yard.'), '');
      for (const [l, v] of [['Maintenance type', 'Preventive'], ['Job number', '—'], ['Pre-mobilization checklist ID', 'PMC-2026-0101'], ['Engine hours (this report)', '150.0']]) {
        t.eq(`details box: ${l}`, W.detail(rv.details, l), v);
      }
      await t.shot('review_before_submit');
      const res = await W.submit(b);
      t.check('step 3: submitted', res.ok, res.st.submitText);
      t.review('Review layout, five ticked boxes, PDF', 'screens saved for Jess');
      t.info('status Submitted and unit tag unchanged', 'stored values checked in Phase 1 (A7 ok); A8 confirms Submitted on screen');
    },
  },
  {
    id: 'A8', who: 'Suganya Rajendran', title: 'No new report while Report 1 is Submitted',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET2');
      const txt = await t.text(3000);
      await t.shot('component_choice');
      t.check('Left is offered as blocked (Submitted)', /Left[\s\S]{0,80}Submitted/.test(txt), txt.match(/Left[^\n]*\n?[^\n]*/)?.[0]);
      const left = await b.execute(() => { const x = [...document.querySelectorAll('.modal button')].find((y) => y.innerText.trim().startsWith('Left')); return x ? { text: x.innerText.replace(/\s+/g, ' ').trim(), disabled: x.disabled } : null; });
      await b.execute(() => { const x = [...document.querySelectorAll('.modal button')].find((y) => y.innerText.trim().startsWith('Left')); x && !x.disabled && x.click(); });
      await b.pause(1500);
      const opened = await b.execute(() => /Parent asset/.test(document.body.innerText));
      await t.shot('refused');
      t.check('refused: Left cannot be started while Report 1 is Submitted (close it first)', left && left.disabled && /Submitted/.test(left.text) && !opened, left && left.text);
      if (left && !/endorsed and closed/.test(left.text)) t.info('wording', `the screen says "${left.text}"; the matrix expects "still Submitted and must be endorsed and closed first" (the server message)`);
      await b.execute(() => { const x = [...document.querySelectorAll('.modal button')].find((y) => y.innerText.trim() === 'Cancel'); x && x.click(); });
      await W.toMainMenu(b);
    },
  },
  {
    id: 'A9', who: 'Suganya Rajendran', title: 'A submitted report cannot be edited by the Operator',
    async run(t) {
      const b = t.browser;
      await W.toMainMenu(b);
      await click(b, 'Open Fault Review');
      await t.shot('attention_tab');
      await click(b, 'View', { exact: true });
      await b.pause(1200);
      await t.shot('my_reports');
      await click(b, `View report #${t.shared.reports.r1}`);
      await b.pause(2000);
      let txt = await t.text(6000);
      t.check('report opens on Review & Submit', /Review & Submit/i.test(txt), '');
      t.check('Review says This report is locked and read-only', txt.includes('This report is locked and read-only.'), '');
      await t.shot('review_locked');
      await W.stepTo(b, 'header');
      const st = await b.execute(() => [...document.querySelectorAll('input, select, textarea')].filter((e) => e.offsetParent !== null).map((e) => e.disabled || e.readOnly));
      t.check('all header fields read-only', st.length > 0 && st.every(Boolean), `${st.filter(Boolean).length}/${st.length} disabled`);
      t.eq('Location stays Test Well TW-21', await valueOf(b, 'Location'), 'Test Well TW-21');
      t.eq('Maintenance Type stays Preventive', await valueOf(b, 'Maintenance Type'), 'Preventive');
      const btns = await b.execute(() => [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim()));
      t.check('no Endorse, Close or decision control', !btns.some((x) => /Endorse|Close & Approve|Close Report|Approve|Reject/.test(x)), btns.join(', '));
      await t.shot('header_locked');
      await W.stepTo(b, 'checklist');
      const s = await W.rowState(b, LADDER);
      const addRemove = await b.execute(() => document.querySelectorAll('[data-e2e-row="1"] [aria-label="Add attachment"], [data-e2e-row="1"] [aria-label="Remove attachment"]').length);
      t.check('Date Observed, Severity, Closure and the photo are shown', s.date === t.today() && s.severity === 'Minor' && s.attachments === 1, JSON.stringify([s.date, s.severity, s.closure, s.attachments]));
      t.eq('+ and × on Attachments not offered', addRemove, 0);
      await t.shot('checklist_locked');
      await W.toMainMenu(b);
    },
  },
  {
    id: 'A10', who: 'Suganya Rajendran', title: 'Pre-Mob report needs the Checklist ID',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET1');
      t.shared.reports.rA10 = await reportNo(b);
      await W.stepTo(b, 'header');
      await choose(b, 'Compliance Stage', 'PREMOB');
      await choose(b, 'Client', 'Test Client');
      await typeInto(b, 'Location', 'Karachi Yard');
      await W.stepTo(b, 'checklist');
      const fails = await b.execute(() => [...document.querySelectorAll('button.danger')].filter((x) => x.innerText.trim() === 'Fail').length);
      t.eq('every item starts as Pass (required items assessed)', fails, 0);
      await W.fillFooter(b, t.today());
      await W.stepTo(b, 'review');
      let rv = await W.reviewState(b);
      t.check('step 4: red list shows the Checklist ID as required for Pre-Mob; Submit disabled', rv.submitDisabled && rv.issues.some((i) => /Pre-Mobilization Checklist ID/.test(i)), rv.issues.join(' / '));
      t.check('nothing else in the red list', rv.issues.length === 1, rv.issues.join(' / '));
      await t.shot('step4_review');
      await W.stepTo(b, 'header');
      await typeInto(b, 'Pre-Mobilization Checklist ID', 'PMC-2026-0087');
      await W.stepTo(b, 'review');
      rv = await W.reviewState(b);
      t.eq('step 5: list empty', rv.issues, []);
      t.eq('details: Pre-mobilization checklist ID', W.detail(rv.details, 'Pre-mobilization checklist ID'), 'PMC-2026-0087');
      t.eq('details: Job number', W.detail(rv.details, 'Job number'), '—');
      await t.shot('step5_review');
      const res = await W.submit(b);
      t.check('Submit works', res.ok, res.st.submitText);
      await W.openMR1(b, 'ASSET2').catch(() => {});
      await b.keys('Escape');
      await W.toMainMenu(b);
      await W.tile(b, 'Maintenance Report');
      await click(b, 'I', { exact: true });
      await b.pause(1000);
      const card = await b.execute(() => [...document.querySelectorAll('.asset-select-card')].find((x) => x.querySelector('.asset-select-code')?.innerText.trim() === 'ASSET1')?.innerText.replace(/\s+/g, ' '));
      t.check('Select Asset shows ASSET1 as Submitted – pending closure', /Submitted\s*[–—-]\s*pending closure/i.test(card || ''), card);
      await t.shot('select_asset_after');
      await W.toMainMenu(b);
    },
  },
];

// The KM field the Distance Travelled step shows (depends on the Compliance Stage).
async function kmField(b) {
  return b.execute(() => {
    const l = [...document.querySelectorAll('label')].find((x) => x.offsetParent !== null && /Distance Travelled (Pre|Post)-Job \(KM\)/.test(x.innerText));
    return l ? l.innerText.trim() : null;
  });
}
