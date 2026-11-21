import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { invoke } from "../../../lib/ipc";
import {
  firstFoundMap,
  fmtDate,
  sevKey,
  sevLabel,
  SEVERITIES,
  useMriDashboardFaults,
  type DashboardFilters,
  type MriDashboardAsset,
  type MriDashboardFault,
} from "../hooks/useMriDashboards";
import ExportMenu, { type ExportTable } from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { AX, inRange, Loading, monthsFor, period, TT } from "./kit";
import { Sparkline, StoryStrip, TrendDelta, type StoryLine } from "./fluid";
import { Num, chartAnim } from "../fluent/motion";
import { useAdvanced } from "../dashMode";
import Chart3D, { use3DMode, ViewToggle, type Cell3D } from "../fluent/Chart3D";

// Dashboard 19: Fault trends by equipment ("Recurring Issues" request, 20 Nov 2026).
// Faults recorded on MR-I reports, counted by equipment type, with a drill-down:
//   equipment type -> its units (fixed assets) -> one unit, checklist item by checklist item.
// Each level compares the period with the same period one year earlier.
// Counting follows Dashboard 9: a fault is counted once, when the report that first found it was
// submitted (a fault carried forward to a later report is not counted again).
// Recurring = the same checklist item failed 2+ times on the same unit in the period.
// Needs investigation = a unit with at least 3 faults and 1.5x its type's average, or 2+ recurring items.

const NO_TYPE = "Type not set";
const PREV = "#b9c8e6";
const CUR = "var(--accent-blue, #2f6fed)";
const typeOf = (a: MriDashboardAsset | undefined) => a?.asset_type?.trim() || NO_TYPE;
const itemOf = (f: MriDashboardFault) => f.item?.trim() || "Item not named";
const yearBack = (secs: number) => { const d = new Date(secs * 1000); d.setFullYear(d.getFullYear() - 1); return Math.floor(d.getTime() / 1000); };
const pct = (now: number, prev: number) => (prev ? Math.round(((now - prev) / prev) * 100) : null);
const chgTxt = (now: number, prev: number) => { const p = pct(now, prev); return p == null ? (now ? "new" : "—") : `${p > 0 ? "+" : ""}${p}%`; };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

interface UnitRow { asset: MriDashboardAsset; cur: MriDashboardFault[]; prev: MriDashboardFault[]; recurring: string[]; top: string | null; last: number | null; attention: boolean }
interface TypeRow { type: string; units: UnitRow[]; cur: number; prev: number; recurring: number; attention: number; avg: number; topItem: string | null; topCount: number; monthly: number[] }

/** Checklist items on the active MR-I templates, by equipment type (for "no fault in 24 months"). */
function useTemplateItems() {
  return useQuery({
    queryKey: ["dash19-template-items"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [templates, types, bank] = await Promise.all([
        invoke<{ id: number; asset_type_id: number; status: string }[]>("get_mri_templates"),
        invoke<{ id: number; description: string }[]>("get_asset_types"),
        invoke<{ id: number; description: string }[]>("get_checklist_items"),
      ]);
      const typeName = new Map(types.map((t) => [t.id, t.description.trim()]));
      const desc = new Map(bank.map((c) => [c.id, c.description.trim()]));
      const out = new Map<string, Set<string>>();
      for (const t of templates.filter((x) => !/archiv|inactive|draft/i.test(x.status))) {
        const name = typeName.get(t.asset_type_id); if (!name) continue;
        const its = await invoke<{ checklist_item_id: number }[]>("get_template_checklist_items", { templateId: t.id });
        const set = out.get(name) ?? new Set<string>();
        its.forEach((i) => { const d = desc.get(i.checklist_item_id); if (d) set.add(d); });
        out.set(name, set);
      }
      return out;
    },
  });
}

function useTrends(assets: MriDashboardAsset[], filters: DashboardFilters) {
  const { data = [], isLoading, error } = useMriDashboardFaults();
  const p = period(filters);
  const ps = yearBack(p.s), pe = yearBack(p.e);
  return useMemo(() => {
    const ids = new Set(assets.map((a) => a.id));
    const all = data.filter((f) => ids.has(f.asset_id));
    const first = firstFoundMap(all);
    const isNew = (f: MriDashboardFault) => (first.get(f.result_id) ?? f.found_at) === f.found_at;
    const fresh = all.filter(isNew);
    const cur = fresh.filter((f) => inRange(f.found_at, p.s, p.e));
    const prev = fresh.filter((f) => inRange(f.found_at, ps, pe));
    return { all, fresh, cur, prev, isLoading, error };
  }, [data, assets, p.s, p.e, ps, pe, isLoading, error]);
}

