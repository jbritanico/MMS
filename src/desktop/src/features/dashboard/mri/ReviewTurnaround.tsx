import { useMemo, useState } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { fmtDate, sevKey, SEVERITIES, type DashboardFilters, type MriDashboardAsset } from "../hooks/useMriDashboards";
import ExportMenu from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { changeLine, Sparkline, StoryStrip, TrendDelta, type StoryLine } from "./fluid";
import { AX, avg, DrillChips, fmtDur, inRange, Loading, median, monthsFor, period, Tile, toDays, trimLeading, TT, useMore } from "./kit";

// Dashboard 6: Review turnaround.
// (1) Submit -> fault decision: from the report's Submit to the recorded decision on each escalated fault.
// (2) Submit -> report closure: from Submit to the report being closed (Approved).
// Counted for decisions / closures that happened in the period.

type Pick = "decisions" | "closures" | "slow" | null;
const SLOW_DAYS = 7;

export function ReviewTurnaroundMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { decisions, reports } = useMore(assets);
  const d = new Date();
  const s = Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000), e = Math.floor(Date.now() / 1000) + 1;
  const dec = decisions.filter((x) => inRange(x.decided_at, s, e) && x.report_submitted_at != null).map((x) => x.decided_at! - x.report_submitted_at!);
  const clo = reports.filter((r) => r.status === "Approved" && inRange(r.approved_at, s, e) && r.submitted_at != null).map((r) => r.approved_at! - r.submitted_at!);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item" title="This month, average">To decision <b>{fmtDur(avg(dec))}</b></span>
      <span className="mrid-mini-item" title="This month, average">To closure <b>{fmtDur(avg(clo))}</b></span>
    </div>
  );
}

