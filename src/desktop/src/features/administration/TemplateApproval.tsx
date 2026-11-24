import { useState } from "react";
import type { MriTemplate, TemplateApprovalEntry, TemplateTask } from "./hooks/useMriTemplates";
import { useTemplateApprovalLog } from "./hooks/useMriTemplates";

// TPL-2 (MR-I template approval, agreed with Mr. Kamil 24 Nov 2026): the words, the action
// dialog, the history and the "waiting for you" list used by the MR-I templates screen.

export const APPROVAL_WORDS: Record<string, string> = {
  Draft: "Draft",
  Submitted: "Waiting for FSM",
  Endorsed: "Waiting for Regional approval",
  Approved: "Approved",
};

/** Plain state of a template, combining the approval step and whether it is in use. */
export function templateState(t: MriTemplate): { label: string; tone: "active" | "inactive" | "neutral" | "warn" } {
  if (t.superseded_by) return { label: "Replaced", tone: "inactive" };
  if (t.approval === "Approved") return t.status === "Active" ? { label: "In use", tone: "active" } : { label: "Not in use", tone: "inactive" };
  if (t.approval === "Submitted") return { label: "With FSM", tone: "warn" };
  if (t.approval === "Endorsed") return { label: "With Regional", tone: "warn" };
  return { label: t.revision_of ? "Draft change" : "Draft", tone: "neutral" };
}

export const canChangeContent = (t: MriTemplate) => t.approval === "Draft" && t.status !== "Active" && !t.superseded_by;

export type ApprovalAction = "submit" | "endorse" | "reject" | "approve";
const ACTION_TEXT: Record<ApprovalAction, { title: string; button: string; noteLabel: string; required: boolean; tone: string }> = {
  submit: { title: "Send for review", button: "Send to the FSM", noteLabel: "Note for the reviewer (optional)", required: false, tone: "primary" },
  endorse: { title: "Endorse this template", button: "Endorse", noteLabel: "Remark (optional)", required: false, tone: "primary" },
  reject: { title: "Send back for changes", button: "Send back", noteLabel: "What needs to change (required)", required: true, tone: "danger" },
  approve: { title: "Approve and put in use", button: "Approve", noteLabel: "Remark (optional)", required: false, tone: "primary" },
};

export function ApprovalActionModal({ action, template, busy, onCancel, onConfirm }: {
  action: ApprovalAction; template: MriTemplate; busy: boolean; onCancel: () => void; onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const t = ACTION_TEXT[action];
  const extra = action === "approve" && template.revision_of
    ? "This version replaces the version in use now. Reports already made keep the version they were made with."
    : action === "approve" ? "The template is put in use for its kind of unit." : action === "submit"
      ? "The template is locked while it is reviewed. The Maintenance Manager / FSM endorses it, then the Regional Maintenance Manager approves it." : "";
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.title}>
        <h3>{t.title}</h3>
        <p><strong>{template.template_name}</strong>{template.version > 1 ? ` · version ${template.version}` : ""}</p>
        {extra && <p style={{ fontSize: 13, color: "var(--text-soft)" }}>{extra}</p>}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t.noteLabel}</label>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", resize: "vertical" }} autoFocus />
        </div>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={t.tone} disabled={busy || (t.required && !note.trim())} onClick={() => onConfirm(note)}>{t.button}</button>
        </div>
      </div>
    </div>
  );
}

const WHEN = (s: string) => { const n = Number(s); const d = new Date(Number.isFinite(n) ? n * 1000 : s); return isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

export function ApprovalHistoryModal({ template, onClose }: { template: MriTemplate; onClose: () => void }) {
  const { data: log = [], isLoading } = useTemplateApprovalLog(template.id);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620, width: "100%" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Approval history">
        <h3>Approval history</h3>
        <p><strong>{template.template_name}</strong>{template.version > 1 ? ` · version ${template.version}` : ""} · {templateState(template).label}</p>
        {isLoading ? <p>Loading…</p> : log.length === 0 ? <p style={{ color: "var(--text-soft)" }}>Nothing recorded yet.</p> : (
          <div style={{ overflowX: "auto", maxHeight: 360 }}>
            <table className="ta-table">
              <thead><tr><th>When</th><th>What</th><th>Who</th><th>Remark</th></tr></thead>
              <tbody>{log.map((e: TemplateApprovalEntry) => (
                <tr key={e.id}><td>{WHEN(e.at)}</td><td>{e.action}{e.template_id !== template.id ? " (earlier version)" : ""}</td><td>{e.by_name ?? "—"}</td><td>{e.note ?? ""}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="modal-actions"><button className="ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

const TASK_WORDS: Record<string, string> = { endorse: "To endorse", approve: "To approve", sent_back: "Sent back to you" };

export function TemplateTasksPanel({ tasks, onOpen }: { tasks: TemplateTask[]; onOpen: (templateId: number) => void }) {
  if (!tasks.length) return null;
  return (
    <div className="ta-tasks">
      <b>MR-I templates waiting for you ({tasks.length})</b>
      <ul>{tasks.map((t) => (
        <li key={`${t.template_id}-${t.kind}`}>
          <span className={`pill ${t.kind === "sent_back" ? "inactive" : "neutral"}`}>{TASK_WORDS[t.kind]}</span>
          <button type="button" className="ta-link" onClick={() => onOpen(t.template_id)}>{t.template_name}{t.version > 1 ? ` · v${t.version}` : ""}</button>
          {t.last_by && <span className="ta-soft">{t.kind === "sent_back" ? "by" : "from"} {t.last_by}{t.last_at ? `, ${WHEN(t.last_at)}` : ""}</span>}
          {t.kind === "sent_back" && t.last_note && <span className="ta-soft">“{t.last_note}”</span>}
        </li>
      ))}</ul>
    </div>
  );
}

export const TA_CSS = `
.ta-tasks { margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); border-left: 4px solid var(--accent-blue, #2f6fed); background: var(--surface); font-size: 13px; }
.ta-tasks ul { margin: 6px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.ta-tasks li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ta-soft { color: var(--text-soft); font-size: 12.5px; }
.ta-tasks .ta-link { all: unset; cursor: pointer; font-weight: 600; color: var(--accent-blue, #2f6fed) !important; background: none !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
.ta-tasks .ta-link:hover { text-decoration: underline; }
.ta-table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
.ta-table th, .ta-table td { border-bottom: 1px solid var(--border); padding: 6px 8px; text-align: left; vertical-align: top; }
.ta-table th { color: var(--text-soft); font-weight: 600; }
.pill.warn { background: color-mix(in srgb, var(--warn, #b45309) 14%, transparent); color: var(--warn, #b45309); }
.mt-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.mt-actions button { padding: 5px 10px !important; font-size: 12px !important; }
.mt-ver { font-size: 11.5px; font-weight: 700; color: var(--text-soft); margin-left: 6px; }
`;
