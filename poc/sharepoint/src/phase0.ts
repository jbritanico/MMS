// Phase 0: authenticate, resolve the site, confirm write access with one PoC_ test item, then delete it.
// Creates a temporary list PoC_Phase0 (the item needs a list), deletes the item, then deletes the list.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Graph, GraphError } from './lib/graph.ts';

const LIST_NAME = 'PoC_Phase0';
const g = new Graph();
const steps: { step: string; ok: boolean; detail: string; ms?: number }[] = [];

async function step<T>(name: string, fn: () => Promise<T>, detail: (r: T) => string = () => ''): Promise<T> {
  const t0 = performance.now();
  try {
    const r = await fn();
    const ms = Math.round(performance.now() - t0);
    const d = detail(r);
    steps.push({ step: name, ok: true, detail: d, ms });
    console.log(`  PASS  ${name} (${ms} ms)${d ? ' - ' + d : ''}`);
    return r;
  } catch (e) {
    const msg = g.redact(e instanceof Error ? e.message : String(e));
    steps.push({ step: name, ok: false, detail: msg });
    console.log(`  FAIL  ${name} - ${msg}`);
    throw e;
  }
}

/** Try v1.0; if the endpoint is not supported there, retry on beta and note it. */
async function v1ThenBeta<T>(method: string, path: string, body?: unknown): Promise<{ r: T; api: string }> {
  try {
    return { r: await g.request<T>(method, path, { body }), api: 'v1.0' };
  } catch (e) {
    if (e instanceof GraphError && [400, 404, 405, 501].includes(e.status)) {
      return { r: await g.request<T>(method, path, { body, api: 'beta' }), api: 'beta' };
    }
    throw e;
  }
}

async function main() {
  console.log('Phase 0 check');
  console.log(`  Target: ${g.env.siteUrl}`);

  await step('Sign in (client credentials)', async () => {
    await (g as any).getToken();
  });

  const site = await step('Resolve site + URL guard', () => g.resolveSite(), (s) => `"${s.displayName}" webUrl matches SP_SITE_URL`);

  const lists = await step(
    'Read existing lists (baseline, read-only)',
    () => g.request<{ value: { id: string; displayName: string; list?: { template?: string; hidden?: boolean } }[] }>(
      'GET',
      `/sites/${site.id}/lists?$select=id,displayName,list&$top=200`,
    ),
    (r) => `${r.value.length} lists`,
  );

  let list = lists.value.find((l) => l.displayName === LIST_NAME);
  if (list) {
    g.registerPocList(list.id, list.displayName);
    steps.push({ step: `Reuse existing ${LIST_NAME}`, ok: true, detail: 'left over from an earlier run' });
    console.log(`  NOTE  ${LIST_NAME} already existed; reusing it`);
  } else {
    list = await step(`Create list ${LIST_NAME}`, () =>
      g.request('POST', `/sites/${site.id}/lists`, {
        body: { displayName: LIST_NAME, list: { template: 'genericList' } },
      }),
    );
    g.registerPocList(list!.id, list!.displayName);
  }
  const listId = list!.id;

  const item = await step(
    'Create test item',
    () => g.request<{ id: string; eTag: string }>('POST', `/sites/${site.id}/lists/${listId}/items`, {
      body: { fields: { Title: 'PoC_phase0_test_item' } },
    }),
    (r) => `item id ${r.id}`,
  );

  await step('Read test item back', () =>
    g.request('GET', `/sites/${site.id}/lists/${listId}/items/${item.id}?$expand=fields($select=Title)`),
    (r: any) => `Title="${r.fields?.Title}"`,
  );

  await step('Delete test item', () => g.request('DELETE', `/sites/${site.id}/lists/${listId}/items/${item.id}`));

  const del = await step(`Delete list ${LIST_NAME}`, () => v1ThenBeta('DELETE', `/sites/${site.id}/lists/${listId}`), (r) => `via ${r.api}`);

  // Read-only look at the recycle bin, so we know what cleanup must purge later.
  let recycle: { api: string; pocEntries: number; total: number } | { error: string };
  try {
    const { r, api } = await v1ThenBeta<{ value: { title?: string; name?: string }[] }>('GET', `/sites/${site.id}/recycleBin/items`);
    const poc = r.value.filter((x) => (x.title ?? x.name ?? '').startsWith('PoC_'));
    recycle = { api, pocEntries: poc.length, total: r.value.length };
    console.log(`  INFO  Recycle bin readable via ${api}: ${poc.length} PoC_ entries (will be purged by cleanup)`);
  } catch (e) {
    recycle = { error: g.redact(e instanceof Error ? e.message : String(e)) };
    console.log(`  INFO  Recycle bin not readable through Graph: ${recycle.error}`);
  }

  const ok = steps.every((s) => s.ok);
  mkdirSync('results/raw', { recursive: true });
  writeFileSync(
    'results/raw/phase0.json',
    JSON.stringify(
      {
        when: new Date().toISOString(),
        siteUrl: g.env.siteUrl,
        result: ok ? 'PASS' : 'FAIL',
        steps,
        deleteListApi: del.api,
        recycleBin: recycle,
        baselineLists: lists.value.map((l) => ({ displayName: l.displayName, template: l.list?.template, hidden: l.list?.hidden })),
        betaCalls: [...g.betaCalls],
        calls: g.calls,
      },
      null,
      2,
    ),
  );
  console.log(`\nPhase 0: ${ok ? 'PASS' : 'FAIL'}  (${g.calls.length} HTTP calls; details in results/raw/phase0.json)`);
  console.log('Existing lists on the site (untouched):');
  for (const l of lists.value) console.log(`  - ${l.displayName}${l.list?.hidden ? ' (hidden)' : ''}`);
}

main().catch(() => {
  console.log('\nPhase 0: FAIL - stopped. Nothing further was attempted.');
  process.exitCode = 1;
});
