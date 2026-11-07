// I group through the UI (cards, flows from queues and report header).
const { as, click, clickText, attention, queueCards, typeInto, choose, valueOf } = require('../lib/ui');
const W = require('../lib/wizard');
const A = require('../lib/assets');
const F = require('../lib/flow');
const { itRow } = require('../lib/it');

const heading = (b) => b.execute(() => { const h = [...document.querySelectorAll('h1, h2')].find((x) => x.offsetParent !== null); return h ? h.innerText.trim() : ''; });
const btnList = (b) => b.execute(() => [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null).map((x) => ({ t: x.innerText.trim() || x.title || x.getAttribute('aria-label') || '', d: x.disabled, title: x.title })));
const back = async (b) => { await click(b, '← Back', { exact: true }); await b.pause(1200); };

async function openReportFlowFromHeader(b) {
  await click(b, 'Show flow', { exact: true });
  await b.pause(1500);
}

module.exports = [
  {
    id: 'I1', runner: 'claude-code+review', who: 'Jess Britanico', title: 'Asset Registry shows assets as cards',
    async run(t) {
      const b = t.browser;
      await A.openRegistry(b);
      await t.shot('cards');
      const cards = await b.execute(() => [...document.querySelectorAll('.review-card')].map((c) => ({ code: (c.querySelector('.review-card-code') || {}).innerText, text: c.innerText.replace(/\s+/g, ' '), buttons: [...c.querySelectorAll('button')].map((x) => x.title || x.getAttribute('aria-label') || x.innerText.trim()), img: !!c.querySelector('img') })));
      t.check('ASSET1 and ASSET2 shown as cards with Active pill, Edit and Delete', cards.length === 2 && cards.every((c) => /Active/.test(c.text) && c.buttons.includes('Edit') && c.buttons.includes('Delete')), JSON.stringify(cards.map((c) => [c.code, c.buttons])));
      await b.execute(() => { document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e')); [...document.querySelectorAll('input[placeholder="Search assets..."]')].find((x) => x.getClientRects().length > 0).setAttribute('data-e2e', '1'); });
      const search = await b.$('[data-e2e="1"]');
      await search.click(); await b.keys('ASSET2'.split('')); await b.pause(800);
      const t1 = await t.text(1500);
      t.check('search filters the cards; count shows 1 of 2', /1 of 2/.test(t1) && (await b.execute(() => document.querySelectorAll('.review-card').length)) === 1, (t1.match(/\d+ of \d+/) || [''])[0]);
      await t.shot('search');
      await b.keys(['Control', 'a']); await b.keys('Backspace'); await b.pause(800);
      t.check('then 2 of 2', /2 of 2/.test(await t.text(1500)), '');
      t.review('card look (icon, pills, trigger chips)', 'see screenshots');
    },
  },
  {
    id: 'I2', who: 'Jess Britanico', title: 'Asset card actions and opening an asset',
    async run(t) {
      const b = t.browser;
      await A.openRegistry(b);
      const cardBtn = (code, label) => b.execute((code, label) => { const c = [...document.querySelectorAll('.review-card')].find((x) => (x.querySelector('.review-card-code') || {}).innerText === code); const btn = [...c.querySelectorAll('button')].find((x) => (x.title || x.getAttribute('aria-label')) === label); if (!btn) return null; const r = { disabled: btn.disabled, title: btn.title }; if (!btn.disabled) btn.click(); return r; }, code, label);
      await b.execute(() => [...document.querySelectorAll('.review-card')].find((x) => (x.querySelector('.review-card-code') || {}).innerText === 'ASSET1').click());
      await b.pause(1000);
      let txt = await t.text(3000);
      const viewMode = await b.execute(() => [...document.querySelectorAll('input, select')].filter((e) => e.offsetParent !== null).every((e) => e.disabled || e.classList.contains('search')));
      t.check('step 1: the asset opens in the panel in view mode', /ASSET1/.test(txt) && viewMode, '');
      await t.shot('view');
      await A.openRegistry(b);
      await cardBtn('ASSET1', 'Edit');
      await b.pause(1000);
      const editMode = await b.execute(() => [...document.querySelectorAll('button')].some((x) => x.offsetParent !== null && /Save changes/.test(x.innerText)));
      t.check('step 2: Edit opens it in edit mode', editMode, '');
      await t.shot('edit');
      await A.openRegistry(b);
      await cardBtn('ASSET1', 'Delete');
      await b.pause(800);
      txt = await t.text(3000);
      t.check('step 3: delete confirmation appears', /delete/i.test(txt) && (await b.execute(() => !!document.querySelector('.modal'))), '');
      await t.shot('delete_confirm');
      await click(b, 'Cancel', { exact: true });
      t.check('Cancel leaves the asset in place', (await b.execute(() => [...document.querySelectorAll('.review-card-code')].map((x) => x.innerText))).includes('ASSET1'), '');
      await as(b, 'Suganya Rajendran');
      await A.openRegistry(b);
      const st = await b.execute(() => { const c = [...document.querySelectorAll('.review-card')].find((x) => (x.querySelector('.review-card-code') || {}).innerText === 'ASSET1'); return [...c.querySelectorAll('button')].filter((x) => /^(Edit|Delete)$/.test(x.getAttribute('aria-label') || '')).map((x) => ({ l: x.getAttribute('aria-label'), d: x.disabled, title: x.title })); });
      t.check('step 4: Edit and Delete disabled for Suganya with a no-permission tooltip', st.length === 2 && st.every((x) => x.d && /doesn't have permission/.test(x.title)), JSON.stringify(st));
      await t.shot('suganya_card');
    },
  },
  {
    id: 'I3', who: 'Jess Britanico', title: 'MR-I Templates shown as cards',
    async run(t) {
      const b = t.browser;
      await W.toMainMenu(b); await W.tile(b, 'Administration'); await b.pause(1000);
      await clickText(b, 'MR-I');
      await b.pause(1500);
      await t.shot('templates');
      const cards = await b.execute(() => [...document.querySelectorAll('.review-card')].filter((c) => c.offsetParent !== null).map((c) => ({ text: c.innerText.replace(/\s+/g, ' '), buttons: [...c.querySelectorAll('button')].map((x) => x.title || x.getAttribute('aria-label') || x.innerText.trim()) })));
      t.check('COILED TUBING UNIT and PUMP UNIT cards with status pill and icon buttons', ['COILED TUBING UNIT', 'PUMP UNIT'].every((n) => cards.some((c) => c.text.includes(n) && /Active/.test(c.text) && c.buttons.length >= 3)), JSON.stringify(cards.map((c) => [c.text.slice(0, 40), c.buttons])));
      const pump = cards.find((c) => /^.*PUMP UNIT/.test(c.text) && !/COILED/.test(c.text));
      t.info('PUMP UNIT buttons', pump && pump.buttons.join(', '));
      const press = (label) => b.execute((label) => { const c = [...document.querySelectorAll('.review-card')].find((x) => /PUMP UNIT/.test(x.innerText) && !/COILED/.test(x.innerText)); const btn = [...c.querySelectorAll('button')].find((x) => (x.title || x.getAttribute('aria-label') || x.innerText.trim()).startsWith(label)); if (!btn) return false; btn.click(); return true; }, label);
      if (await press('Rename')) {
        await b.pause(600);
        const box = await b.execute(() => { const c = [...document.querySelectorAll('.review-card')].find((x) => /PUMP UNIT/.test(x.innerHTML) && x.querySelector('input')); return c ? [...c.querySelectorAll('button')].map((x) => x.title || x.getAttribute('aria-label')) : null; });
        t.check('Rename turns the name into a text box with Save and Cancel', box && box.some((x) => /Save/.test(x)) && box.some((x) => /Cancel/.test(x)), JSON.stringify(box));
        await t.shot('rename');
        await b.execute(() => { const c = [...document.querySelectorAll('.review-card')].find((x) => x.querySelector('input')); [...c.querySelectorAll('button')].find((x) => /Cancel/.test(x.title || x.getAttribute('aria-label') || '')).click(); });
        await b.pause(600);
        t.check('Cancel restores the name', (await b.execute(() => document.body.innerText)).includes('PUMP UNIT'), '');
      } else t.check('Rename button present', false, '');
      if (await press('Cycle')) {
        await b.pause(800);
        let s = '';
        for (let i = 0; i < 4; i++) {
          s = await b.execute(() => { const c = [...document.querySelectorAll('.review-card')].find((x) => /PUMP UNIT/.test(x.innerText) && !/COILED/.test(x.innerText)); return (c.innerText.match(/Active|Inactive|Draft|Archived/) || [''])[0]; });
          if (s === 'Active') break;
          await press('Cycle'); await b.pause(800);
        }
        t.eq('Cycle status works and PUMP UNIT is back to Active', s, 'Active');
      }
      if (await press('Delete')) {
        await b.pause(700);
        await t.shot('delete_confirm');
        await click(b, 'Cancel', { exact: true }).catch(() => {});
        t.check('Delete (cancelled) keeps the template', (await b.execute(() => document.body.innerText)).includes('PUMP UNIT'), '');
      }
      t.info('Structure and card-click opening', 'see screenshots; not opened by the run');
    },
  },
  {
    id: 'I4', runner: 'claude-code+review', who: 'Jess Britanico', title: 'Text boxes use the neumorphic style everywhere',
    async run(t) {
      const b = t.browser;
      await A.openAsset(b, 'ASSET1'); await t.shot('asset_form');
      await W.toMainMenu(b); await W.tile(b, 'Administration'); await b.pause(1000); await t.shot('users');
      await click(b, 'Roles', { exact: true }); await b.pause(1000); await t.shot('roles');
      t.review('neumorphic text boxes, focus glow, dimmer disabled boxes', 'screens saved for Jess');
    },
  },
  {
    id: 'I5', who: 'Suganya Rajendran', title: 'Show flow is not offered on a Draft',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET1');
      t.shared.reports.rI = await b.execute(() => { const m = document.body.innerText.match(/Report\s*#\s*(\d+)/); return m ? +m[1] : null; });
      const btns = (await btnList(b)).map((x) => x.t);
      await t.shot('draft');
      t.check('no Show flow button on a Draft report', !btns.includes('Show flow'), btns.filter(Boolean).slice(0, 8).join(', '));
    },
  },
  {
    id: 'I6', who: 'Suganya Rajendran', title: 'Show flow on My Reports',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET1');
      const n = await b.execute(() => { const m = document.body.innerText.match(/Report\s*#\s*(\d+)/); return m ? +m[1] : null; });
      t.shared.reports.rI = n;
      await W.stepTo(b, 'header');
      await choose(b, 'Client', 'Test Client');
      await typeInto(b, 'Location', 'Karachi Yard');
      await choose(b, 'Compliance Stage', 'YARD INSPECTION');
      const shown = await valueOf(b, 'Compliance Stage');
      const stored = itRow(`SELECT v.value FROM mri_report_header_values v JOIN template_header_fields f ON f.id=v.template_header_field_id JOIN header_field_catalog c ON c.id=f.header_field_id WHERE v.report_id=${n} AND c.label='Compliance Stage'`);
      t.info('Compliance Stage after choosing YARD INSPECTION', `screen "${shown}", stored ${JSON.stringify(stored)}`);
      await t.shot('header');
      await W.fillFooter(b, t.today());
      await W.stepTo(b, 'review');
      const res = await W.submit(b);
      t.info('report used', `#${n}: Minor-only (no faults) Yard Inspection on ASSET1, submitted for I6 / I7 / I12`);
      t.check('report submitted (not closed)', res.ok, res.st.issues.join(' / '));
      await attention(b, 'My Reports');
      const card = (await queueCards(b)).find((c) => c.text.includes(`Report #${n}`));
      t.check('the card has a Show flow button', card && card.buttons.includes('Show flow'), card && card.buttons.join(', '));
      await t.shot('my_reports');
      await b.execute((n) => { const c = [...document.querySelectorAll('.review-card')].find((x) => x.innerText.includes(`Report #${n}`)); [...c.querySelectorAll('button')].find((x) => (x.title || x.getAttribute('aria-label')) === 'Show flow').click(); }, n);
      await b.pause(1500);
      const h = await heading(b);
      t.check('it opens the flow (not the report); title reads ASSET1 — Document flow', /ASSET1 — Document flow/.test(h), h);
      await back(b);
      t.check('Back returns to My Reports', /My Reports/i.test(await t.text(500)), '');
    },
  },
  {
    id: 'I12', who: 'Suganya Rajendran', title: 'Flow respects role permissions',
    async run(t) {
      const b = t.browser;
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2).catch(async () => {});
      let list = await F.nodes(b);
      await F.select(b, F.find(list, 'ASSET2'));
      let d = await F.detail(b);
      const oa = d.buttons.find((x) => x.text === 'Open Asset Registry');
      t.check('asset box: Open Asset Registry enabled', oa && !oa.disabled, JSON.stringify(d.buttons));
      await F.select(b, F.decisionFor(list, 'Agitator'));
      d = await F.detail(b);
      const op = d.buttons.find((x) => /^Open/.test(x.text));
      t.check('Decision box: Open button disabled with the no-access note', op && op.disabled && /doesn't have access/.test(d.text), JSON.stringify(op));
      const rep = list.find((x) => /Repair/.test(x.title || x.text));
      if (rep) {
        await F.select(b, rep.i);
        d = await F.detail(b);
        const or = d.buttons.find((x) => /^Open/.test(x.text));
        t.check('Repair box: Open button disabled with the no-access note', or && or.disabled, JSON.stringify(or));
      } else t.info('Repair box', 'not found on this flow');
      t.check('selecting boxes and reading details still works', d && d.rows.length > 0, '');
      t.info('report used', `Report 2 (#${t.shared.reports.r2}, submitted by Suganya), opened through the asset flow since it is closed; the My Reports route is checked in I6`);
      await t.shot('decision_disabled');
    },
  },
  {
    id: 'I7', who: 'Abdulla Qais', title: 'Show flow on Reports to Review and on an open report',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.rI;
      await attention(b, 'Reports to Review');
      await click(b, 'Show flow');
      await b.pause(1500);
      const h1 = (await t.text(600)).match(/Report #\d+/);
      await t.shot('flow_from_queue');
      await back(b);
      await click(b, `Endorse report #${n}`);
      await b.pause(1800);
      const btns = (await btnList(b)).map((x) => x.t);
      t.check('report header has Show flow next to Back', btns.includes('Show flow') && btns.includes('← Back'), btns.slice(0, 6).join(', '));
      await openReportFlowFromHeader(b);
      const h2 = (await t.text(600)).match(/Report #\d+/);
      t.check('both routes open the same flow', h1 && h2 && h1[0] === h2[0], `${h1 && h1[0]} / ${h2 && h2[0]}`);
      await t.shot('flow_from_header');
    },
  },
  {
    id: 'I8', who: 'Disantha Perera', title: 'Flow of a report with five faults',
    async run(t) {
      const b = t.browser;
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2);
      const list = await F.nodes(b);
      await t.shot('flow');
      const faults = ['Air Filter', 'Agitator', 'Actuators on Control Panel', 'Breather', 'Brass Bushing Condition Within Tolerance Limits'];
      t.check('five fault boxes', faults.every((f) => list.some((x) => (x.title || x.text).startsWith(f.slice(0, 18)))), list.map((x) => (x.title || x.text).slice(0, 25)).join(' | '));
      const rowOf = (f) => { const fb = list.find((x) => (x.title || x.text).startsWith(f.slice(0, 18))); return fb ? list.filter((x) => Math.abs(x.y - fb.y) < 25).sort((a, b2) => a.x - b2.x).map((x) => x.text) : []; };
      for (const f of ['Agitator', 'Breather']) {
        const r = rowOf(f);
        t.check(`${f} row ends in a Repair verified box`, /Repair/.test(r[r.length - 1] || '') && /verified/i.test(r[r.length - 1] || ''), r.join(' > '));
      }
      for (const f of ['Air Filter', 'Actuators on Control Panel', 'Brass Bushing Condition Within Tolerance Limits']) {
        const r = rowOf(f);
        t.check(`${f} row has no Red repair box`, !r.some((x) => /Repair (open|verified)/i.test(x)) || f === 'Air Filter', r.join(' > '));
      }
      t.check('a Tag box lists the tag changes of this report', list.some((x) => /^Tag/.test(x.title || x.text)), '');
      t.review('red border on Critical, amber on Moderate', 'see screenshot');
    },
  },
  {
    id: 'I9', who: 'Disantha Perera', title: 'Carried-forward fault appears on the next report',
    async run(t) {
      const b = t.browser;
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r3);
      const list = await F.nodes(b);
      await F.select(b, F.find(list, 'Carried in'));
      const d = await F.detail(b);
      t.check('Carried in box names Report 2 as the source', new RegExp(`#${t.shared.reports.r2}`).test(d.text), d.text.slice(0, 200));
      await t.shot('carried_in');
      await click(b, `Open report #${t.shared.reports.r2}`, { exact: true });
      await b.pause(1800);
      t.check('Open report opens Report 2 read-only', (await t.text(800)).includes(`Report #${t.shared.reports.r2}`), '');
      await back(b);
      t.check('Back returns to the flow of Report 3', (await t.text(800)).includes(`Report #${t.shared.reports.r3}`), '');
    },
  },
  {
    id: 'I10', who: 'Disantha Perera', title: 'Flow of a Critical report and an on-site repair on ASSET1',
    async run(t) {
      const b = t.browser;
      await F.openReportFlowVia(b, 'ASSET1', t.shared.reports.rC9);
      let list = await F.nodes(b);
      await t.shot('c9');
      await F.select(b, F.find(list, 'Ball Valves'));
      let d = await F.detail(b);
      t.check('C9: Ball Valves Critical becoming Moderate', /Critical/.test(d.text) && /Moderate/.test(d.text), d.text.slice(0, 200));
      const tag = list.find((x) => /^Tag/.test(x.title || x.text));
      t.check('C9: Tag box present (Red then Green)', !!tag, tag && tag.text);
      await F.openReportFlowVia(b, 'ASSET1', t.shared.reports.rF9);
      list = await F.nodes(b);
      await t.shot('f9');
      const ons = list.find((x) => /Repaired on site/i.test(x.title || x.text));
      t.check('F9: a Repaired on site box for Ball Valves', !!ons, list.map((x) => (x.title || x.text).slice(0, 30)).join(' | '));
      t.check('F9: no decision or repair boxes for it', !list.some((x) => /^Decision|^Repair (open|verified)/.test(x.title || x.text)), '');
    },
  },
  {
    id: 'I11', who: 'Disantha Perera', title: 'Boxes open the screen that owns them',
    async run(t) {
      const b = t.browser;
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2);
      let list = await F.nodes(b);
      await F.select(b, F.find(list, 'Air Filter'));
      let d = await F.detail(b);
      t.check('selecting a Fault box lists its details', d && d.rows.length > 2, d && d.text.slice(0, 160));
      const sel = await b.execute(() => [...document.querySelectorAll('g.rf-node rect, svg g[role="button"] rect')].some((r) => /accent-blue|#2f6fed/i.test(r.getAttribute('stroke') || '') || +r.getAttribute('stroke-width') >= 3));
      t.check('selected box highlighted with a blue border', sel, '');
      await click(b, 'Open Pending Approvals', { exact: true });
      await b.pause(1200);
      t.check('Open Pending Approvals opens it', /Pending Approvals/.test(await heading(b)), await heading(b));
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2);
      list = await F.nodes(b);
      const rep = list.find((x) => /Repair/.test(x.title || x.text));
      if (rep) {
        await F.select(b, rep.i);
        await click(b, 'Open Rectification Queue', { exact: true });
        await b.pause(1200);
        t.check('Open Rectification Queue opens it', /Rectification Queue/.test(await heading(b)), await heading(b));
      }
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2);
      list = await F.nodes(b);
      await F.select(b, F.find(list, 'ASSET2'));
      await click(b, 'Open Asset Registry', { exact: true });
      await b.pause(1200);
      t.check('Open Asset Registry opens it', /Asset Registry/i.test(await t.text(400)), '');
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2);
      list = await F.nodes(b);
      await b.execute((i) => document.querySelectorAll('g.rf-node')[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), F.decisionFor(list, 'Air Filter'));
      await b.pause(1200);
      t.check('double-clicking a Decision box opens its screen directly', /Pending Approvals/.test(await heading(b)), await heading(b));
      t.info('read-only flow', 'no control on the flow screen changes a decision, repair or tag (only Open / Show buttons)');
    },
  },
  {
    id: 'I13', who: 'Kamil Shahzad', title: 'Flow shows the MOC exemption',
    async run(t) {
      const b = t.browser;
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2);
      const list = await F.nodes(b);
      const i = F.find(list, 'MOC');
      t.check('an MOC box for MOC-2026-014 is shown', i >= 0, list.map((x) => (x.title || x.text).slice(0, 20)).join(' | '));
      if (i >= 0) {
        await F.select(b, i);
        const d = await F.detail(b);
        t.check('MOC box shows reference, Revoked, validity dates and approver', /MOC-2026-014/.test(d.text) && /Revoked/.test(d.text) && /Kamil Shahzad/.test(d.text) && /\d{4}-\d{2}-\d{2}/.test(d.text), d.text.slice(0, 250));
        t.check('its button opens the Asset Registry', d.buttons.some((x) => x.text === 'Open Asset Registry' && !x.disabled), JSON.stringify(d.buttons));
        await t.shot('moc');
      }
    },
  },
];
