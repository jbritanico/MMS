import { useReportsNeedingSupervisorAction } from "./hooks/useMriReports";
import { useCurrentUser } from "../../lib/currentUser";

const STATUS_LABEL: Record<string, { label: string; action: string; color: string }> = {
    Submitted: { label: "Awaiting endorsement", action: "Endorse", color: "#d97706" },
    Endorsed: { label: "Endorsed — awaiting close", action: "Close", color: "#2f6fed" },
    Escalated: { label: "Resolved — awaiting close", action: "Close", color: "#0d9488" },
};

interface ReportReviewQueueProps {
    onOpenReport: (reportId: number) => void;
}

function formatSubmittedDate(value: string | null | undefined): string {
    if (!value) return "—";
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return value;
    return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function ReportReviewQueue({ onOpenReport }: ReportReviewQueueProps) {
    const { user: currentUser } = useCurrentUser();
    const { data: rows = [], isLoading } = useReportsNeedingSupervisorAction(currentUser?.id ?? 0);

    return (
        <div>
            <div className="header">
                <h1>Reports to Review</h1>
                <span className="sub">MR-I reports awaiting your endorsement or closure</span>
            </div>

            {isLoading ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>Loading...</p>
            ) : rows.length === 0 ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>No reports currently need your attention.</p>
            ) : (
                <div className="review-card-grid">
                    {rows.map((row) => {
                        const meta = STATUS_LABEL[row.status] ?? { label: row.status, action: "Review", color: "#6b7280" };
                        return (
                            <div key={row.id} className="review-card">
                                <div className="review-card-top">
                                    <div className="review-card-code">{row.asset_code ?? "Unknown asset"}</div>
                                    <span
                                        style={{
                                            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                                            color: "#fff", background: meta.color, whiteSpace: "nowrap",
                                        }}
                                    >
                                        {meta.label}
                                    </span>
                                </div>

                                <div className="review-card-desc">{row.asset_description ?? "No description"}</div>

                                <div className="review-card-meta-row">
                                    <span>Report #{row.id}</span>
                                    <span className="review-card-issue-count">
                                        {row.issue_count} issue{row.issue_count === 1 ? "" : "s"}
                                    </span>
                                </div>

                                <div className="review-card-meta-row">
                                    <span>{row.submitted_by ?? "Unknown"}</span>
                                    <span>{formatSubmittedDate(row.submitted_date)}</span>
                                </div>

                                <div className="actions" style={{ marginTop: 4 }}>
                                    <button className="primary" onClick={() => onOpenReport(row.id)} style={{ width: "100%" }}>
                                        {meta.action}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default ReportReviewQueue;