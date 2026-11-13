import { useMemo, useState } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  AGING_LIMIT_DAYS,
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
import { changeLine, Sparkline, StoryStrip, TrendDelta, type StoryLine } from "./fluid";
import { GROUP_LABEL, groupOf, MonthEndTrend, type GroupBy, type MonthEndPoint } from "./MonthEnd";

// Dashboard 3: Defect aging.
// How long each open fault has waited since it was FIRST found (carried-forward faults keep
// their original date). A fault is overdue when it is older than its severity's limit:
// Major/Critical more than 7 days, Moderate and Minor more than 30 days.

type Sev = "Critical" | "Moderate" | "Minor";
const DAY = 86400;
const nowSecs = () => Math.floor(Date.now() / 1000);
const zero = (): Record<Sev, number> => ({ Critical: 0, Moderate: 0, Minor: 0 });
const AGE_BUCKETS = [
  { label: "0–7 days", min: 0, max: 7 },
  { label: "8–30 days", min: 8, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "Over 90 days", min: 91, max: Infinity },
];
const bucketOf = (age: number) => AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
const sevColor = (k: Sev) => SEVERITIES.find((s) => s.key === k)!.color;

function useAging(assets: MriDashboardAsset[]) {
  const { data = [], isLoading, error } = useMriDashboardFaults();
  const ids = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  const faults = useMemo(() => data.filter((f) => ids.has(f.asset_id)), [data, ids]);
  const first = useMemo(() => firstFoundMap(faults), [faults]);
  const since = (f: MriDashboardFault) => first.get(f.result_id) ?? f.found_at;
  const ageAt = (f: MriDashboardFault, t: number) => {
    const s = since(f);
    return s == null ? 0 : Math.max(0, Math.floor((t - s) / DAY));
  };
  const overdueAt = (f: MriDashboardFault, t: number) => ageAt(f, t) > AGING_LIMIT_DAYS[sevKey(f.severity)];
  return { faults, isLoading, error, since, ageAt, overdueAt };
}

/** Card summary: overdue faults now. */
export function DefectAgingMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { faults, overdueAt } = useAging(assets);
  const t = nowSecs() + 1;
  const c = zero();
  faults.forEach((f) => openAt(f, t) && overdueAt(f, t) && c[sevKey(f.severity)]++);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">Overdue:</span>
      {SEVERITIES.map((s) => (
        <span key={s.key} className="mrid-mini-item" title={`${s.key} older than ${AGING_LIMIT_DAYS[s.key]} days`}>
          <i className="mrid-dot" style={{ background: s.color }} /> {s.key} <b>{c[s.key]}</b>
        </span>
      ))}
    </div>
  );
}

