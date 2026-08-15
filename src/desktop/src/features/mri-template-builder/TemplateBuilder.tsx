import { useState } from "react";
import {
  useHeaderFieldCatalog,
  useTemplateHeaderFields,
  useAddTemplateHeaderField,
  useRemoveTemplateHeaderField,
  useUpdateTemplateHeaderField,
  type TemplateHeaderField,
} from "./hooks/useTemplateHeaderFields";
import {
  useTemplateChecklistItems,
  useAddTemplateChecklistItem,
  useRemoveTemplateChecklistItem,
  useUpdateTemplateChecklistItem,
  type TemplateChecklistItem,
} from "./hooks/useTemplateChecklistItems";
import { useChecklistItems } from "../administration/hooks/useChecklistDatabank";
import { useChecklistSections } from "../administration/hooks/useChecklistSections";
import TemplatePreview from "./TemplatePreview";

type Step = "header" | "checklist" | "mid" | "footer" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "header", label: "Header Fields" },
  { id: "checklist", label: "Checklist" },
  { id: "mid", label: "Mid-Section" },
  { id: "footer", label: "Footer" },
  { id: "review", label: "Review & Save" },
];

interface TemplateBuilderProps {
  templateId: number;
  templateName: string;
  onBack: () => void;
}

function TemplateBuilder({ templateId, templateName, onBack }: TemplateBuilderProps) {
  const [step, setStep] = useState<Step>("header");
  const currentIndex = STEPS.findIndex((s) => s.id === step);

  function goNext() {
    if (currentIndex < STEPS.length - 1) setStep(STEPS[currentIndex + 1].id);
  }
  function goBack() {
    if (currentIndex > 0) setStep(STEPS[currentIndex - 1].id);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>
          ← Back to templates
        </button>
      </div>

      <div className="header">
        <h1>{templateName}</h1>
        <span className="sub">template id #{templateId} · draft</span>
      </div>

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={s.id} className={`wizard-step ${i === currentIndex ? "active" : ""} ${i < currentIndex ? "done" : ""}`}>
            <span className="wizard-step-dot">{i < currentIndex ? "✓" : i + 1}</span>
            <span className="wizard-step-label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="panel" style={{ minHeight: 320 }}>
        {step === "header" && <HeaderFieldsStep templateId={templateId} />}
        {step === "checklist" && <ChecklistStep templateId={templateId} />}
        {step === "mid" && <div className="empty">Mid-section field configuration goes here</div>}
        {step === "footer" && <div className="empty">Footer field configuration goes here</div>}
        {step === "review" && <div className="empty">Review & save goes here</div>}
      </div>

      <div className="actions" style={{ marginTop: 16 }}>
        <button className="ghost" onClick={goBack} disabled={currentIndex === 0}>← Previous</button>
        {step !== "review" ? (
          <button className="primary" onClick={goNext}>Next →</button>
        ) : (
          <button className="primary">Save Template</button>
        )}
      </div>

      <TemplatePreview templateId={templateId} templateName={templateName} />
    </div>
  );
}

