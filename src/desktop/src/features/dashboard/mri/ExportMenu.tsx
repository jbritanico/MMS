import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { periodRange, ymd, type DashboardFilters } from "../hooks/useMriDashboards";

// Export button shared by every MR-I dashboard: the data on screen as Excel (one sheet per
// table, plus a "Filters" sheet) or as one JSON file. Files go to the Downloads folder,
// the same way as the Data Browser export.

export type ExportRow = Record<string, string | number | boolean | null>;
export interface ExportTable {
  /** Sheet name in Excel / key in JSON. Keep under 31 characters. */
  name: string;
  rows: ExportRow[];
}

interface Props {
  dashboardNo: number;
  title: string;
  filters: DashboardFilters;
  /** Built when the button is pressed, so it is always the data currently on screen. */
  tables: () => ExportTable[];
  /** Say so in the file when the period filter does not apply to this dashboard. */
  periodApplies?: boolean;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();

export default function ExportMenu({ dashboardNo, title, filters, tables, periodApplies = true }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);

  function filterRows(): ExportRow[] {
    const r = periodRange(filters);
    return [
      { Setting: "Dashboard", Value: `${dashboardNo}. ${title}` },
      { Setting: "Period", Value: periodApplies ? r.label : `${r.label} (not used: this dashboard shows the situation now)` },
      { Setting: "Country", Value: filters.country || "All countries" },
      { Setting: "Service line", Value: filters.serviceLine || "All service lines" },
      { Setting: "Equipment type", Value: filters.equipmentType || "All equipment types" },
      { Setting: "Exported at", Value: new Date().toLocaleString() },
    ];
  }

  const base = () => safe(`MR-I Dashboard ${dashboardNo} - ${title} - ${ymd(new Date())}`);

  function exportXlsx() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filterRows()), "Filters");
    const used = new Set<string>(["Filters"]);
    for (const t of tables()) {
      let name = safe(t.name).slice(0, 31) || "Sheet";
      for (let i = 2; used.has(name); i++) name = `${safe(t.name).slice(0, 28)} ${i}`;
      used.add(name);
      const ws = t.rows.length ? XLSX.utils.json_to_sheet(t.rows) : XLSX.utils.aoa_to_sheet([["No rows"]]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, `${base()}.xlsx`);
    setOpen(false);
  }

  function exportJson() {
    const r = periodRange(filters);
    const payload = {
      dashboard: { no: dashboardNo, title },
      exported_at: new Date().toISOString(),
      filters: {
        period: periodApplies ? { kind: filters.kind, label: r.label, from: ymd(r.from), to_exclusive: ymd(r.to) } : null,
        country: filters.country || null,
        service_line: filters.serviceLine || null,
        equipment_type: filters.equipmentType || null,
      },
      data: Object.fromEntries(tables().map((t) => [t.name, t.rows])),
    };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${base()}.json`);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="mrid-export">
      <button type="button" className="ghost" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        ⤓ Export
      </button>
      {open && (
        <div className="combobox-panel mrid-export-menu" role="menu">
          <div className="combobox-option" role="menuitem" onClick={exportXlsx}>Excel (.xlsx)</div>
          <div className="combobox-option" role="menuitem" onClick={exportJson}>JSON (.json)</div>
        </div>
      )}
    </div>
  );
}
