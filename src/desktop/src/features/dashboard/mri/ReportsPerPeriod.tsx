import { useMemo, useState } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { buckets, fmtDate, type DashboardFilters, type MriDashboardAsset, type MriDashReport } from "../hooks/useMriDashboards";
import ExportMenu from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { AX, DrillChips, inRange, Loading, monthsFor, period, Tile, TT, useMore } from "./kit";
import { Sparkline, StoryStrip, TrendDelta, type StoryLine } from "./fluid";

// Dashboard 11: MR-I reports per period, by compliance stage (Pre-Mob, Pre-Job, Post Job, Yard).
// Counts reports SUBMITTED in the period. Drafts are shown separately as "not yet submitted".

const STAGES = [
  { key: "Pre-Mob", color: "var(--accent-blue, #2f6fed)" },
  { key: "Pre-Job", color: "var(--success)" },
  { key: "Post Job", color: "var(--warn)" },
  { key: "Yard", color: "#0d9488" },
  { key: "Other", color: "var(--text-soft)" },
] as const;
type Stage = (typeof STAGES)[number]["key"];
export function stageOf(r: MriDashReport): Stage {
  const k = (r.compliance_stage ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return k === "PREMOB" || k === "PREMOBILISATION" || k === "PREMOBILIZATION" ? "Pre-Mob" : k === "PREJOB" ? "Pre-Job" : k === "POSTJOB" ? "Post Job" : k === "YARD" ? "Yard" : "Other";
}
const stageColor = (k: Stage) => STAGES.find((s) => s.key === k)!.color;
type Pick = "all" | "faults" | "drafts" | null;

export function ReportsPerPeriodMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { reports } = useMore(assets);
  const d = new Date();
  const s = Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000), e = Math.floor(Date.now() / 1000) + 1;
  const l = reports.filter((r) => r.status !== "Draft" && inRange(r.submitted_at, s, e));
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item" title="Submitted this month">This month <b>{l.length}</b></span>
      {STAGES.map((st) => ({ st, n: l.filter((r) => stageOf(r) === st.key).length })).filter((x) => x.n > 0).slice(0, 3).map(({ st, n }) => (
        <span key={st.key} className="mrid-mini-item" title={`${st.key}, this month`}><i className="mrid-dot" style={{ background: st.color }} /> {st.key} <b>{n}</b></span>
      ))}
    </div>
  );
}

