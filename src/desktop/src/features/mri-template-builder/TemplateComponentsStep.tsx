import { useState } from "react";
import {
  useTemplateComponents,
  useCreateTemplateComponent,
  useRenameTemplateComponent,
  useSetTemplateComponentActive,
  useDeleteTemplateComponent,
  type TemplateComponent,
} from "./hooks/useTemplateComponents";
import { useLookups } from "../administration/hooks/useLookups";

interface TemplateComponentsStepProps {
  templateId: number;
  canEdit: boolean;
  createdBy: string;
}

// Defines the positional components this template covers (Left / Right, Front / Rear, ...).
// Every asset using the template keeps one Asset Code; each component is inspected and
// reported on its own with this shared template. Suggested names come from the lookup
// criteria COMPONENT POSITION, but any label can be typed.
function TemplateComponentsStep({ templateId, canEdit, createdBy }: TemplateComponentsStepProps) {
  const { data: components = [] } = useTemplateComponents(templateId);
  const { data: positionOptions = [] } = useLookups("COMPONENT POSITION");
  const createComponent = useCreateTemplateComponent();
  const renameComponent = useRenameTemplateComponent();
  const setActive = useSetTemplateComponentActive();
  const deleteComponent = useDeleteTemplateComponent();

  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 3500);
  }

  async function add(label: string) {
    const value = label.trim();
    if (!value) return;
    try {
      await createComponent.mutateAsync({ templateId, label: value, createdBy });
      setNewLabel("");
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function addLeftRight() {
    for (const label of ["Left", "Right"]) {
      if (components.some((c) => c.label.toLowerCase() === label.toLowerCase())) continue;
      try {
        await createComponent.mutateAsync({ templateId, label, createdBy });
      } catch (err) {
        flash(String(err), "err");
        return;
      }
    }
  }

  async function saveRename(c: TemplateComponent) {
    try {
      await renameComponent.mutateAsync({ id: c.id, label: editLabel });
      setEditingId(null);
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function toggle(c: TemplateComponent) {
    try {
      await setActive.mutateAsync({ id: c.id, active: !c.active });
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function remove(c: TemplateComponent) {
    try {
      await deleteComponent.mutateAsync(c.id);
    } catch (err) {
      flash(String(err), "err");
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "start" }}>
    <div className="panel panel-flat">
      <h2>Parts inspected one by one ({components.length})</h2>

      {components.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 8 }}>No parts — each report covers the whole unit. That's fine for most units.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {components.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {editingId === c.id ? (
                <>
                  <input
                    type="text"
                    className="trigger-input"
                    value={editLabel}
                    autoFocus
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(c);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{ width: 160 }}
                  />
                  <button className="ghost" onClick={() => saveRename(c)}>Save</button>
                  <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 600, minWidth: 100, opacity: c.active ? 1 : 0.55 }}>{c.label}</span>
                  <span className={`pill ${c.active ? "active" : "inactive"}`}>{c.active ? "In use" : "Switched off"}</span>
                  {canEdit && (
                    <>
                      <button className="ghost" onClick={() => { setEditingId(c.id); setEditLabel(c.label); }}>Rename</button>
                      <button className="ghost" onClick={() => toggle(c)}>{c.active ? "Switch off" : "Switch on"}</button>
                      <button className="ghost" onClick={() => remove(c)}>Delete</button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            className="trigger-input"
            list="component-position-options"
            placeholder="e.g. Left, Rear, Top"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add(newLabel)}
            style={{ width: 180 }}
          />
          <datalist id="component-position-options">
            {positionOptions.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          <button className="ghost" onClick={() => add(newLabel)}>+ Add part</button>
          {components.length === 0 && <button className="ghost" onClick={addLeftRight}>+ Add Left &amp; Right</button>}
        </div>
      )}
      {status && <div className={`toast ${status.kind}`} style={{ marginTop: 8 }}>{status.msg}</div>}
    </div>
    <div className="panel panel-flat">
      <h2>When do I need this?</h2>
      <div className="tb-know">
        <span><strong>Use it</strong> when one unit (one Asset Code) has two or more parts that are checked separately — for example a <em>Left</em> and <em>Right</em> pump, or <em>Front</em> and <em>Rear</em>.</span>
        <span><strong>Then</strong> the person starting a report picks the part, and findings, faults, attachments and history are kept per part.</span>
        <span><strong>Skip it</strong> if the report covers the whole unit — nothing changes for those templates. Just click Next.</span>
      </div>
    </div>
    </div>
  );
}

export default TemplateComponentsStep;
