// "IT runs the SQL": runs statements on the TEST database (e2e/run/assets.db) through the
// test-only Rust helper e2e/app/it_sql.exe (built from src-tauri/tests/it_sql.rs), which uses
// the app's own connection code so the encryption key never appears here.
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function itSql(...statements) {
  const r = spawnSync(path.join(ROOT, 'e2e', 'app', 'it_sql.exe'), ['--ignored', '--nocapture', '--test-threads=1'], {
    env: { ...process.env, MMS_IT_SQL: statements.join(';;'), MMS_TEST_DB_DIR: path.join(ROOT, 'e2e', 'run') },
    encoding: 'utf8',
    timeout: 60000,
  });
  const out = (r.stdout || '').split(/\r?\n/).filter((l) => l.includes('IT_SQL {')).map((l) => JSON.parse(l.slice(l.indexOf('IT_SQL {') + 7)));
  if (out.length !== statements.length) throw new Error('IT SQL failed: ' + (r.stderr || r.stdout || '').slice(-800));
  return out;
}

// First row of a SELECT, or null.
function itRow(sql) {
  const [r] = itSql(sql);
  if (!r.ok) throw new Error(r.error);
  return r.rows[0] || null;
}

module.exports = { itSql, itRow };
