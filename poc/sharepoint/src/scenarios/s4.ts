// S4: fill PoC_ChecklistResults past the 5,000-item list view threshold, then query it.
import type { Ctx } from '../lib/site.ts';
import { COUNTRIES, SERVICE_LINES, makeReport, newReportKey } from '../lib/data.ts';
import { bulkInsert } from '../lib/save.ts';
import { NONINDEXED, probe } from './common.ts';

const TARGET = 5500;

export async function countItems(ctx: Ctx, list: string) {
  const r = await probe(ctx, `count ${list}`, `${ctx.itemsUrl(list)}?$select=id&$top=5000`);
  return { count: r.items ?? 0, pages: r.pages, ms: r.ms, ok: r.ok, error: r.error };
}

export async function s4(ctx: Ctx) {
  const before = await countItems(ctx, 'ChecklistResults');
  if (!before.ok) throw new Error(`could not count ChecklistResults: ${before.error}`);
  const need = Math.max(0, TARGET - before.count);
  const reportsNeeded = Math.ceil(need / 24);
  const now = Date.now();
  const reports: Record<string, unknown>[] = [];
  const rows: Record<string, unknown>[] = [];
  // Deterministic pseudo-random so reruns produce similar data.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < reportsNeeded; i++) {
    const daysAgo = Math.floor(rnd() * 540);
    const submitted = new Date(now - daysAgo * 86400_000);
    const set = makeReport(newReportKey('S4'), { country: COUNTRIES[i % COUNTRIES.length], fails: Math.floor(rnd() * 5), submitted });
    set.report.ServiceLine = SERVICE_LINES[i % SERVICE_LINES.length];
    set.report.MaintenanceType = rnd() < 0.12 ? 'Breakdown' : rnd() < 0.2 ? 'Corrective' : 'Preventive';
    reports.push(set.report);
    for (const c of set.checklist) {
      if (c.Status === 'Fail' && daysAgo > 60 && rnd() < 0.6) c.ClosureStatus = 'Closed';
      rows.push(c);
    }
  }
  const t0 = performance.now();
  const c0 = ctx.g.calls.length;
  let last = 0;
  const repIns = await bulkInsert(ctx, 'MriReports', reports);
  const ins = await bulkInsert(ctx, 'ChecklistResults', rows, (done) => {
    if (done - last >= 1000 || done === rows.length) {
      last = done;
      process.stdout.write(`    inserted ${done}/${rows.length} checklist rows (${Math.round((performance.now() - t0) / 1000)} s)\n`);
    }
  });
  const fillMs = Math.round(performance.now() - t0);
  const fillCalls = ctx.g.calls.slice(c0);
  const after = await countItems(ctx, 'ChecklistResults');

  const url = ctx.itemsUrl('ChecklistResults');
  const sel = `$expand=fields($select=ReportKey,ItemName,Status,Severity,ClosureStatus)`;
  const q: any[] = [];
  q.push(await probe(ctx, 'a1 filter indexed Severity eq Critical', `${url}?$filter=fields/Severity eq 'Critical'&${sel}&$top=1000`));
  q.push(await probe(ctx, 'a2 filter indexed ReportKey eq <one report>', `${url}?$filter=fields/ReportKey eq '${String(reports[0]?.ReportKey ?? '')}'&${sel}`));
  q.push(await probe(ctx, 'b1 filter NON-indexed ItemName (no Prefer header)', `${url}?$filter=fields/ItemName eq 'Air Filter'&${sel}&$top=1000`));
  q.push(await probe(ctx, 'b2 filter NON-indexed ItemName (Prefer HonorNonIndexed)', `${url}?$filter=fields/ItemName eq 'Air Filter'&${sel}&$top=1000`, NONINDEXED));
  q.push(await probe(ctx, 'c1 orderby NON-indexed ItemName (no Prefer)', `${url}?$orderby=fields/ItemName&${sel}&$top=1000`));
  q.push(await probe(ctx, 'c2 orderby NON-indexed ItemName (Prefer HonorNonIndexed)', `${url}?$orderby=fields/ItemName&${sel}&$top=1000`, NONINDEXED));
  q.push(await probe(ctx, 'c3 orderby indexed Severity (no Prefer)', `${url}?$orderby=fields/Severity&${sel}&$top=1000`));
  q.push(await probe(ctx, 'e  read ALL rows, no filter, $top=5000 (paging)', `${url}?${sel}&$top=5000`));
  q.push(await probe(ctx, 'e2 read ALL rows, no filter, default page size', `${url}?${sel}`));

  // d) open Critical faults by country: indexed filter on ChecklistResults, then join to MriReports in code.
  const t1 = performance.now();
  const cd0 = ctx.g.calls.length;
  const crit = await probe(ctx, 'd1 Severity eq Critical and ClosureStatus eq Pending', `${url}?$filter=fields/Severity eq 'Critical' and fields/ClosureStatus eq 'Pending'&${sel}&$top=1000`);
  const reps = await probe(ctx, 'd2 all MriReports (ReportKey, Country)', `${ctx.itemsUrl('MriReports')}?$expand=fields($select=ReportKey,Country)&$top=5000`);
  const countryOf = new Map(reps.data.map((r: any) => [r.fields.ReportKey, r.fields.Country]));
  const byCountry: Record<string, number> = {};
  for (const r of crit.data) {
    const c = countryOf.get(r.fields.ReportKey) ?? '(no report)';
    byCountry[c] = (byCountry[c] ?? 0) + 1;
  }
  const d = { ms: Math.round(performance.now() - t1), calls: ctx.g.calls.length - cd0, openCriticalByCountry: byCountry, parts: [crit, reps].map(({ data, ...x }) => x) };

  const queries = q.map(({ data, ...x }) => x);
  const summary = {
    before, after,
    filled: { reports: reports.length, checklistRows: rows.length, ms: fillMs, batchCalls: fillCalls.filter((c) => c.path === '/$batch').length, failed: repIns.failed + ins.failed, errors: [...repIns.errors, ...ins.errors], throttled: ctx.g.batchThrottles.length },
    queries,
    dOpenCriticalByCountry: d,
  };
  const ok = queries.map((x) => `${x.label.split(' ')[0]}:${x.ok ? 'ok' : x.status}`).join(' ');
  const line = `list now ${after.count} items (filled ${rows.length} in ${Math.round(fillMs / 1000)} s); ${ok}; d) ${JSON.stringify(byCountry)} in ${d.ms} ms / ${d.calls} calls`;
  return { summary, raw: summary, line };
}
