// Exploration: sign in and perform a short list of fixed step types, then dump the screen.
//   node e2e/explore/steps.js "<user>" "<step>" "<step>" ...
// Steps:  tile:<menu card title>   click:<text>   clickx:<exact text>   nth:<n>:<text>
//         type:<placeholder or label>=<value>   wait:<ms>   shot:<name>   dump
//         fields  (lists inputs/selects with labels and values)
const { withApp, shot, pageText } = require('../lib/session');
const { signIn, click, visibleButtons, typeInto, choose } = require('../lib/ui');

const [, , who, ...steps] = process.argv;

async function fields(browser) {
  return browser.execute(() =>
    [...document.querySelectorAll('input, select, textarea')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => {
        const row = e.closest('label, .mri-preview-table-row, tr, .form-row, div');
        const lab = (e.labels && e.labels[0] && e.labels[0].innerText) || (row && row.querySelector('label') && row.querySelector('label').innerText) || e.placeholder || e.name || '';
        return {
          tag: e.tagName.toLowerCase(), type: e.type, label: lab.trim().replace(/\s+/g, ' ').slice(0, 60),
          value: e.type === 'checkbox' ? e.checked : (e.value || '').slice(0, 60), disabled: e.disabled, readOnly: e.readOnly,
          options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.text).slice(0, 12) : undefined,
        };
      })
  );
}

withApp(async (browser) => {
  if (who && who !== '-') await signIn(browser, who);
  let n = 0;
  for (const s of steps) {
    const [kind, ...rest] = s.split(':');
    const arg = rest.join(':');
    console.log('>>', s);
    try {
      if (kind === 'tile') {
        await browser.execute((t) => { const c = [...document.querySelectorAll('.menu-card')].find((x) => x.querySelector('h3')?.innerText.trim() === t); c.click(); }, arg);
        await browser.pause(800);
      } else if (kind === 'css') {
        const [sel, text] = arg.split('|');
        const ok = await browser.execute((sel, text) => { const c = [...document.querySelectorAll(sel)].filter((x) => x.offsetParent !== null).find((x) => !text || x.innerText.includes(text)); if (!c) return false; c.scrollIntoView({ block: 'center' }); c.click(); return true; }, sel, text || '');
        if (!ok) throw new Error(`no ${sel} containing ${text}`);
        await browser.pause(900);
      } else if (kind === 'click') await click(browser, arg);
      else if (kind === 'clickx') await click(browser, arg, { exact: true });
      else if (kind === 'nth') { const [i, ...t] = arg.split(':'); await click(browser, t.join(':'), { nth: +i }); }
      else if (kind === 'type') { const [label, ...v] = arg.split('='); await typeInto(browser, label, v.join('=')); }
      else if (kind === 'select') { const [label, ...v] = arg.split('='); await choose(browser, label, v.join('=')); }
      else if (kind === 'wait') await browser.pause(+arg);
      else if (kind === 'shot') await shot(browser, `e2e/screenshots/_explore/${arg}.png`);
      else if (kind === 'dump') { console.log(await pageText(browser, 5000)); console.log('BUTTONS:', JSON.stringify(await visibleButtons(browser))); }
      else if (kind === 'fields') console.log('FIELDS:', JSON.stringify(await fields(browser), null, 0));
    } catch (e) {
      console.log('   step failed:', e.message);
      await shot(browser, `e2e/screenshots/_explore/fail_${++n}.png`);
      console.log(await pageText(browser, 3000));
      break;
    }
  }
}).catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
