// Recovery for half-saved reports (SharePoint has no multi-item transactions).
// Pattern: the report row is written first with a manifest (expected child counts) in RowVersionNote.
// A report is complete when every child list holds the expected count for its ReportKey.
// Recovery either completes it (idempotent re-send keyed on ReportKey + ItemName/FieldLabel)
// or rolls it back (delete every row carrying the ReportKey, children first, report last).
import type { Ctx } from './site.ts';
import type { ReportSet } from './data.ts';
import { bulkDelete, bulkInsert, idsForReport } from './save.ts';

const CHILDREN = [
  { list: 'ReportHeaderValues', part: 'headers', key: 'FieldLabel', manifest: 'headers' },
  { list: 'ChecklistResults', part: 'checklist', key: 'ItemName', manifest: 'checklist' },
  { list: 'FaultApprovals', part: 'faults', key: 'ItemName', manifest: 'faults' },
] as const;

export interface Inventory {
  reportKey: string;
  reportItemId?: string;
  expected?: Record<string, number>;
  online: Record<string, number>;
  complete: boolean;
}

export async function inventory(ctx: Ctx, key: string): Promise<Inventory> {
  const reports = await idsForReport(ctx, 'MriReports', key);
  const online: Record<string, number> = { MriReports: reports.length };
  for (const c of CHILDREN) online[c.list] = (await idsForReport(ctx, c.list, key)).length;
  let expected: Record<string, number> | undefined;
  try {
    expected = JSON.parse(reports[0]?.fields?.RowVersionNote ?? '{}').manifest;
  } catch {}
  const complete =
    reports.length === 1 && !!expected && CHILDREN.every((c) => online[c.list] === expected![c.manifest]);
  return { reportKey: key, reportItemId: reports[0]?.id, expected, online, complete };
}

/** Re-send only the rows that are missing (match on ReportKey + natural key). Safe to run twice. */
export async function completeReport(ctx: Ctx, set: ReportSet): Promise<number> {
  let sent = 0;
  if (!(await idsForReport(ctx, 'MriReports', set.key)).length) {
    await bulkInsert(ctx, 'MriReports', [set.report]);
    sent++;
  }
  for (const c of CHILDREN) {
    const have = new Set((await idsForReport(ctx, c.list, set.key)).map((r) => r.fields[c.key]));
    const missing = (set[c.part] as Record<string, unknown>[]).filter((row) => !have.has(row[c.key]));
    if (missing.length) await bulkInsert(ctx, c.list, missing);
    sent += missing.length;
  }
  return sent;
}

/** Delete every row for the ReportKey: children first, report last. */
export async function rollbackReport(ctx: Ctx, key: string): Promise<number> {
  let deleted = 0;
  for (const c of CHILDREN) {
    const ids = (await idsForReport(ctx, c.list, key)).map((r) => r.id);
    await bulkDelete(ctx, c.list, ids);
    deleted += ids.length;
  }
  const rep = (await idsForReport(ctx, 'MriReports', key)).map((r) => r.id);
  await bulkDelete(ctx, 'MriReports', rep);
  return deleted + rep.length;
}
