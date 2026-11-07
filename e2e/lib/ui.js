// Test-only UI helpers for the MMS app (WebdriverIO).

async function visibleButtons(browser) {
  return browser.execute(() =>
    [...document.querySelectorAll('button, [role="button"], a')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ text: (b.innerText || '').trim().replace(/\s+/g, ' '), label: b.getAttribute('aria-label') || '', title: b.title || '', disabled: !!b.disabled }))
      .filter((b) => b.text || b.label || b.title)
  );
}

// Sign in by stepping the user carousel with the › arrow until the card shows `name`.
async function signIn(browser, name) {
  await browser.waitUntil(async () => (await browser.$('button[aria-label="Next user"]')).isExisting(), { timeout: 30000, interval: 500, timeoutMsg: 'user picker did not appear' });
  for (let i = 0; i < 10; i++) {
    const card = await browser.$(`//button[.//*[normalize-space()="${name}"] or starts-with(normalize-space(.), "${name}")][not(@aria-label="Next user")][not(@aria-label="Previous user")]`);
    if (await card.isExisting()) {
      await card.click();
      await browser.pause(1500);
      return true;
    }
    await (await browser.$('button[aria-label="Next user"]')).click();
    await browser.pause(300);
  }
  throw new Error(`user ${name} not found on the picker`);
}

// Click the first visible element (button/link/role=button) whose text, aria-label or title matches.
async function click(browser, text, { exact = false, nth = 0 } = {}) {
  const ok = await browser.execute(
    (text, exact, nth) => {
      const norm = (s) => (s || '').trim().replace(/\s+/g, ' ');
      // getClientRects: also counts position:fixed elements (offsetParent is null for those).
      const els = [...document.querySelectorAll('button, [role="button"], a, [role="tab"], summary, label')].filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
      const hit = els.filter((e) => [norm(e.innerText), norm(e.getAttribute('aria-label')), norm(e.title)].some((t) => (exact ? t === text : t.includes(text))));
      if (!hit[nth]) return false;
      hit[nth].scrollIntoView({ block: 'center' });
      hit[nth].click();
      return true;
    },
    text, exact, nth
  );
  if (!ok) throw new Error(`nothing clickable matching "${text}"`);
  await browser.pause(700);
}

async function hasText(browser, text) {
  return browser.execute((t) => document.body.innerText.includes(t), text);
}

// Mark the visible input/select/textarea whose row label (or placeholder / own label) starts
// with `label` (nth match), and return it as a WebdriverIO element.
async function field(browser, label, { tag = 'input, textarea, select', nth = 0, within = null } = {}) {
  const ok = await browser.execute((label, tag, nth, within) => {
    document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e'));
    const scope = within ? document.querySelector(within) || document : document;
    const els = [...scope.querySelectorAll(tag)].filter((e) => e.offsetParent !== null);
    const lab = (e) => {
      if (e.labels && e.labels[0]) return e.labels[0].innerText;
      const row = e.closest('.mri-preview-table-row, .form-row, .field, tr');
      if (row && row.querySelector('label')) return row.querySelector('label').innerText;
      const prev = e.previousElementSibling;
      if (prev && /LABEL|SPAN|DIV/.test(prev.tagName)) return prev.innerText;
      return e.getAttribute('aria-label') || e.placeholder || '';
    };
    const hits = els.filter((e) => lab(e).trim().replace(/\s+/g, ' ').startsWith(label) || e.placeholder === label || e.getAttribute('aria-label') === label);
    if (!hits[nth]) return false;
    hits[nth].setAttribute('data-e2e', '1');
    hits[nth].scrollIntoView({ block: 'center' });
    return true;
  }, label, tag, nth, within);
  if (!ok) throw new Error(`no field "${label}"`);
  return browser.$('[data-e2e="1"]');
}

// Type like a user: select all, type the value, Tab out (fires blur, which is when the wizard saves).
async function typeInto(browser, label, value, opts) {
  if (FIELD_PAUSE) await browser.pause(FIELD_PAUSE);
  const el = await field(browser, label, { tag: 'input, textarea', ...opts });
  await el.click();
  await browser.keys(['Control', 'a']);
  await browser.keys('Backspace');
  if (value !== '') await browser.keys(String(value).split(''));
  await browser.keys('Tab');
  await browser.pause(500);
}

// Retries made by choose() because the chosen value did not stick (reported in the results).
const chooseRetries = [];

// Test switches: E2E_NO_RETRY=1 (a lost choice fails instead of being re-selected),
// E2E_FIELD_PAUSE=<ms> (wait before every field action, like a slower user).
const NO_RETRY = process.env.E2E_NO_RETRY === '1';
const FIELD_PAUSE = Number(process.env.E2E_FIELD_PAUSE || 0);