function build(assets: MriDashboardAsset[], cur: MriDashboardFault[], prev: MriDashboardFault[], months: { s: number; e: number }[], fresh: MriDashboardFault[] = []): TypeRow[] {
  const byAsset = (l: MriDashboardFault[]) => { const m = new Map<number, MriDashboardFault[]>(); l.forEach((f) => m.set(f.asset_id, [...(m.get(f.asset_id) ?? []), f])); return m; };
  const ca = byAsset(cur), pa = byAsset(prev);
  const types = new Map<string, MriDashboardAsset[]>();
  assets.forEach((a) => types.set(typeOf(a), [...(types.get(typeOf(a)) ?? []), a]));
  const rows: TypeRow[] = [];
  for (const [type, list] of types) {
    const units: UnitRow[] = list.map((asset) => {
      const c = ca.get(asset.id) ?? [], pv = pa.get(asset.id) ?? [];
      const cnt = new Map<string, number>(); c.forEach((f) => cnt.set(itemOf(f), (cnt.get(itemOf(f)) ?? 0) + 1));
      const sorted = [...cnt.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
      return { asset, cur: c, prev: pv, recurring: sorted.filter(([, n]) => n >= 2).map(([k]) => k), top: sorted[0]?.[0] ?? null,
        last: c.reduce<number | null>((m, f) => (f.found_at != null && (m == null || f.found_at > m) ? f.found_at : m), null), attention: false };
    });
    const total = units.reduce((s, u) => s + u.cur.length, 0);
    const avg = units.length ? total / units.length : 0;
    units.forEach((u) => { u.attention = (u.cur.length >= 3 && u.cur.length >= avg * 1.5 && units.length > 1) || u.recurring.length >= 2; });
    units.sort((x, y) => y.cur.length - x.cur.length || x.asset.asset_code.localeCompare(y.asset.asset_code));
    const items = new Map<string, number>(); units.forEach((u) => u.cur.forEach((f) => items.set(itemOf(f), (items.get(itemOf(f)) ?? 0) + 1)));
    const top = [...items.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];
    rows.push({
      type, units, cur: total, prev: units.reduce((s, u) => s + u.prev.length, 0), avg,
      recurring: units.reduce((s, u) => s + u.recurring.length, 0), attention: units.filter((u) => u.attention).length,
      topItem: top?.[0] ?? null, topCount: top?.[1] ?? 0,
      monthly: (() => { const ids = new Set(list.map((a) => a.id)); const mine = fresh.filter((f) => ids.has(f.asset_id)); return months.map((m) => mine.filter((f) => inRange(f.found_at, m.s, m.e)).length / Math.max(units.length, 1)); })(),
    });
  }
  return rows.sort((x, y) => y.cur - x.cur || x.type.localeCompare(y.type));
}

export function FaultTrendsMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { data = [] } = useMriDashboardFaults();
  const res = useMemo(() => {
    const ids = new Set(assets.map((a) => a.id));
    const all = data.filter((f) => ids.has(f.asset_id));
    const first = firstFoundMap(all);
    const d = new Date();
    const s = Math.floor(new Date(d.getFullYear() - 1, d.getMonth() + 1, 1).getTime() / 1000);
    const cur = all.filter((f) => (first.get(f.result_id) ?? f.found_at) === f.found_at && inRange(f.found_at, s, Math.floor(Date.now() / 1000) + 1));
    const rows = build(assets, cur, [], []);
    const worst = rows.filter((r) => r.units.length).sort((a, b) => b.cur / b.units.length - a.cur / a.units.length)[0];
    return { worst, attention: rows.reduce((n, r) => n + r.attention, 0) };
  }, [data, assets]);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item" title="Last 12 months">Most per unit: <b>{res.worst && res.worst.cur ? res.worst.type : "—"}</b></span>
      <span className="mrid-mini-item" title="Last 12 months">Needs attention <b>{res.attention}</b></span>
    </div>
  );
}

