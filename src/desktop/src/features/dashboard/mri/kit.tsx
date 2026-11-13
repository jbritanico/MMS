import { useMemo, type ReactNode } from "react";
import { periodRange, useMriDashboardMore, type DashboardFilters, type MriDashboardAsset, type MriDashboardMore } from "../hooks/useMriDashboards";

// Shared pieces for Dashboards 6-13.

export const DAY = 86400;
export const nowSecs = () => Math.floor(Date.now() / 1000);
const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The extra dashboard data, limited to the units on screen (after the filters). */
export function useMore(assets: MriDashboardAsset[]) {
  const { data, isLoading, error } = useMriDashboardMore();
  const ids = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  const scoped: MriDashboardMore = useMemo(() => {
    const keep = <T extends { asset_id: number }>(l: T[] | undefined) => (l ?? []).filter((x) => ids.has(x.asset_id));
    return {
      reports: keep(data?.reports),
      decisions: keep(data?.decisions),
      repairs: keep(data?.repairs),
      tag_changes: keep(data?.tag_changes),
      exemptions: keep(data?.exemptions),
      triggers: keep(data?.triggers),
    };
  }, [data, ids]);
  const unitOf = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  return { ...scoped, unitOf, isLoading, error };
}

/** Period start / end in Unix seconds; the end never goes past now. */
export function period(filters: DashboardFilters) {
  const r = periodRange(filters);
  const s = Math.floor(r.from.getTime() / 1000);
  const eFull = Math.floor(r.to.getTime() / 1000);
  const e = Math.min(eFull, nowSecs() + 1);
  return { ...r, s, e, isCurrent: eFull > nowSecs() };
}
export const inRange = (t: number | null | undefined, s: number, e: number) => t != null && t >= s && t < e;

/** Months covering the period (for a week or a month: the 12 months up to it). */
export function monthsFor(from: Date, to: Date) {
  const endD = new Date(Math.min(to.getTime(), Date.now()) - 1);
  let startD = new Date(from.getFullYear(), from.getMonth(), 1);
  const span = (endD.getFullYear() - startD.getFullYear()) * 12 + endD.getMonth() - startD.getMonth();
  if (span < 2) startD = new Date(endD.getFullYear(), endD.getMonth() - 11, 1);
  const out: { name: string; s: number; e: number }[] = [];
  for (let d = startD; d <= endD; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push({
      name: `${M[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      s: Math.floor(d.getTime() / 1000),
      e: Math.min(Math.floor(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() / 1000), nowSecs() + 1),
    });
  }
  return out;
}
/** Drop the leading entries that have no data. */
export const trimLeading = <T,>(rows: T[], has: (r: T) => boolean) => {
  const i = rows.findIndex(has);
  return i < 0 ? [] : rows.slice(i);
};

/** A duration in seconds, in plain words: "5 h", "2.5 days". */
export function fmtDur(secs: number | null | undefined) {
  if (secs == null || !Number.isFinite(secs)) return "—";
  if (secs < DAY) return `${Math.max(0, Math.round(secs / 3600))} h`;
  const d = secs / DAY;
  return `${d < 10 ? Math.round(d * 10) / 10 : Math.round(d)} days`;
}
export const toDays = (secs: number | null | undefined) => (secs == null ? null : Math.round((secs / DAY) * 10) / 10);
export const avg = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
export const median = (l: number[]) => {
  if (!l.length) return null;
  const s = [...l].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function Tile<K extends string>({ k, pick, setPick, label, value, sub, color, hint, extra }: {
  k: K; pick: K | null; setPick: (fn: (v: K | null) => K | null) => void; label: ReactNode; value: ReactNode; sub: ReactNode; color: string; hint?: string;
  /** Optional trend delta / sparkline shown under the value. */
  extra?: ReactNode;
}) {
  const on = pick === k;
  return (
    <button type="button" className={`mrid-kpi${on ? " is-on" : ""}`} style={{ ["--kpi" as string]: color }} onClick={() => setPick((v) => (v === k ? null : k))}>
      <div className="mrid-kpi-head"><span>{label}</span></div>
      <div className="mrid-kpi-value">{value}</div>
      {extra}
      <div className="mrid-kpi-sub">{sub}</div>
      <div className="mrid-kpi-hint">{on ? "Showing these ↓" : hint ?? "Click to list"}</div>
    </button>
  );
}

export function DrillChips({ chips, onClear }: { chips: (ReactNode | null | false)[]; onClear: () => void }) {
  const shown = chips.filter(Boolean);
  if (!shown.length) return null;
  return (
    <div className="mrid-drill">
      {shown.map((c, i) => <span key={i} className="mrid-chip">{c}</span>)}
      <button type="button" className="ghost mrid-clear" onClick={onClear}>✕ Clear selection</button>
    </div>
  );
}

export const TT = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
export const AX = { fill: "var(--text-soft)", fontSize: 11 };

export function Loading({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) return <div className="empty">Loading...</div>;
  if (error) return <div className="empty">Could not load the data: {String(error)}</div>;
  return null;
}
