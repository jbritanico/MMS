import { useState, useEffect } from "react";
import { useAssets, useCreateAsset, useUpdateAsset, useDeleteAsset } from "./hooks/useAssets";
import { emptyAsset, MR_ACTIONS, type Asset } from "./types";

type Mode = "create" | "edit" | "view";

interface AssetRegistryProps {
    onViewTriggers: (assetId: number, assetCode: string) => void;
}

function AssetRegistry({ onViewTriggers }: AssetRegistryProps) {
    const { data: assets = [], isLoading } = useAssets();
    const createAsset = useCreateAsset();
    const updateAsset = useUpdateAsset();
    const deleteAsset = useDeleteAsset();

    const [form, setForm] = useState<Asset>(emptyAsset);
    const [mode, setMode] = useState<Mode>("create");
    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
    const [query, setQuery] = useState("");
    const [pendingDelete, setPendingDelete] = useState<Asset | null>(null);

    useEffect(() => {
        if (!status) return;
        const t = setTimeout(() => setStatus(null), 3000);
        return () => clearTimeout(t);
    }, [status]);

    function updateField(field: keyof Asset, value: string | boolean) {
        setForm({ ...form, [field]: value });
    }

    function resetForm() {
        setForm(emptyAsset);
        setMode("create");
    }

    async function handleSave() {
        if (!form.asset_code.trim()) {
            setStatus({ msg: "Asset code is required", kind: "err" });
            return;
        }
        try {
            const payload = { ...form, last_action_dt: new Date().toISOString() };
            if (mode === "create") {
                await createAsset.mutateAsync(payload);
                setStatus({ msg: `${form.asset_code} created`, kind: "ok" });
            } else {
                await updateAsset.mutateAsync(payload);
                setStatus({ msg: `${form.asset_code} updated`, kind: "ok" });
            }
            resetForm();
        } catch (err) {
            setStatus({ msg: String(err), kind: "err" });
        }
    }

    function handleRowClick(asset: Asset) {
        setForm(asset);
        setMode("view");
    }

    function handleEdit(e: React.MouseEvent, asset: Asset) {
        e.stopPropagation();
        setForm(asset);
        setMode("edit");
    }

    function requestDelete(e: React.MouseEvent, asset: Asset) {
        e.stopPropagation();
        setPendingDelete(asset);
    }

    async function confirmDelete() {
        if (!pendingDelete || pendingDelete.id === null) return;
        await deleteAsset.mutateAsync(pendingDelete.id);
        setStatus({ msg: `${pendingDelete.asset_code} deleted`, kind: "ok" });
        setPendingDelete(null);
        if (form.id === pendingDelete.id) resetForm();
    }

    const filtered = assets.filter((a) =>
        `${a.asset_code} ${a.asset_description} ${a.country}`
            .toLowerCase()
            .includes(query.toLowerCase())
    );

    const isView = mode === "view";
    const codeLocked = mode !== "create";

    const panelTitle =
        mode === "create" ? "New asset" :
            mode === "view" ? `Viewing ${form.asset_code}` :
                `Editing ${form.asset_code}`;

    return (
        <>
            <div className="layout" style={{ containerType: "inline-size" as any }}>
                <div className="panel">
                    <h2>{panelTitle}</h2>

                    <div className="field">
                        <label>Asset code</label>
                        <input type="text" value={form.asset_code}
                            onChange={(e) => updateField("asset_code", e.target.value)}
                            placeholder="e.g. GEN-0142"
                            readOnly={codeLocked}
                            disabled={isView}
                            style={codeLocked && !isView ? { background: "#e9ebed", color: "#6b7280", cursor: "not-allowed" } : undefined} />
                    </div>
                    <div className="field">
                        <label>Description</label>
                        <input type="text" value={form.asset_description}
                            onChange={(e) => updateField("asset_description", e.target.value)}
                            placeholder="e.g. Diesel generator, 60kVA" disabled={isView} />
                    </div>
                    <div className="field">
                        <label>Country</label>
                        <input type="text" value={form.country}
                            onChange={(e) => updateField("country", e.target.value)} disabled={isView} />
                    </div>
                    <div className="field">
                        <label>Service line</label>
                        <input type="text" value={form.service_line}
                            onChange={(e) => updateField("service_line", e.target.value)} disabled={isView} />
                    </div>
                    <div className="field">
                        <label>Last action by</label>
                        <input type="text" value={form.last_action_by}
                            onChange={(e) => updateField("last_action_by", e.target.value)} disabled={isView} />
                    </div>
                    <div className="field">
                        <label>Last action</label>
                        <select value={form.mr_last_action}
                            onChange={(e) => updateField("mr_last_action", e.target.value)} disabled={isView}>
                            {MR_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>

                    <div className="checks">
                        <label className="check">
                            <input type="checkbox" checked={form.active} disabled={isView}
                                onChange={(e) => updateField("active", e.target.checked)} /> Active
                        </label>
                        <label className="check">
                            <input type="checkbox" checked={form.service_asset} disabled={isView}
                                onChange={(e) => setForm({ ...form, service_asset: e.target.checked, vehicle: e.target.checked ? false : form.vehicle })} /> Service asset
                        </label>
                        <label className="check">
                            <input type="checkbox" checked={form.vehicle} disabled={isView}
                                onChange={(e) => setForm({ ...form, vehicle: e.target.checked, service_asset: e.target.checked ? false : form.service_asset })} /> Vehicle
                        </label>
                    </div>

                    <div className="actions">
                        {mode === "view" ? (
                            <>
                                <button className="primary" onClick={() => setMode("edit")}>Edit</button>
                                <button className="ghost" onClick={() => form.id !== null && onViewTriggers(form.id, form.asset_code)}>
                                    View triggers
                                </button>
                                <button className="ghost" onClick={resetForm}>Close</button>
                            </>
                        ) : (
                            <>
                                <button className="primary" onClick={handleSave}>
                                    {mode === "create" ? "Create asset" : "Save changes"}
                                </button>
                                {mode === "edit" && (
                                    <button className="ghost" onClick={resetForm}>Cancel</button>
                                )}
                            </>
                        )}
                    </div>

                    {status && <div className={`toast ${status.kind}`}>{status.msg}</div>}
                </div>

                <div className="panel">
                    <div className="table-toolbar">
                        <input className="search" type="text" placeholder="Search assets..."
                            value={query} onChange={(e) => setQuery(e.target.value)} />
                        <span className="count">{filtered.length} of {assets.length}</span>
                    </div>

                    {isLoading ? (
                        <div className="empty">Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div className="empty">
                            {assets.length === 0 ? "No assets yet — create one to get started" : "No matches for your search"}
                        </div>
                    ) : (
                        <div className="cards">
                            {filtered.map((a) => (
                                <div className="card" key={a.id} onClick={() => handleRowClick(a)}>
                                    <div className="card-main">
                                        <div className="code">{a.asset_code}</div>
                                        <div className="desc">{a.asset_description || "—"}</div>
                                        <div className="meta">
                                            <span className={`pill ${a.active ? "active" : "inactive"}`}>
                                                {a.active ? "Active" : "Inactive"}
                                            </span>
                                            {a.country && <span className="pill neutral">{a.country}</span>}
                                            {a.vehicle && <span className="pill neutral">Vehicle</span>}
                                        </div>
                                    </div>
                                    <div className="card-actions">
                                        <button className="icon-btn" aria-label="Edit" onClick={(e) => handleEdit(e, a)}>
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
                                                    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                        <button className="icon-btn icon-danger" aria-label="Delete" onClick={(e) => requestDelete(e, a)}>
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                                <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {pendingDelete && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18A2 2 0 0 0 3.54 21H20.46A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z"
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3>Delete asset?</h3>
                        <p>
                            This will permanently delete <strong>{pendingDelete.asset_code}</strong>
                            {pendingDelete.asset_description ? ` — ${pendingDelete.asset_description}` : ""}.
                            This can't be undone.
                        </p>
                        <div className="modal-actions">
                            <button className="ghost" onClick={() => setPendingDelete(null)}>Cancel</button>
                            <button className="danger" onClick={confirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default AssetRegistry;