import { useState } from "react";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";
import {
    usePendingMriFaultRectifications,
    useUpdateMriFaultRectification,
    useVerifyMriFaultRectification,
    type MriFaultRectification,
} from "./hooks/useMriFaultRectifications";

const PARTS_STATUSES = ["Awaiting", "Ordered", "Available"] as const;

function RectificationQueue() {
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
    }

    async function savePlan(row: MriFaultRectification) {
        try {
            await update.mutateAsync({
                id: row.id,
                assignedTechnician: assignedTechnician.trim() || null,
                partsStatus,
                repairDate: repairDate.trim() || null,
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
            await verify.mutateAsync({ id: row.id, verifiedBy: user.name });
            flash(`Verified — tag removed for ${row.checklist_description ?? "item"} on ${row.asset_code ?? "asset"}`, "ok");
            setVerifyingId(null);
        } catch (err) {
            flash(String(err), "err");
        }
    }

    return (
        <div>
            <div className="header">
                <h1>Rectification Queue</h1>
                <span className="sub">Critical faults still Red-Tagged, awaiting repair and verification</span>
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
                                            Asset: {row.asset_code ?? "Unknown"} · Red-Tagged {row.created_date}
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
                                            color: "#fff", background: "#c0392b", whiteSpace: "nowrap",
                                        }}
                                    >
                                        Red Tag
                                    </span>
                                </div>

                                {!canRectify && (
                                    <p style={{ fontSize: 11.5, color: "var(--text-soft)", marginTop: 10 }}>
                                        You don't have the required permission to manage rectification.
                                    </p>
                                )}

                                {canRectify && !isEditing && !isVerifying && (
                                    <div className="actions" style={{ marginTop: 12 }}>
                                        <button className="primary" onClick={() => startEdit(row)}>Update Plan</button>
                                        <button className="ghost" onClick={() => startVerify(row)}>Verify &amp; Remove Tag</button>
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

                                {canRectify && isVerifying && (
                                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                                        <p style={{ fontSize: 12.5, color: "var(--text-soft)" }}>
                                            Confirm the repair has been inspected and the equipment is safe to return to
                                            service. This removes the Red Tag and cannot be undone from here.
                                        </p>
                                        <p style={{ fontSize: 12.5, marginTop: 6 }}>
                                            Verified by: <strong>{user?.name ?? "Unknown"}</strong>
                                        </p>
                                        <div className="actions">
                                            <button className="danger" onClick={() => confirmVerify(row)}>Confirm — Remove Tag</button>
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