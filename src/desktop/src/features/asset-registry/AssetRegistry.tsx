import { useState, useEffect } from "react";
import { useAssets, useCreateAsset, useUpdateAsset, useDeleteAsset } from "./hooks/useAssets";
import { emptyAsset, MR_ACTIONS, type Asset } from "./types";

function AssetRegistry() {
    const { data: assets = [], isLoading } = useAssets();
    const createAsset = useCreateAsset();
    const updateAsset = useUpdateAsset();
    const deleteAsset = useDeleteAsset();

    const [form, setForm] = useState<Asset>(emptyAsset);
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

    async function handleSave() {
        if (!form.asset_code.trim()) {
            setStatus({ msg: "Asset code is required", kind: "err" });
            return;
        }
        try {
            const payload = { ...form, last_action_dt: new Date().toISOString() };
            if (form.id === null) {
                await createAsset.mutateAsync(payload);
                setStatus({ msg: `${form.asset_code} created`, kind: "ok" });
            } else {
                await updateAsset.mutateAsync(payload);
                setStatus({ msg: `${form.asset_code} updated`, kind: "ok" });
            }
            setForm(emptyAsset);
        } catch (err) {
            setStatus({ msg: String(err), kind: "err" });
        }
    }

    function handleEdit(asset: Asset) {
        setForm(asset);
    }

    function requestDelete(asset: Asset) {
        setPendingDelete(asset);
    }

    async function confirmDelete() {
        if (!pendingDelete || pendingDelete.id === null) return;
        await deleteAsset.mutateAsync(pendingDelete.id);
        setStatus({ msg: `${pendingDelete.asset_code} deleted`, kind: "ok" });
        setPendingDelete(null);
    }

    const filtered = assets.filter((a) =>
        `${a.asset_code} ${a.asset_description} ${a.country}`
            .toLowerCase()
            .includes(query.toLowerCase())
    );

    return (
        <>
            <div className="header">
                <h1>Asset registry</h1>
                <span className="sub">local · sqlite · tanstack query</span>
            </div>

            <div className="layout" style={{ containerType: "inline-size" as any }}>
                <div className="panel">
                    <h2>{form.id === null ? "New asset" : `Editing ${form.asset_code}`}</h2>

                    <div className="field">
                        <label>Asset code</label>
                        <input type="text" value={form.asset_code}
                            onChange={(e) => updateField("asset_code", e.target.value)}
                            placeholder="e.g. GEN-0142"
                            readOnly={form.id !== null}
                            style={form.id !== null ? { background: "#e9ebed", color: "#6b7280", cursor: "not-allowed" } : undefined} />
                    </div>
                    <div className="field">
                        <label>Description</label>
                        <input type="text" value={form.asset_description}
                            onChange={(e) => updateField("asset_description", e.target.value)}
                            placeholder="e.g. Diesel generator, 60kVA" />
                    </div>
                    <div className="field">
                        <label>Country</label>
                        <input type="text" value={form.country}
                            onChange={(e) => updateField("country", e.target.value)} />
                    </div>
                    <div className="field">
                        <label>Service line</label>
                        <input type="text" value={form.service_line}
                            onChange={(e) => updateField("service_line", e.target.value)} />
                    </div>
                    <div className="field">
                        <label>Last action by</label>
                        <input type="text" value={form.last_action_by}
                            onChange={(e) => updateField("last_action_by", e.target.value)} />
                    </div>
                    <div className="field">
                        <label>Last action</label>
                        <select value={form.mr_last_action}
                            onChange={(e) => updateField("mr_last_action", e.target.value)}>
                            {MR_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>

                    <div className="checks">
                        <label className="check">
                            <input type="checkbox" checked={form.active}
                                onChange={(e) => updateField("active", e.target.checked)} /> Active
                        </label>
                        <label className="check">
                            <input type="checkbox" checked={form.service_asset}
                                onChange={(e) => setForm({ ...form, service_asset: e.target.checked, vehicle: e.target.checked ? false : form.vehicle })} /> Service asset
                        </label>
                        <label className="check">
                            <input type="checkbox" checked={form.vehicle}
                                onChange={(e) => setForm({ ...form, vehicle: e.target.checked, service_asset: e.target.checked ? false : form.service_asset })} /> Vehicle
                        </label>
                    </div>

                    <div className="actions">
                        <button className="primary" onClick={handleSave}>
                            {form.id === null ? "Create asset" : "Save changes"}
                        </button>
                        {form.id !== null && (
                            <button className="ghost" onClick={() => setForm(emptyAsset)}>Cancel</button>
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
                                <div className="card" key={a.id}>
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
                                        <button className="ghost" onClick={() => handleEdit(a)}>Edit</button>
                                        <button className="ghost" onClick={() => requestDelete(a)}>Delete</button>
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