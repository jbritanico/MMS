import { useState } from "react";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";
import {
    usePendingMriFaultRectifications,
    useUpdateMriFaultRectification,
    useVerifyMriFaultRectification,
    useRecordEquipmentLimitations,
    type MriFaultRectification,
} from "./hooks/useMriFaultRectifications";

const PARTS_STATUSES = ["Awaiting", "Ordered", "Available"] as const;


// Status icons (stroke = currentColor) used on the summary bar and on each card's pills.
const sv = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const ICONS = {
    red: (
        <svg {...sv}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" /></svg>
    ),
    yellow: (
        <svg {...sv}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></svg>
    ),
    planned: (
        <svg {...sv}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
    ),
    uninformed: (
        <svg {...sv}><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="m17 9 5 5" /><path d="m22 9-5 5" /></svg>
    ),
};

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Dates arrive as epoch seconds or ISO text; show them as 04/Nov/2026.
function formatDate(raw: string | number | null | undefined): string {
    if (raw === null || raw === undefined || String(raw).trim() === "") return "—";
    const n = Number(raw);
    const d = !isNaN(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(raw));
    if (isNaN(d.getTime())) return String(raw);
    return `${String(d.getDate()).padStart(2, "0")}/${MONTH_ABBR[d.getMonth()]}/${d.getFullYear()}`;
}

interface RectificationQueueProps {
    onOpenFlow?: (reportId: number) => void;
}

