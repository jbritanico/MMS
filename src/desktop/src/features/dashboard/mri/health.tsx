import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { MriDashboardAsset, MriDashTagChange } from "../hooks/useMriDashboards";
import { AX, TT } from "./kit";

// Fleet health over time from the tag history: how many units were Green, Yellow, Red or not
// tagged at each point. Used by "Fleet status by tag colour" and "Time spent Red or Yellow".

export type HTag = "Green" | "Yellow" | "Red" | "None";
export const HEALTH: { key: HTag; label: string; color: string }[] = [
  { key: "Green", label: "Green", color: "var(--success)" },
  { key: "Yellow", label: "Yellow", color: "var(--tag-yellow, #d4a017)" },
  { key: "Red", label: "Red", color: "var(--danger)" },
  { key: "None", label: "Not tagged", color: "var(--text-soft)" },
];
const norm = (t: string | null | undefined): HTag => (t === "Red" || t === "Yellow" || t === "Green" ? t : "None");

/** Tag of a unit at time t. Before its first recorded change, the tag that change came from. */
export function tagAt(asset: MriDashboardAsset, sorted: MriDashTagChange[], t: number): HTag {
  let last: MriDashTagChange | null = null;
  for (const c of sorted) {
    if (c.changed_at != null && c.changed_at <= t) last = c;
    else break;
  }
  if (last) return norm(last.tag_status);
  return sorted.length ? norm(sorted[0].previous_tag_status) : norm(asset.tag_status);
}

export type HealthPoint = { name: string; t: number } & Record<HTag, number>;

export function useHealthSeries(assets: MriDashboardAsset[], changes: MriDashTagChange[], points: { name: string; t: number }[]): HealthPoint[] {
  return useMemo(() => {
    const by = new Map<number, MriDashTagChange[]>();
    changes.filter((c) => c.changed_at != null).forEach((c) => by.set(c.asset_id, [...(by.get(c.asset_id) ?? []), c]));
    by.forEach((l) => l.sort((a, b) => a.changed_at! - b.changed_at!));
    const active = assets.filter((a) => a.active);
    return points.map((p) => {
      const c: Record<HTag, number> = { Green: 0, Yellow: 0, Red: 0, None: 0 };
      active.forEach((a) => c[tagAt(a, by.get(a.id) ?? [], p.t)]++);
      return { ...p, ...c };
    });
  }, [assets, changes, points]);
}

/** Layered health stream: the share of the fleet in each tag colour, flowing over time. */
export function HealthStream({ title, data, note, onPick }: { title: string; data: HealthPoint[]; note: string; onPick?: (p: HealthPoint) => void }) {
  if (data.length < 2) return null;
  const used = HEALTH.filter((h) => h.key !== "None" || data.some((d) => d.None > 0));
  return (
    <div className="mrid-panel">
      <div className="mrid-panel-head"><h3>{title}</h3></div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <AreaChart data={data} stackOffset="expand" margin={{ top: 6, right: 16, bottom: 4, left: 0 }} style={onPick ? { cursor: "pointer" } : undefined}
            onClick={(st) => { const i = Number(st?.activeIndex); const p = Number.isFinite(i) ? data[i] : undefined; if (p && onPick) onPick(p); }}>
            <defs>
              {used.map((h) => (
                <linearGradient key={h.key} id={`hs-${h.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={h.color} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={h.color} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <XAxis dataKey="name" tick={AX} interval="preserveStartEnd" minTickGap={12} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={AX} width={40} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TT} formatter={(v, n) => [`${v} unit${v === 1 ? "" : "s"}`, n]} />
            {[...used].reverse().map((h) => (
              <Area key={h.key} type="monotone" dataKey={h.key} name={h.label} stackId="h" stroke={h.color} strokeWidth={1} fill={`url(#hs-${h.key})`} animationDuration={900} animationEasing="ease-out" />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mrid-legend">{used.map((h) => <span key={h.key}><i style={{ background: h.color }} />{h.label}</span>)}</div>
      <p className="mrid-note" style={{ textAlign: "center" }}>{note}</p>
    </div>
  );
}
