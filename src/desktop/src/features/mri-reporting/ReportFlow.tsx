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
  onShowAssetFlow: (assetId: number) => void;
  onShowReportFlow: (reportId: number) => void;
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
  // Optional second button, e.g. jump to the asset's flow or another report's flow.
  also?: { label: string; run: () => void };
}

const NODE_W = 236;
const NODE_H = 92;
const COL = 292;
const ROW = 118;
const HEAD = 46; // room for the stage headers above the first row
const STAGES = ["Asset", "Report", "Faults", "Decisions", "Repairs"];

// Small line icons per box type (24x24, stroke = currentColor).
const KIND_ICON: Record<NodeKind, string> = {
  asset: "M3 7h11v9H3zM14 10h4l3 3v3h-7zM6.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  report: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7M9 8h3",
  fault: "M12 3 2 20h20zM12 10v4M12 17h.01",
  decision: "M14 4l6 6M11 7l6 6M13 5l-7 7 3 3 7-7M8 14l-5 5M15 20h6",
  repair: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  onsite: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  tag: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  cost: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3.2 6 1.8 6 5 0 1.4-1.3 2.7-3 2.7s-3-1.1-3-2.5M12 5v2M12 17v2",
  carried: "M4 12h13M13 6l6 6-6 6M4 5v14",
  exemption: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
};

