import type { MriTemplate } from "../administration/hooks/useMriTemplates";
import TemplateGraph3D from "./TemplateGraph3D";

interface TemplateGraphModalProps {
  template: MriTemplate;
  onClose: () => void;
}

function TemplateGraphModal({ template, onClose }: TemplateGraphModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
        <div className="graph-modal-header">
          <h3>{template.template_name} — 3D Structure</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 10 }}>
          Drag to rotate, scroll to zoom. Branches: Header Fields, Checklist Items (grouped by Section), Mid Fields, Footer Fields.
        </p>
        <TemplateGraph3D template={template} />
      </div>
    </div>
  );
}

export default TemplateGraphModal;