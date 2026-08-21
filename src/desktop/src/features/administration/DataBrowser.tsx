import { useState, useMemo, useRef, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  useBrowsableTables,
  useTableColumns,
  useTableRows,
  useUpdateTableRow,
  useDeleteTableRow,
} from "./hooks/useDataBrowser";

const PAGE_SIZE = 20;

function DataBrowser() {
  const { data: tables = [] } = useBrowsableTables();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const { data: columns = [] } = useTableColumns(selectedTable);
  const { data: rows = [], isLoading } = useTableRows(selectedTable);
  const updateRow = useUpdateTableRow(selectedTable);
  const deleteRow = useDeleteTableRow(selectedTable);

  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [pendingDelete, setPendingDelete] = useState<Record<string, any> | null>(null);
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 4000);
  }

  function selectTable(t: string) {
    setSelectedTable(t);
    setSearch("");
    setGroupBy("");
    setPage(1);
    setEditingId(null);
  }

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((row) =>
      Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [rows, search]);

  const grouped = useMemo(() => {
    if (!groupBy) return [{ key: null, rows: filteredRows }];
    const map = new Map<string, Record<string, any>[]>();
    for (const row of filteredRows) {
      const key = String(row[groupBy] ?? "— blank —");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, rows]) => ({ key, rows }));
  }, [filteredRows, groupBy]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  function startEdit(row: Record<string, any>) {
    setEditingId(row.id);
    setEditValues({ ...row });
  }

  async function saveEdit() {
    if (editingId === null) return;
    try {
      await updateRow.mutateAsync({ id: editingId, values: editValues });
      setEditingId(null);
      flash("Row updated", "ok");
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteRow.mutateAsync(pendingDelete.id);
      flash(`Row #${pendingDelete.id} deleted`, "ok");
      setPendingDelete(null);
    } catch (err) {
      flash(String(err), "err");
    }
  }

  const displayColumns = columns.slice(0, 6);

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Data Browser</h2>
      <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>
        Browse, search, filter, and group any local table. Edit and delete are unrestricted for now — access will be limited once user authentication is added.
      </p>
      <p style={{ fontSize: 11.5, color: "var(--warn)", marginBottom: 16 }}>
        ⚠ Temporary: administrative-only access is not yet enforced.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        {tables.map((t) => (
          <button
            key={t}
            onClick={() => selectTable(t)}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontFamily: "var(--mono)",
              background: selectedTable === t ? "var(--accent-soft)" : "var(--neu-bg)",
              color: selectedTable === t ? "var(--accent)" : "var(--text-soft)",
              boxShadow: selectedTable === t
                ? "inset 2px 2px 4px var(--neu-shadow-dark), inset -2px -2px 4px var(--neu-shadow-light)"
                : "3px 3px 6px var(--neu-shadow-dark), -3px -3px 6px var(--neu-shadow-light)",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {!selectedTable ? (
        <div className="empty">Select a table above to browse its data</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <input
              type="text"
              className="search"
              placeholder="Search all columns..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ minWidth: 200 }}
            />
            <select className="neu-select" value={groupBy} onChange={(e) => { setGroupBy(e.target.value); setPage(1); }}>
              <option value="">No grouping</option>
              {columns.map((c) => (
                <option key={c} value={c}>Group by: {c}</option>
              ))}
            </select>
            <span className="count">{filteredRows.length} of {rows.length} rows</span>
            <ExportMenu tableName={selectedTable} rows={filteredRows} />
          </div>

          {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

          {isLoading ? (
            <div className="empty">Loading...</div>
          ) : filteredRows.length === 0 ? (
            <div className="empty">No rows match your search</div>
          ) : (
            grouped.map((group) => (
              <div key={group.key ?? "all"} style={{ marginBottom: 20 }}>
                {group.key !== null && (
                  <div className="mri-preview-section-label">{group.key} ({group.rows.length})</div>
                )}
                <div className="grid-table">
                  <div className="grid-row grid-head" style={{ gridTemplateColumns: `repeat(${displayColumns.length}, 1fr) 90px` }}>
                    {displayColumns.map((c) => <span key={c}>{c}</span>)}
                    <span></span>
                  </div>
                  {group.rows.map((row) => (
                    <div key={row.id} className="grid-row" style={{ gridTemplateColumns: `repeat(${displayColumns.length}, 1fr) 90px` }}>
                      {displayColumns.map((c) => (
                        <span key={c}>
                          {editingId === row.id ? (
                            <input
                              type="text"
                              className="trigger-input"
                              value={editValues[c] ?? ""}
                              onChange={(e) => setEditValues({ ...editValues, [c]: e.target.value })}
                              disabled={c === "id"}
                            />
                          ) : (
                            String(row[c] ?? "")
                          )}
                        </span>
                      ))}
                      <div className="card-actions">
                        {editingId === row.id ? (
                          <>
                            <button className="icon-btn" aria-label="Save" onClick={saveEdit}>
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
                            <button className="icon-btn" aria-label="Edit" onClick={() => startEdit(row)}>
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
                                  stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                              </svg>
                            </button>
                            <button className="icon-btn icon-danger" aria-label="Delete" onClick={() => setPendingDelete(row)}>
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
              </div>
            ))
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
            <h3>Delete row?</h3>
            <p>
              This will permanently delete row <strong>#{pendingDelete.id}</strong> from <strong>{selectedTable}</strong>.
              This bypasses any related-table cleanup — deleting here can leave orphaned references elsewhere.
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

function ExportMenu({ tableName, rows }: { tableName: string | null; rows: Record<string, any>[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const csv = Papa.unparse(rows);
    download(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${tableName}.csv`);
    setOpen(false);
  }

  function exportJson() {
    download(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), `${tableName}.json`);
    setOpen(false);
  }

  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tableName ?? "Sheet1");
    XLSX.writeFile(wb, `${tableName}.xlsx`);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", marginLeft: "auto" }}>
      <button className="ghost" onClick={() => setOpen((v) => !v)} disabled={rows.length === 0}>
        ⤓ Export
      </button>
      {open && (
        <div className="combobox-panel" style={{ minWidth: 140, right: 0, left: "auto" }}>
          <div className="combobox-option" onClick={exportXlsx}>Excel (.xlsx)</div>
          <div className="combobox-option" onClick={exportCsv}>CSV (.csv)</div>
          <div className="combobox-option" onClick={exportJson}>JSON (.json)</div>
        </div>
      )}
    </div>
  );
}

export default DataBrowser;