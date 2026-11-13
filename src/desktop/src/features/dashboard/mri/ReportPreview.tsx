import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ReportWizard from "../../mri-reporting/ReportWizard";
import { useAssetMriHistory } from "../hooks/useMriHistory";

// Drill-down from any MR-I dashboard to the MR-I report itself.
// The report opens read-only (the same 2-page layout as Asset MR-I History) in a panel over the
// dashboard, so closing it returns to the dashboard with the same filters and selections.

type PreviewFn = (reportId: number) => void;
const Ctx = createContext<PreviewFn>(() => {});

export const useReportPreview = () => useContext(Ctx);

export function ReportPreviewProvider({ children }: { children: ReactNode }) {
  const [reportId, setReportId] = useState<number | null>(null);
  const close = useCallback(() => setReportId(null), []);

  useEffect(() => {
    if (reportId == null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportId, close]);

  return (
    <Ctx.Provider value={setReportId}>
      {children}
      {reportId != null && createPortal(
        <div className="mrid-preview" role="dialog" aria-modal="true" aria-label={`MR-I report #${reportId}`} onClick={close}>
          <div className="mrid-preview-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mrid-preview-head no-print">
              <span>MR-I report <b>#{reportId}</b> · read-only preview</span>
              <button type="button" className="ghost" onClick={close}>✕ Close</button>
            </div>
            <div className="mrid-preview-body">
              <ReportWizard key={reportId} reportId={reportId} viewOnly onBack={close} />
            </div>
          </div>
        </div>,
        // Rendered as a direct child of the app root (keeps the theme), so printing can hide
        // everything else and let the report flow over as many pages as it needs.
        document.querySelector(".app") ?? document.body,
      )}
    </Ctx.Provider>
  );
}

/** Button that opens one report in the preview. */
export function PreviewButton({ reportId, label }: { reportId: number; label?: string }) {
  const preview = useReportPreview();
  return (
    <button
      type="button"
      className="ghost mrid-preview-btn"
      title={`Preview MR-I report #${reportId}`}
      onClick={(e) => {
        e.stopPropagation();
        preview(reportId);
      }}
    >
      {label ?? `Report #${reportId}`} ↗
    </button>
  );
}

const fmt = (s: string | null) => {
  if (!s) return "—";
  const n = Number(s);
  const d = Number.isFinite(n) && /^\d+$/.test(s.trim()) ? new Date(n * 1000) : new Date(s);
  if (isNaN(d.getTime())) return s;
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getDate()).padStart(2, "0")} ${M[d.getMonth()]} ${d.getFullYear()}`;
};

/** Every MR-I report of one unit, newest first, each with a Preview button. */
export function UnitReports({ assetId }: { assetId: number }) {
  const { data = [], isLoading } = useAssetMriHistory(assetId);
  if (isLoading) return <p className="mrid-note">Loading reports...</p>;
  if (data.length === 0) return <p className="mrid-note">This unit has no MR-I reports yet.</p>;
  return (
    <table className="mrid-table mrid-subtable">
      <thead>
        <tr><th>Report</th><th>Stage</th><th>Status</th><th>Submitted</th><th>Faults</th><th>Main issues</th></tr>
      </thead>
      <tbody>
        {data.map((r) => (
          <tr key={r.id}>
            <td><PreviewButton reportId={r.id} /></td>
            <td>{r.compliance_stage ?? "—"}{r.component_label ? <span className="mrid-soft"> · {r.component_label}</span> : null}</td>
            <td>{r.status}</td>
            <td>{fmt(r.submitted_date ?? r.created_date)}</td>
            <td>{r.issue_count}</td>
            <td className="mrid-soft">{r.key_issues.length ? r.key_issues.slice(0, 3).join("; ") + (r.key_issues.length > 3 ? "…" : "") : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
