import { useState, useRef } from "react";
import {
  useMriTemplates,
  useCreateMriTemplate,
  useUpdateTemplateStatus,
  useRenameMriTemplate,
  useDeleteMriTemplate,
  useExportMriTemplatesBackup,
  useImportMriTemplatesBackup,
  type MriTemplate,
  type TemplateStatus,
} from "./hooks/useMriTemplates";
import { useAssetTypes } from "./hooks/useAssetTypes";
import AssetTypeCombobox from "./AssetTypeCombobox";
import TemplateGraphModal from "../mri-template-builder/TemplateGraphModal";
import { useTemplateHints } from "../mri-template-builder/useTemplateHints";
import { IsoIconPlatform, IsoTower, TIG_CSS } from "../mri-template-builder/TemplateIsoGuide";
import { useReportAdminKpis } from "./AdminIsoGuide";

const STATUS_ORDER: TemplateStatus[] = ["Draft", "Active", "Inactive"];

interface MriTemplatesProps {
  onOpenTemplate: (id: number, name: string) => void;
  selectedTemplateId: number | null;
}

function MriTemplates({ onOpenTemplate }: MriTemplatesProps) {
  const { data: templates = [], isLoading } = useMriTemplates();
  const { data: assetTypes = [] } = useAssetTypes();
  const createTemplate = useCreateMriTemplate();
  const updateStatus = useUpdateTemplateStatus();
  const renameTemplate = useRenameMriTemplate();


  const deleteTemplate = useDeleteMriTemplate();
  const exportBackup = useExportMriTemplatesBackup();
  const importBackup = useImportMriTemplatesBackup();
  const importFileRef = useRef<HTMLInputElement>(null);
  const tplCount = (st: string) => templates.filter((x) => x.status === st).length;
  const kindsNoTpl = assetTypes.filter((k) => k.active && !templates.some((x) => x.asset_type_id === k.id)).length;
  useReportAdminKpis("mri-template", [
    { label: "MR-I templates", value: templates.length, tone: "blue" },
    { label: "in use", value: tplCount("Active"), tone: "ok" },
    { label: "draft", value: tplCount("Draft"), tone: tplCount("Draft") ? "look" : "skip" },
    { label: "not in use", value: tplCount("Inactive"), tone: "skip" },
    { label: "kinds of unit without one", value: kindsNoTpl, tone: kindsNoTpl ? "look" : "ok" },
  ]);


  const [newName, setNewName] = useState("");
  const [newAssetTypeId, setNewAssetTypeId] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MriTemplate | null>(null);
    const [graphTemplate, setGraphTemplate] = useState<MriTemplate | null>(null);

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
      await renameTemplate.mutateAsync({ id: t.id, templateName: editName.trim() });
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
      flash(`${t.template_name} is now ${STATUS_WORDS[next]}`, "ok");
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

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const result = await importBackup.mutateAsync(text);
        flash(result, "ok");
      } catch (err) {
        flash(String(err), "err");
      }
    };
    reader.readAsText(file);
    if (importFileRef.current) importFileRef.current.value = "";
  }

  function statusPillClass(s: TemplateStatus) {
    if (s === "Active") return "active";
    if (s === "Inactive") return "inactive";
    return "neutral";
  }

  return (
    <div className="tig">
      <style>{TIG_CSS + MT_CSS}</style>
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
        <div className="field" style={{ width: 260, marginBottom: 0 }}>
          <label>For which kind of unit?</label>
          <AssetTypeCombobox assetTypes={assetTypes} value={newAssetTypeId} onChange={setNewAssetTypeId} />
        </div>
        <button className="primary" onClick={handleCreate}>+ Make template</button>
      </div>

      <div style={{ marginBottom: 18, display: "flex", gap: 8, alignItems: "center" }}>
        <input ref={importFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
        <button className="ghost icon-btn" aria-label="Export Backup" onClick={() => exportBackup()} title="Export Backup: download a full backup of all MR-I templates">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="ghost icon-btn" aria-label="Import Backup" onClick={() => importFileRef.current?.click()} title="Import Backup: restore templates from a backup file">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
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
        <div className="review-card-grid">
          {templates.map((t) => (
            <div
              className="review-card mt-card"
              key={t.id}
              style={{ cursor: "pointer" }}
              onClick={() => editingId !== t.id && onOpenTemplate(t.id, t.template_name)}
            >
              <div className="review-card-top">
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                  <TemplateTower templateId={t.id} status={t.status} />
                  {editingId === t.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(t)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  ) : (
                    <div style={{ minWidth: 0 }}>
                      <div className="review-card-code">{t.template_name}</div>
                      <div className="mt-kind">
                        <IsoIconPlatform icon={assetTypes.find((a) => a.id === t.asset_type_id)?.icon} size={44} />
                        <span>{assetTypeName(t.asset_type_id)}</span>
                      </div>
                      {t.status === "Draft" && <DraftHint templateId={t.id} />}
                    </div>
                  )}
                </div>
                <span className={`pill ${statusPillClass(t.status)}`}>{STATUS_WORDS[t.status]}</span>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
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
                    <button className="icon-btn" aria-label="Structure" onClick={(e) => { e.stopPropagation(); setGraphTemplate(t); }} title="View this template's structure">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="10" y="3" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" />
                        <rect x="3" y="17" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" />
                        <rect x="17" y="17" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" />
                        <path d="M12 7v4M12 11H5v6M12 11h7v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button className="icon-btn" aria-label="Cycle status" onClick={(e) => { e.stopPropagation(); cycleStatus(t); }} title="Change status: Draft → In use → Not in use">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M18 4v4h-4M6 20v-4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button className="icon-btn" aria-label="Rename" onClick={(e) => { e.stopPropagation(); startEdit(t); }}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
                          stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button className="icon-btn icon-danger" aria-label="Delete" onClick={(e) => { e.stopPropagation(); setPendingDelete(t); }}>
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

      {graphTemplate && (
        <TemplateGraphModal template={graphTemplate} onClose={() => setGraphTemplate(null)} />
      )}
    </div>
  );
}
// Plain words for the template statuses (the statuses themselves are unchanged).
const STATUS_WORDS: Record<TemplateStatus, string> = { Draft: "Draft", Active: "In use", Inactive: "Not in use" };

// 3D tower: one floor per part of the form (report details, checks, picture, distance, sign-off),
// coloured by the on-screen hints; the base shows the status. Display only.
function TemplateTower({ templateId, status }: { templateId: number; status: TemplateStatus }) {
  const h = useTemplateHints(templateId);
  const floors = (["header", "checklist", "drawing", "mid", "footer"] as const).map((k) => (h.ready ? h.steps[k].state : "none"));
  return (
    <span title="One floor per part of the form: green looks complete, orange is worth a look, grey is not filled in">
      <IsoTower states={floors} base={status === "Active" ? "ok" : status === "Draft" ? "draft" : "off"} faded={status === "Inactive"} size={70} />
    </span>
  );
}

const MT_CSS = `
.tig .mt-card { transition: transform .4s cubic-bezier(.34,1.56,.64,1), box-shadow .25s; }
.tig .mt-card:hover, .tig .mt-card:focus-within { transform: translateY(-4px); }
.tig .mt-kind { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-soft); margin-top: 4px; }
@media (prefers-reduced-motion: reduce) { .tig .mt-card { transition: none; } .tig .mt-card:hover { transform: none; } }
`;

// Option B: a text-only reminder on Draft cards. Display only — status and the cycle icon are unchanged.
function DraftHint({ templateId }: { templateId: number }) {
  const hints = useTemplateHints(templateId);
  if (!hints.ready) return null;
  const n = hints.lookCount;
  return (
    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: n ? "var(--warn)" : "var(--success)" }}>
      {n ? `${n} ${n === 1 ? "thing" : "things"} worth a look` : "Looks complete"}
    </div>
  );
}

export default MriTemplates;
