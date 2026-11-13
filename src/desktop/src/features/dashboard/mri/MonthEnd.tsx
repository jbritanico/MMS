import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { SEVERITIES, type MriDashboardAsset } from "../hooks/useMriDashboards";
import { AX, TT } from "./kit";

// Shared by Dashboards 2 and 3: a month-end trend line by severity, with the Jan-Dec style table
// the dashboard deck asks for (counts at the end of each month), and a "group by" breakdown table.

type Sev = "Critical" | "Moderate" | "Minor";
export interface MonthEndPoint { name: string; t: number; Critical: number; Moderate: number; Minor: number }

export function MonthEndTrend({ title, note, points, picked, onPick }: {
  title: string; note: string; points: MonthEndPoint[]; picked: string | null; onPick: (p: MonthEndPoint) => void;
}) {
  if (points.length === 0) return null;
  const total = (p: MonthEndPoint) => p.Critical + p.Moderate + p.Minor;
  return (
    <div className="mrid-panel">
      <div className="mrid-panel-head"><h3>{title}</h3></div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <AreaChart data={points} margin={{ top: 10, right: 20, bottom: 4, left: 0 }} style={{ cursor: "pointer" }}
            onClick={(st) => { const i = Number(st?.activeIndex); const p = Number.isFinite(i) ? points[i] : undefined; if (p) onPick(p); }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={AX} />
            <YAxis allowDecimals={false} tick={AX} width={32} />
            <Tooltip contentStyle={TT} />
            <defs>
              {SEVERITIES.map((s) => (
                <linearGradient key={s.key} id={`me-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {SEVERITIES.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.key === "Critical" ? "Major / Critical" : s.key} stroke={s.color} strokeWidth={2.2}
                fill={`url(#me-${s.key})`} dot={{ r: 2.5, strokeWidth: 0, fill: s.color }} activeDot={{ r: 5 }} animationDuration={800} animationEasing="ease-out" />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mrid-legend">{SEVERITIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.key === "Critical" ? "Major / Critical" : s.key}</span>)}</div>
      <div className="mrid-table-wrap" style={{ marginTop: 8 }}>
        <table className="mrid-table mrid-monthtable">
          <thead>
            <tr><th>Severity</th>{points.map((p) => <th key={p.name} className={picked === p.name ? "is-on" : undefined}>{p.name}</th>)}</tr>
          </thead>
          <tbody>
            {SEVERITIES.map((s) => (
              <tr key={s.key}>
                <td><span className="mrid-sev"><i className="mrid-dot" style={{ background: s.color }} />{s.key === "Critical" ? "Major / Critical" : s.key}</span></td>
                {points.map((p) => (
                  <td key={p.name} className={`mrid-click-cell${picked === p.name ? " is-on" : ""}`} onClick={() => onPick(p)}>{p[s.key as Sev]}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td><b>Total</b></td>
              {points.map((p) => <td key={p.name} className={`mrid-click-cell${picked === p.name ? " is-on" : ""}`} onClick={() => onPick(p)}><b>{total(p)}</b></td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mrid-note" style={{ textAlign: "center" }}>{note} Click a month (on the chart or in the table) to see the faults as they stood at its end.</p>
    </div>
  );
}

export type GroupBy = "asset_type" | "service_line" | "country";
export const GROUP_LABEL: Record<GroupBy, string> = { asset_type: "Equipment type", service_line: "Service line", country: "Country" };
export const groupOf = (a: MriDashboardAsset | undefined, g: GroupBy) => ((a?.[g] as string | null | undefined) ?? "").trim() || "Not set";

export interface BreakdownRow { key: string; label: string; sub?: string; Critical: number; Moderate: number; Minor: number }

/** Rows with a count per severity; click a row to drill into it. */
export function BreakdownTable({ rows, picked, onPick, firstCol, hint }: {
  rows: BreakdownRow[]; picked: string | null; onPick: (key: string) => void; firstCol: string; hint: string;
}) {
  const sorted = [...rows].sort((a, b) => b.Critical - a.Critical || b.Critical + b.Moderate + b.Minor - (a.Critical + a.Moderate + a.Minor) || a.label.localeCompare(b.label));
  if (sorted.length === 0) return <p className="mrid-note">Nothing to show.</p>;
  return (
    <div className="mrid-table-wrap">
      <table className="mrid-table">
        <thead><tr><th>{firstCol}</th>{SEVERITIES.map((s) => <th key={s.key}>{s.key === "Critical" ? "Major / Critical" : s.key}</th>)}<th>Total</th><th style={{ width: "36%" }}>Share</th></tr></thead>
        <tbody>
          {sorted.map((r) => {
            const tot = r.Critical + r.Moderate + r.Minor;
            const max = Math.max(...sorted.map((x) => x.Critical + x.Moderate + x.Minor), 1);
            return (
              <tr key={r.key} className="mrid-click" onClick={() => onPick(r.key)} style={picked === r.key ? { outline: "2px solid var(--accent)" } : undefined}>
                <td><b>{r.label}</b>{r.sub ? <div className="mrid-soft">{r.sub}</div> : null}</td>
                {SEVERITIES.map((s) => <td key={s.key} className={s.key === "Critical" && r.Critical ? "mrid-over" : undefined}>{r[s.key as Sev]}</td>)}
                <td><b>{tot}</b></td>
                <td>
                  <div className="mrid-sharebar" style={{ width: `${(tot / max) * 100}%` }}>
                    {SEVERITIES.map((s) => r[s.key as Sev] ? <i key={s.key} style={{ flex: r[s.key as Sev], background: s.color }} /> : null)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mrid-note">{hint}</p>
    </div>
  );
}
