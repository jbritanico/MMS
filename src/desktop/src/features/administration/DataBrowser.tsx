import { useState, useMemo, useRef, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  useBrowsableTables,
  useTableColumns,
  useTableRows,
} from "./hooks/useDataBrowser";

// Plain-language descriptions of the tables the Data Browser can open.
// group: where the table belongs; name: everyday name; what: what one row is; where: the MMS screen that normally changes it.
type TableInfo = { group: string; name: string; what: string; where: string; caution?: string };

const TABLE_INFO: Record<string, TableInfo> = {
  assets: { group: "Equipment", name: "Assets (units)", what: "One row per unit of equipment, such as a CTU or a pumping unit: its code, type, country and current Green / Yellow / Red tag.", where: "Asset Registry" },
  asset_types: { group: "Equipment", name: "Asset types", what: "The kinds of equipment MMS knows about (for example CTU, Pumping unit) and the icon shown for each.", where: "Administration → References → Asset Types" },
  maintenance_triggers: { group: "Equipment", name: "Maintenance triggers (MR-II / MR-III countdowns)", what: "For each unit, the counters that decide when the next MR-II or MR-III is due: by hours, kilometres or days, the warning point and how much has been used so far.", where: "Asset Registry → the unit → Triggers" },

  checklist_databank: { group: "Checklist set-up", name: "Checklist Bank", what: "The master list of inspection items (for example \"Access Ladders & Handrails\") with their section and default severity. Templates pick their items from here.", where: "Administration → References → Checklist Bank" },
  checklist_sections: { group: "Checklist set-up", name: "Checklist sections", what: "The headings that group checklist items, such as Structure or Hydraulics.", where: "Administration → References → Sections" },
  header_field_catalog: { group: "Checklist set-up", name: "Header fields list", what: "Every field that can appear in the Header step of an MR-I form, such as Client, Location or Compliance Stage.", where: "Administration → MR Templates (Template builder)" },
  mid_field_catalog: { group: "Checklist set-up", name: "Distance / middle fields list", what: "Every field that can appear in the middle step of an MR-I form, such as Pre-Job or Post-Job kilometres.", where: "Administration → MR Templates (Template builder)" },
  footer_field_catalog: { group: "Checklist set-up", name: "Footer fields list", what: "Every field that can appear in the Footer step, such as Operator Date or Supervisor.", where: "Administration → MR Templates (Template builder)" },
  lookups: { group: "Checklist set-up", name: "Drop-down lists (Lookups)", what: "The choices shown in drop-down boxes across MMS, such as clients, compliance stages and component positions. Each row is one choice under one list name.", where: "Administration → References → Lookups" },

  mri_templates: { group: "MR-I templates", name: "MR-I templates", what: "One row per MR-I form design, normally one per asset type. Says which form a unit uses.", where: "Administration → MR Templates" },
  template_components: { group: "MR-I templates", name: "Template components", what: "The parts of a unit that get their own report, for example Left and Right on a pumping unit.", where: "Administration → MR Templates → Template builder" },
  template_header_fields: { group: "MR-I templates", name: "Template header fields", what: "Which header fields each template shows, and in what order.", where: "Administration → MR Templates → Template builder" },
  template_checklist_items: { group: "MR-I templates", name: "Template checklist items", what: "Which checklist items each template contains, in what order and with what severity.", where: "Administration → MR Templates → Template builder" },
  template_mid_fields: { group: "MR-I templates", name: "Template distance / middle fields", what: "Which middle-step fields each template shows.", where: "Administration → MR Templates → Template builder" },
  template_footer_fields: { group: "MR-I templates", name: "Template footer fields", what: "Which footer fields each template shows.", where: "Administration → MR Templates → Template builder" },
  template_drawings: { group: "MR-I templates", name: "Template drawings", what: "The picture of the equipment shown on a template, used to point at where each check is.", where: "Administration → MR Templates → Template builder" },
  template_drawing_hotspots: { group: "MR-I templates", name: "Drawing hotspots", what: "The numbered spots placed on a template drawing.", where: "Administration → MR Templates → Template builder" },
  template_drawing_hotspot_items: { group: "MR-I templates", name: "Hotspot ↔ checklist links", what: "Which checklist items each drawing spot stands for. One spot can cover several items.", where: "Administration → MR Templates → Template builder" },

  mri_reports: { group: "MR-I reports", name: "MR-I reports", what: "One row per MR-I report: unit, component, compliance stage, status (Draft, Submitted, Closed and so on), who did it and when.", where: "Maintenance Report → MR-I" },
  mri_report_header_values: { group: "MR-I reports", name: "Report header answers", what: "What was typed or chosen in the Header step of each report.", where: "Maintenance Report → MR-I → Header" },
  mri_report_checklist_results: { group: "MR-I reports", name: "Report checklist results", what: "The Pass / Fail result, issue details, action taken and closure status for each checklist item on each report.", where: "Maintenance Report → MR-I → Checklist" },
  mri_report_mid_values: { group: "MR-I reports", name: "Report distance / middle answers", what: "What was typed in the middle step (for example kilometres) on each report.", where: "Maintenance Report → MR-I → Distance" },
  mri_report_footer_values: { group: "MR-I reports", name: "Report footer answers", what: "The footer entries on each report, such as dates and the supervisor's name.", where: "Maintenance Report → MR-I → Footer" },
  mri_report_attachments: { group: "MR-I reports", name: "Report photos and files", what: "Photos and files attached to checklist items. The file itself shows here as <binary>.", where: "Maintenance Report → MR-I → Checklist (+ button)" },

  sqlite_sequence: { group: "System", name: "ID counters (system)", what: "The database's own record of the last ID number used in each table. Not business data.", where: "Managed by the database itself" },
};

