// Exploration: open the app, read the sign-in screen and the window title.
const { withApp, shot, pageText } = require('../lib/session');

withApp(async (browser) => {
  console.log('TITLE:', await browser.getTitle());
  await shot(browser, 'e2e/screenshots/_explore/01_start.png');
  console.log(await pageText(browser, 2500));
  const buttons = await browser.execute(() => [...document.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.title || b.innerText).trim()).filter(Boolean).slice(0, 40));
  console.log('BUTTONS:', JSON.stringify(buttons));
}).catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
