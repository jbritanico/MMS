import { useHeaderFieldCatalog, useTemplateHeaderFields } from "./hooks/useTemplateHeaderFields";
import { useTemplateChecklistItems } from "./hooks/useTemplateChecklistItems";
import { useChecklistItems } from "../administration/hooks/useChecklistDataBank";
import { useChecklistSections } from "../administration/hooks/useChecklistSections";
import { useMidFieldCatalog, useTemplateMidFields } from "./hooks/useTemplateMidFields";
import { useFooterFieldCatalog, useTemplateFooterFields } from "./hooks/useTemplateFooterFields";
import { useTemplateDrawing, useTemplateDrawingHotspots } from "./hooks/useTemplateDrawing";

interface TemplatePreviewProps {
  templateId: number;
  templateName: string;
}

function TemplatePreview({ templateId, templateName }: TemplatePreviewProps) {
  const { data: catalog = [] } = useHeaderFieldCatalog();
  const { data: templateFields = [] } = useTemplateHeaderFields(templateId);

  const { data: databank = [] } = useChecklistItems();
  const { data: sections = [] } = useChecklistSections();
  const { data: templateChecklist = [] } = useTemplateChecklistItems(templateId);
  const { data: midCatalog = [] } = useMidFieldCatalog();
  const { data: templateMidFields = [] } = useTemplateMidFields(templateId);
  const { data: footerCatalog = [] } = useFooterFieldCatalog();
  const { data: templateFooterFields = [] } = useTemplateFooterFields(templateId);
  const { data: drawing } = useTemplateDrawing(templateId);
  const { data: hotspots = [] } = useTemplateDrawingHotspots(templateId);
  const sortedHotspots = [...hotspots].sort((a, b) => a.display_order - b.display_order);

  const STATUS_FIELDS = ["Cleaned", "Green Tagged", "Job Ready", "Pressure Tested", "Function Tested"];

  const sortedFields = [...templateFields].sort((a, b) => a.display_order - b.display_order);
  const sortedChecklist = [...templateChecklist].sort((a, b) => a.display_order - b.display_order);

  function fieldName(headerFieldId: number) {
    return catalog.find((c) => c.id === headerFieldId)?.label ?? "—";
  }
  function checklistInfo(checklistItemId: number) {
    return databank.find((d) => d.id === checklistItemId);
  }

  const checklistGroups = (() => {
    const groups = new Map<number | null, typeof sortedChecklist>();
    for (const ti of sortedChecklist) {
      const key = ti.section_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ti);
    }
    const ordered = sections
      .filter((s) => groups.has(s.id))
      .map((s) => ({ label: s.name, items: groups.get(s.id)! }));
    if (groups.has(null)) ordered.push({ label: "Unassigned", items: groups.get(null)! });
    return ordered;
  })();

  const severityColor: Record<string, string> = {
    Minor: "#d4ac0d",
    Moderate: "#d97706",
    Critical: "#c0392b",
  };

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h2>Live preview</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 16 }}>
        Updates automatically as you configure this template.
      </p>

      <div className="mri-preview-form">
        <div className="mri-preview-title">{templateName}</div>
        <div className="mri-preview-section-label">Header</div>

        {sortedFields.length === 0 ? (
          <div className="empty">No header fields configured yet</div>
        ) : (
          <div className="mri-preview-table">
            {sortedFields.map((tf) => (
              <div key={tf.id} className="mri-preview-table-row">
                <label>
                  {fieldName(tf.header_field_id)}
                  {tf.required && <span style={{ color: "var(--danger)" }}> *</span>}
                </label>
                <div className="mri-preview-input" />
              </div>
            ))}
          </div>
        )}

        <div className="mri-preview-section-label" style={{ marginTop: 20 }}>Checklist</div>

        {sortedChecklist.length === 0 ? (
          <div className="empty">No checklist items configured yet</div>
        ) : (
          checklistGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-soft)", marginBottom: 8 }}>
                {group.label}
              </div>
              <div className="mri-checklist-table">
                <div className="mri-checklist-row mri-checklist-head">
                  <span>Checklist Item</span>
                  <span>Issue Details</span>
                  <span>Action Taken</span>
                  <span>Severity</span>
                  <span>Date Observed</span>
                  <span>Status</span>
                </div>
                {group.items.map((ti) => {
                  const info = checklistInfo(ti.checklist_item_id);
                  return (
                    <div key={ti.id} className="mri-checklist-row">
                      <span>
                        {info?.description}
                        {ti.required && <span style={{ color: "var(--danger)" }}> *</span>}
                      </span>
                      <span className="mri-preview-input" style={{ height: 26 }} />
                      <span className="mri-preview-input" style={{ height: 26 }} />
                      <span>
                        {ti.severity ? (
                          <span
                            style={{
                              fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                              color: "#fff", background: severityColor[ti.severity] ?? "var(--text-soft)",
                            }}
                          >
                            {ti.severity}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-soft)" }}>—</span>
                        )}
                      </span>
                      <span className="mri-preview-input" style={{ height: 26 }} />
                      <span style={{ fontSize: 11, color: "var(--text-soft)", fontStyle: "italic" }}>Pending</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {drawing && (
          <>
            <div className="mri-preview-section-label" style={{ marginTop: 20 }}>Equipment Drawing</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
              <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000" }}>
                <img
                  src={drawing.image_data}
                  alt="Equipment drawing"
                  style={{ display: "block", width: "100%", height: "auto" }}
                />
                {sortedHotspots.map((h, i) => (
                  <div
                    key={h.id}
                    title={h.label ?? `Hotspot ${i + 1}`}
                    style={{
                      position: "absolute",
                      left: `${h.x * 100}%`,
                      top: `${h.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                      width: 24, height: 24, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: "#fff",
                      background: h.checklist_item_ids.length > 0 ? "var(--accent)" : "rgba(255,255,255,0.3)",
                      border: "2px solid rgba(255,255,255,0.7)",
                      boxShadow: "0 0 0 2px rgba(0,0,0,0.4)",
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-soft)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  Legend
                </div>
                {sortedHotspots.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--text-soft)" }}>No hotspots placed yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                    {sortedHotspots.map((h, i) => {
                      const linkedLabels = templateChecklist
                        .filter((ti) => h.checklist_item_ids.includes(ti.id))
                        .map((ti) => checklistInfo(ti.checklist_item_id)?.description ?? "Checklist item");
                      return (
                        <div key={h.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5 }}>
                          <span
                            style={{
                              flexShrink: 0, width: 20, height: 20, borderRadius: "50%",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10.5, fontWeight: 700, color: "#fff",
                              background: linkedLabels.length > 0 ? "var(--accent)" : "var(--text-soft)",
                            }}
                          >
                            {i + 1}
                          </span>
                          <div>
                            {h.label && <div style={{ fontWeight: 600 }}>{h.label}</div>}
                            {linkedLabels.length > 0 ? (
                              <div style={{ color: "var(--text-soft)" }}>{linkedLabels.join(", ")}</div>
                            ) : (
                              <div style={{ color: "var(--text-soft)", fontStyle: "italic" }}>No checklist item linked</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="mri-preview-section-label" style={{ marginTop: 20 }}>Mid-Section</div>

        {templateMidFields.length === 0 ? (
          <div className="empty">No mid-section fields configured yet</div>
        ) : (
          <div className="mri-preview-mid-grid">
            {[...templateMidFields].sort((a, b) => a.display_order - b.display_order).map((tf) => {
              const label = midCatalog.find((c) => c.id === tf.mid_field_id)?.label ?? "—";
              return (
                <div key={tf.id} className="mri-preview-mid-pair">
                  <label>{label}</label>
                  <div className="mri-preview-input" />
                </div>
              );
            })}
          </div>
        )}

        <div className="mri-preview-section-label" style={{ marginTop: 20 }}>Footer</div>
        {templateFooterFields.length === 0 ? (
          <div className="empty">No footer fields configured yet</div>
        ) : (
          <div className="mri-footer-preview">
            {(() => {
              const SIGNOFF_FIELDS = ["Operator", "Operator Date", "Supervisor", "Supervisor Date"];
              const sorted = [...templateFooterFields].sort((a, b) => a.display_order - b.display_order);
              const signoffItems = sorted.filter((tf) => {
                const label = footerCatalog.find((c) => c.id === tf.footer_field_id)?.label ?? "";
                return SIGNOFF_FIELDS.includes(label);
              });
              const otherItems = sorted.filter((tf) => {
                const label = footerCatalog.find((c) => c.id === tf.footer_field_id)?.label ?? "";
                return !SIGNOFF_FIELDS.includes(label);
              });

              return (
                <>
                  {otherItems.map((tf) => {
                    const label = footerCatalog.find((c) => c.id === tf.footer_field_id)?.label ?? "—";
                    const isStatus = STATUS_FIELDS.includes(label);

                    if (isStatus) {
                      return (
                        <div key={tf.id} className="mri-footer-status">
                          <span>{label}</span>
                          <div className="mri-preview-toggle">
                            <span className="mri-preview-toggle-knob" />
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={tf.id} className="mri-preview-table-row">
                        <label>{label}</label>
                        <div className="mri-preview-input" />
                      </div>
                    );
                  })}

                  {signoffItems.length > 0 && (
                    <div className="mri-footer-signoff-grid">
                      {signoffItems.map((tf) => {
                        const label = footerCatalog.find((c) => c.id === tf.footer_field_id)?.label ?? "—";
                        return (
                          <div key={tf.id} className="mri-footer-signoff-field">
                            <label>{label}</label>
                            <div className="mri-preview-input" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

export default TemplatePreview;