const GROUP_ORDER = ["Equipment", "MR-I reports", "MR-I templates", "Checklist set-up", "System", "Other"];

function tableInfo(t: string): TableInfo {
  return TABLE_INFO[t] ?? { group: "Other", name: t, what: "No plain-language description yet for this table.", where: "—" };
}


function DataBrowser() {
  const { data: tables = [] } = useBrowsableTables();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const { data: columns = [] } = useTableColumns(selectedTable);
  const { data: rows = [], isLoading } = useTableRows(selectedTable);

  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("");
  // Groups start collapsed; this holds the ones the user has opened.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  useEffect(() => { setOpenGroups(new Set()); }, [groupBy, selectedTable]);
  function toggleGroup(k: string) {
    setOpenGroups((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  const [, setPage] = useState(1);

  function selectTable(t: string) {
    setSelectedTable(t);
    setSearch("");
    setGroupBy("");
    setPage(1);
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

  const displayColumns = columns.slice(0, 6);

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Data Browser</h2>
      <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>
        Look at, search, group and export the data stored on this computer. View only: records cannot be edited or deleted here.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label htmlFor="db-table" style={{ fontSize: 13, fontWeight: 600 }}>Table</label>
        <select
          id="db-table"
          className="neu-select"
          value={selectedTable ?? ""}
          onChange={(e) => e.target.value && selectTable(e.target.value)}
          style={{ minWidth: 320 }}
        >
          <option value="" disabled>Choose a table…</option>
          {GROUP_ORDER.map((g) => {
            const inGroup = tables.filter((t) => tableInfo(t).group === g);
            if (inGroup.length === 0) return null;
            return (
              <optgroup key={g} label={g}>
                {inGroup.map((t) => (
                  <option key={t} value={t}>{tableInfo(t).name} ({t})</option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {selectedTable && (() => {
        const info = tableInfo(selectedTable);
        return (
          <div
            role="note"
            style={{
              marginBottom: 18, padding: "12px 16px", borderRadius: 12, maxWidth: 820,
              background: "var(--accent-soft)", borderLeft: "4px solid var(--accent)",
              fontSize: 13, lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2 }}>
              {info.name} <span style={{ fontFamily: "var(--mono)", fontWeight: 400, fontSize: 11.5, color: "var(--text-soft)" }}>{selectedTable}</span>
            </div>
            <div><b>What it holds:</b> {info.what}</div>
            <div><b>Normally changed in:</b> {info.where}</div>
            {info.caution && <div style={{ color: "var(--warn)", marginTop: 2 }}>⚠ {info.caution}</div>}
          </div>
        );
      })()}

      {!selectedTable ? (
        <div className="empty">Choose a table from the list above to browse its data</div>
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
            {groupBy && (
              <>
                <button className="ghost" onClick={() => setOpenGroups(new Set(grouped.map((g) => g.key ?? "")))}>Expand all</button>
                <button className="ghost" onClick={() => setOpenGroups(new Set())}>Collapse all</button>
              </>
            )}
            <span className="count">{filteredRows.length} of {rows.length} rows{groupBy ? ` · ${grouped.length} groups` : ""}</span>
            <ExportMenu tableName={selectedTable} rows={filteredRows} />
          </div>

          {isLoading ? (
            <div className="empty">Loading...</div>
          ) : filteredRows.length === 0 ? (
            <div className="empty">No rows match your search</div>
          ) : (
            grouped.map((group) => {
              const isOpen = group.key === null || openGroups.has(group.key);
              return (
              <div key={group.key ?? "all"} style={{ marginBottom: group.key === null || isOpen ? 20 : 8 }}>
                {group.key !== null && (
                  <button
                    type="button"
                    className="mri-preview-section-label"
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(group.key!)}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", cursor: "pointer", background: "none", border: "none", padding: "4px 0" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                      style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
                      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {group.key} ({group.rows.length})
                  </button>
                )}
                {isOpen && (
                <div className="grid-table">
                  <div className="grid-row grid-head" style={{ gridTemplateColumns: `repeat(${displayColumns.length}, 1fr)` }}>
                    {displayColumns.map((c) => <span key={c}>{c}</span>)}
                  </div>
                  {group.rows.map((row) => (
                    <div key={row.id} className="grid-row" style={{ gridTemplateColumns: `repeat(${displayColumns.length}, 1fr)` }}>
                      {displayColumns.map((c) => (
                        <span key={c}>{String(row[c] ?? "")}</span>
                      ))}
                    </div>
                  ))}
                </div>
                )}
              </div>
              );
            })
          )}
        </>
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