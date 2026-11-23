import { useMemo, useState } from "react";
import { fmtDate, useMriDashboardDetails, type DashboardFilters, type MriDashboardAsset, type MriDashReport } from "../hooks/useMriDashboards";
import ExportMenu from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { StoryStrip, type StoryLine } from "./fluid";
import { DAY, DrillChips, inRange, Loading, nowSecs, period, Tile, useMore } from "./kit";

// Dashboards 20-23 from the MR-I reports list (Tier 2):
// 20 Inspection sequence per job, 21 On-site repairs log, 22 Sign-off completeness, 23 Data quality.
// All read only, from the same country-scoped data as the other dashboards.

const stageKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const isPre = (s: string | null | undefined) => ["PREJOB", "PREMOB"].includes(stageKey(s));
const isPost = (s: string | null | undefined) => stageKey(s) === "POSTJOB";
const STAGE_NAME: Record<string, string> = { PREMOB: "Pre-Mob", PREJOB: "Pre-Job", POSTJOB: "Post-Job", YARDINSPECTION: "Yard inspection", YARD: "Yard inspection" };
export const stageName = (s: string | null | undefined) => STAGE_NAME[stageKey(s)] ?? (s?.trim() || "No stage");
const norm = (s: string) => s.trim().toLowerCase();
const t = (r: MriDashReport) => r.submitted_at ?? r.created_at ?? 0;
const sent = (r: MriDashReport) => r.status !== "Draft";

/** Header, distance and sign-off values plus checklist answers, for the reports of the units on screen. */
export function useDetails(assets: MriDashboardAsset[]) {
  const more = useMore(assets);
  const { data, isLoading, error } = useMriDashboardDetails();
  return useMemo(() => {
    const ids = new Set(more.reports.map((r) => r.id));
    const index = (l: { report_id: number; label: string; value: string }[] | undefined) => {
      const m = new Map<number, Map<string, string>>();
      (l ?? []).forEach((v) => { if (!ids.has(v.report_id)) return; const x = m.get(v.report_id) ?? new Map<string, string>(); x.set(norm(v.label), v.value ?? ""); m.set(v.report_id, x); });
      return m;
    };
    const header = index(data?.header), mid = index(data?.mid), footer = index(data?.footer);
    const unitIds = new Set(assets.map((a) => a.id));
    return {
      ...more,
      header, mid, footer,
      /** Value of a header field on a report, by label (case does not matter). */
      h: (id: number, label: string) => (header.get(id)?.get(norm(label)) ?? "").trim(),
      results: (data?.results ?? []).filter((r) => ids.has(r.report_id)),
      onsite: (data?.onsite_repairs ?? []).filter((r) => unitIds.has(r.asset_id)),
      isLoading: more.isLoading || isLoading,
      error: more.error ?? error,
    };
  }, [more, data, isLoading, error, assets]);
}

// ===================================================================== 20 Inspection sequence per job
type SeqPick = "posts" | "ok" | "missing" | "open" | "premob" | null;
function useSequence(assets: MriDashboardAsset[], s: number, e: number) {
  const d = useDetails(assets);
  return useMemo(() => {
    const done = d.reports.filter(sent);
    const same = (a: MriDashReport, b: MriDashReport) => a.asset_id === b.asset_id && (a.component ?? "") === (b.component ?? "");
    const posts = done.filter((r) => isPost(r.compliance_stage) && inRange(r.submitted_at, s, e)).sort((a, b) => t(b) - t(a)).map((post) => {
      const before = done.filter((r) => r.id !== post.id && same(r, post) && isPre(r.compliance_stage) && t(r) <= t(post));
      const pre = before.filter((r) => stageKey(r.compliance_stage) === "PREJOB").sort((a, b) => t(b) - t(a))[0] ?? before.sort((a, b) => t(b) - t(a))[0];
      return { post, pre: pre ?? null };
    });
    const openPre = done.filter((r) => stageKey(r.compliance_stage) === "PREJOB" && inRange(r.submitted_at, s, e)
      && !done.some((x) => x.id !== r.id && same(x, r) && isPost(x.compliance_stage) && t(x) >= t(r)));
    const premob = done.filter((r) => stageKey(r.compliance_stage) === "PREMOB" && inRange(r.submitted_at, s, e)).map((r) => {
      const post = done.filter((x) => same(x, r) && isPost(x.compliance_stage) && t(x) <= (r.created_at ?? t(r)) && (r.created_at ?? t(r)) - t(x) <= 3 * DAY).sort((a, b) => t(b) - t(a))[0];
      return post ? { premob: r, post } : null;
    }).filter((x): x is { premob: MriDashReport; post: MriDashReport } => !!x);
    return { ...d, posts, openPre, premob };
  }, [d, s, e]);
}

