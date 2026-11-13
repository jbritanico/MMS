import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  buckets,
  firstFoundMap,
  fmtDate,
  openAt,
  periodRange,
  sevKey,
  SEVERITIES,
  useMriDashboardFaults,
  type DashboardFilters,
  type MriDashboardAsset,
  type MriDashboardFault,
} from "../hooks/useMriDashboards";
import ExportMenu, { type ExportRow } from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { monthsFor } from "./kit";
import { Sparkline, StoryStrip, TrendDelta, type StoryLine } from "./fluid";
import { BreakdownTable, GROUP_LABEL, groupOf, MonthEndTrend, type BreakdownRow, type GroupBy, type MonthEndPoint } from "./MonthEnd";

// Dashboard 2: Open defects by severity.
// A fault is "open" from the moment its report is submitted until it is closed (repair verified,
// rejected, closed on the report, passed on the next inspection...). A fault carried forward to a
// later report is counted once: on the latest report that holds it.

type Sev = "Critical" | "Moderate" | "Minor";
const zero = (): Record<Sev, number> => ({ Critical: 0, Moderate: 0, Minor: 0 });
const nowSecs = () => Math.floor(Date.now() / 1000);

function useScopedFaults(assets: MriDashboardAsset[]) {
  const { data = [], isLoading, error } = useMriDashboardFaults();
  const ids = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  const faults = useMemo(() => data.filter((f) => ids.has(f.asset_id)), [data, ids]);
  return { faults, isLoading, error };
}

/** Small summary for the dashboard card: faults open now. */
export function OpenDefectsMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { faults } = useScopedFaults(assets);
  const t = nowSecs() + 1;
  const c = zero();
  faults.forEach((f) => openAt(f, t) && c[sevKey(f.severity)]++);
  return (
    <div className="mrid-mini">
      {SEVERITIES.map((s) => (
        <span key={s.key} className="mrid-mini-item" title={`${s.key}: ${s.plain}`}>
          <i className="mrid-dot" style={{ background: s.color }} /> {s.key} <b>{c[s.key]}</b>
        </span>
      ))}
    </div>
  );
}