export default function ReviewTurnaround({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const { decisions, reports, unitOf, isLoading, error } = useMore(assets);
  const p = period(filters);
  const [pick, setPick] = useState<Pick>(null);
  const [monthPick, setMonthPick] = useState<{ name: string; s: number; e: number } | null>(null);
  const [reviewerPick, setReviewerPick] = useState<string | null>(null);
  const [tab, setTab] = useState<"decisions" | "closures">("decisions");
  const s = monthPick?.s ?? p.s, e = monthPick?.e ?? p.e;
  const clearAll = () => { setPick(null); setMonthPick(null); setReviewerPick(null); };

  const decRows = (ss: number, ee: number) =>
    decisions
      .filter((x) => inRange(x.decided_at, ss, ee) && x.report_submitted_at != null)
      .map((x) => ({ x, secs: Math.max(0, x.decided_at! - x.report_submitted_at!) }));
  const cloRows = (ss: number, ee: number) =>
    reports
      .filter((r) => r.status === "Approved" && inRange(r.approved_at, ss, ee) && r.submitted_at != null)
      .map((r) => ({ r, secs: Math.max(0, r.approved_at! - r.submitted_at!) }));

  const dec = decRows(s, e);
  const clo = cloRows(s, e);
  const decSecs = dec.map((d) => d.secs), cloSecs = clo.map((c) => c.secs);
  const slowDec = dec.filter((d) => d.secs > SLOW_DAYS * 86400).length + clo.filter((c) => c.secs > SLOW_DAYS * 86400).length;

  const months = useMemo(() => monthsFor(p.from, p.to), [p.from.getTime(), p.to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const trend = trimLeading(
    months.map((m) => {
      const a = decRows(m.s, m.e).map((d) => d.secs), b = cloRows(m.s, m.e).map((c) => c.secs);
      return { ...m, "Submit to decision": toDays(avg(a)), "Submit to closure": toDays(avg(b)), n: a.length + b.length };
    }),
    (r) => r.n > 0,
  );

  const byReviewer = useMemo(() => {
    const m = new Map<string, number[]>();
    dec.forEach((d) => { const k = d.x.reviewer?.trim() || "Not recorded"; m.set(k, [...(m.get(k) ?? []), d.secs]); });
    return [...m.entries()].map(([name, l]) => ({ name, days: toDays(avg(l)), count: l.length })).sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  }, [dec.length, s, e]); // eslint-disable-line react-hooks/exhaustive-deps

  const bySev = SEVERITIES.map((sv) => {
    const l = dec.filter((d) => sevKey(d.x.original_severity ?? "") === sv.key).map((d) => d.secs);
    return { key: sv.key, color: sv.color, n: l.length, avg: avg(l) };
  });

  const decList = dec
    .filter((d) => (pick !== "slow" || d.secs > SLOW_DAYS * 86400) && (reviewerPick == null || (d.x.reviewer?.trim() || "Not recorded") === reviewerPick))
    .sort((a, b) => b.secs - a.secs);
  const cloList = clo.filter((c) => pick !== "slow" || c.secs > SLOW_DAYS * 86400).sort((a, b) => b.secs - a.secs);
  const showTab = pick === "decisions" ? "decisions" : pick === "closures" ? "closures" : reviewerPick ? "decisions" : tab;

  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const periodName = monthPick?.name ?? p.label;
  // ---- fluid layer ----
  const decSeries = trend.map((m) => m["Submit to decision"]).filter((x): x is number => x != null);
  const cloSeries = trend.map((m) => m["Submit to closure"]).filter((x): x is number => x != null);
  const lastM = trend.length ? trend[trend.length - 1] : null, prevM = trend.length > 1 ? trend[trend.length - 2] : null;
  const story: StoryLine[] = [];
  {
    const slowest = [...dec].sort((a, b) => b.secs - a.secs)[0];
    if (slowest && slowest.secs > SLOW_DAYS * 86400) story.push({ tone: "attention", text: <>Slowest decision: <b>{slowest.x.item ?? "a fault"}</b> on {code(slowest.x.asset_id)} took <b>{fmtDur(slowest.secs)}</b>{slowest.x.reviewer ? <> ({slowest.x.reviewer})</> : null}.</> });
    if (!monthPick && lastM && prevM) {
      const c1 = changeLine(<>Average time to a fault decision</>, prevM["Submit to decision"], lastM["Submit to decision"], prevM.name, true, " days");
      const c2 = changeLine(<>Average time to close a report</>, prevM["Submit to closure"], lastM["Submit to closure"], prevM.name, true, " days");
      if (c1) story.push(c1);
      if (c2) story.push(c2);
    }
    const slowRev = byReviewer[0];
    if (slowRev && byReviewer.length > 1) story.push({ tone: "info", text: <><b>{slowRev.name}</b> takes the longest to decide on average ({slowRev.days} days over {slowRev.count} decision{slowRev.count === 1 ? "" : "s"}).</> });
  }

  const exportTables = () => [
    {
      name: "Summary",
      rows: [
        { Measure: "Submit to fault decision", Count: dec.length, "Average (days)": toDays(avg(decSecs)), "Median (days)": toDays(median(decSecs)), "Longest (days)": toDays(decSecs.length ? Math.max(...decSecs) : null) },
        { Measure: "Submit to report closure", Count: clo.length, "Average (days)": toDays(avg(cloSecs)), "Median (days)": toDays(median(cloSecs)), "Longest (days)": toDays(cloSecs.length ? Math.max(...cloSecs) : null) },
        ...bySev.map((b) => ({ Measure: `Submit to decision, ${b.key}`, Count: b.n, "Average (days)": toDays(b.avg), "Median (days)": null, "Longest (days)": null })),
      ],
    },
    { name: "By month", rows: trend.map((t) => ({ Month: t.name, "Submit to decision (days)": t["Submit to decision"], "Submit to closure (days)": t["Submit to closure"] })) },
    { name: "By reviewer", rows: byReviewer.map((r) => ({ Reviewer: r.name, Decisions: r.count, "Average days": r.days })) },
    { name: "Decisions", rows: decList.map(({ x, secs }) => ({ Unit: code(x.asset_id), Item: x.item, Severity: sevKey(x.original_severity ?? ""), Decision: x.decision, Reviewer: x.reviewer, Method: x.review_method, Submitted: fmtDate(x.report_submitted_at), Decided: fmtDate(x.decided_at), Days: toDays(secs), Report: `#${x.report_id}` })) },
    { name: "Reports closed", rows: cloList.map(({ r, secs }) => ({ Report: `#${r.id}`, Unit: code(r.asset_id), Stage: r.compliance_stage, Faults: r.fault_count, Submitted: fmtDate(r.submitted_at), Closed: fmtDate(r.approved_at), "Closed by": r.approved_by, Days: toDays(secs) })) },
  ];

  const loading = Loading({ isLoading, error });
  if (loading) return loading;

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">How long reviews took, for decisions and closures made in <b>{periodName}</b>. Both are counted from the moment the report was submitted.</p>
        <ExportMenu dashboardNo={6} title="Review turnaround" filters={filters} tables={exportTables} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        <Tile k="decisions" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Submit → fault decision" value={fmtDur(avg(decSecs))}
          extra={<><TrendDelta now={monthPick ? null : lastM?.["Submit to decision"] ?? null} prev={prevM?.["Submit to decision"] ?? null} unit=" d" label={prevM ? `vs ${prevM.name}` : ""} /><Sparkline values={decSeries} color="var(--accent-blue, #2f6fed)" title="Average days to a decision, by month" /></>}
          sub={<>average of {dec.length} decision{dec.length === 1 ? "" : "s"} · median {fmtDur(median(decSecs))}</>} />
        <Tile k="closures" pick={pick} setPick={setPick} color="var(--success)" label="Submit → report closed" value={fmtDur(avg(cloSecs))}
          extra={<><TrendDelta now={monthPick ? null : lastM?.["Submit to closure"] ?? null} prev={prevM?.["Submit to closure"] ?? null} unit=" d" label={prevM ? `vs ${prevM.name}` : ""} /><Sparkline values={cloSeries} color="var(--success)" title="Average days to close, by month" /></>}
          sub={<>average of {clo.length} report{clo.length === 1 ? "" : "s"} · median {fmtDur(median(cloSecs))}</>} />
        <Tile k="slow" pick={pick} setPick={setPick} color="var(--danger)" label={`Took over ${SLOW_DAYS} days`} value={slowDec} sub="Decisions and closures together" />
        <div className="mrid-kpi" style={{ ["--kpi" as string]: "var(--text-soft)" }}>
          <div className="mrid-kpi-head"><span>Decision time by severity</span></div>
          <div className="mrid-kpi-sub" style={{ display: "grid", gap: 4, marginTop: 6 }}>
            {bySev.map((b) => (
              <span key={b.key} className="mrid-sev"><i className="mrid-dot" style={{ background: b.color }} />{b.key}: <b>{fmtDur(b.avg)}</b> ({b.n})</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Average days by month</h3></div>
        {trend.length === 0 ? <p className="mrid-note">No decisions or closures in these months.</p> : (
          <>
            <div style={{ width: "100%", height: 250 }}>
              <ResponsiveContainer>
                {trend.length >= 3 ? (
                  <AreaChart data={trend} margin={{ top: 10, right: 16, bottom: 4, left: 0 }} style={{ cursor: "pointer" }}
                    onClick={(st) => { const i = Number(st?.activeIndex); const m = Number.isFinite(i) ? trend[i] : undefined; if (m) setMonthPick({ name: m.name, s: m.s, e: m.e }); }}>
                    <defs>
                      <linearGradient id="rt-dec" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--accent-blue, #2f6fed)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--accent-blue, #2f6fed)" stopOpacity={0} /></linearGradient>
                      <linearGradient id="rt-clo" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--success)" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" tick={AX} />
                    <YAxis tick={AX} width={36} />
                    <Tooltip contentStyle={TT} formatter={(v) => (v == null ? "None" : `${v} days`)} />
                    <Area type="monotone" dataKey="Submit to decision" stroke="var(--accent-blue, #2f6fed)" strokeWidth={2.2} fill="url(#rt-dec)" connectNulls animationDuration={800} />
                    <Area type="monotone" dataKey="Submit to closure" stroke="var(--success)" strokeWidth={2.2} fill="url(#rt-clo)" connectNulls animationDuration={800} />
                  </AreaChart>
                ) : (
                  <BarChart data={trend} margin={{ top: 10, right: 16, bottom: 4, left: 0 }} style={{ cursor: "pointer" }}
                    onClick={(st) => { const i = Number(st?.activeIndex); const m = Number.isFinite(i) ? trend[i] : undefined; if (m) setMonthPick({ name: m.name, s: m.s, e: m.e }); }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" tick={AX} />
                    <YAxis tick={AX} width={36} />
                    <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} formatter={(v) => (v == null ? "None" : `${v} days`)} />
                    <Bar dataKey="Submit to decision" fill="var(--accent-blue, #2f6fed)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="Submit to closure" fill="var(--success)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="mrid-legend"><span><i style={{ background: "var(--accent-blue, #2f6fed)" }} />Submit to decision</span><span><i style={{ background: "var(--success)" }} />Submit to closure</span></div>
            <p className="mrid-note" style={{ textAlign: "center" }}>Click a month to see its numbers and lists.</p>
          </>
        )}
      </div>

      {byReviewer.length > 0 && (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>Decision time by reviewer</h3></div>
          <div style={{ width: "100%", height: Math.max(130, byReviewer.length * 40 + 50) }}>
            <ResponsiveContainer>
              <BarChart data={byReviewer} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={AX} unit=" d" />
                <YAxis type="category" dataKey="name" width={170} tick={{ fill: "var(--text)", fontSize: 12 }} />
                <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} formatter={(v, _n, it) => [`${v} days (${(it?.payload as { count: number }).count} decisions)`, "Average"]} />
                <Bar dataKey="days" fill="var(--accent-blue, #2f6fed)" maxBarSize={24} cursor="pointer" onClick={(_, i) => { const r = byReviewer[i]; if (r) setReviewerPick(r.name); }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mrid-note" style={{ textAlign: "center" }}>Click a reviewer to list their decisions.</p>
        </div>
      )}

      <div className="mrid-panel">
        <div className="mrid-panel-head">
          <h3>Details for {periodName}</h3>
          <div className="mrid-tabs">
            <button type="button" className={showTab === "decisions" ? "is-on" : ""} onClick={() => { setTab("decisions"); if (pick === "closures") setPick(null); }}>Fault decisions ({decList.length})</button>
            <button type="button" className={showTab === "closures" ? "is-on" : ""} onClick={() => { setTab("closures"); setReviewerPick(null); if (pick === "decisions") setPick(null); }}>Reports closed ({cloList.length})</button>
          </div>
        </div>
        <DrillChips onClear={clearAll} chips={[pick === "slow" && <b>Over {SLOW_DAYS} days</b>, monthPick && <>Month: <b>{monthPick.name}</b></>, reviewerPick && <>Reviewer: <b>{reviewerPick}</b></>]} />
        {showTab === "decisions" ? (
          decList.length === 0 ? <p className="mrid-note">No fault decisions in this time.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Unit</th><th>Item</th><th>Severity</th><th>Decision</th><th>Reviewer</th><th>Submitted</th><th>Decided</th><th>Took</th><th>MR-I report</th></tr></thead>
              <tbody>{decList.map(({ x, secs }) => (
                <tr key={x.approval_id}>
                  <td><b>{code(x.asset_id)}</b></td><td>{x.item ?? "—"}</td><td>{sevKey(x.original_severity ?? "")}</td>
                  <td>{x.decision}{x.new_severity ? <span className="mrid-soft"> → {x.new_severity}</span> : null}</td>
                  <td>{x.reviewer ?? "—"}{x.review_method ? <div className="mrid-soft">{x.review_method}</div> : null}</td>
                  <td>{fmtDate(x.report_submitted_at)}</td><td>{fmtDate(x.decided_at)}</td>
                  <td className={secs > SLOW_DAYS * 86400 ? "mrid-over" : undefined}>{fmtDur(secs)}</td>
                  <td><PreviewButton reportId={x.report_id} /></td>
                </tr>))}</tbody>
            </table></div>)
        ) : cloList.length === 0 ? <p className="mrid-note">No reports were closed in this time.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Report</th><th>Unit</th><th>Stage</th><th>Faults</th><th>Submitted</th><th>Closed</th><th>Closed by</th><th>Took</th></tr></thead>
            <tbody>{cloList.map(({ r, secs }) => (
              <tr key={r.id}>
                <td><PreviewButton reportId={r.id} /></td><td><b>{code(r.asset_id)}</b>{r.component ? <span className="mrid-soft"> · {r.component}</span> : null}</td>
                <td>{r.compliance_stage ?? "—"}</td><td>{r.fault_count}</td><td>{fmtDate(r.submitted_at)}</td><td>{fmtDate(r.approved_at)}</td><td>{r.approved_by ?? "—"}</td>
                <td className={secs > SLOW_DAYS * 86400 ? "mrid-over" : undefined}>{fmtDur(secs)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