export default function FaultTrends({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const adv = useAdvanced();
  const p = period(filters);
  const { cur, prev, fresh, isLoading, error } = useTrends(assets, filters);
  const tmpl = useTemplateItems();
  const [typePick, setTypePick] = useState<string | null>(null);
  const [unitPick, setUnitPick] = useState<number | null>(null);
  const [compare, setCompare] = useState(true);
  const [is3d, set3d] = use3DMode(19);
  const months = useMemo(() => monthsFor(p.from, p.to), [p.from.getTime(), p.to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const types = useMemo(() => build(assets, cur, prev, months, fresh), [assets, cur, prev, months, fresh]);

  const T = types.find((t) => t.type === typePick) ?? null;
  const U = T?.units.find((u) => u.asset.id === unitPick) ?? null;
  const level: "types" | "units" | "unit" = U ? "unit" : T ? "units" : "types";
  const goTypes = () => { setTypePick(null); setUnitPick(null); };
  const goType = (t: string) => { setTypePick(t); setUnitPick(null); };
  const prevLabel = "same period a year earlier";

  // Checklist items with no fault in the last 24 months, per equipment type.
  const quiet = useMemo(() => {
    const since = Math.floor(Date.now() / 1000) - 730 * 86400;
    const failed = new Map<string, Set<string>>();
    const typeById = new Map(assets.map((a) => [a.id, typeOf(a)]));
    fresh.filter((f) => (f.found_at ?? 0) >= since).forEach((f) => { const t = typeById.get(f.asset_id); if (!t) return; const s = failed.get(t) ?? new Set<string>(); s.add(itemOf(f)); failed.set(t, s); });
    const out: { type: string; item: string }[] = [];
    for (const t of types) {
      const all = tmpl.data?.get(t.type); if (!all) continue;
      [...all].filter((i) => !failed.get(t.type)?.has(i)).sort().forEach((item) => out.push({ type: t.type, item }));
    }
    return out;
  }, [fresh, assets, types, tmpl.data]);

  const loading = Loading({ isLoading, error });
  if (loading) return loading;

  const totCur = types.reduce((s, t) => s + t.cur, 0), totPrev = types.reduce((s, t) => s + t.prev, 0);
  const totUnits = types.reduce((s, t) => s + t.units.length, 0);
  const perUnit = (t: TypeRow) => (t.units.length ? t.cur / t.units.length : 0);
  const worst = types.filter((t) => t.units.length && t.cur).sort((a, b) => perUnit(b) - perUnit(a))[0];
  const code = (u: UnitRow) => u.asset.asset_code;

  // ---------- story ----------
  const story: StoryLine[] = [];
  if (level === "types") {
    if (worst) story.push({ tone: "attention", text: <><b>{worst.type}</b> units have the most faults per unit ({perUnit(worst).toFixed(1)}).{worst.attention ? <> {worst.attention} of {worst.units.length} need investigation.</> : null}</> });
    const common = types.filter((t) => t.topItem && t.units.filter((u) => u.cur.some((f) => itemOf(f) === t.topItem)).length >= 2)[0];
    if (common) story.push({ tone: "info", text: <><b>{common.topItem}</b> fails most often on {common.type} units ({common.topCount} times on {common.units.filter((u) => u.cur.some((f) => itemOf(f) === common.topItem)).length} units). This may point to a common cause.</> });
    if (totPrev || totCur) story.push({ tone: totCur > totPrev ? "worse" : "better", text: <>{totCur} faults in {p.label}, against {totPrev} in the {prevLabel} ({chgTxt(totCur, totPrev)}).</> });
    if (!totCur) story.push({ tone: "better", text: <>No new faults were found in {p.label}.</> });
  } else if (level === "units" && T) {
    const att = T.units.filter((u) => u.attention);
    if (att[0]) story.push({ tone: "attention", text: <><b>{code(att[0])}</b> has {plural(att[0].cur.length, "fault")}, against {T.avg.toFixed(1)} on an average {T.type} unit{att[0].recurring.length ? <>, and {plural(att[0].recurring.length, "recurring item")}</> : null}.</> });
    if (T.topItem) { const n = T.units.filter((u) => u.cur.some((f) => itemOf(f) === T.topItem)).length; story.push({ tone: n >= 2 ? "info" : "attention", text: <><b>{T.topItem}</b> failed on {n} of {T.units.length} units. {n >= 2 ? "Check whether the cause is common (procedure, parts or design)." : ""}</> }); }
    story.push({ tone: T.cur > T.prev ? "worse" : "better", text: <>Faults on {T.type} units: {T.cur} in {p.label}, {T.prev} in the {prevLabel} ({chgTxt(T.cur, T.prev)}).</> });
  } else if (U && T) {
    if (U.recurring.length) story.push({ tone: "attention", text: <><b>{U.recurring.join(", ")}</b> failed more than once on this unit. Look for the root cause before the next job.</> });
    const both = [...new Set(U.cur.map(itemOf))].filter((i) => U.prev.some((f) => itemOf(f) === i));
    if (both.length) story.push({ tone: "info", text: <><b>{both.slice(0, 3).join(", ")}</b> also failed in the {prevLabel}.</> });
    story.push({ tone: U.cur.length > U.prev.length ? "worse" : "better", text: <>{plural(U.cur.length, "fault")} in {p.label}, against {U.prev.length} in the {prevLabel}.</> });
  }

  // ---------- export ----------
  const exportTables = (): ExportTable[] => {
    if (level === "types") return [
      { name: "Equipment types", rows: types.map((t) => ({ "Equipment type": t.type, Units: t.units.length, Faults: t.cur, "Year before": t.prev, Change: chgTxt(t.cur, t.prev), "Per unit": Number(perUnit(t).toFixed(1)), Recurring: t.recurring, "Fails most often": t.topItem ?? "", "Needs attention": t.attention })) },
      { name: "No fault in 24 months", rows: quiet.map((q) => ({ "Equipment type": q.type, "Checklist item": q.item })) },
    ];
    if (level === "units" && T) return [{ name: T.type.slice(0, 31), rows: T.units.map((u) => ({ "Fixed asset code": code(u), Description: u.asset.asset_description ?? "", Tag: u.asset.tag_status ?? "", Faults: u.cur.length, "Year before": u.prev.length, "Recurring items": u.recurring.join("; "), "Fails most often": u.top ?? "", "Last fault": fmtDate(u.last), "Needs investigation": u.attention ? "Yes" : "No" })) }];
    if (U) return [{ name: code(U).slice(0, 31), rows: [...U.cur].sort((a, b) => (b.found_at ?? 0) - (a.found_at ?? 0)).map((f) => ({ Found: fmtDate(f.found_at), "MR-I report": f.report_id, Component: f.component ?? "", "Checklist item": itemOf(f), Severity: sevLabel(sevKey(f.severity)), Issue: f.issue_details ?? "", Status: f.state })) }];
    return [];
  };

  const crumbs = (
    <div className="mrid-crumbs">
      {level === "types" ? <b>All equipment types</b> : <button type="button" onClick={goTypes}>All equipment types</button>}
      {T && <><span className="sep">›</span>{U ? <button type="button" onClick={() => setUnitPick(null)}>{T.type}</button> : <b>{T.type}</b>}</>}
      {U && <><span className="sep">›</span><b>{code(U)}{U.asset.asset_description ? ` · ${U.asset.asset_description}` : ""}</b></>}
    </div>
  );
  const kpi = (label: string, value: ReactNode, sub: ReactNode, color: string, extra?: ReactNode) => (
    <div className="mrid-kpi" style={{ ["--kpi" as string]: color }}>
      <div className="mrid-kpi-head"><span>{label}</span></div>
      <div className="mrid-kpi-value">{typeof value === "string" && value.length > 6 ? <span style={{ fontSize: 20, lineHeight: 1.25, display: "inline-block" }}>{value}</span> : <Num v={value} />}</div>
      {extra}
      <div className="mrid-kpi-sub">{sub}</div>
    </div>
  );
  const cmpToggle = <label className="mrid-toggle"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with the {prevLabel}</label>;

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Faults recorded on MR-I reports in <b>{p.label}</b>, by equipment type. Click a type to see its units, then a unit to see which checklist items keep failing.</p>
        <ExportMenu dashboardNo={19} title="Fault Trends by Equipment" filters={filters} tables={exportTables} />
      </div>
      {crumbs}
      <StoryStrip lines={story} />

      {level === "types" && (<>
        <div className="mrid-kpis">
          {kpi("Faults recorded", totCur, `${chgTxt(totCur, totPrev)} vs ${totPrev} in the ${prevLabel}`, CUR, <TrendDelta now={totCur} prev={totPrev} label={`vs the ${prevLabel}`} />)}
          {kpi("Recurring items", types.reduce((s, t) => s + t.recurring, 0), "Same item, same unit, 2+ times", "var(--warn)")}
          {kpi("Units needing attention", types.reduce((s, t) => s + t.attention, 0), `of ${totUnits} units`, "var(--danger)")}
          {kpi("Most faults per unit", worst?.type ?? "—", worst ? `${perUnit(worst).toFixed(1)} faults per unit` : "No faults in this period", "var(--text-soft)")}
        </div>

        {adv && (
          <div className="mrid-panel">
            <div className="mrid-panel-head"><h3>Faults by equipment type</h3>{cmpToggle}</div>
            {types.every((t) => !t.cur && !t.prev) ? <p className="mrid-note mrid-empty">No faults match.</p> : (
              <div style={{ width: "100%", height: Math.max(140, types.length * (compare ? 44 : 32) + 60) }}>
                <ResponsiveContainer>
                  <BarChart data={types.map((t) => ({ name: t.type, now: t.cur, before: t.prev }))} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" allowDecimals={false} tick={AX} />
                    <YAxis type="category" dataKey="name" width={170} tick={{ fill: "var(--text)", fontSize: 12 }} />
                    <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar {...chartAnim()} dataKey="now" name={p.label} fill={CUR} maxBarSize={18} cursor="pointer" onClick={(_, i) => goType(types[i].type)} />
                    {compare && <Bar {...chartAnim()} dataKey="before" name={`The ${prevLabel}`} fill={PREV} maxBarSize={12} cursor="pointer" onClick={(_, i) => goType(types[i].type)} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mrid-note" style={{ textAlign: "center" }}>Click a bar to see the units of that type.</p>
          </div>
        )}

        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>Equipment types ({types.length})</h3></div>
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Equipment type</th><th>Units</th><th>Faults</th><th>Year before</th><th>Change</th><th>Per unit</th><th>Recurring</th><th>Fails most often</th><th>Needs attention</th>{adv && <th>Per unit, by month</th>}</tr></thead>
            <tbody>{types.map((t) => (
              <tr key={t.type} className="mrid-click" onClick={() => goType(t.type)}>
                <td><b>{t.type}</b></td><td>{t.units.length}</td><td><b>{t.cur}</b></td><td className="mrid-soft">{t.prev}</td>
                <td className={t.cur > t.prev ? "mrid-over" : t.cur < t.prev ? "mrid-ok" : undefined}>{chgTxt(t.cur, t.prev)}</td>
                <td>{perUnit(t).toFixed(1)}</td><td>{t.recurring}</td><td>{t.topItem ? `${t.topItem} (${t.topCount})` : "—"}</td>
                <td className={t.attention ? "mrid-over" : undefined}>{t.attention ? `${t.attention} of ${t.units.length}` : "None"}</td>
                {adv && <td style={{ minWidth: 120 }}><Sparkline values={t.monthly} color={CUR} title={`${t.type}: faults per unit, per month`} /></td>}
              </tr>))}</tbody>
          </table><p className="mrid-note">Click a type to see its units.</p></div>
        </div>

        {adv && (() => {
          const shown = types.filter((t) => t.units.length);
          const mx = Math.max(0.0001, ...shown.flatMap((t) => t.monthly));
          const cube: Cell3D[] = [];
          shown.forEach((t, i) => t.monthly.forEach((v, j) => { if (v > 0) cube.push({ row: i, col: j, segs: [{ key: "f", label: "Faults per unit", value: Math.round(v * 100) / 100, color: CUR }] }); }));
          return (
            <div className="mrid-panel">
              <div className="mrid-panel-head"><h3>Faults per unit, month by month</h3><ViewToggle is3d={is3d} onChange={set3d} /></div>
              {!cube.length ? <p className="mrid-note mrid-empty">No faults in these months.</p> : is3d ? (
                <Chart3D rows={shown.map((t) => t.type)} cols={months.map((m) => m.name)} cells={cube} rowTitle="Equipment type" colTitle="Month" valueTitle="Faults per unit"
                  fmt={(v) => (Math.round(v * 10) / 10).toString()} physics onPick={(c) => goType(shown[c.row].type)} />
              ) : (
                <div className="mrid-table-wrap"><table className="mrid-table mrid-monthtable">
                  <thead><tr><th>Equipment type</th>{months.map((m) => <th key={m.name}>{m.name}</th>)}</tr></thead>
                  <tbody>{shown.map((t) => (
                    <tr key={t.type} className="mrid-click" onClick={() => goType(t.type)}><td><b>{t.type}</b></td>{t.monthly.map((v, j) => (
                      <td key={j} style={{ background: v > 0 ? `color-mix(in srgb, var(--accent-blue, #2f6fed) ${Math.round(12 + (v / mx) * 60)}%, transparent)` : undefined, color: v / mx > 0.7 ? "#fff" : undefined, fontWeight: v > 0 ? 600 : undefined }}>{v > 0 ? (Math.round(v * 10) / 10).toString() : "·"}</td>
                    ))}</tr>))}</tbody>
                </table></div>
              )}
              <p className="mrid-note">Faults per unit, so large and small fleets compare fairly. A rising row means that type is getting worse. Click a type to see its units.</p>
            </div>
          );
        })()}

        {adv && (
          <div className="mrid-panel">
            <div className="mrid-panel-head"><h3>Checklist items with no fault in the last 24 months ({quiet.length})</h3></div>
            {tmpl.isLoading ? <p className="mrid-note">Loading the checklists...</p> : tmpl.error ? <p className="mrid-note">Could not read the MR-I templates: {String(tmpl.error)}</p> : quiet.length === 0 ? <p className="mrid-note mrid-empty">Every checklist item has had at least one fault.</p> : (
              <div className="mrid-table-wrap"><table className="mrid-table">
                <thead><tr><th>Equipment type</th><th>Checklist item</th></tr></thead>
                <tbody>{quiet.slice(0, 60).map((q) => <tr key={`${q.type}|${q.item}`}><td>{q.type}</td><td>{q.item}</td></tr>)}</tbody>
              </table>{quiet.length > 60 && <p className="mrid-note">Showing 60 of {quiet.length}. Export to see them all.</p>}</div>
            )}
            <p className="mrid-note">Worth checking whether these items are still useful or need clearer wording.</p>
          </div>
        )}
      </>)}

      {level === "units" && T && (<>
        <div className="mrid-kpis">
          {kpi("Faults recorded", T.cur, `${chgTxt(T.cur, T.prev)} vs ${T.prev} in the ${prevLabel}`, CUR, <TrendDelta now={T.cur} prev={T.prev} label={`vs the ${prevLabel}`} />)}
          {kpi("Units", T.units.length, `${perUnit(T).toFixed(1)} faults per unit`, "var(--text-soft)")}
          {kpi("Recurring items", T.recurring, "Same item, same unit, 2+ times", "var(--warn)")}
          {kpi("Needs investigation", T.attention, T.attention ? T.units.filter((u) => u.attention).map(code).slice(0, 4).join(", ") : "No unit stands out", "var(--danger)")}
        </div>

        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>{T.type} units ({T.units.length})</h3>{cmpToggle}</div>
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Fixed asset code</th><th>Description</th><th>Tag</th><th style={{ minWidth: 180 }}>Faults</th><th>Now</th>{compare && <th>Year before</th>}<th>Recurring items</th><th>Fails most often</th><th>Last fault</th><th></th></tr></thead>
            <tbody>{T.units.map((u) => { const mx = Math.max(1, ...T.units.map((x) => Math.max(x.cur.length, compare ? x.prev.length : 0))); return (
              <tr key={u.asset.id} className="mrid-click" onClick={() => setUnitPick(u.asset.id)}>
                <td><b>{code(u)}</b></td><td className="mrid-soft">{u.asset.asset_description ?? "—"}</td><td>{u.asset.tag_status ?? "—"}</td>
                <td><div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ height: 9, borderRadius: 5, background: CUR, width: `${Math.max(u.cur.length ? 3 : 0, (u.cur.length / mx) * 100)}%` }} />
                  {compare && <div style={{ height: 6, borderRadius: 4, background: PREV, width: `${Math.max(u.prev.length ? 3 : 0, (u.prev.length / mx) * 100)}%` }} />}
                </div></td>
                <td><b>{u.cur.length}</b></td>{compare && <td className="mrid-soft">{u.prev.length}</td>}
                <td>{u.recurring.length ? u.recurring.join(", ") : "—"}</td><td>{u.top ?? "—"}</td><td>{fmtDate(u.last)}</td>
                <td>{u.attention && <span className="mrid-over">Needs investigation</span>}</td>
              </tr>); })}</tbody>
          </table><p className="mrid-note">Click a unit to see its faults item by item.</p></div>
        </div>

        {adv && (() => {
          const cnt = new Map<string, number>(); T.units.forEach((u) => u.cur.forEach((f) => cnt.set(itemOf(f), (cnt.get(itemOf(f)) ?? 0) + 1)));
          const its = [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([k]) => k);
          const us = T.units.filter((u) => u.cur.length).slice(0, 16);
          const shade = (n: number) => (n <= 0 ? ["transparent", "var(--text-soft)"] : n === 1 ? ["color-mix(in srgb, var(--accent-blue, #2f6fed) 22%, transparent)", "var(--text)"] : n === 2 ? ["color-mix(in srgb, var(--accent-blue, #2f6fed) 55%, transparent)", "var(--text)"] : ["var(--accent-blue, #2f6fed)", "#fff"]);
          return (
            <div className="mrid-panel">
              <div className="mrid-panel-head"><h3>Where faults repeat: checklist item × unit</h3><ViewToggle is3d={is3d} onChange={set3d} /></div>
              {!its.length ? <p className="mrid-note mrid-empty">No faults match.</p> : is3d ? (
                <>
                  <Chart3D rows={its} cols={us.map(code)} integer physics rowTitle="Checklist item" colTitle="Unit" valueTitle="Times failed"
                    fmt={(v) => String(Math.round(v))}
                    cells={its.flatMap((it, i) => us.map((u, j) => {
                      const fs = u.cur.filter((f) => itemOf(f) === it);
                      return { row: i, col: j, segs: SEVERITIES.map((sv) => ({ key: sv.key, label: sevLabel(sv.key), value: fs.filter((f) => sevKey(f.severity) === sv.key).length, color: sv.color })) };
                    }).filter((c) => c.segs.some((sg) => sg.value > 0)))}
                    onPick={(c) => setUnitPick(us[c.col].asset.id)} />
                  <div className="mrid-legend">{SEVERITIES.map((sv) => <span key={sv.key}><i style={{ background: sv.color }} />{sevLabel(sv.key)}</span>)}</div>
                </>
              ) : (
                <div className="mrid-table-wrap"><table className="mrid-table mrid-monthtable">
                  <thead><tr><th>Checklist item</th>{us.map((u) => <th key={u.asset.id}>{code(u)}</th>)}<th>Units</th></tr></thead>
                  <tbody>{its.map((it) => (
                    <tr key={it}><td>{it}</td>{us.map((u) => { const n = u.cur.filter((f) => itemOf(f) === it).length; const [bg, fg] = shade(n); return <td key={u.asset.id} className="mrid-click-cell" style={{ background: bg, color: fg, fontWeight: 600 }} onClick={() => setUnitPick(u.asset.id)}>{n || "·"}</td>; })}<td className="mrid-soft">{us.filter((u) => u.cur.some((f) => itemOf(f) === it)).length}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
              <p className="mrid-note">{is3d ? "A row of bars means many units fail the item (a common cause). One tall bar means one unit keeps failing it. Click a bar to open the unit." : "A dark row means many units fail the item (a common cause). A dark cell means one unit keeps failing it. Click a cell to open the unit."}</p>
            </div>
          );
        })()}
      </>)}

      {level === "unit" && U && T && (() => {
        const names = [...new Set([...U.cur, ...(compare ? U.prev : [])].map(itemOf))];
        const rows = names.map((n) => ({ name: n, now: U.cur.filter((f) => itemOf(f) === n).length, before: U.prev.filter((f) => itemOf(f) === n).length }))
          .sort((a, b) => b.now - a.now || b.before - a.before || a.name.localeCompare(b.name));
        const mine = fresh.filter((f) => f.asset_id === U.asset.id);
        const perMonth = months.map((m) => ({ name: m.name, now: mine.filter((f) => inRange(f.found_at, m.s, m.e)).length, before: mine.filter((f) => inRange(f.found_at, yearBack(m.s), yearBack(m.e))).length }));
        const list = [...U.cur].sort((a, b) => (b.found_at ?? 0) - (a.found_at ?? 0));
        return (<>
          <div className="mrid-kpis">
            {kpi("Faults recorded", U.cur.length, `${chgTxt(U.cur.length, U.prev.length)} vs ${U.prev.length} in the ${prevLabel}`, CUR, <TrendDelta now={U.cur.length} prev={U.prev.length} label={`vs the ${prevLabel}`} />)}
            {kpi("Items that failed", new Set(U.cur.map(itemOf)).size, tmpl.data?.get(T.type) ? `of ${tmpl.data.get(T.type)!.size} checklist items` : "different checklist items", "var(--text-soft)")}
            {kpi("Recurring items", U.recurring.length, U.recurring.length ? U.recurring.join(", ") : "None", "var(--warn)")}
            {kpi("Against an average unit", T.avg ? `${(U.cur.length / T.avg).toFixed(1)}×` : "—", `${T.avg.toFixed(1)} faults on an average ${T.type} unit`, U.attention ? "var(--danger)" : "var(--success)")}
          </div>

          <div className="mrid-panel">
            <div className="mrid-panel-head"><h3>Faults by checklist item</h3>{cmpToggle}</div>
            {!rows.length ? <p className="mrid-note mrid-empty">No faults on this unit in the period.</p> : (
              <div style={{ width: "100%", height: Math.max(140, rows.length * (compare ? 40 : 30) + 60) }}>
                <ResponsiveContainer>
                  <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" allowDecimals={false} tick={AX} />
                    <YAxis type="category" dataKey="name" width={230} tick={{ fill: "var(--text)", fontSize: 12 }} />
                    <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar {...chartAnim()} dataKey="now" name={p.label} fill={CUR} maxBarSize={16} />
                    {compare && <Bar {...chartAnim()} dataKey="before" name={`The ${prevLabel}`} fill={PREV} maxBarSize={10} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {adv && (
            <div className="mrid-panel">
              <div className="mrid-panel-head"><h3>Faults per month</h3></div>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={perMonth} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" tick={AX} />
                    <YAxis allowDecimals={false} tick={AX} width={30} />
                    <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar {...chartAnim()} dataKey="now" name="Faults that month" fill={CUR} maxBarSize={18} />
                    {compare && <Bar {...chartAnim()} dataKey="before" name="Same month a year earlier" fill={PREV} maxBarSize={18} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {U.recurring.length > 0 && (
            <div className="mrid-panel">
              <div className="mrid-panel-head"><h3>Recurring on this unit ({U.recurring.length})</h3></div>
              <div className="mrid-table-wrap"><table className="mrid-table">
                <thead><tr><th>Checklist item</th><th>Times</th><th>Found</th><th>Year before</th></tr></thead>
                <tbody>{U.recurring.map((it) => { const fs = U.cur.filter((f) => itemOf(f) === it).sort((a, b) => (a.found_at ?? 0) - (b.found_at ?? 0)); return (
                  <tr key={it}><td><b>{it}</b></td><td className="mrid-over">{fs.length}</td><td>{fs.map((f) => fmtDate(f.found_at)).join(", ")}</td><td>{U.prev.filter((f) => itemOf(f) === it).length}</td></tr>); })}</tbody>
              </table></div>
            </div>
          )}

          <div className="mrid-panel">
            <div className="mrid-panel-head"><h3>Every fault on {code(U)} ({list.length})</h3></div>
            {!list.length ? <p className="mrid-note mrid-empty">No faults in the period.</p> : (
              <div className="mrid-table-wrap"><table className="mrid-table">
                <thead><tr><th>Found</th><th>Checklist item</th><th>Component</th><th>Severity</th><th>Issue</th><th>Status</th><th>MR-I report</th></tr></thead>
                <tbody>{list.map((f) => (
                  <tr key={f.result_id}>
                    <td>{fmtDate(f.found_at)}</td><td>{itemOf(f)}</td><td className="mrid-soft">{f.component ?? "—"}</td>
                    <td><span className="mrid-sev"><i className="mrid-dot" style={{ background: SEVERITIES.find((s) => s.key === sevKey(f.severity))!.color }} />{sevLabel(sevKey(f.severity))}</span></td>
                    <td className="mrid-soft">{f.issue_details ?? "—"}</td><td>{f.stage || f.state}</td><td><PreviewButton reportId={f.report_id} /></td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </div>
        </>);
      })()}

      <p className="mrid-note">A fault is counted once, when the report that first found it was submitted. "Recurring" = the same checklist item failed two or more times on the same unit in the period. "Needs investigation" = a unit with at least 3 faults and 1.5 times its type's average, or two or more recurring items. Equipment type comes from the Asset Registry.</p>
    </div>
  );
}
