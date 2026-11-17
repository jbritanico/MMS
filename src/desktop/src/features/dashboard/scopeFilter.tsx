import { useMemo, useSyncExternalStore } from "react";
import { useMriDashboardScope, type MriDashboardAsset } from "./hooks/useMriDashboards";

// Country and service line filter shared by every screen in the dashboard area (Overview,
// MR-I dashboards, User Analytics, Asset MR-I History). Picking a country on one screen keeps it
// on the others until it is reset. Kept for this session only.

export interface ScopeFilter { country: string; serviceLine: string }

let state: ScopeFilter = { country: "", serviceLine: "" };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

export function setScopeFilter(patch: Partial<ScopeFilter>) {
  const next = { ...state, ...patch };
  if (next.country === state.country && next.serviceLine === state.serviceLine) return;
  state = next;
  listeners.forEach((fn) => fn());
}
export const useScopeFilter = (): ScopeFilter => useSyncExternalStore(subscribe, () => state, () => state);

const same = (a: string | null | undefined, b: string) => !b || (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
export const inScope = (a: { country: string | null; service_line: string | null }, f: ScopeFilter) =>
  same(a.country, f.country) && same(a.service_line, f.serviceLine);

const uniq = (xs: (string | null)[]) =>
  [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** The filter bar for screens that have no MR-I filter bar of their own (Overview, Asset MR-I History). */
export function ScopeFilterBar({ shown, total, noun = "unit" }: { shown?: number; total?: number; noun?: string }) {
  const f = useScopeFilter();
  const { data } = useMriDashboardScope();
  const assets: MriDashboardAsset[] = useMemo(() => (data?.assets ?? []).filter((a) => a.active), [data]);
  // Each list only offers values that exist for the other choice already made.
  const countries = uniq(assets.filter((a) => same(a.service_line, f.serviceLine)).map((a) => a.country));
  const lines = uniq(assets.filter((a) => same(a.country, f.country)).map((a) => a.service_line));
  const active = !!(f.country || f.serviceLine);
  return (
    <div className="fl-scope" role="group" aria-label="Filter by country and service line">
      <span className="fl-scope-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></svg>
      </span>
      <label className="fl-scope-field">
        <span>Country</span>
        <select value={f.country} onChange={(e) => setScopeFilter({ country: e.target.value })}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="fl-scope-field">
        <span>Service line</span>
        <select value={f.serviceLine} onChange={(e) => setScopeFilter({ serviceLine: e.target.value })}>
          <option value="">All service lines</option>
          {lines.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {shown != null && total != null && (
        <span className="fl-scope-count"><b>{shown}</b> of {total} {noun}{total === 1 ? "" : "s"}</span>
      )}
      {active && <button type="button" className="fl-scope-reset" onClick={() => setScopeFilter({ country: "", serviceLine: "" })}>Reset filters</button>}
    </div>
  );
}

export const SCOPE_CSS = `
.fl-shell .fl-scope { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 10px 14px; border-radius: var(--fl-r-lg, 16px);
  background: var(--fl-card); border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1); }
.fl-shell .fl-scope-ico { width: 30px; height: 30px; flex: none; display: grid; place-items: center; border-radius: 50%; color: var(--fl-blue);
  background: color-mix(in srgb, var(--fl-blue) 10%, transparent); }
.fl-shell .fl-scope-ico svg { width: 16px; height: 16px; }
.fl-shell .fl-scope-field { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--text-soft); }
.fl-shell .fl-scope-field select { min-width: 150px; padding: 6px 28px 6px 10px; border-radius: 10px; font-size: 13px; }
.fl-shell .fl-scope-count { font-size: 12.5px; color: var(--text-soft); }
.fl-shell .fl-scope-count b { color: var(--text); }
.fl-shell .fl-scope-reset { all: unset; cursor: pointer; margin-left: auto; padding: 5px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600;
  color: var(--fl-blue); background: color-mix(in srgb, var(--fl-blue) 9%, transparent); border: 1px solid color-mix(in srgb, var(--fl-blue) 22%, transparent) !important; }
.fl-shell .fl-scope-reset:hover { background: color-mix(in srgb, var(--fl-blue) 16%, transparent); }
.fl-shell .fl-scope-reset:focus-visible { outline: 2px solid var(--fl-blue); outline-offset: 2px; }
@media (max-width: 560px) { .fl-shell .fl-scope-field { width: 100%; } .fl-shell .fl-scope-field select { flex: 1; min-width: 0; } }
`;
