import { useMemo, useState } from "react";
import { PrintSheet, PrintTable, type PrintRow } from "../../../components/PrintSheet";
import { AGING_LIMIT_DAYS, fmtDate, sevKey, sevLabel, useMriDashboardFaults, useMriDashboardWaiting, type MriDashboardAsset, type MriDashTagChange } from "../hooks/useMriDashboards";
import { DAY, inRange, nowSecs, useMore } from "../mri/kit";
import { timeFor } from "../mri/TimeRedYellow";
import { useExemptionAudit } from "../mri/CostAndAudit";
import { stageName } from "../mri/MoreReports";

// Monthly management pack (report 22 of the MR-I reports list, Tier 3), opened from the Overview.
// One printable summary of a chosen month: fleet status and availability, MR-I reports by stage,
// Major / Critical faults, faults found and closed, repairs, exemptions, and reviews
// and faults that are overdue. Uses the same country-scoped data as the dashboards.

const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

export default function MonthlyPack({ assets, onClose }: { assets: MriDashboardAsset[]; onClose: () => void }) {
  // The last 12 months, this month first (so far).
  const months = useMemo(() => {
    const d = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const a = new Date(d.getFullYear(), d.getMonth() - i, 1), b = new Date(d.getFullYear(), d.getMonth() - i + 1, 1);
      return { key: `${a.getFullYear()}-${a.getMonth()}`, name: `${M[a.getMonth()]} ${a.getFullYear()}`, s: Math.floor(a.getTime() / 1000), e: Math.min(Math.floor(b.getTime() / 1000), nowSecs() + 1), current: i === 0 };
    });
  }, []);
  const [key, setKey] = useState(months[months.length > 1 ? 1 : 0].key);
  const m = months.find((x) => x.key === key) ?? months[0];

  const more = useMore(assets);
  const faultsQ = useMriDashboardFaults();
  const waitingQ = useMriDashboardWaiting();
  const ex = useExemptionAudit(assets, m.s, m.e);
  const ids = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  const code = (id: number) => more.unitOf.get(id)?.asset_code ?? String(id);
  const ready = !more.isLoading && !faultsQ.isLoading && !waitingQ.isLoading;

  const active = assets.filter((a) => a.active);
  // Fleet: time in each colour over the month, and the tag of each unit now.
  const byUnit = new Map<number, MriDashTagChange[]>();
  more.tag_changes.forEach((c) => byUnit.set(c.asset_id, [...(byUnit.get(c.asset_id) ?? []), c]));
  const times = active.map((a) => timeFor(a, byUnit.get(a.id) ?? [], m.s, m.e));
  const span = Math.max(1, m.e - m.s) * Math.max(1, times.length);
  const tot = (k: "green" | "yellow" | "red" | "none") => times.reduce((a, t) => a + t[k], 0);
  const tagNow = (k: string) => active.filter((a) => (a.tag_status ?? "None") === k || (k === "None" && !["Green", "Yellow", "Red"].includes(a.tag_status ?? ""))).length;
  const turnedRed = times.reduce((a, t) => a + t.turnedRed, 0);

  // Reports by stage.
  const reports = more.reports.filter((r) => r.status !== "Draft" && inRange(r.submitted_at, m.s, m.e));
  const stages = new Map<string, number>();
  reports.forEach((r) => stages.set(stageName(r.compliance_stage), (stages.get(stageName(r.compliance_stage)) ?? 0) + 1));

  // Faults.
  const faults = (faultsQ.data ?? []).filter((f) => ids.has(f.asset_id));
  const found = faults.filter((f) => f.state !== "Carried forward" && inRange(f.found_at, m.s, m.e));
  const closed = faults.filter((f) => f.state === "Closed" && inRange(f.ended_at, m.s, m.e));
  const openAtEnd = faults.filter((f) => f.state !== "Carried forward" && (f.found_at ?? 0) < m.e && (f.ended_at == null || f.ended_at >= m.e));
  const crit = found.filter((f) => sevKey(f.severity) === "Critical");
  const overdue = openAtEnd.filter((f) => (m.e - (f.found_at ?? m.e)) / DAY > AGING_LIMIT_DAYS[sevKey(f.severity)]);
  const sevRow = (k: string) => ({ Severity: sevLabel(k), Found: found.filter((f) => sevKey(f.severity) === k).length, Closed: closed.filter((f) => sevKey(f.severity) === k).length, "Open at month end": openAtEnd.filter((f) => sevKey(f.severity) === k).length, Overdue: overdue.filter((f) => sevKey(f.severity) === k).length });

  // Repairs.
  const repairsDone = more.repairs.filter((r) => inRange(r.verified_at, m.s, m.e));
  const repairsOpen = more.repairs.filter((r) => (r.queued_at ?? 0) < m.e && (r.verified_at == null || r.verified_at >= m.e));
  const parts = repairsOpen.filter((r) => r.parts_status.trim().toLowerCase() !== "available");

  // Decisions and reviews waiting now, over 7 days (Dashboard 5 shows the same).
  const late = (waitingQ.data ?? []).filter((w) => ids.has(w.asset_id) && w.waiting_since != null && (nowSecs() - w.waiting_since) / DAY > 7);
  const provisional = more.decisions.filter((d) => d.provisional_status === "Provisional");

  const sum: PrintRow[] = [
    { Measure: "Active units", Value: active.length },
    { Measure: "Fleet availability (time Green)", Value: pct(tot("green"), span) },
    { Measure: "Time Yellow / Red", Value: `${pct(tot("yellow"), span)} / ${pct(tot("red"), span)}` },
    { Measure: "Times a unit turned Red", Value: turnedRed },
    { Measure: "MR-I reports sent", Value: reports.length },
    { Measure: "Faults found / closed", Value: `${found.length} / ${closed.length}` },
    { Measure: "Major / Critical faults found", Value: crit.length },
    { Measure: "Faults open at month end (overdue)", Value: `${openAtEnd.length} (${overdue.length})` },
    { Measure: "Repairs verified / open at month end", Value: `${repairsDone.length} / ${repairsOpen.length}` },
    { Measure: "Exemptions in force during the month", Value: ex.rows.length },
  ];

  return (
    <PrintSheet
      eyebrow="Monthly management pack · MR-I"
      title={`${m.name}${m.current ? " (so far)" : ""}`}
      sub={`${active.length} active unit${active.length === 1 ? "" : "s"} in view${assets.length ? ` · ${[...new Set(active.map((a) => a.country).filter(Boolean))].join(", ")}` : ""}`}
      note={`Taken from MMS. Fleet, faults and repairs are for ${m.name}; overdue reviews and phone decisions to confirm are as of today. Figures can change after printing.`}
      onClose={onClose}
      ready={ready}
      tools={(
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          Month
          <select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Month">
            {months.map((x) => <option key={x.key} value={x.key}>{x.name}{x.current ? " (so far)" : ""}</option>)}
          </select>
        </label>
      )}
    >
      {!ready ? <p className="ps-empty">Loading…</p> : (<>
        <section><h3>Summary</h3><PrintTable rows={sum} /></section>
        <section>
          <h3>Fleet status now</h3>
          <PrintTable rows={[{ Green: tagNow("Green"), Yellow: tagNow("Yellow"), Red: tagNow("Red"), "Not tagged": tagNow("None") }]} />
        </section>
        <section>
          <h3>MR-I reports sent, by stage</h3>
          <PrintTable rows={[...stages.entries()].sort((a, b) => b[1] - a[1]).map(([Stage, Reports]) => ({ Stage, Reports }))} empty="No MR-I reports were sent this month." />
        </section>
        <section><h3>Faults by severity</h3><PrintTable rows={["Critical", "Moderate", "Minor"].map(sevRow)} /></section>
        <section>
          <h3>Major / Critical faults found ({crit.length})</h3>
          <PrintTable rows={crit.map((f) => ({ Unit: code(f.asset_id), Item: f.component ? `${f.item ?? "—"} · ${f.component}` : f.item, "What was wrong": f.issue_details, Report: `#${f.report_id}`, Found: fmtDate(f.found_at), Now: f.state === "Open" ? f.stage : f.state }))} empty="None this month." />
        </section>
        <section>
          <h3>Repairs</h3>
          <PrintTable rows={[{ "Verified this month": repairsDone.length, "Open at month end": repairsOpen.length, "Waiting for parts": parts.length }]} />
        </section>
        <section>
          <h3>Overdue: decisions and reviews waiting over 7 days ({late.length}), phone decisions to confirm ({provisional.length})</h3>
          <PrintTable rows={[
            ...late.sort((a, b) => (a.waiting_since ?? 0) - (b.waiting_since ?? 0)).map((w) => ({ What: w.kind === "fault" ? `Fault decision: ${w.item ?? "fault"}` : "Report review", Unit: code(w.asset_id), Report: `#${w.report_id}`, "With": w.assigned_to_name ?? w.step, "Days waiting": Math.floor((nowSecs() - (w.waiting_since ?? nowSecs())) / DAY) })),
            ...provisional.map((d) => ({ What: `Phone decision to confirm: ${d.item ?? "fault"}`, Unit: code(d.asset_id), Report: `#${d.report_id}`, "With": d.reviewer, "Days waiting": d.decided_at ? Math.floor((nowSecs() - d.decided_at) / DAY) : null })),
          ]} empty="Nothing overdue." />
        </section>
        <section>
          <h3>MOC exemptions in force during the month ({ex.rows.length})</h3>
          <PrintTable rows={ex.rows.map((r) => ({ Unit: code(r.x.asset_id), MOC: r.x.moc_reference, From: fmtDate(r.x.valid_from), Until: fmtDate(r.x.valid_until), Limitations: r.x.limitations, "How it ended": r.how }))} empty="No exemptions this month." />
        </section>
      </>)}
    </PrintSheet>
  );
}
