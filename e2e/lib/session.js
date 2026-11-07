// Test-only helper: runs one script against the debug build of the app.
// Starts tauri-driver (with the matching msedgedriver) with e2e/run as the working folder,
// so the app opens the TEST database copy e2e/run/assets.db, never the real one. Checks the
// real src-tauri/assets.db size and modified time before and after.
const { remote } = require('webdriverio');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const RUN = path.join(ROOT, 'e2e', 'run');
// A copy of the `cargo tauri build --debug` output: `cargo test` rebuilds target/debug/tauri-app.exe
// in dev mode (it then loads the dev server), so the test build is kept separately here.
const APP = path.join(ROOT, 'e2e', 'app', 'tauri-app.exe');
const EDGE = path.join(ROOT, 'e2e', 'drivers', 'edgedriver', 'msedgedriver.exe');
const REAL_DB = path.join(ROOT, 'src', 'desktop', 'src-tauri', 'assets.db');

function dbStamp(p) {
  const s = fs.statSync(p);
  return `${s.size} bytes, ${s.mtime.toISOString()}`;
}

async function withApp(fn) {
  const realBefore = dbStamp(REAL_DB);
  const testBefore = dbStamp(path.join(RUN, 'assets.db'));
  const driver = spawn('tauri-driver', ['--native-driver', EDGE, '--port', '4444'], { cwd: RUN, stdio: ['ignore', 'ignore', 'pipe'] });
  let driverErr = '';
  driver.stderr.on('data', (d) => (driverErr += d));
  await new Promise((r) => setTimeout(r, 1500));
  let browser;
  try {
    browser = await remote({
      hostname: '127.0.0.1',
      port: 4444,
      logLevel: 'error',
      capabilities: { browserName: 'wry', 'tauri:options': { application: APP } },
    });
    await browser.pause(2500);
    return await fn(browser);
  } catch (e) {
    if (driverErr) console.error('[tauri-driver]', driverErr.slice(-1500));
    throw e;
  } finally {
    try { await browser?.deleteSession(); } catch (e) {}
    driver.kill();
    await new Promise((r) => setTimeout(r, 800));
    const realAfter = dbStamp(REAL_DB);
    console.log(`real assets.db: before ${realBefore} | after ${realAfter} | ${realBefore === realAfter ? 'UNCHANGED' : 'CHANGED!'}`);
    console.log(`test assets.db: before ${testBefore} | after ${dbStamp(path.join(RUN, 'assets.db'))}`);
  }
}

async function shot(browser, rel) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  await browser.saveScreenshot(p);
  return p;
}

// Visible text of the page, trimmed, for quick inspection.
async function pageText(browser, max = 4000) {
  const t = await browser.execute(() => {
    const c = document.body.cloneNode(true);
    c.querySelectorAll('select, script, style').forEach((s) => s.remove());
    document.body.appendChild(c);
    c.style.position = 'absolute'; c.style.left = '-99999px';
    const txt = c.innerText;
    c.remove();
    return txt;
  });
  return t.replace(/\n{2,}/g, '\n').slice(0, max);
}

module.exports = { withApp, shot, pageText, ROOT, RUN };
