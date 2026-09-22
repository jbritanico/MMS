import { useState, useEffect, useRef, type ReactElement } from "react";
import {
  useAssets, useCreateAsset, useUpdateAsset, useDeleteAsset,
  useExportAssetsBackup, useImportAssetsBackup,
} from "./hooks/useAssets";
import { useAssetTriggers } from "./hooks/useTriggers";
import { emptyAsset, MR_ACTIONS, type Asset } from "./types";
import { useAssetTypes } from "../administration/hooks/useAssetTypes";
import { useMriTemplates } from "../administration/hooks/useMriTemplates";
import { useLookups } from "../administration/hooks/useLookups";
import AssetTypeCombobox from "../administration/AssetTypeCombobox";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";

// Same mapping/icons/colors used on the MR-I "Select Asset" cards.
const TRIGGER_TYPE_LABELS: Record<string, string> = {
  OH: "Operating hours",
  CA: "Calendar days",
  KM: "Distance (KM)",
  RIF: "Running-in-foot",
  EH: "Engine hours",
};

const TRIGGER_TYPE_COLORS: Record<string, string> = {
  OH: "var(--accent-blue)",
  CA: "var(--warn)",
  KM: "var(--success)",
  RIF: "var(--accent)",
  EH: "var(--danger)",
};

const TRIGGER_TYPE_ICONS: Record<string, ReactElement> = {
  OH: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  CA: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 9h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  KM: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  RIF: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="9" width="18" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9v3M11 9v3M15 9v3M19 9v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  EH: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 15a8 8 0 1 1 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 15l4-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" />
    </svg>
  ),
};

const DEFAULT_TRIGGER_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </svg>
);

interface AssetRegistryCardProps {
  asset: Asset;
  assetTypeLabel: string | null;
  canEdit: boolean;
  canDelete: boolean;
  onRowClick: (asset: Asset) => void;
  onEdit: (e: React.MouseEvent, asset: Asset) => void;
  onDelete: (e: React.MouseEvent, asset: Asset) => void;
}

