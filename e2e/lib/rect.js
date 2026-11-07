// Test-only helpers for the Rectification Queue.
const { attention } = require('./ui');

async function openQueue(browser) { return attention(browser, 'Rectification Queue'); }

async function cards(browser) {
  return browser.execute(() => [...document.querySelectorAll('.rq-card')].filter((c) => c.offsetParent !== null).map((c) => {
    const dd = {}; c.querySelectorAll('.rq-dl > div').forEach((d) => (dd[d.querySelector('dt').textContent.trim()] = d.querySelector('dd').textContent.trim()));
    const tags = [...c.querySelectorAll('.rq-tags span')].map((s) => s.innerText.trim());
    return {
      item: (c.querySelector('.rq-title') || {}).innerText,
      asset: tags[0], report: tags[1], pills: [...c.querySelectorAll('.rq-pill')].map((p) => p.title),
      tech: dd.Technician, parts: dd.Parts, repairDate: dd['Repair date'],
      limit: (c.querySelector('.rq-limit') || {}).innerText.replace(/\s+/g, ' '),
      buttons: [...c.querySelectorAll('button')].map((b) => b.innerText.trim()),
    };
  }));
}

async function summary(browser) {
  return browser.execute(() => [...document.querySelectorAll('.rq-stat')].map((s) => s.innerText.replace(/\s+/g, ' ').trim()));
}

// Mark the card for item on asset; returns false when absent.
async function mark(browser, item, asset) {
  return browser.execute((item, asset) => {
    document.querySelectorAll('[data-e2e-card]').forEach((e) => e.removeAttribute('data-e2e-card'));
    const c = [...document.querySelectorAll('.rq-card')].find((x) => (x.querySelector('.rq-title') || {}).innerText === item && x.querySelector('.rq-tags span').innerText.trim() === asset);
    if (!c) return false;
    c.setAttribute('data-e2e-card', '1');
    c.scrollIntoView({ block: 'center' });
    return true;
  }, item, asset);
}

async function press(browser, item, asset, text) {
  if (!(await mark(browser, item, asset))) throw new Error(`no queue card ${item} / ${asset}`);
  const ok = await browser.execute((t) => {
    document.querySelectorAll('[data-e2e-btn]').forEach((e) => e.removeAttribute('data-e2e-btn'));
    const b = [...document.querySelectorAll('[data-e2e-card="1"] button')].find((x) => x.innerText.trim() === t);
    if (!b) return false;
    if (b.disabled) return 'disabled';
    b.setAttribute('data-e2e-btn', '1');
    return true;
  }, text);
  if (ok === true) await (await browser.$('[data-e2e-btn="1"]')).click(); // a real click, like a user
  await browser.pause(700);
  return ok;
}

// Waits up to 4 s for the status message at the top of the queue.
async function toast(browser) {
  for (let i = 0; i < 8; i++) {
    const t = await browser.execute(() => { const x = [...document.querySelectorAll('.toast')].find((y) => y.offsetParent !== null); return x ? x.innerText.trim() : null; });
    if (t) return t;
    await browser.pause(500);
  }
  return null;
}

async function setIn(browser, selector, value) {
  await browser.execute((sel) => { document.querySelectorAll('[data-e2e]').forEach((e) => e.removeAttribute('data-e2e')); const e = document.querySelector(`[data-e2e-card="1"] ${sel}`); e.setAttribute('data-e2e', '1'); }, selector);
  const el = await browser.$('[data-e2e="1"]');
  const tag = await el.getTagName();
  const type = await el.getAttribute('type');
  if (tag === 'select') { await el.selectByVisibleText(value); }
  else if (type === 'date') {
    await browser.execute((v) => { const e = document.querySelector('[data-e2e="1"]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, value);
  } else {
    await el.click();
    await browser.keys(['Control', 'a']);
    await browser.keys('Backspace');
    if (value) await browser.keys(value.split(''));
  }
  await browser.pause(300);
}

// Update Plan: { tech: string|'' , parts, date: iso|'' } -> toast
async function plan(browser, item, asset, { tech, parts, date } = {}) {
  await press(browser, item, asset, 'Update Plan');
  await mark(browser, item, asset);
  if (tech !== undefined) await setIn(browser, '.rq-form input[type="text"]', tech);
  if (parts) await setIn(browser, '.rq-form select', parts);
  if (date !== undefined) await setIn(browser, '.rq-form input[type="date"]', date);
  await press(browser, item, asset, 'Save');
  await browser.pause(1200);
  return toast(browser);
}

// Verify: opens the form, optionally ticks the function test, reads the Confirm state, confirms.
async function verify(browser, item, asset, { functionTest = true, confirm = true } = {}) {
  const btn = (await cards(browser)).find((c) => c.item === item && c.asset === asset)?.buttons.find((b) => /^Verify/.test(b));
  await press(browser, item, asset, btn);
  await mark(browser, item, asset);
  if (functionTest) {
    await browser.execute(() => { document.querySelectorAll('[data-e2e-cb]').forEach((e) => e.removeAttribute('data-e2e-cb')); const c = document.querySelector('[data-e2e-card="1"] .rq-form input[type="checkbox"]'); if (c && !c.checked) c.setAttribute('data-e2e-cb', '1'); });
    const cb = await browser.$('[data-e2e-cb="1"]');
    if (await cb.isExisting()) await cb.click();
  }
  await browser.pause(500);
  const confirmState = await browser.execute(() => { const b = [...document.querySelectorAll('[data-e2e-card="1"] .rq-form button')].find((x) => /^Confirm/.test(x.innerText.trim())); return b ? { text: b.innerText.trim(), disabled: b.disabled } : null; });
  if (!confirm || !confirmState || confirmState.disabled) return { confirmState, toast: null };
  for (let i = 0; i < 14; i++) { // let an earlier message (e.g. "Repair plan updated") clear first
    const any = await browser.execute(() => [...document.querySelectorAll('.toast')].some((y) => y.offsetParent !== null));
    if (!any) break;
    await browser.pause(500);
  }
  await press(browser, item, asset, confirmState.text);
  return { confirmState, toast: await toast(browser) };
}

async function limits(browser, item, asset, note) {
  const c = (await cards(browser)).find((x) => x.item === item && x.asset === asset);
  await press(browser, item, asset, c.buttons.find((b) => /Inform field team|Update limitations/.test(b)));
  await mark(browser, item, asset);
  await setIn(browser, 'textarea', note);
  await press(browser, item, asset, 'Save');
  await browser.pause(1200);
  return toast(browser);
}

module.exports = { openQueue, cards, summary, press, plan, verify, limits, toast };
