import { useMemo } from "react";
import { fmtDate, sevKey, useMriDashboardWaiting, type DashboardFilters, type MriDashboardAsset, type MriDashDecision, type MriDashRepair } from "../hooks/useMriDashboards";
import { avg, DAY, inRange, Loading, monthsFor, nowSecs, period, useMore } from "./kit";
import type { StoryLine } from "./fluid";
import UserBoard, { byPerson, fmtDays, fmtNum, fmtPct, sameName, useUserScope, type Person } from "./UserBoard";

// User Analytics: one dashboard per role in the MR-I process. Names come from the records
// themselves (submitted by, closed by, reviewer, technician, confirmed / acknowledged by).

type P = { assets: MriDashboardAsset[]; filters: DashboardFilters };
const days = (secs: number | null | undefined) => (secs == null ? null : Math.max(0, secs) / DAY);
const SEV_RANK: Record<string, number> = { Critical: 3, Moderate: 2, Minor: 1 };
const downgraded = (d: MriDashDecision) => d.decision === "Rejected" || (!!d.new_severity && SEV_RANK[sevKey(d.new_severity)] < SEV_RANK[sevKey(d.original_severity ?? "")]);

function useMonths(filters: DashboardFilters) {
  const p = period(filters);
  const months = useMemo(() => monthsFor(p.from, p.to), [p.from.getTime(), p.to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  return { p, months };
}
const monthly = (months: { s: number; e: number }[], dates: (number | null)[]) => months.map((m) => dates.filter((d) => inRange(d, m.s, m.e)).length);

/** Card summary: number of people, or your own count for staff who see only themselves. */
function MiniLine({ people, unit, mine }: { people: number; unit: string; mine: number | null }) {
  const { seeAll } = useUserScope();
  return (
    <div className="mrid-mini">
      {seeAll ? <span className="mrid-mini-item"><b>{people}</b> {people === 1 ? "person" : "people"}</span> : null}
      <span className="mrid-mini-item">{seeAll ? "This month" : "You, this month"} <b>{mine ?? 0}</b> {unit}</span>
    </div>
  );
}
const thisMonth = () => { const d = new Date(); return { s: Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000), e: nowSecs() + 1 }; };

// ---------------------------------------------------------------- Inspectors
export function InspectorsMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { reports } = useMore(assets);
  const { me, seeAll } = useUserScope();
  const m = thisMonth();
  const l = reports.filter((r) => r.status !== "Draft" && inRange(r.submitted_at, m.s, m.e));
  return <MiniLine people={byPerson(l, (r) => r.submitted_by).size} unit="reports" mine={seeAll ? l.length : l.filter((r) => sameName(r.submitted_by, me)).length} />;
}
export function Inspectors({ assets, filters }: P) {
  const { reports, decisions, unitOf, isLoading, error } = useMore(assets);
  const { p, months } = useMonths(filters);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const inP = reports.filter((r) => r.status !== "Draft" && inRange(r.submitted_at, p.s, p.e));
  const decByReport = useMemo(() => { const m = new Map<number, MriDashDecision[]>(); decisions.forEach((d) => m.set(d.report_id, [...(m.get(d.report_id) ?? []), d])); return m; }, [decisions]);
  const allSubmitted = reports.filter((r) => r.status !== "Draft");
  const people: Person[] = [...byPerson(inP, (r) => r.submitted_by).values()].map(({ name, list }) => {
    const faults = list.reduce((a, r) => a + r.fault_count, 0);
    const decs = list.flatMap((r) => decByReport.get(r.id) ?? []);
    return {
      name,
      values: { reports: list.length, withFaults: (list.filter((r) => r.fault_count > 0).length / list.length) * 100, faults, perReport: faults / list.length, reviewed: decs.length, down: decs.filter(downgraded).length },
      spark: monthly(months, allSubmitted.filter((r) => sameName(r.submitted_by, name)).map((r) => r.submitted_at)),
      items: list.map((r) => ({ key: `r${r.id}`, date: r.submitted_at, unit: code(r.asset_id), what: r.compliance_stage ?? "MR-I report", exportWhat: r.compliance_stage ?? "MR-I report", detail: `${r.fault_count} fault${r.fault_count === 1 ? "" : "s"} · ${r.status}${(decByReport.get(r.id) ?? []).some(downgraded) ? " · a fault was rejected or downgraded" : ""}`, reportId: r.id })),
    };
  });
  const totalFaults = inP.reduce((a, r) => a + r.fault_count, 0);
  const allDecs = inP.flatMap((r) => decByReport.get(r.id) ?? []);
  const story: StoryLine[] = [];
  const top = [...people].sort((a, b) => (b.values.reports ?? 0) - (a.values.reports ?? 0))[0];
  if (top) story.push({ tone: "info", text: <><b>{top.name}</b> submitted the most reports in {p.label} ({top.values.reports}).</> });
  if (allDecs.length) story.push({ tone: "info", text: <>Reviewers rejected or downgraded {allDecs.filter(downgraded).length} of the {allDecs.length} escalated faults reported in {p.label} ({fmtPct((allDecs.filter(downgraded).length / allDecs.length) * 100)}).</> });
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <UserBoard dashboardNo={14} title="Inspectors" filters={filters} personLabel="Inspector" itemsTitle="Reports submitted"
      intro={<>MR-I reports submitted in <b>{p.label}</b>, by the person who submitted them.</>}
      people={people} story={story}
      columns={[
        { key: "reports", label: "Reports" }, { key: "withFaults", label: "With faults", fmt: fmtPct }, { key: "faults", label: "Faults found" },
        { key: "perReport", label: "Faults per report" }, { key: "reviewed", label: "Sent for decision" }, { key: "down", label: "Rejected / downgraded" },
      ]}
      tiles={[
        { label: "Reports submitted", value: inP.length, sub: `by ${people.length} ${people.length === 1 ? "person" : "people"}`, color: "var(--accent-blue, #2f6fed)", spark: monthly(months, allSubmitted.map((r) => r.submitted_at)) },
        { label: "Faults found", value: totalFaults, sub: `${fmtNum(inP.length ? totalFaults / inP.length : null)} per report`, color: "var(--warn)" },
        { label: "Reports with faults", value: fmtPct(inP.length ? (inP.filter((r) => r.fault_count > 0).length / inP.length) * 100 : null), sub: "of submitted reports", color: "var(--danger)" },
        { label: "Rejected or downgraded", value: allDecs.filter(downgraded).length, sub: `of ${allDecs.length} faults sent for a decision`, color: "var(--text-soft)" },
      ]} />
  );
}

