import { PrintSheet, PrintTable, type PrintRow } from "../../components/PrintSheet";
import { useMriDashboardFaults } from "./hooks/useMriDashboards";
import type { MriHistoryRow } from "./hooks/useMriHistory";

// Unit inspection history printout (report 3 of the MR-I reports list, Read Only tier).
// One unit's MR-I history on paper: every report with its stage and status, the faults found on
// each and how they ended, and the MR-II / MR-III counters. Uses the shared print layout.

type Trig = { mr_level: string; trigger_type: string; running_value: number; interval_value: number; warning_value: number; enabled: boolean };
const COUNTER_NAME: Record<string, string> = { OH: "Operating hours", CA: "Calendar days", KM: "Distance", RIF: "Running-in-foot", EH: "Engine hours" };
const COUNTER_UNIT: Record<string, string> = { OH: "h", CA: "days", KM: "km", RIF: "ft", EH: "h" };
const SEV_ORDER: Record<string, number> = { Critical: 0, Major: 0, Moderate: 1, Minor: 2 };

// Report dates come as epoch seconds (as text) or as a date string.
function day(raw: string | number | null | undefined) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return "—";
  const n = Number(raw);
  const d = !isNaN(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(raw));
  return isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function HistoryPrint({ assetId, assetCode, assetDescription, tag, tagReason, rows, triggers, onClose }: {
  assetId: number; assetCode: string; assetDescription: string | null; tag: string | null; tagReason: string | null;
  rows: MriHistoryRow[]; triggers: Trig[]; onClose: () => void;
}) {
  const { data: faults = [], isLoading } = useMriDashboardFaults();
  const mine = faults.filter((f) => f.asset_id === assetId);
  const byReport = (id: number) => mine.filter((f) => f.report_id === id).sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3));
  // Oldest first reads like a logbook.
  const reports = [...rows].sort((a, b) => Number(a.submitted_date ?? a.created_date) - Number(b.submitted_date ?? b.created_date));

  const reportRows: PrintRow[] = reports.map((r) => ({
    Report: `#${r.id}`,
    Stage: r.compliance_stage ?? "—",
    Part: r.component_label ?? null,
    Sent: day(r.submitted_date),
    "Sent by": r.submitted_by,
    Closed: r.status === "Approved" ? day(r.approved_date) : null,
    Status: r.status === "Approved" ? "Closed" : r.status,
    Faults: r.issue_count,
    "Engine h": r.eh_reading,
    km: r.km_reading,
  }));
  const counterRows: PrintRow[] = triggers.filter((t) => t.enabled && t.interval_value > 0).map((t) => ({
    Level: t.mr_level,
    Counter: COUNTER_NAME[t.trigger_type] ?? t.trigger_type,
    Used: `${t.running_value.toLocaleString()} ${COUNTER_UNIT[t.trigger_type] ?? ""}`,
    Limit: `${t.interval_value.toLocaleString()} ${COUNTER_UNIT[t.trigger_type] ?? ""}`,
    Status: t.running_value >= t.interval_value ? "Due now" : t.warning_value > 0 && t.running_value >= t.warning_value ? "Due soon" : "On track",
  }));
  const withFaults = reports.filter((r) => byReport(r.id).length > 0);

  return (
    <PrintSheet
      eyebrow="Unit inspection history · MR-I"
      title={`${assetCode}${assetDescription ? ` · ${assetDescription}` : ""}`}
      sub={`${tag ? `${tag} tag` : "Not tagged"}${tagReason ? ` · ${tagReason}` : ""} · ${reports.length} MR-I report${reports.length === 1 ? "" : "s"}`}
      onClose={onClose}
      ready={!isLoading}
    >
      <section>
        <h3>MR-I reports ({reports.length})</h3>
        <PrintTable rows={reportRows} empty="No MR-I reports have been filed for this unit yet." />
      </section>
      <section>
        <h3>Faults found, by report</h3>
        {isLoading ? <p className="ps-empty">Loading…</p> : withFaults.length === 0 ? <p className="ps-empty">No faults on any sent report.</p> : withFaults.map((r) => (
          <div key={r.id} style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: 12 }}>Report #{r.id} · {r.compliance_stage ?? "No stage"} · {day(r.submitted_date)}</strong>
            <PrintTable rows={byReport(r.id).map((f) => ({
              Severity: f.severity,
              Item: f.component ? `${f.item ?? "—"} · ${f.component}` : f.item,
              "What was wrong": f.issue_details,
              "How it ended": f.state === "Open" ? `Open: ${f.stage}` : f.stage,
            }))} />
          </div>
        ))}
      </section>
      <section>
        <h3>MR-II / MR-III counters</h3>
        <PrintTable rows={counterRows} empty="No counters set for this unit." />
      </section>
    </PrintSheet>
  );
}
