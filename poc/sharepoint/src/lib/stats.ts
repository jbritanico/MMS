import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { CallRecord } from './graph.ts';

export function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return Math.round(s[i]);
}

export function callStats(calls: CallRecord[]) {
  const ms = calls.map((c) => c.ms);
  const byStatus: Record<string, number> = {};
  for (const c of calls) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  return {
    calls: calls.length,
    p50ms: pct(ms, 50),
    p95ms: pct(ms, 95),
    maxms: Math.round(Math.max(0, ...ms)),
    bytesIn: calls.reduce((a, c) => a + c.bytesIn, 0),
    byStatus,
    throttled: calls.filter((c) => c.status === 429 || c.status === 503).length,
  };
}

/** Merge one scenario's summary into results/results.json, and write its full raw log to results/raw/. */
export function saveScenario(id: string, summary: unknown, raw: unknown): void {
  mkdirSync('results/raw', { recursive: true });
  const file = 'results/results.json';
  const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { scenarios: {} };
  all.scenarios[id] = { when: new Date().toISOString(), ...(summary as object) };
  writeFileSync(file, JSON.stringify(all, null, 2));
  writeFileSync(`results/raw/${id}.json`, JSON.stringify(raw, null, 2));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