// ---------------------------------------------------------------- Supervisors
export function SupervisorsMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { reports } = useMore(assets);
  const { me, seeAll } = useUserScope();
  const m = thisMonth();
  const l = reports.filter((r) => r.status === "Approved" && inRange(r.approved_at, m.s, m.e));
  return <MiniLine people={byPerson(l, (r) => r.approved_by).size} unit="closed" mine={seeAll ? l.length : l.filter((r) => sameName(r.approved_by, me)).length} />;
}
export function Supervisors({ assets, filters }: P) {
  const { reports, unitOf, isLoading, error } = useMore(assets);
  const { p, months } = useMonths(filters);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const closed = reports.filter((r) => r.status === "Approved" && inRange(r.approved_at, p.s, p.e) && r.approved_by);
  const openEndorsed = reports.filter((r) => (r.status === "Endorsed" || r.status === "Escalated") && r.approved_by);
  const took = (r: (typeof reports)[number]) => (r.submitted_at != null && r.approved_at != null ? r.approved_at - r.submitted_at : null);
  const names = new Map<string, string>();
  [...closed, ...openEndorsed].forEach((r) => { const n = r.approved_by!.trim(); names.set(n.toLowerCase(), names.get(n.toLowerCase()) ?? n); });
  const people: Person[] = [...names.values()].map((name) => {
    const c = closed.filter((r) => sameName(r.approved_by, name));
    const o = openEndorsed.filter((r) => sameName(r.approved_by, name));
    const t = c.map(took).filter((x): x is number => x != null);
    return {
      name,
      values: { closed: c.length, avg: days(avg(t)), within: t.length ? (t.filter((x) => x <= 7 * DAY).length / t.length) * 100 : null, open: o.length },
      spark: monthly(months, reports.filter((r) => r.status === "Approved" && sameName(r.approved_by, name)).map((r) => r.approved_at)),
      items: [
        ...o.map((r) => ({ key: `o${r.id}`, date: r.approved_at, unit: code(r.asset_id), what: `Endorsed, not closed (${r.status})`, exportWhat: `Endorsed, not closed (${r.status})`, detail: `${r.fault_count} fault${r.fault_count === 1 ? "" : "s"}`, waiting: true, reportId: r.id })),
        ...c.map((r) => ({ key: `c${r.id}`, date: r.approved_at, unit: code(r.asset_id), what: "Report closed", exportWhat: "Report closed", detail: r.compliance_stage ?? undefined, took: fmtDays(days(took(r))), reportId: r.id })),
      ],
    };
  });
  const all = closed.map(took).filter((x): x is number => x != null);
  const story: StoryLine[] = [];
  if (all.length) story.push({ tone: "info", text: <>{closed.length} report{closed.length === 1 ? " was" : "s were"} closed in {p.label}, on average {fmtDays(days(avg(all)))} after Submit.</> });
  const most = [...people].sort((a, b) => (b.values.open ?? 0) - (a.values.open ?? 0))[0];
  if (most && (most.values.open ?? 0) > 0) story.push({ tone: "worse", text: <><b>{most.name}</b> has {most.values.open} endorsed report{most.values.open === 1 ? "" : "s"} still open.</> });
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <UserBoard dashboardNo={15} title="Supervisors" filters={filters} personLabel="Supervisor" itemsTitle="Reports"
      intro={<>Reports closed in <b>{p.label}</b> by the Supervisor who closed them, and endorsed reports still open now.</>}
      people={people} story={story}
      columns={[{ key: "closed", label: "Reports closed" }, { key: "avg", label: "Submit → closed", fmt: fmtDays }, { key: "within", label: "Closed within 7 days", fmt: fmtPct }, { key: "open", label: "Endorsed, still open" }]}
      tiles={[
        { label: "Reports closed", value: closed.length, sub: `by ${people.filter((x) => (x.values.closed ?? 0) > 0).length} supervisor(s)`, color: "var(--success)", spark: monthly(months, reports.filter((r) => r.status === "Approved").map((r) => r.approved_at)) },
        { label: "Submit → closed", value: fmtDays(days(avg(all))), sub: "average", color: "var(--accent-blue, #2f6fed)" },
        { label: "Endorsed, still open", value: openEndorsed.length, sub: "now", color: "var(--warn)" },
      ]} />
  );
}

