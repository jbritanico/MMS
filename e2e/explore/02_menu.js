// Exploration: sign in as a user and read the main menu.
const { withApp, shot, pageText } = require('../lib/session');
const { signIn, visibleButtons } = require('../lib/ui');
const who = process.argv[2] || 'Suganya Rajendran';

withApp(async (browser) => {
  await signIn(browser, who);
  console.log('TITLE:', await browser.getTitle());
  await shot(browser, `e2e/screenshots/_explore/02_menu_${who.split(' ')[0]}.png`);
  console.log(await pageText(browser, 3000));
  console.log('BUTTONS:', JSON.stringify(await visibleButtons(browser)));
}).catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
