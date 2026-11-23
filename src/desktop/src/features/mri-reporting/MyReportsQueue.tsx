import { useState } from "react";
import * as XLSX from "xlsx";
import { useMriDashboardDetails, useMriDashboardMore } from "../dashboard/hooks/useMriDashboards";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { PrintSheet, PrintTable, type PrintRow } from "../../components/PrintSheet";
import { useCurrentUser } from "../../lib/currentUser";
import { useMyOpenMriReports } from "./hooks/useMriReports";
import { useMyReportChangeNotices } from "./hooks/useReportEdits";
import { QueueIconButton, QUEUE_ICON_CSS } from "./QueueIconButton";
import { TIG_CSS } from "../mri-template-builder/TemplateIsoGuide";
import { ADMIN_CSS, IsoTiles, RowTile, ScreenIntro, type Tone } from "../administration/AdminIsoGuide";
import { KeyGroup, REPORT_KIT_CSS } from "./reportKit";

// Drafts older than this many days are listed under "Drafts not sent".
const DRAFT_DAYS = 7;
type View = "open" | "drafts" | "log";
type Period = "30" | "90" | "365" | "all";
const PERIODS: { id: Period; label: string }[] = [
    { id: "30", label: "Last 30 days" }, { id: "90", label: "Last 3 months" }, { id: "365", label: "Last 12 months" }, { id: "all", label: "All time" },
];
const stageKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const STAGE_NAME: Record<string, string> = { PREMOB: "Pre-Mob", PREJOB: "Pre-Job", POSTJOB: "Post-Job", YARDINSPECTION: "Yard inspection", YARD: "Yard inspection" };
const stageName = (s: string | null | undefined) => STAGE_NAME[stageKey(s)] ?? (s || "No stage");

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
    // FB-006: reports this user sent that the Job Supervisor changed afterwards.
    const { data: changed = [] } = useMyReportChangeNotices(currentUser?.name);
    const [filter, setFilter] = useState<Filter>("all");
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
    const issues = rows.reduce((n, r) => n + (r.issue_count ?? 0), 0);

    // Drafts and the inspections log come from the same country-scoped report list as the dashboards.
    const { data: more } = useMriDashboardMore();
    // Fail items sent without a photo (MR-I reports list, report 7).
    const { data: details } = useMriDashboardDetails();
    const noPhoto = (id: number) => (details?.results ?? []).filter((x) => x.report_id === id && x.status === "Fail" && !x.has_photo).length;
    const { data: assets = [] } = useAssets();
    const unitOf = (id: number) => assets.find((a) => a.id === id);
    const [view, setView] = useState<View>("open");
    const [period, setPeriod] = useState<Period>("90");
    const [stage, setStage] = useState("");
    const [printing, setPrinting] = useState(false);
    const now = Date.now() / 1000;
    const drafts = (more?.reports ?? [])
        .filter((r) => r.status === "Draft" && r.created_at != null && now - r.created_at > DRAFT_DAYS * 86400)
        .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
    const mine = (more?.reports ?? []).filter((r) => r.status !== "Draft" && !!currentUser?.name && r.submitted_by === currentUser.name);
    const stagesUsed = [...new Set(mine.map((r) => stageKey(r.compliance_stage)))].filter(Boolean);
    const log = mine
        .filter((r) => period === "all" || (r.submitted_at != null && now - r.submitted_at <= Number(period) * 86400))
        .filter((r) => !stage || stageKey(r.compliance_stage) === stage)
        .sort((a, b) => (b.submitted_at ?? 0) - (a.submitted_at ?? 0));
    const logRows = (): PrintRow[] => log.map((r) => ({
        Sent: formatDate(r.submitted_at),
        Unit: unitOf(r.asset_id)?.asset_code ?? `Unit ${r.asset_id}`,
        Part: r.component,
        Stage: stageName(r.compliance_stage),
        Report: `#${r.id}`,
        Status: r.status === "Approved" ? "Closed" : r.status,
        Faults: r.fault_count,
    }));
    const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? "";
    function exportLog() {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
            { Setting: "Inspector", Value: currentUser?.name ?? "" },
            { Setting: "Period", Value: periodLabel },
            { Setting: "Compliance stage", Value: stage ? stageName(stage) : "All stages" },
            { Setting: "Exported at", Value: new Date().toLocaleString() },
        ]), "Filters");
        const rowsOut = logRows();
        XLSX.utils.book_append_sheet(wb, rowsOut.length ? XLSX.utils.json_to_sheet(rowsOut) : XLSX.utils.aoa_to_sheet([["No reports"]]), "My inspections");
        XLSX.writeFile(wb, `My MR-I inspections - ${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    return (
        <div className="tig rk">
            <style>{QUEUE_ICON_CSS + TIG_CSS + ADMIN_CSS + REPORT_KIT_CSS + MRL_CSS}</style>
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
                    { label: `drafts not sent in ${DRAFT_DAYS} days`, value: drafts.length, tone: drafts.length ? "look" : "skip" },
                ]}
                explain="Every MR-I report you sent that hasn't been closed yet, and who it's waiting for. You don't need to do anything here — a report leaves this list once it's closed."
                todo={[
                    "Check where each report has got to",
                    "Click a report to look at it (it's read-only now)",
                    "Use Show flow to see its faults, decisions and repairs",
                    "Check Drafts not sent, and look back at everything you sent in My inspections log",
                ]}
            />

            {changed.length > 0 && (
                <div className="panel" style={{ margin: "0 0 14px", borderLeft: "4px solid var(--warn)" }}>
                    <h3 className="rk-group-h">Changed by your supervisor ({changed.length})<small>Reports you sent that were changed afterwards. Open one to see what changed.</small></h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {changed.map((c) => (
                            <div key={c.report_id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                                <b>Report #{c.report_id}</b>
                                <span>{c.asset_code ?? ""}</span>
                                <span style={{ color: "var(--text-soft)" }}>{c.changes} change{c.changes === 1 ? "" : "s"} by {c.last_changed_by ?? "someone"} · {formatDate(c.last_changed_at)}</span>
                                <button className="ghost" style={{ marginLeft: "auto" }} onClick={() => onOpenReport(c.report_id)}>Open report</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ margin: "4px 0 14px" }}>
                <KeyGroup<View> label="What to show" small value={view} onChange={setView} options={[
                    { id: "open", label: `Not closed yet (${rows.length})` },
                    { id: "drafts", label: `Drafts not sent in ${DRAFT_DAYS} days (${drafts.length})`, tone: drafts.length ? "look" : "blue" },
                    { id: "log", label: "My inspections log" },
                ]} />
            </div>

            {view === "drafts" && (
                drafts.length === 0 ? (
                    <p style={{ color: "var(--text-soft)", fontSize: 13 }}>No drafts older than {DRAFT_DAYS} days on your units.</p>
                ) : (
                    <>
                        <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 0 }}>Reports started more than {DRAFT_DAYS} days ago and not sent. A draft stops a new report being started on that unit, so finish it or ask an Administrator to remove it.</p>
                        <div className="review-card-grid">
                            {drafts.map((r) => {
                                const u = unitOf(r.asset_id);
                                const age = Math.floor((now - (r.created_at ?? now)) / 86400);
                                return (
                                    <div key={r.id} className="review-card adm-lift" style={{ cursor: "pointer" }} onClick={() => onOpenReport(r.id)}>
                                        <div className="review-card-top">
                                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                                <RowTile tone="look" />
                                                <div className="review-card-code">{u?.asset_code ?? `Unit ${r.asset_id}`}{r.component ? ` · ${r.component}` : ""}</div>
                                            </div>
                                            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, color: "var(--on-status)", background: "var(--st-amber)", whiteSpace: "nowrap" }}>Draft</span>
                                        </div>
                                        <div className="review-card-desc">{u?.asset_description || "No description"}</div>
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>Not sent for {age} days</div>
                                        <div style={{ fontSize: 12.5, color: "var(--text-soft)" }}>Report #{r.id} · started {formatDate(r.created_at)}</div>
                                        <div className="queue-icon-row">
                                            <QueueIconButton icon="view" label={`Open draft #${r.id}`} onClick={(e) => { e.stopPropagation(); onOpenReport(r.id); }} primary />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )
            )}

            {view === "log" && (
                <div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-soft)" }}>Period
                            <select className="neu-select" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
                                {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-soft)" }}>Compliance stage
                            <select className="neu-select" value={stage} onChange={(e) => setStage(e.target.value)}>
                                <option value="">All stages</option>
                                {stagesUsed.map((s) => <option key={s} value={s}>{stageName(s)}</option>)}
                            </select>
                        </label>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="ghost" onClick={exportLog} disabled={log.length === 0}>⤓ Export to Excel</button>
                        <button type="button" className="ghost" onClick={() => setPrinting(true)} disabled={log.length === 0}>Print / PDF</button>
                    </div>
                    {log.length === 0 ? (
                        <p style={{ color: "var(--text-soft)", fontSize: 13 }}>No reports sent by you in this period{stage ? " at this stage" : ""}.</p>
                    ) : (
                        <div className="asset-table-wrap" style={{ overflowX: "auto" }}>
                            <table className="mrl-table">
                                <thead><tr><th>Sent</th><th>Unit</th><th>Stage</th><th>Report</th><th>Status</th><th>Faults</th><th aria-label="Open" /></tr></thead>
                                <tbody>{log.map((r) => {
                                    const u = unitOf(r.asset_id);
                                    return (
                                        <tr key={r.id}>
                                            <td>{formatDate(r.submitted_at)}</td>
                                            <td><b>{u?.asset_code ?? `Unit ${r.asset_id}`}</b>{r.component ? ` · ${r.component}` : ""}<div style={{ fontSize: 12, color: "var(--text-soft)" }}>{u?.asset_description ?? ""}</div></td>
                                            <td>{stageName(r.compliance_stage)}</td>
                                            <td>#{r.id}</td>
                                            <td>{r.status === "Approved" ? "Closed" : r.status}</td>
                                            <td>{r.fault_count}</td>
                                            <td><QueueIconButton icon="view" label={`View report #${r.id}`} onClick={() => onOpenReport(r.id)} primary /></td>
                                        </tr>
                                    );
                                })}</tbody>
                            </table>
                        </div>
                    )}
                    {printing && (
                        <PrintSheet eyebrow="My MR-I inspections" title={currentUser?.name ?? "My inspections"}
                            sub={`${periodLabel} · ${stage ? stageName(stage) : "All stages"} · ${log.length} report${log.length === 1 ? "" : "s"}`}
                            onClose={() => setPrinting(false)}>
                            <section><PrintTable rows={logRows()} /></section>
                        </PrintSheet>
                    )}
                </div>
            )}

            {view === "open" && rows.length > 0 && (
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

            {view !== "open" ? null : isLoading ? (
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
                                {noPhoto(row.id) > 0 && (
                                    <button type="button" className="mr-nophoto" title="Open the report to see which Fail items have no photo"
                                        onClick={(e) => { e.stopPropagation(); onOpenReport(row.id); }}>
                                        {noPhoto(row.id)} Fail item{noPhoto(row.id) === 1 ? "" : "s"} without a photo
                                    </button>
                                )}
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

const MRL_CSS = `
.mrl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mrl-table th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-soft); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.mrl-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.mr-nophoto { all: unset; cursor: pointer; align-self: flex-start; font-size: 12px; font-weight: 700; color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent); background: color-mix(in srgb, var(--warn) 10%, transparent); border-radius: 999px; padding: 3px 10px; }
.mr-nophoto:hover { background: color-mix(in srgb, var(--warn) 18%, transparent); }
.mr-nophoto:focus-visible { outline: 2px solid var(--warn); outline-offset: 2px; }
`;

export default MyReportsQueue;