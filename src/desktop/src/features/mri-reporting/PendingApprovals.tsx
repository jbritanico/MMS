import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { invoke } from "../../lib/ipc";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";
import { usePendingMriFaultApprovals, type PendingFaultApprovalRow } from "./hooks/useMriFaultApprovals";

const SEVERITY_COLOR: Record<string, string> = {
    Minor: "#d4ac0d",
    Moderate: "#d97706",
    Critical: "#c0392b",
};

const REVIEW_METHODS = ["In-Person", "Phone"] as const;
const SEVERITIES = ["Minor", "Moderate", "Critical"] as const;

// A Critical fault requires FSM/Maintenance Manager authority (mri.approve).
// A Moderate fault can be reviewed by an Operations Coordinator / Maintenance
// Supervisor (mri.close_defect) or by anyone with the broader mri.approve right.
function canReview(row: PendingFaultApprovalRow, permissions: string[]) {
    if (row.original_severity === "Critical") return permissions.includes("mri.approve");
    if (row.original_severity === "Moderate") {
        return permissions.includes("mri.close_defect") || permissions.includes("mri.approve");
    }
    return false;
}

type DecisionKind = "Approved" | "Reclassified" | "Rejected";

function PendingApprovals() {
    const { user } = useCurrentUser();
    const { data: permissions = [] } = useEffectivePermissions(user?.id ?? 0);
    const { data: rows = [], isLoading } = usePendingMriFaultApprovals();
    const qc = useQueryClient();

    const [reviewingId, setReviewingId] = useState<number | null>(null);
    const [reviewMethod, setReviewMethod] = useState<(typeof REVIEW_METHODS)[number]>("In-Person");
    const [newSeverity, setNewSeverity] = useState<(typeof SEVERITIES)[number]>("Minor");
    const [notes, setNotes] = useState("");
    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

    const decide = useMutation({
        mutationFn: (item: {
            id: number;
            decision: DecisionKind;
            newSeverity: string | null;
            reviewer: string;
            reviewMethod: string;
            notes: string | null;
        }) => invoke<string>("set_mri_fault_approval_decision", item),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-mri-fault-approvals"] }),
    });

    function flash(msg: string, kind: "ok" | "err") {
        setStatus({ msg, kind });
        setTimeout(() => setStatus(null), 5000);
    }

    function startReview(row: PendingFaultApprovalRow) {
        setReviewingId(row.id);
        setReviewMethod("In-Person");
        setNewSeverity(row.original_severity === "Critical" ? "Moderate" : "Minor");
        setNotes("");
    }

    async function submitDecision(row: PendingFaultApprovalRow, decision: DecisionKind) {
        if (!user) return;
        try {
            await decide.mutateAsync({
                id: row.id,
                decision,
                newSeverity: decision === "Reclassified" ? newSeverity : null,
                reviewer: user.name,
                reviewMethod,
                notes: notes.trim() || null,
            });
            flash(`${decision} — ${row.checklist_description ?? "item"} on ${row.asset_code ?? "asset"}`, "ok");
            setReviewingId(null);
        } catch (err) {
            flash(String(err), "err");
        }
    }

    return (
        <div>
            <div className="header">
                <h1>Pending Approvals</h1>
                <span className="sub">Moderate and Critical faults awaiting review or reclassification</span>
            </div>

            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 600, marginBottom: 16 }}>{status.msg}</div>}

            {isLoading ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>Loading...</p>
            ) : rows.length === 0 ? (
                <p style={{ color: "var(--text-soft)", fontSize: 13 }}>No faults are currently pending approval.</p>
            ) : (
                <div className="cards">
                    {rows.map((row) => {
                        const allowed = canReview(row, permissions);
                        const isReviewing = reviewingId === row.id;
                        return (
                            <div key={row.id} className="panel" style={{ padding: 16, cursor: "default" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                                    <div className="card-main">
                                        <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 600 }}>
                                            {row.checklist_description ?? "Checklist item"}
                                        </div>
                                        <div className="desc" style={{ whiteSpace: "normal" }}>
                                            Asset: {row.asset_code ?? "Unknown"} · Reported {row.created_date}
                                        </div>
                                        {row.issue_details && (
                                            <div style={{ fontSize: 12.5, color: "var(--text-soft)", marginTop: 6 }}>
                                                <strong>Issue:</strong> {row.issue_details}
                                            </div>
                                        )}
                                        {row.action_taken && (
                                            <div style={{ fontSize: 12.5, color: "var(--text-soft)", marginTop: 2 }}>
                                                <strong>Action Taken:</strong> {row.action_taken}
                                            </div>
                                        )}
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                                            color: "#fff", background: SEVERITY_COLOR[row.original_severity], whiteSpace: "nowrap",
                                        }}
                                    >
                                        {row.original_severity}
                                    </span>
                                </div>

                                {!allowed && (
                                    <p style={{ fontSize: 11.5, color: "var(--text-soft)", marginTop: 10 }}>
                                        You don't have the required permission to review this item.
                                    </p>
                                )}

                                {allowed && !isReviewing && (
                                    <div className="actions" style={{ marginTop: 12 }}>
                                        <button className="primary" onClick={() => startReview(row)}>Review</button>
                                    </div>
                                )}

                                {allowed && isReviewing && (
                                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                            <div className="field">
                                                <label>Review Method</label>
                                                <select
                                                    className="neu-select"
                                                    value={reviewMethod}
                                                    onChange={(e) => setReviewMethod(e.target.value as typeof reviewMethod)}
                                                >
                                                    {REVIEW_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </div>
                                            <div className="field">
                                                <label>Reclassify To (if applicable)</label>
                                                <select
                                                    className="neu-select"
                                                    value={newSeverity}
                                                    onChange={(e) => setNewSeverity(e.target.value as typeof newSeverity)}
                                                >
                                                    {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="field">
                                            <label>Notes</label>
                                            <input
                                                type="text"
                                                className="trigger-input"
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                placeholder="Optional"
                                            />
                                        </div>
                                        <div className="actions">
                                            <button className="primary" onClick={() => submitDecision(row, "Approved")}>Approve</button>
                                            <button className="ghost" onClick={() => submitDecision(row, "Reclassified")}>Reclassify</button>
                                            <button className="danger" onClick={() => submitDecision(row, "Rejected")}>Reject</button>
                                            <button className="ghost" onClick={() => setReviewingId(null)}>Cancel</button>
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

export default PendingApprovals;