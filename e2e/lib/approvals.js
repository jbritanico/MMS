// Test-only helpers for Pending Approvals (review dialog, error dialog) and queues.
const { attention, click } = require('./ui');

async function openPending(browser) {
  const cards = await attention(browser, 'Pending Approvals');
  return cards;
}

// Fault cards on Pending Approvals: [{item, severity, asset, report, text, buttons}]
async function faultCards(browser) {
  return browser.execute(() => {
    const firstGrid = document.querySelector('.review-card-grid');
    return [...document.querySelectorAll('.pa-card')].filter((c) => c.offsetParent !== null).map((c) => ({
      section: c.closest('.review-card-grid') === firstGrid ? 'pending' : 'other',
      item: (c.querySelector('.pa-title') || {}).innerText,
      severity: (c.querySelector('.pa-sev') || {}).innerText,
      text: c.innerText.replace(/\s+/g, ' '),
      buttons: [...c.querySelectorAll('button')].map((b) => b.innerText.trim()),
    }));
  });
}

// Press a button on the card for `item` (and `asset` / `report` when given).
async function cardButton(browser, item, button, { asset, report, section = 'pending' } = {}) {
  const ok = await browser.execute((item, button, asset, report, section) => {
    const firstGrid = document.querySelector('.review-card-grid');
    const c = [...document.querySelectorAll('.pa-card')].filter((x) => x.offsetParent !== null).find((x) =>
      (x.querySelector('.pa-title') || {}).innerText === item &&
      (!asset || x.innerText.includes(asset)) && (!report || x.innerText.includes(`Report #${report}`)) &&
      (section === 'any' || (section === 'pending') === (x.closest('.review-card-grid') === firstGrid)));
    const b = c && [...c.querySelectorAll('button')].find((y) => y.innerText.trim() === button);
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  }, item, button, asset || '', report || 0, section);
  if (!ok) throw new Error(`no "${button}" on the ${item} card`);
  await browser.pause(900);
}

// The open review dialog: fields, values, options and button states.
async function dialog(browser) {
  return browser.execute(() => {
    const m = [...document.querySelectorAll('.modal')].find((x) => x.offsetParent !== null && /Notes \(required\)/.test(x.innerText));
    if (!m) return null;
    const fields = {};
    m.querySelectorAll('.field').forEach((f) => {
      const l = f.querySelector('label').innerText.trim();
      const e = f.querySelector('select, input');
      fields[l] = { tag: e.tagName, value: e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).text : e.value, options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.text) : null, disabled: e.disabled };
    });
    const buttons = {};
    m.querySelectorAll('.modal-actions button').forEach((b) => (buttons[b.innerText.trim()] = { disabled: b.disabled, title: b.title }));
    return { text: m.innerText.replace(/\s+/g, ' '), fields, buttons };
  });
}

async function dlgField(browser, labelStart) {
  const ok = await browser.execute((l) => {
    document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e'));
    const m = [...document.querySelectorAll('.modal')].find((x) => x.offsetParent !== null && /Notes \(required\)/.test(x.innerText));
    const f = m && [...m.querySelectorAll('.field')].find((x) => x.querySelector('label').innerText.trim().startsWith(l));
    const e = f && f.querySelector('select, input');
    if (!e) return false;
    e.setAttribute('data-e2e', '1');
    return true;
  }, labelStart);
  if (!ok) throw new Error(`no dialog field ${labelStart}`);
  return browser.$('[data-e2e="1"]');
}

async function dlgChoose(browser, labelStart, optionStartsWith) {
  const el = await dlgField(browser, labelStart);
  const opts = await browser.execute(() => [...document.querySelector('[data-e2e="1"]').options].map((o) => o.text));
  const pick = opts.find((o) => o.startsWith(optionStartsWith));
  if (!pick) throw new Error(`no option ${optionStartsWith} in ${labelStart}`);
  await el.selectByVisibleText(pick);
  await browser.pause(400);
}

async function dlgNotes(browser, text) {
  const el = await dlgField(browser, 'Notes');
  await el.click();
  await browser.keys(['Control', 'a']);
  await browser.keys('Backspace');
  if (text) await browser.keys(text.split(''));
  await browser.pause(300);
}

async function dlgPress(browser, text) {
  await browser.execute((t) => {
    const m = [...document.querySelectorAll('.modal')].find((x) => x.offsetParent !== null && /Notes \(required\)/.test(x.innerText));
    const b = [...m.querySelectorAll('.modal-actions button')].find((x) => x.innerText.trim() === t);
    b.setAttribute('data-e2e-btn', t);
  }, text);
  await (await browser.$(`[data-e2e-btn="${text}"]`)).click();
  await browser.pause(1500);
}

// Error dialog (components/ErrorDialog): text, or null when not shown.
async function errorDialog(browser) {
  return browser.execute(() => {
    const d = [...document.querySelectorAll('[role="alertdialog"], [role="dialog"][aria-modal="true"]')].find((x) => x.offsetParent !== null && !/Notes \(required\)/.test(x.innerText));
    return d ? d.innerText.replace(/\s+/g, ' ').trim() : null;
  });
}

async function toast(browser) {
  return browser.execute(() => { const t = [...document.querySelectorAll('.toast')].find((x) => x.offsetParent !== null); return t ? t.innerText.trim() : null; });
}

// Decide in one go: open Review on the card, optional reclassify / next reviewer / inform, notes, press.
async function decideOn(browser, item, decision, { asset, report, reclassifyTo, nextReviewer, inform, notes = 'Reviewed during the automated test run.' } = {}) {
  await cardButton(browser, item, 'Review', { asset, report });
  if (reclassifyTo) await dlgChoose(browser, 'Reclassify To', reclassifyTo);
  if (nextReviewer) await dlgChoose(browser, 'Send Critical fault to', nextReviewer);
  if (inform) await dlgChoose(browser, 'Inform', inform);
  await dlgNotes(browser, notes);
  await dlgPress(browser, decision);
  return { toast: await toast(browser), error: await errorDialog(browser) };
}

async function okError(browser) {
  await click(browser, 'OK', { exact: true });
  await browser.pause(500);
}

module.exports = { openPending, faultCards, cardButton, dialog, dlgField, dlgChoose, dlgNotes, dlgPress, errorDialog, toast, decideOn, okError };