export default function OpenDefects({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const { faults, isLoading, error } = useScopedFaults(assets);
  const range = periodRange(filters);
  const start = Math.floor(range.from.getTime() / 1000);
  const endFull = Math.floor(range.to.getTime() / 1000);
  const end = Math.min(endFull, nowSecs() + 1); // never count into the future
  const isCurrent = endFull > nowSecs();
  const codeOf = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  // Drill-down: a severity tile and/or a bar (a day, week or month) narrows the table below.
  const [sevPick, setSevPick] = useState<Sev | null>(null);
  const [barPick, setBarPick] = useState<{ name: string; t: number } | null>(null);
  // Severity -> Equipment -> Unit drill-down (the group can also be service line or country).
  const [groupBy, setGroupBy] = useState<GroupBy>("asset_type");
  const [groupPick, setGroupPick] = useState<string | null>(null);
  const [unitPick, setUnitPick] = useState<number | null>(null);

  const atStart = zero();
  const atEnd = zero();
  const found = zero();
  for (const f of faults) {
    const k = sevKey(f.severity);
    if (openAt(f, start)) atStart[k]++;
    if (openAt(f, end)) atEnd[k]++;
    // "Found" counts new faults only: a fault carried in from an earlier report is not new.
    if (f.found_at != null && f.found_at >= start && f.found_at < end && !isCarriedIn(f, faults)) found[k]++;
  }

  const trend = useMemo(
    () =>
      buckets(range.from, range.to)
        .filter((b) => b.start.getTime() / 1000 < end)
        .map((b) => {
          const t = Math.min(Math.floor(b.end.getTime() / 1000), end);
          const c = zero();
          faults.forEach((f) => openAt(f, t) && c[sevKey(f.severity)]++);
          return { name: b.label, t, ...c };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [faults, range.from.getTime(), range.to.getTime(), end],
  );

  // Month-end counts (deck: "count of each severity at the end of the month").
  const monthEnd: MonthEndPoint[] = useMemo(
    () =>
      monthsFor(range.from, range.to).map((m) => {
        const t = Math.min(m.e, nowSecs() + 1);
        const c = zero();
        faults.forEach((f) => openAt(f, t) && c[sevKey(f.severity)]++);
        return { name: m.name, t, ...c };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [faults, range.from.getTime(), range.to.getTime()],
  );

  const asAt = barPick?.t ?? end;
  const openAtSev = faults.filter((f) => openAt(f, asAt) && (sevPick == null || sevKey(f.severity) === sevPick));
  const grp = (f: MriDashboardFault) => groupOf(codeOf.get(f.asset_id), groupBy);
  const tally = (l: MriDashboardFault[]) => { const c = zero(); l.forEach((f) => c[sevKey(f.severity)]++); return c; };
  const groupRows: BreakdownRow[] = [...new Set(openAtSev.map(grp))].map((g) => ({ key: g, label: g, ...tally(openAtSev.filter((f) => grp(f) === g)) }));
  const inGroup = groupPick == null ? [] : openAtSev.filter((f) => grp(f) === groupPick);
  const unitRows: BreakdownRow[] = [...new Set(inGroup.map((f) => f.asset_id))].map((id) => {
    const a = codeOf.get(id);
    return { key: String(id), label: a?.asset_code ?? String(id), sub: [a?.asset_description, a?.country].filter(Boolean).join(" · "), ...tally(inGroup.filter((f) => f.asset_id === id)) };
  });
  const openList = openAtSev
    .filter((f) => (groupPick == null || grp(f) === groupPick) && (unitPick == null || f.asset_id === unitPick))
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || (a.found_at ?? 0) - (b.found_at ?? 0));

  const byStage = new Map<string, number>();
  openList.forEach((f) => {
    const s = f.state === "Open" ? f.stage : f.state === "Closed" ? "Closed since" : "Carried forward since";
    byStage.set(s, (byStage.get(s) ?? 0) + 1);
  });

  const total = (r: Record<Sev, number>) => r.Critical + r.Moderate + r.Minor;
  // Days open counts from when the fault was FIRST found, even if it was carried to later reports.
  const firstFound = firstFoundMap(faults);
  const sinceOf = (f: MriDashboardFault) => firstFound.get(f.result_id) ?? f.found_at;
  const daysOpen = (f: MriDashboardFault) => { const s = sinceOf(f); return s == null ? null : Math.max(0, Math.floor((asAt - s) / 86400)); };

  // ---- fluid layer: month-end series for the KPI sparklines, and the insight strip ----
  const series = (k: Sev) => monthEnd.map((m) => m[k]);
  const prevMonth = monthEnd.length >= 2 ? monthEnd[monthEnd.length - 2] : null;
  const story: StoryLine[] = [];
  {
    const openNow = faults.filter((f) => openAt(f, end));
    const crit = openNow.filter((f) => sevKey(f.severity) === "Critical");
    if (crit.length) {
      const byUnit = new Map<number, number>();
      crit.forEach((f) => byUnit.set(f.asset_id, (byUnit.get(f.asset_id) ?? 0) + 1));
      const ranked = [...byUnit.entries()].sort((a, b) => b[1] - a[1]);
      const names = ranked.slice(0, 3).map(([id]) => codeOf.get(id)?.asset_code ?? String(id));
      const where = ranked[0][1] > 1 && (ranked.length === 1 || ranked[0][1] > ranked[1][1])
        ? <>Most on <b>{names[0]}</b> ({ranked[0][1]}).</>
        : <>On <b>{names.join(", ")}</b>{ranked.length > 3 ? ` and ${ranked.length - 3} more` : ""}.</>;
      story.push({ tone: "attention", text: <><b>{crit.length} Major / Critical</b> fault{crit.length === 1 ? " is" : "s are"} open, so {byUnit.size === 1 ? "that unit is" : "those units are"} not safe to use. {where}</> });
    }
    if (prevMonth) {
      const changes = SEVERITIES.map((s) => ({ k: s.key as Sev, from: prevMonth[s.key], to: atEnd[s.key] }));
      const up = changes.filter((c) => c.to > c.from).sort((a, b) => b.to - b.from - (a.to - a.from))[0];
      const down = changes.filter((c) => c.to < c.from).sort((a, b) => a.to - a.from - (b.to - b.from))[0];
      if (up) story.push({ tone: "worse", text: <><b>{up.k === "Critical" ? "Major / Critical" : up.k}</b> faults rose from {up.from} to <b>{up.to}</b> since the end of {prevMonth.name}.</> });
      if (down) story.push({ tone: "better", text: <><b>{down.k === "Critical" ? "Major / Critical" : down.k}</b> faults fell from {down.from} to <b>{down.to}</b> since the end of {prevMonth.name}.</> });
    }
    if (openNow.length) {
      const byGroup = new Map<string, number>();
      openNow.forEach((f) => { const g = groupOf(codeOf.get(f.asset_id), "asset_type"); byGroup.set(g, (byGroup.get(g) ?? 0) + 1); });
      const [g, n] = [...byGroup.entries()].sort((a, b) => b[1] - a[1])[0];
      const oldest = [...openNow].sort((a, b) => (sinceOf(a) ?? 0) - (sinceOf(b) ?? 0))[0];
      const age = sinceOf(oldest) != null ? Math.floor((end - sinceOf(oldest)!) / 86400) : null;
      story.push({ tone: "info", text: <><b>{g}</b> has the most open faults ({n} of {openNow.length}).{age != null ? <> Oldest: <b>{oldest.item ?? "a fault"}</b> on {codeOf.get(oldest.asset_id)?.asset_code}, open {age} days.</> : null}</> });
    }
  }

  const row = (f: MriDashboardFault): ExportRow => ({
    Severity: sevKey(f.severity),
    Unit: codeOf.get(f.asset_id)?.asset_code ?? String(f.asset_id),
    Component: f.component,
    Item: f.item,
    Issue: f.issue_details,
    Report: `#${f.report_id}`,
    "First found": fmtDate(sinceOf(f)),
    "Days open": daysOpen(f),
    "Status now": f.state === "Open" ? f.stage : `${f.state}: ${f.stage}`,
    Country: codeOf.get(f.asset_id)?.country ?? null,
  });
  const exportTables = () => [
    {
      name: "Summary",
      rows: SEVERITIES.map((s) => ({
        Severity: s.key,
        Meaning: s.plain,
        "Open at start of period": atStart[s.key],
        [isCurrent ? "Open now" : "Open at end of period"]: atEnd[s.key],
        "New faults found in period": found[s.key],
      })),
    },
    { name: "Trend", rows: trend.map((t) => ({ "Period end": t.name, Critical: t.Critical, Moderate: t.Moderate, Minor: t.Minor, Total: t.Critical + t.Moderate + t.Minor })) },
    { name: "Month-end trend", rows: monthEnd.map((m) => ({ Month: m.name, "Major / Critical": m.Critical, Moderate: m.Moderate, Minor: m.Minor, Total: m.Critical + m.Moderate + m.Minor })) },
    { name: `By ${GROUP_LABEL[groupBy].toLowerCase()}`.slice(0, 31), rows: groupRows.map((r) => ({ [GROUP_LABEL[groupBy]]: r.label, "Major / Critical": r.Critical, Moderate: r.Moderate, Minor: r.Minor, Total: r.Critical + r.Moderate + r.Minor })) },
    ...(groupPick ? [{ name: "By unit", rows: unitRows.map((r) => ({ Unit: r.label, "Major / Critical": r.Critical, Moderate: r.Moderate, Minor: r.Minor, Total: r.Critical + r.Moderate + r.Minor })) }] : []),
    { name: barPick || sevPick || groupPick ? "Open faults (selection)" : "Open faults", rows: openList.map(row) },
  ];

  if (isLoading) return <div className="empty">Loading...</div>;
  if (error) return <div className="empty">Could not load the faults: {String(error)}</div>;

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">
          Faults not yet fixed {isCurrent ? <b>now</b> : <>at the <b>end of {range.label}</b></>}, by severity. A fault carried forward to a later report is counted once.
        </p>
        <ExportMenu dashboardNo={2} title="Open defects by severity" filters={filters} tables={exportTables} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        {SEVERITIES.map((s) => {
          const diff = atEnd[s.key] - atStart[s.key];
          return (
            <button
              type="button"
              key={s.key}
              className={`mrid-kpi${sevPick === s.key ? " is-on" : ""}`}
              style={{ ["--kpi" as string]: s.color }}
              onClick={() => setSevPick((v) => (v === s.key ? null : s.key))}
              title={`List the open ${s.key} faults`}
            >
              <div className="mrid-kpi-head"><i className="mrid-dot" style={{ background: s.color }} /><span>{s.key}</span></div>
              <div className="mrid-kpi-value">{atEnd[s.key]}</div>
              <TrendDelta now={atEnd[s.key]} prev={prevMonth ? prevMonth[s.key] : null} label={prevMonth ? `vs end of ${prevMonth.name}` : ""} />
              <Sparkline values={series(s.key)} color={s.color} title={`Open ${s.key} faults at each month-end`} />
              <div className="mrid-kpi-sub">
                {s.plain} · {diff === 0 ? "no change" : `${diff > 0 ? "+" : ""}${diff}`} since start of period · {found[s.key]} new
              </div>
              <div className="mrid-kpi-hint">{sevPick === s.key ? "Showing these faults ↓" : "Click to list faults"}</div>
            </button>
          );
        })}
        <button type="button" className="mrid-kpi" style={{ ["--kpi" as string]: "var(--text-soft)" }} onClick={() => { setSevPick(null); setBarPick(null); setGroupPick(null); setUnitPick(null); }} title="Show every open fault">
          <div className="mrid-kpi-head"><span>All open faults</span></div>
          <div className="mrid-kpi-value">{total(atEnd)}</div>
          <TrendDelta now={total(atEnd)} prev={prevMonth ? total(prevMonth) : null} label={prevMonth ? `vs end of ${prevMonth.name}` : ""} />
          <Sparkline values={monthEnd.map((m) => total(m))} color="var(--accent-blue, #2f6fed)" title="All open faults at each month-end" />
          <div className="mrid-kpi-sub">{total(atStart)} at start of period · {total(found)} new in period</div>
          <div className="mrid-kpi-hint">Click to list all</div>
        </button>
      </div>

      <MonthEndTrend
        title="Open faults at the end of each month"
        note="Each point is the number of faults still open on the last day of that month (today for the current month)."
        points={monthEnd}
        picked={barPick?.name ?? null}
        onPick={(m) => setBarPick({ name: m.name, t: m.t })}
      />

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Flow of open faults over the period</h3></div>
        {trend.length === 0 ? (
          <p className="mrid-note">This period has not started yet.</p>
        ) : (
          <>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <AreaChart
                  data={trend}
                  stackOffset="wiggle"
                  margin={{ top: 8, right: 16, bottom: 4, left: 16 }}
                  style={{ cursor: "pointer" }}
                  onClick={(st) => {
                    const i = Number(st?.activeIndex);
                    const b = Number.isFinite(i) ? trend[i] : undefined;
                    if (b) setBarPick({ name: b.name, t: b.t });
                  }}
                >
                  <defs>
                    {SEVERITIES.map((s) => (
                      <linearGradient key={s.key} id={`st-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.85} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0.55} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} horizontal={false} />
                  <XAxis dataKey="name" tick={{ fill: "var(--text-soft)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={12} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  {[...SEVERITIES].reverse().map((s) => (
                    <Area key={s.key} type="monotone" dataKey={s.key} name={s.key === "Critical" ? "Major / Critical" : s.key} stackId="sev"
                      stroke={s.color} strokeWidth={1} fill={`url(#st-${s.key})`} animationDuration={900} animationEasing="ease-out" />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mrid-legend">
              {SEVERITIES.map((s) => (
                <span key={s.key}><i style={{ background: s.color }} />{s.key === "Critical" ? "Major / Critical" : s.key}</span>
              ))}
            </div>
            <p className="mrid-note" style={{ textAlign: "center" }}>The thicker the stream, the more faults were open at the end of that {trendUnit(range.from, range.to)}. Hover for the exact numbers; click to list them.</p>
          </>
        )}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head">
          <h3>
            Open faults by {unitPick != null ? "unit" : GROUP_LABEL[groupBy].toLowerCase()}
            {barPick ? <> at the end of {barPick.name}</> : null}
          </h3>
          <label className="mrid-field mrid-inline">
            <span>Group by</span>
            <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value as GroupBy); setGroupPick(null); setUnitPick(null); }}>
              {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
            </select>
          </label>
        </div>
        <div className="mrid-crumbs">
          <button type="button" onClick={() => { setSevPick(null); setGroupPick(null); setUnitPick(null); }}>{sevPick ? `${sevPick} faults` : "All severities"}</button>
          <span className="sep">›</span>
          <button type="button" onClick={() => { setGroupPick(null); setUnitPick(null); }}>{groupPick ?? `Every ${GROUP_LABEL[groupBy].toLowerCase()}`}</button>
          {groupPick && <><span className="sep">›</span><button type="button" onClick={() => setUnitPick(null)}>{unitPick != null ? (codeOf.get(unitPick)?.asset_code ?? unitPick) : "Every unit"}</button></>}
        </div>
        {groupPick == null ? (
          <BreakdownTable rows={groupRows} picked={null} firstCol={GROUP_LABEL[groupBy]} onPick={(k) => { setGroupPick(k); setUnitPick(null); }}
            hint={`Click a ${GROUP_LABEL[groupBy].toLowerCase()} to see its units. Click a severity tile above to narrow by severity first.`} />
        ) : (
          <BreakdownTable rows={unitRows} picked={unitPick != null ? String(unitPick) : null} firstCol="Unit" onPick={(k) => setUnitPick((v) => (v === Number(k) ? null : Number(k)))}
            hint="Click a unit to list only its faults below." />
        )}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head">
          <h3>{barPick ? <>Faults open at the end of {barPick.name}</> : <>Open faults</>} ({openList.length})</h3>
        </div>
        {(sevPick || barPick || groupPick) && (
          <div className="mrid-drill">
            {sevPick && <span className="mrid-chip">Severity: <b>{sevPick}</b></span>}
            {barPick && <span className="mrid-chip">As at: <b>end of {barPick.name}</b></span>}
            {groupPick && <span className="mrid-chip">{GROUP_LABEL[groupBy]}: <b>{groupPick}</b></span>}
            {unitPick != null && <span className="mrid-chip">Unit: <b>{codeOf.get(unitPick)?.asset_code ?? unitPick}</b></span>}
            <button type="button" className="ghost mrid-clear" onClick={() => { setSevPick(null); setBarPick(null); setGroupPick(null); setUnitPick(null); }}>✕ Clear selection</button>
          </div>
        )}
        {openList.length > 0 && (
          <div className="mrid-scope" style={{ marginTop: 0 }}>
            {[...byStage.entries()].map(([s, n]) => (
              <span key={s} className="mrid-chip">{s}: <b>{n}</b></span>
            ))}
          </div>
        )}
        {openList.length === 0 ? (
          <p className="mrid-note">No faults match this selection.</p>
        ) : (
          <div className="mrid-table-wrap">
            <table className="mrid-table">
              <thead>
                <tr><th>Severity</th><th>Unit</th><th>Item</th><th>Issue</th><th>First found</th><th>Days open</th><th>Status now</th><th>MR-I report</th></tr>
              </thead>
              <tbody>
                {openList.map((f) => (
                  <tr key={f.result_id}>
                    <td><span className="mrid-sev"><i className="mrid-dot" style={{ background: SEVERITIES.find((s) => s.key === sevKey(f.severity))!.color }} />{sevKey(f.severity)}</span></td>
                    <td><b>{codeOf.get(f.asset_id)?.asset_code ?? f.asset_id}</b>{f.component ? <span className="mrid-soft"> · {f.component}</span> : null}</td>
                    <td>{f.item ?? "—"}</td>
                    <td className="mrid-soft">{f.issue_details ?? "—"}</td>
                    <td>{fmtDate(sinceOf(f))}</td>
                    <td>{daysOpen(f)}</td>
                    <td className="mrid-soft">{f.state === "Open" ? f.stage : `${f.state}: ${f.stage}`}</td>
                    <td><PreviewButton reportId={f.report_id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const sevRank = (s: string) => ({ Critical: 0, Moderate: 1, Minor: 2 })[sevKey(s)];

function trendUnit(from: Date, to: Date) {
  const days = (to.getTime() - from.getTime()) / 86400000;
  return days <= 62 ? "day" : days <= 366 && !(from.getDate() === 1 && to.getDate() === 1 && days >= 360) ? "week" : "month";
}

/** A fault that arrived from an earlier report (same unit, item and component, the earlier one carried forward). */
function isCarriedIn(f: MriDashboardFault, all: MriDashboardFault[]) {
  return all.some(
    (g) =>
      g.state === "Carried forward" &&
      g.asset_id === f.asset_id &&
      g.item === f.item &&
      g.component === f.component &&
      g.report_id < f.report_id &&
      g.ended_at === f.found_at,
  );
}
