import { useState } from "react";
import { useReportsNeedingSupervisorAction, useReportsAwaitingCost } from "./hooks/useMriReports";
import { useCurrentUser } from "../../lib/currentUser";
import { QueueIconButton, QUEUE_ICON_CSS } from "./QueueIconButton";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";
import { TIG_CSS } from "../mri-template-builder/TemplateIsoGuide";
import { ADMIN_CSS, IsoTiles, RowTile, ScreenIntro } from "../administration/AdminIsoGuide";
import { REPORT_KIT_CSS } from "./reportKit";

// Option B look (MR-I Reporting checklist, Group 9). Display only: which reports are listed, who sees
// the MR cost list and what each button opens are unchanged.
const STATUS_LABEL: Record<string, { label: string; next: string; action: string; color: string }> = {
    Submitted: { label: "Waiting for you to endorse it", next: "Open it to endorse — or close and approve it if it has no Moderate or Critical faults", action: "Endorse", color: "var(--st-amber)" },
    Endorsed: { label: "Endorsed — waiting for you to close it", next: "Open it to close the report", action: "Close", color: "var(--st-blue)" },
    Escalated: { label: "Faults resolved — waiting for you to close it", next: "Open it to close the report", action: "Close", color: "var(--st-teal)" },
};

interface ReportReviewQueueProps {
    onOpenReport: (reportId: number) => void;
    onOpenFlow?: (reportId: number) => void;
}

function formatSubmittedDate(value: string | null | undefined): string {
    if (!value) return "—";
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return value;
    return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type Filter = "all" | "endorse" | "close";

function ReportReviewQueue({ onOpenReport, onOpenFlow }: ReportReviewQueueProps) {
    const { user: currentUser } = useCurrentUser();
    const { data: rows = [], isLoading } = useReportsNeedingSupervisorAction(currentUser?.id ?? 0);
    const { data: permissions = [] } = useEffectivePermissions(currentUser?.id ?? 0);
    const canEnterCost = permissions.includes("mri.enter_cost");
    const { data: costRows = [] } = useReportsAwaitingCost(canEnterCost ? currentUser?.id ?? 0 : 0);
    const [filter, setFilter] = useState<Filter>("all");
    const toEndorse = rows.filter((r) => r.status === "Submitted");
    const toClose = rows.filter((r) => r.status !== "Submitted");
    const shown = filter === "endorse" ? toEndorse : filter === "close" ? toClose : rows;

    return (
        <div className="tig rk">
            <style>{QUEUE_ICON_CSS + TIG_CSS + ADMIN_CSS + REPORT_KIT_CSS}</style>
            <div className="header">
                <h1>Reports waiting for me</h1>
                <span className="sub">Reports to Review</span>
            </div>

            <ScreenIntro
                glyph="decision"
                label="Reports waiting for me: what you'll do here"
                kpis={[
                    { label: "waiting for you", value: rows.length, tone: rows.length ? "look" : "ok" },
                    { label: "to endorse", value: toEndorse.length, tone: toEndorse.length ? "look" : "skip" },
                    { label: "to close", value: toClose.length, tone: toClose.length ? "look" : "skip" },
                    ...(canEnterCost ? [{ label: "waiting for the MR cost", value: costRows.length, tone: (costRows.length ? "look" : "skip") as "look" | "skip" }] : []),
                ]}
                explain="MR-I reports that need you: to endorse, or to close once their faults are dealt with. Each card says what it's waiting for."
                todo={[
                    "Start with the orange cards — they're waiting for you",
                    "Open a report to endorse it, or close and approve it",
                    "Use Show flow to see its faults, decisions and repairs",
                ]}
                hints={rows.length ? [`${rows.length} ${rows.length === 1 ? "report is" : "reports are"} waiting for you`] : []}
            />

            {rows.length > 0 && (
                <IsoTiles
                    label="Show reports by what they need"
                    selected={filter}
                    onPick={setFilter}
                    items={[
                        { id: "all", label: "All", count: String(rows.length), tone: "blue" },
                        { id: "endorse", label: "To endorse", count: String(toEndorse.length), tone: "look" },
                        { id: "close", label: "To close", count: String(toClose.length), tone: "look" },
                    ]}
                />
            )}

            {isLoading ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>Loading...</p>
            ) : rows.length === 0 ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>No reports currently need your attention.</p>
            ) : (
                <div className="review-card-grid">
                    {shown.map((row) => {
                        const meta = STATUS_LABEL[row.status] ?? { label: row.status, next: "", action: "Review", color: "var(--st-grey)" };
                        return (
                            <div key={row.id} className="review-card adm-lift">
                                <div className="review-card-top">
                                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                        <RowTile tone="look" />
                                        <div className="review-card-code">{row.asset_code ?? "Unknown asset"}</div>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                                            color: "var(--on-status)", background: meta.color, whiteSpace: "nowrap",
                                        }}
                                    >
                                        {row.status}
                                    </span>
                                </div>

                                <div className="review-card-desc">{row.asset_description ?? "No description"}</div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
                                {meta.next && <div style={{ fontSize: 12, color: "var(--text-soft)" }}>{meta.next}</div>}

                                <div className="review-card-meta-row">
                                    <span>Report #{row.id}</span>
                                    <span className="review-card-issue-count">
                                        {row.issue_count} issue{row.issue_count === 1 ? "" : "s"}
                                    </span>
                                </div>

                                <div className="review-card-meta-row">
                                    <span>Sent by {row.submitted_by ?? "Unknown"}</span>
                                    <span>{formatSubmittedDate(row.submitted_date)}</span>
                                </div>

                                <div className="queue-icon-row">
                                    {onOpenFlow && (
                                        <QueueIconButton icon="flow" label="Show flow" onClick={() => onOpenFlow(row.id)} />
                                    )}
                                    <QueueIconButton
                                        icon={meta.action === "Endorse" ? "endorse" : meta.action === "Close" ? "close" : "view"}
                                        label={`${meta.action} report #${row.id}`}
                                        onClick={() => onOpenReport(row.id)}
                                        primary
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {canEnterCost && costRows.length > 0 && (
                <div style={{ marginTop: 28 }}>
                    <h2 style={{ fontSize: 15, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
                        <RowTile tone="look" /> Waiting for the MR cost
                    </h2>
                    <p style={{ color: "var(--text-soft)", fontSize: 12.5, marginBottom: 12 }}>
                        Awaiting MR cost — open reports where the cost to perform the MR hasn't been added yet.
                    </p>
                    <div className="review-card-grid">
                        {costRows.map((row) => (
                            <div key={row.id} className="review-card adm-lift">
                                <div className="review-card-top">
                                    <div className="review-card-code">{row.asset_code ?? "Unknown asset"}</div>
                                </div>
                                <div className="review-card-desc">{row.asset_description ?? "No description"}</div>
                                <div className="review-card-meta-row">
                                    <span>Report #{row.id}</span>
                                    <span>Sent by {row.submitted_by ?? "Unknown"}</span>
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