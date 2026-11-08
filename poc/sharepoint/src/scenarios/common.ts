import type { Ctx } from '../lib/site.ts';

export async function assetItemId(ctx: Ctx, code: string): Promise<string> {
  const r = await ctx.g.request<{ value: { id: string }[] }>(
    'GET',
    `${ctx.itemsUrl('Assets')}?$filter=fields/AssetCode eq '${code}'&$select=id`,
  );
  if (!r.value.length) throw new Error(`asset ${code} not found - run setup`);
  return r.value[0].id;
}

/** Runs a GET and records status / time / items / pages / error without throwing. */
export async function probe(ctx: Ctx, label: string, path: string, headers?: Record<string, string>) {
  const c0 = ctx.g.calls.length;
  const t0 = performance.now();
  try {
    const { items, pages } = await ctx.g.getAll(path, headers);
    return { label, ok: true, ms: Math.round(performance.now() - t0), items: items.length, pages, calls: ctx.g.calls.length - c0, data: items };
  } catch (e: any) {
    return {
      label,
      ok: false,
      ms: Math.round(performance.now() - t0),
      status: e?.status,
      error: String(e?.message ?? e).slice(0, 400),
      calls: ctx.g.calls.length - c0,
      data: [] as any[],
    };
  }
}

export const NONINDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' };
