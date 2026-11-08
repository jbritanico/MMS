// S5: throttling. Simulates devices syncing at once, ramping up: 2, 5, 10, 20 devices, each saving one full
// MR-I report with $batch (43 list items + 1 photo = 45 requests to SharePoint).
// CAPS: at most 2,000 requests to SharePoint (counting every sub-request inside a $batch) or 10 minutes.
// STOPS launching new saves at the first SUSTAINED 429 run: throttling seen in 3 consecutive 10-second windows,
// or any Retry-After of 60 s or more. Saves already in flight finish, honouring Retry-After.
import type { Ctx } from '../lib/site.ts';
import { makePhoto, makeReport, newReportKey } from '../lib/data.ts';
import { saveBatched } from '../lib/save.ts';
import { inventory } from '../lib/recovery.ts';
import { pct } from '../lib/stats.ts';

const MAX_REQUESTS = 2000;
const MAX_MS = 10 * 60_000;
const STAGES = [2, 5, 10, 20];
const PER_REPORT = 45;

export async function s5(ctx: Ctx) {
  const { g } = ctx;
  const t0 = Date.now();
  const c0 = g.calls.length;
  const th0 = g.batchThrottles.length;
  const sub0 = g.subRequests;
  const requestsSoFar = () =>
    g.subRequests - sub0 + g.calls.slice(c0).filter((c) => c.path !== '/$batch').length;
  const throttleEvents = () => [
    ...g.batchThrottles.slice(th0).map((t) => ({ t: Date.parse(t.at), retryAfter: t.retryAfter })),
    ...g.calls.slice(c0).filter((c) => c.status === 429 || c.status === 503).map((c) => ({ t: NaN, retryAfter: c.retryAfter ?? 0 })),
  ];
  let stopReason = '';
  const sustained = (): boolean => {
    const ev = throttleEvents();
    if (ev.some((e) => e.retryAfter >= 60)) return true;
    const now = Date.now();
    const windows = [0, 1, 2].map((w) => ev.some((e) => e.t <= now - w * 10_000 && e.t > now - (w + 1) * 10_000));
    return windows.every(Boolean);
  };

  const stages: any[] = [];
  const keys: string[] = [];
  for (const devices of STAGES) {
    if (Date.now() - t0 > MAX_MS) { stopReason = 'time cap (10 min)'; break; }
    if (requestsSoFar() + devices * PER_REPORT > MAX_REQUESTS) { stopReason = `request cap (${MAX_REQUESTS}) would be exceeded by the next stage`; break; }
    if (sustained()) { stopReason = 'sustained 429 run'; break; }
    const s0 = Date.now();
    const r0 = requestsSoFar();
    const thStart = g.batchThrottles.length;
    const callStart = g.calls.length;
    console.log(`    stage: ${devices} devices saving at once (requests so far ${r0})`);
    const results = await Promise.all(
      Array.from({ length: devices }, async (_, d) => {
        const set = makeReport(newReportKey(`S5d${devices}x${d}`));
        keys.push(set.key);
        const ts = Date.now();
        try {
          const r = await saveBatched(ctx, set, makePhoto(set.key), 6);
          return { key: set.key, ms: Date.now() - ts, failed: r.failed, error: '' };
        } catch (e) {
          return { key: set.key, ms: Date.now() - ts, failed: -1, error: g.redact(String((e as Error).message)).slice(0, 200) };
        }
      }),
    );
    const durMs = Date.now() - s0;
    const reqs = requestsSoFar() - r0;
    const th = g.batchThrottles.slice(thStart);
    const top429 = g.calls.slice(callStart).filter((c) => c.status === 429 || c.status === 503);
    const ra = [...th.map((t) => t.retryAfter), ...top429.map((c) => c.retryAfter ?? 0)];
    const ms = results.map((r) => r.ms);
    const stage = {
      devices,
      requests: reqs,
      durationS: Math.round(durMs / 100) / 10,
      requestsPerMinute: Math.round((reqs / durMs) * 60_000),
      throttled: th.length + top429.length,
      retryAfterSeconds: ra,
      savesOk: results.filter((r) => r.failed === 0).length,
      savesWithFailures: results.filter((r) => r.failed !== 0).length,
      saveMs: { p50: pct(ms, 50), p95: pct(ms, 95), max: Math.max(...ms) },
      errors: results.filter((r) => r.error).map((r) => r.error),
    };
    stages.push(stage);
    console.log(`      ${stage.requests} requests in ${stage.durationS} s = ${stage.requestsPerMinute}/min; throttled ${stage.throttled}${ra.length ? ` (Retry-After ${[...new Set(ra)].join(',')} s)` : ''}; saves ok ${stage.savesOk}/${devices}`);
  }
  if (!stopReason) stopReason = 'all stages completed within the caps';

  // Verify every save is complete on the site (reads, not counted in the load).
  let complete = 0;
  const incomplete: string[] = [];
  for (const k of keys) {
    const inv = await inventory(ctx, k);
    if (inv.complete) complete++;
    else incomplete.push(k);
  }
  const firstThrottle = stages.find((s) => s.throttled > 0);
  const summary = {
    caps: { maxRequests: MAX_REQUESTS, maxMinutes: 10, perReportRequests: PER_REPORT, stages: STAGES },
    stopReason,
    totalRequests: requestsSoFar(),
    totalMinutes: Math.round((Date.now() - t0) / 6000) / 10,
    stages,
    firstThrottledStage: firstThrottle ? { devices: firstThrottle.devices, requestsPerMinute: firstThrottle.requestsPerMinute } : null,
    highestUnthrottledRate: Math.max(0, ...stages.filter((s) => s.throttled === 0).map((s) => s.requestsPerMinute)),
    reports: keys.length,
    reportsCompleteAfterBackoff: complete,
    incomplete,
    throttleDetail: g.batchThrottles.slice(th0),
  };
  const line = `stop: ${stopReason}; ${summary.totalRequests} requests; highest rate with no 429 ${summary.highestUnthrottledRate}/min; first 429 at ${firstThrottle ? `${firstThrottle.devices} devices (${firstThrottle.requestsPerMinute}/min)` : 'none'}; complete after back-off ${complete}/${keys.length}`;
  return { summary, raw: summary, line };
}
