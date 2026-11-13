import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { firstFoundMap, fmtDate, sevKey, SEVERITIES, useMriDashboardFaults, type DashboardFilters, type MriDashboardAsset, type MriDashboardFault } from "../hooks/useMriDashboards";
import ExportMenu from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { AX, DrillChips, inRange, Loading, monthsFor, period, Tile, TT } from "./kit";
import { Sparkline, StoryStrip, TrendDelta, type StoryLine } from "./fluid";

// Dashboard 9: Repeat faults.
// New faults found in the period (a fault carried to a later report is not counted again),
// grouped by inspection item: which items fail most, on how many units, and which faults
// came back on the same unit after an earlier one on that item was closed.

type Sev = "Critical" | "Moderate" | "Minor";
const keyOf = (f: MriDashboardFault) => `${f.asset_id}|${f.component ?? ""}|${f.item ?? ""}`;

function useRepeat(assets: MriDashboardAsset[], s: number, e: number) {
  const { data = [], isLoading, error } = useMriDashboardFaults();
  const ids = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  return useMemo(() => {
    const all = data.filter((f) => ids.has(f.asset_id));
    const first = firstFoundMap(all);
    const fresh = all.filter((f) => inRange(f.found_at, s, e) && (first.get(f.result_id) ?? f.found_at) === f.found_at);
    const closedBefore = (f: MriDashboardFault) =>
      all.find((g) => g.result_id !== f.result_id && keyOf(g) === keyOf(f) && g.state === "Closed" && g.ended_at != null && f.found_at != null && g.ended_at <= f.found_at);
    const cameBack = new Map<number, MriDashboardFault>();
    fresh.forEach((f) => { const g = closedBefore(f); if (g) cameBack.set(f.result_id, g); });
    return { fresh, cameBack, isLoading, error };
  }, [data, ids, s, e, isLoading, error]);
}

