import { useMemo, useState } from "react";
import { fmtDate, sevKey, sevLabel, useMriDashboardFaults, type DashboardFilters, type MriDashboardAsset, type MriDashboardFault, type MriDashDecision, type MriDashExemption, type MriDashReport } from "../hooks/useMriDashboards";
import { useMriReports, useSetMriReportCost, type MriReport } from "../../mri-reporting/hooks/useMriReports";
import { useCurrentUser } from "../../../lib/currentUser";
import { useCurrentUserPermissionCodes } from "../../../lib/useCurrentUserPermissions";
import ExportMenu from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { StoryStrip, type StoryLine } from "./fluid";
import { DAY, DrillChips, inRange, Loading, monthsFor, nowSecs, period, Tile, useMore } from "./kit";
import { stageName, useDetails } from "./MoreReports";

// Dashboards 24-28 from the MR-I reports list:
// 24 Usage per job (Tier 2), 25 MR cost, 26 Critical fault audit trail, 27 Faults by client and
// 28 Exemption (MOC) audit (Tier 3). All read only, from the same country-scoped data as the other
// dashboards, except that Dashboard 25 lets a user with "Enter MR cost" add a missing cost.

const stageKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const t = (r: MriDashReport) => r.submitted_at ?? r.created_at ?? 0;
const sent = (r: MriDashReport) => r.status !== "Draft";
const num = (s: string | null | undefined) => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
/** Epoch seconds (as text or number, seconds or milliseconds) or a date string, to epoch seconds. */
export const toSecs = (raw: string | number | null | undefined) => {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!isNaN(n)) return n < 1e12 ? n : Math.floor(n / 1000);
  const d = Date.parse(String(raw));
  return isNaN(d) ? null : Math.floor(d / 1000);
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const fmtN = (n: number | null | undefined) => (n == null ? "—" : r1(n).toLocaleString());
const SEV_RANK: Record<string, number> = { Minor: 0, Moderate: 1, Critical: 2 };

// ===================================================================== 24 Usage per job
type UsageRow = { r: MriDashReport; job: string; client: string; eh: number | null; oh: number | null; km: number | null };
type UsageKey = "eh" | "oh" | "km";
const COUNTER: Record<string, { k: UsageKey; name: string; unit: string }> = {
  EH: { k: "eh", name: "Engine hours", unit: "h" }, OH: { k: "oh", name: "Operating hours", unit: "h" }, KM: { k: "km", name: "Distance", unit: "km" },
};
type UsagePick = "jobs" | "eh" | "km" | "none" | "counter" | null;

function useUsage(assets: MriDashboardAsset[], s: number, e: number) {
  const d = useDetails(assets);
  return useMemo(() => {
    const done = d.reports.filter(sent);
    const read = (r: MriDashReport): UsageRow => {
      const kms = [...(d.mid.get(r.id)?.values() ?? [])].map(num).filter((x): x is number => x != null);
      const st = stageKey(r.compliance_stage);
      const job = d.h(r.id, "job number") || (st === "PREJOB" || st === "PREMOB" ? d.h(r.id, "pre-mobilization checklist id") : "");
      return {
        r, job, client: d.h(r.id, "client"),
        eh: num(d.h(r.id, "engine hours (this report)")),
        oh: num(d.h(r.id, "job operating hours")),
        km: kms.length ? kms.reduce((a, b) => a + b, 0) : null,
      };
    };
    const all = done.map(read);
    const rows = all.filter((x) => inRange(x.r.submitted_at, s, e)).sort((a, b) => t(b.r) - t(a.r));
    // The counters add each report's reading when it is sent (rounded to whole numbers), from the
    // last reset on. Add the same readings up again and compare.
    const counters = d.triggers.filter((tg) => COUNTER[tg.trigger_type]).map((tg) => {
      const c = COUNTER[tg.trigger_type];
      const since = all.filter((x) => x.r.asset_id === tg.asset_id && x[c.k] != null && (tg.last_reset_at == null || t(x.r) >= tg.last_reset_at));
      const fromReports = since.reduce((a, x) => a + Math.round(x[c.k] ?? 0), 0);
      return { tg, c, fromReports, reports: since.length, diff: Math.round(tg.running_value - fromReports) };
    });
    return { ...d, rows, counters };
  }, [d, s, e]);
}

const sum = (l: UsageRow[], k: UsageKey) => l.reduce((a, x) => a + (x[k] ?? 0), 0);
const noReading = (x: UsageRow) => x.eh == null && x.oh == null && x.km == null;

export function UsagePerJobMini({ assets }: { assets: MriDashboardAsset[] }) {
  const now = nowSecs();
  const { rows } = useUsage(assets, now - 30 * DAY, now + 1);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">Engine h, 30 d <b>{fmtN(sum(rows, "eh"))}</b></span>
      <span className="mrid-mini-item">km <b>{fmtN(sum(rows, "km"))}</b></span>
    </div>
  );
}

