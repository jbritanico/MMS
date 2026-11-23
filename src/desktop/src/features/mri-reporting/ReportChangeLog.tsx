import { useEffect, useState } from "react";
import { useCurrentUser } from "../../lib/currentUser";
import { useMarkReportChangesSeen, useReportEditLog, type MriReportEdit } from "./hooks/useReportEdits";

// FB-006 (RFSM approved): every change made to the report after it was submitted, with who
// made it and when, for the audit trail. When the operator who submitted the report opens it,
// a notice says it was changed and the changes are marked as seen.

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function when(raw: string | null | undefined) {
  if (!raw) return "—";
  const n = Number(raw);
  const d = !isNaN(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return `${String(d.getDate()).padStart(2, "0")}/${M[d.getMonth()]}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const shown = (v: string | null) => {
  const t = (v ?? "").trim();
  return t === "" ? "(empty)" : t === "true" ? "Yes" : t === "false" ? "No" : t;
};

export default function ReportChangeLog({ reportId, submittedBy }: { reportId: number; submittedBy: string | null }) {
  const { data: rows = [] } = useReportEditLog(reportId);
  const { user } = useCurrentUser();
  const mark = useMarkReportChangesSeen();
  const isSubmitter = !!user?.name && !!submittedBy && user.name === submittedBy;
  const unseen = rows.filter((r) => !r.seen_by_submitter_at && (r.changed_by ?? "") !== (submittedBy ?? ""));
  // Remember how many were new when the operator opened it, so the notice stays after marking.
  const [newForMe, setNewForMe] = useState(0);
  useEffect(() => {
    if (!isSubmitter || unseen.length === 0 || !user?.name) return;
    setNewForMe(unseen.length);
    mark.mutate({ reportId, userName: user.name });
  }, [isSubmitter, unseen.length, reportId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => Number(b.changed_at) - Number(a.changed_at) || b.id - a.id);
  return (
    <div className="panel rcl" style={{ marginTop: 16 }}>
      <style>{RCL_CSS}</style>
      <h3 className="rk-group-h">Changes after it was sent ({rows.length})<small>Kept for the audit trail: who changed what, and when</small></h3>
      {isSubmitter && newForMe > 0 && (
        <div className="rcl-notice" role="status">
          This report was changed after you sent it: {newForMe} change{newForMe === 1 ? "" : "s"} by {[...new Set(unseen.map((r) => r.changed_by || "someone"))].join(", ")}. They are listed below.
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="rcl-table">
          <thead><tr><th>When</th><th>Who</th><th>Part</th><th>Item</th><th>Change</th></tr></thead>
          <tbody>{sorted.map((r: MriReportEdit) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: "nowrap" }}>{when(r.changed_at)}</td>
              <td>{r.changed_by ?? "—"}</td>
              <td>{r.part}</td>
              <td>{r.item_label}{r.field && r.field !== "Value" ? <div className="rcl-soft">{r.field}</div> : null}</td>
              <td><span className="rcl-old">{shown(r.old_value)}</span> → <b>{shown(r.new_value)}</b></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

const RCL_CSS = `
.rcl-notice { margin: 0 0 12px; padding: 10px 12px; border-radius: 10px; border-left: 4px solid var(--warn); background: color-mix(in srgb, var(--warn) 12%, transparent); font-size: 13px; font-weight: 600; }
.rcl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rcl-table th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-soft); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.rcl-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
.rcl-soft, .rcl-old { color: var(--text-soft); font-size: 12px; }
.rcl-old { text-decoration: line-through; }
`;
