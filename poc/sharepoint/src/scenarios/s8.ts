// S8: orphans. Delete a report while its child rows exist; check what remains; measure clean-up.
// Also: delete an asset that a report points to through a lookup column.
import type { Ctx } from '../lib/site.ts';
import { makeReport, newReportKey } from '../lib/data.ts';
import { bulkDelete, bulkInsert, idsForReport, saveBatched } from '../lib/save.ts';
import { probe } from './common.ts';

const CHILD_LISTS = ['ReportHeaderValues', 'ChecklistResults', 'FaultApprovals'];

export async function s8(ctx: Ctx) {
  const { g } = ctx;
  // a) Report with children, then delete only the report row.
  const set = makeReport(newReportKey('S8'));
  const { reportItemId } = await saveBatched(ctx, set);
  const del = await g.raw('DELETE', `${ctx.itemsUrl('MriReports')}/${reportItemId}`);
  const orphans: Record<string, number> = {};
  for (const l of CHILD_LISTS) orphans[l] = (await idsForReport(ctx, l, set.key)).length;
  const reportGone = (await idsForReport(ctx, 'MriReports', set.key)).length === 0;

  // b) Targeted clean-up when the ReportKey is known (indexed filter + $batch delete).
  let t0 = performance.now();
  let c0 = g.calls.length;
  for (const l of CHILD_LISTS) await bulkDelete(ctx, l, (await idsForReport(ctx, l, set.key)).map((r) => r.id));
  const targeted = { ms: Math.round(performance.now() - t0), calls: g.calls.length - c0 };
  const left: Record<string, number> = {};
  for (const l of CHILD_LISTS) left[l] = (await idsForReport(ctx, l, set.key)).length;

  // c) Sweep when the key is not known: read every child row's ReportKey and every report key, diff.
  t0 = performance.now();
  c0 = g.calls.length;
  const reps = await probe(ctx, 'all report keys', `${ctx.itemsUrl('MriReports')}?$expand=fields($select=ReportKey)&$top=5000`);
  const live = new Set(reps.data.map((r: any) => r.fields.ReportKey));
  const sweepFound: Record<string, number> = {};
  const sweepErrors: string[] = [];
  for (const l of CHILD_LISTS) {
    const all = await probe(ctx, `all ${l} keys`, `${ctx.itemsUrl(l)}?$expand=fields($select=ReportKey)&$top=5000`);
    if (!all.ok) sweepErrors.push(`${l}: ${all.error}`);
    sweepFound[l] = all.data.filter((r: any) => !live.has(r.fields.ReportKey)).length;
  }
  const sweepCalls = g.calls.slice(c0);
  const sweep = { ms: Math.round(performance.now() - t0), calls: sweepCalls.length, bytes: sweepCalls.reduce((a, c) => a + c.bytesIn, 0), orphansFound: sweepFound, errors: sweepErrors };

  // d) Lookup column: delete the asset a report points to.
  await bulkInsert(ctx, 'Assets', [{ Title: 'PoC-ASSET-S8', AssetCode: 'PoC-ASSET-S8', Country: 'Oman', ServiceLine: 'Pumping', TagStatus: 'Green' }]);
  const asset = (await g.request<{ value: { id: string }[] }>('GET', `${ctx.itemsUrl('Assets')}?$filter=fields/AssetCode eq 'PoC-ASSET-S8'&$select=id`)).value[0].id;
  const set2 = makeReport(newReportKey('S8L'), { assetItemId: asset, fails: 0 });
  const rep2 = await g.request<{ id: string }>('POST', ctx.itemsUrl('MriReports'), { body: { fields: set2.report } });
  const assetDel = await g.raw('DELETE', `${ctx.itemsUrl('Assets')}/${asset}`);
  const rep2After = await g.request<{ fields: any }>('GET', `${ctx.itemsUrl('MriReports')}/${rep2.id}?$expand=fields`);
  const lookup = {
    assetDeleteStatus: assetDel.status,
    reportStillExists: true,
    reportAssetLookupIdAfterDelete: rep2After.fields.AssetLookupLookupId ?? null,
    reportAssetLookupValueAfterDelete: rep2After.fields.AssetLookup ?? null,
  };

  const summary = { reportKey: set.key, reportDeleteStatus: del.status, reportGone, orphansAfterReportDelete: orphans, targetedCleanup: { ...targeted, remaining: left }, sweepCleanup: sweep, lookupColumn: lookup };
  const line = `report deleted (${del.status}); orphans left: ${JSON.stringify(orphans)}; targeted cleanup ${targeted.ms} ms/${targeted.calls} calls; full sweep ${sweep.ms} ms/${sweep.calls} calls${sweepErrors.length ? ' (errors)' : ''}; asset delete with referencing report: ${assetDel.status}, lookup id after = ${lookup.reportAssetLookupIdAfterDelete}`;
  return { summary, raw: summary, line };
}
