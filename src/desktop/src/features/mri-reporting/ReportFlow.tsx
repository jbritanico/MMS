import { useState } from "react";
import { useReportFlow } from "./hooks/useReportFlow";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";

export type FlowTarget = "assets" | "pending-approvals" | "rectification-queue";

interface ReportFlowProps {
  reportId: number;
  onBack: () => void;
  onOpenReport: (reportId: number) => void;
  onNavigate: (target: FlowTarget) => void;
}

type NodeKind = "asset" | "report" | "fault" | "decision" | "repair" | "onsite" | "tag" | "cost" | "carried" | "exemption";

interface FlowNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  title: string;
  lines: string[];
  tone: "neutral" | "danger" | "warn" | "success";
  details: [string, string][];
  open: { label: string; run: () => void; needs?: string[]; any?: boolean };
}

const NODE_W = 210;
const NODE_H = 84;
const COL = 265;
const ROW = 108;

const TONE_STROKE: Record<FlowNode["tone"], string> = {
  neutral: "var(--border)",
  danger: "var(--danger)",
  warn: "var(--warn)",
  success: "var(--success)",
};

function wrapText(s: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of s.split(/\s+/)) {
    if ((cur + " " + w).trim().length > max && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

function tagTone(tag: string | null | undefined): FlowNode["tone"] {
  if (tag === "Red") return "danger";
  if (tag === "Yellow") return "warn";
  if (tag === "Green") return "success";
  return "neutral";
}

function severityTone(sev: string | null | undefined): FlowNode["tone"] {
  if (sev === "Critical") return "danger";
  if (sev === "Moderate") return "warn";
  return "neutral";
}

const APPROVAL_PERMS = ["mri.approve", "mri.endorse_report", "mri.record_provisional", "mri.confirm_provisional", "mri.acknowledge_critical"];
const REPAIR_PERMS = ["mri.rectify", "mri.approve", "mri.close_defect"];

// SAP-style document flow for one MR-I report: asset -> report -> faults -> decisions ->
// repairs, plus tag changes, cost, on-site repairs, carried-forward faults and exemptions.
// Read-only. Selecting a box shows its details and the existing screen that owns it; the
// "Open" button is disabled when the signed-in user lacks the permission for that screen.
function ReportFlow({ reportId, onBack, onOpenReport, onNavigate }: ReportFlowProps) {
  const { data: flow, isLoading, error } = useReportFlow(reportId);
  const { user } = useCurrentUser();
  const { data: permissions = [] } = useEffectivePermissions(user?.id ?? 0);
  const [selected, setSelected] = useState<string | null>("report");

  if (isLoading) return <div className="empty">Loading...</div>;
  if (error || !flow) {
    return (
      <div>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back</button>
        <div className="toast err" style={{ marginTop: 12 }}>Could not load the flow: {String(error ?? "not found")}</div>
      </div>
    );
  }

  const nodes: FlowNode[] = [];
  const edges: [string, string][] = [];
  const assetLabel = flow.asset_code ?? "Asset";

  // Column 0: asset (and carried-in faults from earlier reports below it).
  nodes.push({
    id: "asset", kind: "asset", x: 0, y: 0, title: assetLabel,
    lines: [flow.asset_description ?? "", flow.asset_tag_status ? `${flow.asset_tag_status} Tag` : "Not tagged"].filter(Boolean),
    tone: tagTone(flow.asset_tag_status),
    details: [["Asset", assetLabel], ["Description", flow.asset_description ?? "—"], ["Current tag", flow.asset_tag_status ?? "Not tagged"]],
    open: { label: "Open Asset Registry", run: () => onNavigate("assets"), needs: ["assets.view"] },
  });
  // Column 1: the report.
  nodes.push({
    id: "report", kind: "report", x: COL, y: 0, title: `Report #${flow.report_id}`,
    lines: [flow.status, flow.template_name ?? ""].filter(Boolean),
    tone: flow.status === "Approved" ? "success" : flow.status === "Escalated" ? "warn" : "neutral",
    details: [
      ["Status", flow.status], ["Template", flow.template_name ?? "—"],
      ["Submitted by", flow.submitted_by ?? "—"], ["Submitted", flow.submitted_date ?? "—"],
      ["Closed by", flow.approved_by ?? "—"], ["Closed", flow.approved_date ?? "—"],
    ],
    open: { label: "Open report", run: () => onOpenReport(flow.report_id) },
  });
  edges.push(["asset", "report"]);

  // Columns 2-4: one row per Moderate/Critical fault: fault -> decision -> repair.
  flow.faults.forEach((f, i) => {
    const y = i * ROW;
    const fid = `f${f.approval_id}`;
    nodes.push({
      id: fid, kind: "fault", x: COL * 2, y, title: f.item_name,
      lines: [`${f.original_severity}${f.new_severity && f.new_severity !== f.original_severity ? ` → ${f.new_severity}` : ""}`],
      tone: severityTone(f.new_severity ?? f.original_severity),
      details: [["Fault", f.item_name], ["Original severity", f.original_severity], ["Final severity", f.new_severity ?? "—"], ["Carried forward to report", f.carried_to_report_id ? `#${f.carried_to_report_id}` : "—"]],
      open: { label: "Open Pending Approvals", run: () => onNavigate("pending-approvals"), needs: APPROVAL_PERMS, any: true },
    });
    edges.push(["report", fid]);
    const did = `d${f.approval_id}`;
    const pending = f.decision === "Pending";
    nodes.push({
      id: did, kind: "decision", x: COL * 3, y, title: `Decision: ${f.decision}`,
      lines: [f.reviewer ?? f.assigned_to ? `${f.reviewer ?? f.assigned_to}` : "", f.provisional_status ? `Provisional: ${f.provisional_status}` : ""].filter(Boolean),
      tone: pending ? "warn" : f.decision === "Rejected" ? "neutral" : "success",
      details: [
        ["Decision", f.decision], ["Reviewer", f.reviewer ?? "—"], ["Assigned to", f.assigned_to ?? "—"],
        ["Provisional status", f.provisional_status ?? "—"], ["Acknowledged by", f.acknowledged_by ?? "—"], ["Log entries", String(f.log_entries)],
      ],
      open: { label: "Open Pending Approvals", run: () => onNavigate("pending-approvals"), needs: APPROVAL_PERMS, any: true },
    });
    edges.push([fid, did]);
    if (f.repair) {
      const rid = `r${f.approval_id}`;
      const verified = !!f.repair.verified_by;
      nodes.push({
        id: rid, kind: "repair", x: COL * 4, y, title: verified ? "Repair verified" : "Repair open",
        lines: [f.repair.assigned_technician ? `Technician: ${f.repair.assigned_technician}` : "No technician yet", f.repair.parts_status ? `Parts: ${f.repair.parts_status}` : ""].filter(Boolean),
        tone: verified ? "success" : "danger",
        details: [
          ["Technician", f.repair.assigned_technician ?? "—"], ["Parts", f.repair.parts_status ?? "—"], ["Repair date", f.repair.repair_date ?? "—"],
          ["Function test", f.repair.function_test_passed == null ? "—" : f.repair.function_test_passed ? "Passed" : "Not passed"],
          ["Verified by", f.repair.verified_by ?? "—"], ["Verified", f.repair.verified_date ?? "—"], ["Repair tag", f.repair.tag_status ?? "—"],
        ],
        open: { label: "Open Rectification Queue", run: () => onNavigate("rectification-queue"), needs: REPAIR_PERMS, any: true },
      });
      edges.push([did, rid]);
    }
  });

  const faultRows = Math.max(flow.faults.length, 1);
  let extraRow = 0;
  // Extra boxes under column 1 and 2: cost, tag changes, on-site repairs, exemptions, carried-in.
  const extraY = () => faultRows * ROW + 20 + extraRow * ROW;
  if (flow.mr_cost != null) {
    const y = extraY(); extraRow++;
    nodes.push({
      id: "cost", kind: "cost", x: COL, y, title: `MR cost ${flow.mr_cost}`,
      lines: [flow.mr_cost_by ? `by ${flow.mr_cost_by}` : "", flow.mr_cost_date ?? ""].filter(Boolean), tone: "neutral",
      details: [["MR cost", String(flow.mr_cost)], ["Entered by", flow.mr_cost_by ?? "—"], ["Entered", flow.mr_cost_date ?? "—"]],
      open: { label: "Open report", run: () => onOpenReport(flow.report_id) },
    });
    edges.push(["report", "cost"]);
  }
  if (flow.tag_changes.length > 0) {
    const y = extraY(); extraRow++;
    const last = flow.tag_changes[flow.tag_changes.length - 1];
    nodes.push({
      id: "tag", kind: "tag", x: COL * 2, y, title: `Tag: ${flow.tag_changes.map((t) => t.tag_status).join(" → ")}`,
      lines: [last.reason ?? ""].filter(Boolean), tone: tagTone(last.tag_status),
      details: flow.tag_changes.map((t, i) => [`${i + 1}. ${t.previous_tag_status ?? "Not tagged"} → ${t.tag_status}`, `${t.reason ?? "no reason"}${t.changed_by ? ` (${t.changed_by})` : ""} ${t.changed_at ?? ""}`] as [string, string]),
      open: { label: "Open Asset Registry", run: () => onNavigate("assets"), needs: ["assets.view"] },
    });
    edges.push(["report", "tag"]);
  }
  flow.onsite_repairs.forEach((o, i) => {
    const y = extraY(); extraRow++;
    const id = `o${i}`;
    nodes.push({
      id, kind: "onsite", x: COL * 2, y, title: `Repaired on site: ${o.item_name}`,
      lines: [o.repaired_by ? `by ${o.repaired_by}` : ""].filter(Boolean), tone: "success",
      details: [["Item", o.item_name], ["Severity", o.severity ?? "—"], ["Action taken", o.action_taken ?? "—"], ["Repaired by", o.repaired_by ?? "—"], ["Repaired", o.repaired_at ?? "—"]],
      open: { label: "Open report", run: () => onOpenReport(flow.report_id) },
    });
    edges.push(["report", id]);
  });
  flow.carried_in.forEach((c) => {
    const y = ROW + 20 + (nodes.filter((n) => n.kind === "carried").length) * ROW;
    const id = `c${c.approval_id}`;
    nodes.push({
      id, kind: "carried", x: 0, y, title: `Carried in: ${c.item_name}`,
      lines: [`From report #${c.from_report_id}`], tone: "warn",
      details: [["Fault", c.item_name], ["From report", `#${c.from_report_id}`]],
      open: { label: `Open report #${c.from_report_id}`, run: () => onOpenReport(c.from_report_id) },
    });
    edges.push([id, "report"]);
  });
  flow.exemptions.forEach((x, i) => {
    const y = ROW + 20 + (nodes.filter((n) => n.kind === "carried").length) * ROW + (i + 1) * ROW;
    const id = `x${i}`;
    nodes.push({
      id, kind: "exemption", x: 0, y, title: `MOC ${x.moc_reference}`,
      lines: [x.status, x.valid_until ? `until ${x.valid_until}` : ""].filter(Boolean), tone: x.status === "Active" ? "success" : "neutral",
      details: [["Reference", x.moc_reference], ["Status", x.status], ["Valid", `${x.valid_from ?? "—"} to ${x.valid_until ?? "—"}`], ["Approved by", x.approved_by ?? "—"]],
      open: { label: "Open Asset Registry", run: () => onNavigate("assets"), needs: ["assets.view"] },
    });
    edges.push(["asset", id]);
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const width = Math.max(...nodes.map((n) => n.x)) + NODE_W + 20;
  const height = Math.max(...nodes.map((n) => n.y)) + NODE_H + 20;
  const sel = selected ? byId.get(selected) : null;
  const canOpen = (n: FlowNode) => {
    if (!n.open.needs) return true;
    return n.open.any ? n.open.needs.some((p) => permissions.includes(p)) : n.open.needs.every((p) => permissions.includes(p));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back</button>
      </div>
      <div className="header">
        <h1>{assetLabel} — Document flow</h1>
        <span className="sub">Report #{flow.report_id} · {flow.status} · select a box to see details and open its screen</span>
      </div>

      <div className="panel" style={{ overflow: "auto", padding: 16 }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Document flow diagram">
          <defs>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--text-soft)" />
            </marker>
          </defs>
          {edges.map(([a, b], i) => {
            const A = byId.get(a)!, B = byId.get(b)!;
            const x1 = A.x + NODE_W, y1 = A.y + NODE_H / 2, x2 = B.x, y2 = B.y + NODE_H / 2;
            const forward = x2 >= x1;
            const sx = forward ? x1 : A.x + NODE_W / 2, sy = forward ? y1 : A.y;
            const ex = forward ? x2 : B.x + NODE_W / 2, ey = forward ? y2 : B.y + NODE_H;
            const d = forward
              ? `M${sx},${sy} C${sx + 40},${sy} ${ex - 40},${ey} ${ex},${ey}`
              : `M${sx},${sy} C${sx},${sy - 30} ${ex},${ey + 30} ${ex},${ey}`;
            return <path key={i} d={d} fill="none" stroke="var(--text-soft)" strokeWidth={1.4} markerEnd="url(#flow-arrow)" opacity={0.7} />;
          })}
          {nodes.map((n) => (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              onClick={() => setSelected(n.id)}
              onDoubleClick={() => canOpen(n) && n.open.run()}
              style={{ cursor: "pointer" }}
              tabIndex={0}
              role="button"
              aria-label={n.title}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(n.id); } }}
            >
              <rect
                width={NODE_W} height={NODE_H} rx={12}
                fill="var(--neu-bg)" stroke={selected === n.id ? "var(--accent-blue)" : TONE_STROKE[n.tone]}
                strokeWidth={selected === n.id ? 3 : 1.8}
              />
              {wrapText(n.title, 26).slice(0, 2).map((l, i) => (
                <text key={i} x={12} y={22 + i * 15} fontSize={12.5} fontWeight={700} fill="var(--text)">{l}</text>
              ))}
              {n.lines.slice(0, 2).map((l, i) => (
                <text key={i} x={12} y={(wrapText(n.title, 26).length > 1 ? 54 : 40) + i * 14} fontSize={11} fill="var(--text-soft)">
                  {l.length > 32 ? l.slice(0, 31) + "…" : l}
                </text>
              ))}
            </g>
          ))}
        </svg>
      </div>

      {sel && (
        <div className="panel" style={{ marginTop: 14 }}>
          <h2 style={{ marginTop: 0 }}>{sel.title}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 16px", fontSize: 13 }}>
            {sel.details.map(([k, v], i) => (
              <div key={i} style={{ display: "contents" }}>
                <span style={{ color: "var(--text-soft)" }}>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="primary" onClick={sel.open.run} disabled={!canOpen(sel)} title={!canOpen(sel) ? "Your role doesn't have access to that screen" : undefined}>
              {sel.open.label}
            </button>
            {!canOpen(sel) && <span style={{ fontSize: 11, color: "var(--text-soft)" }}>Your role doesn't have access to that screen.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportFlow;