// ---------------------------------------------------------------- Reviewers
export function ReviewersMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { decisions } = useMore(assets);
  const { me, seeAll } = useUserScope();
  const m = thisMonth();
  const l = decisions.filter((d) => inRange(d.decided_at, m.s, m.e));
  return <MiniLine people={byPerson(l, (d) => d.reviewer).size} unit="decisions" mine={seeAll ? l.length : l.filter((d) => sameName(d.reviewer, me)).length} />;
}
export function Reviewers({ assets, filters }: P) {
  const { decisions, unitOf, isLoading, error } = useMore(assets);
  const { data: waitingAll = [] } = useMriDashboardWaiting();
  const { p, months } = useMonths(filters);
  const ids = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  const waiting = waitingAll.filter((w) => w.kind === "fault" && ids.has(w.asset_id) && w.assigned_to_name);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const decided = decisions.filter((d) => inRange(d.decided_at, p.s, p.e) && d.reviewer);
  const took = (d: MriDashDecision) => (d.report_submitted_at != null && d.decided_at != null ? d.decided_at - d.report_submitted_at : null);
  const names = new Map<string, string>();
  [...decided.map((d) => d.reviewer!), ...waiting.map((w) => w.assigned_to_name!)].forEach((n) => names.set(n.trim().toLowerCase(), names.get(n.trim().toLowerCase()) ?? n.trim()));
  const now = nowSecs();
  const people: Person[] = [...names.values()].map((name) => {
    const d = decided.filter((x) => sameName(x.reviewer, name));
    const w = waiting.filter((x) => sameName(x.assigned_to_name, name));
    const t = d.map(took).filter((x): x is number => x != null);
    return {
      name,
      values: { decisions: d.length, avg: days(avg(t)), reclass: d.length ? (d.filter((x) => x.decision === "Reclassified" || !!x.new_severity).length / d.length) * 100 : null, rejected: d.length ? (d.filter((x) => x.decision === "Rejected").length / d.length) * 100 : null, waiting: w.length, reminders: w.reduce((a, x) => a + x.reminders, 0) },
      spark: monthly(months, decisions.filter((x) => sameName(x.reviewer, name)).map((x) => x.decided_at)),
      items: [
        ...w.map((x) => ({ key: `w${x.approval_id}`, date: x.waiting_since, unit: code(x.asset_id), what: `${x.item ?? "Fault"} (${sevKey(x.severity ?? "")})`, exportWhat: `${x.item ?? "Fault"} (${sevKey(x.severity ?? "")})`, detail: `Decision waiting${x.reminders ? ` · ${x.reminders} reminder${x.reminders === 1 ? "" : "s"}` : ""}`, took: x.waiting_since ? fmtDays(days(now - x.waiting_since)) : undefined, waiting: true, reportId: x.report_id })),
        ...d.map((x) => ({ key: `d${x.approval_id}`, date: x.decided_at, unit: code(x.asset_id), what: `${x.item ?? "Fault"} (${sevKey(x.original_severity ?? "")})`, exportWhat: `${x.item ?? "Fault"} (${sevKey(x.original_severity ?? "")})`, detail: `${x.decision}${x.new_severity ? ` → ${x.new_severity}` : ""}${x.review_method ? ` · ${x.review_method}` : ""}`, took: fmtDays(days(took(x))), reportId: x.report_id })),
      ],
    };
  });
  const all = decided.map(took).filter((x): x is number => x != null);
  const story: StoryLine[] = [];
  if (all.length) story.push({ tone: "info", text: <>{decided.length} fault decision{decided.length === 1 ? "" : "s"} in {p.label}, on average {fmtDays(days(avg(all)))} after Submit.</> });
  const most = [...people].sort((a, b) => (b.values.waiting ?? 0) - (a.values.waiting ?? 0))[0];
  if (most && (most.values.waiting ?? 0) > 0) story.push({ tone: "attention", text: <><b>{most.name}</b> has the most decisions waiting ({most.values.waiting}).</> });
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <UserBoard dashboardNo={16} title="Reviewers" filters={filters} personLabel="Reviewer" itemsTitle="Fault decisions"
      intro={<>Fault decisions made in <b>{p.label}</b> by the reviewer recorded on them, and decisions named to each reviewer that are waiting now.</>}
      people={people} story={story}
      columns={[
        { key: "decisions", label: "Decisions" }, { key: "avg", label: "Submit → decision", fmt: fmtDays }, { key: "reclass", label: "Reclassified", fmt: fmtPct },
        { key: "rejected", label: "Rejected", fmt: fmtPct }, { key: "waiting", label: "Waiting now" }, { key: "reminders", label: "Reminders received" },
      ]}
      tiles={[
        { label: "Fault decisions", value: decided.length, sub: `by ${people.filter((x) => (x.values.decisions ?? 0) > 0).length} reviewer(s)`, color: "var(--accent-blue, #2f6fed)", spark: monthly(months, decisions.map((d) => d.decided_at)) },
        { label: "Submit → decision", value: fmtDays(days(avg(all))), sub: "average", color: "var(--success)" },
        { label: "Waiting now", value: waiting.length, sub: "named to a reviewer", color: "var(--warn)" },
      ]} />
  );
}

