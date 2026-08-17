import { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  useLookupCriteria,
  useLookups,
  useCreateLookup,
  useUpdateLookup,
  useDeleteLookup,
  useBulkCreateLookups,
  type LookupValue,
} from "./hooks/useLookups";

function LookupsManager() {
  const { data: criteriaList = [] } = useLookupCriteria();
  const [activeCriteria, setActiveCriteria] = useState<string>("");
  const [newCriteriaInput, setNewCriteriaInput] = useState("");

  const effectiveCriteria = activeCriteria || criteriaList[0] || "";

  const { data: values = [], isLoading } = useLookups(effectiveCriteria);
  const createLookup = useCreateLookup(effectiveCriteria);
  const updateLookup = useUpdateLookup(effectiveCriteria);
  const deleteLookup = useDeleteLookup(effectiveCriteria);
  const bulkCreate = useBulkCreateLookups(effectiveCriteria);

  const [newValue, setNewValue] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LookupValue | null>(null);

  const [previewRows, setPreviewRows] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 4000);
  }

  function selectCriteria(c: string) {
    setActiveCriteria(c);
    setEditingId(null);
  }

  function addNewCriteria() {
    const name = newCriteriaInput.trim().toUpperCase();
    if (!name) return;
    setActiveCriteria(name);
    setNewCriteriaInput("");
  }

  async function handleAddValue() {
    if (!newValue.trim() || !effectiveCriteria) return;
    try {
      await createLookup.mutateAsync(newValue.trim());
      setNewValue("");
      flash(`Value added to ${effectiveCriteria}`, "ok");
    } catch (err) {
      flash(String(err), "err");
    }
  }

  function startEdit(v: LookupValue) {
    setEditingId(v.id);
    setEditValue(v.name);
  }

  async function saveEdit(v: LookupValue) {
    if (!editValue.trim()) return;
    try {
      await updateLookup.mutateAsync({ ...v, name: editValue.trim() });
      setEditingId(null);
      flash("Value updated", "ok");
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function toggleActive(v: LookupValue) {
    await updateLookup.mutateAsync({ ...v, active: !v.active });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteLookup.mutateAsync(pendingDelete.id);
    flash(`"${pendingDelete.name}" deleted`, "ok");
    setPendingDelete(null);
  }

  function normalizeRows(rows: any[]): string[] {
    return rows
      .map((r) => {
        const keys = Object.keys(r);
        const nameKey = keys.find((k) => k.trim().toLowerCase() === "name") ?? keys[0];
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
      <h2 style={{ marginBottom: 4 }}>Lookups</h2>
      <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
        Shared dropdown values used across the app (Country, Client, etc.), grouped by criteria. Will sync from SharePoint once authentication is available.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: 4, background: "rgba(0,0,0,0.04)", borderRadius: 12 }}>
          {criteriaList.map((c) => (
            <button
              key={c}
              onClick={() => selectCriteria(c)}
              style={{
                padding: "7px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                background: effectiveCriteria === c ? "var(--neu-bg)" : "transparent",
                color: effectiveCriteria === c ? "#2f6fed" : "var(--text-soft)",
                boxShadow: effectiveCriteria === c
                  ? "inset 2px 2px 4px var(--neu-shadow-dark), inset -2px -2px 4px var(--neu-shadow-light)"
                  : "none",
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            className="trigger-input"
            placeholder="New criteria (e.g. CLIENT)"
            value={newCriteriaInput}
            onChange={(e) => setNewCriteriaInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNewCriteria()}
            style={{ width: 200 }}
          />
          <button className="ghost" onClick={addNewCriteria}>+ Add criteria</button>
        </div>
      </div>

      {!effectiveCriteria ? (
        <div className="empty">No criteria yet — add one above to get started (e.g. COUNTRY, CLIENT)</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
            <div className="field" style={{ flex: 1, maxWidth: 320, marginBottom: 0 }}>
              <label>New value for {effectiveCriteria}</label>
              <input
                type="text"
                value={newValue}
                placeholder="e.g. Oman"
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddValue()}
              />
            </div>
            <button className="primary" onClick={handleAddValue}>Add</button>
          </div>

          <div style={{ marginBottom: 18 }}>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleFileSelected} />
            <button className="ghost" onClick={() => fileInputRef.current?.click()}>Upload from CSV / Excel</button>
            <span style={{ fontSize: 12, color: "var(--text-soft)", marginLeft: 10 }}>Column: Name</span>
          </div>

          {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

          {previewRows && (
            <div className="panel" style={{ marginBottom: 18 }}>
              <h2>Import preview — {previewRows.length} row{previewRows.length !== 1 ? "s" : ""}</h2>
              <div className="cards" style={{ maxHeight: 240, overflowY: "auto" }}>
                {previewRows.slice(0, 50).map((name, i) => (
                  <div className="card" key={i} style={{ cursor: "default" }}>
                    <div className="card-main"><div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{name}</div></div>
                  </div>
                ))}
              </div>
              <div className="actions">
                <button className="primary" onClick={confirmImport} disabled={importing}>
                  {importing ? "Importing..." : `Import ${previewRows.length} values`}
                </button>
                <button className="ghost" onClick={() => setPreviewRows(null)}>Cancel</button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="empty">Loading...</div>
          ) : values.length === 0 ? (
            <div className="empty">No values yet for {effectiveCriteria}</div>
          ) : (
            <div className="cards">
              {values.map((v) => (
                <div className="card" key={v.id} style={{ cursor: "default" }}>
                  {editingId === v.id ? (
                    <div className="card-main">
                      <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit(v)} autoFocus />
                    </div>
                  ) : (
                    <div className="card-main">
                      <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{v.name}</div>
                      <div className="meta">
                        <span className={`pill ${v.active ? "active" : "inactive"}`}>{v.active ? "Active" : "Inactive"}</span>
                      </div>
                    </div>
                  )}
                  <div className="card-actions">
                    {editingId === v.id ? (
                      <>
                        <button className="icon-btn" aria-label="Save" onClick={() => saveEdit(v)}>
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
                        <button className="icon-btn" aria-label={v.active ? "Deactivate" : "Activate"} onClick={() => toggleActive(v)}>
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {v.active ? (
                              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            ) : (
                              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            )}
                          </svg>
                        </button>
                        <button className="icon-btn" aria-label="Edit" onClick={() => startEdit(v)}>
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
                              stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                          </svg>
                        </button>
                        <button className="icon-btn icon-danger" aria-label="Delete" onClick={() => setPendingDelete(v)}>
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
            <h3>Delete value?</h3>
            <p>This will permanently delete <strong>"{pendingDelete.name}"</strong> from {pendingDelete.criteria}.</p>
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

export default LookupsManager;