export default function ReportsPerPeriod({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const { reports, unitOf, isLoading, error } = useMore(assets);
  const p = period(filters);
  const [pick, setPick] = useState<Pick>(null);
  const [stagePick, setStagePick] = useState<Stage | null>(null);
  const [bucketPick, setBucketPick] = useState<{ name: string; s: number; e: number } | null>(null);
  const clearAll = () => { setPick(null); setStagePick(null); setBucketPick(null); };

  const submitted = reports.filter((r) => r.status !== "Draft" && inRange(r.submitted_at, p.s, p.e));
  const drafts = reports.filter((r) => r.status === "Draft");
  const withFaults = submitted.filter((r) => r.fault_count > 0);
  const units = new Set(submitted.map((r) => r.asset_id)).size;

  const trend = useMemo(
    () => buckets(p.from, p.to).filter((b) => b.start.getTime() / 1000 < p.e).map((b) => {
      const bs = Math.floor(b.start.getTime() / 1000), be = Math.floor(b.end.getTime() / 1000);
      const l = submitted.filter((r) => inRange(r.submitted_at, bs, be));
      return { name: b.label, s: bs, e: be, ...Object.fromEntries(STAGES.map((st) => [st.key, l.filter((r) => stageOf(r) === st.key).length])) } as { name: string; s: number; e: number } & Record<Stage, number>;
    }),
    [submitted.length, p.s, p.e], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const usedStages = STAGES.filter((st) => st.key !== "Other" || submitted.some((r) => stageOf(r) === "Other"));

  const byStage = usedStages.map((st) => {
    const l = submitted.filter((r) => stageOf(r) === st.key);
    return { key: st.key, color: st.color, n: l.length, faults: l.filter((r) => r.fault_count > 0).length, units: new Set(l.map((r) => r.asset_id)).size };
  });

  const list = (pick === "drafts" ? drafts : submitted)
    .filter((r) => (pick !== "faults" || r.fault_count > 0) && (stagePick == null || stageOf(r) === stagePick) && (bucketPick == null || inRange(r.submitted_at, bucketPick.s, bucketPick.e)))
    .sort((a, b) => (b.submitted_at ?? b.created_at ?? 0) - (a.submitted_at ?? a.created_at ?? 0));
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const stageLabel = (r: MriDashReport) => (stageOf(r) === "Other" ? r.compliance_stage?.trim() || "Not set" : stageOf(r));

  // ---- fluid layer ----
  const months = useMemo(() => monthsFor(p.from, p.to), [p.from.getTime(), p.to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const perMonth = months.map((m) => ({ name: m.name, n: reports.filter((r) => r.status !== "Draft" && inRange(r.submitted_at, m.s, m.e)).length }));
  const pmPrev = perMonth.length > 1 ? perMonth[perMonth.length - 2] : null, pmLast = perMonth.length ? perMonth[perMonth.length - 1] : null;
  const stream = trend.length >= 3 && filters.kind !== "week" && filters.kind !== "month";
  const story: StoryLine[] = [];
  {
    const busiest = [...byStage].sort((a, b) => b.n - a.n)[0];
    if (submitted.length && busiest) story.push({ tone: "info", text: <><b>{submitted.length}</b> MR-I report{submitted.length === 1 ? "" : "s"} submitted in {p.label}; most were <b>{busiest.key}</b> ({busiest.n}).</> });
    if (pmPrev && pmLast && pmPrev.n !== pmLast.n) story.push({ tone: "info", text: <>Inspections {pmLast.n > pmPrev.n ? "rose" : "fell"} from {pmPrev.n} in {pmPrev.name} to <b>{pmLast.n}</b> in {pmLast.name}{(pmLast && Date.now() / 1000 < (months[months.length - 1]?.e ?? 0) ? " so far" : "")}.</> });
    if (withFaults.length) story.push({ tone: "attention", text: <>{Math.round((withFaults.length / Math.max(1, submitted.length)) * 100)}% of the reports found at least one fault.</> });
    if (drafts.length) story.push({ tone: "worse", text: <>{drafts.length} report{drafts.length === 1 ? " was" : "s were"} started but not submitted yet.</> });
  }

  const exportTables = () => [
    { name: "By stage", rows: byStage.map((b) => ({ Stage: b.key, Reports: b.n, "With faults": b.faults, Units: b.units })) },
    { name: "Over time", rows: trend.map((t) => ({ Period: t.name, ...Object.fromEntries(usedStages.map((st) => [st.key, t[st.key]])), Total: usedStages.reduce((a, st) => a + t[st.key], 0) })) },
    { name: pick === "drafts" ? "Drafts" : "Reports", rows: list.map((r) => ({ Report: `#${r.id}`, Unit: code(r.asset_id), Component: r.component, Stage: stageLabel(r), Status: r.status, Submitted: fmtDate(r.submitted_at), "Submitted by": r.submitted_by, Started: fmtDate(r.created_at), Faults: r.fault_count })) },
  ];

  const loading = Loading({ isLoading, error });
  if (loading) return loading;

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">MR-I reports submitted in <b>{p.label}</b>, by compliance stage. Drafts not yet submitted are counted as they are now.</p>
        <ExportMenu dashboardNo={11} title="MR-I reports per period" filters={filters} tables={exportTables} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        <Tile k="all" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Reports submitted" value={submitted.length} sub={`on ${units} unit${units === 1 ? "" : "s"}`}
          extra={<><TrendDelta now={pmLast?.n ?? null} prev={pmPrev?.n ?? null} lowerIsBetter={false} label={pmPrev ? `${pmLast?.name}${(pmLast && Date.now() / 1000 < (months[months.length - 1]?.e ?? 0) ? " so far" : "")} vs ${pmPrev.name}` : ""} /><Sparkline values={perMonth.map((m) => m.n)} color="var(--accent-blue, #2f6fed)" title="Reports submitted per month" /></>} />
        <Tile k="faults" pick={pick} setPick={setPick} color="var(--danger)" label="Reports with faults" value={withFaults.length} sub={submitted.length ? `${Math.round((withFaults.length / submitted.length) * 100)}% of submitted reports` : "—"} />
        <Tile k="drafts" pick={pick} setPick={setPick} color="var(--text-soft)" label="Drafts not submitted" value={drafts.length} sub="Started but not yet submitted (now)" />
        <div className="mrid-kpi" style={{ ["--kpi" as string]: "var(--success)" }}>
          <div className="mrid-kpi-head"><span>By stage</span></div>
          <div className="mrid-kpi-sub" style={{ display: "grid", gap: 3, marginTop: 6 }}>
            {byStage.map((b) => (
              <button key={b.key} type="button" className="mrid-sev" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left" }} onClick={() => setStagePick((v) => (v === b.key ? null : b.key))}>
                <i className="mrid-dot" style={{ background: b.color }} />{b.key}: <b>{b.n}</b>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Reports submitted over the period</h3></div>
        {submitted.length === 0 ? <p className="mrid-note">No reports were submitted in this period.</p> : (
          <>
            <div style={{ width: "100%", height: 250 }}>
              <ResponsiveContainer>
                {stream ? (
                  <AreaChart data={trend} stackOffset="wiggle" margin={{ top: 10, right: 16, bottom: 4, left: 16 }} style={{ cursor: "pointer" }}
                    onClick={(st) => { const i = Number(st?.activeIndex); const b = Number.isFinite(i) ? trend[i] : undefined; if (b) setBucketPick({ name: b.name, s: b.s, e: b.e }); }}>
                    <XAxis dataKey="name" tick={AX} interval="preserveStartEnd" minTickGap={12} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={TT} />
                    {usedStages.map((st) => <Area key={st.key} type="monotone" dataKey={st.key} stackId="s" stroke={st.color} strokeWidth={1} fill={st.color} fillOpacity={0.7} animationDuration={900} />)}
                  </AreaChart>
                ) : (
                  <BarChart data={trend} margin={{ top: 10, right: 16, bottom: 4, left: 0 }} style={{ cursor: "pointer" }}
                    onClick={(st) => { const i = Number(st?.activeIndex); const b = Number.isFinite(i) ? trend[i] : undefined; if (b) setBucketPick({ name: b.name, s: b.s, e: b.e }); }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" tick={AX} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis allowDecimals={false} tick={AX} width={32} />
                    <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} />
                    {usedStages.map((st) => <Bar key={st.key} dataKey={st.key} stackId="s" fill={st.color} maxBarSize={34} />)}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="mrid-legend">{usedStages.map((st) => <span key={st.key}><i style={{ background: st.color }} />{st.key === "Other" ? "Other / not set" : st.key}</span>)}</div>
            <p className="mrid-note" style={{ textAlign: "center" }}>Click a bar to list those reports.</p>
          </>
        )}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>{pick === "drafts" ? "Drafts not yet submitted" : "Reports"} ({list.length})</h3></div>
        <DrillChips onClear={clearAll} chips={[pick === "faults" && <b>With faults</b>, pick === "drafts" && <b>Drafts</b>, stagePick && <>Stage: <b>{stagePick}</b></>, bucketPick && <>Submitted: <b>{bucketPick.name}</b></>]} />
        {list.length === 0 ? <p className="mrid-note">No reports match.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Report</th><th>Unit</th><th>Stage</th><th>Status</th><th>{pick === "drafts" ? "Started" : "Submitted"}</th><th>By</th><th>Faults</th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id}>
                <td>{r.status === "Draft" ? `#${r.id}` : <PreviewButton reportId={r.id} />}</td>
                <td><b>{code(r.asset_id)}</b>{r.component ? <span className="mrid-soft"> · {r.component}</span> : null}</td>
                <td><span className="mrid-sev"><i className="mrid-dot" style={{ background: stageColor(stageOf(r)) }} />{stageLabel(r)}</span></td>
                <td>{r.status}</td><td>{fmtDate(pick === "drafts" ? r.created_at : r.submitted_at)}</td><td>{r.submitted_by ?? "—"}</td>
                <td className={r.fault_count ? "mrid-over" : undefined}>{r.fault_count}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
