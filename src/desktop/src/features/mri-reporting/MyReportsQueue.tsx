import { useState } from "react";
import { useCurrentUser } from "../../lib/currentUser";
import { useMyOpenMriReports } from "./hooks/useMriReports";
import { QueueIconButton, QUEUE_ICON_CSS } from "./QueueIconButton";
import { TIG_CSS } from "../mri-template-builder/TemplateIsoGuide";
import { ADMIN_CSS, IsoTiles, RowTile, ScreenIntro, type Tone } from "../administration/AdminIsoGuide";
import { REPORT_KIT_CSS } from "./reportKit";

// Option B look (MR-I Reporting checklist, Group 9). Display only: which reports are listed and what
// opening a report or its flow does are unchanged.
const STATUS_LABEL: Record<string, { label: string; next: string; color: string; tone: Tone }> = {
    Submitted: { label: "Waiting for the supervisor to endorse it", next: "Nothing for you to do yet", color: "var(--st-amber)", tone: "blue" },
    Endorsed: { label: "Endorsed — waiting to be closed", next: "Nothing for you to do yet", color: "var(--st-blue)", tone: "blue" },
    Escalated: { label: "Escalated — its faults are being reviewed", next: "Nothing for you to do yet", color: "var(--st-red)", tone: "look" },
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
    onOpenFlow?: (reportId: number) => void;
}

type Filter = "all" | "Submitted" | "Endorsed" | "Escalated";

// Read-only status tracker for reports the current user submitted themselves -- no action
// buttons, since closing/endorsing is a Supervisor+ action. Clicking a card just opens the
// report, which is already locked to view-only once it's past Draft.
function MyReportsQueue({ onOpenReport, onOpenFlow }: MyReportsQueueProps) {
    const { user: currentUser } = useCurrentUser();
    const { data: rows = [], isLoading } = useMyOpenMriReports(currentUser?.name);
    const [filter, setFilter] = useState<Filter>("all");
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
    const issues = rows.reduce((n, r) => n + (r.issue_count ?? 0), 0);

    return (
        <div className="tig rk">
            <style>{QUEUE_ICON_CSS + TIG_CSS + ADMIN_CSS + REPORT_KIT_CSS}</style>
            <div className="header">
                <h1>Reports I sent that aren't closed</h1>
                <span className="sub">My Reports</span>
            </div>

            <ScreenIntro
                glyph="report"
                label="My reports: what you'll see here"
                kpis={[
                    { label: "not closed yet", value: rows.length, tone: "blue" },
                    { label: "waiting to be endorsed", value: count("Submitted"), tone: count("Submitted") ? "blue" : "skip" },
                    { label: "escalated", value: count("Escalated"), tone: count("Escalated") ? "look" : "skip" },
                    { label: "issues on them", value: issues, tone: issues ? "look" : "skip" },
                ]}
                explain="Every MR-I report you sent that hasn't been closed yet, and who it's waiting for. You don't need to do anything here — a report leaves this list once it's closed."
                todo={[
                    "Check where each report has got to",
                    "Click a report to look at it (it's read-only now)",
                    "Use Show flow to see its faults, decisions and repairs",
                ]}
            />

            {rows.length > 0 && (
                <IsoTiles
                    label="Show reports by status"
                    selected={filter}
                    onPick={setFilter}
                    items={[
                        { id: "all", label: "All", count: String(rows.length), tone: "blue" },
                        { id: "Submitted", label: "Waiting to be endorsed", count: String(count("Submitted")), tone: "blue" },
                        { id: "Endorsed", label: "Endorsed", count: String(count("Endorsed")), tone: "blue" },
                        { id: "Escalated", label: "Escalated", count: String(count("Escalated")), tone: "look" },
                    ]}
                />
            )}

            {isLoading ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>Loading...</p>
            ) : rows.length === 0 ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>All your submitted reports have been closed.</p>
            ) : shown.length === 0 ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>No reports with this status.</p>
            ) : (
                <div className="review-card-grid">
                    {shown.map((row) => {
                        const meta = STATUS_LABEL[row.status] ?? { label: row.status, next: "", color: "var(--st-grey)", tone: "skip" as Tone };
                        return (
                            <div key={row.id} className="review-card adm-lift" style={{ cursor: "pointer" }} onClick={() => onOpenReport(row.id)}>
                                <div className="review-card-top">
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                        <RowTile tone={meta.tone} />
                                        <div className="review-card-code">{row.asset_code ?? "Unknown asset"}</div>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                                            color: "var(--on-status)", background: meta.color, whiteSpace: "nowrap",
                                        }}
                                        title={row.status}
                                    >
                                        {row.status}
                                    </span>
                                </div>
                                <div className="review-card-desc">{row.asset_description || "No description"}</div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
                                <div style={{ fontSize: 12.5, color: "var(--text-soft)" }}>
                                    Report #{row.id} · {row.issue_count} issue{row.issue_count === 1 ? "" : "s"} · sent {formatDate(row.submitted_date)}
                                </div>
                                {meta.next && <div style={{ fontSize: 12, color: "var(--text-soft)" }}>{meta.next}</div>}
                                <div className="queue-icon-row">
                                    {onOpenFlow && (
                                        <QueueIconButton icon="flow" label="Show flow" onClick={(e) => { e.stopPropagation(); onOpenFlow(row.id); }} />
                                    )}
                                    <QueueIconButton icon="view" label={`View report #${row.id}`} onClick={(e) => { e.stopPropagation(); onOpenReport(row.id); }} primary />
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