function HeaderFieldsStep({ templateId }: { templateId: number }) {
  const { data: catalog = [] } = useHeaderFieldCatalog();
  const { data: templateFields = [] } = useTemplateHeaderFields(templateId);
  const addField = useAddTemplateHeaderField(templateId);
  const removeField = useRemoveTemplateHeaderField(templateId);
  const updateField = useUpdateTemplateHeaderField(templateId);

  const selectedIds = new Set(templateFields.map((f) => f.header_field_id));
  const sortedTemplateFields = [...templateFields].sort((a, b) => a.display_order - b.display_order);

  function fieldName(headerFieldId: number) {
    return catalog.find((c) => c.id === headerFieldId)?.label ?? "—";
  }

  async function toggleField(catalogId: number) {
    if (selectedIds.has(catalogId)) {
      const tf = templateFields.find((f) => f.header_field_id === catalogId);
      if (tf) await removeField.mutateAsync(tf.id);
    } else {
      await addField.mutateAsync({ headerFieldId: catalogId, displayOrder: templateFields.length });
    }
  }

  async function toggleRequired(tf: TemplateHeaderField) {
    await updateField.mutateAsync({ ...tf, required: !tf.required });
  }

  async function moveField(tf: TemplateHeaderField, direction: -1 | 1) {
    const idx = sortedTemplateFields.findIndex((f) => f.id === tf.id);
    const swapWith = sortedTemplateFields[idx + direction];
    if (!swapWith) return;
    await updateField.mutateAsync({ ...tf, display_order: swapWith.display_order });
    await updateField.mutateAsync({ ...swapWith, display_order: tf.display_order });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div className="panel" style={{ boxShadow: "none", border: "1px solid var(--border)", padding: 18 }}>
        <h2>Available header fields</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 12 }}>
          Click a field to add it to this template.
        </p>
        <div className="cards" style={{ maxHeight: 440, overflowY: "auto" }}>
          {catalog.map((f) => {
            const isSelected = selectedIds.has(f.id);
            return (
              <div
                key={f.id}
                className="card"
                onClick={() => toggleField(f.id)}
                style={isSelected ? { opacity: 0.4, cursor: "pointer" } : { cursor: "pointer" }}
              >
                <div className="card-main">
                  <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{f.label}</div>
                </div>
                <div className="card-actions">
                  <span className={`pill ${isSelected ? "active" : "neutral"}`}>{isSelected ? "Added" : "Add"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ boxShadow: "none", border: "1px solid var(--border)", padding: 18 }}>
        <h2>Selected for this template ({sortedTemplateFields.length})</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 12 }}>
          Reorder and mark fields required as they'll appear on the MR-I form.
        </p>
        {sortedTemplateFields.length === 0 ? (
          <div className="empty">No header fields selected yet</div>
        ) : (
          <div className="cards" style={{ maxHeight: 440, overflowY: "auto" }}>
            {sortedTemplateFields.map((tf, i) => (
              <div key={tf.id} className="card" style={{ cursor: "default" }}>
                <div className="card-main">
                  <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{fieldName(tf.header_field_id)}</div>
                  <div className="meta">
                    <label className="check" style={{ fontSize: 12 }}>
                      <input type="checkbox" checked={tf.required} onChange={() => toggleRequired(tf)} /> Required
                    </label>
                  </div>
                </div>
                <div className="card-actions">
                  <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => moveField(tf, -1)}>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button className="icon-btn" aria-label="Move down" disabled={i === sortedTemplateFields.length - 1} onClick={() => moveField(tf, 1)}>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button className="icon-btn icon-danger" aria-label="Remove" onClick={() => removeField.mutateAsync(tf.id)}>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistStep({ templateId }: { templateId: number }) {
  const { data: databank = [] } = useChecklistItems();
  const { data: sections = [] } = useChecklistSections();
  const { data: templateItems = [] } = useTemplateChecklistItems(templateId);
  const addItem = useAddTemplateChecklistItem(templateId);
  const removeItem = useRemoveTemplateChecklistItem(templateId);
  const updateItem = useUpdateTemplateChecklistItem(templateId);

  const [query, setQuery] = useState("");

  const mriItems = databank.filter((d) => d.level === "MR-I" && d.active);
  const selectedIds = new Set(templateItems.map((t) => t.checklist_item_id));
  const sortedTemplateItems = [...templateItems].sort((a, b) => a.display_order - b.display_order);

  const filteredAvailable = mriItems.filter(
    (d) => d.code.toLowerCase().includes(query.toLowerCase()) || d.description.toLowerCase().includes(query.toLowerCase())
  );

  function itemInfo(checklistItemId: number) {
    return databank.find((d) => d.id === checklistItemId);
  }

  async function toggleItem(itemId: number) {
    if (selectedIds.has(itemId)) {
      const ti = templateItems.find((t) => t.checklist_item_id === itemId);
      if (ti) await removeItem.mutateAsync(ti.id);
    } else {
      await addItem.mutateAsync({ checklistItemId: itemId, displayOrder: templateItems.length });
    }
  }

  async function toggleRequired(ti: TemplateChecklistItem) {
    await updateItem.mutateAsync({ ...ti, required: !ti.required });
  }

  async function setSection(ti: TemplateChecklistItem, sectionId: string) {
    await updateItem.mutateAsync({ ...ti, section_id: sectionId ? Number(sectionId) : null });
  }

  async function setSeverity(ti: TemplateChecklistItem, severity: string) {
    await updateItem.mutateAsync({ ...ti, severity: (severity || null) as any });
  }

  async function moveItem(ti: TemplateChecklistItem, direction: -1 | 1) {
    const idx = sortedTemplateItems.findIndex((t) => t.id === ti.id);
    const swapWith = sortedTemplateItems[idx + direction];
    if (!swapWith) return;
    await updateItem.mutateAsync({ ...ti, display_order: swapWith.display_order });
    await updateItem.mutateAsync({ ...swapWith, display_order: ti.display_order });
  }

  const groupedSections = (() => {
    const groups = new Map<number | null, TemplateChecklistItem[]>();
    for (const ti of sortedTemplateItems) {
      const key = ti.section_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ti);
    }
    const ordered = sections
      .filter((s) => groups.has(s.id))
      .map((s) => ({ sectionId: s.id, sectionLabel: s.name, items: groups.get(s.id)! }));
    if (groups.has(null)) {
      ordered.push({ sectionId: null, sectionLabel: "Unassigned", items: groups.get(null)! });
    }
    return ordered;
  })();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div className="panel" style={{ boxShadow: "none", border: "1px solid var(--border)", padding: 18 }}>
        <h2>Checklist databank (MR-I)</h2>
        <input
          type="text"
          className="search"
          placeholder="Search by code or description..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "100%", marginBottom: 12 }}
        />
        {mriItems.length === 0 ? (
          <div className="empty">No MR-I checklist items in the databank yet — add some under References → Checklist Bank</div>
        ) : (
          <div className="cards" style={{ maxHeight: 400, overflowY: "auto" }}>
            {filteredAvailable.map((d) => {
              const isSelected = selectedIds.has(d.id);
              return (
                <div
                  key={d.id}
                  className="card"
                  onClick={() => toggleItem(d.id)}
                  style={isSelected ? { opacity: 0.4, cursor: "pointer" } : { cursor: "pointer" }}
                >
                  <div className="card-main">
                    <div className="code">{d.code}</div>
                    <div className="desc">{d.description}</div>
                  </div>
                  <div className="card-actions">
                    <span className={`pill ${isSelected ? "active" : "neutral"}`}>{isSelected ? "Added" : "Add"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel" style={{ boxShadow: "none", border: "1px solid var(--border)", padding: 18 }}>
        <h2>Selected for this template ({sortedTemplateItems.length})</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 12 }}>
          Assign a section, mark required, and reorder. Items are grouped by section below.
        </p>
        {sortedTemplateItems.length === 0 ? (
          <div className="empty">No checklist items selected yet</div>
        ) : (
          <div style={{ maxHeight: 440, overflowY: "auto" }}>
            {groupedSections.map(({ sectionId, sectionLabel, items }) => (
              <div key={sectionId ?? "none"} style={{ marginBottom: 18 }}>
                <div className="mri-preview-section-label" style={{ fontSize: 11 }}>{sectionLabel}</div>
                <div className="cards">
                  {items.map((ti) => {
                    const globalIdx = sortedTemplateItems.findIndex((t) => t.id === ti.id);
                    const info = itemInfo(ti.checklist_item_id);
                    return (
                      <div key={ti.id} className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div className="card-main">
                            <div className="code">{info?.code}</div>
                            <div className="desc">{info?.description}</div>
                          </div>
                          <div className="card-actions">
                            <button className="icon-btn" aria-label="Move up" disabled={globalIdx === 0} onClick={() => moveItem(ti, -1)}>
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button className="icon-btn" aria-label="Move down" disabled={globalIdx === sortedTemplateItems.length - 1} onClick={() => moveItem(ti, 1)}>
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button className="icon-btn icon-danger" aria-label="Remove" onClick={() => removeItem.mutateAsync(ti.id)}>
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <select
                            className="trigger-input"
                            value={ti.section_id ?? ""}
                            onChange={(e) => setSection(ti, e.target.value)}
                            style={{ flex: 1, minWidth: 130 }}
                          >
                            <option value="">— No section —</option>
                            {sections.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <select
                            className="trigger-input"
                            value={ti.severity ?? ""}
                            onChange={(e) => setSeverity(ti, e.target.value)}
                            style={{ flex: 1, minWidth: 130 }}
                          >
                            <option value="">— Severity —</option>
                            <option value="Minor">Minor</option>
                            <option value="Moderate">Moderate</option>
                            <option value="Major">Major</option>
                            <option value="Critical">Critical</option>
                          </select>
                          <label className="check" style={{ fontSize: 12 }}>
                            <input type="checkbox" checked={ti.required} onChange={() => toggleRequired(ti)} /> Required
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>    </div>
  );
}

export default TemplateBuilder;