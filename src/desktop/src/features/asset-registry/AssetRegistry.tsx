import { useState, useEffect, useRef } from "react";
import {
  useAssetsForViewer, useCreateAsset, useUpdateAsset, useDeleteAsset, useAssetTagHistory,
  useMocExemptions, useCreateMocExemption, useRevokeMocExemption,
  useExportAssetsBackup, useImportAssetsBackup,
} from "./hooks/useAssets";
import { useAssetTriggers } from "./hooks/useTriggers";
import { emptyAsset, MR_ACTIONS, type Asset } from "./types";
import { useAssetTypes } from "../administration/hooks/useAssetTypes";
import { useMriTemplates } from "../administration/hooks/useMriTemplates";
import { useLookups } from "../administration/hooks/useLookups";
import AssetTypeCombobox from "../administration/AssetTypeCombobox";
import { TagLamp } from "../../components/Instruments";
import { DEFAULT_TRIGGER_ICON, TRIGGER_TYPE_COLORS, TRIGGER_TYPE_ICONS } from "../../components/triggerIcons";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions, useUserCountryAccess } from "../administration/hooks/useUserAdmin";

// Same mapping/icons/colors used on the MR-I "Select Asset" cards.
const TRIGGER_TYPE_LABELS: Record<string, string> = {
  OH: "Operating hours",
  CA: "Calendar days",
  KM: "Distance (KM)",
  RIF: "Running-in-foot",
  EH: "Engine hours",
};




interface AssetRegistryCardProps {
  asset: Asset;
  assetTypeLabel: string | null;
  assetTypeIcon: string | null;
  canEdit: boolean;
  canDelete: boolean;
  onRowClick: (asset: Asset) => void;
  onEdit: (e: React.MouseEvent, asset: Asset) => void;
  onDelete: (e: React.MouseEvent, asset: Asset) => void;
  onShowFlow?: (assetId: number) => void;
}

// A separate component (not inline in the map below) because it needs to call
// useAssetTriggers for its own asset -- hooks can't be called conditionally
// inside a .map() in the parent component.
// Tag-history time: stored as Unix seconds; same DD/Mon/YYYY format as Pending Approvals.
function formatChangedAt(raw: string): string {
  const n = Number(raw);
  if (!raw.trim() || isNaN(n)) return raw;
  const d = new Date(n < 1e12 ? n * 1000 : n);
  if (isNaN(d.getTime())) return raw;
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getDate()).padStart(2, "0")}/${m[d.getMonth()]}/${d.getFullYear()}`;
}

// Shows why the unit carries its current tag and the full tag history (Manual 8.1, 8.2).
function AssetTagHistory({ assetId, reason }: { assetId: number | null; reason: string | null }) {
  const { data: history = [] } = useAssetTagHistory(assetId);
  return (
    <div style={{ fontSize: 12, marginTop: 6 }}>
      {reason && (
        <div>
          <strong>Reason:</strong> {reason}
        </div>
      )}
      {history.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ cursor: "pointer" }}>Tag history ({history.length})</summary>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {history.map((h) => (
              <li key={h.id}>
                {formatChangedAt(h.changed_at)}: {h.previous_tag_status ?? "Not tagged"} → <strong>{h.tag_status}</strong>
                {h.reason ? ` — ${h.reason}` : ""}
                {h.changed_by ? ` (by ${h.changed_by})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Red-tag exemption through MOC (Manual 6.1.5). A Red-tagged unit shall not be deployed
