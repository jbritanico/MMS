// S2: interrupted save (no transactions), then recovery: one report completed, one rolled back.
import { readFileSync } from 'node:fs';
import type { Ctx } from '../lib/site.ts';
import { makeReport, newReportKey } from '../lib/data.ts';
import { SimulatedFailure, saveItemByItem } from '../lib/save.ts';
import { completeReport, inventory, rollbackReport } from '../lib/recovery.ts';
import { assetItemId } from './common.ts';

function codeLines(file: string): number {
  return readFileSync(new URL(file, import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('//')).length;
}

export async function s2(ctx: Ctx) {
  const asset = await assetItemId(ctx, 'PoC-ASSET2');
  const cases: Record<string, any> = {};
  for (const mode of ['complete', 'rollback'] as const) {
    const set = makeReport(newReportKey(`S2${mode[0]}`), { assetItemId: asset });
    let failure = '';
    try {
      await saveItemByItem(ctx, set, undefined, 'checklist');
    } catch (e) {
      if (!(e instanceof SimulatedFailure)) throw e;
      failure = e.message;
    }
    const afterFailure = await inventory(ctx, set.key);
    const t0 = performance.now();
    const c0 = ctx.g.calls.length;
    let action: Record<string, unknown>;
    if (mode === 'complete') {
      const sent = await completeReport(ctx, set);
      const sentAgain = await completeReport(ctx, set); // idempotency check
      action = { rowsSent: sent, rowsSentOnSecondRun: sentAgain };
    } else {
      action = { rowsDeleted: await rollbackReport(ctx, set.key) };
    }
    const recoveryMs = Math.round(performance.now() - t0);
    const recoveryCalls = ctx.g.calls.length - c0;
    const afterRecovery = await inventory(ctx, set.key);
    const consistent =
      mode === 'complete' ? afterRecovery.complete : Object.values(afterRecovery.online).every((n) => n === 0);
    cases[mode] = { reportKey: set.key, failure, afterFailure, action, recoveryMs, recoveryCalls, afterRecovery, consistent };
  }
  const summary = {
    cases,
    recoveryCodeLines: codeLines('../lib/recovery.ts'),
    note: 'Report row is written first with a manifest of expected child counts; completeness = counts match.',
  };
  const a = cases.complete.afterFailure.online;
  const line = `after failure online: report ${a.MriReports}, headers ${a.ReportHeaderValues}, checklist ${a.ChecklistResults}, faults ${a.FaultApprovals}; complete-recovery consistent=${cases.complete.consistent} (2nd run sent ${cases.complete.action.rowsSentOnSecondRun}); rollback consistent=${cases.rollback.consistent}; recovery code ${summary.recoveryCodeLines} lines`;
  return { summary, raw: summary, line };
}
