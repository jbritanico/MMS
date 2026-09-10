import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
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
  color: number;
  size: number;
  children: TreeNode[];
}

interface GraphNode {
  id: string;
  label: string;
  sublabel?: string;
  color: number;
  size: number;
  position: THREE.Vector3;
  isBranch: boolean;
  collapsed: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  color: number;
}

interface TemplateGraph3DProps {
  template: MriTemplate;
}

// Fixed palette so each branch of the hierarchy reads as its own color
// consistently, regardless of how many items it has.
const HEADER_COLOR = 0x2f6fed;
const CHECKLIST_COLOR = 0x1f7a4d;
const MID_COLOR = 0xb98a1f;
const FOOTER_COLOR = 0x7a4de0;
const SECTION_COLOR = 0x3f9d7a;

const INDENT = 1.4; // horizontal step per depth level, like nested folders in a file explorer
const ROW_HEIGHT = 0.62; // vertical distance between consecutive rows in the list
const ELBOW_INSET = 0.4; // how far the vertical "drop" sits to the left of a node, before turning right into it

/** Lays out the tree the way a computer file/directory tree view does: a top-to-bottom
 *  list of rows, each node indented one step further right than its parent (x = depth *
 *  INDENT), and stacked in depth-first order from top to bottom (y = -row * ROW_HEIGHT).
 *  Connectors are drawn as right-angle "elbow" joints (a short vertical drop from the
 *  parent's row down to the child's row, then a horizontal run into the child) instead of
 *  straight diagonal lines, matching the branch/guide lines of a classic Explorer-style
 *  tree.
 *
 *  `collapsedIds` mirrors a collapsed folder in a file explorer: a node whose id is in the
 *  set still gets its own row (so you can still see and re-expand it), but its subtree is
 *  skipped entirely — not placed, not laid out, not connected — so the rows below it
 *  simply close up, the same way collapsing a folder does. */
function layoutTree(
  root: TreeNode,
  collapsedIds: Set<string>
): { nodes: GraphNode[]; edges: GraphEdge[]; elbows: Map<string, THREE.Vector3> } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const positionById = new Map<string, THREE.Vector3>();
  const elbows = new Map<string, THREE.Vector3>();
  let nextRow = 0;

  function place(node: TreeNode, depth: number, parent: TreeNode | null) {
    const x = depth * INDENT;
    const y = -nextRow * ROW_HEIGHT;
    nextRow += 1;
    positionById.set(node.id, new THREE.Vector3(x, y, 0));

    if (parent) {
      edges.push({ from: parent.id, to: node.id, color: node.color });
      // Elbow corner: level with the child's row, but still under the parent's column —
      // draw parent -> corner -> child so the joint turns a clean right angle.
      elbows.set(node.id, new THREE.Vector3(x - ELBOW_INSET, y, 0));
    }

    if (collapsedIds.has(node.id)) return;
    node.children.forEach((child) => place(child, depth + 1, node));
  }

  place(root, 0, null);

  function collect(node: TreeNode) {
    nodes.push({
      id: node.id,
      label: node.label,
      sublabel: node.sublabel,
      color: node.color,
      size: node.size,
      position: positionById.get(node.id)!,
      isBranch: node.children.length > 0,
      collapsed: collapsedIds.has(node.id),
    });
    if (collapsedIds.has(node.id)) return;
    node.children.forEach(collect);
  }
  collect(root);

  return { nodes, edges, elbows };
}

/** Builds the tree for one template:
 *  template -> {Header Fields, Checklist Items, Mid Fields, Footer Fields}
 *  and, under Checklist Items specifically, an extra level of Sections,
 *  each holding the checklist items that belong to it. */