// ---------------------------------------------------------------- Technicians
const repairOpen = (r: MriDashRepair) => r.verified_at == null && r.tag_status !== "Green";
export function TechniciansMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { repairs } = useMore(assets);
  const { me, seeAll } = useUserScope();
  const open = repairs.filter(repairOpen);
  return (
    <div className="mrid-mini">
      {seeAll ? <span className="mrid-mini-item"><b>{byPerson(open, (r) => r.technician).size}</b> with repairs</span> : null}
      <span className="mrid-mini-item">{seeAll ? "Open repairs" : "Your open repairs"} <b>{seeAll ? open.length : open.filter((r) => sameName(r.technician, me)).length}</b></span>
    </div>
  );
}
export function Technicians({ assets, filters }: P) {
  const { repairs, unitOf, isLoading, error } = useMore(assets);
  const { p, months } = useMonths(filters);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const now = nowSecs();
  const open = repairs.filter(repairOpen).filter((r) => r.technician);
  const done = repairs.filter((r) => inRange(r.verified_at, p.s, p.e) && r.technician);
  const took = (r: MriDashRepair) => (r.queued_at != null && r.verified_at != null ? r.verified_at - r.queued_at : null);
  const names = new Map<string, string>();
  [...open, ...done].forEach((r) => { const n = r.technician!.trim(); names.set(n.toLowerCase(), names.get(n.toLowerCase()) ?? n); });
  const people: Person[] = [...names.values()].map((name) => {
    const o = open.filter((r) => sameName(r.technician, name));
    const d = done.filter((r) => sameName(r.technician, name));
    return {
      name,
      values: { open: o.length, parts: o.filter((r) => r.parts_status.trim().toLowerCase() !== "available").length, late: o.filter((r) => r.repair_at != null && r.repair_at < now).length, done: d.length, avg: days(avg(d.map(took).filter((x): x is number => x != null))) },
      spark: monthly(months, repairs.filter((r) => sameName(r.technician, name)).map((r) => r.verified_at)),
      items: [
        ...o.map((r) => ({ key: `o${r.rectification_id}`, date: r.queued_at, unit: code(r.asset_id), what: r.item ?? "Repair", exportWhat: r.item ?? "Repair", detail: `Parts: ${r.parts_status || "—"}${r.repair_at ? ` · planned ${fmtDate(r.repair_at)}` : ""}${r.repair_at != null && r.repair_at < now ? " · date passed" : ""}`, took: r.queued_at ? fmtDays(days(now - r.queued_at)) : undefined, waiting: true, reportId: r.report_id })),
        ...d.map((r) => ({ key: `d${r.rectification_id}`, date: r.verified_at, unit: code(r.asset_id), what: r.item ?? "Repair", exportWhat: r.item ?? "Repair", detail: `Verified${r.verified_by ? ` by ${r.verified_by}` : ""}`, took: fmtDays(days(took(r))), reportId: r.report_id })),
      ],
    };
  });
  const unassigned = repairs.filter(repairOpen).filter((r) => !r.technician?.trim()).length;
  const allT = done.map(took).filter((x): x is number => x != null);
  const story: StoryLine[] = [];
  if (unassigned) story.push({ tone: "attention", text: <>{unassigned} repair{unassigned === 1 ? " has" : "s have"} no technician assigned.</> });
  const most = [...people].sort((a, b) => (b.values.open ?? 0) - (a.values.open ?? 0))[0];
  if (most && (most.values.open ?? 0) > 0) story.push({ tone: "info", text: <><b>{most.name}</b> has the most open repairs ({most.values.open}).</> });
  if (allT.length) story.push({ tone: "info", text: <>{done.length} repair{done.length === 1 ? "" : "s"} verified in {p.label}, taking {fmtDays(days(avg(allT)))} on average.</> });
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <UserBoard dashboardNo={17} title="Technicians" filters={filters} personLabel="Technician" itemsTitle="Repairs"
      intro={<>Repairs assigned to each technician now, and repairs verified in <b>{p.label}</b>.</>}
      people={people} story={story}
      columns={[{ key: "open", label: "Open repairs" }, { key: "parts", label: "Waiting for parts" }, { key: "late", label: "Past planned date" }, { key: "done", label: "Verified in period" }, { key: "avg", label: "Repair time", fmt: fmtDays }]}
      tiles={[
        { label: "Open repairs", value: open.length + unassigned, sub: `${unassigned} without a technician`, color: "var(--danger)" },
        { label: "Verified in period", value: done.length, sub: "repairs", color: "var(--success)", spark: monthly(months, repairs.map((r) => r.verified_at)) },
        { label: "Repair time", value: fmtDays(days(avg(allT))), sub: "average, queue to verified", color: "var(--accent-blue, #2f6fed)" },
      ]} />
  );
}

