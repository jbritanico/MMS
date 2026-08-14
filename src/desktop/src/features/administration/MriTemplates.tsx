import { useState } from "react";
import {
    useMriTemplates,
    useCreateMriTemplate,
    useUpdateTemplateStatus,
    useRenameMriTemplate,
    useDeleteMriTemplate,
    type MriTemplate,
    type TemplateStatus,
} from "./hooks/useMriTemplates";
import { useAssetTypes } from "./hooks/useAssetTypes";

const STATUS_ORDER: TemplateStatus[] = ["Draft", "Active", "Inactive"];

function MriTemplates() {
    const { data: templates = [], isLoading } = useMriTemplates();
    const { data: assetTypes = [] } = useAssetTypes();
    const createTemplate = useCreateMriTemplate();
    const updateStatus = useUpdateTemplateStatus();
    const renameTemplate = useRenameMriTemplate();
    const deleteTemplate = useDeleteMriTemplate();

    const [newName, setNewName] = useState("");
    const [newAssetTypeId, setNewAssetTypeId] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
    const [pendingDelete, setPendingDelete] = useState<MriTemplate | null>(null);

    const assetTypeName = (id: number) => assetTypes.find((a) => a.id === id)?.description ?? "—";

    function flash(msg: string, kind: "ok" | "err") {
        setStatus({ msg, kind });
        setTimeout(() => setStatus(null), 4000);
    }

    async function handleCreate() {
        if (!newName.trim() || !newAssetTypeId) {
            flash("Template name and asset type are required", "err");
            return;
        }
        try {
            await createTemplate.mutateAsync({ template_name: newName.trim(), asset_type_id: Number(newAssetTypeId) });
            setNewName("");
            setNewAssetTypeId("");
            flash("Template created as Draft", "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    function startEdit(t: MriTemplate) {
        setEditingId(t.id);
        setEditName(t.template_name);
    }

    async function saveEdit(t: MriTemplate) {
        if (!editName.trim()) return;
        try {
            await renameTemplate.mutateAsync({ id: t.id, template_name: editName.trim() });
            setEditingId(null);
            flash("Template renamed", "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    async function cycleStatus(t: MriTemplate) {
        const currentIndex = STATUS_ORDER.indexOf(t.status);
        const next = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length];
        try {
            await updateStatus.mutateAsync({ id: t.id, status: next });
            flash(`${t.template_name} set to ${next}`, "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    async function confirmDelete() {
        if (!pendingDelete) return;
        await deleteTemplate.mutateAsync(pendingDelete.id);
        flash(`"${pendingDelete.template_name}" deleted`, "ok");
        setPendingDelete(null);
    }

    function statusPillClass(s: TemplateStatus) {
        if (s === "Active") return "active";
        if (s === "Inactive") return "inactive";
        return "neutral";
    }

    return (
        <div>
            <h2 style={{ marginBottom: 4 }}>MR-I Templates</h2>
            <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                Each template is built for one asset type and configures which header fields, checklist items, mid fields, and footer fields appear on that type's MR-I report.
            </p>

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap" }}>
                <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                    <label>Template name</label>
                    <input
                        type="text"
                        value={newName}
                        placeholder="e.g. Coiled Tubing Reel — MR-I"
                        onChange={(e) => setNewName(e.target.value)}
                    />
                </div>
                <div className="field" style={{ width: 220, marginBottom: 0 }}>
                    <label>Asset type</label>
                    <select value={newAssetTypeId} onChange={(e) => setNewAssetTypeId(e.target.value)}>
                        <option value="">— Select —</option>
                        {assetTypes.filter((a) => a.active).map((a) => (
                            <option key={a.id} value={a.id}>{a.description}</option>
                        ))}
                    </select>
                </div>
                <button className="primary" onClick={handleCreate}>Create template</button>
            </div>

            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 360, marginBottom: 12 }}>{status.msg}</div>}

            {assetTypes.length === 0 && (
                <div className="empty" style={{ marginBottom: 12 }}>
                    No asset types exist yet — add one under References → Asset Types before creating a template.
                </div>
            )}

            {isLoading ? (
                <div className="empty">Loading...</div>
            ) : templates.length === 0 ? (
                <div className="empty">No MR-I templates yet — create one above to get started</div>
            ) : (
                <div className="cards">
                    {templates.map((t) => (
                        <div className="card" key={t.id} style={{ cursor: "default" }}>
                            {editingId === t.id ? (
                                <div className="card-main">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && saveEdit(t)}
                                        autoFocus
                                    />
                                </div>
                            ) : (
                                <div className="card-main">
                                    <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{t.template_name}</div>
                                    <div className="desc">{assetTypeName(t.asset_type_id)}</div>
                                    <div className="meta">
                                        <span className={`pill ${statusPillClass(t.status)}`}>{t.status}</span>
                                    </div>
                                </div>
                            )}

                            <div className="card-actions">
                                {editingId === t.id ? (
                                    <>
                                        <button className="icon-btn" aria-label="Save" onClick={() => saveEdit(t)}>
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
                                        <button className="icon-btn" aria-label="Cycle status" onClick={() => cycleStatus(t)} title="Click to cycle Draft → Active → Inactive">
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                                <path d="M18 4v4h-4M6 20v-4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                        <button className="icon-btn" aria-label="Rename" onClick={() => startEdit(t)}>
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
                                                    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                        <button className="icon-btn icon-danger" aria-label="Delete" onClick={() => setPendingDelete(t)}>
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
                        <h3>Delete template?</h3>
                        <p>
                            This will permanently delete <strong>"{pendingDelete.template_name}"</strong> and any header/checklist/mid/footer configuration attached to it.
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

export default MriTemplates;