function useTemplateGraph(
  template: MriTemplate,
  collapsedIds: Set<string>
): { nodes: GraphNode[]; edges: GraphEdge[]; elbows: Map<string, THREE.Vector3> } {
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
      size: 0.34,
      children: headerFields.map((f) => ({
        id: `header-${f.id}`,
        label: f.label_override || headerCatalog.find((c) => c.id === f.header_field_id)?.label || "Field",
        color: HEADER_COLOR,
        size: 0.16,
        children: [],
      })),
    };

    const usedSectionIds = Array.from(new Set(checklistItems.map((ci) => ci.section_id)));
    const checklistNode: TreeNode = {
      id: "hub-checklist",
      label: `Checklist Items (${checklistItems.length})`,
      color: CHECKLIST_COLOR,
      size: 0.34,
      children: usedSectionIds.map((sid) => {
        const sectionName = sid === null ? "Unassigned" : checklistSections.find((s) => s.id === sid)?.name ?? "Unassigned";
        const itemsInSection = checklistItems.filter((ci) => ci.section_id === sid);
        return {
          id: `section-${sid ?? "none"}`,
          label: sectionName,
          sublabel: "Section",
          color: SECTION_COLOR,
          size: 0.22,
          children: itemsInSection.map((ci) => {
            const bank = checklistDatabank.find((d) => d.id === ci.checklist_item_id);
            return {
              id: `checklist-${ci.id}`,
              label: bank?.code || "Item",
              sublabel: bank?.description,
              color: SECTION_COLOR,
              size: 0.13,
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
      size: 0.34,
      children: midFields.map((f) => ({
        id: `mid-${f.id}`,
        label: midCatalog.find((c) => c.id === f.mid_field_id)?.label || "Field",
        color: MID_COLOR,
        size: 0.16,
        children: [],
      })),
    };

    const footerNode: TreeNode = {
      id: "hub-footer",
      label: `Footer Fields (${footerFields.length})`,
      color: FOOTER_COLOR,
      size: 0.34,
      children: footerFields.map((f) => ({
        id: `footer-${f.id}`,
        label: footerCatalog.find((c) => c.id === f.footer_field_id)?.label || "Field",
        color: FOOTER_COLOR,
        size: 0.16,
        children: [],
      })),
    };

    const root: TreeNode = {
      id: "template",
      label: template.template_name,
      sublabel: "Template",
      color: 0x9a9a9a,
      size: 0.6,
      children: [headerNode, checklistNode, midNode, footerNode],
    };

    return layoutTree(root, collapsedIds);
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
    collapsedIds,
  ]);
}

function TemplateGraph3D({ template }: TemplateGraph3DProps): JSX.Element {
  // Every branch starts expanded; clicking a folder node toggles it in/out of this set.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const graph = useTemplateGraph(template, collapsedIds);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    labelRenderer: CSS2DRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    animId: number;
  } | null>(null);

  // One-time scene setup (mount/unmount only).
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);
    camera.position.set(0, 0, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    mount.appendChild(labelRenderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 100;
    // Lock the azimuth (left/right orbit) so dragging can only tilt the view up and down —
    // i.e. rotation about the X axis only, never spinning around to the side or back.
    controls.minAzimuthAngle = 0;
    controls.maxAzimuthAngle = 0;

    let animId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      const w = mount.clientWidth || 800;
      const h = mount.clientHeight || 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    sceneRef.current = { renderer, labelRenderer, scene, camera, controls, animId };

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (mount.contains(labelRenderer.domElement)) mount.removeChild(labelRenderer.domElement);
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild the node/edge meshes whenever the graph data changes, and frame the
  // camera on the whole tree since its size varies a lot template to template.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const { scene, camera, controls, renderer } = ctx;

    const group = new THREE.Group();
    group.name = "graph-content";
    const nodeMeshById = new Map<string, THREE.Object3D>();

    graph.nodes.forEach((n) => {
      // Small flat squares instead of spheres — folders (branch nodes) get a slightly
      // bigger, brighter marker than files (leaves), the way a directory tree icon set
      // distinguishes an expandable folder from a plain file.
      const boxSize = n.isBranch ? n.size * 1.15 : n.size * 0.8;
      const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize * 0.4);
      const material = new THREE.MeshStandardMaterial({
        color: n.color,
        roughness: n.isBranch ? 0.35 : 0.6,
        metalness: 0.1,
        emissive: n.isBranch ? n.color : 0x000000,
        emissiveIntensity: n.isBranch ? 0.25 : 0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(n.position);
      mesh.userData.nodeId = n.id;
      mesh.userData.isBranch = n.isBranch;
      group.add(mesh);
      nodeMeshById.set(n.id, mesh);

      const div = document.createElement("div");
      // file glyph for leaves; closed vs. open folder glyph for branches, depending on
      // whether this node is currently collapsed — same visual language as Explorer.
      const icon = !n.isBranch ? "\u{1F4C4}" : n.collapsed ? "\u{1F4C1}" : "\u{1F4C2}";
      const text = n.sublabel ? `${n.label} — ${n.sublabel}` : n.label;
      div.textContent = `${icon} ${text}`;
      div.style.fontSize = "11px";
      div.style.fontFamily = "'Consolas', 'Courier New', monospace";
      div.style.color = "#ffffff";
      div.style.background = "transparent";
      div.style.whiteSpace = "nowrap";
      div.style.pointerEvents = "none";
      const label = new CSS2DObject(div);
      label.position.set(n.size + 0.28, 0, 0);
      mesh.add(label);
    });

    // Right-angle "elbow" connectors: parent -> corner (under parent's column, level with
    // the child's row) -> child. This is what gives the branch lines of a classic
    // file/directory tree view instead of straight diagonal edges.
    graph.edges.forEach((e) => {
      const from = nodeMeshById.get(e.from);
      const to = nodeMeshById.get(e.to);
      if (!from || !to) return;
      const corner = graph.elbows.get(e.to) ?? to.position.clone();
      const geometry = new THREE.BufferGeometry().setFromPoints([from.position, corner, to.position]);
      const material = new THREE.LineBasicMaterial({ color: e.color, transparent: true, opacity: 0.55 });
      const line = new THREE.Line(geometry, material);
      group.add(line);
    });

    scene.add(group);

    // Click a folder (branch) node to expand/collapse it, like a file explorer. Files
    // (leaf nodes) aren't clickable — there's nothing to toggle.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const nodeMeshes = Array.from(nodeMeshById.values());

    function pickNode(event: MouseEvent): THREE.Object3D | null {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(nodeMeshes, false);
      return hits.length > 0 ? hits[0].object : null;
    }

    const handleClick = (event: MouseEvent) => {
      const hit = pickNode(event);
      if (!hit || !hit.userData.isBranch) return;
      const id = hit.userData.nodeId as string;
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const handleMove = (event: MouseEvent) => {
      const hit = pickNode(event);
      renderer.domElement.style.cursor = hit && hit.userData.isBranch ? "pointer" : "grab";
    };

    renderer.domElement.addEventListener("click", handleClick);
    renderer.domElement.addEventListener("mousemove", handleMove);

    // Frame the camera on the tree's bounding box so it's fully visible on open,
    // regardless of how tall/wide this particular template's tree turns out to be.
    if (graph.nodes.length > 0) {
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const distance = maxDim * 1.1;

      controls.target.copy(center);
      camera.position.set(center.x, center.y, center.z + distance);
      camera.near = Math.max(distance / 100, 0.1);
      camera.far = distance * 10;
      camera.updateProjectionMatrix();
      controls.update();
    }

    return () => {
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("mousemove", handleMove);
      renderer.domElement.style.cursor = "grab";
      scene.remove(group);
      group.traverse((obj) => {
        if (obj instanceof CSS2DObject) {
          obj.element.remove();
        }
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
        if (obj instanceof THREE.Line) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    };
  }, [graph]);

  return (
    <div
      ref={mountRef}
      style={{
        position: "relative",
        width: "100%",
        height: "1120px",
        borderRadius: 16,
        overflow: "hidden",
        background: "#000000",
        boxShadow: "inset 3px 3px 8px var(--neu-shadow-dark), inset -3px -3px 8px var(--neu-shadow-light)",
      }}
    />
  );
}

export default TemplateGraph3D;