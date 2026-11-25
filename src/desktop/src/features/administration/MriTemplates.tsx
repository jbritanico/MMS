import { useState, useRef, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { invoke } from "../../lib/ipc";
import type { TemplateChecklistItem } from "../mri-template-builder/hooks/useTemplateChecklistItems";
import {
  useMriTemplates,
  useCreateMriTemplate, useCopyMriTemplate,
  useUpdateTemplateStatus,
  useRenameMriTemplate,
  useDeleteMriTemplate,
  useExportMriTemplatesBackup,
  useImportMriTemplatesBackup,
  type MriTemplate,
  type TemplateStatus,
} from "./hooks/useMriTemplates";
import { useAssetTypes } from "./hooks/useAssetTypes";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useMriReports } from "../mri-reporting/hooks/useMriReports";
import AssetTypeCombobox from "./AssetTypeCombobox";
import TemplateGraphModal from "../mri-template-builder/TemplateGraphModal";
import { useTemplateHints } from "../mri-template-builder/useTemplateHints";
import { IsoIconPlatform, TIG_CSS } from "../mri-template-builder/TemplateIsoGuide";
import { useReportAdminKpis } from "./AdminIsoGuide";
import { useCurrentUser } from "../../lib/currentUser";
import { useCurrentUserPermissionCodes } from "../../lib/useCurrentUserPermissions";
import { useMyTemplateTasks, useStartTemplateRevision, useTemplateApprovalAction } from "./hooks/useMriTemplates";
import { ApprovalActionModal, ApprovalHistoryModal, TA_CSS, TemplateTasksPanel, canChangeContent, templateState, type ApprovalAction } from "./TemplateApproval";

interface MriTemplatesProps {
  onOpenTemplate: (id: number, name: string) => void;
  selectedTemplateId: number | null;
}