// ---------------------------------------------------------------- Managers / FSM
export function ManagersMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { decisions } = useMore(assets);
  const { me, seeAll } = useUserScope();
  const waiting = decisions.filter((d) => (d.provisional_status === "Provisional") || (d.ack_needed && !d.acknowledged_by && d.decision !== "Pending"));
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">{seeAll ? "To confirm or acknowledge" : "Named to you"} <b>{seeAll ? waiting.length : waiting.filter((d) => sameName(d.ack_assigned_to, me) || sameName(d.reviewer, me)).length}</b></span>
    </div>
  );
}
export function Managers({ assets, filters }: P) {
  const { decisions, unitOf, isLoading, error } = useMore(assets);
  const { p, months } = useMonths(filters);
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const now = nowSecs();
  const conf = decisions.filter((d) => inRange(d.confirmed_at, p.s, p.e) && d.confirmed_by);
  const ack = decisions.filter((d) => inRange(d.acknowledged_at, p.s, p.e) && d.acknowledged_by);
  const toConfirm = decisions.filter((d) => d.provisional_status === "Provisional" && d.reviewer);
  const toAck = decisions.filter((d) => d.ack_needed && !d.acknowledged_by && d.decision !== "Pending" && d.ack_assigned_to);
  const gap = (a: number | null, b: number | null) => (a != null && b != null ? b - a : null);
  const names = new Map<string, string>();
  [...conf.map((d) => d.confirmed_by!), ...ack.map((d) => d.acknowledged_by!), ...toConfirm.map((d) => d.reviewer!), ...toAck.map((d) => d.ack_assigned_to!)]
    .forEach((n) => names.set(n.trim().toLowerCase(), names.get(n.trim().toLowerCase()) ?? n.trim()));
  const people: Person[] = [...names.values()].map((name) => {
    const c = conf.filter((d) => sameName(d.confirmed_by, name));
    const a = ack.filter((d) => sameName(d.acknowledged_by, name));
    const wc = toConfirm.filter((d) => sameName(d.reviewer, name));
    const wa = toAck.filter((d) => sameName(d.ack_assigned_to, name));
    return {
      name,
      values: {
        conf: c.length, confT: days(avg(c.map((d) => gap(d.decided_at, d.confirmed_at)).filter((x): x is number => x != null))),
        ack: a.length, ackT: days(avg(a.map((d) => gap(d.decided_at, d.acknowledged_at)).filter((x): x is number => x != null))),
        waiting: wc.length + wa.length,
      },
      spark: monthly(months, [...decisions.filter((d) => sameName(d.confirmed_by, name)).map((d) => d.confirmed_at), ...decisions.filter((d) => sameName(d.acknowledged_by, name)).map((d) => d.acknowledged_at)]),
      items: [
        ...wc.map((d) => ({ key: `wc${d.approval_id}`, date: d.decided_at, unit: code(d.asset_id), what: `Confirm phone decision: ${d.item ?? "fault"}`, exportWhat: `Confirm phone decision: ${d.item ?? "fault"}`, detail: `${d.decision}${d.recorded_by ? ` · recorded by ${d.recorded_by}` : ""}`, took: d.decided_at ? fmtDays(days(now - d.decided_at)) : undefined, waiting: true, reportId: d.report_id })),
        ...wa.map((d) => ({ key: `wa${d.approval_id}`, date: d.decided_at, unit: code(d.asset_id), what: `Acknowledge Moderate decision: ${d.item ?? "fault"}`, exportWhat: `Acknowledge Moderate decision: ${d.item ?? "fault"}`, detail: d.decision, took: d.decided_at ? fmtDays(days(now - d.decided_at)) : undefined, waiting: true, reportId: d.report_id })),
        ...c.map((d) => ({ key: `c${d.approval_id}`, date: d.confirmed_at, unit: code(d.asset_id), what: `Confirmed: ${d.item ?? "fault"}`, exportWhat: `Confirmed: ${d.item ?? "fault"}`, detail: d.decision, took: fmtDays(days(gap(d.decided_at, d.confirmed_at))), reportId: d.report_id })),
        ...a.map((d) => ({ key: `a${d.approval_id}`, date: d.acknowledged_at, unit: code(d.asset_id), what: `Acknowledged: ${d.item ?? "fault"}`, exportWhat: `Acknowledged: ${d.item ?? "fault"}`, detail: d.decision, took: fmtDays(days(gap(d.decided_at, d.acknowledged_at))), reportId: d.report_id })),
      ],
    };
  });
  const story: StoryLine[] = [];
  const most = [...people].sort((a, b) => (b.values.waiting ?? 0) - (a.values.waiting ?? 0))[0];
  if (most && (most.values.waiting ?? 0) > 0) story.push({ tone: "attention", text: <><b>{most.name}</b> has {most.values.waiting} decision{most.values.waiting === 1 ? "" : "s"} to confirm or acknowledge.</> });
  if (conf.length || ack.length) story.push({ tone: "info", text: <>{conf.length} confirmation{conf.length === 1 ? "" : "s"} and {ack.length} acknowledgement{ack.length === 1 ? "" : "s"} in {p.label}.</> });
  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  return (
    <UserBoard dashboardNo={18} title="Managers and FSM" filters={filters} personLabel="Manager" itemsTitle="Confirmations and acknowledgements"
      intro={<>Phone decisions confirmed and Moderate decisions acknowledged in <b>{p.label}</b>, and those waiting now for each person.</>}
      people={people} story={story}
      columns={[{ key: "conf", label: "Confirmed" }, { key: "confT", label: "Time to confirm", fmt: fmtDays }, { key: "ack", label: "Acknowledged" }, { key: "ackT", label: "Time to acknowledge", fmt: fmtDays }, { key: "waiting", label: "Waiting now" }]}
      tiles={[
        { label: "Confirmed", value: conf.length, sub: "phone decisions", color: "var(--success)" },
        { label: "Acknowledged", value: ack.length, sub: "Moderate decisions", color: "var(--accent-blue, #2f6fed)" },
        { label: "Waiting now", value: toConfirm.length + toAck.length, sub: `${toConfirm.length} to confirm · ${toAck.length} to acknowledge`, color: "var(--warn)" },
      ]} />
  );
}