async function choose(browser, label, optionText, opts) {
  if (FIELD_PAUSE) await browser.pause(FIELD_PAUSE);
  for (let attempt = 1; attempt <= (NO_RETRY ? 1 : 3); attempt++) {
    await chooseOnce(browser, label, optionText, opts);
    const shown = await valueOf(browser, label, { tag: 'select', ...opts });
    const want = optionText === '' ? null : optionText;
    if (want === null ? /^—/.test(shown || '') || shown === '' : shown === want) return;
    chooseRetries.push({ label, value: optionText, attempt, shown });
    await browser.pause(800);
  }
  throw new Error(`"${optionText}" did not stay selected in ${label}${NO_RETRY ? ' (retries off)' : ' after 3 tries'}`);
}

async function chooseOnce(browser, label, optionText, opts) {
  await field(browser, label, { tag: 'select', ...opts });
  // Pick the option the way the browser does after a user's choice: set the value and fire a
  // real `change` event (React's onChange), wait for React to commit it, then leave the field
  // (focus + blur -> React's onBlur, which is when the wizard saves). WebDriver's own
  // selectByVisibleText did not always deliver the change event in this webview.
  const ok = await browser.execute((text) => {
    const e = document.querySelector('[data-e2e="1"]');
    const opt = text === '' ? e.options[0] : [...e.options].find((o) => o.text.trim() === text);
    if (!opt) return false;
    e.focus();
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(e, opt.value);
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, optionText);
  if (!ok) throw new Error(`no option "${optionText}" in ${label}`);
  await browser.pause(400);
  await browser.execute(() => { const e = document.querySelector('[data-e2e="1"]'); if (document.activeElement !== e) e.focus(); e.blur(); });
  await browser.pause(700);
}

async function valueOf(browser, label, opts) {
  const el = await field(browser, label, opts);
  return browser.execute(() => { const e = document.querySelector('[data-e2e="1"]'); return e.type === 'checkbox' ? e.checked : e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).text : e.value; });
}

async function signOut(browser) {
  const title = await browser.getTitle();
  if (!title.includes('|')) return;
  const { toMainMenu } = require('./wizard');
  await toMainMenu(browser);
  await click(browser, 'Open menu');
  await click(browser, 'Switch User', { exact: true });
  await browser.pause(1200);
}

// Make `name` the signed-in user (signs out first when someone else is signed in).
async function as(browser, name) {
  const title = await browser.getTitle();
  if (title.includes(`| ${name} |`)) return; // stay where the previous case left the screen
  await signOut(browser);
  await signIn(browser, name);
}

// Attention Required tab (right edge of the main menu). Returns null when the tab is absent,
// else the drawer cards [{name, count}]. With `card`, presses that card's button.
async function attention(browser, card) {
  const { toMainMenu } = require('./wizard');
  await toMainMenu(browser);
  // Close a drawer left open by an earlier call (it covers the tab).
  await browser.execute(() => { const o = document.querySelector('.side-drawer-overlay'); if (o) o.click(); });
  await browser.pause(400);
  const tab = await browser.$('button[aria-label="Open Fault Review"]');
  if (!(await tab.isExisting())) return null;
  await tab.click();
  await browser.pause(800);
  const cards = await browser.execute(() => [...document.querySelectorAll('.side-drawer .drawer-user-card')].map((c) => ({ name: (c.querySelector('.drawer-user-name') || {}).innerText, text: c.innerText.replace(/\s+/g, ' ') })).filter((c) => c.name));
  if (card) {
    const ok = await browser.execute((card) => { const c = [...document.querySelectorAll('.side-drawer .drawer-user-card')].find((x) => (x.querySelector('.drawer-user-name') || {}).innerText === card); const b = c && c.querySelector('button'); if (!b) return false; b.click(); return true; }, card);
    if (!ok) throw new Error(`no "${card}" card in Attention Required`);
    await browser.pause(1500);
  }
  return cards;
}

// Cards on a queue screen (Reports to Review, My Reports, ...): code, status label, report no, icon buttons.
async function queueCards(browser) {
  return browser.execute(() => [...document.querySelectorAll('.review-card')].filter((c) => c.offsetParent !== null).map((c) => ({
    code: (c.querySelector('.review-card-code') || {}).innerText,
    text: c.innerText.replace(/\s+/g, ' '),
    buttons: [...c.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim()),
    textButtons: [...c.querySelectorAll('button')].filter((b) => b.innerText.trim()).map((b) => b.innerText.trim()),
  })));
}

// Click the innermost visible element whose text starts with `text` (React handlers bubble up).
async function clickText(browser, text) {
  const ok = await browser.execute((text) => {
    const els = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent !== null && (e.innerText || '').trim().startsWith(text));
    if (!els.length) return false;
    els.sort((a, b) => a.innerText.length - b.innerText.length || b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
    els[0].scrollIntoView({ block: 'center' });
    els[0].click();
    return true;
  }, text);
  if (!ok) throw new Error(`no element starting with "${text}"`);
  await browser.pause(1000);
}

module.exports = { chooseRetries, clickText, attention, queueCards, visibleButtons, signIn, signOut, as, click, hasText, field, typeInto, choose, valueOf };
