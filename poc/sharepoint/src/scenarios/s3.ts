// S3: edit conflict. Device A and B read the same report, change different fields; A saves, then B saves with the old ETag.
import type { Ctx } from '../lib/site.ts';
import { makeReport, newReportKey } from '../lib/data.ts';

export async function s3(ctx: Ctx) {
  const { g } = ctx;
  const set = makeReport(newReportKey('S3'));
  const created = await g.request<{ id: string }>('POST', ctx.itemsUrl('MriReports'), { body: { fields: set.report } });
  const itemUrl = `${ctx.itemsUrl('MriReports')}/${created.id}`;
  const read = async () => {
    const it = await g.request<{ eTag: string; fields: any }>('GET', `${itemUrl}?$expand=fields($select=Status,ComplianceStage,RowVersionNote)`);
    return { eTag: it.eTag, Status: it.fields.Status, ComplianceStage: it.fields.ComplianceStage };
  };
  const patch = async (label: string, url: string, body: unknown, ifMatch?: string) => {
    const r = await g.raw('PATCH', url, { body, headers: ifMatch ? { 'If-Match': ifMatch } : {} });
    let err = '';
    if (!r.ok) {
      try { err = JSON.parse(r.text).error?.message ?? r.text; } catch { err = r.text; }
    }
    return { label, status: r.status, error: g.redact(String(err)).slice(0, 300), after: await read() };
  };

  const A = await read();
  const B = await read();
  const steps: any[] = [];
  steps.push({ label: 'initial (A and B both read)', etagA: A.eTag, etagB: B.eTag, ...A });
  // Variant 1: PATCH .../items/{id}/fields with If-Match
  steps.push(await patch('A saves Status=Approved (If-Match A etag, /fields)', `${itemUrl}/fields`, { Status: 'Approved' }, A.eTag));
  steps.push(await patch('B saves ComplianceStage=YARD with OLD etag (/fields)', `${itemUrl}/fields`, { ComplianceStage: 'YARD' }, B.eTag));
  // Variant 2: PATCH .../items/{id} with {fields} and If-Match
  steps.push(await patch('B saves ComplianceStage=YARD with OLD etag (/items/{id})', itemUrl, { fields: { ComplianceStage: 'YARD' } }, B.eTag));
  // Merge: B re-reads, re-applies only its own field on the fresh version.
  const fresh = await read();
  steps.push(await patch('B merge: re-read, re-apply ComplianceStage=YARD with fresh etag', `${itemUrl}/fields`, { ComplianceStage: 'YARD' }, fresh.eTag));
  // Last-writer-wins: no If-Match at all, and the same field as A.
  steps.push(await patch('B last-writer-wins: Status=Rejected, no If-Match', `${itemUrl}/fields`, { Status: 'Rejected' }));

  const rejected = steps.filter((s) => s.status === 412).map((s) => s.label);
  const summary = { reportKey: set.key, steps, staleWriteRejectedWith412: rejected.length > 0, rejectedSteps: rejected };
  const st = steps.slice(2, 4).map((s) => s.status).join('/');
  const line = `stale-ETag saves returned ${st}; merge save ${steps[4].status}; LWW (no If-Match) ${steps[5].status}; final Status=${steps[5].after.Status}, ComplianceStage=${steps[5].after.ComplianceStage}`;
  return { summary, raw: summary, line };
}
