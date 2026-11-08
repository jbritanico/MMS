// S1: save a full MR-I report, item by item and with $batch (20 per batch), 10 runs each.
import type { Ctx } from '../lib/site.ts';
import { makePhoto, makeReport, newReportKey } from '../lib/data.ts';
import { saveBatched, saveItemByItem } from '../lib/save.ts';
import { callStats, pct } from '../lib/stats.ts';
import { assetItemId } from './common.ts';

export async function s1(ctx: Ctx) {
  const RUNS = 10;
  const asset = await assetItemId(ctx, 'PoC-ASSET2');
  const out: Record<string, any> = {};
  const raw: Record<string, any> = {};
  for (const mode of ['itemByItem', 'batch'] as const) {
    const runs: { ms: number; calls: number; failed: number; reportKey: string }[] = [];
    const startAll = ctx.g.calls.length;
    for (let i = 0; i < RUNS; i++) {
      const set = makeReport(newReportKey(`S1${mode === 'batch' ? 'b' : 'i'}${i}`), { assetItemId: asset });
      const photo = makePhoto(set.key);
      const c0 = ctx.g.calls.length;
      const t0 = performance.now();
      let failed = 0;
      if (mode === 'batch') failed = (await saveBatched(ctx, set, photo)).failed;
      else await saveItemByItem(ctx, set, photo);
      runs.push({ ms: Math.round(performance.now() - t0), calls: ctx.g.calls.length - c0, failed, reportKey: set.key });
      process.stdout.write(`    ${mode} run ${i + 1}/${RUNS}: ${runs[i].ms} ms, ${runs[i].calls} calls\n`);
    }
    const calls = ctx.g.calls.slice(startAll);
    const totals = runs.map((r) => r.ms);
    out[mode] = {
      runs: RUNS,
      itemsPerReport: 1 + 15 + 24 + 3,
      photoPerReport: 1,
      totalMs: { p50: pct(totals, 50), p95: pct(totals, 95), min: Math.min(...totals), max: Math.max(...totals) },
      httpCallsPerReport: runs[0].calls,
      perCall: callStats(calls),
      perCallByKind: {
        listItemPost: callStats(calls.filter((c) => c.method === 'POST' && c.path.includes('/items'))),
        batchPost: callStats(calls.filter((c) => c.path === '/$batch')),
        photoPut: callStats(calls.filter((c) => c.method === 'PUT')),
        photoMetadataPatch: callStats(calls.filter((c) => c.method === 'PATCH')),
      },
      failedSubRequests: runs.reduce((a, r) => a + r.failed, 0),
    };
    raw[mode] = { runs, calls };
  }
  const ib = out.itemByItem, b = out.batch;
  const line = `item-by-item p50 ${ib.totalMs.p50} ms (${ib.httpCallsPerReport} calls) vs $batch p50 ${b.totalMs.p50} ms (${b.httpCallsPerReport} calls); throttled responses: ${ib.perCall.throttled + b.perCall.throttled}`;
  return { summary: out, raw, line };
}
