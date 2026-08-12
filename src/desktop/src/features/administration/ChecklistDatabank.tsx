import { useState, useRef, useMemo } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
    useChecklistItems,
    useCreateChecklistItem,
    useUpdateChecklistItem,
    useDeleteChecklistItem,
    useBulkCreateChecklistItems,
    type ChecklistItem,
    type MrLevel,
} from "./hooks/useChecklistDatabank";

interface ParsedRow {
    code: string;
    description: string;
    level: MrLevel;
}

const LEVELS: MrLevel[] = ["MR-I", "MR-II", "MR-III"];
const PAGE_SIZE = 15;

function ChecklistDatabank() {
    const { data: items = [], isLoading } = useChecklistItems();
    const createItem = useCreateChecklistItem();
    const updateItem = useUpdateChecklistItem();
    const deleteItem = useDeleteChecklistItem();
    const bulkCreate = useBulkCreateChecklistItems();

    const [activeTab, setActiveTab] = useState<MrLevel>("MR-I");
    const [page, setPage] = useState(1);

    const [newCode, setNewCode] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editCode, setEditCode] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editLevel, setEditLevel] = useState<MrLevel>("MR-I");
    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ChecklistItem | null>(null);

    const [previewRows, setPreviewRows] = useState<ParsedRow[] | null>(null);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    function flash(msg: string, kind: "ok" | "err") {
        setStatus({ msg, kind });
        setTimeout(() => setStatus(null), 4000);
    }

    const filteredItems = items.filter((i) => i.level === activeTab);
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
    const pagedItems = useMemo(
        () => filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [filteredItems, page]
    );

    function switchTab(lvl: MrLevel) {
        setActiveTab(lvl);
        setPage(1);
        setEditingId(null);
    }

    async function handleCreate() {
        if (!newCode.trim() || !newDescription.trim()) return;
        try {
            await createItem.mutateAsync({ code: newCode.trim(), description: newDescription.trim(), level: activeTab });
            setNewCode("");
            setNewDescription("");
            setPage(1);
            flash(`Checklist item added to ${activeTab}`, "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    function startEdit(item: ChecklistItem) {
        setEditingId(item.id);
        setEditCode(item.code);
        setEditDescription(item.description);
        setEditLevel(item.level);
    }

    async function saveEdit(item: ChecklistItem) {
        if (!editCode.trim() || !editDescription.trim()) return;
        try {
            await updateItem.mutateAsync({ id: item.id, code: editCode.trim(), description: editDescription.trim(), level: editLevel });
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

    function normalizeLevel(raw: string): MrLevel {
        const v = raw.trim().toUpperCase().replace(/\s+/g, "");
        if (v === "MR-I" || v === "MRI" || v === "I") return "MR-I";
        if (v === "MR-II" || v === "MRII" || v === "II") return "MR-II";
        if (v === "MR-III" || v === "MRIII" || v === "III") return "MR-III";
        return activeTab;
    }

    function normalizeRows(rows: any[]): ParsedRow[] {
        return rows
            .map((r) => {
                const keys = Object.keys(r);
                const codeKey = keys.find((k) => k.trim().toLowerCase() === "code");
                const descKey = keys.find((k) => k.trim().toLowerCase() === "description");
                const levelKey = keys.find((k) => k.trim().toLowerCase() === "level");
                return {
                    code: String(codeKey ? r[codeKey] : "").trim(),
                    description: String(descKey ? r[descKey] : "").trim(),
                    level: normalizeLevel(levelKey ? String(r[levelKey]) : activeTab),
                };
            })
            .filter((r) => r.code && r.description);
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
            setPage(1);
        } catch (err) {
            flash(String(err), "err");
        } finally {
            setImporting(false);
        }
    }

    function pageNumbers(): (number | "...")[] {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        const nums: (number | "...")[] = [1];
        if (page > 3) nums.push("...");
        for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) nums.push(p);
        if (page < totalPages - 2) nums.push("...");
        nums.push(totalPages);
        return nums;
    }

    return (
        <div>
            <h2 style={{ marginBottom: 4 }}>Checklist Databank</h2>
            <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                Master list of reusable checklist items for MR-I, MR-II, and MR-III templates.
            </p>

            <div style={{ display: "flex", gap: 4, marginBottom: 18, padding: 4, background: "rgba(0,0,0,0.04)", borderRadius: 12, width: "fit-content" }}>
                {LEVELS.map((lvl) => (
                    <button
                        key={lvl}
                        onClick={() => switchTab(lvl)}
                        style={{
                            padding: "7px 16px",
                            borderRadius: 9,
                            fontSize: 13,
                            fontWeight: 600,
                            background: activeTab === lvl ? "var(--neu-bg)" : "transparent",
                            color: activeTab === lvl ? "#2f6fed" : "var(--text-soft)",
                            boxShadow: activeTab === lvl
                                ? "inset 2px 2px 4px var(--neu-shadow-dark), inset -2px -2px 4px var(--neu-shadow-light)"
                                : "none",
                        }}
                    >
                        {lvl}
                    </button>
                ))}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12, flexWrap: "wrap" }}>
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
                <button className="primary" onClick={handleCreate}>Add to {activeTab}</button>
            </div>

            <div style={{ marginBottom: 18 }}>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleFileSelected} />
                <button className="ghost" onClick={() => fileInputRef.current?.click()}>Upload from CSV / Excel</button>
                <span style={{ fontSize: 12, color: "var(--text-soft)", marginLeft: 10 }}>
                    Columns: Code, Description, Level (optional — defaults to {activeTab} if omitted)
                </span>
            </div>

            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

            {previewRows && (
                <div className="panel" style={{ marginBottom: 18 }}>
                    <h2>Import preview — {previewRows.length} row{previewRows.length !== 1 ? "s" : ""} detected</h2>
                    <div className="cards" style={{ maxHeight: 260, overflowY: "auto" }}>
                        {previewRows.slice(0, 50).map((row, i) => (
                            <div className="card" key={i} style={{ cursor: "default" }}>
                                <div className="card-main">
                                    <div className="code">{row.code}</div>
                                    <div className="desc">{row.description}</div>
                                    <div className="meta"><span className="pill neutral">{row.level}</span></div>
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
            ) : filteredItems.length === 0 ? (
                <div className="empty">No {activeTab} checklist items yet — add one above to get started</div>
            ) : (
                <>
                    <div className="grid-table">
                        <div className="grid-row grid-head">
                            <span>Code</span>
                            <span>Description</span>
                            <span>Level</span>
                            <span></span>
                        </div>
                        {pagedItems.map((item) => (
                            <div className="grid-row" key={item.id}>
                                {editingId === item.id ? (
                                    <>
                                        <input type="text" className="trigger-input" value={editCode}
                                            onChange={(e) => setEditCode(e.target.value)} />
                                        <input type="text" className="trigger-input" value={editDescription}
                                            onChange={(e) => setEditDescription(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && saveEdit(item)} />
                                        <select className="trigger-input" value={editLevel}
                                            onChange={(e) => setEditLevel(e.target.value as MrLevel)}>
                                            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                    </>
                                ) : (
                                    <>
                                        <span className="code">{item.code}</span>
                                        <span className="desc" style={{ whiteSpace: "normal" }}>{item.description}</span>
                                        <span><span className="pill neutral">{item.level}</span></span>
                                    </>
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

                    <div className="pagination-bar">
                        <span className="pagination-info">
                            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
                        </span>
                        <div className="pagination-controls">
                            <button className="page-btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            {pageNumbers().map((p, i) =>
                                p === "..." ? (
                                    <span key={`dots-${i}`} className="page-dots">…</span>
                                ) : (
                                    <button key={p} className={`page-btn page-num ${p === page ? "active" : ""}`} onClick={() => setPage(p)}>
                                        {p}
                                    </button>
                                )
                            )}
                            <button className="page-btn" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </>
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