export default function DefectAging({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const { faults, isLoading, error, since, ageAt, overdueAt } = useAging(assets);
  const range = periodRange(filters);
  const endFull = Math.floor(range.to.getTime() / 1000);
  const end = Math.min(endFull, nowSecs() + 1);
  const isCurrent = endFull > nowSecs();
  const unitOf = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const typeOf = (f: MriDashboardFault) => unitOf.get(f.asset_id)?.asset_type?.trim() || "Not set";

  // Drill-down picks
  const [sevPick, setSevPick] = useState<Sev | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [bucketPick, setBucketPick] = useState<number | null>(null);
  const [typePick, setTypePick] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("asset_type");
  const grp = (f: MriDashboardFault) => groupOf(unitOf.get(f.asset_id), groupBy);
  const [whenPick, setWhenPick] = useState<{ name: string; t: number } | null>(null);
  const asAt = whenPick?.t ?? end;
  const clearAll = () => { setSevPick(null); setOverdueOnly(false); setBucketPick(null); setTypePick(null); setWhenPick(null); };

  const open = faults.filter((f) => openAt(f, asAt));

  const summary = SEVERITIES.map((s) => {
    const list = open.filter((f) => sevKey(f.severity) === s.key);
    const ages = list.map((f) => ageAt(f, asAt));
    return {
      key: s.key as Sev,
      open: list.length,
      overdue: list.filter((f) => overdueAt(f, asAt)).length,
      oldest: ages.length ? Math.max(...ages) : 0,
      avg: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0,
    };
  });
  const totalOverdue = summary.reduce((a, s) => a + s.overdue, 0);
  const allAges = open.map((f) => ageAt(f, asAt));
  const avgAll = allAges.length ? Math.round(allAges.reduce((a, b) => a + b, 0) / allAges.length) : 0;

  const bucketData = AGE_BUCKETS.map((b) => {
    const c = zero();
    open.forEach((f) => { const a = ageAt(f, asAt); if (a >= b.min && a <= b.max) c[sevKey(f.severity)]++; });
    return { name: b.label, ...c };
  });

  const trend = useMemo(
    () =>
      buckets(range.from, range.to)
        .filter((b) => b.start.getTime() / 1000 < end)
        .map((b) => {
          const t = Math.min(Math.floor(b.end.getTime() / 1000), end);
          const c = zero();
          faults.forEach((f) => openAt(f, t) && overdueAt(f, t) && c[sevKey(f.severity)]++);
          return { name: b.label, t, ...c };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [faults, range.from.getTime(), range.to.getTime(), end],
  );

  const byType = useMemo(() => {
    const m = new Map<string, { open: number; over: Record<Sev, number> }>();
    for (const f of open) {
      const k = grp(f);
      const r = m.get(k) ?? { open: 0, over: zero() };
      r.open++;
      if (overdueAt(f, asAt)) r.over[sevKey(f.severity)]++;
      m.set(k, r);
    }
    return [...m.entries()]
      .map(([name, r]) => ({ name, open: r.open, ...r.over, overdue: r.over.Critical + r.over.Moderate + r.over.Minor }))
      .sort((a, b) => b.Critical - a.Critical || b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open.length, asAt, faults, groupBy]);

  // Month-end overdue counts (deck: "aging based on open fault age at month-end").
  const monthEnd: MonthEndPoint[] = useMemo(
    () =>
      monthsFor(range.from, range.to).map((m) => {
        const t = Math.min(m.e, nowSecs() + 1);
        const c = zero();
        faults.forEach((f) => openAt(f, t) && overdueAt(f, t) && c[sevKey(f.severity)]++);
        return { name: m.name, t, ...c };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [faults, range.from.getTime(), range.to.getTime()],
  );

  const list = open
    .filter(
      (f) =>
        (sevPick == null || sevKey(f.severity) === sevPick) &&
        (!overdueOnly || overdueAt(f, asAt)) &&
        (bucketPick == null || bucketOf(ageAt(f, asAt)) === bucketPick) &&
        (typePick == null || grp(f) === typePick),
    )
    .map((f) => ({ f, age: ageAt(f, asAt), limit: AGING_LIMIT_DAYS[sevKey(f.severity)] }))
    .sort((a, b) => b.age - b.limit - (a.age - a.limit) || b.age - a.age);
  const picking = sevPick || overdueOnly || bucketPick != null || typePick || whenPick;

  // ---- fluid layer ----
  const prevMonth = monthEnd.length >= 2 ? monthEnd[monthEnd.length - 2] : null;
  const meTotal = (m: MonthEndPoint) => m.Critical + m.Moderate + m.Minor;
  const story: StoryLine[] = [];
  {
    const overdueNow = open.filter((f) => overdueAt(f, asAt)).sort((a, b) => ageAt(b, asAt) - ageAt(a, asAt));
    const critOver = overdueNow.filter((f) => sevKey(f.severity) === "Critical");
    if (critOver.length) {
      const f = critOver[0];
      story.push({ tone: "attention", text: <><b>{critOver.length} Major / Critical</b> fault{critOver.length === 1 ? " is" : "s are"} past the {AGING_LIMIT_DAYS.Critical}-day limit. Oldest: <b>{f.item ?? "a fault"}</b> on {unitOf.get(f.asset_id)?.asset_code}, {ageAt(f, asAt)} days.</> });
    } else if (overdueNow.length) {
      const f = overdueNow[0];
      story.push({ tone: "attention", text: <><b>{overdueNow.length}</b> fault{overdueNow.length === 1 ? " is" : "s are"} overdue. Oldest: <b>{f.item ?? "a fault"}</b> on {unitOf.get(f.asset_id)?.asset_code}, {ageAt(f, asAt)} days.</> });
    }
    if (prevMonth && !whenPick) {
      const c = changeLine(<>Overdue faults</>, meTotal(prevMonth), totalOverdue, `the end of ${prevMonth.name}`);
      if (c) story.push(c);
    }
    const topGroup = byType.find((r) => r.overdue > 0);
    if (topGroup) story.push({ tone: "info", text: <><b>{topGroup.name}</b> has the most overdue faults ({topGroup.overdue}). Average age of all open faults: {avgAll} days.</> });
    else if (open.length) story.push({ tone: "better", text: <>No fault is past its limit. Average age of open faults: {avgAll} days.</> });
  }

  const row = ({ f, age, limit }: { f: MriDashboardFault; age: number; limit: number }): ExportRow => ({
    Severity: sevKey(f.severity),
    Unit: unitOf.get(f.asset_id)?.asset_code ?? String(f.asset_id),
    "Equipment type": typeOf(f),
    Component: f.component,
    Item: f.item,
    Issue: f.issue_details,
    "First found": fmtDate(since(f)),
    "Age (days)": age,
    "Limit (days)": limit,
    Overdue: age > limit ? "Yes" : "No",
    "Days over limit": age > limit ? age - limit : 0,
    "Status now": f.state === "Open" ? f.stage : `${f.state}: ${f.stage}`,
    Report: `#${f.report_id}`,
    Country: unitOf.get(f.asset_id)?.country ?? null,
  });
  const exportTables = () => [
    {
      name: "Summary",
      rows: summary.map((s) => ({
        Severity: s.key,
        "Overdue after (days)": AGING_LIMIT_DAYS[s.key],
        "Open faults": s.open,
        Overdue: s.overdue,
        "Average age (days)": s.avg,
        "Oldest (days)": s.oldest,
      })),
    },
    { name: "Age groups", rows: bucketData.map((b) => ({ Age: b.name, Critical: b.Critical, Moderate: b.Moderate, Minor: b.Minor, Total: b.Critical + b.Moderate + b.Minor })) },
    { name: "Overdue trend", rows: trend.map((t) => ({ "Period end": t.name, Critical: t.Critical, Moderate: t.Moderate, Minor: t.Minor, Total: t.Critical + t.Moderate + t.Minor })) },
    { name: "Month-end overdue", rows: monthEnd.map((m) => ({ Month: m.name, "Major / Critical over 7 days": m.Critical, "Moderate over 30 days": m.Moderate, "Minor over 30 days": m.Minor, Total: m.Critical + m.Moderate + m.Minor })) },
    { name: `By ${GROUP_LABEL[groupBy].toLowerCase()}`.slice(0, 31), rows: byType.map((r) => ({ [GROUP_LABEL[groupBy]]: r.name, "Open faults": r.open, "Overdue Critical": r.Critical, "Overdue Moderate": r.Moderate, "Overdue Minor": r.Minor, "Overdue total": r.overdue })) },
    { name: picking ? "Faults (selection)" : "Open faults", rows: list.map(row) },
  ];

  if (isLoading) return <div className="empty">Loading...</div>;
  if (error) return <div className="empty">Could not load the faults: {String(error)}</div>;

  const whenText = whenPick ? <>at the end of <b>{whenPick.name}</b></> : isCurrent ? <b>now</b> : <>at the <b>end of {range.label}</b></>;

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">
          Age of each open fault {whenText}, counted from the day it was first found. Overdue: Critical older than {AGING_LIMIT_DAYS.Critical} days; Moderate and Minor older than {AGING_LIMIT_DAYS.Moderate} days.
        </p>
        <ExportMenu dashboardNo={3} title="Defect aging" filters={filters} tables={exportTables} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        {summary.map((s) => (
          <button
            type="button"
            key={s.key}
            className={`mrid-kpi${sevPick === s.key && overdueOnly ? " is-on" : ""}`}
            style={{ ["--kpi" as string]: sevColor(s.key) }}
            onClick={() => {
              const on = sevPick === s.key && overdueOnly;
              setSevPick(on ? null : s.key);
              setOverdueOnly(!on);
            }}
            title={`List the overdue ${s.key} faults`}
          >
            <div className="mrid-kpi-head"><i className="mrid-dot" style={{ background: sevColor(s.key) }} /><span>{s.key} overdue</span></div>
            <div className="mrid-kpi-value">{s.overdue}</div>
            <TrendDelta now={s.overdue} prev={prevMonth && !whenPick ? prevMonth[s.key] : null} label={prevMonth ? `vs end of ${prevMonth.name}` : ""} />
            <Sparkline values={monthEnd.map((m) => m[s.key])} color={sevColor(s.key)} title={`Overdue ${s.key} faults at each month-end`} />
            <div className="mrid-kpi-sub">
              of {s.open} open · limit {AGING_LIMIT_DAYS[s.key]} days · oldest {s.oldest} days
            </div>
            <div className="mrid-kpi-hint">{sevPick === s.key && overdueOnly ? "Showing these faults ↓" : "Click to list faults"}</div>
          </button>
        ))}
        <button type="button" className="mrid-kpi" style={{ ["--kpi" as string]: "var(--text-soft)" }} onClick={clearAll} title="Show every open fault">
          <div className="mrid-kpi-head"><span>All open faults</span></div>
          <div className="mrid-kpi-value">{open.length}</div>
          <Sparkline values={monthEnd.map(meTotal)} color="var(--accent-blue, #2f6fed)" title="Overdue faults at each month-end" />
          <div className="mrid-kpi-sub">{totalOverdue} overdue · average age {avgAll} days</div>
          <div className="mrid-kpi-hint">Click to list all</div>
        </button>
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>How old are the open faults?</h3></div>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={bucketData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: "var(--text-soft)", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--text-soft)", fontSize: 11 }} width={32} />
              <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              {[...SEVERITIES].reverse().map((s) => (
                <Bar key={s.key} dataKey={s.key} stackId="sev" fill={s.color} maxBarSize={70} cursor="pointer" onClick={(_, i) => setBucketPick(i)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mrid-legend">
          {SEVERITIES.map((s) => (
            <span key={s.key}><i style={{ background: s.color }} />{s.key}</span>
          ))}
        </div>
        <p className="mrid-note" style={{ textAlign: "center" }}>Critical faults are overdue from 8 days; Moderate and Minor from 31 days. Click a bar to list those faults.</p>
      </div>

      <MonthEndTrend
        title="Overdue faults at the end of each month"
        note={`Faults older than their limit (Major / Critical ${AGING_LIMIT_DAYS.Critical} days, Moderate and Minor ${AGING_LIMIT_DAYS.Moderate} days) on the last day of each month (today for the current month).`}
        points={monthEnd}
        picked={whenPick?.name ?? null}
        onPick={(m) => { setWhenPick({ name: m.name, t: m.t }); setOverdueOnly(true); }}
      />

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Overdue faults over the period</h3></div>
        {trend.length === 0 ? (
          <p className="mrid-note">This period has not started yet.</p>
        ) : (
          <>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <AreaChart
                  data={trend}
                  margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
                  onClick={(st) => {
                    const i = Number(st?.activeIndex);
                    const p = Number.isFinite(i) ? trend[i] : undefined;
                    if (p) setWhenPick({ name: p.name, t: p.t });
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fill: "var(--text-soft)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--text-soft)", fontSize: 11 }} width={32} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <defs>
                    {SEVERITIES.map((s) => (
                      <linearGradient key={s.key} id={`da-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  {SEVERITIES.map((s) => (
                    <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2.2} fill={`url(#da-${s.key})`} dot={false} activeDot={{ r: 5 }} animationDuration={800} animationEasing="ease-out" />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mrid-legend">
              {SEVERITIES.map((s) => (
                <span key={s.key}><i style={{ background: s.color }} />{s.key}</span>
              ))}
            </div>
            <p className="mrid-note" style={{ textAlign: "center" }}>Overdue faults at the end of each {trendUnit(range.from, range.to)}. Click a point to see the faults as they stood then.</p>
          </>
        )}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head">
          <h3>By {GROUP_LABEL[groupBy].toLowerCase()}</h3>
          <label className="mrid-field mrid-inline">
            <span>Group by</span>
            <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value as GroupBy); setTypePick(null); }}>
              {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
            </select>
          </label>
        </div>
        {byType.length === 0 ? (
          <p className="mrid-note">No open faults.</p>
        ) : (
          <div className="mrid-table-wrap">
            <table className="mrid-table">
              <thead>
                <tr><th>{GROUP_LABEL[groupBy]}</th><th>Open faults</th><th>Overdue Critical</th><th>Overdue Moderate</th><th>Overdue Minor</th><th>Overdue total</th></tr>
              </thead>
              <tbody>
                {byType.map((r) => (
                  <tr key={r.name} className="mrid-click" onClick={() => setTypePick((v) => (v === r.name ? null : r.name))} style={typePick === r.name ? { outline: "2px solid var(--accent)" } : undefined}>
                    <td><b>{r.name}</b></td>
                    <td>{r.open}</td>
                    <td className={r.Critical ? "mrid-over" : undefined}>{r.Critical}</td>
                    <td className={r.Moderate ? "mrid-over" : undefined}>{r.Moderate}</td>
                    <td className={r.Minor ? "mrid-over" : undefined}>{r.Minor}</td>
                    <td><b>{r.overdue}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mrid-note">Click a row to list its faults.</p>
          </div>
        )}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head">
          <h3>{picking ? "Selected faults" : "Open faults, oldest past the limit first"} ({list.length})</h3>
          <label className="mrid-toggle">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only
          </label>
        </div>
        {picking && (
          <div className="mrid-drill">
            {sevPick && <span className="mrid-chip">Severity: <b>{sevPick}</b></span>}
            {overdueOnly && <span className="mrid-chip"><b>Overdue only</b></span>}
            {bucketPick != null && <span className="mrid-chip">Age: <b>{AGE_BUCKETS[bucketPick].label}</b></span>}
            {typePick && <span className="mrid-chip">{GROUP_LABEL[groupBy]}: <b>{typePick}</b></span>}
            {whenPick && <span className="mrid-chip">As at: <b>end of {whenPick.name}</b></span>}
            <button type="button" className="ghost mrid-clear" onClick={clearAll}>✕ Clear selection</button>
          </div>
        )}
        {list.length === 0 ? (
          <p className="mrid-note">No faults match this selection.</p>
        ) : (
          <div className="mrid-table-wrap">
            <table className="mrid-table">
              <thead>
                <tr><th>Severity</th><th>Unit</th><th>Item</th><th>Issue</th><th>First found</th><th>Age</th><th>Against the limit</th><th>Status now</th><th>MR-I report</th></tr>
              </thead>
              <tbody>
                {list.map(({ f, age, limit }) => (
                  <tr key={f.result_id}>
                    <td><span className="mrid-sev"><i className="mrid-dot" style={{ background: sevColor(sevKey(f.severity)) }} />{sevKey(f.severity)}</span></td>
                    <td><b>{unitOf.get(f.asset_id)?.asset_code ?? f.asset_id}</b><div className="mrid-soft">{typeOf(f)}{f.component ? ` · ${f.component}` : ""}</div></td>
                    <td>{f.item ?? "—"}</td>
                    <td className="mrid-soft">{f.issue_details ?? "—"}</td>
                    <td>{fmtDate(since(f))}</td>
                    <td><b>{age}</b> days</td>
                    <td>{age > limit ? <span className="mrid-over">Overdue by {age - limit} day{age - limit === 1 ? "" : "s"}</span> : <span className="mrid-ok">{limit - age} day{limit - age === 1 ? "" : "s"} left</span>}</td>
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

function trendUnit(from: Date, to: Date) {
  const days = (to.getTime() - from.getTime()) / 86400000;
  return days <= 62 ? "day" : days <= 366 && !(from.getDate() === 1 && to.getDate() === 1 && days >= 360) ? "week" : "month";
}
