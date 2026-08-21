import { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
    useAssetTypes,
    useCreateAssetType,
    useUpdateAssetType,
    useDeleteAssetType,
    useBulkCreateAssetTypes,
    type AssetType,
} from "./hooks/useAssetTypes";

function AssetTypes() {
    const { data: types = [], isLoading } = useAssetTypes();
    const createType = useCreateAssetType();
    const updateType = useUpdateAssetType();
    const deleteType = useDeleteAssetType();
    const bulkCreate = useBulkCreateAssetTypes();

    const [newDescription, setNewDescription] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDescription, setEditDescription] = useState("");
    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
    const [pendingDelete, setPendingDelete] = useState<AssetType | null>(null);

    const [previewRows, setPreviewRows] = useState<string[] | null>(null);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    function flash(msg: string, kind: "ok" | "err") {
        setStatus({ msg, kind });
        setTimeout(() => setStatus(null), 4000);
    }

    async function handleCreate() {
        if (!newDescription.trim()) return;
        try {
            await createType.mutateAsync(newDescription.trim());
            setNewDescription("");
            flash("Asset type added", "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    function startEdit(t: AssetType) {
        setEditingId(t.id);
        setEditDescription(t.description);
    }

    async function saveEdit(t: AssetType) {
        if (!editDescription.trim()) return;
        try {
            await updateType.mutateAsync({ id: t.id, description: editDescription.trim(), active: t.active });
            setEditingId(null);
            flash("Asset type updated", "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    async function toggleActive(t: AssetType) {
        try {
            await updateType.mutateAsync({ id: t.id, description: t.description, active: !t.active });
            flash(`${t.description} ${!t.active ? "activated" : "deactivated"}`, "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    async function confirmDelete() {
        if (!pendingDelete) return;
        try {
            await deleteType.mutateAsync(pendingDelete.id);
            flash(`"${pendingDelete.description}" deleted`, "ok");
            setPendingDelete(null);
        } catch (err) {
            flash(String(err), "err");
        }
    }

    function normalizeRows(rows: any[]): string[] {
        return rows
            .map((r) => {
                const keys = Object.keys(r);
                const descKey = keys.find((k) => k.trim().toLowerCase() === "description")
                    ?? keys.find((k) => k.trim().toLowerCase() === "asset type")
                    ?? keys[0];
                return String(descKey ? r[descKey] : "").trim();
            })
            .filter((d) => d.length > 0);
    }

    function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const isCsv = file.name.toLowerCase().endsWith(".csv");

        if (isCsv) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (result) => setPreviewRows(normalizeRows(result.data as any[])),
                error: () => flash("Failed to parse CSV file", "err"),
            });
        } else {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: "array" });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet);
                    setPreviewRows(normalizeRows(rows));
                } catch {
                    flash("Failed to parse Excel file", "err");
                }
            };
            reader.readAsArrayBuffer(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    async function confirmImport() {
        if (!previewRows || previewRows.length === 0) return;
        setImporting(true);
        try {
            const result = await bulkCreate.mutateAsync(previewRows);
            flash(result, "ok");
            setPreviewRows(null);
        } catch (err) {
            flash(String(err), "err");
        } finally {
            setImporting(false);
        }
    }

    return (
        <div>
            <h2 style={{ marginBottom: 4 }}>Asset Types</h2>
            <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                Equipment types used to scope MR-I templates and checklist items.
            </p>

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Asset type description</label>
                    <input
                        type="text"
                        value={newDescription}
                        placeholder="e.g. Coiled Tubing Reel"
                        onChange={(e) => setNewDescription(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    />
                </div>
                <button className="primary" onClick={handleCreate}>Add</button>
            </div>

            <div style={{ marginBottom: 18 }}>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleFileSelected} />
                <button className="ghost" onClick={() => fileInputRef.current?.click()}>Upload from CSV / Excel</button>
                <span style={{ fontSize: 12, color: "var(--text-soft)", marginLeft: 10 }}>
                    Column: Description (or Asset Type)
                </span>
            </div>

            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

            {previewRows && (
                <div className="panel" style={{ marginBottom: 18 }}>
                    <h2>Import preview — {previewRows.length} row{previewRows.length !== 1 ? "s" : ""} detected</h2>
                    <div className="cards" style={{ maxHeight: 260, overflowY: "auto" }}>
                        {previewRows.slice(0, 50).map((desc, i) => (
                            <div className="card" key={i} style={{ cursor: "default" }}>
                                <div className="card-main">
                                    <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {previewRows.length > 50 && (
                        <p style={{ fontSize: 12, color: "var(--text-soft)", marginTop: 8 }}>
                            Showing first 50 of {previewRows.length} rows — all will be imported.
                        </p>
                    )}
                    <div className="actions">
                        <button className="primary" onClick={confirmImport} disabled={importing}>
                            {importing ? "Importing..." : `Import ${previewRows.length} items`}
                        </button>
                        <button className="ghost" onClick={() => setPreviewRows(null)}>Cancel</button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="empty">Loading...</div>
            ) : types.length === 0 ? (
                <div className="empty">No asset types yet — add one above to get started</div>
            ) : (
                <div className="cards">
                    {types.map((t) => (
                        <div className="card" key={t.id} style={{ cursor: "default" }}>
                            {editingId === t.id ? (
                                <div className="card-main">
                                    <input
                                        type="text"
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && saveEdit(t)}
                                        autoFocus
                                    />
                                </div>
                            ) : (
                                <div className="card-main">
                                    <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{t.description}</div>
                                    <div className="meta">
                                        <span className={`pill ${t.active ? "active" : "inactive"}`}>
                                            {t.active ? "Active" : "Inactive"}
                                        </span>
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
                                        <button className="icon-btn" aria-label={t.active ? "Deactivate" : "Activate"} onClick={() => toggleActive(t)}>
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                {t.active ? (
                                                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                                ) : (
                                                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                                )}
                                            </svg>
                                        </button>
                                        <button className="icon-btn" aria-label="Edit" onClick={() => startEdit(t)}>
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
                        <h3>Delete asset type?</h3>
                        <p>
                            This will permanently delete <strong>"{pendingDelete.description}"</strong>.
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

export default AssetTypes;