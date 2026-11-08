// S6: 20 photos to PoC_ReportPhotos with ReportKey metadata, linked to checklist results, downloaded and verified.
// Also tries a direct list-item attachment through Graph.
import { createHash } from 'node:crypto';
import type { Ctx } from '../lib/site.ts';
import { makePhoto, makeReport, newReportKey } from '../lib/data.ts';
import { idsForReport, saveBatched, uploadPhoto } from '../lib/save.ts';
import { pct } from '../lib/stats.ts';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export async function s6(ctx: Ctx) {
  const { g } = ctx;
  const set = makeReport(newReportKey('S6'));
  await saveBatched(ctx, set);
  const results = (await idsForReport(ctx, 'ChecklistResults', set.key)).slice(0, 20);
  const photos: any[] = [];
  for (const [i, r] of results.entries()) {
    const bytes = makePhoto(`${set.key}-${i}`);
    const t0 = performance.now();
    const up = await uploadPhoto(ctx, set.key, r.fields.ItemName, bytes);
    const uploadMs = Math.round(performance.now() - t0);
    await g.request('PATCH', `${ctx.itemsUrl('ChecklistResults')}/${r.id}/fields`, {
      body: { PhotoRefs: JSON.stringify([{ driveItemId: up.driveItemId, name: up.name }]) },
    });
    photos.push({ itemName: r.fields.ItemName, bytes: bytes.length, sha: sha(bytes), uploadMs, driveItemId: up.driveItemId });
  }
  // Find by metadata (indexed ReportKey on the library).
  const lib = await g.getAll(`/sites/${ctx.siteId}/lists/${ctx.lists.ReportPhotos.id}/items?$filter=fields/ReportKey eq '${set.key}'&$expand=fields($select=ReportKey,ItemName)`);
  // Download and verify.
  let verified = 0;
  const dl: number[] = [];
  for (const p of photos) {
    const t0 = performance.now();
    const r = await g.raw('GET', `/drives/${ctx.lists.ReportPhotos.driveId}/items/${p.driveItemId}/content`, { binary: true });
    dl.push(Math.round(performance.now() - t0));
    if (r.ok && r.buf && sha(r.buf) === p.sha) verified++;
  }
  // Direct list-item attachment through Graph (v1.0 then beta).
  const target = `${ctx.itemsUrl('ChecklistResults')}/${results[0].id}/attachments`;
  const attempts: any[] = [];
  for (const api of ['v1.0', 'beta'] as const) {
    const r = await g.raw('POST', target, { api, rawBody: makePhoto('attach'), headers: { 'Content-Type': 'image/jpeg' } });
    let err = '';
    try { err = JSON.parse(r.text).error?.message ?? ''; } catch { err = r.text.slice(0, 200); }
    attempts.push({ api, status: r.status, error: g.redact(err).slice(0, 300) });
  }
  const up = photos.map((p) => p.uploadMs);
  const summary = {
    reportKey: set.key,
    photos: photos.length,
    avgBytes: Math.round(photos.reduce((a, p) => a + p.bytes, 0) / photos.length),
    uploadMsPerPhoto: { p50: pct(up, 50), p95: pct(up, 95), max: Math.max(...up), note: 'PUT content + PATCH metadata (2 calls)' },
    downloadMsPerPhoto: { p50: pct(dl, 50), p95: pct(dl, 95) },
    foundByReportKeyMetadata: lib.items.length,
    downloadedAndHashVerified: verified,
    listItemAttachmentAttempts: attempts,
    listItemAttachmentsWorkThroughGraph: attempts.some((a) => a.status < 300),
  };
  const line = `${photos.length} photos, upload p50 ${summary.uploadMsPerPhoto.p50} ms / p95 ${summary.uploadMsPerPhoto.p95} ms; found by metadata ${lib.items.length}; hash-verified ${verified}/${photos.length}; list-item attachment via Graph: ${attempts.map((a) => `${a.api} ${a.status}`).join(', ')}`;
  return { summary, raw: { ...summary, photoDetail: photos }, line };
}
