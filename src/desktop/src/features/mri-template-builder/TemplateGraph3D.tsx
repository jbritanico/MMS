import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { MriTemplate } from "../administration/hooks/useMriTemplates";
import { useTemplateHeaderFields, useHeaderFieldCatalog } from "./hooks/useTemplateHeaderFields";
import { useTemplateChecklistItems } from "./hooks/useTemplateChecklistItems";
import { useTemplateMidFields, useMidFieldCatalog } from "./hooks/useTemplateMidFields";
import { useTemplateFooterFields, useFooterFieldCatalog } from "./hooks/useTemplateFooterFields";
import { useChecklistItems } from "../administration/hooks/useChecklistDatabank";
import { useChecklistSections } from "../administration/hooks/useChecklistSections";

interface TreeNode {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  children: TreeNode[];
}

interface TemplateGraph3DProps {
  template: MriTemplate;
}

export interface TemplateGraph3DHandle {
  exportPdf: (filename: string) => Promise<void>;
}

// Fixed palette so each branch of the hierarchy reads as its own color
// consistently, regardless of how many items it has.
const HEADER_COLOR = "#2f6fed";
const CHECKLIST_COLOR = "#1f7a4d";
const MID_COLOR = "#b98a1f";
const FOOTER_COLOR = "#7a4de0";
const SECTION_COLOR = "#3f9d7a";

/** Builds the tree for one template:
 *  template -> {Header Fields, Checklist Items, Mid Fields, Footer Fields}
 *  and, under Checklist Items specifically, an extra level of Sections,
 *  each holding the checklist items that belong to it. */
function useTemplateTree(template: MriTemplate): TreeNode {
  const templateId = template.id;
  const { data: headerFields = [] } = useTemplateHeaderFields(templateId);
  const { data: headerCatalog = [] } = useHeaderFieldCatalog();
  const { data: checklistItems = [] } = useTemplateChecklistItems(templateId);
  const { data: checklistDatabank = [] } = useChecklistItems();
  const { data: checklistSections = [] } = useChecklistSections();
  const { data: midFields = [] } = useTemplateMidFields(templateId);
  const { data: midCatalog = [] } = useMidFieldCatalog();
  const { data: footerFields = [] } = useTemplateFooterFields(templateId);
  const { data: footerCatalog = [] } = useFooterFieldCatalog();

  return useMemo(() => {
    const headerNode: TreeNode = {
      id: "hub-header",
      label: `Header Fields (${headerFields.length})`,
      color: HEADER_COLOR,
      children: headerFields.map((f) => ({
        id: `header-${f.id}`,
        label: f.label_override || headerCatalog.find((c) => c.id === f.header_field_id)?.label || "Field",
        color: HEADER_COLOR,
        children: [],
      })),
    };

    const usedSectionIds = Array.from(new Set(checklistItems.map((ci) => ci.section_id)));
    const checklistNode: TreeNode = {
      id: "hub-checklist",
      label: `Checklist Items (${checklistItems.length})`,
      color: CHECKLIST_COLOR,
      children: usedSectionIds.map((sid) => {
        const sectionName = sid === null ? "Unassigned" : checklistSections.find((s) => s.id === sid)?.name ?? "Unassigned";
        const itemsInSection = checklistItems.filter((ci) => ci.section_id === sid);
        return {
          id: `section-${sid ?? "none"}`,
          label: sectionName,
          sublabel: "Section",
          color: SECTION_COLOR,
          children: itemsInSection.map((ci) => {
            const bank = checklistDatabank.find((d) => d.id === ci.checklist_item_id);
            return {
              id: `checklist-${ci.id}`,
              label: bank?.code || "Item",
              sublabel: bank?.description,
              color: SECTION_COLOR,
              children: [],
            };
          }),
        };
      }),
    };

    const midNode: TreeNode = {
      id: "hub-mid",
      label: `Mid Fields (${midFields.length})`,
      color: MID_COLOR,
      children: midFields.map((f) => ({
        id: `mid-${f.id}`,
        label: midCatalog.find((c) => c.id === f.mid_field_id)?.label || "Field",
        color: MID_COLOR,
        children: [],
      })),
    };

    const footerNode: TreeNode = {
      id: "hub-footer",
      label: `Footer Fields (${footerFields.length})`,
      color: FOOTER_COLOR,
      children: footerFields.map((f) => ({
        id: `footer-${f.id}`,
        label: footerCatalog.find((c) => c.id === f.footer_field_id)?.label || "Field",
        color: FOOTER_COLOR,
        children: [],
      })),
    };

    return {
      id: "template",
      label: template.template_name,
      sublabel: "Template",
      color: "#9a9a9a",
      children: [headerNode, checklistNode, midNode, footerNode],
    };
  }, [
    template,
    headerFields,
    headerCatalog,
    checklistItems,
    checklistDatabank,
    checklistSections,
    midFields,
    midCatalog,
    footerFields,
    footerCatalog,
  ]);
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 14, height: 14 }}>
      {expanded ? (
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function FolderIcon({ open, color }: { open: boolean; color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 18, height: 18, flexShrink: 0 }}>
      {open && (
        <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v1H5.2a1 1 0 0 0-.98.79L2.5 18H2V7z" fill={color} opacity={0.55} />
      )}
      <path
        d={
          open
            ? "M4.2 18.79A1 1 0 0 0 5.18 19.5h13.6a1 1 0 0 0 .98-.79L21.5 11H6.4a1 1 0 0 0-.98.79L4.2 18.79z"
            : "M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"
        }
        fill={color}
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 16, height: 16, flexShrink: 0 }}>
      <path d="M6 2.5h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z" fill="var(--text-soft)" opacity={0.3} />
      <path d="M14 2.5v4h4" stroke="var(--text-soft)" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