const TONE_STROKE: Record<FlowNode["tone"], string> = {
  neutral: "var(--text-soft)",
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
function ReportFlow({ reportId, onBack, onOpenReport, onNavigate, onShowAssetFlow, onShowReportFlow }: ReportFlowProps) {
  const { user } = useCurrentUser();
  const { data: flow, isLoading, error } = useReportFlow(reportId, user?.id ?? 0);
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

  // Timestamps arrive as epoch seconds (or ISO text); show them as 04/Nov/2026 14:05.
  const when = (raw: string | number | null | undefined): string => {
    if (raw === null || raw === undefined || String(raw).trim() === "") return "—";
    const n = Number(raw);
    const d = !isNaN(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(raw));
    if (isNaN(d.getTime())) return String(raw);
    const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    return `${String(d.getDate()).padStart(2, "0")}/${M}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  // Endorsing stores the endorser in approved_by too; it only means "closed" once Approved.
  const closed = flow.status === "Approved";

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
    also: { label: "Show asset history flow", run: () => onShowAssetFlow(flow.asset_id) },
  });
  // Column 1: the report.
  nodes.push({
    id: "report", kind: "report", x: COL, y: 0, title: `Report #${flow.report_id}`,
    lines: [flow.status, flow.template_name ?? ""].filter(Boolean),
    tone: flow.status === "Approved" ? "success" : flow.status === "Escalated" ? "warn" : "neutral",
    details: [
      ["Status", flow.status], ["Template", flow.template_name ?? "—"],
      ["Submitted by", flow.submitted_by ?? "—"], ["Submitted", when(flow.submitted_date)],
      [closed ? "Closed by" : "Endorsed by", flow.approved_by ?? "—"], [closed ? "Closed" : "Endorsed", when(flow.approved_date)],
      ["Country", flow.country ?? "—"],
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
      also: f.carried_to_report_id ? { label: `Show flow of report #${f.carried_to_report_id}`, run: () => onShowReportFlow(f.carried_to_report_id as number) } : undefined,
    });
    edges.push(["report", fid]);
    const did = `d${f.approval_id}`;
    const pending = f.decision === "Pending";
    // How the latest decision was taken (In-Person / Phone), from the decision log.
    const lastLog = f.log.length > 0 ? f.log[f.log.length - 1] : null;
    const method = lastLog?.review_method ? `${lastLog.review_method}${lastLog.is_provisional ? ", provisional" : ""}` : "";
    nodes.push({
      id: did, kind: "decision", x: COL * 3, y, title: `Decision: ${f.decision}`,
      lines: [
        f.reviewer ?? f.assigned_to ? `${f.reviewer ?? f.assigned_to}` : "",
        !pending && method ? `Method: ${method}` : pending ? "Awaiting decision" : "",
        f.provisional_status ? `Provisional: ${f.provisional_status}` : "",
      ].filter(Boolean),
      tone: pending ? "warn" : f.decision === "Rejected" ? "neutral" : "success",
      details: [
        ["Decision", f.decision], ["Reviewer", f.reviewer ?? "—"], ["Review method", !pending && lastLog ? lastLog.review_method : "—"], ["Assigned to", f.assigned_to ?? "—"],
        ["Provisional status", f.provisional_status ?? "—"], ["Acknowledged by", f.acknowledged_by ?? "—"],
        ["Reminders sent", String(f.reminders)],
        ...f.log.map((l, li): [string, string] => [
          `Audit ${li + 1}: ${l.action}${l.is_provisional ? " (provisional)" : ""}`,
          `${l.from_severity}${l.to_severity && l.to_severity !== l.from_severity ? ` → ${l.to_severity}` : ""} · ${l.reviewer} (${l.review_method}) · recorded by ${l.recorded_by} · ${when(l.logged_at)}${l.notes ? ` · ${l.notes}` : ""}`,
        ]),
        ...(f.log.length === 0 ? ([["Audit trail", "No decisions logged yet"]] as [string, string][]) : []),
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
          ["Verified by", f.repair.verified_by ?? "—"], ["Verified", when(f.repair.verified_date)], ["Repair tag", f.repair.tag_status ?? "—"],
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
      lines: [flow.mr_cost_by ? `by ${flow.mr_cost_by}` : "", flow.mr_cost_date ? when(flow.mr_cost_date) : ""].filter(Boolean), tone: "neutral",
      details: [["MR cost", String(flow.mr_cost)], ["Entered by", flow.mr_cost_by ?? "—"], ["Entered", when(flow.mr_cost_date)]],
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
      details: flow.tag_changes.map((t, i) => [`${i + 1}. ${t.previous_tag_status ?? "Not tagged"} → ${t.tag_status}`, `${t.reason ?? "no reason"}${t.changed_by ? ` (${t.changed_by})` : ""} ${t.changed_at ? when(t.changed_at) : ""}`] as [string, string]),
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
      also: { label: `Show flow of report #${c.from_report_id}`, run: () => onShowReportFlow(c.from_report_id) },
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
  // What a box shows: a short title, a status chip, and the remaining lines (no repeats).
  const view = (n: FlowNode): { title: string; chip: string; lines: string[] } => {
    switch (n.kind) {
      case "asset":
        return { title: n.title, chip: n.lines[1] ?? "", lines: n.lines.slice(0, 1) };
      case "report":
        return { title: n.title, chip: n.lines[0] ?? "", lines: n.lines.slice(1) };
      case "fault": {
        // "Moderate → Minor": chip shows the final severity, the line keeps the original.
        const sev = n.lines[0] ?? "";
        const parts = sev.split("→").map((x) => x.trim());
        return parts.length > 1
          ? { title: n.title, chip: parts[1], lines: [`was ${parts[0]}`, ...n.lines.slice(1)] }
          : { title: n.title, chip: sev, lines: n.lines.slice(1) };
      }
      case "decision":
        return { title: "Decision", chip: n.title.replace(/^Decision:\s*/, ""), lines: n.lines };
      case "repair":
        return { title: "Repair", chip: n.title === "Repair verified" ? "Verified" : "Open", lines: n.lines };
      default:
        return { title: n.title, chip: "", lines: n.lines };
    }
  };
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

      <style>{`
        .rf-wrap{overflow:auto;padding:14px 16px 10px}
        .rf-node{cursor:pointer;outline:none}
        .rf-node .rf-card{transition:transform .15s ease, filter .15s ease}
        .rf-node:hover .rf-card,.rf-node:focus-visible .rf-card{transform:translateY(-2px)}
        .rf-edge{fill:none;stroke-width:2;opacity:.55}
        .rf-edge.live{stroke-dasharray:6 6;animation:rf-dash 1.4s linear infinite;opacity:.8}
        @keyframes rf-dash{to{stroke-dashoffset:-24}}
        @media (prefers-reduced-motion:reduce){.rf-edge.live{animation:none}.rf-node .rf-card{transition:none}}
        .rf-legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:11.5px;color:var(--text-soft);padding:10px 4px 2px;border-top:1px solid var(--border);margin-top:6px}
        .rf-legend span{display:inline-flex;align-items:center;gap:6px}
        .rf-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
        .rf-detail-h{display:flex;align-items:center;gap:12px;margin-bottom:14px}
        .rf-detail-ico{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:none}
        .rf-detail-h h2{margin:0 !important;font-size:16px !important;text-transform:none !important;letter-spacing:0 !important;color:var(--text) !important}
        .rf-chip{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;color:#fff;white-space:nowrap}
        .rf-dl{display:grid;grid-template-columns:max-content 1fr;font-size:13px}
        .rf-dl > div{display:contents}
        .rf-dl span{padding:6px 0;border-bottom:1px solid var(--border)}
        .rf-dl span:first-child{color:var(--text-soft);padding-right:24px}
      `}</style>
      <div className="panel rf-wrap">
        <svg width={width} height={height + HEAD} viewBox={`0 0 ${width} ${height + HEAD}`} role="group" aria-label="Document flow diagram">
          <defs>
            <pattern id="rf-dots" width="18" height="18" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.1" fill="var(--text-soft)" opacity="0.18" />
            </pattern>
            <filter id="rf-shadow" x="-10%" y="-10%" width="120%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.12" />
            </filter>
            <filter id="rf-glow" x="-15%" y="-15%" width="130%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#2f6fed" floodOpacity="0.55" />
            </filter>
            {(["neutral", "danger", "warn", "success"] as const).map((t) => (
              <marker key={t} id={`rf-arrow-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={TONE_STROKE[t]} />
              </marker>
            ))}
          </defs>
          <rect x={0} y={0} width={width} height={height + HEAD} fill="url(#rf-dots)" />
          {/* stage lanes + headers */}
          {STAGES.map((label, ci) => {
            const used = nodes.some((n) => Math.round(n.x / COL) === ci);
            if (!used) return null;
            const lx = ci * COL - 8;
            return (
              <g key={label}>
                <rect x={lx} y={4} width={NODE_W + 16} height={height + HEAD - 8} rx={14} fill="var(--text)" opacity={ci % 2 === 0 ? 0.025 : 0.045} />
                <circle cx={lx + 22} cy={24} r={11} fill="var(--accent-blue, #2f6fed)" />
                <text x={lx + 22} y={28} fontSize={11} fontWeight={700} fill="#fff" textAnchor="middle">{ci + 1}</text>
                <text x={lx + 40} y={28} fontSize={11.5} fontWeight={700} fill="var(--text-soft)" letterSpacing="0.08em">{label.toUpperCase()}</text>
              </g>
            );
          })}
          <g transform={`translate(0,${HEAD})`}>
            {edges.map(([a, b], i) => {
              const A = byId.get(a)!, B = byId.get(b)!;
              const x1 = A.x + NODE_W, y1 = A.y + NODE_H / 2, x2 = B.x, y2 = B.y + NODE_H / 2;
              const forward = x2 >= x1;
              const sx = forward ? x1 : A.x + NODE_W / 2, sy = forward ? y1 : A.y;
              const ex = forward ? x2 - 2 : B.x + NODE_W / 2, ey = forward ? y2 : B.y + NODE_H;
              // Forward links share one vertical trunk half-way between the columns, then
              // turn into each target with rounded corners (tidier than fanned curves).
              const mx = sx + (ex - sx) / 2;
              const r = Math.min(12, Math.abs(ey - sy) / 2);
              const dir = ey > sy ? 1 : -1;
              const d = !forward
                ? `M${sx},${sy} C${sx},${sy - 30} ${ex},${ey + 30} ${ex},${ey}`
                : Math.abs(ey - sy) < 1
                  ? `M${sx},${sy} H${ex}`
                  : `M${sx},${sy} H${mx - r} Q${mx},${sy} ${mx},${sy + dir * r} V${ey - dir * r} Q${mx},${ey} ${mx + r},${ey} H${ex}`;
              // Moving dash only on links into something still open: an open repair or a pending decision.
              const live = (B.kind === "repair" && B.tone === "danger") || (B.kind === "decision" && B.tone === "warn");
              return <path key={i} className={`rf-edge${live ? " live" : ""}`} d={d} stroke={TONE_STROKE[B.tone]} markerEnd={`url(#rf-arrow-${B.tone})`} />;
            })}
            {nodes.map((n) => {
              const v = view(n);
              const col = TONE_STROKE[n.tone];
              const isSel = selected === n.id;
              const chipW = v.chip ? Math.min(110, 16 + v.chip.length * 6.3) : 0;
              // Title sits beside the chip; a long title gets the full width and the chip moves below it.
              const besideChars = Math.max(10, Math.floor((NODE_W - 56 - (chipW ? chipW + 14 : 12)) / 7.1));
              const chipBelow = !!v.chip && wrapText(v.title, besideChars).length > 2;
              const titleAll = wrapText(v.title, chipBelow ? Math.floor((NODE_W - 68) / 7.1) : besideChars);
              const titleLines = titleAll.slice(0, 2);
              if (titleAll.length > 2) titleLines[1] = titleLines[1].replace(/.{0,1}$/, "…");
              const subLines = chipBelow ? [] : v.lines.slice(0, 2);
              return (
                <g
                  key={n.id}
                  className="rf-node"
                  transform={`translate(${n.x},${n.y})`}
                  onClick={() => setSelected(n.id)}
                  onDoubleClick={() => canOpen(n) && n.open.run()}
                  tabIndex={0}
                  role="button"
                  aria-label={`${v.title}${v.chip ? `, ${v.chip}` : ""}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(n.id); } }}
                >
                  <g className="rf-card">
                    <rect width={NODE_W} height={NODE_H} rx={14} fill="var(--surface, #fff)" filter={isSel ? "url(#rf-glow)" : "url(#rf-shadow)"}
                      stroke={isSel ? "var(--accent-blue, #2f6fed)" : "var(--border)"} strokeWidth={isSel ? 2.5 : 1} />
                    <rect x={0} y={10} width={4} height={NODE_H - 20} rx={2} fill={col} />
                    <circle cx={30} cy={30} r={16} fill={col} opacity={0.14} />
                    <g transform="translate(20,20) scale(0.84)" fill="none" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d={KIND_ICON[n.kind]} />
                    </g>
                    {titleLines.map((l, i) => (
                      <text key={i} x={56} y={25 + i * 15} fontSize={13} fontWeight={700} fill="var(--text)">{l}</text>
                    ))}
                    {v.chip && (
                      <g transform={chipBelow ? `translate(56,${25 + titleLines.length * 15 - 4})` : `translate(${NODE_W - chipW - 10},12)`}>
                        <rect width={chipW} height={20} rx={10} fill={col} />
                        <text x={chipW / 2} y={14} fontSize={10.5} fontWeight={700} fill="#fff" textAnchor="middle">{v.chip.length > 16 ? v.chip.slice(0, 15) + "…" : v.chip}</text>
                      </g>
                    )}
                    {subLines.map((l, i) => (
                      <text key={i} x={56} y={25 + titleLines.length * 15 + 6 + i * 15} fontSize={11.5} fill="var(--text-soft)">
                        {l.length > 28 ? l.slice(0, 27) + "…" : l}
                      </text>
                    ))}
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
        <div className="rf-legend" aria-label="Legend">
          <span><i style={{ background: TONE_STROKE.danger }} />Critical / Red tag / open repair</span>
          <span><i style={{ background: TONE_STROKE.warn }} />Moderate / pending / escalated</span>
          <span><i style={{ background: TONE_STROKE.success }} />Approved / verified / green</span>
          <span><i style={{ background: TONE_STROKE.neutral }} />Other</span>
          <span>Moving line = still open · double-click a box to open its screen</span>
        </div>
      </div>

      {sel && (() => {
        const v = view(sel);
        const col = TONE_STROKE[sel.tone];
        return (
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="rf-detail-h">
              <span className="rf-detail-ico" style={{ background: `color-mix(in srgb, ${col} 15%, transparent)`, color: col }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={KIND_ICON[sel.kind]} /></svg>
              </span>
              <h2>{sel.title}</h2>
              {v.chip && <span className="rf-chip" style={{ background: col }}>{v.chip}</span>}
            </div>
            <div className="rf-dl">
              {sel.details.map(([k, val], i) => (
                <div key={i}>
                  <span>{k}</span>
                  <span>{val}</span>
                </div>
              ))}
            </div>
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="primary" onClick={sel.open.run} disabled={!canOpen(sel)} title={!canOpen(sel) ? "Your role doesn't have access to that screen" : undefined}>
                {sel.open.label}
              </button>
              {sel.also && <button className="ghost" onClick={sel.also.run}>{sel.also.label}</button>}
              {!canOpen(sel) && <span style={{ fontSize: 11, color: "var(--text-soft)" }}>Your role doesn't have access to that screen.</span>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default ReportFlow;