// A separate component (not inline in the map below) because it needs to call
// useAssetTriggers for its own asset -- hooks can't be called conditionally
// inside a .map() in the parent component.
function AssetRegistryCard({ asset: a, assetTypeLabel, canEdit, canDelete, onRowClick, onEdit, onDelete }: AssetRegistryCardProps) {
  const { data: triggers = [] } = useAssetTriggers(a.id);
  const activeTriggers = triggers.filter((t) => t.enabled);

  return (
    <div className="card" onClick={() => onRowClick(a)}>
      <div className="card-main">
        <div className="code">{a.asset_code}</div>
        <div className="desc">{a.asset_description || "—"}</div>
        <div className="meta">
          {a.tag_status && (
            <span
              className="pill"
              style={{
                background: a.tag_status === "Red" ? "var(--danger)" : "var(--success)",
                color: "#fff",
              }}
            >
              {a.tag_status} Tag
            </span>
          )}
          <span className={`pill ${a.active ? "active" : "inactive"}`}>
            {a.active ? "Active" : "Inactive"}
          </span>
          {a.country && <span className="pill neutral">{a.country}</span>}
          {a.vehicle && <span className="pill neutral">Vehicle</span>}
          {assetTypeLabel && <span className="pill neutral">{assetTypeLabel}</span>}
        </div>
        {activeTriggers.length > 0 && (
          <div className="meta">
            {activeTriggers.map((t) => (
              <span
                key={t.id}
                className="trigger-icon-chip"
                title={TRIGGER_TYPE_LABELS[t.trigger_type] ?? t.trigger_type}
              >
                <span
                  style={{
                    color: TRIGGER_TYPE_COLORS[t.trigger_type] ?? "var(--text-soft)",
                    display: "inline-flex",
                  }}
                >
                  {TRIGGER_TYPE_ICONS[t.trigger_type] ?? DEFAULT_TRIGGER_ICON}
                </span>
                <span>{t.running_value}/{t.interval_value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="card-actions">
        <button className="icon-btn" aria-label="Edit" onClick={(e) => onEdit(e, a)} disabled={!canEdit} title={!canEdit ? "Your role doesn't have permission to edit assets" : "Edit"}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
              stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </button>
        <button className="icon-btn icon-danger" aria-label="Delete" onClick={(e) => onDelete(e, a)} disabled={!canDelete} title={!canDelete ? "Your role doesn't have permission to delete assets" : "Delete"}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

type Mode = "create" | "edit" | "view";

interface AssetRegistryProps {
  onViewTriggers: (assetId: number, assetCode: string) => void;
}

function AssetRegistry({ onViewTriggers }: AssetRegistryProps) {
  const { data: assets = [], isLoading } = useAssets();
  const { data: assetTypes = [] } = useAssetTypes();
  const { data: templates = [] } = useMriTemplates();
  const { data: countryOptions = [] } = useLookups("COUNTRY");
  const { data: serviceLineOptions = [] } = useLookups("SERVICE LINE");
  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();
  const exportBackup = useExportAssetsBackup();
  const importBackup = useImportAssetsBackup();
  const importFileRef = useRef<HTMLInputElement>(null);
  const { user: currentUser } = useCurrentUser();
  const currentUserLabel = currentUser?.email ?? currentUser?.name ?? "Unknown user";
  const { data: permissions = [] } = useEffectivePermissions(currentUser?.id ?? 0);
  const canCreate = permissions.includes("assets.create");
  const canEdit = permissions.includes("assets.edit");
  const canDelete = permissions.includes("assets.delete");

  const activeTemplateAssetTypeIds = new Set(
    templates.filter((t) => t.status === "Active").map((t) => t.asset_type_id)
  );
  const eligibleAssetTypes = assetTypes.filter((a) => activeTemplateAssetTypeIds.has(a.id));

  const [form, setForm] = useState<Asset>({ ...emptyAsset, last_action_by: currentUserLabel });
  const [mode, setMode] = useState<Mode>("create");
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Asset | null>(null);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(t);
  }, [status]);

  function updateField(field: keyof Asset, value: string | boolean | number | null) {
    setForm({ ...form, [field]: value });
  }

  function resetForm() {
    setForm({ ...emptyAsset, last_action_by: currentUserLabel });
    setMode("create");
  }

  async function handleSave() {
    if (!form.asset_code.trim()) {
      setStatus({ msg: "Asset code is required", kind: "err" });
      return;
    }
    if (mode === "create" && !canCreate) {
      setStatus({ msg: "You don't have permission to create assets", kind: "err" });
      return;
    }
    if (mode === "edit" && !canEdit) {
      setStatus({ msg: "You don't have permission to edit assets", kind: "err" });
      return;
    }
    try {
      const payload = { ...form, last_action_dt: new Date().toISOString(), last_action_by: currentUserLabel };
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
    if (!canEdit) {
      setStatus({ msg: "You don't have permission to edit assets", kind: "err" });
      return;
    }
    setForm(asset);
    setMode("edit");
  }

  function requestDelete(e: React.MouseEvent, asset: Asset) {
    e.stopPropagation();
    if (!canDelete) {
      setStatus({ msg: "You don't have permission to delete assets", kind: "err" });
      return;
    }
    setPendingDelete(asset);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const result = await importBackup.mutateAsync(text);
        setStatus({ msg: result, kind: "ok" });
      } catch (err) {
        setStatus({ msg: String(err), kind: "err" });
      }
    };
    reader.readAsText(file);
    if (importFileRef.current) importFileRef.current.value = "";
  }

  async function confirmDelete() {
    if (!pendingDelete || pendingDelete.id === null) return;
    if (!canDelete) {
      setStatus({ msg: "You don't have permission to delete assets", kind: "err" });
      setPendingDelete(null);
      return;
    }
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
      mode === "view" ? `Editing ${form.asset_code}` :
        `Editing ${form.asset_code}`;

  return (
    <>
      <div className="header">
        <h1>Asset registry</h1>
        <span className="sub">local · sqlite · tanstack query</span>
      </div>

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
          {mode !== "create" && (
            <div className="field">
              <label>Tag status</label>
              <div>
                {form.tag_status ? (
                  <span
                    className="pill"
                    style={{
                      background: form.tag_status === "Red" ? "var(--danger)" : "var(--success)",
                      color: "#fff",
                    }}
                  >
                    {form.tag_status} Tag
                  </span>
                ) : (
                  <span className="pill neutral">Not tagged</span>
                )}
              </div>
              <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
                Set automatically by the MR-I fault approval/rectification workflow — not editable here.
              </span>
            </div>
          )}
          <div className="field">
            <label>Asset type</label>
            {isView ? (
              <input
                type="text"
                value={assetTypes.find((a) => a.id === form.asset_type_id)?.description ?? "—"}
                disabled
              />
            ) : (
              <AssetTypeCombobox
                assetTypes={eligibleAssetTypes}
                value={form.asset_type_id ? String(form.asset_type_id) : ""}
                onChange={(id) => updateField("asset_type_id", id ? Number(id) : null)}
              />
            )}
          </div>
          <div className="field">
            <label>Country</label>
            <select className="neu-select" value={form.country} onChange={(e) => updateField("country", e.target.value)} disabled={isView}>
              <option value="">— Select —</option>
              {countryOptions.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Service line</label>
            <select className="neu-select" value={form.service_line} onChange={(e) => updateField("service_line", e.target.value)} disabled={isView}>
              <option value="">— Select —</option>
              {serviceLineOptions.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Last action by</label>
            <input type="text" value={form.last_action_by} disabled title="Automatically set — will use your signed-in M365 account once authentication is added" />
          </div>
          <div className="field">
            <label>Last action</label>
            <select className="neu-select" value={form.mr_last_action}
              onChange={(e) => updateField("mr_last_action", e.target.value)} disabled={isView}>
              {MR_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="checks">
            <label className="neu-check">
              <input type="checkbox" className="neu-check-input" checked={form.active} disabled={isView}
                onChange={(e) => updateField("active", e.target.checked)} />
              <span className="neu-check-box">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>Active</span>
            </label>
            <label className="neu-check">
              <input type="checkbox" className="neu-check-input" checked={form.service_asset} disabled={isView}
                onChange={(e) => setForm({ ...form, service_asset: e.target.checked, vehicle: e.target.checked ? false : form.vehicle })} />
              <span className="neu-check-box">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>Service asset</span>
            </label>
            <label className="neu-check">
              <input type="checkbox" className="neu-check-input" checked={form.vehicle} disabled={isView}
                onChange={(e) => setForm({ ...form, vehicle: e.target.checked, service_asset: e.target.checked ? false : form.service_asset })} />
              <span className="neu-check-box">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>Vehicle</span>
            </label>
          </div>

          <div className="actions">
            {mode === "view" ? (
              <>
                <button className="primary" onClick={() => setMode("edit")} disabled={!canEdit} title={!canEdit ? "Your role doesn't have permission to edit assets" : undefined}>Edit</button>
                <button className="ghost" onClick={() => form.id !== null && onViewTriggers(form.id, form.asset_code)}>
                  View triggers
                </button>
                <button className="ghost" onClick={resetForm}>Close</button>
              </>
            ) : (
              <>
                <button className="primary" onClick={handleSave} disabled={mode === "create" && !canCreate}>
                  {mode === "create" ? "Create asset" : "Save changes"}
                </button>
                {mode === "create" && !canCreate && (
                  <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
                    Your role doesn't have permission to create assets.
                  </span>
                )}
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
            <input ref={importFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
            <button className="ghost" onClick={() => exportBackup()} title="Download a full backup of all assets and their triggers">
              ⤓ Export Backup
            </button>
            <button className="ghost" onClick={() => importFileRef.current?.click()} title="Restore assets from a backup file">
              ⤒ Import Backup
            </button>
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
                <AssetRegistryCard
                  key={a.id}
                  asset={a}
                  assetTypeLabel={a.asset_type_id ? assetTypes.find((t) => t.id === a.asset_type_id)?.description ?? "Type" : null}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onRowClick={handleRowClick}
                  onEdit={handleEdit}
                  onDelete={requestDelete}
                />
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