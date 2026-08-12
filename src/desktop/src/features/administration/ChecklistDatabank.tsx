import { useState } from "react";
import {
    useChecklistItems,
    useCreateChecklistItem,
    useUpdateChecklistItem,
    useDeleteChecklistItem,
    type ChecklistItem,
} from "./hooks/useChecklistDatabank";

function ChecklistDatabank() {
    const { data: items = [], isLoading } = useChecklistItems();
    const createItem = useCreateChecklistItem();
    const updateItem = useUpdateChecklistItem();
    const deleteItem = useDeleteChecklistItem();

    const [newCode, setNewCode] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editCode, setEditCode] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ChecklistItem | null>(null);

    function flash(msg: string, kind: "ok" | "err") {
        setStatus({ msg, kind });
        setTimeout(() => setStatus(null), 3000);
    }

    async function handleCreate() {
        if (!newCode.trim() || !newDescription.trim()) return;
        try {
            await createItem.mutateAsync({ code: newCode.trim(), description: newDescription.trim() });
            setNewCode("");
            setNewDescription("");
            flash("Checklist item added", "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    function startEdit(item: ChecklistItem) {
        setEditingId(item.id);
        setEditCode(item.code);
        setEditDescription(item.description);
    }

    async function saveEdit(item: ChecklistItem) {
        if (!editCode.trim() || !editDescription.trim()) return;
        try {
            await updateItem.mutateAsync({ id: item.id, code: editCode.trim(), description: editDescription.trim() });
            setEditingId(null);
            flash("Checklist item updated", "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    async function confirmDelete() {
        if (!pendingDelete) return;
        await deleteItem.mutateAsync(pendingDelete.id);
        flash(`"${pendingDelete.code}" deleted`, "ok");
        setPendingDelete(null);
    }

    return (
        <div>
            <h2 style={{ marginBottom: 4 }}>Checklist Databank</h2>
            <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 18 }}>
                Master list of reusable checklist items for MR-I, MR-II, and MR-III templates.
            </p>

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap" }}>
                <div className="field" style={{ width: 140, marginBottom: 0 }}>
                    <label>Code</label>
                    <input type="text" value={newCode} placeholder="e.g. CL-001"
                        onChange={(e) => setNewCode(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                    <label>Description</label>
                    <input type="text" value={newDescription} placeholder="e.g. Check hydraulic hose for leaks"
                        onChange={(e) => setNewDescription(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
                </div>
                <button className="primary" onClick={handleCreate}>Add</button>
            </div>

            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 340, marginBottom: 12 }}>{status.msg}</div>}

            {isLoading ? (
                <div className="empty">Loading...</div>
            ) : items.length === 0 ? (
                <div className="empty">No checklist items yet — add one above to get started</div>
            ) : (
                <div className="cards">
                    {items.map((item) => (
                        <div className="card" key={item.id} style={{ cursor: "default" }}>
                            {editingId === item.id ? (
                                <div className="card-main" style={{ display: "flex", gap: 8 }}>
                                    <input type="text" value={editCode} style={{ width: 120 }}
                                        onChange={(e) => setEditCode(e.target.value)} />
                                    <input type="text" value={editDescription} style={{ flex: 1 }}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && saveEdit(item)}
                                        autoFocus />
                                </div>
                            ) : (
                                <div className="card-main">
                                    <div className="code">{item.code}</div>
                                    <div className="desc">{item.description}</div>
                                </div>
                            )}

                            <div className="card-actions">
                                {editingId === item.id ? (
                                    <>
                                        <button className="icon-btn" aria-label="Save" onClick={() => saveEdit(item)}>
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                        <button className="icon-btn" aria-label="Cancel" onClick={() => setEditingId(null)}>
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button className="icon-btn" aria-label="Edit" onClick={() => startEdit(item)}>
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
                                                    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                        <button className="icon-btn icon-danger" aria-label="Delete" onClick={() => setPendingDelete(item)}>
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                                <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {pendingDelete && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18A2 2 0 0 0 3.54 21H20.46A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z"
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3>Delete checklist item?</h3>
                        <p>
                            This will permanently delete <strong>"{pendingDelete.code}"</strong> from the databank.
                            Templates already using it will keep their reference, but it can no longer be selected for new templates.
                        </p>
                        <div className="modal-actions">
                            <button className="ghost" onClick={() => setPendingDelete(null)}>Cancel</button>
                            <button className="danger" onClick={confirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ChecklistDatabank;