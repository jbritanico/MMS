// G and H groups through the UI.
const { as, signOut, signIn, click, attention, queueCards, typeInto, choose, valueOf } = require('../lib/ui');
const W = require('../lib/wizard');
const A = require('../lib/assets');
const F = require('../lib/flow');
const { itSql, itRow } = require('../lib/it');

const reportNo = (b) => b.execute(() => { const m = document.body.innerText.match(/Report\s*#\s*(\d+)/); return m ? +m[1] : null; });
const visibleButtons = (b) => b.execute(() => [...document.querySelectorAll('button')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.trim() || x.getAttribute('aria-label') || ''));

// Open a report read-only through its asset's history flow (works for any role with flow access).
async function openViaFlow(b, code, n) {
  await F.openAssetFlow(b, code);
  const list = await F.nodes(b);
  await F.select(b, F.find(list, `Report #${n}`));
  await click(b, 'Open report', { exact: true });
  await b.pause(1800);
}

// Reports to Review > Awaiting MR cost > "Enter cost" on the card of report #n (its own card only).
async function openEnterCost(b, n) {
  await attention(b, 'Reports to Review');
  const ok = await b.execute((n) => {
    const re = new RegExp(`Report #${n}(?!\\d)`);
    const cards = [...document.querySelectorAll('body *')].filter((x) => x.offsetParent !== null && re.test(x.innerText || '') && [...x.querySelectorAll('button')].filter((y) => y.innerText.trim() === 'Enter cost').length === 1);
    cards.sort((a, c) => a.innerText.length - c.innerText.length);
    if (!cards[0]) return false;
    [...cards[0].querySelectorAll('button')].find((y) => y.innerText.trim() === 'Enter cost').click();
    return true;
  }, n);
  if (!ok) throw new Error(`report #${n} not under Awaiting MR cost`);
  await b.pause(1800);
}

async function costPanel(b) {
  return b.execute(() => {
    const p = [...document.querySelectorAll('.mri-top-card')].find((x) => /Cost to perform the MR/.test(x.innerText));
    if (!p) return null;
    return { text: p.innerText.replace(/\s+/g, ' '), hasInput: !!p.querySelector('input'), buttons: [...p.querySelectorAll('button')].map((x) => x.innerText.trim()) };
  });
}

async function adminUser(b, name, button) {
  await W.toMainMenu(b);
  await W.tile(b, 'Administration');
  await b.pause(1200);
  const ok = await b.execute((name, button) => {
    const el = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && x.innerText && x.innerText.trim() === name);
    let row = el; while (row && !([...row.querySelectorAll('button')].some((y) => y.innerText.trim() === button))) row = row.parentElement;
    const btn = row && [...row.querySelectorAll('button')].find((y) => y.innerText.trim() === button);
    if (!btn) return false; btn.click(); return true;
  }, name, button);
  if (!ok) throw new Error(`no ${button} for ${name}`);
  await b.pause(1200);
}

// Toggle a switch card by its visible label; returns aria-checked after.
async function setSwitch(b, labelStart, on) {
  const r = await b.execute((l, on) => {
    const card = [...document.querySelectorAll('[role="switch"], [role="radio"]')].map((s) => s.closest('div[role="switch"]') || s.parentElement.parentElement).find((c) => c && c.innerText.trim().startsWith(l)) ||
      [...document.querySelectorAll('div')].find((d) => d.querySelector('button.neu-toggle') && d.innerText.trim().startsWith(l) && d.querySelectorAll('button.neu-toggle').length === 1);
    if (!card) return 'missing';
    const btn = card.querySelector('button.neu-toggle');
    if ((btn.getAttribute('aria-checked') === 'true') !== on) btn.click();
    return 'ok';
  }, labelStart, on);
  await b.pause(1200);
  return r;
}

async function resetOverride(b, labelStart) {
  await b.execute((l) => {
    const card = [...document.querySelectorAll('div[role="switch"]')].find((c) => c.innerText.includes(l));
    const r = card && [...card.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Reset');
    r && r.click();
  }, labelStart);
  await b.pause(1200);
}

module.exports = [
  {
    id: 'G1', who: 'Suganya Rajendran', title: 'Submit Report G1 (ASSET2) for the permission tests',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET2', 'Left');
      const n = await reportNo(b);
      t.shared.reports.rG1 = n;
      await W.stepTo(b, 'header');
      await choose(b, 'Client', 'Test Client');
      await typeInto(b, 'Location', 'Test Well TW-21');
      await choose(b, 'Compliance Stage', 'PRE-JOB');
      await typeInto(b, 'Pre-Mobilization Checklist ID', 'PMC-2026-0104');
      await W.stepTo(b, 'checklist');
      const fails = await b.execute(() => [...document.querySelectorAll('button.danger')].filter((x) => x.innerText.trim() === 'Fail').length);
      t.eq('all items Pass (no carried Fails)', fails, 0);
      await W.fillFooter(b, t.today());
      await W.stepTo(b, 'review');
      const res = await W.submit(b);
      t.check('Report G1 is Submitted', res.ok, res.st.issues.join(' / '));
    },
  },
  {
    id: 'G2', who: 'Marilyn Tabay', title: 'View only',
    async run(t) {
      const b = t.browser;
      await openViaFlow(b, 'ASSET2', t.shared.reports.rG1);
      await t.shot('report_view');
      const btns = await visibleButtons(b);
      t.check('she can view the report', await b.execute((n) => document.body.innerText.includes(`Report #${n}`), t.shared.reports.rG1), '');
      t.check('no Submit, Endorse, Close or decision control', !btns.some((x) => /^(Submit Report|Endorse Report|Close & Approve Report|Close Report|Approve|Reject|Reclassify)/.test(x)), btns.filter(Boolean).join(', '));
      const c = await costPanel(b);
      t.check('no cost control', !c || !c.hasInput, c && c.text);
    },
  },
  {
    id: 'G3', who: 'Jess Britanico', title: 'Override: edit after submit',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.rG1;
      await adminUser(b, 'Suganya Rajendran', 'Permissions');
      t.check('override set', (await setSwitch(b, 'Edit MR-I after submission', true)) === 'ok', '');
      await t.shot('override_on');
      await as(b, 'Suganya Rajendran');
      await attention(b, 'My Reports');
      await click(b, `View report #${n}`);
      await b.pause(1800);
      await W.stepTo(b, 'header');
      const editable = await b.execute(() => { const r = [...document.querySelectorAll('.mri-preview-table-row')].find((x) => /^Location/.test(x.querySelector('label').innerText)); return r && !r.querySelector('input').disabled; });
      t.check('Location editable while the override exists', editable, '');
      if (editable) await typeInto(b, 'Location', 'Test Well TW-22');
      const row = itRow(`SELECT v.value, v.updated_by FROM mri_report_header_values v JOIN template_header_fields f ON f.id=v.template_header_field_id JOIN header_field_catalog c ON c.id=f.header_field_id WHERE v.report_id=${n} AND c.label='Location'`);
      t.eq('Location saved as Test Well TW-22', row && row.value, 'Test Well TW-22');
      await t.shot('edited');
      await as(b, 'Jess Britanico');
      await adminUser(b, 'Suganya Rajendran', 'Permissions');
      await resetOverride(b, 'Edit MR-I after submission');
      await as(b, 'Suganya Rajendran');
      await attention(b, 'My Reports');
      await click(b, `View report #${n}`);
      await b.pause(1800);
      await W.stepTo(b, 'header');
      const locked = await b.execute(() => { const r = [...document.querySelectorAll('.mri-preview-table-row')].find((x) => /^Location/.test(x.querySelector('label').innerText)); return r && r.querySelector('input').disabled; });
      t.check('locked again after the override is removed', locked, '');
      await t.shot('locked_again');
    },
  },
  {
    id: 'G4', who: 'Jess Britanico', title: 'Override: endorse',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.rG1;
      const check = async () => {
        await as(b, 'Suganya Rajendran');
        await attention(b, 'My Reports');
        await click(b, `View report #${n}`);
        await b.pause(1800);
        return (await visibleButtons(b)).some((x) => /^(Close & Approve Report|Endorse Report)$/.test(x));
      };
      await adminUser(b, 'Suganya Rajendran', 'Permissions');
      await setSwitch(b, 'Endorse a submitted MR-I report', true);
      t.check('Endorse control appears with the override', await check(), '');
      await t.shot('endorse_shown');
      await as(b, 'Jess Britanico');
      await adminUser(b, 'Suganya Rajendran', 'Permissions');
      await resetOverride(b, 'Endorse a submitted MR-I report');
      t.check('Endorse control disappears when the override is removed', !(await check()), '');
    },
  },
  {
    id: 'G5', who: 'Jess Britanico', title: 'Country restriction',
    async run(t) {
      const b = t.browser;
      await adminUser(b, 'Abdulla Qais', 'Countries');
      const r = await setSwitch(b, 'UAE', true);
      const saved = itRow("SELECT group_concat(country) AS c FROM user_country_access WHERE user_id=(SELECT id FROM app_users WHERE name='Abdulla Qais')");
      t.check('Abdulla limited to UAE (saved)', r === 'ok' && saved && saved.c === 'UAE', JSON.stringify(saved));
      await t.shot('restricted');
      await as(b, 'Abdulla Qais');
      await A.openRegistry(b);
      const assets = await b.execute(() => [...document.querySelectorAll('.review-card-code')].map((x) => x.innerText));
      const hidden = !assets.includes('ASSET1') && !assets.includes('ASSET2');
      t.check('no PAKISTAN assets in the asset list', hidden, assets.join(', '));
      if (!hidden) t.info('cause', 'the Asset Registry lists every asset: neither get_assets nor AssetRegistry.tsx applies the user\'s country access (only the review queues and flows do). Proposed fix (not applied): filter the asset list by the signed-in user\'s country access unless they are an Administrator or have no country rows.');
      await t.shot('asset_list');
      await W.toMainMenu(b); await W.tile(b, 'Maintenance Report'); await click(b, 'I', { exact: true }); await b.pause(1000);
      const sel = await b.execute(() => [...document.querySelectorAll('.asset-select-code')].map((x) => x.innerText.trim()));
      t.check('no PAKISTAN assets on Select Asset for a new MR-I report', !sel.includes('ASSET1') && !sel.includes('ASSET2'), sel.join(', ') || 'none listed');
      await t.shot('select_asset');
      const cards = await attention(b, 'Reports to Review').catch(() => null);
      const q = cards ? await queueCards(b) : [];
      t.check('no PAKISTAN reports in the report list', !q.some((x) => /ASSET[12]/.test(x.code || '')), q.map((x) => x.text).join(' / ') || 'no Reports to Review entry');
      await as(b, 'Jess Britanico');
      await adminUser(b, 'Abdulla Qais', 'Countries');
      await click(b, 'Clear', {}).catch(async () => setSwitch(b, 'UAE', false));
      await setSwitch(b, 'UAE', false);
      await as(b, 'Abdulla Qais');
      await A.openRegistry(b);
      const back = await b.execute(() => [...document.querySelectorAll('.review-card-code')].map((x) => x.innerText));
      t.check('all return afterwards', back.includes('ASSET1') && back.includes('ASSET2'), back.join(', '));
      const ca = itRow("SELECT COUNT(*) AS n FROM user_country_access WHERE user_id=(SELECT id FROM app_users WHERE name='Abdulla Qais')");
      t.eq('restriction removed', ca && ca.n, 0);
      // Agreed rule: the Maintenance Manager / FSM (and Administrator) always see every asset.
      await as(b, 'Jess Britanico');
      await adminUser(b, 'Kamil Shahzad', 'Countries');
      await setSwitch(b, 'UAE', true);
      const kc = itRow("SELECT group_concat(country) AS c FROM user_country_access WHERE user_id=(SELECT id FROM app_users WHERE name='Kamil Shahzad')");
      await as(b, 'Kamil Shahzad');
      await A.openRegistry(b);
      const kAssets = await b.execute(() => [...document.querySelectorAll('.review-card-code')].map((x) => x.innerText));
      t.check(`FSM with a country row (${kc && kc.c}) still sees every asset`, kAssets.includes('ASSET1') && kAssets.includes('ASSET2'), kAssets.join(', '));
      await t.shot('fsm_asset_list');
      await as(b, 'Jess Britanico');
      await adminUser(b, 'Kamil Shahzad', 'Countries');
      await setSwitch(b, 'UAE', false);
      const kc2 = itRow("SELECT COUNT(*) AS n FROM user_country_access WHERE user_id=(SELECT id FROM app_users WHERE name='Kamil Shahzad')");
      t.eq('Kamil\'s test country row removed again', kc2 && kc2.n, 0);
    },
  },
  {
    id: 'G6', who: 'Jess Britanico', title: 'Administrator is not a workflow actor',
    async run(t) {
      const b = t.browser;
      await openViaFlow(b, 'ASSET2', t.shared.reports.rG1);
      const btns = await visibleButtons(b);
      t.check('no Endorse, Close or decision control on Report G1', !btns.some((x) => /^(Endorse Report|Close & Approve Report|Close Report|Approve|Reject)$/.test(x)), btns.filter(Boolean).join(', '));
      await t.shot('report');
      await A.openAsset(b, 'ASSET2');
      const p = await A.exemptionPanel(b);
      t.check('no exemption control (no Record exemption / Revoke)', !p || !p.buttons.some((x) => /Record exemption|Revoke/.test(x)), p ? p.buttons.join(', ') : 'exemption area not shown (unit Green)');
      await W.toMainMenu(b);
      t.check('Jess has no Attention Required tab', !(await (await b.$('button[aria-label="Open Fault Review"]')).isExisting()), '');
      t.info('absent from reviewer lists', 'checked on screen in B7 / C5 / C10 (pickers never list Jess) and in Phase 1 (G6)');
    },
  },
  {
    id: 'G7', title: 'Who and when stamps',
    async run(t) {
      const [r] = itSql(`SELECT updated_by, updated_at FROM mri_report_header_values WHERE report_id = ${t.shared.reports.rG1}`);
      t.check('IT query ran', r.ok, r.error || '');
      const loc = r.rows.filter((x) => x.updated_by);
      t.check('the last editor and time are recorded', loc.length > 0 && loc.every((x) => x.updated_at), JSON.stringify(r.rows.slice(0, 4)));
    },
  },
  {
    id: 'H1', who: 'Suganya Rajendran', title: 'Cost panel is read-only for the Operator and Job Supervisor',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.rG1;
      await attention(b, 'My Reports');
      await click(b, `View report #${n}`);
      await b.pause(1800);
      let c = await costPanel(b);
      t.check('Suganya: Not yet entered, no input', c && /Not yet entered/.test(c.text) && !c.hasInput, c && c.text);
      await t.shot('suganya');
      await as(b, 'Abdulla Qais');
      await attention(b, 'Reports to Review');
      await click(b, `Endorse report #${n}`);
      await b.pause(1800);
      c = await costPanel(b);
      t.check('Abdulla: Not yet entered, no input', c && /Not yet entered/.test(c.text) && !c.hasInput, c && c.text);
      await t.shot('abdulla');
    },
  },
  {
    id: 'H2', who: 'Jan-Albert Victorino', title: 'Awaiting MR cost list',
    async run(t) {
      const b = t.browser;
      await attention(b, 'Reports to Review');
      const txt = await t.text(6000);
      await t.shot('awaiting_cost');
      const i = txt.indexOf('Awaiting MR cost');
      const part = i >= 0 ? txt.slice(i) : '';
      t.check('Report G1 (ASSET2) and Report F9 (ASSET1) listed under Awaiting MR cost with Enter cost', new RegExp(`#${t.shared.reports.rG1}`).test(part) && new RegExp(`#${t.shared.reports.rF9}`).test(part) && /Enter cost/.test(part), part.slice(0, 300).replace(/\n/g, ' / '));
    },
  },
  {
    id: 'H3', who: 'Jan-Albert Victorino', title: 'Enter the cost',
    async run(t) {
      const b = t.browser;
      const n = t.shared.reports.rG1;
      await openEnterCost(b, n);
      t.check(`Enter cost opens Report G1 (#${n})`, await b.execute((n) => new RegExp(`Report #${n}(?!\\d)`).test(document.body.innerText), n), '');
      const enter = async (v) => {
        await b.execute(() => { document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e')); [...document.querySelectorAll('.mri-top-card')].find((x) => /Cost to perform the MR/.test(x.innerText)).querySelector('input').setAttribute('data-e2e', '1'); });
        const el = await b.$('[data-e2e="1"]'); await el.click(); await b.keys(['Control', 'a']); await b.keys('Backspace'); if (v) await b.keys(v.split(''));
        await b.execute(() => [...[...document.querySelectorAll('.mri-top-card')].find((x) => /Cost to perform the MR/.test(x.innerText)).querySelectorAll('button')].find((x) => /cost/i.test(x.innerText)).click());
        await b.pause(1500);
        return costPanel(b);
      };
      let c = await enter('2500');
      t.check('2500 saved', /MR cost saved/.test(c.text), c.text);
      c = await enter('2650');
      t.check('changed to 2650: panel shows amount and name', /Recorded: 2,650 · by Jan-Albert Victorino/.test(c.text), c.text);
      const dateShown = (c.text.match(/by Jan-Albert Victorino · (\S+)/) || [])[1];
      t.check('panel shows the date', !!dateShown && !/^\d{9,11}$/.test(dateShown), `shown: ${dateShown}`);
      if (/^\d{9,11}$/.test(dateShown || '')) t.info('date display', 'the panel prints the stored Unix seconds; proposed fix: format mr_cost_date as a date (ReportWizard.tsx:5928)');
      await t.shot('cost_saved');
      await attention(b, 'Reports to Review');
      const txt = await t.text(6000);
      const part = txt.indexOf('Awaiting MR cost') >= 0 ? txt.slice(txt.indexOf('Awaiting MR cost')) : '';
      t.check('Report G1 leaves the awaiting list', !new RegExp(`#${n}\\b`).test(part), part.slice(0, 200).replace(/\n/g, ' / '));
    },
  },
  {
    id: 'H4', who: 'Jan-Albert Victorino', title: 'Invalid costs are refused',
    async run(t) {
      const b = t.browser;
      await openEnterCost(b, t.shared.reports.rF9);
      for (const v of ['', '-100']) {
        await b.execute(() => { document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e')); [...document.querySelectorAll('.mri-top-card')].find((x) => /Cost to perform the MR/.test(x.innerText)).querySelector('input').setAttribute('data-e2e', '1'); });
        const el = await b.$('[data-e2e="1"]'); await el.click(); await b.keys(['Control', 'a']); await b.keys('Backspace'); if (v) await b.keys(v.split(''));
        await b.execute(() => [...[...document.querySelectorAll('.mri-top-card')].find((x) => /Cost to perform the MR/.test(x.innerText)).querySelectorAll('button')].find((x) => /cost/i.test(x.innerText)).click());
        await b.pause(1000);
        const c = await costPanel(b);
        t.check(`"${v || 'blank'}" refused with Enter a valid cost (0 or more)`, /Enter a valid cost \(0 or more\)\./.test(c.text) && !/Recorded:/.test(c.text), c.text);
      }
      await t.shot('refused');
    },
  },
  {
    id: 'H5', who: 'Abdulla Qais', title: 'Closing never depends on cost',
    async run(t) {
      const b = t.browser;
      for (const n of [t.shared.reports.rF9, t.shared.reports.rG1]) {
        await attention(b, 'Reports to Review');
        await click(b, `Endorse report #${n}`);
        await b.pause(1800);
        await click(b, 'Close & Approve Report', { exact: true });
        await b.pause(2000);
        const row = itRow(`SELECT status, mr_cost FROM mri_reports WHERE id=${n}`);
        t.check(`report #${n} Approved (cost ${row && row.mr_cost})`, row && row.status === 'Approved', JSON.stringify(row));
      }
      await t.shot('closed');
    },
  },
  {
    id: 'H6', who: 'Suganya Rajendran', title: 'No cost panel on a Draft',
    async run(t) {
      const b = t.browser;
      await W.openMR1(b, 'ASSET1');
      const n = await reportNo(b);
      t.shared.reports.rH6 = n;
      await as(b, 'Jan-Albert Victorino');
      await openViaFlow(b, 'ASSET1', n);
      await t.shot('draft');
      t.check('Jan-Albert opens the Draft', await b.execute((n) => document.body.innerText.includes(`Report #${n}`), n), '');
      t.eq('the cost panel is not shown', await costPanel(b), null);
    },
  },
  {
    id: 'H7', title: 'Login-screen tier labels',
    async run(t) {
      const b = t.browser;
      await signOut(b);
      const want = { 'Marilyn Tabay': 'READ ONLY', 'Suganya Rajendran': 'TIER 1', 'Abdulla Qais': 'TIER 2', 'Jan-Albert Victorino': 'TIER 2', 'Disantha Perera': 'TIER 2', 'Kamil Shahzad': 'TIER 3', 'Jess Britanico': 'IT / ADMIN (NO TIER)' };
      const seen = {};
      for (let i = 0; i < 8; i++) {
        const s = await b.execute(() => { const t = document.body.innerText; const m = t.match(/ROLE & RESPONSIBILITIES · ([^\n]+)\n([^\n]+)\n([^\n]+)/); return m ? [m[1], m[2], m[3]] : null; });
        if (s) seen[s[0]] = s[2];
        await (await b.$('button[aria-label="Next user"]')).click();
        await b.pause(400);
      }
      await t.shot('picker');
      for (const [n, tier] of Object.entries(want)) t.eq(`${n}: ${tier}`, (seen[n.toUpperCase()] || '').toUpperCase(), tier);
    },
  },
  {
    id: 'H8', title: 'Migration state',
    async run(t) {
      const [m] = itSql('SELECT name FROM app_migrations');
      t.check('mri1_audit_permissions present', m.rows.some((x) => x.name === 'mri1_audit_permissions'), JSON.stringify(m.rows));
      const snap = () => JSON.stringify(itSql('SELECT role, permission_code FROM role_permissions ORDER BY role, permission_code')[0].rows);
      const s1 = snap(); const s2 = snap();
      t.check('nothing changes on later launches (two more app-code launches of the database)', s1 === s2, '');
      t.info('restart', 'each IT query opens the database through the app\'s own open-and-migrate code; Phase 1 H8 also ran the migration twice');
    },
  },
];
