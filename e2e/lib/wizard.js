// Test-only helpers for the MR-I screens (select asset, report wizard).
const { click } = require('./ui');

async function toMainMenu(browser) {
  for (let i = 0; i < 4; i++) {
    const onMenu = await browser.execute(() => !!document.querySelector('.menu-card'));
    if (onMenu) return;
    const ok = await browser.execute(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent !== null && /Back to main menu/.test(x.innerText));
      if (b) { b.click(); return true; }
      return false;
    });
    if (!ok) break;
    await browser.pause(800);
  }
}

async function tile(browser, title) {
  await browser.execute((t) => [...document.querySelectorAll('.menu-card')].find((x) => x.querySelector('h3')?.innerText.trim() === t).click(), title);
  await browser.pause(800);
}

// Main menu -> Maintenance Report -> MR-I -> asset card [-> component]. Returns the visible text after.
async function openMR1(browser, assetCode, component, { postJob = 'new' } = {}) {
  await openMR1Raw(browser, assetCode, component);
  // Within 72 h of a Post-Job report the app first asks: copy it, or start a new report.
  if (postJob === 'ask') return;
  const hasChoice = await browser.execute(() => [...document.querySelectorAll('.modal button')].some((x) => x.offsetParent !== null && x.innerText.trim() === 'Start a new report'));
  if (hasChoice) {
    await click(browser, postJob === 'copy' ? 'Copy last Post-Job report' : 'Start a new report', { exact: true });
    await browser.pause(2500);
  }
}

async function openMR1Raw(browser, assetCode, component) {
  await toMainMenu(browser);
  await tile(browser, 'Maintenance Report');
  await click(browser, 'I', { exact: true });
  await browser.pause(800);
  await browser.execute((c) => [...document.querySelectorAll('.asset-select-card')].find((x) => x.querySelector('.asset-select-code')?.innerText.trim() === c).click(), assetCode);
  await browser.pause(1200);
  if (component) {
    await browser.execute((c) => {
      const b = [...document.querySelectorAll('.modal button')].find((x) => x.innerText.trim().startsWith(c));
      if (!b) throw new Error('component button ' + c);
      b.click();
    }, component);
    await browser.pause(2500);
  }
}

// Mark the checklist row for `item` (exact item name) and return true when found.
async function markRow(browser, item) {
  return browser.execute((item) => {
    document.querySelectorAll('[data-e2e-row]').forEach((e) => e.removeAttribute('data-e2e-row'));
    const spans = [...document.querySelectorAll('span')].filter((s) => s.offsetParent !== null && s.parentElement && getComputedStyle(s.parentElement).display === 'grid');
    const s = spans.find((x) => x.innerText.replace(/\s*\*\s*$/, '').trim() === item);
    if (!s) return false;
    s.parentElement.setAttribute('data-e2e-row', '1');
    s.parentElement.scrollIntoView({ block: 'center' });
    return true;
  }, item);
}

async function row(browser, item) {
  if (!(await markRow(browser, item))) throw new Error(`checklist row "${item}" not found`);
  return browser.$('[data-e2e-row="1"]');
}

async function rowButton(browser, item, text) {
  await row(browser, item);
  const ok = await browser.execute((t) => { const b = [...document.querySelectorAll('[data-e2e-row="1"] button')].find((x) => x.innerText.trim() === t); if (!b || b.disabled) return false; b.click(); return true; }, text);
  await browser.pause(700);
  return ok;
}

// Text inputs in the row: 0 = Issue Details, 1 = Action Taken.
async function rowType(browser, item, idx, value) {
  await row(browser, item);
  const ok = await browser.execute((idx) => {
    document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e'));
    const el = [...document.querySelectorAll('[data-e2e-row="1"] input[type="text"]')][idx];
    if (!el || el.disabled) return false;
    el.setAttribute('data-e2e', '1');
    return true;
  }, idx);
  if (!ok) return false;
  const el = await browser.$('[data-e2e="1"]');
  await el.click();
  await browser.keys(['Control', 'a']);
  await browser.keys('Backspace');
  if (value) await browser.keys(value.split(''));
  await browser.keys('Tab');
  await browser.pause(700);
  return true;
}