interface TreeRowProps {
  node: TreeNode;
  collapsedIds: Set<string>;
  toggle: (id: string) => void;
}

/** One row of the tree, plus (recursively) its children indented and connected
 *  by a vertical guide line — the classic file/directory tree view look. */
function TreeRow({ node, collapsedIds, toggle }: TreeRowProps) {
  const isBranch = node.children.length > 0;
  const expanded = isBranch && !collapsedIds.has(node.id);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px" }}>
        {isBranch ? (
          <button
            className="icon-btn"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => toggle(node.id)}
            style={{ width: 22, height: 22, flexShrink: 0 }}
          >
            <ChevronIcon expanded={expanded} />
          </button>
        ) : (
          <span style={{ width: 22, height: 22, flexShrink: 0 }} />
        )}

        {isBranch ? <FolderIcon open={expanded} color={node.color} /> : <FileIcon />}

        <span style={{ fontFamily: "'Consolas', 'Courier New', monospace", fontSize: 13 }}>
          {node.label}
          {node.sublabel && <span style={{ color: "var(--text-soft)", fontWeight: 400 }}> — {node.sublabel}</span>}
        </span>
      </div>

      {isBranch && expanded && (
        <div style={{ marginLeft: 10, paddingLeft: 14, borderLeft: "1px solid var(--border)" }}>
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} collapsedIds={collapsedIds} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Directory-tree-style view of a template's structure: Header Fields, Checklist Items
 *  (grouped by Section), Mid Fields and Footer Fields, each branch collapsible/expandable
 *  like a file explorer. Plain 2D layout — no rotation, no camera controls. */
const TemplateGraph3D = forwardRef<TemplateGraph3DHandle, TemplateGraph3DProps>(function TemplateGraph3D(
  { template },
  ref
) {
  const tree = useTemplateTree(template);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  function toggle(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useImperativeHandle(ref, () => ({
    async exportPdf(filename: string) {
      const el = containerRef.current;
      if (!el) return;

      // Temporarily lift the scroll clamp so the whole tree — not just the
      // currently-scrolled-into-view portion — gets captured.
      const prevMaxHeight = el.style.maxHeight;
      const prevOverflowY = el.style.overflowY;
      el.style.maxHeight = "none";
      el.style.overflowY = "visible";
      await new Promise((resolve) => requestAnimationFrame(resolve));

      try {
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({
          orientation: canvas.height >= canvas.width ? "portrait" : "landscape",
          unit: "pt",
          format: [canvas.width / 2, canvas.height / 2],
        });
        pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
        pdf.save(filename);
      } finally {
        el.style.maxHeight = prevMaxHeight;
        el.style.overflowY = prevOverflowY;
      }
    },
  }));

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        maxHeight: "70vh",
        overflowY: "auto",
        borderRadius: 16,
        padding: 16,
        boxShadow: "inset 3px 3px 8px var(--neu-shadow-dark), inset -3px -3px 8px var(--neu-shadow-light)",
      }}
    >
      <TreeRow node={tree} collapsedIds={collapsedIds} toggle={toggle} />
    </div>
  );
});

export default TemplateGraph3D;