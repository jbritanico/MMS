import { useEffect, useRef, useState } from "react";
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
import { useChecklistItems } from "../administration/hooks/useChecklistDataBank";
import { useChecklistSections } from "../administration/hooks/useChecklistSections";
import {
  useMidFieldCatalog,
  useTemplateMidFields,
  useAddTemplateMidField,
  useRemoveTemplateMidField,
} from "./hooks/useTemplateMidFields";
import {
  useFooterFieldCatalog,
  useTemplateFooterFields,
  useAddTemplateFooterField,
  useRemoveTemplateFooterField,
} from "./hooks/useTemplateFooterFields";
import TemplateComponentsStep from "./TemplateComponentsStep";
import { useCurrentUser } from "../../lib/currentUser";
import TemplatePreview from "./TemplatePreview";
import TemplateDrawingStep from "./TemplateDrawingStep";
import { HINT_STEPS, SIGN_OFF_LABELS, type HintStep, type TemplateHints } from "./templateHints";
import { useTemplateHints } from "./useTemplateHints";
import { IsoSlab, IsoStepBar, StepIntro, TIG_CSS, type BarStep } from "./TemplateIsoGuide";

type Step = "header" | "components" | "checklist" | "drawing" | "mid" | "footer" | "review";

// Option B: plain step names, with the original term kept underneath for people who know the old names.
const STEPS: (BarStep & { id: Step; title: string; explain: string; todo: string[] })[] = [
  { id: "header", name: "Report details", tech: "Header Fields", title: "What goes at the top of the report?",
    explain: "These are the boxes at the top of every report for this unit — like the country, client and engine hours. Pick the ones this unit needs.",
    todo: ["Click a field on the left to put it on the report", "Use the arrows to change the order", "Tick “Must be filled” for the ones that can't be skipped"] },
  { id: "components", name: "Parts of the unit", tech: "Components · optional", title: "Is this unit checked in parts?",
    explain: "Only needed when one unit has parts that are inspected separately, like a Left and Right pump. Most units don't — just click Next.",
    todo: ["Skip this step if the unit is checked as one piece", "Or click “+ Add Left & Right” in one go", "Switch a part off instead of deleting it if it has history"] },
  { id: "checklist", name: "Things to check", tech: "Checklist", title: "What should the inspector check?",
    explain: "Pick the checks from the Checklist Bank. Then tell us, for each one, which group it belongs to and how serious it is if it fails.",
    todo: ["Click checks in the bank to add them", "Pick a group and “how serious” for each one", "Orange rows still need an answer"] },
  { id: "drawing", name: "Picture of the unit", tech: "Drawing · optional", title: "Add a picture with tap points",
    explain: "Optional. Upload a picture of the unit and put numbered points on it. Inspectors can then tap a point to see the checks for that spot.",
    todo: ["Upload a picture of the unit (or skip)", "Click “+ Add point”, then click the picture", "Tick the checks that belong to each point"] },
  { id: "mid", name: "Distance travelled", tech: "Mid-Section", title: "Does this unit need distance readings?",
    explain: "The kilometre readings taken before and after the job. Tick them if this unit is driven or towed.",
    todo: ["Tick both readings if the unit is driven or towed", "Leave them unticked for units that don't move"] },
  { id: "footer", name: "Sign-off", tech: "Footer", title: "What goes at the end of the report?",
    explain: "The last part of the report: remarks, yes/no checks like Green Tagged, and the signatures of the operator and supervisor.",
    todo: ["Keep Operator and Supervisor ticked — they are the sign-off", "Add the yes/no answers this unit needs", "Remarks is free text for anything else"] },
  { id: "review", name: "Check and save", tech: "Review & Save", title: "Check everything, then save",
    explain: "Here's a summary of every step. Anything orange is worth a look before you save.",
    todo: ["Green rows look complete, grey rows were skipped", "Click “Take a look” or “Open” to jump back to a step", "Click “Save Template” when you're happy"] },
];

