import { useCurrentUser } from "../../lib/currentUser";
import { useMyOpenMriReports } from "./hooks/useMriReports";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    Submitted: { label: "Awaiting Supervisor endorsement", color: "#d97706" },
    Endorsed: { label: "Endorsed — awaiting close", color: "#2f6fed" },
    Escalated: { label: "Escalated — under review", color: "#c0392b" },
};

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// dd/Mmm/yyyy. Accepts epoch seconds/milliseconds or a date string.
function formatDate(raw: string | number | null | undefined): string {
    if (raw === null || raw === undefined || String(raw).trim() === "") return "—";
    const n = Number(raw);
    const d = !isNaN(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(raw));
    if (isNaN(d.getTime())) return String(raw);
    return `${String(d.getDate()).padStart(2, "0")}/${MONTH_ABBR[d.getMonth()]}/${d.getFullYear()}`;
}

interface MyReportsQueueProps {
    onOpenReport: (reportId: number) => void;
}

// Read-only status tracker for reports the current user submitted themselves -- no action
// buttons, since closing/endorsing is a Supervisor+ action. Clicking a card just opens the
// report, which is already locked to view-only once it's past Draft.
function MyReportsQueue({ onOpenReport }: MyReportsQueueProps) {
    const { user: currentUser } = useCurrentUser();
    const { data: rows = [], isLoading } = useMyOpenMriReports(currentUser?.name);

    return (
        <div>
            <div className="header">
                <h1>My Reports</h1>
                <span className="sub">MR-I reports you submitted that aren't closed yet</span>
            </div>

            {isLoading ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>Loading...</p>
            ) : rows.length === 0 ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>All your submitted reports have been closed.</p>
            ) : (
                <div className="review-card-grid">
                    {rows.map((row) => {
                        const meta = STATUS_LABEL[row.status] ?? { label: row.status, color: "#6b7280" };
                        return (
                            <div key={row.id} className="review-card" style={{ cursor: "pointer" }} onClick={() => onOpenReport(row.id)}>
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
                                <div className="review-card-desc">{row.asset_description || "No description"}</div>
                                <div style={{ fontSize: 12.5, color: "var(--text-soft)" }}>
                                    Report #{row.id} · {row.issue_count} issue{row.issue_count === 1 ? "" : "s"}
                                </div>
                                <div style={{ fontSize: 12.5, color: "var(--text-soft)" }}>
                                    Submitted {formatDate(row.submitted_date)}
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    <button className="ghost" onClick={(e) => { e.stopPropagation(); onOpenReport(row.id); }}>View report</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default MyReportsQueue;