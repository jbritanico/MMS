// S7: dashboard figures computed from SharePoint (fetch with indexed filters, compute in code).
// BMER has no agreed formula in MMS yet (gap list D2), so this computes its inputs per month.
import type { Ctx } from '../lib/site.ts';
import { probe } from './common.ts';

export async function s7(ctx: Ctx) {
  const t0 = performance.now();
  const c0 = ctx.g.calls.length;
  const fails = await probe(
    ctx,
    'ChecklistResults Status eq Fail',
    `${ctx.itemsUrl('ChecklistResults')}?$filter=fields/Status eq 'Fail'&$expand=fields($select=ReportKey,Severity,ClosureStatus,DateObserved)&$top=5000`,
  );
  const reps = await probe(
    ctx,
    'MriReports (all)',
    `${ctx.itemsUrl('MriReports')}?$expand=fields($select=ReportKey,Country,ServiceLine,MaintenanceType,SubmittedDate,JobOperatingHours,AssetLookupLookupId)&$top=5000`,
  );
  const now = Date.now();
  const openBySeverity: Record<string, number> = {};
  const aging: Record<string, number> = { '0-30d': 0, '31-90d': 0, '91-180d': 0, '181-365d': 0, '>365d': 0 };
  for (const r of fails.data) {
    const f = r.fields;
    if (f.ClosureStatus === 'Closed') continue;
    openBySeverity[f.Severity || '(none)'] = (openBySeverity[f.Severity || '(none)'] ?? 0) + 1;
    const days = (now - Date.parse(f.DateObserved)) / 86400_000;
    aging[days <= 30 ? '0-30d' : days <= 90 ? '31-90d' : days <= 180 ? '91-180d' : days <= 365 ? '181-365d' : '>365d']++;
  }
  const bmer: Record<string, { reports: number; breakdowns: number; operatingHours: number; countries: Set<string> | string[] }> = {};
  for (const r of reps.data) {
    const f = r.fields;
    if (!f.SubmittedDate) continue;
    const m = String(f.SubmittedDate).slice(0, 7);
    const b = (bmer[m] ??= { reports: 0, breakdowns: 0, operatingHours: 0, countries: new Set() });
    b.reports++;
    if (f.MaintenanceType === 'Breakdown') b.breakdowns++;
    b.operatingHours += Number(f.JobOperatingHours ?? 0);
    (b.countries as Set<string>).add(f.Country);
  }
  const months = Object.keys(bmer).sort();
  const bmerInputs = months.slice(-12).map((m) => ({ month: m, reports: bmer[m].reports, breakdownEvents: bmer[m].breakdowns, operatingHours: bmer[m].operatingHours }));
  const calls = ctx.g.calls.slice(c0);
  const summary = {
    ms: Math.round(performance.now() - t0),
    calls: calls.length,
    bytesTransferred: calls.reduce((a, c) => a + c.bytesIn, 0),
    rowsFetched: { checklistFails: fails.items ?? 0, reports: reps.items ?? 0 },
    fetchOk: fails.ok && reps.ok,
    errors: [fails, reps].filter((x) => !x.ok).map((x) => `${x.label}: ${x.error}`),
    openBySeverity,
    agingBuckets: aging,
    bmerInputsLast12Months: bmerInputs,
  };
  const line = `${summary.ms} ms, ${summary.calls} calls, ${Math.round(summary.bytesTransferred / 1024)} KB for ${summary.rowsFetched.checklistFails} fail rows + ${summary.rowsFetched.reports} reports; open by severity ${JSON.stringify(openBySeverity)}`;
  return { summary, raw: summary, line };
}