function MriTemplates({ onOpenTemplate }: MriTemplatesProps) {
  const { data: templates = [], isLoading } = useMriTemplates();
  const { data: assetTypes = [] } = useAssetTypes();
  // One template per kind of unit: kinds that already have a template are not offered for a new
  // one (changes go through "Change this template"), and kinds with more than one in use are flagged.
  const currentTemplates = templates.filter((t) => !t.is_variant && !t.superseded_by && (!t.revision_of || t.approval === "Approved"));
  const kindsWithTemplate = new Set(currentTemplates.map((t) => t.asset_type_id));
  const freeAssetTypes = assetTypes.filter((a) => !kindsWithTemplate.has(a.id));
  const inUseByKind = new Map<number, string[]>();
  templates.filter((t) => t.status === "Active" && !t.superseded_by && !t.is_variant).forEach((t) => inUseByKind.set(t.asset_type_id, [...(inUseByKind.get(t.asset_type_id) ?? []), t.template_name]));
  const duplicateKinds = [...inUseByKind.entries()].filter(([, names]) => names.length > 1)
    .map(([id, names]) => ({ kind: assetTypes.find((a) => a.id === id)?.description ?? `Kind #${id}`, names }));
  const createTemplate = useCreateMriTemplate();
  // FB-018: "Copy as unit variant".
  const copyTemplate = useCopyMriTemplate();
  const [copyFrom, setCopyFrom] = useState<MriTemplate | null>(null);
  const [copyName, setCopyName] = useState("");
  const [copyError, setCopyError] = useState<string | null>(null);
  const updateStatus = useUpdateTemplateStatus();
  const renameTemplate = useRenameMriTemplate();
  // TPL-2: who may do what with templates, and what is waiting for the signed-in user.
  const { user: currentUser } = useCurrentUser();
  const codes = useCurrentUserPermissionCodes();
  const can = (code: string) => codes === null || codes.has(code);
  const { data: myTasks = [] } = useMyTemplateTasks(currentUser?.id ?? 0);
  const approvalAction = useTemplateApprovalAction();
  const startRevision = useStartTemplateRevision();
  const [act, setAct] = useState<{ action: ApprovalAction; t: MriTemplate } | null>(null);
  const [historyFor, setHistoryFor] = useState<MriTemplate | null>(null);


  const deleteTemplate = useDeleteMriTemplate();
  // A template is in use once units of its kind are in the Asset Registry or MR-I reports
  // were made with it; then it can't be deleted (set it to Not in use instead).
  const { data: allAssets = [], isSuccess: assetsReady } = useAssets();
  const { data: allReports = [], isSuccess: reportsReady } = useMriReports();
  const useOf = (t: MriTemplate) => ({
    // FB-018: a unit variant is used by the units given it; a standard by the other units of its kind.
    units: allAssets.filter((a) => (t.is_variant ? a.mri_template_id === t.id : a.asset_type_id === t.asset_type_id && !a.mri_template_id)).length,
    reports: allReports.filter((r) => r.template_id === t.id).length,
  });
  const exportBackup = useExportMriTemplatesBackup();
  const importBackup = useImportMriTemplatesBackup();
  const importFileRef = useRef<HTMLInputElement>(null);
  const tplCount = (st: string) => templates.filter((x) => x.status === st).length;
  // Kinds of unit with no In use template: their units can't get an MR-I report.
  const kindsNoInUse = assetTypes.filter((k) => k.active && !templates.some((x) => x.asset_type_id === k.id && x.status === "Active" && !x.is_variant));
  const kindsNoTpl = kindsNoInUse.length;
  // Questions and groups on each template (the same queries the Checklist Bank uses).
  const shapeQueries = useQueries({
    queries: templates.map((t) => ({
      queryKey: ["template-checklist-items", t.id],
      queryFn: () => invoke<TemplateChecklistItem[]>("get_template_checklist_items", { templateId: t.id }),
    })),
  });
  const shape = useMemo(() => {
    const m = new Map<number, { questions: number; groups: number }>();
    shapeQueries.forEach((q, i) => {
      const t = templates[i];
      if (t && q.isSuccess) m.set(t.id, { questions: (q.data ?? []).length, groups: new Set((q.data ?? []).map((x) => x.section_id).filter((x) => x != null)).size });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, shapeQueries.map((q) => q.dataUpdatedAt).join(",")]);
  useReportAdminKpis("mri-template", [
    { label: "MR-I templates", value: templates.length, tone: "blue" },
    { label: "in use", value: tplCount("Active"), tone: "ok" },
    { label: "draft", value: tplCount("Draft"), tone: tplCount("Draft") ? "look" : "skip" },
    { label: "under review", value: templates.filter((x) => x.approval === "Submitted" || x.approval === "Endorsed").length, tone: "blue" },
    { label: "not in use", value: tplCount("Inactive"), tone: "skip" },
    { label: "kinds of unit without one in use", value: kindsNoTpl, tone: kindsNoTpl ? "look" : "ok" },
  ]);


  const [newName, setNewName] = useState("");
  const [newAssetTypeId, setNewAssetTypeId] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MriTemplate | null>(null);
  // FB-015: a refused delete is explained inside the dialog.
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
      flash("Template created as Draft. Build it, then send it for review.", "ok");
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
    // TPL-2: only an approved template is switched between In use and Not in use.
    const next: TemplateStatus = t.status === "Active" ? "Inactive" : "Active";
    try {
      await updateStatus.mutateAsync({ id: t.id, status: next });
      flash(`${t.template_name} is now ${STATUS_WORDS[next]}`, "ok");
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteTemplate.mutateAsync(pendingDelete.id);
      flash(`"${pendingDelete.template_name}" deleted`, "ok");
      setPendingDelete(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(String(err));
    }
  }

  async function runAction(note: string) {
    if (!act || !currentUser) return;
    try {
      const msg = await approvalAction.mutateAsync({ action: act.action, templateId: act.t.id, userId: currentUser.id, note });
      flash(String(msg), "ok");
      setAct(null);
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function startChange(t: MriTemplate) {
    if (!currentUser) return;
    try {
      const id = await startRevision.mutateAsync({ templateId: t.id, userId: currentUser.id });
      flash(`Version ${t.version + 1} started. The approved version stays in use until this one is approved.`, "ok");
      onOpenTemplate(id, t.template_name);
    } catch (err) {
      flash(String(err), "err");
    }
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

  return (
    <div className="tig">
      <style>{TIG_CSS + MT_CSS + TA_CSS}</style>
      <TemplateTasksPanel tasks={myTasks} onOpen={(id) => { const x = templates.find((y) => y.id === id); if (x) onOpenTemplate(x.id, x.template_name); }} />
      {can("mri_templates.edit") && <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap" }}>
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
          <AssetTypeCombobox assetTypes={freeAssetTypes} value={newAssetTypeId} onChange={setNewAssetTypeId} />
        </div>
        <button className="primary" onClick={handleCreate}>+ Make template</button>
        <span style={{ flexBasis: "100%", fontSize: 12, color: "var(--text-soft)" }}>
          Each kind of unit has one template. Kinds that already have one are not listed: open its template and use Change this template.
        </span>
      </div>}
      {duplicateKinds.length > 0 && (
        <div className="toast err" role="alert" style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {duplicateKinds.length === 1 ? "1 kind of unit has" : `${duplicateKinds.length} kinds of unit have`} more than one template in use
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {duplicateKinds.map((d) => <li key={d.kind} style={{ fontSize: 12.5 }}><b>{d.kind}</b>: {d.names.join(", ")}</li>)}
          </ul>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>New MR-I reports could use either one. Set all but one of them to Not in use.</div>
        </div>
      )}

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

      {kindsNoInUse.length > 0 && (
        <details className="mt-cover">
          <summary>{kindsNoInUse.length} kind{kindsNoInUse.length === 1 ? "" : "s"} of unit without an In use template</summary>
          <p>Units of these kinds can't get an MR-I report until a template for the kind is set to In use.</p>
          <ul>{kindsNoInUse.map((k) => {
            const units = allAssets.filter((a) => a.asset_type_id === k.id).length;
            const tpl = templates.filter((x) => x.asset_type_id === k.id);
            return (
              <li key={k.id}>
                <b>{k.description}</b>
                <span>{units} unit{units === 1 ? "" : "s"} in the registry · {tpl.length ? tpl.map((x) => `${x.template_name} (${STATUS_WORDS[x.status]})`).join(", ") : "no template yet"}</span>
              </li>
            );
          })}</ul>
        </details>
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
                  <TemplateIcon icon={assetTypes.find((a) => a.id === t.asset_type_id)?.icon} />
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
                      <div className="review-card-code">{t.template_name}{t.version > 1 && <span className="mt-ver">v{t.version}</span>}</div>
                      <div className="mt-kind">
                        <span>{assetTypeName(t.asset_type_id)}</span>
                        {t.is_variant && <span className="mt-shape">· Unit variant</span>}
                        {shape.get(t.id) && <span className="mt-shape">· {shape.get(t.id)!.questions} question{shape.get(t.id)!.questions === 1 ? "" : "s"} · {shape.get(t.id)!.groups} group{shape.get(t.id)!.groups === 1 ? "" : "s"}</span>}
                      </div>
                      {canChangeContent(t) && <DraftHint templateId={t.id} />}
                    </div>
                  )}
                </div>
                <span className={`pill ${templateState(t).tone}`}>{templateState(t).label}</span>
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
                    {t.approval === "Approved" && !t.superseded_by && can("mri_templates.edit") && <button className="icon-btn" aria-label="Switch in use" onClick={(e) => { e.stopPropagation(); cycleStatus(t); }} title={t.status === "Active" ? "Set Not in use" : "Put back in use"}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M18 4v4h-4M6 20v-4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>}
                    {t.approval === "Approved" && !t.superseded_by && can("mri_templates.edit") && <button className="icon-btn" aria-label="Copy as unit variant" title="Copy as unit variant: a different checklist for some units of this kind" onClick={(e) => { e.stopPropagation(); setCopyFrom(t); setCopyName(`${t.template_name} - variant`); setCopyError(null); }}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
                        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    </button>}
                    {canChangeContent(t) && <button className="icon-btn" aria-label="Rename" onClick={(e) => { e.stopPropagation(); startEdit(t); }}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
                          stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                    </button>}
                    {(() => {
                      const u = useOf(t);
                      // TPL-2: a new version that is still a draft can always be deleted; nothing under review can.
                      const newDraft = !!t.revision_of && t.approval === "Draft";
                      const review = t.approval === "Submitted" || t.approval === "Endorsed";
                      const locked = review || (!newDraft && (!assetsReady || !reportsReady || u.units > 0 || u.reports > 0));
                      const why = review ? "Under review: it can't be deleted now" : newDraft ? "Delete this draft change" : !assetsReady || !reportsReady ? "Checking whether this template is in use…"
                        : locked ? `In use (${u.units} ${u.units === 1 ? "unit" : "units"} of this kind, ${u.reports} MR-I ${u.reports === 1 ? "report" : "reports"}) — set it to Not in use instead` : "Delete";
                      return (
                    <button className="icon-btn icon-danger" aria-label="Delete" aria-disabled={locked} style={locked ? { opacity: 0.35, cursor: "not-allowed" } : undefined} title={why}
                      onClick={(e) => { e.stopPropagation(); if (!locked) setPendingDelete(t); }}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                      );
                    })()}
                  </>
                )}
              </div>
              <div className="mt-actions" onClick={(e) => e.stopPropagation()}>
                {canChangeContent(t) && can("mri_templates.edit") && (
                  <button className="primary" onClick={() => setAct({ action: "submit", t })} title="Send to the Maintenance Manager / FSM to endorse">Send for review</button>
                )}
                {t.approval === "Submitted" && can("mri_templates.endorse") && (<>
                  <button className="primary" onClick={() => setAct({ action: "endorse", t })}>Endorse</button>
                  <button className="ghost" onClick={() => setAct({ action: "reject", t })}>Send back</button>
                </>)}
                {t.approval === "Endorsed" && can("mri_templates.approve") && (<>
                  <button className="primary" onClick={() => setAct({ action: "approve", t })}>Approve</button>
                  <button className="ghost" onClick={() => setAct({ action: "reject", t })}>Send back</button>
                </>)}
                {t.approval === "Approved" && !t.superseded_by && can("mri_templates.edit") && (() => {
                  const open = templates.find((x) => x.revision_of === t.id && x.approval !== "Approved");
                  return open
                    ? <button className="ghost" onClick={() => onOpenTemplate(open.id, open.template_name)} title="A new version is being prepared">Change in progress (v{open.version})</button>
                    : <button className="ghost" onClick={() => startChange(t)} title="Start a new version; this version stays in use until the change is approved">Change this template</button>;
                })()}
                <button className="ghost" onClick={() => setHistoryFor(t)}>History</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {copyFrom && (
        <div className="modal-overlay">
          <div className="modal" style={{ textAlign: "left" }}>
            <h3>Copy as unit variant</h3>
            <p>
              Makes a draft copy of <strong>"{copyFrom.template_name}"</strong> for {assetTypeName(copyFrom.asset_type_id)} units whose checklist differs
              (for example extra equipment). Add or remove its questions, send it for review, and once approved give it to those units
              in the Asset Registry (MR-I checklist). Other units keep the standard template.
            </p>
            <div className="field">
              <label htmlFor="mt-copy-name">Name of the new checklist</label>
              <input id="mt-copy-name" type="text" value={copyName} onChange={(e) => setCopyName(e.target.value)} autoFocus />
            </div>
            {copyError && <p role="alert" style={{ color: "var(--danger)", fontWeight: 600 }}>{copyError}</p>}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setCopyFrom(null)}>Cancel</button>
              <button className="primary" disabled={!copyName.trim() || copyTemplate.isPending || !currentUser} onClick={async () => {
                if (!currentUser) return;
                try {
                  const id = await copyTemplate.mutateAsync({ sourceId: copyFrom.id, newName: copyName.trim(), userId: currentUser.id });
                  const name = copyName.trim();
                  setCopyFrom(null);
                  flash(`"${name}" made as a draft unit variant. Change its questions, then send it for review.`, "ok");
                  onOpenTemplate(id, name);
                } catch (err) {
                  setCopyError(String(err));
                }
              }}>Make the copy</button>
            </div>
          </div>
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
            {deleteError && <p role="alert" style={{ color: "var(--danger)", fontWeight: 600 }}>{deleteError}</p>}
            <div className="modal-actions">
              <button className="ghost" onClick={() => { setPendingDelete(null); setDeleteError(null); }}>{deleteError ? "Close" : "Cancel"}</button>
              {!deleteError && <button className="danger" onClick={confirmDelete}>Delete</button>}
            </div>
          </div>
        </div>
      )}

      {act && (
        <ApprovalActionModal action={act.action} template={act.t} busy={approvalAction.isPending} onCancel={() => setAct(null)} onConfirm={runAction} />
      )}
      {historyFor && <ApprovalHistoryModal template={historyFor} onClose={() => setHistoryFor(null)} />}

      {graphTemplate && (
        <TemplateGraphModal template={graphTemplate} onClose={() => setGraphTemplate(null)} />
      )}
    </div>
  );
}
// Plain words for the template statuses (the statuses themselves are unchanged).
const STATUS_WORDS: Record<TemplateStatus, string> = { Draft: "Draft", Active: "In use", Inactive: "Not in use" };

// The kind of unit's icon standing on a 3D platform, the same as the Asset Registry cards.
// Display only.
function TemplateIcon({ icon }: { icon?: string | null }) {
  return (
    <span style={{ flexShrink: 0, display: "inline-flex" }}>
      <IsoIconPlatform icon={icon} size={96} />
    </span>
  );
}

const MT_CSS = `
.tig .mt-card { transition: transform .4s cubic-bezier(.34,1.56,.64,1), box-shadow .25s; }
.tig .mt-card:hover, .tig .mt-card:focus-within { transform: translateY(-4px); }
.tig .mt-kind { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-soft); margin-top: 4px; flex-wrap: wrap; }
.mt-cover { margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); border-left: 4px solid var(--warn); background: var(--surface); }
.mt-cover summary { cursor: pointer; font-weight: 700; color: var(--warn); }
.mt-cover p { margin: 6px 0; font-size: 12.5px; color: var(--text-soft); }
.mt-cover ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.mt-cover li { display: flex; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.mt-cover li span { color: var(--text-soft); }
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
