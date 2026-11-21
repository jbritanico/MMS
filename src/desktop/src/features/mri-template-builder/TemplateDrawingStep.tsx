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
import { useChecklistItems } from "../administration/hooks/useChecklistDataBank";
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
  const [pendingClearPoints, setPendingClearPoints] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
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

  // One point per check at most: the number of points can't be more than the number of checks on the template.
  const maxPoints = templateItems.length;
  const pointsLeft = Math.max(0, maxPoints - hotspots.length);
  const atLimit = pointsLeft === 0;
  const overBy = Math.max(0, hotspots.length - maxPoints);

  function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!placing) return;
    if (atLimit) { setPlacing(false); return; }
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

  // Clear all points: deletes each point one by one with the same delete used by "Delete this point".
  // The picture stays; only the points (and the checks ticked on them) are removed.
  async function clearAllHotspots() {
    setClearing(true);
    setClearError(null);
    setPlacing(false);
    setSelectedHotspotId(null);
    try {
      for (const h of hotspots) await deleteHotspot.mutateAsync(h.id);
      setPendingClearPoints(false);
    } catch (err) {
      setClearError(`Some points could not be cleared: ${String(err)}`);
    } finally {
      setClearing(false);
    }
  }

  function removeHotspot(id: number) {
    deleteHotspot.mutate(id);
    if (selectedHotspotId === id) setSelectedHotspotId(null);
  }

  if (!drawing) {
    return (
      <div>
        <h2>No picture yet</h2>
        <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
          Upload a picture or drawing of the unit. You can then put numbered points on it and tick the checks that belong
          to each point. Inspectors will see it in MR-I Reporting as another way to find the checks. Skip this step if you don't have one.
        </p>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        <button className="primary" onClick={() => fileInputRef.current?.click()}>Upload a picture</button>
        {error && <div className="toast err" style={{ marginTop: 12, maxWidth: 400 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2>Picture of the unit</h2>
          <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
            Click “+ Add point”, then click the picture. Click a numbered point to choose its checks. Drag a point to move it.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={placing ? "primary" : "ghost"}
            onClick={() => setPlacing((v) => !v)}
            disabled={atLimit && !placing}
            title={atLimit ? (maxPoints === 0 ? "Add checks in “Things to check” first" : "Every check already has a point") : undefined}
          >
            {placing ? "Now click the picture…" : "+ Add point"}
          </button>
          <button
            className="ghost"
            onClick={() => { setClearError(null); setPendingClearPoints(true); }}
            disabled={hotspots.length === 0 || clearing}
            title={hotspots.length === 0 ? "There are no points to clear" : "Delete every point on the picture (the picture stays)"}
          >
            {clearing ? "Clearing…" : `Clear all points${hotspots.length ? ` (${hotspots.length})` : ""}`}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          <button className="ghost" onClick={() => fileInputRef.current?.click()}>Replace picture</button>
          <button className="ghost" style={{ color: "var(--danger)" }} onClick={() => setPendingRemoveDrawing(true)}>
            Remove picture
          </button>
        </div>
      </div>

      <div className={`tig-hint${maxPoints === 0 || overBy > 0 ? "" : atLimit ? " is-ok" : " is-info"}`} role="status" style={{ marginBottom: 12, maxWidth: 640 }}>
        {maxPoints === 0
          ? "Add checks in “Things to check” first — you can place one point per check."
          : overBy > 0
            ? `${hotspots.length} points for ${maxPoints} ${maxPoints === 1 ? "check" : "checks"}: delete ${overBy} ${overBy === 1 ? "point" : "points"} so there's no more than one point per check.`
            : atLimit
              ? `All ${maxPoints} points used — one for each check.`
              : `${hotspots.length} of ${maxPoints} points used. You can add ${pointsLeft} more (one point per check).`}
      </div>

      {error && <div className="toast err" style={{ marginBottom: 12, maxWidth: 400 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: selectedHotspot ? "1fr 320px" : "1fr", gap: 16 }}>
        <div
          ref={containerRef}
          style={{
            position: "relative", borderRadius: 16, overflow: "hidden",
            background: "#000",
            boxShadow: "var(--neu-inset-deep)",
            cursor: placing ? "crosshair" : "default",
          }}
        >
          <img
            src={drawing.image_data}
            alt="Picture of the unit"
            onClick={handleImageClick}
            style={{ display: "block", width: "100%", height: "auto" }}
          />
          {hotspots.map((h, i) => {
            const pos = dragState && dragState.id === h.id ? dragState : h;
            return (
              <button
                key={h.id}
                onPointerDown={(e) => startDrag(e, h)}
                title={h.label ?? `Point ${i + 1}`}
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
              <h3 style={{ margin: 0 }}>Point {hotspots.findIndex((h) => h.id === selectedHotspot.id) + 1}</h3>
              <button className="icon-btn" aria-label="Close" onClick={() => setSelectedHotspotId(null)}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="field">
              <label>Name (optional)</label>
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
              <label>Which checks are at this point?</label>
              {templateItems.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-soft)" }}>Add checks in “Things to check” first.</p>
              ) : availableItems.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-soft)" }}>
                  Every check is already linked to another point.
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
                                color: "var(--on-status)", background: severityColor[ti.severity] ?? "var(--text-soft)",
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
              Delete this point
            </button>
          </div>
        )}
      </div>

      {pendingClearPoints && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18A2 2 0 0 0 3.54 21H20.46A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3>Clear all {hotspots.length} points?</h3>
            <p>
              This deletes every point on the picture and the checks ticked on them. The picture stays, so you can add
              points again — up to {maxPoints} ({maxPoints === 1 ? "one check" : `one for each of the ${maxPoints} checks`}).
            </p>
            {clearError && <div className="toast err" style={{ margin: "8px 0" }}>{clearError}</div>}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setPendingClearPoints(false)} disabled={clearing}>Cancel</button>
              <button className="danger" onClick={clearAllHotspots} disabled={clearing}>
                {clearing ? "Clearing…" : "Clear all points"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRemoveDrawing && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18A2 2 0 0 0 3.54 21H20.46A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3>Remove picture?</h3>
            <p>This deletes the picture and all its points. Inspectors will see the normal list of checks instead.</p>
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