// without an approved exemption defining limitations, controls, validity and the
// conditions for return to service.
function AssetMocExemptions({
  assetId, tagStatus, canManage, userLabel,
}: { assetId: number | null; tagStatus: string | null; canManage: boolean; userLabel: string }) {
  const { data: exemptions = [] } = useMocExemptions(assetId);
  const createExemption = useCreateMocExemption();
  const revokeExemption = useRevokeMocExemption();
  const today = new Date().toISOString().slice(0, 10);
  const blank = {
    moc_reference: "", approved_by: "", limitations: "", required_controls: "",
    return_conditions: "", valid_from: today, valid_until: today,
  };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  if (assetId == null) return null;
  const notReady = tagStatus === "Red" || tagStatus === "Yellow";
  if (!notReady && exemptions.length === 0) return null;

  const valid = exemptions.find((x) => x.is_valid);

  async function save() {
    setError(null);
    try {
      await createExemption.mutateAsync({ exemption: { asset_id: assetId as number, ...f }, createdBy: userLabel });
      setF(blank);
      setOpen(false);
    } catch (e) {
      setError(String(e));
    }
  }

  async function revoke(id: number) {
    const reason = window.prompt("Reason for revoking this exemption?");
    if (!reason) return;
    try {
      await revokeExemption.mutateAsync({ id, revokedBy: userLabel, reason });
    } catch (e) {
      setError(String(e));
    }
  }

  const setField = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="field">
      <label>Red-tag exemption (MOC)</label>
      <div>
        {valid ? (
          <span className="pill" style={{ background: "var(--success)", color: "var(--on-status)" }}>
            Exemption valid until {valid.valid_until}
          </span>
        ) : (
          <span className="pill" style={{ background: "var(--danger)", color: "var(--on-status)" }}>
            No valid exemption
          </span>
        )}
      </div>
      <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
        A Red-tagged unit shall not be deployed without an approved MOC exemption (Manual 6.1.5).
      </span>
      {exemptions.length > 0 && (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
          {exemptions.map((x) => (
            <li key={x.id} style={{ marginBottom: 4 }}>
              <strong>{x.moc_reference}</strong> — {x.status}
              {x.is_valid ? " (valid)" : ""}, {x.valid_from} to {x.valid_until}, approved by {x.approved_by}
              <div>Limitations: {x.limitations}</div>
              <div>Controls: {x.required_controls}</div>
              <div>Return to service: {x.return_conditions}</div>
              {x.status === "Revoked" && (
                <div>Revoked by {x.revoked_by ?? "unknown"}: {x.revoke_reason}</div>
              )}
              {canManage && x.status === "Active" && (
                <button type="button" onClick={() => revoke(x.id)}>Revoke</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && notReady && !open && (
        <button type="button" style={{ marginTop: 6 }} onClick={() => setOpen(true)}>Record exemption</button>
      )}
      {open && (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          <input type="text" placeholder="MOC reference" value={f.moc_reference} onChange={setField("moc_reference")} />
          <input type="text" placeholder="Approved by" value={f.approved_by} onChange={setField("approved_by")} />
          <textarea placeholder="Equipment limitations" value={f.limitations} onChange={setField("limitations")} />
          <textarea placeholder="Required controls" value={f.required_controls} onChange={setField("required_controls")} />
          <textarea placeholder="Conditions for return to service" value={f.return_conditions} onChange={setField("return_conditions")} />
          <label style={{ fontSize: 12 }}>Valid from <input type="date" value={f.valid_from} onChange={setField("valid_from")} /></label>
          <label style={{ fontSize: 12 }}>Valid until <input type="date" value={f.valid_until} onChange={setField("valid_until")} /></label>
          <div>
            <button type="button" className="primary" onClick={save}>Save exemption</button>
            <button type="button" onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}
      {error && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

// One row of the list view: the same facts and actions as a card, in a compact table row.
function AssetRegistryRow({ asset: a, assetTypeLabel, canEdit, canDelete, onRowClick, onEdit, onDelete, onShowFlow }: AssetRegistryCardProps) {
  const { data: triggers = [] } = useAssetTriggers(a.id);
  const activeTriggers = triggers.filter((t) => t.enabled);
  return (
    <tr className="asset-row" onClick={() => onRowClick(a)}>
      <td>{a.tag_status ? <TagLamp status={a.tag_status} size={16} title={a.tag_reason ?? undefined} /> : <span className="asset-row-soft">—</span>}</td>
      <td><div className="review-card-code">{a.asset_code}</div><div className="asset-row-soft">{a.asset_description || "—"}</div></td>
      <td>{assetTypeLabel ?? <span className="asset-row-soft">No type</span>}</td>
      <td>{a.country || <span className="asset-row-soft">—</span>}</td>
      <td>{a.service_line || <span className="asset-row-soft">—</span>}</td>
      <td>
        <div className="asset-row-trig">
          {activeTriggers.length === 0 ? <span className="asset-row-soft">—</span> : activeTriggers.map((t) => (
            <span key={t.id} className="trigger-icon-chip" title={TRIGGER_TYPE_LABELS[t.trigger_type] ?? t.trigger_type}>
              <span style={{ color: TRIGGER_TYPE_COLORS[t.trigger_type] ?? "var(--text-soft)", display: "inline-flex" }}>
                {TRIGGER_TYPE_ICONS[t.trigger_type] ?? DEFAULT_TRIGGER_ICON}
              </span>
              <span>{t.running_value}/{t.interval_value}</span>
            </span>
          ))}
        </div>
      </td>
      <td><span className={`pill ${a.active ? "active" : "inactive"}`}>{a.active ? "Active" : "Inactive"}</span></td>
      <td>
        <div className="asset-row-actions">
          {onShowFlow && a.id !== null && (
            <button className="icon-btn" aria-label="Show flow" title="Show history flow" onClick={(e) => { e.stopPropagation(); onShowFlow(a.id as number); }}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
                <rect x="15" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
                <rect x="9" y="15" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
                <path d="M9 6.5h6M6 9v3a2 2 0 0 0 2 2h1M18 9v3a2 2 0 0 1-2 2h-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button className="icon-btn" aria-label="Edit" onClick={(e) => onEdit(e, a)} disabled={!canEdit} title={!canEdit ? "Your role doesn't have permission to edit assets" : "Edit"}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </button>
          <button className="icon-btn icon-danger" aria-label="Delete" onClick={(e) => onDelete(e, a)} disabled={!canDelete} title={!canDelete ? "Your role doesn't have permission to delete assets" : "Delete"}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

const VIEW_KEY = "mms.assets.view";
type RegistryView = "cards" | "list";
const readView = (): RegistryView => {
  try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards"; } catch { return "cards"; }
};

const REGISTRY_CSS = `
.asset-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; margin: -4px 0 14px; }
.asset-filters label { display: inline-flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 600; color: var(--text-soft); text-transform: uppercase; letter-spacing: .04em; }
.asset-filters select { min-width: 150px; max-width: 220px; }
.asset-view-toggle { display: inline-flex; gap: 2px; padding: var(--seg-track-pad, 3px); border-radius: var(--seg-track-radius, 10px); background: var(--tab-track, rgba(0,0,0,0.05)); }
.asset-view-toggle button { display: inline-flex; align-items: center; gap: 6px; padding: var(--seg-pad, 6px 12px) !important; min-height: 0 !important; font-size: var(--seg-font, 12.5px) !important;
  border: var(--seg-border, 0) !important; border-radius: var(--seg-radius, 8px) !important; background: transparent !important; box-shadow: none !important; color: var(--seg-off-color, var(--text-soft)) !important; font-weight: var(--seg-off-weight, 500) !important; }
.asset-view-toggle button[aria-pressed="true"] { background: var(--seg-on-bg, var(--surface)) !important; color: var(--seg-on-color, var(--text)) !important; font-weight: var(--seg-on-weight, 600) !important; box-shadow: var(--seg-on-shadow, 0 1px 3px rgba(0,0,0,0.12)) !important; }
.asset-view-toggle svg { width: 15px; height: 15px; }
.asset-table-wrap { overflow-x: auto; }
.asset-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.asset-table th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-soft); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.asset-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.asset-table .asset-row { cursor: pointer; }
.asset-table .asset-row:hover td { background: var(--hover-highlight); }
.asset-row-soft { font-size: 12px; color: var(--text-soft); }
.asset-row-trig { display: flex; gap: 4px; flex-wrap: wrap; }
.asset-row-actions { display: flex; gap: 6px; justify-content: flex-end; }
.asset-row-actions .icon-btn { width: 30px !important; height: 30px !important; }
.asset-row-actions .icon-btn svg { width: 15px !important; height: 15px !important; }
`;

function AssetRegistryCard({ asset: a, assetTypeLabel, assetTypeIcon, canEdit, canDelete, onRowClick, onEdit, onDelete, onShowFlow }: AssetRegistryCardProps) {
  const { data: triggers = [] } = useAssetTriggers(a.id);
  const activeTriggers = triggers.filter((t) => t.enabled);

  return (
    <div className="review-card" onClick={() => onRowClick(a)} style={{ cursor: "pointer" }}>
      <div className="review-card-top">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{ width: 99, height: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {assetTypeIcon && assetTypeIcon.trim().startsWith("data:") ? (
              <img src={assetTypeIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: 11, color: "var(--text-soft)" }}>—</span>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="review-card-code">{a.asset_code}</div>
            <div className="review-card-desc">{a.asset_description || "—"}</div>
          </div>
        </div>
        <span className={`pill ${a.active ? "active" : "inactive"}`}>
          {a.active ? "Active" : "Inactive"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {a.tag_status && (
          <TagLamp status={a.tag_status} size={20} title={a.tag_reason ?? undefined} />
        )}
        {a.country && <span className="pill neutral">{a.country}</span>}
        {a.vehicle && <span className="pill neutral">Vehicle</span>}
        {assetTypeLabel && <span className="pill neutral">{assetTypeLabel}</span>}
      </div>

      {activeTriggers.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
        {onShowFlow && a.id !== null && (
          <button className="icon-btn" aria-label="Show flow" title="Show history flow" onClick={(e) => { e.stopPropagation(); onShowFlow(a.id as number); }}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
              <rect x="15" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
              <rect x="9" y="15" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
              <path d="M9 6.5h6M6 9v3a2 2 0 0 0 2 2h1M18 9v3a2 2 0 0 1-2 2h-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
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
  onShowAssetFlow?: (assetId: number) => void;
}

function AssetRegistry({ onViewTriggers, onShowAssetFlow }: AssetRegistryProps) {
  const { data: assets = [], isLoading } = useAssetsForViewer();
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
  const canManageExemptions = permissions.includes("mri.approve");

  const activeTemplateAssetTypeIds = new Set(
    templates.filter((t) => t.status === "Active").map((t) => t.asset_type_id)
  );
  const eligibleAssetTypes = assetTypes.filter((a) => activeTemplateAssetTypeIds.has(a.id));

  const [form, setForm] = useState<Asset>({ ...emptyAsset, last_action_by: currentUserLabel });
  const [mode, setMode] = useState<Mode>("create");
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [query, setQuery] = useState("");
  const [view, setViewState] = useState<RegistryView>(readView);
  const setView = (v: RegistryView) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* not remembered */ } };
  const [typeFilter, setTypeFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  // Country filter follows the user's country access (Administration > Users > Countries);
  // an empty list means no restriction, the same rule the backend uses for the asset list.
  const { data: myCountries = [] } = useUserCountryAccess(currentUser?.id ?? 0);
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

  const countryFilterOptions = (myCountries.length > 0
    ? [...myCountries]
    : countryOptions.filter((c) => c.active).map((c) => c.name)
  ).sort((x, y) => x.localeCompare(y));
  const serviceFilterOptions = serviceLineOptions.filter((s) => s.active).map((s) => s.name).sort((x, y) => x.localeCompare(y));
  const typeFilterOptions = [...assetTypes].sort((x, y) => x.description.localeCompare(y.description));
  const filtersOn = !!(typeFilter || countryFilter || serviceFilter || query);
  const filtered = assets.filter((a) =>
    `${a.asset_code} ${a.asset_description} ${a.country}`
      .toLowerCase()
      .includes(query.toLowerCase()) &&
    (!typeFilter || (typeFilter === "none" ? !a.asset_type_id : String(a.asset_type_id) === typeFilter)) &&
    (!countryFilter || a.country === countryFilter) &&
    (!serviceFilter || a.service_line === serviceFilter)
  );

  const isView = mode === "view";
  const codeLocked = mode !== "create";

  const panelTitle =
    mode === "create" ? "New asset" :
      mode === "view" ? `Editing ${form.asset_code}` :
        `Editing ${form.asset_code}`;

  return (
    <>
      <style>{REGISTRY_CSS}</style>
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
              style={codeLocked && !isView ? { background: "var(--disabled-bg)", color: "var(--st-grey)", cursor: "not-allowed" } : undefined} />
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
                  <TagLamp status={form.tag_status} size={22} showText title={form.tag_reason ?? undefined} />
                ) : (
                  <span className="pill neutral">Not tagged</span>
                )}
              </div>
              <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
                Set automatically by the MR-I fault approval/rectification workflow — not editable here.
              </span>
              <AssetTagHistory assetId={form.id} reason={form.tag_reason} />
            </div>
          )}
          {mode !== "create" && (
            <AssetMocExemptions
              assetId={form.id}
              tagStatus={form.tag_status}
              canManage={canManageExemptions}
              userLabel={currentUserLabel}
            />
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
                {mode === "create" ? (
                  <button
                    className="primary icon-btn"
                    aria-label="Create asset"
                    title={canCreate ? "Create asset" : "Your role doesn't have permission to create assets"}
                    onClick={handleSave}
                    disabled={!canCreate}
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : (
                  <button className="primary" onClick={handleSave}>
                    Save changes
                  </button>
                )}
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
            <div className="asset-view-toggle" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")} title="Card view">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /></svg>
                Cards
              </button>
              <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} title="List view">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
                List
              </button>
            </div>
            <input ref={importFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="ghost icon-btn" aria-label="Export Backup" onClick={() => exportBackup()} title="Export Backup: download a full backup of all assets and their triggers">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="ghost icon-btn" aria-label="Import Backup" onClick={() => importFileRef.current?.click()} title="Import Backup: restore assets from a backup file">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            </div>
          </div>
          <div className="asset-filters">
            <label>Asset type
              <select className="neu-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All asset types</option>
                {typeFilterOptions.map((t) => <option key={t.id} value={String(t.id)}>{t.description}</option>)}
                <option value="none">No type assigned</option>
              </select>
            </label>
            <label>Country
              <select className="neu-select" value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
                <option value="">{myCountries.length > 0 ? "All my countries" : "All countries"}</option>
                {countryFilterOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Service line
              <select className="neu-select" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                <option value="">All service lines</option>
                {serviceFilterOptions.map((sl) => <option key={sl} value={sl}>{sl}</option>)}
              </select>
            </label>
            {filtersOn && (
              <button type="button" className="ghost" onClick={() => { setTypeFilter(""); setCountryFilter(""); setServiceFilter(""); setQuery(""); }}>
                Reset filters
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="empty">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              {assets.length === 0 ? "No assets yet — create one to get started" : "No assets match your search or filters"}
            </div>
          ) : view === "list" ? (
            <div className="asset-table-wrap">
              <table className="asset-table">
                <thead>
                  <tr><th>Tag</th><th>Asset</th><th>Asset type</th><th>Country</th><th>Service line</th><th>Counters</th><th>Status</th><th aria-label="Actions" /></tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <AssetRegistryRow
                      key={a.id}
                      asset={a}
                      assetTypeLabel={a.asset_type_id ? assetTypes.find((t) => t.id === a.asset_type_id)?.description ?? "Type" : null}
                      assetTypeIcon={null}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onRowClick={handleRowClick}
                      onEdit={handleEdit}
                      onDelete={requestDelete}
                      onShowFlow={onShowAssetFlow}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="review-card-grid">
              {filtered.map((a) => (
                <AssetRegistryCard
                  key={a.id}
                  asset={a}
                  assetTypeLabel={a.asset_type_id ? assetTypes.find((t) => t.id === a.asset_type_id)?.description ?? "Type" : null}
                  assetTypeIcon={a.asset_type_id ? assetTypes.find((t) => t.id === a.asset_type_id)?.icon ?? null : null}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onRowClick={handleRowClick}
                  onEdit={handleEdit}
                  onDelete={requestDelete}
                  onShowFlow={onShowAssetFlow}
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