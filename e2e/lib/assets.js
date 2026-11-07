// Test-only helpers for the Asset Registry (tag lamp, tag history, MOC exemptions).
const { tile, toMainMenu } = require('./wizard');

async function openRegistry(browser) {
  await toMainMenu(browser);
  await tile(browser, 'Asset Registry');
  await browser.pause(1200);
}

// {label: "Red tag" | "No tag" ..., title} from the asset's registry card.
async function cardTag(browser, code) {
  return browser.execute((code) => {
    const c = [...document.querySelectorAll('.review-card')].find((x) => (x.querySelector('.review-card-code') || {}).innerText === code);
    if (!c) return null;
    const l = [...c.querySelectorAll('[role="img"]')].find((x) => /tag/i.test(x.getAttribute('aria-label') || ''));
    return l ? { label: l.getAttribute('aria-label'), title: l.title } : { label: 'No tag', title: '' };
  }, code);
}

// Current tag of an asset as shown in the registry: 'Red' | 'Yellow' | 'Green' | null (+ reason).
async function tagOf(browser, code) {
  await openRegistry(browser);
  const t = await cardTag(browser, code);
  await toMainMenu(browser);
  if (!t || t.label === 'No tag') return { tag: null, reason: '' };
  return { tag: t.label.replace(/ tag$/, ''), reason: t.title.replace(/^[A-Za-z]+ tag:\s*/, '') };
}

async function openAsset(browser, code) {
  await openRegistry(browser);
  await browser.execute((code) => [...document.querySelectorAll('.review-card')].find((x) => (x.querySelector('.review-card-code') || {}).innerText === code).click(), code);
  await browser.pause(1200);
}

// Tag history entries, oldest first: [{text, tag}]
async function tagHistory(browser) {
  return browser.execute(() => {
    const d = [...document.querySelectorAll('details')].find((x) => /Tag history/.test(x.querySelector('summary').innerText));
    if (!d) return [];
    d.open = true;
    return [...d.querySelectorAll('li')].map((li) => ({ text: li.innerText.trim(), tag: (li.querySelector('strong') || {}).innerText })).reverse();
  });
}

async function exemptionPanel(browser) {
  return browser.execute(() => {
    const f = [...document.querySelectorAll('.field')].find((x) => /Red-tag exemption \(MOC\)/.test((x.querySelector('label') || {}).innerText || ''));
    return f ? { text: f.innerText.replace(/\s+/g, ' '), buttons: [...f.querySelectorAll('button')].map((b) => b.innerText.trim()) } : null;
  });
}

module.exports = { openRegistry, cardTag, tagOf, openAsset, tagHistory, exemptionPanel };