function RectificationQueue({ onOpenFlow }: RectificationQueueProps) {
    const { user } = useCurrentUser();
    const { data: permissions = [] } = useEffectivePermissions(user?.id ?? 0);
    const { data: rows = [], isLoading } = usePendingMriFaultRectifications(user?.id ?? 0);

    const canRectify = permissions.includes("mri.rectify");

    const [editingId, setEditingId] = useState<number | null>(null);
    const [assignedTechnician, setAssignedTechnician] = useState("");
    const [partsStatus, setPartsStatus] = useState<(typeof PARTS_STATUSES)[number]>("Awaiting");
    const [repairDate, setRepairDate] = useState("");
    const [verifyingId, setVerifyingId] = useState<number | null>(null);
    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

    const update = useUpdateMriFaultRectification(0);
    const verify = useVerifyMriFaultRectification(0);
    const recordLimits = useRecordEquipmentLimitations(0);
    const [functionTestOk, setFunctionTestOk] = useState(false);
    const [limitsId, setLimitsId] = useState<number | null>(null);
    const [limitsNote, setLimitsNote] = useState("");
    const [filter, setFilter] = useState<"all" | "red" | "yellow" | "planned" | "uninformed">("all");

    function flash(msg: string, kind: "ok" | "err") {
        setStatus({ msg, kind });
        setTimeout(() => setStatus(null), 5000);
    }

    function startEdit(row: MriFaultRectification) {
        setEditingId(row.id);
        setVerifyingId(null);
        setAssignedTechnician(row.assigned_technician ?? "");
        setPartsStatus(row.parts_status);
        setRepairDate(row.repair_date ?? "");
    }

    function startVerify(row: MriFaultRectification) {
        setVerifyingId(row.id);
        setEditingId(null);
        setFunctionTestOk(false);
    }

    function startLimits(row: MriFaultRectification) {
        setLimitsId(row.id);
        setLimitsNote(row.limitations_note ?? "");
        setEditingId(null);
        setVerifyingId(null);
    }

    async function saveLimits(row: MriFaultRectification) {
        if (!user) return;
        try {
            await recordLimits.mutateAsync({ id: row.id, note: limitsNote, informedBy: user.name });
            flash(`Equipment limitations recorded for ${row.asset_code ?? "asset"}`, "ok");
            setLimitsId(null);
        } catch (err) {
            flash(String(err), "err");
        }
    }

    async function savePlan(row: MriFaultRectification) {
        try {
            await update.mutateAsync({
                id: row.id,
                assignedTechnician: assignedTechnician.trim() || null,
                partsStatus,
                repairDate: repairDate.trim() || null,
                updatedBy: user?.name ?? null,
            });
            flash(`Repair plan updated — ${row.checklist_description ?? "item"} on ${row.asset_code ?? "asset"}`, "ok");
            setEditingId(null);
        } catch (err) {
            flash(String(err), "err");
        }
    }

    async function confirmVerify(row: MriFaultRectification) {
        if (!user) return;
        try {
            await verify.mutateAsync({ id: row.id, verifiedBy: user.name, functionTestPassed: functionTestOk });
            flash(`${row.tag_status === "Planned" ? "Verified — follow-up closed for" : "Verified — tag removed for"} ${row.checklist_description ?? "item"} on ${row.asset_code ?? "asset"}`, "ok");
            setVerifyingId(null);
        } catch (err) {
            flash(String(err), "err");
        }
    }

    type Kind = "red" | "yellow" | "planned";
    const kindOf = (r: MriFaultRectification): Kind =>
        r.tag_status === "Planned" ? "planned" : r.assigned_technician ? "yellow" : "red";
    const KIND_META: Record<Kind, { label: string; color: string; order: number }> = {
        red: { label: "Red Tag", color: "var(--st-red)", order: 0 },
        yellow: { label: "Yellow Tag — repair in progress", color: "var(--st-amber)", order: 1 },
        planned: { label: "Moderate — plan & monitor", color: "var(--st-blue)", order: 2 },
    };
    const counts = {
        red: rows.filter((r) => kindOf(r) === "red").length,
        yellow: rows.filter((r) => kindOf(r) === "yellow").length,
        planned: rows.filter((r) => kindOf(r) === "planned").length,
        uninformed: rows.filter((r) => !r.limitations_note).length,
    };
    const visibleRows = rows
        .filter((r) => filter === "all" || (filter === "uninformed" ? !r.limitations_note : kindOf(r) === filter))
        .sort((x, y) => KIND_META[kindOf(x)].order - KIND_META[kindOf(y)].order);

    return (
        <div>
            <style>{`
                .rq-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px}
                .rq-stat{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:14px;padding:12px 16px;border-radius:14px;background:var(--surface, var(--neu-bg));border:1px solid var(--border);border-top:4px solid var(--c)}
                .rq-stat[aria-pressed="true"]{box-shadow:inset 0 0 0 2px var(--c)}
                .rq-stat b{font-size:28px;line-height:1.1;color:var(--c);font-variant-numeric:tabular-nums}
                .rq-stat-t{display:flex;flex-direction:column;gap:1px;min-width:0}
                .rq-stat-t span{font-size:12.5px;color:var(--text-soft)}
                .rq-ico{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;color:var(--c);background:color-mix(in srgb, var(--c) 14%, transparent)}
                .rq-ico svg{width:22px;height:22px}
                .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
                .rq-pills{display:flex;gap:6px;flex:none}
                .rq-pill{display:grid;place-items:center;width:30px;height:24px;border-radius:999px;color:var(--on-status);background:var(--c);cursor:help}
                .rq-pill svg{width:15px;height:15px}
                .rq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,410px),1fr));gap:14px;align-items:stretch}
                .rq-card{display:flex;flex-direction:column;gap:12px;min-width:0;padding:16px;border-left:4px solid var(--c)}
                .rq-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
                .rq-title{font-size:15px;font-weight:600;color:var(--text);min-width:0;overflow-wrap:anywhere}
                .rq-badge{flex:none;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;color:var(--on-status);background:var(--c);white-space:nowrap}
                .rq-tags{display:flex;flex-wrap:wrap;gap:6px}
                .rq-tags span{font-size:12px;color:var(--text-soft);padding:2px 8px;border-radius:999px;border:1px solid var(--border);white-space:nowrap}
                .rq-track{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
                .rq-track div{font-size:11px;color:var(--text-soft);display:flex;flex-direction:column;gap:5px}
                .rq-track i{height:5px;border-radius:3px;background:var(--border)}
                .rq-track div.on i{background:var(--c)}
                .rq-track div.on{color:var(--text);font-weight:600}
                .rq-dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0;padding:10px 0 0;border-top:1px solid var(--border)}
                .rq-dl div{min-width:0}
                .rq-dl dt{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-soft)}
                .rq-dl dd{margin:2px 0 0;font-size:13px;color:var(--text);overflow-wrap:anywhere}
                .rq-dl dd.muted{color:var(--text-soft)}
                .rq-limit{border-radius:10px;padding:10px 12px;font-size:12.5px;display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap}
                .rq-limit > span{flex:1 1 200px;min-width:0}
                .rq-limit textarea{flex-basis:100%}
                .rq-limit .rq-actions{flex-basis:100%}
                .rq-limit.warn{background:color-mix(in srgb, var(--st-amber) 14%, transparent);border:1px solid color-mix(in srgb, var(--st-amber) 45%, transparent)}
                .rq-limit.ok{background:color-mix(in srgb, var(--st-green, #16a34a) 10%, transparent);border:1px solid color-mix(in srgb, var(--st-green, #16a34a) 35%, transparent)}
                .rq-limit .row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
                .rq-form{padding-top:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px}
                .rq-form .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
                .rq-foot{margin-top:auto;padding-top:12px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
                .rq-foot .sp{flex:1}
                .rq-card .rq-sm,.rq-sum ~ p .rq-sm{padding:7px 14px;font-size:12.5px;white-space:nowrap}
                .rq-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
            `}</style>
            <div className="header">
                <h1>Rectification Queue</h1>
                <span className="sub">Critical faults still Red-Tagged, plus Moderate faults planned for follow-up, awaiting repair and verification</span>
            </div>

            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 600, marginBottom: 16 }}>{status.msg}</div>}

            {isLoading ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>Loading...</p>
            ) : rows.length === 0 ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>No faults are currently awaiting rectification.</p>
            ) : (
                <>
                    <div className="rq-sum" role="group" aria-label="Filter the queue">
                        {([
                            ["red", counts.red, "Red tag — not started", "var(--st-red)"],
                            ["yellow", counts.yellow, "Repair in progress", "var(--st-amber)"],
                            ["planned", counts.planned, "Moderate follow-up", "var(--st-blue)"],
                            ["uninformed", counts.uninformed, "Field team not informed", "var(--danger)"],
                        ] as const).map(([key, n, label, c]) => (
                            <button
                                key={key}
                                type="button"
                                className="rq-stat"
                                style={{ ["--c" as string]: c }}
                                aria-pressed={filter === key}
                                onClick={() => setFilter(filter === key ? "all" : key)}
                                title={`${label}${filter === key ? " (click to show all)" : " (click to filter)"}`}
                                aria-label={`${label}: ${n}`}
                            >
                                <span className="rq-ico">{ICONS[key]}</span>
                                <span className="rq-stat-t">
                                    <b>{n}</b>
                                    <span>{label}</span>
                                </span>
                            </button>
                        ))}
                    </div>

                    {visibleRows.length === 0 && (
                        <p style={{ color: "var(--text-soft)", fontSize: 13 }}>
                            Nothing in this filter. <button className="ghost rq-sm" onClick={() => setFilter("all")}>Show all</button>
                        </p>
                    )}

                    <div className="rq-grid">
                    {visibleRows.map((row) => {
                        const isEditing = editingId === row.id;
                        const isVerifying = verifyingId === row.id;
                        const kind = kindOf(row);
                        const meta = KIND_META[kind];
                        const planned = kind === "planned";
                        const stage = row.assigned_technician || row.repair_date ? 2 : 1;
                        return (
                            <div key={row.id} className="panel rq-card" style={{ ["--c" as string]: meta.color }}>
                                <div className="rq-head">
                                    <div className="rq-title">{row.checklist_description ?? "Checklist item"}</div>
                                    <div className="rq-pills">
                                        {!row.limitations_note && (
                                            <span className="rq-pill" style={{ ["--c" as string]: "var(--danger)" }} title="Field team not yet informed of the equipment's limitations" aria-label="Field team not informed" role="img">
                                                {ICONS.uninformed}
                                            </span>
                                        )}
                                        <span className="rq-pill" title={meta.label} aria-label={meta.label} role="img">{ICONS[kind]}</span>
                                    </div>
                                </div>
                                <div className="rq-tags">
                                    <span>{row.asset_code ?? "Unknown asset"}</span>
                                    <span>Report #{row.report_id}</span>
                                    <span>{planned ? "Logged" : "Red-tagged"} {formatDate(row.created_date)}</span>
                                </div>

                                <div className="rq-track" aria-label="Progress">
                                    <div className="on"><i />{planned ? "Logged" : "Tagged"}</div>
                                    <div className={stage >= 2 ? "on" : ""}><i />Repair planned</div>
                                    <div><i />Verified</div>
                                </div>

                                <dl className="rq-dl">
                                    <div><dt>Technician</dt><dd className={row.assigned_technician ? "" : "muted"}>{row.assigned_technician ?? "Unassigned"}</dd></div>
                                    <div><dt>Parts</dt><dd>{row.parts_status}</dd></div>
                                    <div><dt>Repair date</dt><dd className={row.repair_date ? "" : "muted"}>{row.repair_date ? formatDate(row.repair_date) : "Not set"}</dd></div>
                                </dl>

                                <div className={`rq-limit ${row.limitations_note ? "ok" : "warn"}`}>
                                    {row.limitations_note ? (
                                        <span>
                                            <strong>Field team told:</strong> {row.limitations_note}
                                            <span style={{ color: "var(--text-soft)" }}> — {row.limitations_informed_by}, {formatDate(row.limitations_informed_date)}</span>
                                        </span>
                                    ) : (
                                        <span style={{ color: "var(--text)" }}>
                                            <strong>Field team not yet informed</strong> of the equipment's limitations.
                                        </span>
                                    )}
                                    {canRectify && limitsId !== row.id && (
                                        <button className="ghost rq-sm" onClick={() => startLimits(row)}>
                                            {row.limitations_note ? "Update limitations" : "Inform field team"}
                                        </button>
                                    )}
                                    {canRectify && limitsId === row.id && (
                                        <>
                                            <textarea
                                                className="neu-input"
                                                rows={3}
                                                style={{ width: "100%" }}
                                                placeholder="What the equipment must not be used for / operating restrictions until repaired"
                                                value={limitsNote}
                                                onChange={(e) => setLimitsNote(e.target.value)}
                                            />
                                            <div className="rq-actions">
                                                <button className="ghost rq-sm" onClick={() => setLimitsId(null)}>Cancel</button>
                                                <button className="primary rq-sm" onClick={() => saveLimits(row)}>Save</button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {canRectify && isEditing && (
                                    <div className="rq-form">
                                        <div className="two">
                                            <div className="field">
                                                <label>Assigned Technician</label>
                                                <input
                                                    type="text"
                                                    className="trigger-input"
                                                    value={assignedTechnician}
                                                    onChange={(e) => setAssignedTechnician(e.target.value)}
                                                    placeholder="Optional"
                                                />
                                            </div>
                                            <div className="field">
                                                <label>Parts Status</label>
                                                <select
                                                    className="neu-select"
                                                    value={partsStatus}
                                                    onChange={(e) => setPartsStatus(e.target.value as typeof partsStatus)}
                                                >
                                                    {PARTS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="field">
                                            <label>Repair Date</label>
                                            <input
                                                type="date"
                                                className="trigger-input"
                                                value={repairDate}
                                                onChange={(e) => setRepairDate(e.target.value)}
                                            />
                                        </div>
                                        <div className="rq-actions">
                                            <button className="ghost rq-sm" onClick={() => setEditingId(null)}>Cancel</button>
                                            <button className="primary rq-sm" onClick={() => savePlan(row)}>Save</button>
                                        </div>
                                    </div>
                                )}

                                {canRectify && isVerifying && (
                                    <div className="rq-form">
                                        <p style={{ fontSize: 12.5, color: "var(--text-soft)", margin: 0 }}>
                                            {planned
                                                ? "Confirm the Moderate fault has been rectified and checked. This closes the follow-up and cannot be undone from here."
                                                : "Confirm the repair has been inspected and the equipment is safe to return to service. This removes the Red Tag and cannot be undone from here."}
                                        </p>
                                        <p style={{ fontSize: 12.5, margin: 0 }}>
                                            Verified by: <strong>{user?.name ?? "Unknown"}</strong>
                                        </p>
                                        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                                            <input type="checkbox" checked={functionTestOk} onChange={(e) => setFunctionTestOk(e.target.checked)} />
                                            A function test was performed after the repair and the unit passed
                                        </label>
                                        <div className="rq-actions">
                                            <button className="ghost rq-sm" onClick={() => setVerifyingId(null)}>Cancel</button>
                                            <button className="danger rq-sm" disabled={!functionTestOk} onClick={() => confirmVerify(row)}>{planned ? "Confirm — Close" : "Confirm — Remove Tag"}</button>
                                        </div>
                                    </div>
                                )}

                                {!canRectify && (
                                    <p style={{ fontSize: 11.5, color: "var(--text-soft)", margin: 0 }}>
                                        You don't have the required permission to manage rectification.
                                    </p>
                                )}

                                <div className="rq-foot">
                                    {onOpenFlow && (
                                        <button className="ghost rq-sm" onClick={() => onOpenFlow(row.report_id)}>Show flow</button>
                                    )}
                                    <span className="sp" />
                                    {canRectify && !isEditing && !isVerifying && (
                                        <>
                                            <button className="ghost rq-sm" onClick={() => startVerify(row)}>{planned ? "Verify & Close Follow-up" : "Verify & Remove Tag"}</button>
                                            <button className="primary rq-sm" onClick={() => startEdit(row)}>Update Plan</button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    </div>
                </>
            )}
        </div>
    );
}

export default RectificationQueue;