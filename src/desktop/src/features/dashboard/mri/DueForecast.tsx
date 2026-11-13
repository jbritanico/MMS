import { Fragment, useMemo, useState } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { fmtDate, type DashboardFilters, type MriDashboardAsset, type MriDashTrigger } from "../hooks/useMriDashboards";
import ExportMenu from "./ExportMenu";
import { UnitReports } from "./ReportPreview";
import { StoryStrip, type StoryLine } from "./fluid";
import { AX, DAY, DrillChips, Loading, nowSecs, Tile, TT, useMore } from "./kit";

// Dashboard 13: MR-II due forecast.
// From the maintenance-trigger counters that MR-I reports keep up to date (distance, operating
// hours, engine hours, calendar days). A unit is Overdue when a counter has reached its interval,
// Due soon when it has reached the warning value. The due date is estimated from the average use
// per day since the last reset (calendar days simply count down).

const TYPE_LABEL: Record<string, string> = { KM: "Distance (km)", OH: "Operating hours", EH: "Engine hours", CA: "Calendar days" };
type Status = "Overdue" | "Due soon" | "OK";
const STATUS_COLOR: Record<Status, string> = { Overdue: "var(--danger)", "Due soon": "var(--warn)", OK: "var(--success)" };
const HORIZON = 30;

interface TriggerCalc { t: MriDashTrigger; running: number; pct: number; status: Status; perDay: number | null; daysToDue: number | null; dueAt: number | null }

function calc(t: MriDashTrigger, now: number): TriggerCalc {
  const sinceDays = t.last_reset_at != null ? Math.max(0, (now - t.last_reset_at) / DAY) : null;
  const running = t.trigger_type === "CA" && sinceDays != null ? Math.floor(sinceDays) : t.running_value;
  const pct = t.interval_value > 0 ? Math.round((running / t.interval_value) * 1000) / 10 : 0;
  const status: Status = running >= t.interval_value ? "Overdue" : t.warning_value > 0 && running >= t.warning_value ? "Due soon" : "OK";
  const perDay = t.trigger_type === "CA" ? 1 : sinceDays != null && sinceDays >= 1 && running > 0 ? running / sinceDays : null;
  const remaining = Math.max(0, t.interval_value - running);
  const daysToDue = status === "Overdue" ? 0 : perDay ? Math.ceil(remaining / perDay) : null;
  return { t, running, pct, status, perDay, daysToDue, dueAt: daysToDue == null ? null : now + daysToDue * DAY };
}
const worst = (l: TriggerCalc[]): Status => (l.some((c) => c.status === "Overdue") ? "Overdue" : l.some((c) => c.status === "Due soon") ? "Due soon" : "OK");

function useForecast(assets: MriDashboardAsset[], level: string) {
  const { triggers, unitOf, isLoading, error } = useMore(assets);
  const units = useMemo(() => {
    const now = nowSecs();
    const m = new Map<number, TriggerCalc[]>();
    triggers.filter((t) => t.mr_level === level && t.interval_value > 0).forEach((t) => m.set(t.asset_id, [...(m.get(t.asset_id) ?? []), calc(t, now)]));
    return [...m.entries()].map(([id, l]) => {
      const due = l.map((c) => c.daysToDue).filter((x): x is number => x != null);
      return { asset: unitOf.get(id)!, calcs: l, status: worst(l), pct: Math.max(...l.map((c) => c.pct)), daysToDue: due.length ? Math.min(...due) : null };
    }).filter((u) => u.asset && u.asset.active);
  }, [triggers, unitOf, level]);
  return { units, isLoading, error, noTriggers: assets.filter((a) => a.active).length - units.length };
}

export function DueForecastMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { units } = useForecast(assets, "MR-II");
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item" style={{ color: "var(--danger)" }}>Overdue <b>{units.filter((u) => u.status === "Overdue").length}</b></span>
      <span className="mrid-mini-item">Due soon <b>{units.filter((u) => u.status === "Due soon").length}</b></span>
      <span className="mrid-mini-item">Next {HORIZON} days <b>{units.filter((u) => u.daysToDue != null && u.daysToDue <= HORIZON).length}</b></span>
    </div>
  );
}

type Pick = "overdue" | "soon" | "horizon" | "nodata" | null;

