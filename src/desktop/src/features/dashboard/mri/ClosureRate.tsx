import { useMemo, useState } from "react";
import { BarChart, Bar, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import {
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
import { changeLine, Sparkline, StoryStrip, TrendDelta, type StoryLine } from "./fluid";

// Dashboard 4: Fault closure rate (Faults Severity Classification, "MMS Data Monitoring"):
//   Closure rate % = faults closed in the period ÷ (backlog at the start + new faults in the period) × 100
// Backlog = faults open at the start of the period. New = faults first raised in the period (a fault
// carried forward to a later report is the same fault, not a new one). Closed = faults formally
// closed in MMS in the period. Target: Major / Critical above 95%.

type Sev = "Critical" | "Moderate" | "Minor";
const TARGET = 95;
const DAY = 86400;
const nowSecs = () => Math.floor(Date.now() / 1000);
const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const sevColor = (k: Sev) => SEVERITIES.find((s) => s.key === k)!.color;

interface Counts { backlog: number; added: number; closed: number; rate: number | null }
const rateOf = (c: Omit<Counts, "rate">): Counts => ({ ...c, rate: c.backlog + c.added ? Math.round((c.closed / (c.backlog + c.added)) * 1000) / 10 : null });
const fmtRate = (r: number | null) => (r == null ? "—" : `${r}%`);

function useClosure(assets: MriDashboardAsset[]) {
  const { data = [], isLoading, error } = useMriDashboardFaults();
  const ids = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  const faults = useMemo(() => data.filter((f) => ids.has(f.asset_id)), [data, ids]);
  const first = useMemo(() => firstFoundMap(faults), [faults]);
  const since = (f: MriDashboardFault) => first.get(f.result_id) ?? f.found_at;
  const isNew = (f: MriDashboardFault, s: number, e: number) => f.found_at != null && f.found_at >= s && f.found_at < e && since(f) === f.found_at;
  const isClosed = (f: MriDashboardFault, s: number, e: number) => f.state === "Closed" && f.ended_at != null && f.ended_at >= s && f.ended_at < e;
  const count = (list: MriDashboardFault[], s: number, e: number): Counts =>
    rateOf({
      backlog: list.filter((f) => openAt(f, s)).length,
      added: list.filter((f) => isNew(f, s, e)).length,
      closed: list.filter((f) => isClosed(f, s, e)).length,
    });
  return { faults, isLoading, error, since, isNew, isClosed, count };
}

const bySev = (list: MriDashboardFault[], k: Sev | "All" | "MinMod") =>
  k === "All" ? list : k === "MinMod" ? list.filter((f) => sevKey(f.severity) !== "Critical") : list.filter((f) => sevKey(f.severity) === k);

/** Card summary: this period's rates. */
export function ClosureRateMini({ assets }: { assets: MriDashboardAsset[] }) {
  // The card has no filters prop: show the current month.
  const { faults, count } = useClosure(assets);
  const d = new Date();
  const s = Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000);
  const e = nowSecs() + 1;
  return (
    <div className="mrid-mini">
      {SEVERITIES.map((sv) => {
        const c = count(bySev(faults, sv.key), s, e);
        return (
          <span key={sv.key} className="mrid-mini-item" title={`${sv.key} closure rate, this month`}>
            <i className="mrid-dot" style={{ background: sv.color }} /> {sv.key} <b>{fmtRate(c.rate)}</b>
          </span>
        );
      })}
    </div>
  );
}

export default function ClosureRate({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const { faults, isLoading, error, since, isClosed, count } = useClosure(assets);
  const range = periodRange(filters);
  const pStart = Math.floor(range.from.getTime() / 1000);
  const pEndFull = Math.floor(range.to.getTime() / 1000);
  const pEnd = Math.min(pEndFull, nowSecs() + 1);
  const unitOf = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const [sevPick, setSevPick] = useState<Sev | null>(null);
  const [monthPick, setMonthPick] = useState<{ name: string; s: number; e: number } | null>(null);
  const [tab, setTab] = useState<"closed" | "open">("closed");
  const s = monthPick?.s ?? pStart;
  const e = monthPick?.e ?? pEnd;
  const clearAll = () => { setSevPick(null); setMonthPick(null); };

  const tiles = SEVERITIES.map((sv) => ({ key: sv.key as Sev, ...count(bySev(faults, sv.key), s, e) }));
  const all = count(faults, s, e);
  const minMod = count(bySev(faults, "MinMod"), s, e);

  // Monthly trend: the months of the period; for a week or a month, the 12 months ending with it.
  const months = useMemo(() => {
    const endD = new Date(Math.min(range.to.getTime(), Date.now()) - 1);
    let startD = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    const span = (endD.getFullYear() - startD.getFullYear()) * 12 + endD.getMonth() - startD.getMonth();
    if (span < 2) startD = new Date(endD.getFullYear(), endD.getMonth() - 11, 1);
    const out: { name: string; s: number; e: number }[] = [];
    for (let d = startD; d <= endD; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const ms = Math.floor(d.getTime() / 1000);
      const me = Math.min(Math.floor(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() / 1000), nowSecs() + 1);
      out.push({ name: `${M[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, s: ms, e: me });
    }
    return out;
  }, [range.from.getTime(), range.to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const trendAll = months.map((m) => {
    const r = (k: Sev) => count(bySev(faults, k), m.s, m.e).rate;
    return { ...m, Critical: r("Critical"), Moderate: r("Moderate"), Minor: r("Minor"), All: count(faults, m.s, m.e).rate };
  });
  // Leave out the months before the first one with any fault, so the chart starts where the data starts.
  const firstWithData = trendAll.findIndex((m) => m.All != null);
  const trend = firstWithData < 0 ? [] : trendAll.slice(firstWithData);

  const pool = sevPick ? bySev(faults, sevPick) : faults;
  const closedList = pool
    .filter((f) => isClosed(f, s, e))
    .map((f) => ({ f, days: f.ended_at != null && since(f) != null ? Math.max(0, Math.floor((f.ended_at - since(f)!) / DAY)) : null }))
    .sort((a, b) => (b.f.ended_at ?? 0) - (a.f.ended_at ?? 0));
  // Faults that were available for closure (backlog + new) and are still open at the end.
  // Every fault open at the end was either in the backlog or raised in the period.
  const notClosed = pool.filter((f) => openAt(f, e));
  const avgDays = (k: Sev | null) => {
    const l = closedList.filter((x) => x.days != null && (k == null || sevKey(x.f.severity) === k));
    return l.length ? Math.round(l.reduce((a, x) => a + x.days!, 0) / l.length) : null;
  };
  const howClosed = new Map<string, number>();
  closedList.forEach(({ f }) => howClosed.set(f.stage, (howClosed.get(f.stage) ?? 0) + 1));

  const base = (f: MriDashboardFault): ExportRow => ({
    Severity: sevKey(f.severity),
    Unit: unitOf.get(f.asset_id)?.asset_code ?? String(f.asset_id),
    "Equipment type": unitOf.get(f.asset_id)?.asset_type ?? null,
    Component: f.component,
    Item: f.item,
    Issue: f.issue_details,
    "First found": fmtDate(since(f)),
    Report: `#${f.report_id}`,
    Country: unitOf.get(f.asset_id)?.country ?? null,
  });
  const periodName = monthPick ? monthPick.name : range.label;
  // ---- fluid layer ----
  const numbers = (l: (number | null)[]) => l.filter((x): x is number => x != null);
  const lastIdx = trendAll.length - 1;
  const prevRate = (k: Sev | "All") => (monthPick || lastIdx < 1 ? null : trendAll[lastIdx - 1][k]);
  const story: StoryLine[] = [];
  {
    const crit = tiles.find((x) => x.key === "Critical")!;
    if (crit.rate != null) {
      story.push(crit.rate >= TARGET
        ? { tone: "better", text: <>Major / Critical closure rate is <b>{crit.rate}%</b>, on the {TARGET}% target.</> }
        : { tone: "attention", text: <>Major / Critical closure rate is <b>{crit.rate}%</b>, below the {TARGET}% target: {crit.backlog + crit.added - crit.closed} of {crit.backlog + crit.added} still to close.</> });
    }
    const c = changeLine(<>The overall closure rate</>, prevRate("All"), all.rate, `${trendAll[lastIdx - 1]?.name ?? "last month"}`, false, "%");
    if (c) story.push(c);
    const oldestCrit = notClosed.filter((f) => sevKey(f.severity) === "Critical").sort((a, b) => (since(a) ?? 0) - (since(b) ?? 0))[0];
    if (oldestCrit && since(oldestCrit) != null) story.push({ tone: "info", text: <>Oldest Major / Critical fault not closed: <b>{oldestCrit.item ?? "a fault"}</b> on {unitOf.get(oldestCrit.asset_id)?.asset_code}, found {fmtDate(since(oldestCrit))}.</> });
  }

  const exportTables = () => [
    {
      name: "Closure rate",
      rows: [
        ...tiles.map((t) => ({ Group: t.key, "Backlog at start": t.backlog, "New in period": t.added, "Closed in period": t.closed, "Closure rate %": t.rate, Target: t.key === "Critical" ? `> ${TARGET}%` : "" })),
        { Group: "Minor and Moderate", "Backlog at start": minMod.backlog, "New in period": minMod.added, "Closed in period": minMod.closed, "Closure rate %": minMod.rate, Target: "" },
        { Group: "All", "Backlog at start": all.backlog, "New in period": all.added, "Closed in period": all.closed, "Closure rate %": all.rate, Target: "" },
      ],
    },
    {
      name: "Monthly trend",
      rows: months.map((m) => {
        const r = (l: MriDashboardFault[]) => count(l, m.s, m.e).rate;
        return { Month: m.name, "Major and Critical %": r(bySev(faults, "Critical")), "Moderate %": r(bySev(faults, "Moderate")), "Minor %": r(bySev(faults, "Minor")), "Minor and Moderate %": r(bySev(faults, "MinMod")), "All %": r(faults) };
      }),
    },
    { name: "Closed", rows: closedList.map(({ f, days }) => ({ ...base(f), Closed: fmtDate(f.ended_at), "Days to close": days, "How it was closed": f.stage })) },
    { name: "Not closed", rows: notClosed.map((f) => ({ ...base(f), "Status now": f.state === "Open" ? f.stage : `${f.state}: ${f.stage}` })) },
  ];

  if (isLoading) return <div className="empty">Loading...</div>;
  if (error) return <div className="empty">Could not load the faults: {String(error)}</div>;

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <div style={{ display: "grid", gap: 6 }}>
          <p className="mrid-note" style={{ margin: 0 }}>
            Of the faults that needed closing in <b>{periodName}</b> (open at the start plus new ones), the share closed in that time.
          </p>
          <span className="mrid-formula">Closure rate = closed in the period ÷ (backlog at the start + new in the period) × 100 · Target for Critical: above {TARGET}%</span>
        </div>
        <ExportMenu dashboardNo={4} title="Fault closure rate" filters={filters} tables={exportTables} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        {tiles.map((t) => {
          const isCrit = t.key === "Critical";
          const ok = t.rate != null && t.rate >= TARGET;
          return (
            <button
              type="button"
              key={t.key}
              className={`mrid-kpi${sevPick === t.key ? " is-on" : ""}`}
              style={{ ["--kpi" as string]: sevColor(t.key) }}
              onClick={() => setSevPick((v) => (v === t.key ? null : t.key))}
              title={`List the ${t.key} faults`}
            >
              <div className="mrid-kpi-head">
                <i className="mrid-dot" style={{ background: sevColor(t.key) }} />
                <span>{isCrit ? "Major / Critical" : t.key}</span>
                {isCrit && t.rate != null && <span className={`mrid-target ${ok ? "ok" : "bad"}`}>{ok ? "On target" : `Below ${TARGET}%`}</span>}
              </div>
              <div className="mrid-kpi-value">{fmtRate(t.rate)}</div>
              <TrendDelta now={t.rate} prev={prevRate(t.key)} lowerIsBetter={false} unit="%" label="vs last month" />
              <Sparkline values={numbers(trendAll.map((m) => m[t.key]))} color={sevColor(t.key)} title={`${t.key} closure rate by month`} />
              <div className="mrid-kpi-sub">
                {t.closed} closed of {t.backlog + t.added} ({t.backlog} backlog + {t.added} new){avgDays(t.key) != null ? ` · ${avgDays(t.key)} days to close on average` : ""}
              </div>
              <div className="mrid-kpi-hint">{sevPick === t.key ? "Showing these faults ↓" : "Click to list faults"}</div>
            </button>
          );
        })}
        <button type="button" className="mrid-kpi" style={{ ["--kpi" as string]: "var(--text-soft)" }} onClick={clearAll} title="Show all faults">
          <div className="mrid-kpi-head"><span>All faults</span></div>
          <div className="mrid-kpi-value">{fmtRate(all.rate)}</div>
          <TrendDelta now={all.rate} prev={prevRate("All")} lowerIsBetter={false} unit="%" label="vs last month" />
          <Sparkline values={numbers(trendAll.map((m) => m.All))} color="var(--accent-blue, #2f6fed)" title="Closure rate by month" />
          <div className="mrid-kpi-sub">{all.closed} closed of {all.backlog + all.added} · Minor and Moderate together: {fmtRate(minMod.rate)}</div>
          <div className="mrid-kpi-hint">Click to list all</div>
        </button>
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Closure rate by month</h3></div>
        {trend.length === 0 ? (
          <p className="mrid-note">No faults needed closing in these months.</p>
        ) : (
        <>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart
              data={trend}
              margin={{ top: 18, right: 20, bottom: 4, left: 0 }}
              barCategoryGap="22%"
              style={{ cursor: "pointer" }}
              onClick={(st) => {
                const i = Number(st?.activeIndex);
                const m = Number.isFinite(i) ? trend[i] : undefined;
                if (m) setMonthPick({ name: m.name, s: m.s, e: m.e });
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: "var(--text-soft)", fontSize: 11 }} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 95, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "var(--text-soft)", fontSize: 11 }} width={44} />
              <Tooltip cursor={{ fill: "var(--accent-soft)" }} formatter={(v) => (v == null ? "No faults" : `${v}%`)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <ReferenceLine y={TARGET} stroke="var(--danger)" strokeDasharray="6 4" label={{ value: `Critical target ${TARGET}%`, position: "insideTopLeft", fill: "var(--danger)", fontSize: 11 }} />
              <defs>
                {SEVERITIES.map((sv) => (
                  <linearGradient key={sv.key} id={`cr-${sv.key}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={sv.color} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={sv.color} stopOpacity={0.55} />
                  </linearGradient>
                ))}
              </defs>
              {SEVERITIES.map((sv) => (
                <Bar key={sv.key} dataKey={sv.key} name={sv.key === "Critical" ? "Major / Critical" : sv.key} fill={`url(#cr-${sv.key})`} radius={[6, 6, 0, 0]} maxBarSize={28} minPointSize={2} animationDuration={700} animationEasing="ease-out">
                  <LabelList dataKey={sv.key} position="top" formatter={(v: unknown) => (v == null ? "" : `${v}%`)} style={{ fill: "var(--text-soft)", fontSize: 10 }} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mrid-legend">
          {SEVERITIES.map((sv) => (
            <span key={sv.key}><i style={{ background: sv.color }} />{sv.key === "Critical" ? "Major / Critical" : sv.key}</span>
          ))}
        </div>
        <p className="mrid-note" style={{ textAlign: "center" }}>Each month has one bar per severity. A missing bar means no faults of that severity needed closing that month. Click a month to see its numbers and faults.</p>
        </>
        )}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head">
          <h3>Faults in {periodName}</h3>
          <div className="mrid-tabs" role="tablist">
            <button type="button" className={tab === "closed" ? "is-on" : ""} onClick={() => setTab("closed")}>Closed ({closedList.length})</button>
            <button type="button" className={tab === "open" ? "is-on" : ""} onClick={() => setTab("open")}>Not closed ({notClosed.length})</button>
          </div>
        </div>
        {(sevPick || monthPick) && (
          <div className="mrid-drill">
            {sevPick && <span className="mrid-chip">Severity: <b>{sevPick}</b></span>}
            {monthPick && <span className="mrid-chip">Month: <b>{monthPick.name}</b></span>}
            <button type="button" className="ghost mrid-clear" onClick={clearAll}>✕ Clear selection</button>
          </div>
        )}
        {tab === "closed" && howClosed.size > 0 && (
          <div className="mrid-scope" style={{ marginTop: 0 }}>
            {[...howClosed.entries()].map(([k, n]) => (
              <span key={k} className="mrid-chip">{k}: <b>{n}</b></span>
            ))}
          </div>
        )}
        {tab === "closed" ? (
          closedList.length === 0 ? (
            <p className="mrid-note">No faults were closed in this time.</p>
          ) : (
            <div className="mrid-table-wrap">
              <table className="mrid-table">
                <thead>
                  <tr><th>Severity</th><th>Unit</th><th>Item</th><th>Issue</th><th>First found</th><th>Closed</th><th>Days to close</th><th>How it was closed</th><th>MR-I report</th></tr>
                </thead>
                <tbody>
                  {closedList.map(({ f, days }) => (
                    <tr key={f.result_id}>
                      <td><span className="mrid-sev"><i className="mrid-dot" style={{ background: sevColor(sevKey(f.severity)) }} />{sevKey(f.severity)}</span></td>
                      <td><b>{unitOf.get(f.asset_id)?.asset_code ?? f.asset_id}</b>{f.component ? <span className="mrid-soft"> · {f.component}</span> : null}</td>
                      <td>{f.item ?? "—"}</td>
                      <td className="mrid-soft">{f.issue_details ?? "—"}</td>
                      <td>{fmtDate(since(f))}</td>
                      <td>{fmtDate(f.ended_at)}</td>
                      <td>{days ?? "—"}</td>
                      <td className="mrid-soft">{f.stage}</td>
                      <td><PreviewButton reportId={f.report_id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : notClosed.length === 0 ? (
          <p className="mrid-note">Every fault that needed closing was closed.</p>
        ) : (
          <div className="mrid-table-wrap">
            <table className="mrid-table">
              <thead>
                <tr><th>Severity</th><th>Unit</th><th>Item</th><th>Issue</th><th>First found</th><th>Status now</th><th>MR-I report</th></tr>
              </thead>
              <tbody>
                {notClosed.map((f) => (
                  <tr key={f.result_id}>
                    <td><span className="mrid-sev"><i className="mrid-dot" style={{ background: sevColor(sevKey(f.severity)) }} />{sevKey(f.severity)}</span></td>
                    <td><b>{unitOf.get(f.asset_id)?.asset_code ?? f.asset_id}</b>{f.component ? <span className="mrid-soft"> · {f.component}</span> : null}</td>
                    <td>{f.item ?? "—"}</td>
                    <td className="mrid-soft">{f.issue_details ?? "—"}</td>
                    <td>{fmtDate(since(f))}</td>
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
