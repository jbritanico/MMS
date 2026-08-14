import { useState } from "react";
import {
    useChecklistSections,
    useCreateChecklistSection,
    useUpdateChecklistSection,
    useDeleteChecklistSection,
    type ChecklistSection,
} from "./hooks/useChecklistSections";

function ChecklistSections() {
    const { data: sections = [], isLoading } = useChecklistSections();
    const createSection = useCreateChecklistSection();
    const updateSection = useUpdateChecklistSection();
    const deleteSection = useDeleteChecklistSection();

    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ChecklistSection | null>(null);

    function flash(msg: string, kind: "ok" | "err") {
        setStatus({ msg, kind });
        setTimeout(() => setStatus(null), 4000);
    }

    async function handleCreate() {
        if (!newName.trim()) return;
        try {
            await createSection.mutateAsync(newName.trim());
            setNewName("");
            flash("Section added", "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    function startEdit(s: ChecklistSection) {
        setEditingId(s.id);
        setEditName(s.name);
    }

    async function saveEdit(s: ChecklistSection) {
        if (!editName.trim()) return;
        try {
            await updateSection.mutateAsync({ id: s.id, name: editName.trim() });
            setEditingId(null);
            flash("Section updated", "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    async function confirmDelete() {
        if (!pendingDelete) return;
        await deleteSection.mutateAsync(pendingDelete.id);
        flash(`"${pendingDelete.name}" deleted`, "ok");
        setPendingDelete(null);
    }

    return (
        <div>
            <h2 style={{ marginBottom: 4 }}>Checklist Sections</h2>
            <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                Grouping categories for checklist items — e.g. "Hydraulic System", "Electrical", "Structural".
            </p>

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 18 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Section name</label>
                    <input
                        type="text"
                        value={newName}
                        placeholder="e.g. Hydraulic System"
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    />
                </div>
                <button className="primary" onClick={handleCreate}>Add</button>
            </div>

            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 340, marginBottom: 12 }}>{status.msg}</div>}

            {isLoading ? (
                <div className="empty">Loading...</div>
            ) : sections.length === 0 ? (
                <div className="empty">No sections yet — add one above to get started</div>
            ) : (
                <div className="cards">
                    {sections.map((s) => (
                        <div className="card" key={s.id} style={{ cursor: "default" }}>
                            {editingId === s.id ? (
                                <div className="card-main">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && saveEdit(s)}
                                        autoFocus
                                    />
                                </div>
                            ) : (
                                <div className="card-main">
                                    <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{s.name}</div>
                                </div>
                            )}

                            <div className="card-actions">
                                {editingId === s.id ? (
                                    <>
                                        <button className="icon-btn" aria-label="Save" onClick={() => saveEdit(s)}>
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
                                        <button className="icon-btn" aria-label="Edit" onClick={() => startEdit(s)}>
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
                                                    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                        <button className="icon-btn icon-danger" aria-label="Delete" onClick={() => setPendingDelete(s)}>
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
                        <h3>Delete section?</h3>
                        <p>
                            This will permanently delete <strong>"{pendingDelete.name}"</strong>.
                            Checklist items already using it will keep their reference, but it can no longer be assigned to new items.
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

export default ChecklistSections;