export default function DueForecast({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const [level, setLevel] = useState<"MR-II" | "MR-III">("MR-II");
  const { units, isLoading, error, noTriggers } = useForecast(assets, level);
  const [pick, setPick] = useState<Pick>(null);
  const [openUnit, setOpenUnit] = useState<number | null>(null);
  const [showReports, setShowReports] = useState<number | null>(null);

  const overdue = units.filter((u) => u.status === "Overdue");
  const soon = units.filter((u) => u.status === "Due soon");
  const horizon = units.filter((u) => u.daysToDue != null && u.daysToDue <= HORIZON);
  const nodata = units.filter((u) => u.daysToDue == null);

  const list = units
    .filter((u) => (pick !== "overdue" || u.status === "Overdue") && (pick !== "soon" || u.status === "Due soon") && (pick !== "horizon" || (u.daysToDue != null && u.daysToDue <= HORIZON)) && (pick !== "nodata" || u.daysToDue == null))
    .sort((a, b) => (a.daysToDue ?? Infinity) - (b.daysToDue ?? Infinity) || b.pct - a.pct);
  const chart = [...units].sort((a, b) => b.pct - a.pct).slice(0, 20).map((u) => ({ id: u.asset.id, name: u.asset.asset_code, pct: Math.min(u.pct, 150), real: u.pct, status: u.status }));

  // ---- fluid layer ----
  const story: StoryLine[] = [];
  {
    if (overdue.length) story.push({ tone: "attention", text: <><b>{overdue.length}</b> unit{overdue.length === 1 ? " is" : "s are"} overdue for {level}: <b>{overdue.slice(0, 3).map((u) => u.asset.asset_code).join(", ")}</b>{overdue.length > 3 ? ` and ${overdue.length - 3} more` : ""}.</> });
    const next = units.filter((u) => u.status !== "Overdue" && u.daysToDue != null).sort((a, b) => a.daysToDue! - b.daysToDue!)[0];
    if (next) story.push({ tone: next.daysToDue! <= HORIZON ? "worse" : "info", text: <>Next due: <b>{next.asset.asset_code}</b>, in about {next.daysToDue} day{next.daysToDue === 1 ? "" : "s"} ({fmtDate(nowSecs() + next.daysToDue! * DAY)}).</> });
    if (horizon.length) story.push({ tone: "info", text: <>{horizon.length} unit{horizon.length === 1 ? "" : "s"} should need {level} within {HORIZON} days. Plan workshop time and parts now.</> });
    if (!units.length) story.push({ tone: "info", text: <>No units have {level} triggers switched on.</> });
  }

  const exportTables = () => [
    { name: "Summary", rows: [
      { Measure: `${level} overdue`, Units: overdue.length }, { Measure: `${level} due soon (warning reached)`, Units: soon.length },
      { Measure: `${level} expected within ${HORIZON} days`, Units: horizon.length }, { Measure: "No usage yet to estimate a date", Units: nodata.length },
      { Measure: `Active units without ${level} triggers`, Units: noTriggers },
    ] },
    { name: "Units", rows: list.map((u) => ({ Unit: u.asset.asset_code, Country: u.asset.country, "Equipment type": u.asset.asset_type, Status: u.status, "Highest % used": u.pct, "Days to due (estimate)": u.daysToDue, "Estimated due date": u.daysToDue != null ? fmtDate(nowSecs() + u.daysToDue * DAY) : null })) },
    { name: "Counters", rows: list.flatMap((u) => u.calcs.map((c) => ({ Unit: u.asset.asset_code, Counter: TYPE_LABEL[c.t.trigger_type] ?? c.t.trigger_type, Running: c.running, "Warning at": c.t.warning_value, Interval: c.t.interval_value, "% used": c.pct, "Use per day": c.perDay != null ? Math.round(c.perDay * 10) / 10 : null, Status: c.status, "Estimated due": fmtDate(c.dueAt), "Last reset": fmtDate(c.t.last_reset_at) }))) },
  ];

  const loading = Loading({ isLoading, error });
  if (loading) return loading;

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">How close each unit is to its next {level}, from the counters MR-I reports keep up to date. Dates are estimates from the average use per day since the last reset. Shown as it is <b>now</b>.</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="mrid-tabs">
            {(["MR-II", "MR-III"] as const).map((l) => <button key={l} type="button" className={level === l ? "is-on" : ""} onClick={() => { setLevel(l); setPick(null); }}>{l}</button>)}
          </div>
          <ExportMenu dashboardNo={13} title={`${level} due forecast`} filters={filters} tables={exportTables} periodApplies={false} />
        </div>
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        <Tile k="overdue" pick={pick} setPick={setPick} color="var(--danger)" label="Overdue" value={overdue.length} sub="A counter has reached its interval" />
        <Tile k="soon" pick={pick} setPick={setPick} color="var(--warn)" label="Due soon" value={soon.length} sub="A counter has reached its warning value" />
        <Tile k="horizon" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label={`Expected within ${HORIZON} days`} value={horizon.length} sub="Estimated from use so far (includes overdue)" />
        <Tile k="nodata" pick={pick} setPick={setPick} color="var(--text-soft)" label="Not enough use to estimate" value={nodata.length} sub={`${noTriggers} active unit${noTriggers === 1 ? " has" : "s have"} no ${level} triggers set`} />
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>% of the {level} interval used{units.length > 20 ? " (top 20)" : ""}</h3></div>
        {chart.length === 0 ? <p className="mrid-note">No units have {level} triggers switched on.</p> : (
          <>
            <div style={{ width: "100%", height: Math.max(130, chart.length * 32 + 50) }}>
              <ResponsiveContainer>
                <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} tickFormatter={(v) => `${v}%`} tick={AX} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: "var(--text)", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} formatter={(_v, _n, it) => [`${(it?.payload as { real: number }).real}%`, "Used"]} />
                  <ReferenceLine x={100} stroke="var(--danger)" strokeDasharray="6 4" />
                  <Bar dataKey="pct" maxBarSize={22} cursor="pointer" onClick={(_, i) => { const c = chart[i]; if (c) { setOpenUnit(c.id); setPick(null); } }}>
                    {chart.map((c) => <Cell key={c.id} fill={STATUS_COLOR[c.status]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mrid-legend">{(Object.keys(STATUS_COLOR) as Status[]).map((s) => <span key={s}><i style={{ background: STATUS_COLOR[s] }} />{s}</span>)}</div>
            <p className="mrid-note" style={{ textAlign: "center" }}>The highest counter of each unit. Click a unit to see all its counters.</p>
          </>
        )}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Units, soonest first ({list.length})</h3></div>
        <DrillChips onClear={() => setPick(null)} chips={[pick && <b>{{ overdue: "Overdue", soon: "Due soon", horizon: `Within ${HORIZON} days`, nodata: "Not enough use" }[pick]}</b>]} />
        {list.length === 0 ? <p className="mrid-note">No units match.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Unit</th><th>Status</th><th>Highest % used</th><th>Expected due</th><th>Counters</th></tr></thead>
            <tbody>{list.map((u) => (
              <Fragment key={u.asset.id}>
                <tr className="mrid-click" onClick={() => setOpenUnit((v) => (v === u.asset.id ? null : u.asset.id))} style={openUnit === u.asset.id ? { outline: "2px solid var(--accent)" } : undefined}>
                  <td><b>{u.asset.asset_code}</b><div className="mrid-soft">{u.asset.asset_type ?? ""}{u.asset.country ? ` · ${u.asset.country}` : ""}</div></td>
                  <td><span className="mrid-sev" style={{ color: STATUS_COLOR[u.status], fontWeight: 600 }}><i className="mrid-dot" style={{ background: STATUS_COLOR[u.status] }} />{u.status}</span></td>
                  <td>{u.pct}%</td>
                  <td>{u.status === "Overdue" ? <span className="mrid-over">Now</span> : u.daysToDue != null ? <>{fmtDate(nowSecs() + u.daysToDue * DAY)}<div className="mrid-soft">in about {u.daysToDue} day{u.daysToDue === 1 ? "" : "s"}</div></> : <span className="mrid-soft">Not enough use yet</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}><span className="mrid-caret">{openUnit === u.asset.id ? "▾" : "▸"}</span> {u.calcs.length} counter{u.calcs.length === 1 ? "" : "s"}</td>
                </tr>
                {openUnit === u.asset.id && (
                  <tr className="mrid-expand"><td colSpan={5}>
                    <table className="mrid-table mrid-subtable">
                      <thead><tr><th>Counter</th><th>Running</th><th>Warning at</th><th>Interval</th><th>Used</th><th>Use per day</th><th>Estimated due</th><th>Last reset</th></tr></thead>
                      <tbody>{u.calcs.map((c) => (
                        <tr key={c.t.trigger_type}>
                          <td>{TYPE_LABEL[c.t.trigger_type] ?? c.t.trigger_type}</td><td><b>{c.running.toLocaleString()}</b></td><td>{c.t.warning_value ? c.t.warning_value.toLocaleString() : "—"}</td><td>{c.t.interval_value.toLocaleString()}</td>
                          <td style={{ color: STATUS_COLOR[c.status], fontWeight: 600 }}>{c.pct}%</td>
                          <td>{c.perDay != null ? Math.round(c.perDay * 10) / 10 : "—"}</td>
                          <td>{c.status === "Overdue" ? <span className="mrid-over">Now</span> : fmtDate(c.dueAt)}</td><td>{fmtDate(c.t.last_reset_at)}</td>
                        </tr>))}</tbody>
                    </table>
                    <button type="button" className="ghost mrid-more" style={{ marginTop: 8 }} onClick={() => setShowReports((v) => (v === u.asset.id ? null : u.asset.id))}>{showReports === u.asset.id ? "Hide" : "Show"} MR-I reports</button>
                    {showReports === u.asset.id && <UnitReports assetId={u.asset.id} />}
                  </td></tr>
                )}
              </Fragment>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
