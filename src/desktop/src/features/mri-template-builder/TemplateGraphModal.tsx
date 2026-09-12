import { useRef, useState } from "react";
import type { MriTemplate } from "../administration/hooks/useMriTemplates";
import TemplateGraph3D, { type TemplateGraph3DHandle } from "./TemplateGraph3D";

interface TemplateGraphModalProps {
  template: MriTemplate;
  onClose: () => void;
}

function TemplateGraphModal({ template, onClose }: TemplateGraphModalProps) {
  const graphRef = useRef<TemplateGraph3DHandle>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExportPdf() {
    if (exporting) return;
    setExporting(true);
    try {
      const safeName = template.template_name.trim().replace(/[^a-z0-9]+/gi, "_") || "template";
      await graphRef.current?.exportPdf(`${safeName}_structure.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
        <div className="graph-modal-header">
          <h3>{template.template_name} — Structure</h3>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="icon-btn"
              aria-label="Export to PDF"
              title="Export this structure to PDF"
              onClick={handleExportPdf}
              disabled={exporting}
            >
              {exporting ? (
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 12a9 9 0 1 1-3-6.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 10 }}>
          Click a branch to expand or collapse it. Branches: Header Fields, Checklist Items (grouped by Section), Mid Fields, Footer Fields.
        </p>
        <TemplateGraph3D ref={graphRef} template={template} />
      </div>
    </div>
  );
}

export default TemplateGraphModal;