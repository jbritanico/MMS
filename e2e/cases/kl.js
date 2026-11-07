// K and L groups: theme picker (K1 checked) and look-and-feel screenshots for Jess (review).
const { as, signOut, click, clickText } = require('../lib/ui');
const W = require('../lib/wizard');
const A = require('../lib/assets');

const drawerOpen = (b) => b.execute(() => [...document.querySelectorAll('.theme-option')].some((x) => x.getClientRects().length > 0));

async function pickTheme(b, name) {
  await W.toMainMenu(b);
  if (!(await drawerOpen(b))) { await click(b, 'Open menu'); await b.pause(600); }
  const ok = await b.execute((name) => { const x = [...document.querySelectorAll('.theme-option')].find((y) => y.innerText.trim() === name && y.getClientRects().length > 0); if (!x) return false; x.click(); return true; }, name);
  await b.pause(900);
  if (await drawerOpen(b)) { await b.execute(() => { const o = document.querySelector('.side-drawer-overlay'); o && o.click(); }); await b.pause(500); }
  await W.toMainMenu(b);
  if (!ok) throw new Error(`theme ${name} not offered`);
  return ok;
}

const themeAttr = (b) => b.execute(() => { const a = document.querySelector('.app'); return a ? (a.dataset.theme || a.className) : document.documentElement.dataset.theme; });

// Screens captured in each theme.
async function tour(t, b, theme) {
  const tag = theme.replace(/\s+/g, '_');
  await W.toMainMenu(b); await t.shot(`${tag}_main_menu`);
  await A.openRegistry(b); await t.shot(`${tag}_asset_registry`);
  await W.toMainMenu(b); await W.tile(b, 'Maintenance Report'); await click(b, 'I', { exact: true }); await b.pause(900); await t.shot(`${tag}_select_asset`);
  await W.toMainMenu(b); await W.tile(b, 'Dashboard'); await b.pause(800); await clickText(b, 'Asset MR-I History'); await t.shot(`${tag}_dashboard`);
  await W.toMainMenu(b); await W.tile(b, 'Administration'); await b.pause(900); await t.shot(`${tag}_admin_users`);
}

const review = (id, title, fn) => ({ id, runner: 'claude-code+review', who: 'Jess Britanico', title, run: fn });

