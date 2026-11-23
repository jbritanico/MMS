import { useMriDashboardFaults, useMriDashboardMore, type MriDashboardFault, type MriDashReport } from "../dashboard/hooks/useMriDashboards";
import { Icon } from "./flowKit";

// Pre-Job vs Post-Job comparison (report 6 of the MR-I reports list, Tier 1).
// Matches a Post-Job report to the last Pre-Job report before it on the same unit (and the same
// part, for units checked in parts), or a Pre-Job to the first Post-Job after it, and lists the
// faults that appeared during the job, the ones already there before it, and the ones that no
// longer show after it. A Pre-Job report carries the Pre-Mobilization Checklist ID rather than
// the job number, so the match is by unit and date. Read only.

const stageKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const isPre = (s: string | null | undefined) => ["PREJOB", "PREMOB"].includes(stageKey(s));
const isPost = (s: string | null | undefined) => stageKey(s) === "POSTJOB";
const stageName = (s: string | null | undefined) => (isPost(s) ? "Post-Job" : stageKey(s) === "PREMOB" ? "Pre-Mob" : stageKey(s) === "PREJOB" ? "Pre-Job" : s || "No stage");
const day = (unix: number | null | undefined) =>
  unix ? new Date(unix * 1000).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const keyOf = (f: MriDashboardFault) => `${(f.item ?? "").trim().toLowerCase()}|${(f.component ?? "").trim().toLowerCase()}`;
const SEV_ORDER: Record<string, number> = { Critical: 0, Major: 0, Moderate: 1, Minor: 2 };
const SEV_TONE: Record<string, string> = { Critical: "var(--danger)", Major: "var(--danger)", Moderate: "var(--warn)", Minor: "var(--st-amber, #b59b00)" };

export default function JobCompare({ reportId, onOpenReport }: { reportId: number; onOpenReport: (id: number) => void }) {
  const { data: more, isLoading: mLoad } = useMriDashboardMore();
  const { data: faults = [], isLoading: fLoad } = useMriDashboardFaults();
  if (mLoad || fLoad) return <div className="fx-empty">Loading…</div>;

  const reports = (more?.reports ?? []).filter((r) => r.status !== "Draft");
  const all = more?.reports ?? [];
  const cur = all.find((r) => r.id === reportId);
  if (!cur) return <div className="fx-empty">This report isn't in your country access, so it can't be compared.</div>;
  if (cur.status === "Draft") return <div className="fx-empty">Send this report first. Only sent reports are compared.</div>;
  if (!isPre(cur.compliance_stage) && !isPost(cur.compliance_stage))
    return <div className="fx-empty">This is a {stageName(cur.compliance_stage)} report. The comparison is only for Pre-Mob, Pre-Job and Post-Job reports.</div>;

  const t = (r: MriDashReport) => r.submitted_at ?? r.created_at ?? 0;
  const sameUnit = (r: MriDashReport) => r.asset_id === cur.asset_id && (r.component ?? "") === (cur.component ?? "");
  let pre: MriDashReport | undefined;
  let post: MriDashReport | undefined;
  if (isPost(cur.compliance_stage)) {
    post = cur;
    const before = reports.filter((r) => r.id !== cur.id && sameUnit(r) && isPre(r.compliance_stage) && t(r) <= t(cur));
    // The Pre-Job closest to the job; a Pre-Mob only when there is no Pre-Job.
    pre = before.filter((r) => stageKey(r.compliance_stage) === "PREJOB").sort((a, b) => t(b) - t(a))[0]
      ?? before.sort((a, b) => t(b) - t(a))[0];
  } else {
    pre = cur;
    post = reports.filter((r) => r.id !== cur.id && sameUnit(r) && isPost(r.compliance_stage) && t(r) >= t(cur)).sort((a, b) => t(a) - t(b))[0];
  }
  if (!pre || !post) {
    return (
      <div className="fx-empty">
        {post ? `No Pre-Job or Pre-Mob report before this Post-Job on ${cur.component ? "this part of " : ""}the unit, so there is nothing to compare with.`
          : `No Post-Job report after this ${stageName(cur.compliance_stage)} on ${cur.component ? "this part of " : ""}the unit yet.`}
      </div>
    );
  }

  const of = (id: number) => faults.filter((f) => f.report_id === id).sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3));
  const preF = of(pre.id), postF = of(post.id);
  const preKeys = new Set(preF.map(keyOf)), postKeys = new Set(postF.map(keyOf));
  const appeared = postF.filter((f) => !preKeys.has(keyOf(f)));
  const stayed = postF.filter((f) => preKeys.has(keyOf(f)));
  const gone = preF.filter((f) => !postKeys.has(keyOf(f)));
  const days = Math.max(0, Math.round((t(post) - t(pre)) / 86400));

  const group = (title: string, hint: string, list: MriDashboardFault[], tone: string, empty: string) => (
    <div className="jc-group" style={{ ["--tone" as string]: tone }}>
      <div className="jc-group-h"><b>{list.length}</b><div><strong>{title}</strong><small>{hint}</small></div></div>
      {list.length === 0 ? <div className="jc-none">{empty}</div> : (
        <ul>{list.map((f) => (
          <li key={f.result_id}>
            <span className="jc-sev" style={{ ["--sev" as string]: SEV_TONE[f.severity] ?? "var(--text-soft)" }}>{f.severity}</span>
            <span className="jc-item">{f.item ?? "Unnamed check"}{f.component ? <small> · {f.component}</small> : null}</span>
            <span className="jc-what">{f.issue_details ?? ""}</span>
          </li>
        ))}</ul>
      )}
    </div>
  );

  const side = (r: MriDashReport, label: string) => (
    <div className="jc-side">
      <span className="fx-step">{label}</span>
      <strong>{stageName(r.compliance_stage)} · report #{r.id}</strong>
      <small>{day(t(r))}{r.submitted_by ? ` · ${r.submitted_by}` : ""} · {r.fault_count} fault{r.fault_count === 1 ? "" : "s"}</small>
      {r.id !== reportId && <button type="button" className="fx-back" onClick={() => onOpenReport(r.id)}><Icon name="report" size={14} />Open report</button>}
    </div>
  );

  return (
    <div className="jc">
      <style>{JC_CSS}</style>
      <div className="jc-pair">
        {side(pre, "Before the job")}
        <div className="jc-gap"><Icon name="arrow" size={18} /><small>{days} day{days === 1 ? "" : "s"}</small></div>
        {side(post, "After the job")}
      </div>
      {group("Found after the job", "Not on the report before the job: likely wear or damage during the job.", appeared, "var(--danger)", "Nothing new after the job.")}
      {group("Already there before the job", "On both reports.", stayed, "var(--warn)", "None.")}
      {group("No longer showing after the job", "On the report before the job but not after it.", gone, "var(--success)", "None.")}
      <p className="jc-note">Matched by unit{cur.component ? " and part" : ""} and date, because a Pre-Job report carries the Pre-Mobilization Checklist ID, not the job number. Faults are matched by checklist item.</p>
    </div>
  );
}

