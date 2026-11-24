import { useState } from "react";
import { TIER_GUIDE, rolesForJobTitle, roleWithTier } from "../../lib/roles";

// Which role does a new person get? Job titles per tier from Clarification 4 (Mr. Kamil,
// 23 Nov 2026; CL4-1). Pick a job title to see the tier and the role(s) to choose.

const CSS = `
.rg { margin: 0 0 18px; border: 1px solid var(--border, #dde3ea); border-radius: 12px; background: var(--surface, #fff); }
.rg > summary { cursor: pointer; padding: 10px 14px; font-weight: 600; font-size: 13.5px; list-style: none; display: flex; gap: 8px; align-items: center; }
.rg > summary::-webkit-details-marker { display: none; }
.rg > summary::before { content: "+"; color: var(--accent-blue, #2f6fed); font-weight: 700; width: 12px; }
.rg[open] > summary::before { content: "−"; }
.rg-body { padding: 0 14px 14px; display: grid; gap: 12px; }
.rg-pick { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 13px; }
.rg-ans { font-size: 13px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.rg-note { font-size: 12.5px; color: var(--text-soft); flex-basis: 100%; }
.rg-table-wrap { overflow-x: auto; }
.rg-table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
.rg-table th, .rg-table td { border-bottom: 1px solid var(--border, #e6eaf0); padding: 6px 8px; text-align: left; vertical-align: top; }
.rg-table th { font-weight: 600; color: var(--text-soft); }
.rg-src { font-size: 11.5px; color: var(--text-soft); }
`;

export default function RoleGuide({ onPick }: { onPick: (role: string) => void }) {
  const [title, setTitle] = useState("");
  const ans = title ? rolesForJobTitle(title) : null;
  return (
    <details className="rg">
      <style>{CSS}</style>
      <summary>Which role? Find it by job title</summary>
      <div className="rg-body">
        <label className="rg-pick">
          Job title
          <select className="neu-select" style={{ width: "auto", minWidth: 280 }} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Job title">
            <option value="">Pick a job title…</option>
            {TIER_GUIDE.map((g) => (
              <optgroup key={g.tier} label={g.tier}>
                {g.titles.map((t) => <option key={t} value={t}>{t}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {ans && (
          <div className="rg-ans">
            <span><b>{ans.tier}</b>. Role{ans.roles.length > 1 ? "s" : ""}:</span>
            {ans.roles.map((r) => (
              <button key={r} type="button" className="ghost" style={{ padding: "5px 10px", fontSize: 12.5 }} onClick={() => onPick(r)} title="Use this role for the new person">
                {roleWithTier(r)}
              </button>
            ))}
            {ans.note && <span className="rg-note">{ans.note}</span>}
          </div>
        )}
        <div className="rg-table-wrap">
          <table className="rg-table">
            <thead><tr><th>Tier</th><th>MMS role</th><th>What they can do</th><th>Job titles</th></tr></thead>
            <tbody>
              {TIER_GUIDE.map((g) => (
                <tr key={g.tier}>
                  <td><b>{g.tier}</b></td>
                  <td>{g.roles.map(roleWithTier).join(", ")}</td>
                  <td>{g.rights}</td>
                  <td>{g.titles.join(", ")}</td>
                </tr>
              ))}
              <tr><td><b>Tier 0</b></td><td>{roleWithTier("Administrator")}</td><td>Every permission, no restriction: users, lists, templates, data tools, and any report, fault, repair or template. Not offered as a named reviewer. Its deletions and changes are logged.</td><td>IT staff</td></tr>
            </tbody>
          </table>
        </div>
        <span className="rg-src">From Mr. Kamil's tier table (Clarification 4, 23 Nov 2026); Tier 4 from the MR-I template approval workflow (24 Nov 2026).</span>
      </div>
    </details>
  );
}
