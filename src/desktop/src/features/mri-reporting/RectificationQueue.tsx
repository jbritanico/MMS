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

    return (
        <div>
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
                <div className="cards">
                    {rows.map((row) => {
                        const isEditing = editingId === row.id;
                        const isVerifying = verifyingId === row.id;
                        return (
                            <div key={row.id} className="panel" style={{ padding: 16, cursor: "default" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                                    <div className="card-main">
                                        <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 600 }}>
                                            {row.checklist_description ?? "Checklist item"}
                                        </div>
                                        <div className="desc" style={{ whiteSpace: "normal" }}>
                                            Asset: {row.asset_code ?? "Unknown"} · {row.tag_status === "Planned" ? "Moderate — logged" : "Red-Tagged"} {row.created_date}
                                        </div>
                                        <div style={{ fontSize: 12.5, color: "var(--text-soft)", marginTop: 6 }}>
                                            <strong>Technician:</strong> {row.assigned_technician ?? "Unassigned"} ·{" "}
                                            <strong>Parts:</strong> {row.parts_status}
                                            {row.repair_date && <> · <strong>Repair date:</strong> {row.repair_date}</>}
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                                            color: "var(--on-status)",
                                            background: row.tag_status === "Planned" ? "var(--st-blue)" : row.assigned_technician ? "var(--st-amber)" : "var(--st-red)",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {row.tag_status === "Planned"
                                            ? "Moderate — plan & monitor"
                                            : row.assigned_technician ? "Yellow Tag — repair in progress" : "Red Tag"}
                                    </span>
                                </div>

                                {!canRectify && (
                                    <p style={{ fontSize: 11.5, color: "var(--text-soft)", marginTop: 10 }}>
                                        You don't have the required permission to manage rectification.
                                    </p>
                                )}

                                {onOpenFlow && (
                                    <div style={{ marginTop: 8 }}>
                                        <button className="ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => onOpenFlow(row.report_id)}>Show flow</button>
                                    </div>
                                )}

                                {canRectify && !isEditing && !isVerifying && (
                                    <div className="actions" style={{ marginTop: 12 }}>
                                        <button className="primary" onClick={() => startEdit(row)}>Update Plan</button>
                                        <button className="ghost" onClick={() => startVerify(row)}>{row.tag_status === "Planned" ? "Verify & Close Follow-up" : "Verify & Remove Tag"}</button>
                                    </div>
                                )}

                                {canRectify && isEditing && (
                                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
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
                                        <div className="actions">
                                            <button className="primary" onClick={() => savePlan(row)}>Save</button>
                                            <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginTop: 10, fontSize: 12.5 }}>
                                    {row.limitations_note ? (
                                        <p>
                                            <strong>Equipment limitations told to field team:</strong> {row.limitations_note}
                                            <span style={{ color: "var(--text-soft)" }}> — {row.limitations_informed_by}, {row.limitations_informed_date}</span>
                                        </p>
                                    ) : (
                                        <p style={{ color: "var(--danger)" }}>Field team not yet informed of the equipment's limitations.</p>
                                    )}
                                    {canRectify && limitsId !== row.id && (
                                        <button className="ghost" onClick={() => startLimits(row)}>
                                            {row.limitations_note ? "Update limitations" : "Inform field team of limitations"}
                                        </button>
                                    )}
                                    {canRectify && limitsId === row.id && (
                                        <div style={{ marginTop: 8 }}>
                                            <textarea
                                                className="neu-input"
                                                rows={3}
                                                style={{ width: "100%" }}
                                                placeholder="What the equipment must not be used for / operating restrictions until repaired"
                                                value={limitsNote}
                                                onChange={(e) => setLimitsNote(e.target.value)}
                                            />
                                            <div className="actions">
                                                <button className="primary" onClick={() => saveLimits(row)}>Save</button>
                                                <button className="ghost" onClick={() => setLimitsId(null)}>Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {canRectify && isVerifying && (
                                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                                        <p style={{ fontSize: 12.5, color: "var(--text-soft)" }}>
                                            {row.tag_status === "Planned"
                                                ? "Confirm the Moderate fault has been rectified and checked. This closes the follow-up and cannot be undone from here."
                                                : "Confirm the repair has been inspected and the equipment is safe to return to service. This removes the Red Tag and cannot be undone from here."}
                                        </p>
                                        <p style={{ fontSize: 12.5, marginTop: 6 }}>
                                            Verified by: <strong>{user?.name ?? "Unknown"}</strong>
                                        </p>
                                        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginTop: 6 }}>
                                            <input type="checkbox" checked={functionTestOk} onChange={(e) => setFunctionTestOk(e.target.checked)} />
                                            A function test was performed after the repair and the unit passed
                                        </label>
                                        <div className="actions">
                                            <button className="danger" disabled={!functionTestOk} onClick={() => confirmVerify(row)}>{row.tag_status === "Planned" ? "Confirm — Close" : "Confirm — Remove Tag"}</button>
                                            <button className="ghost" onClick={() => setVerifyingId(null)}>Cancel</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default RectificationQueue;