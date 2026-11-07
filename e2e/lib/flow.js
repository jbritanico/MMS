// Test-only helpers for the document flow (ReportFlow: g.rf-node) and the asset history flow
// (AssetFlow: svg g[role=button]) screens, plus the details panel under each diagram.

const NODE_SEL = 'g.rf-node, svg g[role="button"]';

async function nodes(browser) {
  return browser.execute((sel) => [...document.querySelectorAll(sel)].map((g, i) => {
    const r = g.getBoundingClientRect();
    const rect = g.querySelector('rect');
    return { i, title: g.getAttribute('aria-label') || '', text: g.textContent.replace(/\s+/g, ' ').trim(), x: Math.round(r.left), y: Math.round(r.top), stroke: rect ? rect.getAttribute('stroke') : null };
  }), NODE_SEL);
}

async function select(browser, index) {
  if (index < 0) throw new Error('flow box not found');
  await browser.execute((sel, i) => { const g = document.querySelectorAll(sel)[i]; g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, NODE_SEL, index);
  await browser.pause(700);
}

// Selected box details: {title, rows: [[k, v]], text, buttons: [{text, disabled}]}
async function detail(browser) {
  return browser.execute(() => {
    const dl = document.querySelector('.rf-dl');
    const panel = dl ? dl.closest('.panel') : [...document.querySelectorAll('.panel')].filter((p) => p.querySelector('.actions')).pop();
    if (!panel) return null;
    const rows = [];
    if (dl) {
      for (const k of [...dl.children]) {
        const parts = [...k.children].map((x) => x.innerText.trim());
        rows.push(parts.length >= 2 ? [parts[0], parts.slice(1).join(' ')] : [k.innerText.trim(), '']);
      }
    } else {
      const spans = [...panel.querySelectorAll('div[style*="contents"] > span')].map((s) => s.innerText.trim());
      for (let i = 0; i + 1 < spans.length; i += 2) rows.push([spans[i], spans[i + 1]]);
    }
    const h = panel.querySelector('.rf-detail-h, h2');
    return {
      title: h ? h.innerText.trim() : '',
      rows,
      text: panel.innerText.replace(/\s+/g, ' '),
      buttons: [...panel.querySelectorAll('.actions button')].map((b) => ({ text: b.innerText.trim(), disabled: b.disabled, title: b.title })),
    };
  });
}

// Index of the first box whose title (or text) starts with `start` and contains `contains`.
function find(list, start, contains) {
  const n = list.find((x) => (x.title || x.text).startsWith(start) && (!contains || x.text.includes(contains)));
  return n ? n.i : -1;
}

// Decision box on the same row as the fault box named `item` (document flow).
function decisionFor(list, item) {
  const f = list.find((x) => (x.title || x.text).startsWith(item));
  if (!f) return -1;
  const d = list.filter((x) => (x.title || x.text).startsWith('Decision') && Math.abs(x.y - f.y) < 25 && x.x > f.x).sort((a, b) => a.x - b.x)[0];
  return d ? d.i : -1;
}

// Open the asset history flow from the Asset Registry card of `code`.
async function openAssetFlow(browser, code) {
  const A = require('./assets');
  await A.openRegistry(browser);
  const ok = await browser.execute((code) => {
    const c = [...document.querySelectorAll('.review-card')].find((x) => (x.querySelector('.review-card-code') || {}).innerText === code);
    const b = c && [...c.querySelectorAll('button')].find((x) => (x.title || x.getAttribute('aria-label') || '') === 'Show history flow');
    if (!b) return false; b.click(); return true;
  }, code);
  if (!ok) throw new Error(`no Show history flow on ${code}`);
  await browser.pause(1500);
}

// Asset flow -> report box -> "Show flow of this report".
async function openReportFlowVia(browser, code, reportNo) {
  const { click } = require('./ui');
  await openAssetFlow(browser, code);
  const list = await nodes(browser);
  await select(browser, find(list, `Report #${reportNo}`));
  await click(browser, 'Show flow of this report', { exact: true });
  await browser.pause(1500);
}

module.exports = { nodes, select, detail, find, decisionFor, openAssetFlow, openReportFlowVia };