const STEP_NAMES = Object.fromEntries(STEPS.filter((s) => s.id !== "review").map((s) => [s.id, s.name])) as Record<HintStep, string>;

interface TemplateBuilderProps {
  templateId: number;
  templateName: string;
  onBack: () => void;
}

function TemplateBuilder({ templateId, templateName, onBack }: TemplateBuilderProps) {
  const [step, setStep] = useState<Step>("header");
  const [previewOpen, setPreviewOpen] = useState(false);
  const { user: currentUser } = useCurrentUser();
  const hints = useTemplateHints(templateId);
  const currentIndex = STEPS.findIndex((s) => s.id === step);
  const cur = STEPS[currentIndex];
  const next = STEPS[currentIndex + 1];

  function goNext() {
    if (currentIndex < STEPS.length - 1) setStep(STEPS[currentIndex + 1].id);
  }
  function goBack() {
    if (currentIndex > 0) setStep(STEPS[currentIndex - 1].id);
  }

  return (
    <div className="tig">
      <style>{TIG_CSS + TB_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>
          ← Back to templates
        </button>
      </div>

      <div className="header">
        <h1>{templateName}</h1>
        <span className="sub">template id #{templateId} · draft</span>
      </div>

      <IsoStepBar steps={STEPS} current={step} hints={hints} onPick={(id) => setStep(id as Step)} />

      <div className="panel" style={{ minHeight: 320, marginTop: 14 }}>
        <div className="tb-step-row">
          <div className="tb-step-head">
            <span className="tb-eyebrow">Step {currentIndex + 1} of {STEPS.length} · {cur.tech}</span>
            <h2 className="tb-title">{cur.title}</h2>
          </div>
          <button type="button" className="ghost tb-preview-btn" onClick={() => setPreviewOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Preview the report
          </button>
        </div>
        <StepIntro current={step} explain={cur.explain} todo={cur.todo} hints={hints} stepNames={STEP_NAMES} />
        <div style={{ marginTop: 18 }}>
          {step === "header" && <HeaderFieldsStep templateId={templateId} />}
          {step === "components" && (
            <TemplateComponentsStep
              templateId={templateId}
              canEdit
              createdBy={currentUser?.email ?? currentUser?.name ?? "Unknown user"}
            />
          )}
          {step === "checklist" && <ChecklistStep templateId={templateId} />}
          {step === "drawing" && <TemplateDrawingStep templateId={templateId} />}
          {step === "mid" && <MidFieldsStep templateId={templateId} />}
          {step === "footer" && <FooterFieldsStep templateId={templateId} />}
          {step === "review" && <ReviewStep hints={hints} onOpen={(id) => setStep(id)} />}
        </div>
      </div>

      <div className="actions" style={{ marginTop: 16 }}>
        <button className="ghost" onClick={goBack} disabled={currentIndex === 0}>← Back</button>
        <button className="ghost" onClick={() => setPreviewOpen(true)}>Preview the report</button>
        {step !== "review" ? (
          <button className="primary" onClick={goNext}>Next: {next.name} →</button>
        ) : (
          <button className="primary" onClick={onBack}>Save Template</button>
        )}
      </div>

      {previewOpen && (
        <PreviewPopup templateId={templateId} templateName={templateName} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

// The live preview opens as a popup, so nobody has to scroll down past the step to see the report.
function PreviewPopup({ templateId, templateName, onClose }: { templateId: number; templateName: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); before?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-overlay tb-preview-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tb-preview-pop" role="dialog" aria-modal="true" aria-labelledby="tb-preview-title">
        <div className="tb-preview-top">
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <strong id="tb-preview-title" style={{ fontSize: 17 }}>What the inspector will see</strong>
            <span style={{ fontSize: 12.5, color: "var(--tig-soft)" }}>Updates as you change the template. Press Esc or click outside to close.</span>
          </div>
          <button ref={closeRef} type="button" className="icon-btn" aria-label="Close preview" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="tb-preview-body">
          <TemplatePreview templateId={templateId} templateName={templateName} />
        </div>
      </div>
    </div>
  );
}

// Step 7 · Check and save: a summary of every step. Display only — saving works exactly as before.
function ReviewStep({ hints, onOpen }: { hints: TemplateHints; onOpen: (step: Step) => void }) {
  const STATE_TEXT = { ok: "Looks complete", look: "Worth a look", skip: "Skipped (optional)" } as const;
  const n = hints.lookCount;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="tb-review-wrap">
        <table className="tb-review">
          <thead>
            <tr><th scope="col">Step</th><th scope="col">What's on it</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Open</span></th></tr>
          </thead>
          <tbody>
            {HINT_STEPS.map((id) => {
              const h = hints.steps[id];
              const st = STEPS.find((s) => s.id === id)!;
              return (
                <tr key={id}>
                  <td>
                    <div className="tb-review-step">
                      <IsoSlab state={h.state} size={34} className="tig-mini" />
                      <span><strong>{st.name}</strong><span className="tb-review-tech">{st.tech}</span></span>
                    </div>
                  </td>
                  <td>{h.summary}</td>
                  <td>
                    <span className={`tb-tag${h.state === "ok" ? " is-on" : h.state === "look" ? " is-look" : " is-skip"}`}>{STATE_TEXT[h.state]}</span>
                    {h.message && <div className="tb-review-msg">{h.message}</div>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className={h.state === "look" ? "primary" : "ghost"} onClick={() => onOpen(id)}>
                      {h.state === "look" ? "Take a look" : "Open"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={`tb-review-bar${n ? " is-look" : " is-ok"}`} role="status">
        <strong>{n ? `${n} ${n === 1 ? "thing is" : "things are"} worth a look` : "Everything looks complete"}</strong>
        <span>{n ? "You can still save now and come back later — these are only reminders." : "Click “Save Template” below when you're happy."}</span>
      </div>
    </div>
  );
}

// Builder-only styles (Option B). Colours come from the theme variables set in TIG_CSS.
const TB_CSS = `
.tb-step-head { display: flex; flex-direction: column; gap: 4px; }
.tb-step-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.tb-preview-btn { display: inline-flex; align-items: center; gap: 8px; }
.tb-preview-pop { width: min(1100px, 94vw); max-height: 90vh; display: flex; flex-direction: column; border-radius: 18px; overflow: hidden;
  background: var(--neu-bg, var(--surface, #fff)); color: var(--tig-ink); box-shadow: 0 30px 80px -20px rgba(0,0,0,.45);
  animation: tb-pop-in .3s cubic-bezier(.34,1.56,.64,1) both; }
.tb-preview-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--tig-soft) 20%, transparent); }
.tb-preview-body { overflow: auto; padding: 0 20px 20px; }
.tb-preview-body > .panel { margin-top: 16px !important; box-shadow: none; }
.tb-preview-body > .panel > h2:first-child, .tb-preview-body > .panel > h2:first-child + p { display: none; }
@keyframes tb-pop-in { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .tb-preview-pop { animation: none; } }
.tb-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--tig-soft); }
.tig .panel h2.tb-title { font-size: 22px !important; font-weight: 700 !important; text-transform: none !important; letter-spacing: 0 !important; color: var(--tig-ink) !important; margin: 0 !important; }
.tig .checklist-item-controls { grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) auto; }
.tb-search { width: 100%; margin-bottom: 12px; }
.tb-tag { font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px; white-space: nowrap; background: var(--tig-blue-soft); color: var(--tig-blue); }
.tb-tag.is-on { background: var(--tig-ok-soft); color: var(--tig-ok); }
.tb-tag.is-look { background: var(--tig-look-soft); color: var(--tig-look); }
.tb-num { display: inline-block; min-width: 24px; font-size: 12px; font-weight: 700; color: var(--tig-soft); }
.card.tb-needs { border: 1.5px solid var(--tig-look) !important; background: var(--tig-look-soft) !important; }
.tb-field-label { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; font-weight: 600; color: var(--tig-soft); }
select.tb-missing { border-color: var(--tig-look) !important; }
.tb-group-h { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--tig-soft); margin: 0 0 6px; }
.tb-group-h.is-look { color: var(--tig-look); }
.tb-ticks { display: flex; flex-direction: column; gap: 8px; }
.tb-tick { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 10px; cursor: pointer;
  border: 1.5px solid color-mix(in srgb, var(--tig-soft) 25%, transparent); }
.tb-tick.is-on { border-color: var(--tig-blue); background: var(--tig-blue-soft); }
.tb-tick input { margin-top: 3px; }
.tb-tick-name { font-size: 15px; font-weight: 600; color: var(--tig-ink); }
.tb-tick-hint { font-size: 12.5px; color: var(--tig-soft); }
.tb-tag.is-skip { background: color-mix(in srgb, var(--tig-soft) 14%, transparent); color: var(--tig-soft); }
.tb-review-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--tig-soft) 25%, transparent); }
.tb-review { width: 100%; border-collapse: collapse; font-size: 14px; color: var(--tig-ink); }
.tb-review th { text-align: left; padding: 12px 16px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--tig-soft);
  background: color-mix(in srgb, var(--tig-soft) 8%, transparent); }
.tb-review td { padding: 12px 16px; border-top: 1px solid color-mix(in srgb, var(--tig-soft) 18%, transparent); vertical-align: middle; }
.tb-review-step { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.tb-review-step > span { display: flex; flex-direction: column; }
.tb-review-tech { font-size: 11.5px; color: var(--tig-soft); }
.tb-review-msg { margin-top: 5px; font-size: 13px; color: var(--tig-look); font-weight: 600; }
.tb-review-bar { display: flex; flex-direction: column; gap: 4px; padding: 14px 18px; border-radius: 14px; font-size: 14px; }
.tb-review-bar strong { font-size: 16px; }
.tb-review-bar.is-look { background: var(--tig-look-soft); color: var(--tig-ink); }
.tb-review-bar.is-ok { background: var(--tig-ok-soft); color: var(--tig-ink); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.tb-know { display: flex; flex-direction: column; gap: 10px; font-size: 14px; line-height: 1.5; color: var(--tig-ink); }
`;

function HeaderFieldsStep({ templateId }: { templateId: number }) {
  const { data: catalog = [] } = useHeaderFieldCatalog();
  const { data: templateFields = [] } = useTemplateHeaderFields(templateId);
  const addField = useAddTemplateHeaderField(templateId);
  const removeField = useRemoveTemplateHeaderField(templateId);
  const updateField = useUpdateTemplateHeaderField(templateId);

  const selectedIds = new Set(templateFields.map((f) => f.header_field_id));
  const sortedTemplateFields = [...templateFields].sort((a, b) => a.display_order - b.display_order);
  const [q, setQ] = useState("");
  const shownCatalog = catalog.filter((c) => !q.trim() || c.label.toLowerCase().includes(q.trim().toLowerCase()));

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
      <div className="panel panel-flat">
        <h2>Pick what goes at the top ({catalog.length})</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 12 }}>
          Click a field to put it on the report. Click it again to take it off.
        </p>
        <input type="search" className="search tb-search" aria-label="Find a field" placeholder="Find a field, e.g. hours, client…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="cards" style={{ maxHeight: 440, overflowY: "auto" }}>
          {shownCatalog.length === 0 && <div className="empty">No field matches “{q}”</div>}
          {shownCatalog.map((f) => {
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
                  <span className={`tb-tag${isSelected ? " is-on" : ""}`}>{isSelected ? "✓ On report" : "+ Add"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel panel-flat">
        <h2>On this report ({sortedTemplateFields.length})</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 12 }}>
          Shown in this order. Tick “Must be filled” if the inspector can't skip it.
        </p>
        {sortedTemplateFields.length === 0 ? (
          <div className="empty">Nothing on the report yet — click a field on the left</div>
        ) : (
          <div className="cards" style={{ maxHeight: 440, overflowY: "auto" }}>
            {sortedTemplateFields.map((tf, i) => (
              <div key={tf.id} className="card" style={{ cursor: "default" }}>
                <div className="card-main">
                  <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}><span className="tb-num">{i + 1}.</span>{fieldName(tf.header_field_id)}</div>
                  <div className="meta">
                    <label className="check" style={{ fontSize: 12 }}>
                      <input type="checkbox" checked={tf.required} onChange={() => toggleRequired(tf)} /> Must be filled
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
  const noGroup = templateItems.filter((t) => t.section_id == null).length;
  const noSev = templateItems.filter((t) => !t.severity).length;
  const lookText = [noGroup ? `${noGroup} without a group` : "", noSev ? `${noSev} without “how serious”` : ""].filter(Boolean).join(" · ");

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
    const ordered: { sectionId: number | null; sectionLabel: string; items: TemplateChecklistItem[] }[] = sections
      .filter((s) => groups.has(s.id))
      .map((s) => ({ sectionId: s.id, sectionLabel: s.name, items: groups.get(s.id)! }));
    if (groups.has(null)) {
      ordered.push({ sectionId: null, sectionLabel: "No group yet", items: groups.get(null)! });
    }
    return ordered;
  })();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div className="panel panel-flat">
        <h2>Checklist Bank (MR-I)</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 12 }}>
          Click a check to add it. Faded ones are already on this template.
        </p>
        <input
          type="text"
          className="search"
          placeholder="Find by code or words, e.g. leak, valve…"
          aria-label="Find a check"
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
                    <span className={`tb-tag${isSelected ? " is-on" : ""}`}>{isSelected ? "✓ Added" : "+ Add"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel panel-flat">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ flexGrow: 1 }}>On this template ({sortedTemplateItems.length})</h2>
          {lookText && <span className="tb-tag is-look">{lookText}</span>}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 12 }}>
          For each check, choose its group (where it shows on the report) and how serious a failure is. Orange rows still need an answer.
        </p>
        {sortedTemplateItems.length === 0 ? (
          <div className="empty">No checks yet — click checks in the bank on the left</div>
        ) : (
          <div style={{ maxHeight: 440, overflowY: "auto" }}>
            {groupedSections.map(({ sectionId, sectionLabel, items }) => (
              <div key={sectionId ?? "none"} style={{ marginBottom: 18 }}>
                <div className={`tb-group-h${sectionId == null ? " is-look" : ""}`}>{sectionLabel} · {items.length}</div>
                <div className="cards">
                  {items.map((ti) => {
                    const globalIdx = sortedTemplateItems.findIndex((t) => t.id === ti.id);
                    const info = itemInfo(ti.checklist_item_id);
                    return (
                      <div key={ti.id} className={`card${ti.section_id == null || !ti.severity ? " tb-needs" : ""}`} style={{ cursor: "default", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8 }}>                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
                        <div className="checklist-item-controls">
                          <select
                            className={`trigger-input${ti.section_id == null ? " tb-missing" : ""}`}
                            aria-label="Group"
                            value={ti.section_id ?? ""}
                            onChange={(e) => setSection(ti, e.target.value)}
                          >
                            <option value="">Choose a group…</option>
                            {sections.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <select
                            className={`trigger-input${!ti.severity ? " tb-missing" : ""}`}
                            aria-label="If it fails, how serious?"
                            value={ti.severity ?? ""}
                            onChange={(e) => setSeverity(ti, e.target.value)}
                          >
                            <option value="">If it fails, how serious?</option>
                            <option value="Minor">Minor — can wait</option>
                            <option value="Moderate">Moderate — fix soon</option>
                            <option value="Critical">Major / Critical — stop unit</option>
                          </select>
                          <label className="check checklist-required-check">
                            <input type="checkbox" checked={ti.required} onChange={() => toggleRequired(ti)} /> Must be answered
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

function MidFieldsStep({ templateId }: { templateId: number }) {
  const { data: catalog = [] } = useMidFieldCatalog();
  const { data: templateFields = [] } = useTemplateMidFields(templateId);
  const addField = useAddTemplateMidField(templateId);
  const removeField = useRemoveTemplateMidField(templateId);

  const selectedIds = new Set(templateFields.map((f) => f.mid_field_id));

  async function toggleField(catalogId: number) {
    if (selectedIds.has(catalogId)) {
      const tf = templateFields.find((f) => f.mid_field_id === catalogId);
      if (tf) await removeField.mutateAsync(tf.id);
    } else {
      await addField.mutateAsync({ midFieldId: catalogId, displayOrder: templateFields.length });
    }
  }

  return (
    <div>
      <div className="panel panel-flat" style={{ maxWidth: 620 }}>
        <h2>Tick the readings this unit needs</h2>
        <div className="tb-ticks">
          {catalog.map((f) => {
            const isSelected = selectedIds.has(f.id);
            return (
              <label key={f.id} className={`tb-tick${isSelected ? " is-on" : ""}`}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleField(f.id)} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="tb-tick-name">{f.label}</span>
                  {MID_HINTS[f.label] && <span className="tb-tick-hint">{MID_HINTS[f.label]}</span>}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const MID_HINTS: Record<string, string> = {
  "Distance Travelled Pre-Job (KM)": "Odometer reading before the job",
  "Distance Travelled Post-Job (KM)": "Odometer reading after the job",
};

const FOOTER_HINTS: Record<string, string> = {
  Remarks: "Free text", Cleaned: "Yes / No", "Green Tagged": "Yes / No — ready for service", "Job Ready": "Yes / No",
  "Pressure Tested": "Yes / No", "Function Tested": "Yes / No", Operator: "Who did the inspection (sign-off)",
  "Operator Date": "Date of the inspector's sign-off", Supervisor: "Who approves (sign-off)", "Supervisor Date": "Date of approval",
};

function FooterFieldsStep({ templateId }: { templateId: number }) {
  const { data: catalog = [] } = useFooterFieldCatalog();
  const { data: templateFields = [] } = useTemplateFooterFields(templateId);
  const addField = useAddTemplateFooterField(templateId);
  const removeField = useRemoveTemplateFooterField(templateId);

  const selectedIds = new Set(templateFields.map((f) => f.footer_field_id));
  const selectedLabels = new Set(catalog.filter((c) => selectedIds.has(c.id)).map((c) => c.label.trim().toLowerCase()));
  const missingSign = SIGN_OFF_LABELS.filter((l) => !selectedLabels.has(l.toLowerCase()));

  async function toggleField(catalogId: number) {
    if (selectedIds.has(catalogId)) {
      const tf = templateFields.find((f) => f.footer_field_id === catalogId);
      if (tf) await removeField.mutateAsync(tf.id);
    } else {
      await addField.mutateAsync({ footerFieldId: catalogId, displayOrder: templateFields.length });
    }
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
        <div className="panel panel-flat">
          <h2>Tick what goes at the end of the report</h2>
          <div className="tb-ticks">
            {catalog.map((f) => {
              const isSelected = selectedIds.has(f.id);
              return (
                <label key={f.id} className={`tb-tick${isSelected ? " is-on" : ""}`}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleField(f.id)} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="tb-tick-name">{f.label}</span>
                    {FOOTER_HINTS[f.label] && <span className="tb-tick-hint">{FOOTER_HINTS[f.label]}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="panel panel-flat">
          <h2>Good to know</h2>
          <div className="tb-know">
            {missingSign.length > 0 && (
              <div className="tig-hint" role="status">
                {missingSign.join(" and ")} {missingSign.length > 1 ? "are" : "is"} not ticked, so the report won't have {missingSign.length > 1 ? "those sign-off lines" : "that sign-off line"}.
              </div>
            )}
            <span><strong>Operator / Supervisor</strong> and their dates are the sign-off at the end of the report.</span>
            <span><strong>Green Tagged / Job Ready</strong> are the yes/no answers that say if the unit can go to work.</span>
            <span><strong>Remarks</strong> is free text for anything else.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TemplateBuilder;