const JC_CSS = `
.jc { display: flex; flex-direction: column; gap: 14px; }
.jc-pair { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); gap: 12px; align-items: stretch; }
.jc-side { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 14px; background: var(--fx-card); border: 1px solid var(--fx-line); box-shadow: var(--fx-shadow); }
.jc-side small { color: var(--text-soft); }
.jc-side .fx-back { margin-top: 6px; }
.jc-gap { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text-soft); font-size: 12px; }
.jc-group { padding: 12px 14px; border-radius: 14px; background: var(--fx-card); border: 1px solid var(--fx-line); border-left: 4px solid var(--tone); box-shadow: var(--fx-shadow); }
.jc-group-h { display: flex; gap: 12px; align-items: center; }
.jc-group-h b { font-size: 24px; color: var(--tone); min-width: 28px; text-align: center; }
.jc-group-h div { display: flex; flex-direction: column; }
.jc-group-h small { color: var(--text-soft); font-size: 12px; }
.jc-group ul { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.jc-group li { display: grid; grid-template-columns: 90px minmax(0, 1fr) minmax(0, 1.4fr); gap: 10px; align-items: baseline; padding: 6px 4px; border-top: 1px solid var(--fx-line); font-size: 13px; }
.jc-sev { font-size: 11px; font-weight: 700; color: var(--sev); }
.jc-item small, .jc-what, .jc-none, .jc-note { color: var(--text-soft); }
.jc-none { margin-top: 6px; font-size: 13px; }
.jc-note { font-size: 12px; margin: 0; }
@media (max-width: 760px) { .jc-pair { grid-template-columns: minmax(0,1fr); } .jc-group li { grid-template-columns: 80px minmax(0,1fr); } .jc-what { grid-column: 2; } }
`;
