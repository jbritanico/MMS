import { useCurrentUser } from "../../lib/currentUser";
import { useMyOpenMriReports } from "./hooks/useMriReports";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    Submitted: { label: "Awaiting Supervisor endorsement", color: "#d97706" },
    Endorsed: { label: "Endorsed — awaiting close", color: "#2f6fed" },
    Escalated: { label: "Escalated — under review", color: "#c0392b" },
};

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
                <div className="cards">
                    {rows.map((row) => {
                        const meta = STATUS_LABEL[row.status] ?? { label: row.status, color: "#6b7280" };
                        return (
                            <div
                                key={row.id}
                                className="panel"
                                style={{ padding: 16, cursor: "pointer" }}
                                onClick={() => onOpenReport(row.id)}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                                    <div className="card-main">
                                        <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 600 }}>
                                            {row.asset_code ?? "Unknown asset"} — Report #{row.id}
                                        </div>
                                        <div className="desc" style={{ whiteSpace: "normal" }}>
                                            Submitted {row.submitted_date ?? "—"}
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
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default MyReportsQueue;