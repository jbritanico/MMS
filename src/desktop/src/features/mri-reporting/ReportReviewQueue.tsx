import { useReportsNeedingSupervisorAction } from "./hooks/useMriReports";

const STATUS_LABEL: Record<string, { label: string; action: string; color: string }> = {
    Submitted: { label: "Awaiting endorsement", action: "Endorse", color: "#d97706" },
    Endorsed: { label: "Endorsed — awaiting close", action: "Close", color: "#2f6fed" },
    Escalated: { label: "Resolved — awaiting close", action: "Close", color: "#0d9488" },
};

interface ReportReviewQueueProps {
    onOpenReport: (reportId: number) => void;
}

function ReportReviewQueue({ onOpenReport }: ReportReviewQueueProps) {
    const { data: rows = [], isLoading } = useReportsNeedingSupervisorAction();

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
                <div className="cards">
                    {rows.map((row) => {
                        const meta = STATUS_LABEL[row.status] ?? { label: row.status, action: "Review", color: "#6b7280" };
                        return (
                            <div key={row.id} className="panel" style={{ padding: 16, cursor: "default" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                                    <div className="card-main">
                                        <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 600 }}>
                                            {row.asset_code ?? "Unknown asset"} — Report #{row.id}
                                        </div>
                                        <div className="desc" style={{ whiteSpace: "normal" }}>
                                            Submitted by {row.submitted_by ?? "Unknown"} · {row.submitted_date ?? "—"}
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                                            color: "#fff", background: meta.color, whiteSpace: "nowrap",
                                        }}
                                    >
                                        {meta.label}
                                    </span>
                                </div>

                                <div className="actions" style={{ marginTop: 12 }}>
                                    <button className="primary" onClick={() => onOpenReport(row.id)}>
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