export function InspectionSequenceMini({ assets }: { assets: MriDashboardAsset[] }) {
  const now = nowSecs();
  const { posts } = useSequence(assets, now - 30 * DAY, now + 1);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">Post-Job, 30 d <b>{posts.length}</b></span>
      <span className="mrid-mini-item">No Pre-Job before <b>{posts.filter((x) => !x.pre).length}</b></span>
    </div>
  );
}

export function InspectionSequence({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { posts, openPre, premob, unitOf, h, isLoading, error } = useSequence(assets, p.s, p.e);
  const [pick, setPick] = useState<SeqPick>(null);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const missing = posts.filter((x) => !x.pre);
  const shown = pick === "missing" ? missing : pick === "ok" ? posts.filter((x) => x.pre) : posts;
  const days = (a: MriDashReport, b: MriDashReport) => Math.max(0, Math.round((t(b) - t(a)) / DAY));
  const story: StoryLine[] = [];
  if (missing.length) story.push({ tone: "attention", text: <><b>{missing.length}</b> of {posts.length} Post-Job report{posts.length === 1 ? "" : "s"} in {p.label} had no Pre-Job (or Pre-Mob) report before it on the same unit.</> });
  else if (posts.length) story.push({ tone: "better", text: <>Every Post-Job report in {p.label} has a Pre-Job or Pre-Mob report before it.</> });
  if (openPre.length) story.push({ tone: "info", text: <>{openPre.length} Pre-Job report{openPre.length === 1 ? " has" : "s have"} no Post-Job yet (the job may still be running).</> });
  if (premob.length) story.push({ tone: "info", text: <>{premob.length} Pre-Mob report{premob.length === 1 ? " was" : "s were"} started within 72 hours of a Post-Job on the same unit.</> });
  const row = (x: { post: MriDashReport; pre: MriDashReport | null }) => ({
    Unit: code(x.post.asset_id), Part: x.post.component, "Job number": h(x.post.id, "job number") || null, Client: h(x.post.id, "client") || null,
    "Before the job": x.pre ? `${stageName(x.pre.compliance_stage)} #${x.pre.id} (${fmtDate(t(x.pre))})` : "None", "Post-Job": `#${x.post.id} (${fmtDate(t(x.post))})`,
    "Days between": x.pre ? days(x.pre, x.post) : null,
  });
  const exportTables = () => [
    { name: "Summary", rows: [{ Measure: "Post-Job reports", Value: posts.length }, { Measure: "With a Pre-Job or Pre-Mob before", Value: posts.length - missing.length }, { Measure: "No report before the job", Value: missing.length }, { Measure: "Pre-Job reports with no Post-Job yet", Value: openPre.length }, { Measure: "Pre-Mob within 72 h of a Post-Job", Value: premob.length }] },
    { name: "Jobs", rows: posts.map(row) },
    { name: "Pre-Job no Post-Job yet", rows: openPre.map((r) => ({ Unit: code(r.asset_id), Part: r.component, Report: `#${r.id}`, Sent: fmtDate(r.submitted_at), "Checklist ID": h(r.id, "pre-mobilization checklist id") || null })) },
    { name: "Pre-Mob after Post-Job", rows: premob.map((x) => ({ Unit: code(x.premob.asset_id), "Post-Job": `#${x.post.id} (${fmtDate(t(x.post))})`, "Pre-Mob": `#${x.premob.id} (${fmtDate(x.premob.created_at)})` })) },
  ];
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Post-Job reports sent in <b>{p.label}</b>, each matched to the last Pre-Job (or Pre-Mob) report before it on the same unit and part. A Pre-Job report carries the Pre-Mobilization Checklist ID, not the job number, so the match is by unit and date.</p>
        <ExportMenu dashboardNo={20} title="Inspection Sequence per Job" filters={filters} tables={exportTables} />
      </div>
      <StoryStrip lines={story} />
      <div className="mrid-kpis">
        <Tile k="posts" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Post-Job reports" value={posts.length} sub={`sent in ${p.label}`} />
        <Tile k="ok" pick={pick} setPick={setPick} color="var(--success)" label="With a report before the job" value={posts.length - missing.length} sub="Pre-Job or Pre-Mob found" />
        <Tile k="missing" pick={pick} setPick={setPick} color="var(--danger)" label="No report before the job" value={missing.length} sub="no Pre-Job or Pre-Mob on that unit" />
        <Tile k="open" pick={pick} setPick={setPick} color="var(--warn)" label="Pre-Job, no Post-Job yet" value={openPre.length} sub="job may still be running" />
        <Tile k="premob" pick={pick} setPick={setPick} color="var(--text-soft)" label="Pre-Mob within 72 h of a Post-Job" value={premob.length} sub="often copied from the Post-Job" />
      </div>
      {pick === "open" ? (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>Pre-Job reports with no Post-Job yet ({openPre.length})</h3></div>
          <DrillChips onClear={() => setPick(null)} chips={[<b>Pre-Job, no Post-Job yet</b>]} />
          {openPre.length === 0 ? <p className="mrid-note mrid-empty">None.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Unit</th><th>Pre-Job</th><th>Sent</th><th>Checklist ID</th><th>Waiting</th></tr></thead>
              <tbody>{openPre.map((r) => (<tr key={r.id}><td><b>{code(r.asset_id)}</b>{r.component ? <span className="mrid-soft"> · {r.component}</span> : null}</td><td><PreviewButton reportId={r.id} /></td><td>{fmtDate(r.submitted_at)}</td><td>{h(r.id, "pre-mobilization checklist id") || "—"}</td><td>{Math.round((nowSecs() - t(r)) / DAY)} d</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      ) : pick === "premob" ? (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>Pre-Mob reports started within 72 h of a Post-Job ({premob.length})</h3></div>
          <DrillChips onClear={() => setPick(null)} chips={[<b>Pre-Mob within 72 h of a Post-Job</b>]} />
          {premob.length === 0 ? <p className="mrid-note mrid-empty">None.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Unit</th><th>Post-Job</th><th>Pre-Mob</th><th>Hours between</th></tr></thead>
              <tbody>{premob.map((x) => (<tr key={x.premob.id}><td><b>{code(x.premob.asset_id)}</b></td><td><PreviewButton reportId={x.post.id} /> {fmtDate(t(x.post))}</td><td><PreviewButton reportId={x.premob.id} /> {fmtDate(x.premob.created_at)}</td><td>{Math.round(((x.premob.created_at ?? t(x.premob)) - t(x.post)) / 3600)} h</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      ) : (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>Jobs ({shown.length})</h3></div>
          <DrillChips onClear={() => setPick(null)} chips={[pick === "missing" && <b>No report before the job</b>, pick === "ok" && <b>With a report before the job</b>]} />
          {shown.length === 0 ? <p className="mrid-note mrid-empty">No Post-Job reports match.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Unit</th><th>Job number</th><th>Client</th><th>Before the job</th><th>Post-Job</th><th>Days between</th></tr></thead>
              <tbody>{shown.map((x) => (
                <tr key={x.post.id}>
                  <td><b>{code(x.post.asset_id)}</b>{x.post.component ? <span className="mrid-soft"> · {x.post.component}</span> : null}</td>
                  <td>{h(x.post.id, "job number") || <span className="mrid-soft">—</span>}</td>
                  <td>{h(x.post.id, "client") || <span className="mrid-soft">—</span>}</td>
                  <td>{x.pre ? <>{stageName(x.pre.compliance_stage)} <PreviewButton reportId={x.pre.id} /> <span className="mrid-soft">{fmtDate(t(x.pre))}</span></> : <span className="mrid-over">None</span>}</td>
                  <td><PreviewButton reportId={x.post.id} /> <span className="mrid-soft">{fmtDate(t(x.post))}</span></td>
                  <td>{x.pre ? days(x.pre, x.post) : "—"}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}

// ===================================================================== 21 On-site repairs log
export function OnsiteRepairsMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { onsite } = useDetails(assets);
  const now = nowSecs();
  const l = onsite.filter((r) => inRange(r.repaired_at, now - 30 * DAY, now + 1));
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">Repaired on site, 30 d <b>{l.length}</b></span>
      <span className="mrid-mini-item">Units <b>{new Set(l.map((r) => r.asset_id)).size}</b></span>
    </div>
  );
}

export function OnsiteRepairs({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { onsite, unitOf, isLoading, error } = useDetails(assets);
  const [unitPick, setUnitPick] = useState<number | null>(null);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const inP = onsite.filter((r) => inRange(r.repaired_at, p.s, p.e)).sort((a, b) => (b.repaired_at ?? 0) - (a.repaired_at ?? 0));
  const byUnit = [...new Set(inP.map((r) => r.asset_id))].map((id) => ({ id, n: inP.filter((r) => r.asset_id === id).length, items: [...new Set(inP.filter((r) => r.asset_id === id).map((r) => r.item ?? "—"))] })).sort((a, b) => b.n - a.n);
  const byItem = [...new Set(inP.map((r) => r.item ?? "—"))].map((i) => ({ i, n: inP.filter((r) => (r.item ?? "—") === i).length })).sort((a, b) => b.n - a.n);
  const people = new Set(inP.map((r) => (r.repaired_by ?? "").trim().toLowerCase()).filter(Boolean));
  const list = unitPick == null ? inP : inP.filter((r) => r.asset_id === unitPick);
  const story: StoryLine[] = [];
  if (byUnit[0] && byUnit[0].n > 1) story.push({ tone: "attention", text: <><b>{code(byUnit[0].id)}</b> was repaired on site {byUnit[0].n} times in {p.label}. Repeated quick fixes may need a planned repair.</> });
  if (byItem[0]) story.push({ tone: "info", text: <><b>{byItem[0].i}</b> is the item fixed on site most often ({byItem[0].n}).</> });
  if (!inP.length) story.push({ tone: "info", text: <>No on-site repairs were recorded in {p.label}.</> });
  const exportTables = () => [
    { name: "Repairs", rows: inP.map((r) => ({ Date: fmtDate(r.repaired_at), Unit: code(r.asset_id), Item: r.item, Severity: r.severity, "What was done": r.action_taken, By: r.repaired_by, Report: `#${r.report_id}` })) },
    { name: "By unit", rows: byUnit.map((u) => ({ Unit: code(u.id), "On-site repairs": u.n, Items: u.items.join(", ") })) },
  ];
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Minor faults repaired on site with a function test, recorded on MR-I reports in <b>{p.label}</b>.</p>
        <ExportMenu dashboardNo={21} title="On-site Repairs Log" filters={filters} tables={exportTables} />
      </div>
      <StoryStrip lines={story} />
      <div className="mrid-kpis">
        <div className="mrid-kpi"><div className="mrid-kpi-head"><span>Repaired on site</span></div><div className="mrid-kpi-value">{inP.length}</div><div className="mrid-kpi-sub">in {p.label}</div></div>
        <div className="mrid-kpi"><div className="mrid-kpi-head"><span>Units</span></div><div className="mrid-kpi-value">{byUnit.length}</div><div className="mrid-kpi-sub">{byUnit.filter((u) => u.n > 1).length} with more than one</div></div>
        <div className="mrid-kpi"><div className="mrid-kpi-head"><span>People</span></div><div className="mrid-kpi-value">{people.size}</div><div className="mrid-kpi-sub">who did the repairs</div></div>
        <div className="mrid-kpi"><div className="mrid-kpi-head"><span>Fixed most often</span></div><div className="mrid-kpi-value" style={{ fontSize: 20 }}>{byItem[0]?.i ?? "—"}</div><div className="mrid-kpi-sub">{byItem[0] ? `${byItem[0].n} time${byItem[0].n === 1 ? "" : "s"}` : "No repairs"}</div></div>
      </div>
      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>By unit ({byUnit.length})</h3></div>
        {byUnit.length === 0 ? <p className="mrid-note mrid-empty">None.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Unit</th><th>On-site repairs</th><th>Items</th></tr></thead>
            <tbody>{byUnit.map((u) => (<tr key={u.id} className="mrid-click" onClick={() => setUnitPick((v) => (v === u.id ? null : u.id))} style={unitPick === u.id ? { outline: "2px solid var(--accent)" } : undefined}><td><b>{code(u.id)}</b></td><td>{u.n}</td><td className="mrid-soft">{u.items.join(", ")}</td></tr>))}</tbody>
          </table><p className="mrid-note">Click a unit to list only its repairs.</p></div>
        )}
      </div>
      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Repairs ({list.length})</h3></div>
        <DrillChips onClear={() => setUnitPick(null)} chips={[unitPick != null && <>Unit: <b>{code(unitPick)}</b></>]} />
        {list.length === 0 ? <p className="mrid-note mrid-empty">None.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Date</th><th>Unit</th><th>Item</th><th>Severity</th><th>What was done</th><th>By</th><th>MR-I report</th></tr></thead>
            <tbody>{list.map((r, i) => (<tr key={i}><td>{fmtDate(r.repaired_at)}</td><td><b>{code(r.asset_id)}</b></td><td>{r.item ?? "—"}</td><td>{r.severity ?? "—"}</td><td className="mrid-soft">{r.action_taken ?? "—"}</td><td>{r.repaired_by ?? "—"}</td><td><PreviewButton reportId={r.report_id} /></td></tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

// ===================================================================== 22 Sign-off completeness
const SIGN_CHECKS = ["Cleaned", "Pressure tested", "Function tested"] as const;
type By = "country" | "supervisor";
function useSignoff(assets: MriDashboardAsset[], s: number, e: number) {
  const d = useDetails(assets);
  return useMemo(() => {
    const list = d.reports.filter((r) => sent(r) && inRange(r.submitted_at, s, e));
    const yes = (id: number, check: string) => (d.footer.get(id)?.get(norm(check)) ?? "").trim().toLowerCase() === "yes";
    const supervisorOf = (id: number) => {
      const f = d.footer.get(id);
      if (!f) return "";
      for (const [k, v] of f) if (k.includes("supervisor") && !k.includes("date") && v.trim()) return v.trim();
      return "";
    };
    return { ...d, list, yes, supervisorOf };
  }, [d, s, e]);
}
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);
const fmtP = (v: number | null) => (v == null ? "—" : `${v}%`);

export function SignoffMini({ assets }: { assets: MriDashboardAsset[] }) {
  const now = nowSecs();
  const { list, yes } = useSignoff(assets, now - 30 * DAY, now + 1);
  return (
    <div className="mrid-mini">
      {SIGN_CHECKS.map((c) => <span key={c} className="mrid-mini-item">{c} <b>{fmtP(pct(list.filter((r) => yes(r.id, c)).length, list.length))}</b></span>)}
    </div>
  );
}

export function Signoff({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { list, yes, supervisorOf, unitOf, isLoading, error } = useSignoff(assets, p.s, p.e);
  const [by, setBy] = useState<By>("country");
  const keyOf = (r: MriDashReport) => (by === "country" ? unitOf.get(r.asset_id)?.country ?? "No country" : supervisorOf(r.id) || "No supervisor named");
  const groups = [...new Set(list.map(keyOf))].sort().map((g) => {
    const l = list.filter((r) => keyOf(r) === g);
    return { g, n: l.length, rates: SIGN_CHECKS.map((c) => pct(l.filter((r) => yes(r.id, c)).length, l.length)) };
  });
  const overall = SIGN_CHECKS.map((c) => pct(list.filter((r) => yes(r.id, c)).length, list.length));
  const worst = [...groups].sort((a, b) => (a.rates[2] ?? 101) - (b.rates[2] ?? 101))[0];
  const story: StoryLine[] = [];
  if (list.length) story.push({ tone: "info", text: <>Of {list.length} report{list.length === 1 ? "" : "s"} sent in {p.label}: Cleaned ticked on {fmtP(overall[0])}, Pressure tested on {fmtP(overall[1])}, Function tested on {fmtP(overall[2])}.</> });
  if (worst && groups.length > 1 && worst.rates[2] != null && worst.rates[2] < 100) story.push({ tone: "attention", text: <>Lowest Function tested rate: <b>{worst.g}</b> ({fmtP(worst.rates[2])} of {worst.n}).</> });
  const exportTables = () => [
    { name: "Overall", rows: SIGN_CHECKS.map((c, i) => ({ Check: c, "Ticked on": fmtP(overall[i]), Reports: list.length })) },
    { name: by === "country" ? "By location" : "By supervisor", rows: groups.map((x) => ({ [by === "country" ? "Location" : "Supervisor"]: x.g, Reports: x.n, ...Object.fromEntries(SIGN_CHECKS.map((c, i) => [c, fmtP(x.rates[i])])) })) },
  ];
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">How often the yes / no sign-off checks were ticked on MR-I reports sent in <b>{p.label}</b>. A check that was not ticked, or is not on the report's template, counts as not ticked.</p>
        <ExportMenu dashboardNo={22} title="Sign-off Completeness" filters={filters} tables={exportTables} />
      </div>
      <StoryStrip lines={story} />
      <div className="mrid-kpis">
        <div className="mrid-kpi"><div className="mrid-kpi-head"><span>Reports sent</span></div><div className="mrid-kpi-value">{list.length}</div><div className="mrid-kpi-sub">in {p.label}</div></div>
        {SIGN_CHECKS.map((c, i) => (
          <div key={c} className="mrid-kpi"><div className="mrid-kpi-head"><span>{c}</span></div><div className="mrid-kpi-value" style={{ color: overall[i] != null && overall[i]! < 80 ? "var(--warn)" : undefined }}>{fmtP(overall[i])}</div><div className="mrid-kpi-sub">of reports ticked</div></div>
        ))}
      </div>
      <div className="mrid-panel">
        <div className="mrid-panel-head">
          <h3>{by === "country" ? "By location" : "By supervisor"} ({groups.length})</h3>
          <span style={{ display: "inline-flex", gap: 6 }}>
            <button type="button" className={by === "country" ? "primary" : "ghost"} onClick={() => setBy("country")} style={{ padding: "4px 12px", fontSize: 12 }}>By location</button>
            <button type="button" className={by === "supervisor" ? "primary" : "ghost"} onClick={() => setBy("supervisor")} style={{ padding: "4px 12px", fontSize: 12 }}>By supervisor</button>
          </span>
        </div>
        {groups.length === 0 ? <p className="mrid-note mrid-empty">No reports sent in this period.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>{by === "country" ? "Location" : "Supervisor"}</th><th>Reports</th>{SIGN_CHECKS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{groups.map((x) => (<tr key={x.g}><td><b>{x.g}</b></td><td>{x.n}</td>{x.rates.map((r, i) => <td key={i} className={r != null && r < 80 ? "mrid-over" : undefined}>{fmtP(r)}</td>)}</tr>))}</tbody>
          </table><p className="mrid-note">Below 80% is shown in orange. The supervisor is the name on the report's Sign-off step.</p></div>
        )}
      </div>
    </div>
  );
}

// ===================================================================== 23 Data quality
const DQ = {
  stage: "No compliance stage",
  job: "No job number / checklist ID",
  client: "No client",
  hours: "Engine hours lower than before",
  distance: "Unusual distance",
} as const;
type DqKey = keyof typeof DQ;
const MAX_KM = 1500;
const num = (s: string) => { const n = parseFloat(s.replace(/,/g, "")); return isNaN(n) ? null : n; };

function useQuality(assets: MriDashboardAsset[], s: number, e: number) {
  const d = useDetails(assets);
  return useMemo(() => {
    const done = d.reports.filter(sent).sort((a, b) => t(a) - t(b));
    const hours = (id: number) => num(d.h(id, "current engine hours"));
    const rows: { r: MriDashReport; problems: DqKey[]; note: string[] }[] = [];
    for (const r of done) {
      if (!inRange(r.submitted_at, s, e)) continue;
      const problems: DqKey[] = [], note: string[] = [];
      const st = stageKey(d.h(r.id, "compliance stage") || r.compliance_stage);
      if (!st) problems.push("stage");
      const job = d.h(r.id, "job number"), cid = d.h(r.id, "pre-mobilization checklist id");
      const hasCid = d.header.get(r.id)?.has("pre-mobilization checklist id");
      if (st === "POSTJOB" && !job) problems.push("job");
      if ((st === "PREJOB" || st === "PREMOB") && (hasCid ? !cid : st === "PREJOB" && !job)) problems.push("job");
      if ((st === "PREJOB" || st === "POSTJOB") && !d.h(r.id, "client")) problems.push("client");
      const cur = hours(r.id);
      const prev = [...done].reverse().find((x) => t(x) < t(r) && x.asset_id === r.asset_id && (x.component ?? "") === (r.component ?? "") && hours(x.id) != null);
      if (cur != null && prev && cur < hours(prev.id)!) { problems.push("hours"); note.push(`${cur} h, was ${hours(prev.id)} h on #${prev.id}`); }
      const kms = [...(d.mid.get(r.id)?.values() ?? [])].map(num).filter((x): x is number => x != null);
      const bad = kms.find((k) => k < 0 || k > MAX_KM);
      if (bad != null) { problems.push("distance"); note.push(`${bad} km`); }
      if (problems.length) rows.push({ r, problems, note });
    }
    const checked = done.filter((r) => inRange(r.submitted_at, s, e)).length;
    return { ...d, rows, checked };
  }, [d, s, e]);
}

export function DataQualityMini({ assets }: { assets: MriDashboardAsset[] }) {
  const now = nowSecs();
  const { rows, checked } = useQuality(assets, now - 30 * DAY, now + 1);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">Reports with a gap, 30 d <b>{rows.length}</b></span>
      <span className="mrid-mini-item">of <b>{checked}</b></span>
    </div>
  );
}

export function DataQuality({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { rows, checked, unitOf, isLoading, error } = useQuality(assets, p.s, p.e);
  const [pick, setPick] = useState<DqKey | null>(null);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const count = (k: DqKey) => rows.filter((x) => x.problems.includes(k)).length;
  const shown = (pick ? rows.filter((x) => x.problems.includes(pick)) : rows).sort((a, b) => t(b.r) - t(a.r));
  const story: StoryLine[] = [];
  if (rows.length) story.push({ tone: "attention", text: <><b>{rows.length}</b> of {checked} report{checked === 1 ? "" : "s"} sent in {p.label} have something missing or worth checking.</> });
  else if (checked) story.push({ tone: "better", text: <>All {checked} report{checked === 1 ? "" : "s"} sent in {p.label} passed these checks.</> });
  const exportTables = () => [
    { name: "Summary", rows: (Object.keys(DQ) as DqKey[]).map((k) => ({ Check: DQ[k], Reports: count(k) })) },
    { name: "Reports", rows: rows.map((x) => ({ Report: `#${x.r.id}`, Unit: code(x.r.asset_id), Part: x.r.component, Stage: stageName(x.r.compliance_stage), Sent: fmtDate(x.r.submitted_at), "Sent by": x.r.submitted_by, Problems: x.problems.map((k) => DQ[k]).join("; "), Detail: x.note.join("; ") || null })) },
  ];
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Checks on MR-I reports sent in <b>{p.label}</b>: missing compliance stage, job number (Post-Job) or Pre-Mobilization Checklist ID (Pre-Mob / Pre-Job), client (Pre-Job / Post-Job), engine hours lower than on the unit's report before, and distances below 0 or over {MAX_KM.toLocaleString()} km.</p>
        <ExportMenu dashboardNo={23} title="Data Quality" filters={filters} tables={exportTables} />
      </div>
      <StoryStrip lines={story} />
      <div className="mrid-kpis">
        {(Object.keys(DQ) as DqKey[]).map((k) => (
          <Tile key={k} k={k} pick={pick} setPick={setPick} color={count(k) ? "var(--warn)" : "var(--success)"} label={DQ[k]} value={count(k)} sub={`of ${checked} reports`} />
        ))}
      </div>
      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Reports to check ({shown.length})</h3></div>
        <DrillChips onClear={() => setPick(null)} chips={[pick && <b>{DQ[pick]}</b>]} />
        {shown.length === 0 ? <p className="mrid-note mrid-empty">Nothing to check.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Report</th><th>Unit</th><th>Stage</th><th>Sent</th><th>Sent by</th><th>What to check</th></tr></thead>
            <tbody>{shown.map((x) => (
              <tr key={x.r.id}>
                <td><PreviewButton reportId={x.r.id} /></td>
                <td><b>{code(x.r.asset_id)}</b>{x.r.component ? <span className="mrid-soft"> · {x.r.component}</span> : null}</td>
                <td>{stageName(x.r.compliance_stage)}</td><td>{fmtDate(x.r.submitted_at)}</td><td>{x.r.submitted_by ?? "—"}</td>
                <td>{x.problems.map((k) => DQ[k]).join(" · ")}{x.note.length ? <div className="mrid-soft">{x.note.join(" · ")}</div> : null}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
