// npm run cleanup: delete every PoC_ list and library, purge their recycle bin entries, verify nothing remains.
// Run ONLY when Jess says so.  Add --dry-run to list what would be deleted without deleting anything.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Graph } from './lib/graph.ts';

const DRY = process.argv.includes('--dry-run');
const g = new Graph();

interface Bin { id: string; title?: string; name?: string; deletedFromLocation?: string; deletedBy?: { user?: { displayName?: string } } }

/** A recycle entry is PoC when it came from a PoC_ list/library (or is a PoC_ list itself) and was deleted by the app. */
function isPoc(x: Bin, sitePath: string): boolean {
  const loc = (x.deletedFromLocation ?? '').replace(/^\/+/, '');
  const base = sitePath.replace(/^\/+/, '');
  if (!loc.startsWith(base)) return false;
  const rest = loc.slice(base.length).split('/').filter(Boolean); // e.g. ['Lists','PoC_X'] or ['PoC_ReportPhotos'] or ['Lists']
  const fromPocContainer = rest.some((seg) => seg.startsWith('PoC_'));
  const isPocContainerItself = (x.title ?? '').startsWith('PoC_') && (rest.length === 0 || (rest.length === 1 && rest[0] === 'Lists'));
  const byApp = x.deletedBy?.user?.displayName === 'SharePoint App';
  return byApp && (fromPocContainer || isPocContainerItself);
}

async function readBin(siteId: string, sitePath: string) {
  const { items } = await g.getAll<Bin>(`/sites/${siteId}/recycleBin/items?$top=500`, undefined).catch(async () => {
    // Recycle bin is only on beta for this tenant (Phase 0 finding).
    const all: Bin[] = [];
    let next: string | undefined = `/sites/${siteId}/recycleBin/items?$top=500`;
    while (next) {
      const j: any = await g.request('GET', next, { api: 'beta' });
      all.push(...j.value);
      next = j['@odata.nextLink']?.replace(/^https:\/\/graph\.microsoft\.com\/beta/, '');
    }
    return { items: all, pages: 0 };
  });
  return { all: items, poc: items.filter((x) => isPoc(x, sitePath)) };
}

async function main() {
  const site = await g.resolveSite();
  const sitePath = new URL(g.env.siteUrl).pathname; // /sites/MMS
  console.log(`Cleanup on ${g.env.siteUrl}${DRY ? '  (DRY RUN - nothing will be deleted)' : ''}`);

  // 1. Lists and libraries.
  const { items: lists } = await g.getAll<{ id: string; displayName: string }>(`/sites/${site.id}/lists?$select=id,displayName&$top=200`);
  const poc = lists.filter((l) => l.displayName.startsWith('PoC_'));
  const others = lists.filter((l) => !l.displayName.startsWith('PoC_')).map((l) => l.displayName);
  console.log(`  PoC_ lists/libraries to delete: ${poc.map((l) => l.displayName).join(', ') || '(none)'}`);
  console.log(`  Other lists (left alone): ${others.join(', ')}`);
  const listErrors: string[] = [];
  if (!DRY) {
    for (const l of poc) {
      g.registerPocList(l.id, l.displayName);
      try {
        await g.request('DELETE', `/sites/${site.id}/lists/${l.id}`);
        console.log(`    deleted ${l.displayName}`);
      } catch (e) {
        listErrors.push(`${l.displayName}: ${g.redact(String((e as Error).message))}`);
        console.log(`    FAILED ${l.displayName}: ${listErrors.at(-1)}`);
      }
    }
  }

  // 2. Recycle bin (first stage), then whatever moves to the second stage.
  let bin = await readBin(site.id, sitePath);
  console.log(`  Recycle bin: ${bin.poc.length} PoC entries (of ${bin.all.length} total; non-PoC entries are left alone)`);
  const purgeLog: { pass: number; method: string; status: number; count: number; error?: string }[] = [];
  if (!DRY) {
    for (let pass = 1; pass <= 3 && bin.poc.length; pass++) {
      for (const x of bin.poc) g.pocRecycleIds.add(x.id);
      for (let i = 0; i < bin.poc.length; i += 50) {
        const ids = bin.poc.slice(i, i + 50).map((x) => x.id);
        // Try permanent delete; fall back to plain delete (beta API names have changed over time).
        let r = await g.raw('POST', `/sites/${site.id}/recycleBin/items/permanentDelete`, { api: 'beta', body: { ids } });
        let method = 'permanentDelete';
        if (!r.ok) {
          r = await g.raw('POST', `/sites/${site.id}/recycleBin/items/delete`, { api: 'beta', body: { ids } });
          method = 'delete';
        }
        purgeLog.push({ pass, method, status: r.status, count: ids.length, error: r.ok ? undefined : g.redact(r.text.slice(0, 300)) });
      }
      bin = await readBin(site.id, sitePath);
    }
  }

  // 3. Verify.
  const { items: listsAfter } = await g.getAll<{ displayName: string }>(`/sites/${site.id}/lists?$select=displayName&$top=200`);
  const pocListsLeft = listsAfter.filter((l) => l.displayName.startsWith('PoC_')).map((l) => l.displayName);
  const summary = {
    when: new Date().toISOString(),
    dryRun: DRY,
    deletedLists: DRY ? [] : poc.map((l) => l.displayName).filter((n) => !pocListsLeft.includes(n)),
    listErrors,
    pocListsLeft,
    otherListsUntouched: others,
    recycleBinPocEntriesLeft: bin.poc.length,
    purgeLog,
    secondStageNote:
      'Graph shows one recycle bin view. If the second-stage (site collection) bin is not exposed through Graph, check it by hand: Site contents > Recycle bin > Second-stage recycle bin.',
  };
  mkdirSync('results/raw', { recursive: true });
  writeFileSync(`results/raw/cleanup${DRY ? '_dryrun' : ''}.json`, JSON.stringify(summary, null, 2));
  console.log('\nSummary');
  console.log(`  PoC_ lists left: ${pocListsLeft.length ? pocListsLeft.join(', ') : 'none'}`);
  console.log(`  PoC recycle bin entries left: ${bin.poc.length}`);
  for (const p of purgeLog) console.log(`  purge pass ${p.pass}: ${p.method} ${p.count} -> ${p.status}${p.error ? ' ' + p.error : ''}`);
  console.log(`  Other lists untouched: ${others.join(', ')}`);
  console.log('  Second-stage bin: check by hand (procedure Part D step 2).');
  if (!DRY && (pocListsLeft.length || bin.poc.length || listErrors.length)) process.exitCode = 1;
}

main().catch((e) => {
  console.error('Cleanup FAILED:', g.redact(e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
});
