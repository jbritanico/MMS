import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCurrentUser } from "../lib/currentUser";

// Shared one-page print layout for reports (MR-I reports list, groundwork g-2).
// Opens over the screen as a white A4 sheet with Print / Save as PDF and Close. The sheet is
// paper: white with dark text in every theme, so it prints the same way from Fluent or Holo HUD.
// Long tables continue on the next pages (rows are not split, headers repeat).

export type PrintCell = string | number | boolean | null | undefined;
export type PrintRow = Record<string, PrintCell>;

export const printDate = (d: Date | number = new Date()) =>
  (typeof d === "number" ? new Date(d * 1000) : d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

export function PrintSheet({ eyebrow, title, sub, note, onClose, children, ready = true, tools }: {
  eyebrow: string;
  title: string;
  sub?: string;
  /** Small print at the bottom, e.g. where the numbers come from. */
  note?: string;
  onClose: () => void;
  children: ReactNode;
  /** False while data is still loading: Print waits. */
  ready?: boolean;
  /** Extra controls in the bar (not printed), e.g. a month picker. */
  tools?: ReactNode;
}) {
  const { user } = useCurrentUser();
  return createPortal(
    <div className="ps-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <style>{PS_CSS}</style>
      <div className="ps-bar no-print">
        <strong>{eyebrow}</strong>
        <span style={{ flex: 1 }} />
        {tools}
        <button type="button" className="primary" onClick={() => window.print()} disabled={!ready}>Print / Save as PDF</button>
        <button type="button" className="ghost" onClick={onClose}>Close</button>
      </div>
      <div className="ps-scroll">
        <article className="ps-sheet print-area">
          <header className="ps-head">
            <div>
              <div className="ps-eyebrow">{eyebrow}</div>
              <h1>{title}</h1>
              {sub && <div className="ps-sub">{sub}</div>}
            </div>
            <div className="ps-printed">Printed {printDate()}{user?.name ? ` by ${user.name}` : ""}</div>
          </header>
          {children}
          <footer className="ps-foot">{note ?? `Taken from MMS on ${printDate()}. Figures can change after this page is printed.`}</footer>
        </article>
      </div>
    </div>,
    document.body,
  );
}

/** A plain table from rows of name → value (the same rows the Excel export uses). */
export function PrintTable({ rows, empty = "Nothing to show." }: { rows: PrintRow[]; empty?: string }) {
  if (rows.length === 0) return <p className="ps-empty">{empty}</p>;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const show = (v: PrintCell) => (v == null || v === "" ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "number" ? v.toLocaleString() : v);
  return (
    <table className={`ps-table${cols.length > 7 ? " is-wide" : ""}`}>
      <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{show(r[c])}</td>)}</tr>)}</tbody>
    </table>
  );
}

export const PS_CSS = `
.ps-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(10, 16, 28, .62); display: flex; flex-direction: column; }
.ps-bar { display: flex; align-items: center; gap: 10px; padding: 12px 20px; background: var(--surface, #fff); color: var(--text, #111); border-bottom: 1px solid var(--border, #ddd); }
.ps-scroll { flex: 1; overflow: auto; padding: 24px 16px 40px; }
.ps-sheet { box-sizing: border-box; width: 210mm; max-width: 100%; min-height: 297mm; margin: 0 auto; background: #fff; color: #1b2230; padding: 14mm 14mm 12mm;
  font: 12.5px/1.45 "Segoe UI", system-ui, sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,.35); display: flex; flex-direction: column; gap: 14px; }
.ps-sheet, .ps-sheet * { font-family: "Segoe UI", system-ui, sans-serif !important; text-shadow: none !important; }
.ps-sheet h1 { font-size: 22px; margin: 2px 0; color: #1b2230 !important; text-transform: none; letter-spacing: 0; }
.ps-sheet h2 { font-size: 18px; margin: 0; color: inherit !important; text-transform: none; letter-spacing: 0; }
.ps-sheet h3 { font-size: 13px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .06em; color: #4a5568 !important; }
.ps-sheet section { display: flex; flex-direction: column; }
.ps-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 2px solid #1b2230; padding-bottom: 10px; }
.ps-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #4a5568; }
.ps-sub, .ps-printed { color: #4a5568; font-size: 12px; }
.ps-printed { text-align: right; white-space: nowrap; }
.ps-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.ps-table thead { display: table-header-group; }
.ps-table tr { break-inside: avoid; }
.ps-sheet .ps-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #4a5568 !important; border-bottom: 1px solid #c9d0db; padding: 4px 6px; background: none !important; }
.ps-table th { overflow-wrap: break-word; }
.ps-table td { overflow-wrap: break-word; }
.ps-sheet .ps-table th { letter-spacing: .02em !important; }
.ps-table.is-wide { font-size: 10px; }
.ps-sheet .ps-table.is-wide th { font-size: 9.5px; padding: 3px 4px; text-transform: none; letter-spacing: 0 !important; }
.ps-table.is-wide td { padding: 3px 4px; }
.ps-table td { border-bottom: 1px solid #e3e7ee; padding: 4px 6px; vertical-align: top; color: #1b2230; background: none; }
.ps-table small { color: #4a5568; }
.ps-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.ps-list li { border-left: 3px solid #c77700; padding: 2px 0 2px 10px; display: flex; flex-direction: column; }
.ps-list small { color: #4a5568; }
.ps-empty { margin: 0; color: #4a5568; font-style: italic; }
.ps-foot { margin-top: auto; border-top: 1px solid #c9d0db; padding-top: 8px; font-size: 10.5px; color: #4a5568; }
@page ps-sheet { size: A4; margin: 12mm 0; }
@media print {
  .ps-overlay { position: static; background: none; display: block; }
  .ps-scroll { overflow: visible; padding: 0; }
  .ps-sheet { page: ps-sheet; box-shadow: none; width: 210mm; min-height: auto; margin: 0; padding-top: 0; padding-bottom: 0; }
  .ps-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
