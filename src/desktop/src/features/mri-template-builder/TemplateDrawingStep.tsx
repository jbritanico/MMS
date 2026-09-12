import { useRef, useState } from "react";
import {
  useTemplateDrawing,
  useSetTemplateDrawing,
  useDeleteTemplateDrawing,
  useTemplateDrawingHotspots,
  useCreateHotspot,
  useUpdateHotspot,
  useDeleteHotspot,
  useSetHotspotChecklistItems,
} from "./hooks/useTemplateDrawing";
import { useTemplateChecklistItems } from "./hooks/useTemplateChecklistItems";
import { useChecklistItems } from "../administration/hooks/useChecklistDatabank";
import { useChecklistSections } from "../administration/hooks/useChecklistSections";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB safety cap for equipment drawings

interface TemplateDrawingStepProps {
  templateId: number;
}

function TemplateDrawingStep({ templateId }: TemplateDrawingStepProps) {
  const { data: drawing } = useTemplateDrawing(templateId);
  const setDrawing = useSetTemplateDrawing(templateId);
  const deleteDrawing = useDeleteTemplateDrawing(templateId);
  const { data: hotspots = [] } = useTemplateDrawingHotspots(templateId);
  const createHotspot = useCreateHotspot(templateId);
  const updateHotspot = useUpdateHotspot(templateId);
  const deleteHotspot = useDeleteHotspot(templateId);
  const setHotspotItems = useSetHotspotChecklistItems(templateId);

  const { data: templateItems = [] } = useTemplateChecklistItems(templateId);
  const { data: databank = [] } = useChecklistItems();
  const { data: sections = [] } = useChecklistSections();

  const severityColor: Record<string, string> = {
    Minor: "#d4ac0d",
    Moderate: "#d97706",
    Critical: "#c0392b",
  };

  function sectionName(sectionId: number | null) {
    return sections.find((s) => s.id === sectionId)?.name ?? "Unassigned";
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [selectedHotspotId, setSelectedHotspotId] = useState<number | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [pendingRemoveDrawing, setPendingRemoveDrawing] = useState(false);
  const [dragState, setDragState] = useState<{ id: number; x: number; y: number } | null>(null);

  function startDrag(e: React.PointerEvent<HTMLButtonElement>, h: (typeof hotspots)[number]) {
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    function clamp(v: number) {
      return Math.min(1, Math.max(0, v));
    }

    function onMove(ev: PointerEvent) {
      if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) moved = true;
      const x = clamp((ev.clientX - rect.left) / rect.width);
      const y = clamp((ev.clientY - rect.top) / rect.height);
      setDragState({ id: h.id, x, y });
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (moved) {
        const x = clamp((ev.clientX - rect.left) / rect.width);
        const y = clamp((ev.clientY - rect.top) / rect.height);
        updateHotspot.mutate({ id: h.id, x, y, label: h.label });
        setDragState(null);
      } else {
        setDragState(null);
        openHotspot(h);
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function itemLabel(ti: (typeof templateItems)[number]) {
    return databank.find((d) => d.id === ti.checklist_item_id)?.description ?? "Checklist item";
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("Image is too large (max 5MB)");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      setDrawing.mutate(dataUrl);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!placing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    createHotspot.mutate(
      { x, y, label: null, displayOrder: hotspots.length },
      {
        onSuccess: (id) => {
          setPlacing(false);
          setSelectedHotspotId(id);
          setLabelDraft("");
        },
      }
    );
  }

  const selectedHotspot = hotspots.find((h) => h.id === selectedHotspotId) ?? null;

  // Exclude items already linked to a *different* hotspot — a checklist item can only belong to one hotspot at a time.
  const availableItems = selectedHotspot
    ? templateItems.filter(
        (ti) =>
          selectedHotspot.checklist_item_ids.includes(ti.id) ||
          !hotspots.some((h) => h.id !== selectedHotspot.id && h.checklist_item_ids.includes(ti.id))
      )
    : [];

  function openHotspot(h: (typeof hotspots)[number]) {
    setSelectedHotspotId(h.id);
    setLabelDraft(h.label ?? "");
  }

  function saveLabel() {
    if (!selectedHotspot) return;
    updateHotspot.mutate({
      id: selectedHotspot.id,
      x: selectedHotspot.x,
      y: selectedHotspot.y,
      label: labelDraft.trim() || null,
    });
  }

  function toggleHotspotItem(templateChecklistItemId: number) {
    if (!selectedHotspot) return;
    const current = new Set(selectedHotspot.checklist_item_ids);
    if (current.has(templateChecklistItemId)) current.delete(templateChecklistItemId);
    else current.add(templateChecklistItemId);
    setHotspotItems.mutate({ hotspotId: selectedHotspot.id, checklistItemIds: Array.from(current) });
  }

  function removeHotspot(id: number) {
    deleteHotspot.mutate(id);
    if (selectedHotspotId === id) setSelectedHotspotId(null);
  }

  if (!drawing) {
    return (
      <div>
        <h2>Equipment Drawing</h2>
        <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
          Upload a drawing of this equipment. Once uploaded, you can place hotspots on it and link each one to
          checklist items — this drawing then appears in MR-I Reporting as an alternate view of the checklist.
        </p>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        <button className="primary" onClick={() => fileInputRef.current?.click()}>Upload drawing</button>
        {error && <div className="toast err" style={{ marginTop: 12, maxWidth: 400 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2>Equipment Drawing</h2>
          <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
            Click "Add hotspot", then click a spot on the drawing. Click an existing hotspot to link it to checklist items.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={placing ? "primary" : "ghost"} onClick={() => setPlacing((v) => !v)}>
            {placing ? "Click the drawing…" : "+ Add hotspot"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          <button className="ghost" onClick={() => fileInputRef.current?.click()}>Replace drawing</button>
          <button className="ghost" style={{ color: "var(--danger)" }} onClick={() => setPendingRemoveDrawing(true)}>
            Remove drawing
          </button>
        </div>
      </div>

      {error && <div className="toast err" style={{ marginBottom: 12, maxWidth: 400 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: selectedHotspot ? "1fr 320px" : "1fr", gap: 16 }}>
        <div
          ref={containerRef}
          style={{
            position: "relative", borderRadius: 16, overflow: "hidden",
            background: "#000",
            boxShadow: "inset 3px 3px 8px var(--neu-shadow-dark), inset -3px -3px 8px var(--neu-shadow-light)",
            cursor: placing ? "crosshair" : "default",
          }}
        >
          <img
            src={drawing.image_data}
            alt="Equipment drawing"
            onClick={handleImageClick}
            style={{ display: "block", width: "100%", height: "auto" }}
          />
          {hotspots.map((h, i) => {
            const pos = dragState && dragState.id === h.id ? dragState : h;
            return (
              <button
                key={h.id}
                onPointerDown={(e) => startDrag(e, h)}
                title={h.label ?? `Hotspot ${i + 1}`}
                style={{
                  position: "absolute",
                  left: `${pos.x * 100}%`,
                  top: `${pos.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: 28, height: 28, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, color: "#fff",
                  background: h.checklist_item_ids.length > 0 ? "var(--accent)" : "rgba(255,255,255,0.25)",
                  border: selectedHotspotId === h.id ? "2px solid #fff" : "2px solid rgba(255,255,255,0.6)",
                  boxShadow: "0 0 0 2px rgba(0,0,0,0.4)",
                  cursor: dragState?.id === h.id ? "grabbing" : "grab",
                  touchAction: "none",
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {selectedHotspot && (
          <div className="panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Hotspot #{hotspots.findIndex((h) => h.id === selectedHotspot.id) + 1}</h3>
              <button className="icon-btn" aria-label="Close" onClick={() => setSelectedHotspotId(null)}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="field">
              <label>Label (optional)</label>
              <input
                type="text"
                className="trigger-input"
                value={labelDraft}
                placeholder="e.g. Injector Head Assembly"
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={saveLabel}
                onKeyDown={(e) => e.key === "Enter" && saveLabel()}
              />
            </div>

            <div className="field">
              <label>Linked checklist items</label>
              {templateItems.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-soft)" }}>Add checklist items to this template first.</p>
              ) : availableItems.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-soft)" }}>
                  All checklist items are already linked to another hotspot.
                </p>
              ) : (
                <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {availableItems.map((ti) => (
                    <label key={ti.id} className="check" style={{ fontSize: 13, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={selectedHotspot.checklist_item_ids.includes(ti.id)}
                        onChange={() => toggleHotspotItem(ti.id)}
                      />
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span>{itemLabel(ti)}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-soft)" }}>
                          <span>{sectionName(ti.section_id)}</span>
                          {ti.severity && (
                            <span
                              style={{
                                fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                                color: "#fff", background: severityColor[ti.severity] ?? "var(--text-soft)",
                              }}
                            >
                              {ti.severity}
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button className="danger" style={{ width: "100%", marginTop: 8 }} onClick={() => removeHotspot(selectedHotspot.id)}>
              Delete hotspot
            </button>
          </div>
        )}
      </div>

      {pendingRemoveDrawing && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18A2 2 0 0 0 3.54 21H20.46A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3>Remove drawing?</h3>
            <p>This will delete the drawing and all its hotspots. MR-I Reporting for this template will fall back to the standard list view.</p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setPendingRemoveDrawing(false)}>Cancel</button>
              <button
                className="danger"
                onClick={() => {
                  deleteDrawing.mutate();
                  setSelectedHotspotId(null);
                  setPendingRemoveDrawing(false);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TemplateDrawingStep;