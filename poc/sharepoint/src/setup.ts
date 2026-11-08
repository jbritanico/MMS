// npm run setup: create the PoC_ lists and library with their columns and indexes, and seed test assets.
// Idempotent: existing lists/columns are reused; missing indexes are switched on.
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from './lib/site.ts';
import { LISTS, columnBody, pocName } from './lib/schema.ts';
import { ASSETS } from './lib/data.ts';

async function main() {
  const ctx = await connect();
  const { g, siteId } = ctx;
  console.log(`Setup on ${g.env.siteUrl}`);

  // 1. Lists (lookup targets first: Assets is first in LISTS).
  for (const def of LISTS) {
    const name = pocName(def.name);
    if (!ctx.lists[def.name]) {
      const created = await g.request<{ id: string; displayName: string }>('POST', `/sites/${siteId}/lists`, {
        body: { displayName: name, list: { template: def.template } },
      });
      let driveId: string | undefined;
      if (def.template === 'documentLibrary') {
        driveId = (await g.request<{ id: string }>('GET', `/sites/${siteId}/lists/${created.id}/drive?$select=id`)).id;
      }
      g.registerPocList(created.id, created.displayName, driveId);
      ctx.lists[def.name] = { id: created.id, displayName: created.displayName, driveId };
      console.log(`  created ${name}`);
    } else {
      console.log(`  exists  ${name}`);
    }

    // 2. Columns.
    const listId = ctx.lists[def.name].id;
    const { items: cols } = await g.getAll<{ id: string; name: string; indexed: boolean }>(
      `/sites/${siteId}/lists/${listId}/columns?$select=id,name,indexed`,
    );
    for (const c of def.columns) {
      const existing = cols.find((x) => x.name === c.name);
      if (!existing) {
        const lookupId = c.lookupList ? ctx.lists[c.lookupList]?.id : undefined;
        await g.request('POST', `/sites/${siteId}/lists/${listId}/columns`, { body: columnBody(c, lookupId) });
        console.log(`    + ${c.name}${c.indexed ? ' (indexed)' : ''}`);
      } else if (!!c.indexed !== existing.indexed) {
        await g.request('PATCH', `/sites/${siteId}/lists/${listId}/columns/${existing.id}`, { body: { indexed: !!c.indexed } });
        console.log(`    ~ ${c.name} indexed=${!!c.indexed}`);
      }
    }
  }

  // 3. Seed assets (by AssetCode, idempotent).
  const assetsUrl = ctx.itemsUrl('Assets');
  const { items: have } = await g.getAll<{ fields: { AssetCode: string } }>(`${assetsUrl}?$expand=fields($select=AssetCode)&$top=500`);
  const haveCodes = new Set(have.map((a) => a.fields.AssetCode));
  const missing = ASSETS.filter((a) => !haveCodes.has(a.AssetCode));
  for (let i = 0; i < missing.length; i += 20) {
    const res = await g.batch(
      missing.slice(i, i + 20).map((a) => ({ method: 'POST', url: assetsUrl, body: { fields: { Title: a.AssetCode, ...a } } })),
    );
    const bad = res.filter((r) => r.status >= 300);
    if (bad.length) throw new Error(`asset seed failed: ${JSON.stringify(bad[0].body).slice(0, 300)}`);
  }
  console.log(`  assets: ${haveCodes.size} existing, ${missing.length} added`);

  // 4. Verify: read back every PoC_ list and its indexed columns.
  const summary: { list: string; template: string; columns: string[]; indexed: string[] }[] = [];
  for (const def of LISTS) {
    const l = ctx.lists[def.name];
    const { items: cols } = await g.getAll<{ name: string; indexed: boolean; readOnly: boolean }>(
      `/sites/${siteId}/lists/${l.id}/columns?$select=name,indexed,readOnly`,
    );
    const custom = def.columns.map((c) => c.name);
    const present = custom.filter((n) => cols.some((c) => c.name === n));
    const missingCols = custom.filter((n) => !present.includes(n));
    if (missingCols.length) throw new Error(`${l.displayName}: columns missing after setup: ${missingCols.join(', ')}`);
    summary.push({
      list: l.displayName,
      template: def.template,
      columns: present,
      indexed: cols.filter((c) => c.indexed && custom.includes(c.name)).map((c) => c.name),
    });
  }
  mkdirSync('results/raw', { recursive: true });
  writeFileSync('results/raw/setup.json', JSON.stringify({ when: new Date().toISOString(), summary, calls: g.calls.length, betaCalls: [...g.betaCalls] }, null, 2));
  console.log('\nPoC_ lists and indexed columns (read back from SharePoint):');
  for (const s of summary) console.log(`  ${s.list.padEnd(24)} indexed: ${s.indexed.join(', ') || '-'}   (${s.columns.length} columns)`);
  console.log(`\nSetup OK (${g.calls.length} HTTP calls).`);
}

main().catch((e) => {
  console.error('Setup FAILED:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
