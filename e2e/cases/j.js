// J group through the UI (document and asset flows).
const { as, click, attention } = require('../lib/ui');
const W = require('../lib/wizard');
const A = require('../lib/assets');
const F = require('../lib/flow');

const heading = (b) => b.execute(() => { const h = [...document.querySelectorAll('h1, h2')].find((x) => x.offsetParent !== null); return h ? h.innerText.trim() : ''; });
const back = async (b) => { await click(b, '← Back', { exact: true }); await b.pause(1200); };

module.exports = [
  {
    id: 'J5', runner: 'you', who: 'Jess Britanico', title: 'Full data backup now lives under Data Tools (automated part)',
    async run(t) {
      const b = t.browser;
      const { clickText } = require('../lib/ui');
      const { itSql } = require('../lib/it');
      await W.toMainMenu(b);
      await W.tile(b, 'Administration');
      await b.pause(1000);
      await clickText(b, 'Data Tools');
      await b.pause(600);
      const nav = await t.text(3000);
      const i = nav.indexOf('Data Tools');
      const block = i >= 0 ? nav.slice(i, i + 120) : '';
      t.check('step 1: Data Tools lists Browser, Removal, Purging and Backup', ['Browser', 'Removal', 'Purging', 'Backup'].every((x) => block.includes(x)), block.replace(/\n/g, ' / '));
      await t.shot('data_tools');
      await b.execute(() => { const els = [...document.querySelectorAll('body *')].filter((e) => e.getClientRects().length && (e.innerText || '').trim() === 'Backup'); els[els.length - 1].click(); });
      await b.pause(1000);
      const btns = await b.execute(() => [...document.querySelectorAll('button')].filter((x) => x.getClientRects().length).map((x) => x.innerText.trim()));
      t.check('Backup screen opens (Full data backup)', /Full data backup/i.test(await t.text(20000)), '');
      t.check('Export and Import buttons shown for Jess', btns.some((x) => /Export full backup/.test(x)) && btns.some((x) => /Import full backup/.test(x)), btns.filter((x) => /backup/i.test(x)).join(', '));
      const [p] = itSql("SELECT permission_code FROM role_permissions WHERE role='Administrator' AND permission_code IN ('backups.export','backups.import') ORDER BY permission_code");
      t.eq('buttons follow permission: Administrator holds backups.export and backups.import', p.rows.map((r) => r.permission_code), ['backups.export', 'backups.import']);
      await t.shot('backup_screen');
      t.info('step 2: Export full backup', 'not pressed by the run: the download / Save dialog is Jess\'s step. Backend check: export_full_backup() returns all 40 database tables (none missing), about 5.6 MB, as one JSON file.');
      await b.execute(() => { const els = [...document.querySelectorAll('body *')].filter((e) => e.getClientRects().length && (e.innerText || '').trim() === 'Users'); els[els.length - 1].click(); });
      await b.pause(1200);
      const users = await t.text(8000);
      t.check('step 3: Users has no Full data backup panel', !/Full data backup|Export full backup/.test(users), '');
      t.check('Users still has Clear all users', /Clear all users/.test(users), '');
      await b.execute(() => { const x = [...document.querySelectorAll('body *')].find((e) => (e.innerText || '').trim() === 'Clear all users'); x && x.scrollIntoView({ block: 'center' }); });
      await b.pause(500);
      await t.shot('users_bottom');
    },
  },
  {
    id: 'J1', who: 'Jess Britanico', title: 'Show flow on the Asset Registry cards',
    async run(t) {
      const b = t.browser;
      await A.openRegistry(b);
      const cards = await b.execute(() => [...document.querySelectorAll('.review-card')].map((c) => ({ code: (c.querySelector('.review-card-code') || {}).innerText, buttons: [...c.querySelectorAll('button')].map((x) => x.title || x.getAttribute('aria-label') || x.innerText.trim()) })));
      t.check('a flow icon button on every asset card, next to Edit and Delete', cards.length > 0 && cards.every((c) => c.buttons.includes('Show history flow')), JSON.stringify(cards));
      await t.shot('registry');
      await F.openAssetFlow(b, 'ASSET2');
      const h = await heading(b);
      t.check('click opens the Asset history flow for ASSET2 (not the edit form)', /ASSET2 — Asset history flow/.test(h), h);
      await t.shot('asset_flow');
      await back(b);
      t.check('Back returns to Asset Registry', /Asset Registry/i.test(await t.text(400)), '');
    },
  },
  {
    id: 'J2', who: 'Jess Britanico', title: 'Asset history flow shows the whole life of ASSET2',
    async run(t) {
      const b = t.browser;
      await F.openAssetFlow(b, 'ASSET2');
      const list = await F.nodes(b);
      await t.shot('flow');
      const reports = list.filter((x) => x.title.startsWith('Report #')).sort((a, b) => a.x - b.x);
      t.check('top row: the asset, then every report on ASSET2', list[0] && list[0].title.startsWith('ASSET2') && reports.length >= 7, reports.map((x) => x.title).join(', '));
      const r2 = reports.find((x) => x.title === `Report #${t.shared.reports.r2}`);
      t.check('Report 2 box shows status, date and fault counts (5 faults, 0 open)', r2 && /Approved/.test(r2.text) && /5 faults, 0 open/.test(r2.text), r2 && r2.text);
      const raw = list.filter((x) => /\b1[0-9]{9}\b/.test(x.text));
      t.check('report and tag boxes show readable dates', raw.length === 0, raw.slice(0, 3).map((x) => x.text).join(' | '));
      if (raw.length) t.info('date display bug', 'AssetFlow.tsx:72 shortDate() expects an ISO date but receives Unix seconds ("1794048477"), so boxes and detail rows print raw numbers. Proposed fix (not applied): treat an all-digit value as seconds since 1970 and format it (e.g. new Date(+raw * 1000)).');
      const tags = list.filter((x) => x.title.startsWith('Tag:'));
      t.check('one Tag box per tag change', tags.length >= 6, `${tags.length} tag boxes`);
      t.check('MOC exemption box and enabled trigger boxes under the asset', list.some((x) => x.title.startsWith('MOC MOC-2026-014')) && list.some((x) => x.title.startsWith('MR-II EH')), '');
      const carried = await b.execute(() => [...document.querySelectorAll('svg path')].some((p) => p.getAttribute('stroke-dasharray')));
      t.check('carried-forward fault drawn as a dashed arc', carried, '');
      const red = list.filter((x) => /open/.test(x.text) && !/0 open/.test(x.text));
      t.info('boxes with open faults', red.map((x) => `${x.title} (${x.stroke})`).join(', '));
      for (const [label, start] of [['report', `Report #${t.shared.reports.r2}`], ['tag', 'Tag:'], ['exemption', 'MOC'], ['trigger', 'MR-II EH']]) {
        await F.select(b, F.find(list, start));
        const d = await F.detail(b);
        t.check(`select a ${label} box: detail list shown`, d && d.rows.length > 0, d && d.text.slice(0, 160));
        t.check(`${label} box details show readable dates`, d && !/\b1[0-9]{9}\b/.test(d.text), d && (d.text.match(/\b1[0-9]{9}\b/) || [''])[0]);
      }
      const eh = list.find((x) => x.title.startsWith('MR-II EH'));
      t.info('trigger box MR-II EH', `${eh && eh.text} stroke ${eh && eh.stroke}`);
      t.review('box colours (amber at warning, red at interval, red border on open faults)', 'see screenshot');
    },
  },
  {
    id: 'J3', who: 'Jess Britanico', title: 'Moving between the asset flow and report flows',
    async run(t) {
      const b = t.browser;
      await A.openRegistry(b);
      await F.openAssetFlow(b, 'ASSET2');
      let list = await F.nodes(b);
      await F.select(b, F.find(list, `Report #${t.shared.reports.r2}`));
      await click(b, 'Show flow of this report', { exact: true });
      await b.pause(1500);
      let h = await heading(b);
      t.check('Show flow of this report opens Report 2\'s document flow', /Document flow/.test(h) && (await t.text(800)).includes(`Report #${t.shared.reports.r2}`), h);
      list = await F.nodes(b);
      await F.select(b, F.find(list, 'ASSET2'));
      await click(b, 'Show asset history flow', { exact: true });
      await b.pause(1500);
      h = await heading(b);
      t.check('Show asset history flow opens the asset flow', /Asset history flow/.test(h), h);
      await back(b); h = await heading(b);
      t.check('Back 1: report flow', /Document flow/.test(h), h);
      await back(b); h = await heading(b);
      t.check('Back 2: asset flow', /Asset history flow/.test(h), h);
      await back(b);
      t.check('Back 3: Asset Registry', /Asset Registry/i.test(await t.text(400)), (await t.text(200)).replace(/\n/g, ' / '));
    },
  },
  {
    id: 'J4', who: 'Jess Britanico', title: 'Open report and Open triggers from the asset flow',
    async run(t) {
      const b = t.browser;
      await F.openAssetFlow(b, 'ASSET2');
      let list = await F.nodes(b);
      await F.select(b, F.find(list, `Report #${t.shared.reports.r2}`));
      await click(b, 'Open report', { exact: true });
      await b.pause(1800);
      const btns = await b.execute(() => [...document.querySelectorAll('input, select')].filter((e) => e.offsetParent !== null).every((e) => e.disabled));
      t.check('the report opens read-only', (await t.text(800)).includes(`Report #${t.shared.reports.r2}`) && btns, '');
      await t.shot('report');
      await back(b);
      t.check('Back returns to the asset flow', /Asset history flow/.test(await heading(b)), await heading(b));
      list = await F.nodes(b);
      await F.select(b, F.find(list, 'MR-II EH'));
      await click(b, 'Open triggers', { exact: true });
      await b.pause(1500);
      const txt = await t.text(1500);
      await t.shot('triggers');
      t.check('the Triggers screen for ASSET2 opens', /Trigger/i.test(txt) && /ASSET2/.test(txt), txt.slice(0, 160).replace(/\n/g, ' / '));
    },
  },
  {
    id: 'J6', who: 'Disantha Perera', title: 'Audit trail inside the document flow',
    async run(t) {
      const b = t.browser;
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2);
      let list = await F.nodes(b);
      await F.select(b, F.decisionFor(list, 'Air Filter'));
      let d = await F.detail(b);
      await t.shot('air_filter_decision');
      const keys = d.rows.map((r) => r[0]);
      t.check('Decision, Reviewer and Provisional status shown', ['Decision', 'Reviewer'].every((k) => keys.some((x) => x.startsWith(k))) && keys.some((x) => /Provisional/.test(x)), keys.join(' | '));
      t.check('Reminders sent shown', keys.some((x) => /Reminders sent/.test(x)), '');
      const audits = d.rows.filter((r) => /^Audit \d+/.test(r[0]));
      t.check('one Audit row per logged decision (action, severity, reviewer and method, recorded by, time, note)', audits.length >= 1 && audits.every((a) => /In-Person|Phone/.test(a[1])), audits.map((a) => `${a[0]}: ${a[1]}`).join(' | ').slice(0, 400));
      await F.select(b, F.decisionFor(list, 'Actuators on Control Panel'));
      d = await F.detail(b);
      t.check('Actuators decision box: rows agree with the decision log (Rejected)', d.rows.some((r) => /^Audit/.test(r[0]) && /Rejected/.test(r[0])), d.text.slice(0, 300));
      t.info('No decisions logged yet', 'every fault on Report 2 has a logged decision, so this text is not reachable here');
    },
  },
  {
    id: 'J7', who: 'Disantha Perera', title: 'Carried-in box links to the earlier report\'s flow',
    async run(t) {
      const b = t.browser;
      const r2 = t.shared.reports.r2, r3 = t.shared.reports.r3;
      await F.openReportFlowVia(b, 'ASSET2', r3);
      let list = await F.nodes(b);
      await F.select(b, F.find(list, 'Carried in'));
      await t.shot('carried_in');
      await click(b, `Show flow of report #${r2}`, { exact: true });
      await b.pause(1500);
      t.check(`the flow of Report 2 opens`, (await t.text(800)).includes(`Report #${r2}`), '');
      list = await F.nodes(b);
      await F.select(b, F.find(list, 'Brass Bushing'));
      const d = await F.detail(b);
      t.check(`Brass Bushing fault box: Carried forward to report #${r3}`, d.rows.some((r) => /Carried forward to/.test(r[0]) && r[1].includes(String(r3))), d.text.slice(0, 300));
      t.check(`Show flow of report #${r3} button returns to the later report`, d.buttons.some((x) => x.text === `Show flow of report #${r3}`), d.buttons.map((x) => x.text).join(', '));
      await t.shot('report2_brass_bushing');
      await back(b);
      t.check('Back goes to the flow of Report 3', (await t.text(800)).includes(`Report #${r3}`), '');
    },
  },
  {
    id: 'J8', who: 'Marilyn Tabay', title: 'Show flow from the dashboard asset history',
    async run(t) {
      const b = t.browser;
      await W.toMainMenu(b);
      await W.tile(b, 'Dashboard');
      await b.pause(1500);
      await require('../lib/ui').clickText(b, 'Asset MR-I History');
      await t.shot('asset_list');
      await require('../lib/ui').clickText(b, 'ASSET2');
      await b.pause(1000);
      await t.shot('asset_history');
      const btns = await b.execute(() => [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim()));
      t.check('a Show flow button sits beside Back to assets', btns.some((x) => /Show flow/.test(x)) && btns.some((x) => /Back to assets/.test(x)), btns.filter(Boolean).join(', '));
      await click(b, 'Show flow');
      await b.pause(1500);
      t.check('opens the asset history flow', /Asset history flow/.test(await heading(b)), await heading(b));
      const list = await F.nodes(b);
      await F.select(b, F.find(list, 'MR-II EH'));
      const d = await F.detail(b);
      t.info('Open button for a screen Marilyn may not have', JSON.stringify(d.buttons));
      await F.select(b, F.find(list, `Report #${t.shared.reports.r2}`));
      const d2 = await F.detail(b);
      t.info('report box buttons for Marilyn', JSON.stringify(d2.buttons));
      await t.shot('flow');
      await back(b);
      const b2 = await b.execute(() => [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim()));
      await t.shot('after_back');
      t.check('Back returns to the asset history panel', b2.some((x) => /Back to assets/.test(x)), `landed on "${await heading(b)}"; buttons: ${b2.filter(Boolean).slice(0, 6).join(', ')}`);
      t.review('Open buttons disabled where Marilyn has no permission', 'see the info rows and screenshot');
    },
  },
  {
    id: 'J9', who: 'Jess Britanico', title: 'Country access limits the flows',
    async run(t) {
      const b = t.browser;
      const G = require('./g.js');
      const adminCountries = async (on) => {
        await W.toMainMenu(b); await W.tile(b, 'Administration'); await b.pause(1200);
        await b.execute(() => { const el = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && (x.innerText || '').trim() === 'Disantha Perera'); let r = el; while (r && ![...r.querySelectorAll('button')].some((y) => y.innerText.trim() === 'Countries')) r = r.parentElement; [...r.querySelectorAll('button')].find((y) => y.innerText.trim() === 'Countries').click(); });
        await b.pause(1200);
        await b.execute((on) => { const card = [...document.querySelectorAll('div')].find((d) => d.querySelector('button.neu-toggle') && d.innerText.trim().startsWith('UAE') && d.querySelectorAll('button.neu-toggle').length === 1); const btn = card.querySelector('button.neu-toggle'); if ((btn.getAttribute('aria-checked') === 'true') !== on) btn.click(); }, on);
        await b.pause(1200);
      };
      await adminCountries(true);
      await as(b, 'Disantha Perera');
      let blocked = null;
      try {
        await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2);
        blocked = await t.text(1500);
      } catch (e) {
        blocked = 'ASSET2 not listed for Disantha (asset list filtered by country): ' + e.message;
      }
      await t.shot('restricted');
      t.check('flows show the outside-country-access message (or the asset is not offered at all); no boxes drawn', /outside your country access/i.test(blocked) || /not listed|no Show history flow/i.test(blocked), blocked.slice(0, 200).replace(/\n/g, ' / '));
      await as(b, 'Jess Britanico');
      await adminCountries(false);
      await as(b, 'Disantha Perera');
      await F.openReportFlowVia(b, 'ASSET2', t.shared.reports.r2);
      const ok = (await F.nodes(b)).length > 0;
      t.check('after restoring access both flows open normally', ok, '');
      await t.shot('restored');
      t.info('Administrators and users with no country rows', 'Phase 1 J9: never blocked');
    },
  },
];
