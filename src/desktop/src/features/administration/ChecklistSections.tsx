import { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  useChecklistSections,
  useCreateChecklistSection,
  useUpdateChecklistSection,
  useDeleteChecklistSection,
  useBulkCreateChecklistSections,
  type ChecklistSection,
} from "./hooks/useChecklistSections";
import { useQueries } from "@tanstack/react-query";
import { invoke } from "../../lib/ipc";
import { useMriTemplates } from "./hooks/useMriTemplates";
import type { TemplateChecklistItem } from "../mri-template-builder/hooks/useTemplateChecklistItems";
import { IsoBars, RowTile, useReportAdminHints, useReportAdminKpis } from "./AdminIsoGuide";

function ChecklistSections() {
  const { data: sections = [], isLoading } = useChecklistSections();
  // Checks in each group across all MR-I templates — read from the template builder's own queries. Display only.
  const { data: templates = [] } = useMriTemplates();
  const tplQueries = useQueries({
    queries: templates.map((t) => ({
      queryKey: ["template-checklist-items", t.id],
      queryFn: () => invoke<TemplateChecklistItem[]>("get_template_checklist_items", { templateId: t.id }),
    })),
  });
  const usageReady = tplQueries.every((q) => q.isSuccess);
  const checksIn = (id: number) => tplQueries.reduce((n, q) => n + (q.data ?? []).filter((x) => x.section_id === id).length, 0);
  const tplsUsing = (id: number) => tplQueries.filter((q) => (q.data ?? []).some((x) => x.section_id === id)).length;
  const emptyGroups = usageReady ? sections.filter((s) => checksIn(s.id) === 0).length : 0;
  useReportAdminHints("checklist-sections", emptyGroups ? [`${emptyGroups} ${emptyGroups === 1 ? "group isn't" : "groups aren't"} used by any check`] : []);
  useReportAdminKpis("checklist-sections", [
    { label: "check groups", value: sections.length, tone: "blue" },
    { label: "checks placed in groups", value: usageReady ? sections.reduce((n, s) => n + checksIn(s.id), 0) : "…", tone: "ok" },
    { label: "groups not used", value: usageReady ? emptyGroups : "…", tone: emptyGroups ? "look" : "ok" },
  ]);
  const createSection = useCreateChecklistSection();
  const updateSection = useUpdateChecklistSection();
  const deleteSection = useDeleteChecklistSection();
  const bulkCreate = useBulkCreateChecklistSections();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChecklistSection | null>(null);

  const [previewRows, setPreviewRows] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 4000);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await createSection.mutateAsync(newName.trim());
      setNewName("");
      flash("Group added", "ok");
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
      flash("Group renamed", "ok");
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteSection.mutateAsync(pendingDelete.id);
      flash(`"${pendingDelete.name}" deleted`, "ok");
    } catch (err) {
      flash(String(err), "err");
    }
    setPendingDelete(null);
  }

  function normalizeRows(rows: any[]): string[] {
    return rows
      .map((r) => {
        const keys = Object.keys(r);
        const nameKey = keys.find((k) => k.trim().toLowerCase() === "name")
          ?? keys.find((k) => k.trim().toLowerCase() === "section")
          ?? keys[0];
        return String(nameKey ? r[nameKey] : "").trim();
      })
      .filter((n) => n.length > 0);
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
      {usageReady && sections.length > 0 && (
        <IsoBars label="Checks in each group, across all MR-I templates"
          items={sections.map((s) => ({ label: s.name, value: checksIn(s.id), tone: checksIn(s.id) ? "ok" : "look", note: `${s.name}: ${checksIn(s.id)} checks on ${tplsUsing(s.id)} templates` }))} />
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Group name</label>
          <input
            type="text"
            value={newName}
            placeholder="e.g. Hydraulic System"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </div>
        <button className="primary" onClick={handleCreate}>+ Add group</button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleFileSelected} />
        <button className="ghost" onClick={() => fileInputRef.current?.click()}>Upload from CSV / Excel</button>
        <span style={{ fontSize: 12, color: "var(--text-soft)", marginLeft: 10 }}>
          Column: Name (or Section)
        </span>
      </div>

      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

      {previewRows && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h2>Import preview — {previewRows.length} row{previewRows.length !== 1 ? "s" : ""} detected</h2>
          <div className="cards" style={{ maxHeight: 260, overflowY: "auto" }}>
            {previewRows.slice(0, 50).map((name, i) => (
              <div className="card" key={i} style={{ cursor: "default" }}>
                <div className="card-main">
                  <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{name}</div>
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
      ) : sections.length === 0 ? (
        <div className="empty">No groups yet — add one above to get started</div>
      ) : (
        <div className="cards">
          {sections.map((s) => (
            <div className="card adm-lift" key={s.id} style={{ cursor: "default" }}>
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
                  <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}><RowTile tone={!usageReady ? "skip" : checksIn(s.id) ? "ok" : "look"} />{s.name}</div>
                  {usageReady && (
                    <div className="meta">
                      {checksIn(s.id)
                        ? <span className="pill neutral">{checksIn(s.id)} {checksIn(s.id) === 1 ? "check" : "checks"} · {tplsUsing(s.id)} {tplsUsing(s.id) === 1 ? "template" : "templates"}</span>
                        : <span className="pill adm-pill-look">Not used by any check</span>}
                    </div>
                  )}
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
                    {/* A group used on any template (Draft included) can't be deleted. */}
                    <button className="icon-btn icon-danger" aria-label="Delete" aria-disabled={!usageReady || tplsUsing(s.id) > 0}
                      style={!usageReady || tplsUsing(s.id) > 0 ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                      title={!usageReady ? "Checking which templates use it…" : tplsUsing(s.id) > 0 ? `Used on ${tplsUsing(s.id)} ${tplsUsing(s.id) === 1 ? "template" : "templates"} — remove it from ${tplsUsing(s.id) === 1 ? "that template" : "those templates"} first` : "Delete"}
                      onClick={() => usageReady && tplsUsing(s.id) === 0 && setPendingDelete(s)}>
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
            <h3>Delete this group?</h3>
            <p>
              This will permanently delete <strong>"{pendingDelete.name}"</strong>.
              It isn't used on any template.
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