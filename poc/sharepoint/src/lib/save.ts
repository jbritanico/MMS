// Ways of sending one MR-I report to SharePoint.
import type { Ctx } from './site.ts';
import type { ReportSet } from './data.ts';

export class SimulatedFailure extends Error {}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60);

export async function uploadPhoto(ctx: Ctx, reportKey: string, itemName: string, bytes: Uint8Array) {
  const drive = ctx.lists.ReportPhotos.driveId!;
  const name = `${safe(reportKey)}_${safe(itemName)}_${Date.now()}.jpg`;
  const item = await ctx.g.request<{ id: string; webUrl: string; size: number }>(
    'PUT',
    `/drives/${drive}/root:/${name}:/content`,
    { rawBody: bytes, headers: { 'Content-Type': 'image/jpeg' } },
  );
  await ctx.g.request('PATCH', `/drives/${drive}/items/${item.id}/listItem/fields`, {
    body: { ReportKey: reportKey, ItemName: itemName },
  });
  return { driveItemId: item.id, name, webUrl: item.webUrl, size: item.size };
}

/** One HTTP call per list item. `failAfter` throws after that stage to simulate a dropped connection. */
export async function saveItemByItem(
  ctx: Ctx,
  set: ReportSet,
  photo?: Uint8Array,
  failAfter?: 'checklist',
): Promise<{ reportItemId: string }> {
  const { g } = ctx;
  const rep = await g.request<{ id: string }>('POST', ctx.itemsUrl('MriReports'), { body: { fields: set.report } });
  for (const h of set.headers) await g.request('POST', ctx.itemsUrl('ReportHeaderValues'), { body: { fields: h } });
  for (const c of set.checklist) await g.request('POST', ctx.itemsUrl('ChecklistResults'), { body: { fields: c } });
  if (failAfter === 'checklist') throw new SimulatedFailure('Simulated network loss after checklist results, before faults');
  for (const f of set.faults) await g.request('POST', ctx.itemsUrl('FaultApprovals'), { body: { fields: f } });
  if (photo) await uploadPhoto(ctx, set.key, String(set.faults[0]?.ItemName ?? 'General'), photo);
  return { reportItemId: rep.id };
}

/** All list items through Graph $batch, 20 per batch; the photo still needs its own upload + metadata call. */
export async function saveBatched(ctx: Ctx, set: ReportSet, photo?: Uint8Array, maxRetries = 3): Promise<{ reportItemId: string; failed: number }> {
  const reqs = [
    { method: 'POST', url: ctx.itemsUrl('MriReports'), body: { fields: set.report } },
    ...set.headers.map((h) => ({ method: 'POST', url: ctx.itemsUrl('ReportHeaderValues'), body: { fields: h } })),
    ...set.checklist.map((c) => ({ method: 'POST', url: ctx.itemsUrl('ChecklistResults'), body: { fields: c } })),
    ...set.faults.map((f) => ({ method: 'POST', url: ctx.itemsUrl('FaultApprovals'), body: { fields: f } })),
  ];
  let reportItemId = '';
  let failed = 0;
  for (let i = 0; i < reqs.length; i += 20) {
    const res = await ctx.g.batch(reqs.slice(i, i + 20), maxRetries);
    res.forEach((r, j) => {
      if (r.status >= 300) failed++;
      if (i + j === 0) reportItemId = r.body?.id;
    });
  }
  if (photo) await uploadPhoto(ctx, set.key, String(set.faults[0]?.ItemName ?? 'General'), photo);
  return { reportItemId, failed };
}

/** Insert many items into one list via $batch. Returns the number of failed sub-requests. */
export async function bulkInsert(ctx: Ctx, list: string, rows: Record<string, unknown>[], onProgress?: (done: number) => void) {
  let failed = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += 20) {
    const res = await ctx.g.batch(rows.slice(i, i + 20).map((f) => ({ method: 'POST', url: ctx.itemsUrl(list), body: { fields: f } })));
    for (const r of res) if (r.status >= 300) {
      failed++;
      if (errors.length < 5) errors.push(`${r.status} ${JSON.stringify(r.body?.error?.message ?? r.body).slice(0, 200)}`);
    }
    onProgress?.(Math.min(i + 20, rows.length));
  }
  return { failed, errors };
}

/** Find all item ids in a list for one ReportKey (indexed filter). */
export async function idsForReport(ctx: Ctx, list: string, key: string): Promise<{ id: string; fields: any }[]> {
  const { items } = await ctx.g.getAll<{ id: string; fields: any }>(
    `${ctx.itemsUrl(list)}?$filter=fields/ReportKey eq '${key}'&$expand=fields&$top=500`,
  );
  return items;
}

export async function bulkDelete(ctx: Ctx, list: string, ids: string[]) {
  let failed = 0;
  for (let i = 0; i < ids.length; i += 20) {
    const res = await ctx.g.batch(ids.slice(i, i + 20).map((id) => ({ method: 'DELETE', url: `${ctx.itemsUrl(list)}/${id}` })));
    failed += res.filter((r) => r.status >= 300 && r.status !== 404).length;
  }
  return failed;
}
