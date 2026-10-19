import { useReportsNeedingSupervisorAction, useReportsAwaitingCost } from "./hooks/useMriReports";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";

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
    const { data: permissions = [] } = useEffectivePermissions(currentUser?.id ?? 0);
    const canEnterCost = permissions.includes("mri.enter_cost");
    const { data: costRows = [] } = useReportsAwaitingCost(canEnterCost ? currentUser?.id ?? 0 : 0);

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

            {canEnterCost && costRows.length > 0 && (
                <div style={{ marginTop: 28 }}>
                    <h2 style={{ fontSize: 15, marginBottom: 4 }}>Awaiting MR cost</h2>
                    <p style={{ color: "var(--text-soft)", fontSize: 12.5, marginBottom: 12 }}>
                        Open reports where the cost to perform the MR has not been inserted yet.
                    </p>
                    <div className="review-card-grid">
                        {costRows.map((row) => (
                            <div key={row.id} className="review-card">
                                <div className="review-card-top">
                                    <div className="review-card-code">{row.asset_code ?? "Unknown asset"}</div>
                                </div>
                                <div className="review-card-desc">{row.asset_description ?? "No description"}</div>
                                <div className="review-card-meta-row">
                                    <span>Report #{row.id}</span>
                                    <span>{row.submitted_by ?? "Unknown"}</span>
                                </div>
                                <div className="actions" style={{ marginTop: 4 }}>
                                    <button className="primary" onClick={() => onOpenReport(row.id)} style={{ width: "100%" }}>
                                        Enter cost
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default ReportReviewQueue;