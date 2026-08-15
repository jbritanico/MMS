import { useHeaderFieldCatalog, useTemplateHeaderFields } from "./hooks/useTemplateHeaderFields";
import { useTemplateChecklistItems } from "./hooks/useTemplateChecklistItems";
import { useChecklistItems } from "../administration/hooks/useChecklistDatabank";
import { useChecklistSections } from "../administration/hooks/useChecklistSections";
import { useMidFieldCatalog, useTemplateMidFields } from "./hooks/useTemplateMidFields";

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

  const sortedFields = [...templateFields].sort((a, b) => a.display_order - b.display_order);
  const sortedChecklist = [...templateChecklist].sort((a, b) => a.display_order - b.display_order);

  function fieldName(headerFieldId: number) {
    return catalog.find((c) => c.id === headerFieldId)?.label ?? "—";
  }
  function checklistInfo(checklistItemId: number) {
    return databank.find((d) => d.id === checklistItemId);
  }
  function sectionName(sectionId: number | null) {
    return sections.find((s) => s.id === sectionId)?.name ?? "Unassigned";
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
    Minor: "var(--accent)",
    Moderate: "var(--accent-blue)",
    Major: "var(--warn)",
    Critical: "var(--danger)",
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
        <div className="empty">Not yet configured</div>
      </div>
    </div>
  );
}

export default TemplatePreview;