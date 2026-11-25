import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../lib/ipc";
import { useCurrentUser } from "../../lib/currentUser";
import { useMriReportChecklistResults, useSetMriReportChecklistResult, type MriReportChecklistResult } from "./hooks/useMriReportValues";

// FB-024 (RFSM approved): "Other faults". Tier 1 may add a fault that is not on the template's
// checklist and assign its severity. Each one is kept as a fault on this report only, so it
// goes through the same review, repair, history and dashboards as the checklist faults.
// 24 Nov 2026 (Jess): switched off. MR-I is done strictly by the approved checklist template, so
// new Other faults can't be added; faults already recorded on a report are still shown and handled.
const ADDING_ALLOWED = false;

interface OtherFault { template_checklist_item_id: number; description: string }
const SEVERITIES = [
  { id: "Minor", label: "Minor" },
  { id: "Moderate", label: "Moderate" },
  { id: "Critical", label: "Major / Critical" },
] as const;

export default function OtherFaults({ reportId, locked, canRemove }: { reportId: number; locked: boolean; canRemove: boolean }) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const { data: faults = [] } = useQuery({
    queryKey: ["mri-other-faults", reportId],
    queryFn: () => invoke<OtherFault[]>("get_mri_other_faults", { reportId }),
  });
  const { data: results = [] } = useMriReportChecklistResults(reportId);
  const save = useSetMriReportChecklistResult(reportId);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mri-other-faults", reportId] });
    qc.invalidateQueries({ queryKey: ["mri-report-checklist-results", reportId] });
    qc.invalidateQueries({ queryKey: ["mri-report-edit-log", reportId] });
  };
  const add = useMutation({
    mutationFn: (v: { description: string; severity: string; issueDetails: string }) =>
      invoke<number>("add_mri_other_fault", { reportId, ...v, reportedBy: user?.name ?? null }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => invoke<string>("delete_mri_other_fault", { templateChecklistItemId: id }),
    onSuccess: refresh,
  });

  const [desc, setDesc] = useState("");
  const [sev, setSev] = useState("");
  const [what, setWhat] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<number, Partial<MriReportChecklistResult>>>({});

  if (faults.length === 0 && (locked || !ADDING_ALLOWED)) return null;

  const resultOf = (id: number) => ({ ...(results.find((r) => r.template_checklist_item_id === id) ?? null), ...(local[id] ?? {}) }) as MriReportChecklistResult;
  const edit = (id: number, patch: Partial<MriReportChecklistResult>) => setLocal((p) => ({ ...p, [id]: { ...(p[id] ?? {}), ...patch } }));
  async function persist(id: number, patch: Partial<MriReportChecklistResult> = {}) {
    const r = { ...resultOf(id), ...patch };
    if (!r.report_id) return;
    try {
      await save.mutateAsync({ ...r, status: "Fail", reported_by: user?.name ?? r.reported_by ?? null });
      setLocal((p) => { const n = { ...p }; delete n[id]; return n; });
      setMsg(null);
    } catch (err) {
      setMsg(String(err));
    }
  }
  async function addFault() {
    if (!desc.trim() || !sev || !what.trim()) { setMsg("Name the fault, pick how serious it is and say what's wrong."); return; }
    try {
      await add.mutateAsync({ description: desc.trim(), severity: sev, issueDetails: what.trim() });
      setDesc(""); setSev(""); setWhat(""); setMsg(null);
    } catch (err) {
      setMsg(String(err));
    }
  }

  return (
    <div className="ofl" style={{ marginTop: 24 }}>
      <style>{OFL_CSS}</style>
      <h3 className="rk-group-h">Other faults ({faults.length})<small>{ADDING_ALLOWED ? "Faults you found that are not on the checklist. Pick how serious each one is; it follows the same review as the checklist faults." : "Recorded on this report before MR-I was limited to the approved checklist. New faults can't be added here."}</small></h3>
      {faults.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="ofl-table">
            <thead><tr><th>Fault</th><th>How serious</th><th>What's wrong</th><th>What was done</th><th>Fixed?</th>{canRemove && !locked && <th aria-label="Remove" />}</tr></thead>
            <tbody>{faults.map((f) => {
              const r = resultOf(f.template_checklist_item_id);
              const id = f.template_checklist_item_id;
              return (
                <tr key={id}>
                  <td><b>{f.description}</b>{r.reported_by ? <div className="ofl-soft">Added by {r.reported_by}</div> : null}</td>
                  <td>
                    <select className="neu-select" value={r.severity ?? ""} disabled={locked} onChange={(e) => { const v = e.target.value as MriReportChecklistResult["severity"]; edit(id, { severity: v }); persist(id, { severity: v }); }} aria-label={`How serious: ${f.description}`}>
                      {SEVERITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </td>
                  <td><textarea rows={2} className="trigger-input ofl-text" value={r.issue_details ?? ""} disabled={locked} onChange={(e) => edit(id, { issue_details: e.target.value })} onBlur={() => persist(id)} aria-label={`What's wrong: ${f.description}`} /></td>
                  <td><textarea rows={2} className="trigger-input ofl-text" value={r.action_taken ?? ""} disabled={locked} placeholder="Fill in when fixed" onChange={(e) => edit(id, { action_taken: e.target.value })} onBlur={() => persist(id)} aria-label={`What was done: ${f.description}`} /></td>
                  <td>
                    <select className="neu-select" value={r.closure_status ?? "Pending"} disabled={locked} onChange={(e) => persist(id, { closure_status: e.target.value as "Pending" | "Closed" })} aria-label={`Fixed: ${f.description}`}>
                      <option value="Pending">Not yet</option>
                      <option value="Closed">Fixed (closed)</option>
                    </select>
                  </td>
                  {canRemove && !locked && <td><button type="button" className="ghost" onClick={() => remove.mutate(id)} title="Remove this fault (only before the report is sent)">Remove</button></td>}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {ADDING_ALLOWED && !locked && (
        <div className="ofl-add">
          <input type="text" className="trigger-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Fault not on the checklist, e.g. Cracked step on the access ladder" aria-label="Fault not on the checklist" />
          <select className="neu-select" value={sev} onChange={(e) => setSev(e.target.value)} aria-label="How serious">
            <option value="">How serious?</option>
            {SEVERITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <textarea rows={2} className="trigger-input ofl-text" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What's wrong" aria-label="What's wrong" />
          <button type="button" className="primary" onClick={addFault} disabled={add.isPending}>Add fault</button>
        </div>
      )}
      {msg && <div className="toast err" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

const OFL_CSS = `
.ofl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ofl-table th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-soft); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.ofl-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
.ofl-soft { color: var(--text-soft); font-size: 12px; }
.ofl-text { resize: vertical; min-height: 34px; width: 100%; font: inherit; box-sizing: border-box; }
.ofl-add { display: grid; grid-template-columns: minmax(0, 2fr) minmax(140px, auto) minmax(0, 2fr) auto; gap: 8px; align-items: start; margin-top: 12px; }
@media (max-width: 900px) { .ofl-add { grid-template-columns: minmax(0, 1fr); } }
`;
