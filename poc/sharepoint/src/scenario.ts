// npm run scenario -- <S1|S2|S3|S4|S6|S7|S8>   or   npm run all (everything except S5)
import { connect } from './lib/site.ts';
import { callStats, saveScenario } from './lib/stats.ts';
import { s1 } from './scenarios/s1.ts';
import { s2 } from './scenarios/s2.ts';
import { s3 } from './scenarios/s3.ts';
import { s4 } from './scenarios/s4.ts';
import { s5 } from './scenarios/s5.ts';
import { s6 } from './scenarios/s6.ts';
import { s7 } from './scenarios/s7.ts';
import { s8 } from './scenarios/s8.ts';

const SCENARIOS: Record<string, (ctx: Awaited<ReturnType<typeof connect>>) => Promise<{ summary: unknown; raw: unknown; line: string }>> = {
  S1: s1, S2: s2, S3: s3, S4: s4, S6: s6, S7: s7, S8: s8,
};

async function main() {
  const arg = (process.argv[2] ?? '').toUpperCase();
  if (arg === 'S5' && !process.argv.includes('--go')) {
    console.log('S5 (throttling) runs only after Jess says go, in the agreed window:  npm run scenario -- S5 --go');
    process.exitCode = 1;
    return;
  }
  // "all" never includes S5.
  const ids = arg === 'ALL' ? Object.keys(SCENARIOS) : [arg];
  const runnable: Record<string, (typeof SCENARIOS)[string]> = { ...SCENARIOS, S5: s5 };
  if (!ids.every((id) => runnable[id])) {
    console.log(`Usage: npm run scenario -- <${Object.keys(SCENARIOS).join('|')}>  or  npm run all`);
    process.exitCode = 1;
    return;
  }
  const ctx = await connect();
  console.log(`Target: ${ctx.g.env.siteUrl}`);
  for (const id of ids) {
    console.log(`\n=== ${id} start ${new Date().toISOString()}`);
    const c0 = ctx.g.calls.length;
    const th0 = ctx.g.batchThrottles.length;
    const beta0 = new Set(ctx.g.betaCalls);
    const t0 = performance.now();
    try {
      const { summary, raw, line } = await runnable[id](ctx);
      const calls = ctx.g.calls.slice(c0);
      const http = callStats(calls);
      const batchThrottles = ctx.g.batchThrottles.slice(th0);
      const throttling = {
        topLevel429or503: http.throttled,
        insideBatch429or503: batchThrottles.length,
        retryAfterSeconds: batchThrottles.map((t) => t.retryAfter),
        detail: batchThrottles,
      };
      const betaCalls = [...ctx.g.betaCalls].filter((b) => !beta0.has(b));
      saveScenario(id, { ok: true, durationMs: Math.round(performance.now() - t0), http, throttling, betaCalls, result: summary }, { raw, calls });
      console.log(`=== ${id} DONE in ${Math.round((performance.now() - t0) / 1000)} s, ${http.calls} HTTP calls, throttled ${http.throttled} calls + ${batchThrottles.length} inside batches: ${line}`);
    } catch (e) {
      const msg = ctx.g.redact(e instanceof Error ? e.stack ?? e.message : String(e));
      saveScenario(id, { ok: false, error: msg.slice(0, 1000) }, { error: msg, calls: ctx.g.calls.slice(c0) });
      console.log(`=== ${id} FAILED: ${msg.split('\n')[0]}`);
      if (/guard/i.test(msg)) {
        console.log('A safety guard stopped the run. Stopping all scenarios.');
        break;
      }
    }
  }
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