module.exports = [
  {
    id: 'K1', who: 'Jess Britanico', title: 'Theme picker offers three themes',
    async run(t) {
      const b = t.browser;
      await W.toMainMenu(b);
      if (!(await drawerOpen(b))) { await click(b, 'Open menu'); await b.pause(600); }
      const names = await b.execute(() => [...document.querySelectorAll('.theme-option')].map((x) => x.innerText.trim()));
      await t.shot('theme_list');
      await b.execute(() => { const o = document.querySelector('.side-drawer-overlay'); o && o.click(); });
      await b.pause(500);
      t.eq('exactly three themes: Light, Dark, macOS Light', names, ['Light', 'Dark', 'macOS Light']);
      const seen = [];
      for (const n of ['Dark', 'macOS Light', 'Light']) { await pickTheme(b, n); seen.push(await themeAttr(b)); await t.shot(`after_${n.replace(/\s+/g, '_')}`); }
      t.check('picking each one changes the whole app at once (no restart)', new Set(seen).size === 3, seen.join(' | '));
    },
  },
  review('K2', 'Light theme looks the same as before the colour clean-up', async (t) => { await pickTheme(t.browser, 'Light'); await tour(t, t.browser, 'Light'); t.review('look', 'screens saved for Jess'); }),
  review('K3', 'Dark theme still works', async (t) => { await pickTheme(t.browser, 'Dark'); await tour(t, t.browser, 'Dark'); await pickTheme(t.browser, 'Light'); t.review('look', 'screens saved for Jess'); }),
  review('K4', 'macOS Light: text boxes have a visible border', async (t) => { const b = t.browser; await pickTheme(b, 'macOS Light'); await A.openAsset(b, 'ASSET1'); await t.shot('asset_form'); t.review('text box borders', 'screen saved for Jess'); }),
  review('K5', 'macOS Light: icon buttons are visible', async (t) => { const b = t.browser; await A.openRegistry(b); await t.shot('registry_icons'); t.review('icon buttons', 'screen saved for Jess'); }),
  review('K6', 'macOS Light: switches, checkboxes and dropdowns', async (t) => {
    const b = t.browser; await W.toMainMenu(b); await W.tile(b, 'Administration'); await b.pause(800);
    await clickText(b, 'Users');
    await b.waitUntil(() => b.execute(() => [...document.querySelectorAll('button')].some((x) => x.innerText.trim() === 'Permissions')), { timeout: 10000 });
    await b.execute(() => { const el = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && (x.innerText || '').trim() === 'Suganya Rajendran'); let r = el; while (r && ![...r.querySelectorAll('button')].some((y) => y.innerText.trim() === 'Permissions')) r = r.parentElement; [...r.querySelectorAll('button')].find((y) => y.innerText.trim() === 'Permissions').click(); });
    await b.pause(1000); await t.shot('switches'); t.review('switches / checkboxes / dropdowns', 'screen saved for Jess');
  }),
  review('K7', 'macOS Light: tables and dialogs', async (t) => {
    const b = t.browser; await A.openRegistry(b);
    await b.execute(() => { const c = [...document.querySelectorAll('.review-card')].find((x) => (x.querySelector('.review-card-code') || {}).innerText === 'ASSET1'); [...c.querySelectorAll('button')].find((x) => (x.title || x.getAttribute('aria-label')) === 'Delete').click(); });
    await b.pause(700); await t.shot('dialog'); await click(b, 'Cancel', { exact: true }).catch(() => {}); t.review('tables and dialogs', 'screen saved for Jess');
  }),
  review('K8', 'macOS Light: screens not yet converted (observation only)', async (t) => { await tour(t, t.browser, 'macOS Light'); t.review('observation', 'screens saved for Jess'); }),
  review('K9', 'Switching themes back and forth', async (t) => {
    const b = t.browser; for (const n of ['Light', 'Dark', 'macOS Light', 'Dark', 'Light']) { await pickTheme(b, n); await t.shot(`switch_${n.replace(/\s+/g, '_')}`); }
    t.review('no leftovers after switching', 'screens saved for Jess');
  }),
  review('K10', 'Theme picker on the user selection screen', async (t) => {
    const b = t.browser; await signOut(b); await t.shot('picker');
    for (const n of ['Dark', 'macOS Light', 'Light']) { await click(b, `${n} theme`).catch(() => {}); await b.pause(600); await t.shot(`picker_${n.replace(/\s+/g, '_')}`); }
    t.review('theme picker on the sign-in screen', 'screens saved for Jess');
  }),
  review('K11', 'macOS Light: Fail button has a pale red fill', async (t) => {
    const b = t.browser; await as(b, 'Suganya Rajendran'); await pickTheme(b, 'macOS Light');
    await W.openMR1(b, 'ASSET1'); await W.stepTo(b, 'checklist'); await t.shot('checklist_fail_buttons');
    await W.toMainMenu(b); await pickTheme(b, 'Light'); t.review('Fail button fill', 'screen saved for Jess');
  }),
  review('L1', 'Tag lamps in the Asset Registry', async (t) => { const b = t.browser; await A.openRegistry(b); await t.shot('lamps'); t.info('lamps', JSON.stringify(await A.cardTag(b, 'ASSET1')) + ' ' + JSON.stringify(await A.cardTag(b, 'ASSET2'))); t.review('lamp look', 'screen saved for Jess'); }),
  review('L2', 'Tag lamps on Select Asset For Report and Dashboard cards', async (t) => {
    const b = t.browser; await W.toMainMenu(b); await W.tile(b, 'Maintenance Report'); await click(b, 'I', { exact: true }); await b.pause(900); await t.shot('select_asset');
    await W.toMainMenu(b); await W.tile(b, 'Dashboard'); await b.pause(800); await clickText(b, 'Asset MR-I History'); await t.shot('dashboard'); t.review('lamps', 'screens saved for Jess');
  }),
  review('L3', 'Dashboard stat cards', async (t) => { const b = t.browser; await W.toMainMenu(b); await W.tile(b, 'Dashboard'); await b.pause(800); await clickText(b, 'Asset MR-I History'); await clickText(b, 'ASSET2'); await t.shot('asset_stats'); t.review('stat cards', 'screen saved for Jess'); }),
  review('L4', 'Main Menu KPIs (unchanged look)', async (t) => { await W.toMainMenu(t.browser); await t.shot('main_menu'); t.review('KPIs', 'screen saved for Jess'); }),
  review('L5', 'Lamps and dashboard cards in Light, Dark and macOS Light', async (t) => {
    const b = t.browser;
    for (const n of ['Light', 'Dark', 'macOS Light']) {
      await pickTheme(b, n); await A.openRegistry(b); await t.shot(`${n.replace(/\s+/g, '_')}_registry`);
      await W.toMainMenu(b); await W.tile(b, 'Dashboard'); await b.pause(800); await clickText(b, 'Asset MR-I History'); await t.shot(`${n.replace(/\s+/g, '_')}_dashboard`);
    }
    await pickTheme(b, 'Light'); t.review('lamps and cards in each theme', 'screens saved for Jess');
  }),
  review('L6', 'Gauges at small window size', async (t) => {
    const b = t.browser; const orig = await b.getWindowSize();
    await b.setWindowSize(960, 700); await b.pause(800);
    await W.toMainMenu(b); await t.shot('small_main_menu');
    await W.tile(b, 'Dashboard'); await b.pause(800); await clickText(b, 'Asset MR-I History'); await t.shot('small_dashboard');
    await b.setWindowSize(orig.width, orig.height); t.review('gauges at small size', 'screens saved for Jess');
  }),
];
