import { useHeaderFieldCatalog, useTemplateHeaderFields } from "./hooks/useTemplateHeaderFields";

interface TemplatePreviewProps {
  templateId: number;
  templateName: string;
}

function TemplatePreview({ templateId, templateName }: TemplatePreviewProps) {
  const { data: catalog = [] } = useHeaderFieldCatalog();
  const { data: templateFields = [] } = useTemplateHeaderFields(templateId);

  const sortedFields = [...templateFields].sort((a, b) => a.display_order - b.display_order);

  function fieldName(headerFieldId: number) {
    return catalog.find((c) => c.id === headerFieldId)?.label ?? "—";
  }

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
          <div className="mri-preview-grid">
            {sortedFields.map((tf) => (
              <div key={tf.id} className="mri-preview-field">
                <label>
                  {fieldName(tf.header_field_id)}
                  {tf.required && <span style={{ color: "#a32d2d" }}> *</span>}
                </label>
                <div className="mri-preview-input" />
              </div>
            ))}
          </div>
        )}

        <div className="mri-preview-section-label" style={{ marginTop: 20 }}>Checklist</div>
        <div className="empty">Not yet configured</div>

        <div className="mri-preview-section-label" style={{ marginTop: 20 }}>Mid-Section</div>
        <div className="empty">Not yet configured</div>

        <div className="mri-preview-section-label" style={{ marginTop: 20 }}>Footer</div>
        <div className="empty">Not yet configured</div>
      </div>
    </div>
  );
}

export default TemplatePreview;