export function UsagePerJob({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { rows, counters, unitOf, isLoading, error } = useUsage(assets, p.s, p.e);
  const [pick, setPick] = useState<UsagePick>(null);
  const [jobPick, setJobPick] = useState<string | null>(null);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const jobs = useMemo(() => {
    const m = new Map<string, UsageRow[]>();
    rows.forEach((x) => m.set(x.job, [...(m.get(x.job) ?? []), x]));
    return [...m.entries()].map(([job, l]) => ({ job, l, units: new Set(l.map((x) => x.r.asset_id)).size, client: [...new Set(l.map((x) => x.client).filter(Boolean))].join(", ") }))
      .sort((a, b) => (a.job ? 0 : 1) - (b.job ? 0 : 1) || sum(b.l, "eh") + sum(b.l, "km") - (sum(a.l, "eh") + sum(a.l, "km")));
  }, [rows]);
  const units = useMemo(() => {
    const m = new Map<number, UsageRow[]>();
    rows.forEach((x) => m.set(x.r.asset_id, [...(m.get(x.r.asset_id) ?? []), x]));
    return [...m.entries()].map(([id, l]) => ({ id, l })).sort((a, b) => sum(b.l, "eh") - sum(a.l, "eh"));
  }, [rows]);
  const none = rows.filter(noReading);
  const off = counters.filter((c) => Math.abs(c.diff) >= 1);
  const named = jobs.filter((j) => j.job).length;
  const inJob = jobPick == null ? null : jobs.find((j) => j.job === jobPick) ?? null;

  const story: StoryLine[] = [];
  if (rows.length) story.push({ tone: "info", text: <>{rows.length} report{rows.length === 1 ? "" : "s"} sent in {p.label} recorded <b>{fmtN(sum(rows, "eh"))} engine hours</b> and <b>{fmtN(sum(rows, "km"))} km</b> over {named} job{named === 1 ? "" : "s"}.</> });
  if (off.length) story.push({ tone: "attention", text: <><b>{off.length}</b> MR-II / MR-III counter{off.length === 1 ? " does" : "s do"} not match the readings on the unit's reports since the last reset.</> });
  if (none.length) story.push({ tone: "info", text: <>{none.length} report{none.length === 1 ? " has" : "s have"} no engine hours, operating hours or distance.</> });

  const jobRow = (j: (typeof jobs)[number]) => ({ "Job number / checklist ID": j.job || "No job number", Client: j.client || null, Units: j.units, Reports: j.l.length, "Engine hours": r1(sum(j.l, "eh")), "Operating hours": r1(sum(j.l, "oh")), km: r1(sum(j.l, "km")) });
  const exportTables = () => [
    { name: "Summary", rows: [{ Measure: "Reports sent", Value: rows.length }, { Measure: "Jobs (with a job number or checklist ID)", Value: named }, { Measure: "Engine hours", Value: r1(sum(rows, "eh")) }, { Measure: "Operating hours", Value: r1(sum(rows, "oh")) }, { Measure: "Distance (km)", Value: r1(sum(rows, "km")) }, { Measure: "Reports with no reading", Value: none.length }, { Measure: "Counters that don't match", Value: off.length }] },
    { name: "By job", rows: jobs.map(jobRow) },
    { name: "By unit", rows: units.map((u) => ({ Unit: code(u.id), Reports: u.l.length, "Engine hours": r1(sum(u.l, "eh")), "Operating hours": r1(sum(u.l, "oh")), km: r1(sum(u.l, "km")) })) },
    { name: "Reports", rows: rows.map((x) => ({ Report: `#${x.r.id}`, Unit: code(x.r.asset_id), Part: x.r.component, Stage: stageName(x.r.compliance_stage), Sent: fmtDate(x.r.submitted_at), "Job number / checklist ID": x.job || null, Client: x.client || null, "Engine hours": x.eh, "Operating hours": x.oh, km: x.km })) },
    { name: "Counter check", rows: counters.map((c) => ({ Unit: code(c.tg.asset_id), Level: c.tg.mr_level, Counter: c.c.name, "Counter now": c.tg.running_value, "From reports": c.fromReports, Difference: c.diff, "Reports counted": c.reports, "Last reset": fmtDate(c.tg.last_reset_at) })) },
  ];
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Engine hours (this report), job operating hours and distance from the MR-I reports sent in <b>{p.label}</b>, by job and by unit. A Post-Job report carries the job number; a Pre-Job or Pre-Mob report the Pre-Mobilization Checklist ID.</p>
        <ExportMenu dashboardNo={24} title="Usage per Job" filters={filters} tables={exportTables} />
      </div>
      <StoryStrip lines={story} />
      <div className="mrid-kpis">
        <Tile k="jobs" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Jobs" value={named} sub={`${rows.length} report${rows.length === 1 ? "" : "s"} sent`} />
        <Tile k="eh" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Engine hours" value={fmtN(sum(rows, "eh"))} sub={`operating hours ${fmtN(sum(rows, "oh"))}`} hint="Click to list by unit" />
        <Tile k="km" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Distance" value={`${fmtN(sum(rows, "km"))} km`} sub="Pre-Job and Post-Job distances" hint="Click to list by unit" />
        <Tile k="none" pick={pick} setPick={setPick} color={none.length ? "var(--warn)" : "var(--success)"} label="Reports with no reading" value={none.length} sub="no hours or distance entered" />
        <Tile k="counter" pick={pick} setPick={setPick} color={off.length ? "var(--danger)" : "var(--success)"} label="Counters that don't match" value={off.length} sub={`of ${counters.length} MR-II / MR-III counters`} />
      </div>

      {pick === "counter" ? (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>MR-II / MR-III counters against the report readings</h3></div>
          <DrillChips onClear={() => setPick(null)} chips={[<b>Counter check</b>]} />
          {counters.length === 0 ? <p className="mrid-note mrid-empty">No engine-hour, operating-hour or distance counters set for these units.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Unit</th><th>Level</th><th>Counter</th><th>Counter now</th><th>From reports</th><th>Difference</th><th>Last reset</th></tr></thead>
              <tbody>{[...counters].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).map((c, i) => (
                <tr key={i}><td><b>{code(c.tg.asset_id)}</b></td><td>{c.tg.mr_level}</td><td>{c.c.name}</td><td>{c.tg.running_value.toLocaleString()} {c.c.unit}</td><td>{c.fromReports.toLocaleString()} {c.c.unit}<div className="mrid-soft">{c.reports} report{c.reports === 1 ? "" : "s"}</div></td>
                  <td style={Math.abs(c.diff) >= 1 ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{c.diff === 0 ? "Matches" : `${c.diff > 0 ? "+" : ""}${c.diff.toLocaleString()} ${c.c.unit}`}</td><td>{c.tg.last_reset_at ? fmtDate(c.tg.last_reset_at) : "Never"}</td></tr>))}</tbody>
            </table><p className="mrid-note">"From reports" adds the readings on the unit's sent reports since the last reset. A difference can come from a reading changed after sending, a counter edited by hand, or a counter that was switched off for a while.</p></div>
          )}
        </div>
      ) : pick === "none" ? (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>Reports with no reading ({none.length})</h3></div>
          <DrillChips onClear={() => setPick(null)} chips={[<b>No hours or distance</b>]} />
          {none.length === 0 ? <p className="mrid-note mrid-empty">None.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Report</th><th>Unit</th><th>Stage</th><th>Sent</th><th>Sent by</th></tr></thead>
              <tbody>{none.map((x) => (<tr key={x.r.id}><td><PreviewButton reportId={x.r.id} /></td><td><b>{code(x.r.asset_id)}</b>{x.r.component ? <span className="mrid-soft"> · {x.r.component}</span> : null}</td><td>{stageName(x.r.compliance_stage)}</td><td>{fmtDate(x.r.submitted_at)}</td><td>{x.r.submitted_by ?? "—"}</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      ) : pick === "eh" || pick === "km" ? (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>By unit ({units.length})</h3></div>
          <DrillChips onClear={() => setPick(null)} chips={[<b>{pick === "eh" ? "Engine hours" : "Distance"}</b>]} />
          {units.length === 0 ? <p className="mrid-note mrid-empty">No reports sent in this period.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Unit</th><th>Reports</th><th>Engine hours</th><th>Operating hours</th><th>Distance</th></tr></thead>
              <tbody>{[...units].sort((a, b) => sum(b.l, pick) - sum(a.l, pick)).map((u) => (<tr key={u.id}><td><b>{code(u.id)}</b><div className="mrid-soft">{unitOf.get(u.id)?.asset_type ?? ""}</div></td><td>{u.l.length}</td><td>{fmtN(sum(u.l, "eh"))} h</td><td>{fmtN(sum(u.l, "oh"))} h</td><td>{fmtN(sum(u.l, "km"))} km</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      ) : (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>By job ({jobs.length})</h3></div>
          <DrillChips onClear={() => { setPick(null); setJobPick(null); }} chips={[inJob && <>Job: <b>{inJob.job || "No job number"}</b></>]} />
          {jobs.length === 0 ? <p className="mrid-note mrid-empty">No reports sent in this period.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Job number / checklist ID</th><th>Client</th><th>Units</th><th>Reports</th><th>Engine hours</th><th>Operating hours</th><th>Distance</th></tr></thead>
              <tbody>{jobs.map((j) => (
                <tr key={j.job || "-"} className="mrid-click" onClick={() => setJobPick(jobPick === j.job ? null : j.job)} style={jobPick === j.job ? { outline: "2px solid var(--accent)" } : undefined}>
                  <td><b>{j.job || "No job number"}</b></td><td>{j.client || "—"}</td><td>{j.units}</td><td>{j.l.length}</td><td>{fmtN(sum(j.l, "eh"))} h</td><td>{fmtN(sum(j.l, "oh"))} h</td><td>{fmtN(sum(j.l, "km"))} km</td>
                </tr>))}</tbody>
            </table><p className="mrid-note">Click a job to see its reports.</p></div>
          )}
          {inJob && (
            <div className="mrid-table-wrap" style={{ marginTop: 12 }}><table className="mrid-table">
              <thead><tr><th>Report</th><th>Unit</th><th>Stage</th><th>Sent</th><th>Engine hours</th><th>Operating hours</th><th>Distance</th></tr></thead>
              <tbody>{inJob.l.map((x) => (<tr key={x.r.id}><td><PreviewButton reportId={x.r.id} /></td><td><b>{code(x.r.asset_id)}</b>{x.r.component ? <span className="mrid-soft"> · {x.r.component}</span> : null}</td><td>{stageName(x.r.compliance_stage)}</td><td>{fmtDate(x.r.submitted_at)}</td><td>{fmtN(x.eh)}</td><td>{fmtN(x.oh)}</td><td>{fmtN(x.km)}</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}

// ===================================================================== 25 MR cost
type CostBy = "unit" | "kind" | "country" | "month";
const COST_BY: Record<CostBy, string> = { unit: "Unit", kind: "Equipment type", country: "Country", month: "Month" };
type CostPick = "total" | "count" | "waiting" | "closed" | null;
const AWAITING = ["Submitted", "Endorsed", "Escalated"];

/** MR cost on the sent reports of the units on screen. Cost dated by when it was entered. */
export function useCost(assets: MriDashboardAsset[], s: number, e: number) {
  const more = useMore(assets);
  const { data: all = [], isLoading, error } = useMriReports();
  return useMemo(() => {
    const mine = all.filter((r) => r.status !== "Draft" && more.unitOf.has(r.asset_id));
    const costed = mine.filter((r) => r.mr_cost != null).map((r) => ({ r, at: toSecs(r.mr_cost_date) ?? toSecs(r.submitted_date) })).filter((x) => inRange(x.at, s, e));
    const waiting = mine.filter((r) => r.mr_cost == null && AWAITING.includes(r.status)).sort((a, b) => (toSecs(a.submitted_date) ?? 0) - (toSecs(b.submitted_date) ?? 0));
    const closedNoCost = mine.filter((r) => r.mr_cost == null && r.status === "Approved" && inRange(toSecs(r.approved_date), s, e));
    return { unitOf: more.unitOf, costed, waiting, closedNoCost, isLoading: more.isLoading || isLoading, error: more.error ?? error };
  }, [all, more.unitOf, more.isLoading, more.error, isLoading, error, s, e]);
}

function CostEntry({ report }: { report: MriReport }) {
  const setCost = useSetMriReportCost();
  const { user } = useCurrentUser();
  const [v, setV] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    const n = Number(v);
    if (v.trim() === "" || !Number.isFinite(n) || n < 0) { setMsg("Enter a cost of 0 or more."); return; }
    try { await setCost.mutateAsync({ reportId: report.id, cost: n, enteredBy: user?.name ?? "" }); setMsg(null); }
    catch (err) { setMsg(String(err)); }
  };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="number" min="0" step="0.01" placeholder="Cost" aria-label={`MR cost for report ${report.id}`} value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()} style={{ width: 110 }} />
      <button type="button" className="primary" onClick={save} disabled={setCost.isPending}>Enter cost</button>
      {msg && <span style={{ color: "var(--danger)", fontSize: 12 }}>{msg}</span>}
    </div>
  );
}

export function MrCostMini({ assets }: { assets: MriDashboardAsset[] }) {
  const now = nowSecs();
  const { costed, waiting } = useCost(assets, now - 30 * DAY, now + 1);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">Cost, 30 d <b>{costed.reduce((a, x) => a + (x.r.mr_cost ?? 0), 0).toLocaleString()}</b></span>
      <span className="mrid-mini-item">Waiting for cost <b>{waiting.length}</b></span>
    </div>
  );
}

export function MrCost({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { costed, waiting, closedNoCost, unitOf, isLoading, error } = useCost(assets, p.s, p.e);
  const codes = useCurrentUserPermissionCodes();
  const canEnter = codes === null || codes.has("mri.enter_cost");
  const [pick, setPick] = useState<CostPick>(null);
  const [by, setBy] = useState<CostBy>("unit");
  const [groupPick, setGroupPick] = useState<string | null>(null);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const months = monthsFor(p.from, p.to);
  const keyOf = (x: { r: MriReport; at: number | null }) => {
    const a = unitOf.get(x.r.asset_id);
    if (by === "unit") return a?.asset_code ?? String(x.r.asset_id);
    if (by === "kind") return a?.asset_type?.trim() || "Not set";
    if (by === "country") return a?.country?.trim() || "Not set";
    return months.find((m) => inRange(x.at, m.s, m.e))?.name ?? "Other";
  };
  const total = costed.reduce((a, x) => a + (x.r.mr_cost ?? 0), 0);
  const avgCost = costed.length ? total / costed.length : null;
  const groups = (() => {
    const m = new Map<string, typeof costed>();
    costed.forEach((x) => { const k = keyOf(x); m.set(k, [...(m.get(k) ?? []), x]); });
    const l = [...m.entries()].map(([k, xs]) => ({ k, xs, total: xs.reduce((a, x) => a + (x.r.mr_cost ?? 0), 0) }));
    return by === "month" ? l.sort((a, b) => months.findIndex((m) => m.name === a.k) - months.findIndex((m) => m.name === b.k)) : l.sort((a, b) => b.total - a.total);
  })();
  const max = Math.max(1, ...groups.map((g) => g.total));
  const listed = groupPick == null ? costed : costed.filter((x) => keyOf(x) === groupPick);
  const money = (n: number | null) => (n == null ? "—" : (Math.round(n * 100) / 100).toLocaleString());

  const story: StoryLine[] = [];
  if (costed.length) story.push({ tone: "info", text: <>MR cost entered in {p.label}: <b>{money(total)}</b> over {costed.length} report{costed.length === 1 ? "" : "s"}, <b>{money(avgCost)}</b> per inspection on average.</> });
  if (waiting.length) story.push({ tone: "attention", text: <><b>{waiting.length}</b> open report{waiting.length === 1 ? " is" : "s are"} waiting for the MR cost.</> });
  if (closedNoCost.length) story.push({ tone: "info", text: <>{closedNoCost.length} report{closedNoCost.length === 1 ? " was" : "s were"} closed in {p.label} with no MR cost.</> });

  const reportRow = (x: { r: MriReport; at: number | null }) => ({ Report: `#${x.r.id}`, Unit: code(x.r.asset_id), "Equipment type": unitOf.get(x.r.asset_id)?.asset_type ?? null, Country: unitOf.get(x.r.asset_id)?.country ?? null, Part: x.r.component_label ?? null, "MR cost": x.r.mr_cost ?? null, "Entered by": x.r.mr_cost_by ?? null, Entered: fmtDate(x.at), Status: x.r.status === "Approved" ? "Closed" : x.r.status });
  const exportTables = () => [
    { name: "Summary", rows: [{ Measure: "Total MR cost", Value: Math.round(total * 100) / 100 }, { Measure: "Reports with a cost", Value: costed.length }, { Measure: "Average per inspection", Value: avgCost == null ? null : Math.round(avgCost * 100) / 100 }, { Measure: "Open reports waiting for the cost", Value: waiting.length }, { Measure: "Closed with no cost", Value: closedNoCost.length }] },
    { name: `By ${COST_BY[by].toLowerCase()}`, rows: groups.map((g) => ({ [COST_BY[by]]: g.k, Reports: g.xs.length, "MR cost": Math.round(g.total * 100) / 100, Average: Math.round((g.total / g.xs.length) * 100) / 100 })) },
    { name: "Reports", rows: costed.map(reportRow) },
    { name: "Waiting for cost", rows: waiting.map((r) => ({ Report: `#${r.id}`, Unit: code(r.asset_id), Status: r.status, Sent: fmtDate(toSecs(r.submitted_date)), "Sent by": r.submitted_by })) },
  ];
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  const noCost = (l: MriReport[], title: string, empty: string, withEntry: boolean) => (
    <div className="mrid-panel">
      <div className="mrid-panel-head"><h3>{title} ({l.length})</h3></div>
      <DrillChips onClear={() => setPick(null)} chips={[<b>{title}</b>]} />
      {l.length === 0 ? <p className="mrid-note mrid-empty">{empty}</p> : (
        <div className="mrid-table-wrap"><table className="mrid-table">
          <thead><tr><th>Report</th><th>Unit</th><th>Status</th><th>Sent</th><th>Sent by</th>{withEntry && canEnter && <th>MR cost</th>}</tr></thead>
          <tbody>{l.map((r) => (<tr key={r.id}><td><PreviewButton reportId={r.id} /></td><td><b>{code(r.asset_id)}</b>{r.component_label ? <span className="mrid-soft"> · {r.component_label}</span> : null}</td><td>{r.status === "Approved" ? "Closed" : r.status}</td><td>{fmtDate(toSecs(r.submitted_date))}</td><td>{r.submitted_by ?? "—"}</td>{withEntry && canEnter && <td><CostEntry report={r} /></td>}</tr>))}</tbody>
        </table>{withEntry && !canEnter && <p className="mrid-note">The MR cost is entered by a user with the "Enter MR cost" permission (the operations supervisor).</p>}</div>
      )}
    </div>
  );
  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Cost to perform the MR, entered on sent MR-I reports in <b>{p.label}</b> (dated by when it was entered), by unit, equipment type, country or month.</p>
        <ExportMenu dashboardNo={25} title="MR Cost" filters={filters} tables={exportTables} />
      </div>
      <StoryStrip lines={story} />
      <div className="mrid-kpis">
        <Tile k="total" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Total MR cost" value={money(total)} sub={`entered in ${p.label}`} />
        <Tile k="count" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Average per inspection" value={money(avgCost)} sub={`${costed.length} report${costed.length === 1 ? "" : "s"} with a cost`} />
        <Tile k="waiting" pick={pick} setPick={setPick} color={waiting.length ? "var(--warn)" : "var(--success)"} label="Waiting for the cost" value={waiting.length} sub="open reports, no cost yet" />
        <Tile k="closed" pick={pick} setPick={setPick} color="var(--text-soft)" label="Closed with no cost" value={closedNoCost.length} sub={`closed in ${p.label}`} />
      </div>
      {pick === "waiting" ? noCost(waiting, "Waiting for the MR cost", "No open report is waiting for its cost.", true)
        : pick === "closed" ? noCost(closedNoCost, "Closed with no MR cost", "None.", false) : (
        <div className="mrid-panel">
          <div className="mrid-panel-head">
            <h3>MR cost by {COST_BY[by].toLowerCase()}</h3>
            <label className="mrid-field mrid-inline">
              <span>Group by</span>
              <select value={by} onChange={(e) => { setBy(e.target.value as CostBy); setGroupPick(null); }}>
                {(Object.keys(COST_BY) as CostBy[]).map((g) => <option key={g} value={g}>{COST_BY[g]}</option>)}
              </select>
            </label>
          </div>
          <DrillChips onClear={() => { setGroupPick(null); setPick(null); }} chips={[groupPick && <>{COST_BY[by]}: <b>{groupPick}</b></>]} />
          {groups.length === 0 ? <p className="mrid-note mrid-empty">No MR cost was entered in this period.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>{COST_BY[by]}</th><th>Reports</th><th>MR cost</th><th>Average</th><th style={{ width: "34%" }} aria-label="Share" /></tr></thead>
              <tbody>{groups.map((g) => (
                <tr key={g.k} className="mrid-click" onClick={() => setGroupPick(groupPick === g.k ? null : g.k)} style={groupPick === g.k ? { outline: "2px solid var(--accent)" } : undefined}>
                  <td><b>{g.k}</b></td><td>{g.xs.length}</td><td>{money(g.total)}</td><td>{money(g.total / g.xs.length)}</td>
                  <td><div className="ca-bar"><i style={{ width: `${(g.total / max) * 100}%` }} /></div></td>
                </tr>))}</tbody>
            </table><p className="mrid-note">Click a row to list its reports.</p></div>
          )}
          {groupPick && (
            <div className="mrid-table-wrap" style={{ marginTop: 12 }}><table className="mrid-table">
              <thead><tr><th>Report</th><th>Unit</th><th>MR cost</th><th>Entered</th><th>By</th><th>Status</th></tr></thead>
              <tbody>{listed.map((x) => (<tr key={x.r.id}><td><PreviewButton reportId={x.r.id} /></td><td><b>{code(x.r.asset_id)}</b></td><td>{money(x.r.mr_cost ?? null)}</td><td>{fmtDate(x.at)}</td><td>{x.r.mr_cost_by ?? "—"}</td><td>{x.r.status === "Approved" ? "Closed" : x.r.status}</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      )}
      <style>{CA_CSS}</style>
    </div>
  );
}

// ===================================================================== 26 Critical fault audit trail
type AuditPick = "all" | "pending" | "provisional" | "lowered" | "ack" | null;
const isCrit = (d: MriDashDecision) => sevKey(d.original_severity ?? "") === "Critical" || (!!d.new_severity && sevKey(d.new_severity) === "Critical");
const lowered = (d: MriDashDecision) => d.decision === "Rejected" || (!!d.new_severity && SEV_RANK[sevKey(d.new_severity)] < SEV_RANK[sevKey(d.original_severity ?? "")]);
const ackOpen = (d: MriDashDecision) => d.ack_needed && !d.acknowledged_by && d.decision !== "Pending";

export function CriticalAuditMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { decisions } = useMore(assets);
  const now = nowSecs();
  const l = decisions.filter((d) => isCrit(d) && inRange(d.report_submitted_at, now - 30 * DAY, now + 1));
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">Major / Critical, 30 d <b>{l.length}</b></span>
      <span className="mrid-mini-item">Not confirmed <b>{decisions.filter((d) => isCrit(d) && d.provisional_status === "Provisional").length}</b></span>
    </div>
  );
}

export function CriticalAudit({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { decisions, unitOf, isLoading, error } = useMore(assets);
  const [pick, setPick] = useState<AuditPick>(null);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const all = decisions.filter((d) => isCrit(d) && inRange(d.report_submitted_at ?? d.sent_at, p.s, p.e)).sort((a, b) => (b.report_submitted_at ?? 0) - (a.report_submitted_at ?? 0));
  const pending = all.filter((d) => d.decision === "Pending");
  const provisional = all.filter((d) => d.provisional_status === "Provisional");
  const low = all.filter(lowered);
  const ack = all.filter(ackOpen);
  const shown = pick === "pending" ? pending : pick === "provisional" ? provisional : pick === "lowered" ? low : pick === "ack" ? ack : all;
  const took = (d: MriDashDecision) => (d.decided_at && d.report_submitted_at ? d.decided_at - d.report_submitted_at : null);
  const days = (s: number | null) => (s == null ? "—" : s < DAY ? `${Math.max(0, Math.round(s / 3600))} h` : `${r1(s / DAY)} d`);
  const sevText = (d: MriDashDecision) => `${sevLabel(sevKey(d.original_severity ?? ""))}${d.new_severity && sevKey(d.new_severity) !== sevKey(d.original_severity ?? "") ? ` → ${sevLabel(sevKey(d.new_severity))}` : ""}`;
  const story: StoryLine[] = [];
  if (all.length) story.push({ tone: "info", text: <>{all.length} Major / Critical fault{all.length === 1 ? "" : "s"} on reports sent in {p.label}; {all.length - pending.length} decided.</> });
  if (provisional.length) story.push({ tone: "attention", text: <><b>{provisional.length}</b> decision{provisional.length === 1 ? " was" : "s were"} made by phone and still need{provisional.length === 1 ? "s" : ""} to be confirmed in MMS.</> });
  if (low.length) story.push({ tone: "info", text: <>{low.length} {low.length === 1 ? "was" : "were"} lowered or rejected on review.</> });
  const row = (d: MriDashDecision) => ({
    Report: `#${d.report_id}`, Unit: code(d.asset_id), Item: d.item, Severity: sevText(d), Decision: d.decision, "Decided by": d.reviewer, Method: d.review_method, "Recorded by": d.recorded_by,
    Sent: fmtDate(d.report_submitted_at), Decided: fmtDate(d.decided_at), "Time to decide": days(took(d)),
    "Confirmed by": d.confirmed_by, Confirmed: fmtDate(d.confirmed_at), "Still to confirm": d.provisional_status === "Provisional",
    "Acknowledged by": d.acknowledged_by, Acknowledged: fmtDate(d.acknowledged_at),
  });
  const exportTables = () => [
    { name: "Summary", rows: [{ Measure: "Major / Critical faults", Value: all.length }, { Measure: "Waiting for a decision", Value: pending.length }, { Measure: "Phone decisions not confirmed", Value: provisional.length }, { Measure: "Lowered or rejected", Value: low.length }, { Measure: "Acknowledgement missing", Value: ack.length }] },
    { name: "Audit trail", rows: all.map(row) },
  ];
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Every Major or Critical fault on MR-I reports sent in <b>{p.label}</b> (as found, or after reclassification), with who decided, how, when, and the confirmation and acknowledgement that followed.</p>
        <ExportMenu dashboardNo={26} title="Critical Fault Audit Trail" filters={filters} tables={exportTables} />
      </div>
      <StoryStrip lines={story} />
      <div className="mrid-kpis">
        <Tile k="all" pick={pick} setPick={setPick} color="var(--danger)" label="Major / Critical faults" value={all.length} sub={`on reports sent in ${p.label}`} />
        <Tile k="pending" pick={pick} setPick={setPick} color={pending.length ? "var(--warn)" : "var(--success)"} label="Waiting for a decision" value={pending.length} sub="no decision yet" />
        <Tile k="provisional" pick={pick} setPick={setPick} color={provisional.length ? "var(--danger)" : "var(--success)"} label="Phone decisions not confirmed" value={provisional.length} sub="to be confirmed in MMS" />
        <Tile k="lowered" pick={pick} setPick={setPick} color="var(--text-soft)" label="Lowered or rejected" value={low.length} sub="on review" />
        <Tile k="ack" pick={pick} setPick={setPick} color={ack.length ? "var(--warn)" : "var(--success)"} label="Acknowledgement missing" value={ack.length} sub="decided, not yet acknowledged" />
      </div>
      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Audit trail ({shown.length})</h3></div>
        <DrillChips onClear={() => setPick(null)} chips={[pick && pick !== "all" && <b>{{ pending: "Waiting for a decision", provisional: "Phone decisions not confirmed", lowered: "Lowered or rejected", ack: "Acknowledgement missing" }[pick]}</b>]} />
        {shown.length === 0 ? <p className="mrid-note mrid-empty">No Major or Critical faults match.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Report</th><th>Unit / item</th><th>Severity</th><th>Decision</th><th>Who and how</th><th>Sent → decided</th><th>Confirmed</th><th>Acknowledged</th></tr></thead>
            <tbody>{shown.map((d) => (
              <tr key={d.approval_id}>
                <td><PreviewButton reportId={d.report_id} /></td>
                <td><b>{code(d.asset_id)}</b><div className="mrid-soft">{d.item ?? "—"}</div></td>
                <td>{sevText(d)}</td>
                <td>{d.decision}</td>
                <td>{d.reviewer ?? "—"}<div className="mrid-soft">{[d.review_method, d.recorded_by && d.recorded_by !== d.reviewer ? `recorded by ${d.recorded_by}` : null].filter(Boolean).join(" · ")}</div></td>
                <td>{fmtDate(d.report_submitted_at)} → {d.decided_at ? fmtDate(d.decided_at) : "—"}<div className="mrid-soft">{took(d) != null ? days(took(d)) : "waiting"}</div></td>
                <td>{d.provisional_status === "Provisional" ? <span style={{ color: "var(--danger)", fontWeight: 700 }}>Not yet</span> : d.confirmed_by ? <>{d.confirmed_by}<div className="mrid-soft">{fmtDate(d.confirmed_at)}</div></> : "—"}</td>
                <td>{d.acknowledged_by ? <>{d.acknowledged_by}<div className="mrid-soft">{fmtDate(d.acknowledged_at)}</div></> : ackOpen(d) ? <span style={{ color: "var(--warn)", fontWeight: 700 }}>Missing{d.ack_assigned_to ? ` (${d.ack_assigned_to})` : ""}</span> : "—"}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

// ===================================================================== 27 Faults by client
type ClientPick = "clients" | "reports" | "faults" | "noclient" | null;
const NO_CLIENT = "No client entered";

function useClientFaults(assets: MriDashboardAsset[], s: number, e: number) {
  const d = useDetails(assets);
  const { data: faults = [], isLoading, error } = useMriDashboardFaults();
  return useMemo(() => {
    const posts = d.reports.filter((r) => sent(r) && stageKey(r.compliance_stage) === "POSTJOB" && inRange(r.submitted_at, s, e));
    const ids = new Set(posts.map((r) => r.id));
    const clientOf = (id: number) => d.h(id, "client") || NO_CLIENT;
    const found = faults.filter((f) => ids.has(f.report_id));
    const m = new Map<string, { reports: MriDashReport[]; faults: MriDashboardFault[] }>();
    posts.forEach((r) => { const k = clientOf(r.id); const x = m.get(k) ?? { reports: [], faults: [] }; x.reports.push(r); m.set(k, x); });
    found.forEach((f) => { const k = clientOf(f.report_id); m.get(k)?.faults.push(f); });
    const clients = [...m.entries()].map(([client, x]) => ({ client, ...x, units: new Set(x.reports.map((r) => r.asset_id)).size }))
      .sort((a, b) => (a.client === NO_CLIENT ? 1 : 0) - (b.client === NO_CLIENT ? 1 : 0) || b.faults.length - a.faults.length);
    return { ...d, posts, found, clients, clientOf, isLoading: d.isLoading || isLoading, error: d.error ?? error };
  }, [d, faults, isLoading, error, s, e]);
}

export function FaultsByClientMini({ assets }: { assets: MriDashboardAsset[] }) {
  const now = nowSecs();
  const { clients, found } = useClientFaults(assets, now - 90 * DAY, now + 1);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">Post-Job faults, 90 d <b>{found.length}</b></span>
      <span className="mrid-mini-item">Clients <b>{clients.filter((c) => c.client !== NO_CLIENT).length}</b></span>
    </div>
  );
}

export function FaultsByClient({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { posts, found, clients, clientOf, unitOf, isLoading, error } = useClientFaults(assets, p.s, p.e);
  const [pick, setPick] = useState<ClientPick>(null);
  const [clientPick, setClientPick] = useState<string | null>(null);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const named = clients.filter((c) => c.client !== NO_CLIENT);
  const noClient = posts.filter((r) => clientOf(r.id) === NO_CLIENT);
  const sevCount = (l: MriDashboardFault[], k: string) => l.filter((f) => sevKey(f.severity) === k).length;
  const per = (c: (typeof clients)[number]) => (c.reports.length ? r1(c.faults.length / c.reports.length) : 0);
  const sel = clientPick == null ? null : clients.find((c) => c.client === clientPick) ?? null;
  const story: StoryLine[] = [];
  const worst = [...named].filter((c) => c.reports.length >= 2).sort((a, b) => per(b) - per(a))[0];
  if (posts.length) story.push({ tone: "info", text: <>{found.length} fault{found.length === 1 ? "" : "s"} on {posts.length} Post-Job report{posts.length === 1 ? "" : "s"} sent in {p.label}, for {named.length} client{named.length === 1 ? "" : "s"}.</> });
  if (worst && per(worst) > 0) story.push({ tone: "attention", text: <>Most faults per job: <b>{worst.client}</b>, {per(worst)} per Post-Job report over {worst.reports.length} reports.</> });
  if (noClient.length) story.push({ tone: "attention", text: <>{noClient.length} Post-Job report{noClient.length === 1 ? " has" : "s have"} no client, so {noClient.length === 1 ? "it isn't" : "they aren't"} counted against anyone.</> });
  const exportTables = () => [
    { name: "By client", rows: clients.map((c) => ({ Client: c.client, "Post-Job reports": c.reports.length, Units: c.units, Faults: c.faults.length, "Faults per report": per(c), "Major / Critical": sevCount(c.faults, "Critical"), Moderate: sevCount(c.faults, "Moderate"), Minor: sevCount(c.faults, "Minor") })) },
    { name: "Faults", rows: found.map((f) => ({ Client: clientOf(f.report_id), Report: `#${f.report_id}`, Unit: code(f.asset_id), Item: f.item, Part: f.component, Severity: sevLabel(sevKey(f.severity)), "What was wrong": f.issue_details, Found: fmtDate(f.found_at), State: f.state })) },
    { name: "No client", rows: noClient.map((r) => ({ Report: `#${r.id}`, Unit: code(r.asset_id), Sent: fmtDate(r.submitted_at), "Sent by": r.submitted_by })) },
  ];
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  const faultTable = (l: MriDashboardFault[]) => (
    <div className="mrid-table-wrap" style={{ marginTop: 12 }}><table className="mrid-table">
      <thead><tr><th>Report</th><th>Unit</th><th>Item</th><th>Severity</th><th>What was wrong</th><th>Now</th></tr></thead>
      <tbody>{l.map((f) => (<tr key={f.result_id}><td><PreviewButton reportId={f.report_id} /></td><td><b>{code(f.asset_id)}</b>{f.component ? <span className="mrid-soft"> · {f.component}</span> : null}</td><td>{f.item ?? "—"}</td><td>{sevLabel(sevKey(f.severity))}</td><td className="mrid-soft">{f.issue_details ?? "—"}</td><td>{f.state === "Open" ? f.stage : f.state}</td></tr>))}</tbody>
    </table></div>
  );
  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Faults found on Post-Job reports sent in <b>{p.label}</b>, grouped by the client on the report. A Post-Job report shows the unit's condition at the end of a job, so many faults per report for one client can point to hard use on that client's jobs.</p>
        <ExportMenu dashboardNo={27} title="Faults by Client" filters={filters} tables={exportTables} />
      </div>
      <StoryStrip lines={story} />
      <div className="mrid-kpis">
        <Tile k="clients" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Clients" value={named.length} sub="on Post-Job reports" hint="Click to list by client" />
        <Tile k="reports" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Post-Job reports" value={posts.length} sub={`sent in ${p.label}`} hint="Click to list by client" />
        <Tile k="faults" pick={pick} setPick={setPick} color="var(--danger)" label="Faults found after jobs" value={found.length} sub={`${sevCount(found, "Critical")} Major / Critical`} />
        <Tile k="noclient" pick={pick} setPick={setPick} color={noClient.length ? "var(--warn)" : "var(--success)"} label="Reports with no client" value={noClient.length} sub="Post-Job reports" />
      </div>
      {pick === "noclient" ? (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>Post-Job reports with no client ({noClient.length})</h3></div>
          <DrillChips onClear={() => setPick(null)} chips={[<b>No client</b>]} />
          {noClient.length === 0 ? <p className="mrid-note mrid-empty">Every Post-Job report has a client.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Report</th><th>Unit</th><th>Sent</th><th>Sent by</th><th>Faults</th></tr></thead>
              <tbody>{noClient.map((r) => (<tr key={r.id}><td><PreviewButton reportId={r.id} /></td><td><b>{code(r.asset_id)}</b></td><td>{fmtDate(r.submitted_at)}</td><td>{r.submitted_by ?? "—"}</td><td>{r.fault_count}</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      ) : pick === "faults" ? (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>Faults found after jobs ({found.length})</h3></div>
          <DrillChips onClear={() => setPick(null)} chips={[<b>All Post-Job faults</b>]} />
          {found.length === 0 ? <p className="mrid-note mrid-empty">No faults on Post-Job reports in this period.</p> : faultTable(found)}
        </div>
      ) : (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>By client ({clients.length})</h3></div>
          <DrillChips onClear={() => { setClientPick(null); setPick(null); }} chips={[sel && <>Client: <b>{sel.client}</b></>]} />
          {clients.length === 0 ? <p className="mrid-note mrid-empty">No Post-Job reports sent in this period.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Client</th><th>Post-Job reports</th><th>Units</th><th>Faults</th><th>Per report</th><th>Major / Critical</th><th>Moderate</th><th>Minor</th></tr></thead>
              <tbody>{clients.map((c) => (
                <tr key={c.client} className="mrid-click" onClick={() => setClientPick(clientPick === c.client ? null : c.client)} style={clientPick === c.client ? { outline: "2px solid var(--accent)" } : undefined}>
                  <td><b style={c.client === NO_CLIENT ? { color: "var(--warn)" } : undefined}>{c.client}</b></td><td>{c.reports.length}</td><td>{c.units}</td><td>{c.faults.length}</td><td>{per(c)}</td>
                  <td>{sevCount(c.faults, "Critical") || "—"}</td><td>{sevCount(c.faults, "Moderate") || "—"}</td><td>{sevCount(c.faults, "Minor") || "—"}</td>
                </tr>))}</tbody>
            </table><p className="mrid-note">Click a client to list its faults. Use "Pre-Job vs Post-Job" on a report's flow to see which faults appeared during that job.</p></div>
          )}
          {sel && (sel.faults.length ? faultTable(sel.faults) : <p className="mrid-note mrid-empty">No faults on this client's Post-Job reports.</p>)}
        </div>
      )}
    </div>
  );
}

// ===================================================================== 28 Exemption (MOC) audit
type ExKey = "force" | "expired" | "closed" | "revoked";
const EX_LABEL: Record<ExKey, string> = { force: "In force", expired: "Past its end date", closed: "Closed (unit Green)", revoked: "Revoked" };
const EX_TONE: Record<ExKey, string> = { force: "var(--accent-blue, #2f6fed)", expired: "var(--danger)", closed: "var(--success)", revoked: "var(--text-soft)" };

export function useExemptionAudit(assets: MriDashboardAsset[], s: number, e: number) {
  const more = useMore(assets);
  return useMemo(() => {
    const now = nowSecs();
    const rows = more.exemptions.map((x: MriDashExemption) => {
      let state: ExKey; let ended: number | null = null; let how = "";
      if (x.status === "Revoked") { state = "revoked"; ended = x.revoked_at; how = x.revoke_reason ? `Revoked: ${x.revoke_reason}` : "Revoked"; }
      else if (x.status === "Closed") {
        state = "closed";
        // The close is not dated; the unit's first change to Green after the start is.
        const g = more.tag_changes.filter((c) => c.asset_id === x.asset_id && c.tag_status === "Green" && c.changed_at != null && c.changed_at >= (x.valid_from ?? 0)).sort((a, b) => a.changed_at! - b.changed_at!)[0];
        ended = g?.changed_at ?? null; how = "Closed when the unit was tagged Green";
      } else if (x.valid_until != null && x.valid_until < now) { state = "expired"; ended = x.valid_until; how = "End date passed; still marked active"; }
      else { state = "force"; how = "Still in force"; }
      return { x, state, ended, how };
    }).filter((r) => (r.x.valid_from ?? 0) < e && (r.ended ?? now) >= s)
      .sort((a, b) => (b.x.valid_from ?? 0) - (a.x.valid_from ?? 0));
    return { ...more, rows };
  }, [more, s, e]);
}

export function ExemptionAuditMini({ assets }: { assets: MriDashboardAsset[] }) {
  const now = nowSecs();
  const { rows } = useExemptionAudit(assets, now - 365 * DAY, now + 1);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">Exemptions, 12 months <b>{rows.length}</b></span>
      <span className="mrid-mini-item">Past end date <b>{rows.filter((r) => r.state === "expired").length}</b></span>
    </div>
  );
}

export function ExemptionAudit({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { rows, unitOf, isLoading, error } = useExemptionAudit(assets, p.s, p.e);
  const [pick, setPick] = useState<ExKey | null>(null);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const count = (k: ExKey) => rows.filter((r) => r.state === k).length;
  const shown = pick ? rows.filter((r) => r.state === pick) : rows;
  const story: StoryLine[] = [];
  if (rows.length) story.push({ tone: "info", text: <>{rows.length} MOC exemption{rows.length === 1 ? " was" : "s were"} in force at some point in {p.label}.</> });
  if (count("expired")) story.push({ tone: "attention", text: <><b>{count("expired")}</b> {count("expired") === 1 ? "is" : "are"} past {count("expired") === 1 ? "its" : "their"} end date but still marked active: renew, revoke or return the unit to service.</> });
  const exportTables = () => [
    { name: "Summary", rows: (Object.keys(EX_LABEL) as ExKey[]).map((k) => ({ State: EX_LABEL[k], Exemptions: count(k) })) },
    { name: "Exemptions", rows: rows.map((r) => ({ Unit: code(r.x.asset_id), "MOC reference": r.x.moc_reference, "Approved by": r.x.approved_by, From: fmtDate(r.x.valid_from), Until: fmtDate(r.x.valid_until), Limitations: r.x.limitations, "Required controls": r.x.required_controls, "Return conditions": r.x.return_conditions, State: EX_LABEL[r.state], "How it ended": r.how, Ended: fmtDate(r.ended), "Days in force": r.x.valid_from ? r1(((r.ended ?? nowSecs()) - r.x.valid_from) / DAY) : null })) },
  ];
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Every MOC exemption in force at some point in <b>{p.label}</b>: the limits and controls it set, its dates, and how it ended (revoked, closed when the unit was tagged Green, or still running).</p>
        <ExportMenu dashboardNo={28} title="Exemption (MOC) Audit" filters={filters} tables={exportTables} />
      </div>
      <StoryStrip lines={story} />
      <div className="mrid-kpis">
        {(Object.keys(EX_LABEL) as ExKey[]).map((k) => (
          <Tile key={k} k={k} pick={pick} setPick={setPick} color={k === "expired" && !count(k) ? "var(--success)" : EX_TONE[k]} label={EX_LABEL[k]} value={count(k)} sub={`of ${rows.length} exemption${rows.length === 1 ? "" : "s"}`} />
        ))}
      </div>
      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Exemptions ({shown.length})</h3></div>
        <DrillChips onClear={() => setPick(null)} chips={[pick && <b>{EX_LABEL[pick]}</b>]} />
        {shown.length === 0 ? <p className="mrid-note mrid-empty">No exemptions match.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Unit / MOC</th><th>Dates</th><th>Limitations</th><th>Required controls</th><th>Return conditions</th><th>How it ended</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.x.id}>
                <td><b>{code(r.x.asset_id)}</b><div className="mrid-soft">{r.x.moc_reference} · approved by {r.x.approved_by}</div></td>
                <td>{fmtDate(r.x.valid_from)} → {fmtDate(r.x.valid_until)}</td>
                <td className="mrid-soft">{r.x.limitations || "—"}</td><td className="mrid-soft">{r.x.required_controls || "—"}</td><td className="mrid-soft">{r.x.return_conditions || "—"}</td>
                <td><b style={{ color: EX_TONE[r.state] }}>{EX_LABEL[r.state]}</b><div className="mrid-soft">{r.how}{r.ended ? ` · ${fmtDate(r.ended)}` : ""}</div></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

const CA_CSS = `
.ca-bar { height: 10px; border-radius: 99px; background: color-mix(in srgb, var(--border) 60%, transparent); overflow: hidden; }
.ca-bar i { display: block; height: 100%; border-radius: inherit; background: var(--accent-blue, #2f6fed); }
`;