export function RepeatFaultsMini({ assets }: { assets: MriDashboardAsset[] }) {
  const d = new Date();
  const s = Math.floor(new Date(d.getFullYear() - 1, d.getMonth() + 1, 1).getTime() / 1000), e = Math.floor(Date.now() / 1000) + 1;
  const { fresh, cameBack } = useRepeat(assets, s, e);
  const counts = new Map<string, number>();
  fresh.forEach((f) => counts.set(f.item ?? "—", (counts.get(f.item ?? "—") ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item" title="Last 12 months">Most often: <b>{top ? `${top[0]} (${top[1]})` : "—"}</b></span>
      <span className="mrid-mini-item" title="Last 12 months">Came back <b>{cameBack.size}</b></span>
    </div>
  );
}

type Pick = "all" | "multi" | "back" | null;

export default function RepeatFaults({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { fresh, cameBack, isLoading, error } = useRepeat(assets, p.s, p.e);
  // ---- fluid layer: new faults and come-backs per month ----
  const months = useMemo(() => monthsFor(p.from, p.to), [p.from.getTime(), p.to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const span = useRepeat(assets, months[0]?.s ?? p.s, months[months.length - 1]?.e ?? p.e);
  const perMonth = months.map((m) => ({ name: m.name, n: span.fresh.filter((f) => inRange(f.found_at, m.s, m.e)).length, back: span.fresh.filter((f) => inRange(f.found_at, m.s, m.e) && span.cameBack.has(f.result_id)).length }));
  const pmPrev = perMonth.length > 1 ? perMonth[perMonth.length - 2] : null, pmLast = perMonth.length ? perMonth[perMonth.length - 1] : null;
  const unitOf = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const [pick, setPick] = useState<Pick>(null);
  const [itemPick, setItemPick] = useState<string | null>(null);
  const clearAll = () => { setPick(null); setItemPick(null); };
  const itemName = (f: MriDashboardFault) => f.item?.trim() || "Item not named";

  const items = useMemo(() => {
    const m = new Map<string, { faults: MriDashboardFault[]; units: Set<number>; back: number } & Record<Sev, number>>();
    for (const f of fresh) {
      const k = itemName(f);
      const r = m.get(k) ?? { faults: [], units: new Set<number>(), back: 0, Critical: 0, Moderate: 0, Minor: 0 };
      r.faults.push(f);
      r.units.add(f.asset_id);
      r[sevKey(f.severity)]++;
      if (cameBack.has(f.result_id)) r.back++;
      m.set(k, r);
    }
    return [...m.entries()].map(([name, r]) => ({ name, count: r.faults.length, units: r.units.size, back: r.back, Critical: r.Critical, Moderate: r.Moderate, Minor: r.Minor, faults: r.faults }))
      .sort((a, b) => b.count - a.count || b.units - a.units || a.name.localeCompare(b.name));
  }, [fresh, cameBack]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownItems = items.filter((i) => (pick !== "multi" || i.units >= 2) && (pick !== "back" || i.back > 0));
  const chart = shownItems.slice(0, 15).map((i) => ({ name: i.name, Critical: i.Critical, Moderate: i.Moderate, Minor: i.Minor }));
  const occ = fresh
    .filter((f) => (itemPick == null || itemName(f) === itemPick) && (pick !== "back" || cameBack.has(f.result_id)) && (pick !== "multi" || (items.find((i) => i.name === itemName(f))?.units ?? 0) >= 2))
    .sort((a, b) => (b.found_at ?? 0) - (a.found_at ?? 0));
  const showOcc = itemPick != null || pick === "back";
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);

  const story: StoryLine[] = [];
  {
    if (items[0]) story.push({ tone: items[0].count > 1 ? "attention" : "info", text: <><b>{items[0].name}</b> fails most often: {items[0].count} time{items[0].count === 1 ? "" : "s"} on {items[0].units} unit{items[0].units === 1 ? "" : "s"} in {p.label}.</> });
    if (cameBack.size) {
      const f = [...cameBack.keys()].map((id) => fresh.find((x) => x.result_id === id)!).filter(Boolean)[0];
      story.push({ tone: "worse", text: <>{cameBack.size} fault{cameBack.size === 1 ? "" : "s"} came back after a fix{f ? <>, for example <b>{f.item}</b> on {code(f.asset_id)}</> : null}. Worth checking the repair quality.</> });
    }
    const multi = items.filter((i) => i.units >= 2);
    if (multi.length) story.push({ tone: "info", text: <><b>{multi[0].name}</b> failed on {multi[0].units} different units, which may point to a common cause.</> });
    if (!fresh.length) story.push({ tone: "better", text: <>No new faults were found in {p.label}.</> });
  }

  const exportTables = () => [
    { name: "Items", rows: shownItems.map((i) => ({ Item: i.name, "Times failed": i.count, Units: i.units, "Came back after a fix": i.back, Critical: i.Critical, Moderate: i.Moderate, Minor: i.Minor })) },
    { name: "Faults", rows: occ.map((f) => { const g = cameBack.get(f.result_id); return { Item: itemName(f), Unit: code(f.asset_id), Component: f.component, Severity: sevKey(f.severity), Issue: f.issue_details, Found: fmtDate(f.found_at), "Came back after a fix": g ? `Yes (closed ${fmtDate(g.ended_at)} on report #${g.report_id})` : "No", Report: `#${f.report_id}` }; }) },
  ];

  const loading = Loading({ isLoading, error });
  if (loading) return loading;

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">New faults found in <b>{p.label}</b>, by inspection item. "Came back" means the same item on the same unit had a fault that was closed before.</p>
        <ExportMenu dashboardNo={9} title="Repeat faults" filters={filters} tables={exportTables} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        <Tile k="all" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="New faults found" value={fresh.length} sub={`on ${items.length} different item${items.length === 1 ? "" : "s"}`}
          extra={<><TrendDelta now={pmLast?.n ?? null} prev={pmPrev?.n ?? null} label={pmPrev ? `${pmLast?.name}${(pmLast && Date.now() / 1000 < (months[months.length - 1]?.e ?? 0) ? " so far" : "")} vs ${pmPrev.name}` : ""} /><Sparkline values={perMonth.map((m) => m.n)} color="var(--accent-blue, #2f6fed)" title="New faults per month" /></>} />
        <Tile k="multi" pick={pick} setPick={setPick} color="var(--warn)" label="Items failing on 2+ units" value={items.filter((i) => i.units >= 2).length} sub="May point to a common cause" />
        <Tile k="back" pick={pick} setPick={setPick} color="var(--danger)" label="Came back after a fix" value={cameBack.size} sub="Same item, same unit, after an earlier fault was closed"
          extra={<Sparkline values={perMonth.map((m) => m.back)} color="var(--danger)" title="Faults that came back, per month" />} />
        <div className="mrid-kpi" style={{ ["--kpi" as string]: "var(--text-soft)" }}>
          <div className="mrid-kpi-head"><span>Fails most often</span></div>
          <div className="mrid-kpi-value" style={{ fontSize: 20 }}>{items[0]?.name ?? "—"}</div>
          <div className="mrid-kpi-sub">{items[0] ? `${items[0].count} time${items[0].count === 1 ? "" : "s"} on ${items[0].units} unit${items[0].units === 1 ? "" : "s"}` : "No faults in this period"}</div>
        </div>
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Items that fail most often{shownItems.length > 15 ? " (top 15)" : ""}</h3></div>
        {chart.length === 0 ? <p className="mrid-note">No faults match.</p> : (
          <>
            <div style={{ width: "100%", height: Math.max(130, chart.length * 32 + 50) }}>
              <ResponsiveContainer>
                <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" allowDecimals={false} tick={AX} />
                  <YAxis type="category" dataKey="name" width={220} tick={{ fill: "var(--text)", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} />
                  {SEVERITIES.map((s) => (
                    <Bar key={s.key} dataKey={s.key} stackId="s" fill={s.color} maxBarSize={22} cursor="pointer" onClick={(_, i) => setItemPick(chart[i]?.name ?? null)} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mrid-legend">{SEVERITIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.key}</span>)}</div>
            <p className="mrid-note" style={{ textAlign: "center" }}>Click an item to see every fault on it.</p>
          </>
        )}
      </div>

      {showOcc && (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>Faults ({occ.length})</h3></div>
          <DrillChips onClear={clearAll} chips={[itemPick && <>Item: <b>{itemPick}</b></>, pick === "back" && <b>Came back after a fix</b>, pick === "multi" && <b>Items on 2+ units</b>]} />
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Item</th><th>Unit</th><th>Severity</th><th>Issue</th><th>Found</th><th>Came back?</th><th>MR-I report</th></tr></thead>
            <tbody>{occ.map((f) => { const g = cameBack.get(f.result_id); return (
              <tr key={f.result_id}>
                <td>{itemName(f)}</td><td><b>{code(f.asset_id)}</b>{f.component ? <span className="mrid-soft"> · {f.component}</span> : null}</td>
                <td><span className="mrid-sev"><i className="mrid-dot" style={{ background: SEVERITIES.find((s) => s.key === sevKey(f.severity))!.color }} />{sevKey(f.severity)}</span></td>
                <td className="mrid-soft">{f.issue_details ?? "—"}</td><td>{fmtDate(f.found_at)}</td>
                <td>{g ? <span className="mrid-over">Yes · fixed {fmtDate(g.ended_at)} <PreviewButton reportId={g.report_id} label={`Earlier #${g.report_id}`} /></span> : "No"}</td>
                <td><PreviewButton reportId={f.report_id} /></td>
              </tr>); })}</tbody>
          </table></div>
        </div>
      )}

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>All items ({shownItems.length})</h3></div>
        {!showOcc && <DrillChips onClear={clearAll} chips={[pick === "multi" && <b>Items on 2+ units</b>]} />}
        {shownItems.length === 0 ? <p className="mrid-note">No faults match.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Item</th><th>Times failed</th><th>Units</th><th>Came back</th><th>Critical</th><th>Moderate</th><th>Minor</th></tr></thead>
            <tbody>{shownItems.map((i) => (
              <tr key={i.name} className="mrid-click" onClick={() => setItemPick(i.name)} style={itemPick === i.name ? { outline: "2px solid var(--accent)" } : undefined}>
                <td><b>{i.name}</b></td><td>{i.count}</td><td>{i.units}</td><td className={i.back ? "mrid-over" : undefined}>{i.back}</td><td>{i.Critical}</td><td>{i.Moderate}</td><td>{i.Minor}</td>
              </tr>))}</tbody>
          </table><p className="mrid-note">Click an item to see its faults.</p></div>
        )}
      </div>
    </div>
  );
}