// Selects in the row: 'closure' (first select when there are two) or 'severity' (last select).
async function rowSelect(browser, item, which, optionText) {
  await row(browser, item);
  const n = await browser.execute((which) => {
    document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e'));
    const sels = [...document.querySelectorAll('[data-e2e-row="1"] select')];
    const el = which === 'severity' ? sels[sels.length - 1] : sels.length > 1 ? sels[0] : null;
    if (!el) return 'none';
    if (el.disabled) return 'disabled';
    el.setAttribute('data-e2e', '1');
    return 'ok';
  }, which);
  if (n !== 'ok') return n;
  const el = await browser.$('[data-e2e="1"]');
  await el.selectByVisibleText(optionText);
  await browser.pause(800);
  return 'ok';
}

// Date input: set through the input's native setter + input/change events (what a date picker does).
async function rowDate(browser, item, iso) {
  await row(browser, item);
  await browser.execute((iso) => {
    const el = document.querySelector('[data-e2e-row="1"] input[type="date"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, iso);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, iso);
  await browser.pause(700);
}

async function rowState(browser, item) {
  await row(browser, item);
  return browser.execute(() => {
    const r = document.querySelector('[data-e2e-row="1"]');
    const btns = [...r.querySelectorAll('button')];
    const sels = [...r.querySelectorAll('select')];
    const txt = [...r.querySelectorAll('input[type="text"]')];
    const opt = (s) => (s ? (s.options[s.selectedIndex] || {}).text : null);
    const failBtn = btns.find((b) => b.innerText.trim() === 'Fail');
    return {
      status: failBtn && /danger/.test(failBtn.className) ? 'Fail' : 'Pass',
      issue: txt[0] ? txt[0].value : null,
      issueDisabled: txt[0] ? txt[0].disabled : null,
      action: txt[1] ? txt[1].value : null,
      date: (r.querySelector('input[type="date"]') || {}).value,
      closure: sels.length > 1 ? opt(sels[0]) : (r.innerText.includes('Closed') ? 'Closed' : 'Pending'),
      closureDisabled: sels.length > 1 ? sels[0].disabled : null,
      closureTitle: sels.length > 1 ? sels[0].title : null,
      severity: opt(sels[sels.length - 1]),
      attachments: r.querySelectorAll('img[title], div[title] > embed').length,
      attachmentNames: [...r.querySelectorAll('img[title], div[title]')].filter((x) => x.tagName === 'IMG' || x.querySelector('embed')).map((x) => x.title),
      text: r.innerText.replace(/\s+/g, ' ').slice(0, 300),
      nextText: (r.nextElementSibling ? r.nextElementSibling.innerText : '').replace(/\s+/g, ' ').slice(0, 300),
    };
  });
}

async function attach(browser, item, filePath) {
  await row(browser, item);
  const ok = await browser.execute(() => {
    document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e'));
    const host = document.querySelector('[data-e2e-row="1"]');
    const f = host.querySelector('input[type="file"]') || (host.nextElementSibling && host.nextElementSibling.querySelector('input[type="file"]'));
    if (!f) return false;
    f.setAttribute('data-e2e', '1');
    f.style.display = 'block';
    return true;
  });
  if (!ok) return false;
  const el = await browser.$('[data-e2e="1"]');
  await el.setValue(filePath);
  await browser.pause(1500);
  await browser.execute(() => { const f = document.querySelector('[data-e2e="1"]'); if (f) { f.style.display = 'none'; f.removeAttribute('data-e2e'); } });
  return true;
}

async function next(browser) { await click(browser, 'Next →', { exact: true }); await browser.pause(1500); }
async function prev(browser) { await click(browser, '← Previous', { exact: true }); await browser.pause(1500); }
async function stepTo(browser, label) {
  for (let i = 0; i < 6; i++) {
    const cur = await browser.execute(() => document.body.innerText);
    const active = await browser.execute(() => { const h = [...document.querySelectorAll('h2')].find((x) => x.offsetParent !== null); return h ? h.innerText.trim() : ''; });
    if (active.toLowerCase().startsWith(label.toLowerCase())) return;
    const order = ['header', 'checklist', 'distance', 'footer', 'review'];
    const ai = order.findIndex((o) => active.toLowerCase().startsWith(o));
    const ti = order.findIndex((o) => label.toLowerCase().startsWith(o));
    if (ai < 0 || ti < 0) { await next(browser); continue; }
    if (ai < ti) await next(browser); else await prev(browser);
  }
}

// Review & Submit: the red issue list (empty when none) and the Submit button state.
async function reviewState(browser) {
  return browser.execute(() => {
    const toast = [...document.querySelectorAll('.toast.err')].find((x) => x.offsetParent !== null && /to resolve/.test(x.innerText));
    const issues = toast ? [...toast.querySelectorAll('li')].map((l) => l.innerText.trim()) : [];
    const sub = [...document.querySelectorAll('button')].find((b) => b.offsetParent !== null && /^(Submit Report|Already submitted)/.test(b.innerText.trim()));
    const body = document.body.innerText;
    const i = body.indexOf('Asset and job details');
    return { issues, submitText: sub ? sub.innerText.trim() : null, submitDisabled: sub ? sub.disabled : null, details: i >= 0 ? body.slice(i, i + 2500).replace(/\n+/g, ' | ') : '' };
  });
}

// Value shown for a label in the "Asset and job details" box ("—" when empty).
function detail(details, label) {
  const parts = details.split(' | ');
  const i = parts.findIndex((p) => p.trim().toLowerCase() === label.toLowerCase());
  return i >= 0 ? (parts[i + 1] || '').trim() : null;
}

async function submit(browser) {
  const st = await reviewState(browser);
  if (st.submitDisabled) return { ok: false, st };
  await click(browser, 'Submit Report');
  await browser.pause(2000);
  const dlg = await browser.execute(() => document.body.innerText.includes('Report submitted'));
  if (dlg) { await click(browser, 'OK', { exact: true }); await browser.pause(1200); }
  return { ok: dlg, st };
}

// Footer step: date fields save on blur.
async function setDate(browser, label, iso) {
  const { field } = require('./ui');
  await field(browser, label, { tag: 'input' });
  await browser.execute((iso) => {
    const el = document.querySelector('[data-e2e="1"]');
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, iso);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }, iso);
  await browser.pause(600);
}

async function tick(browser, label, on = true) {
  return browser.execute((label, on) => {
    const l = [...document.querySelectorAll('label.neu-check')].find((x) => x.innerText.trim() === label);
    if (!l) return 'missing';
    const cb = l.querySelector('input');
    if (cb.disabled) return 'disabled:' + (cb.title || '');
    if (cb.checked !== on) cb.click();
    return 'ok';
  }, label, on);
}

async function checkState(browser, label) {
  return browser.execute((label) => {
    const l = [...document.querySelectorAll('label.neu-check')].find((x) => x.innerText.trim() === label);
    if (!l) return null;
    const cb = l.querySelector('input');
    return { checked: cb.checked, disabled: cb.disabled, title: cb.title };
  }, label);
}

// Footer as the Operator fills it: Operator Date today, Supervisor Abdulla Qais, Supervisor Date today.
async function fillFooter(browser, today, extra = {}) {
  const { choose, typeInto } = require('./ui');
  await stepTo(browser, 'footer');
  await setDate(browser, 'Operator Date', today);
  await choose(browser, 'Supervisor', 'Abdulla Qais').catch(async () => {});
  await setDate(browser, 'Supervisor Date', today);
  for (const t of extra.ticks || []) await tick(browser, t, true);
  if (extra.remarks) await typeInto(browser, 'Remarks', extra.remarks);
}

// The "Cannot close this item" popup: returns its text and presses OK.
async function closeAlert(browser) {
  const txt = await browser.execute(() => { const d = document.querySelector('[role="alertdialog"]'); return d ? d.innerText.replace(/\s+/g, ' ').trim() : null; });
  if (txt) { await click(browser, 'OK', { exact: true }); await browser.pause(500); }
  return txt;
}

module.exports.reviewState = reviewState;
module.exports.detail = detail;
module.exports.submit = submit;
module.exports.setDate = setDate;
module.exports.tick = tick;
module.exports.checkState = checkState;
module.exports.fillFooter = fillFooter;
module.exports.closeAlert = closeAlert;

Object.assign(module.exports, { toMainMenu, tile, openMR1, row, markRow, rowButton, rowType, rowSelect, rowDate, rowState, attach, next, prev, stepTo });
