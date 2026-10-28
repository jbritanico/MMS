import { useState } from "react";
import { useAssetFlow } from "./hooks/useAssetFlow";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";

interface AssetFlowProps {
  assetId: number;
  onBack: () => void;
  onOpenReport: (reportId: number) => void;
  onShowReportFlow: (reportId: number) => void;
  onOpenAssets: () => void;
  onViewTriggers: (assetId: number, assetCode: string) => void;
}

type Tone = "neutral" | "danger" | "warn" | "success";
type Kind = "asset" | "report" | "tag" | "trigger" | "exemption";

interface Node {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  title: string;
  lines: string[];
  tone: Tone;
  details: [string, string][];
  open: { label: string; run: () => void; needs?: string[] };
  also?: { label: string; run: () => void };
}

interface Edge {
  from: string;
  to: string;
  carry?: boolean;
}

const NODE_W = 210;
const NODE_H = 84;
const COL = 265;
const ROW = 108;
const PAD_Y = 56; // room above the report row for the carried-forward arcs

const TONE_STROKE: Record<Tone, string> = {
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

function tagTone(tag: string | null | undefined): Tone {
  if (tag === "Red") return "danger";
  if (tag === "Yellow") return "warn";
  if (tag === "Green") return "success";
  return "neutral";
}

function shortDate(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

// Asset-level document flow: the asset, its reports in order (with faults carried from one
// report to the next drawn as dashed arcs), every tag change under the report that caused it,
// and the asset's maintenance triggers and MOC exemptions. Read-only and country-scoped.
function AssetFlow({ assetId, onBack, onOpenReport, onShowReportFlow, onOpenAssets, onViewTriggers }: AssetFlowProps) {
  const { user } = useCurrentUser();
  const { data: flow, isLoading, error } = useAssetFlow(assetId, user?.id ?? 0);
  const { data: permissions = [] } = useEffectivePermissions(user?.id ?? 0);
  const [selected, setSelected] = useState<string | null>("asset");

  if (isLoading) return <div className="empty">Loading...</div>;
  if (error || !flow) {
    return (
      <div>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back</button>
        <div className="toast err" style={{ marginTop: 12 }}>Could not load the asset flow: {String(error ?? "not found")}</div>
      </div>
    );
  }

  const code = flow.asset_code ?? "Asset";
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: "asset", kind: "asset", x: 0, y: PAD_Y, title: code,
    lines: [flow.asset_description ?? "", flow.tag_status ? `${flow.tag_status} Tag` : "Not tagged"].filter(Boolean),
    tone: tagTone(flow.tag_status),
    details: [
      ["Asset", code], ["Description", flow.asset_description ?? "—"], ["Type", flow.asset_type ?? "—"],
      ["Country", flow.country ?? "—"], ["Service line", flow.service_line ?? "—"],
      ["Current tag", flow.tag_status ?? "Not tagged"], ["Tag reason", flow.tag_reason ?? "—"],
      ["Reports", String(flow.reports.length)],
    ],
    open: { label: "Open Asset Registry", run: onOpenAssets, needs: ["assets.view"] },
  });

  // Row 0: reports in order.
  const colOf = new Map<number, number>();
  flow.reports.forEach((r, i) => {
    const id = `r${r.id}`;
    colOf.set(r.id, i + 1);
    nodes.push({
      id, kind: "report", x: COL * (i + 1), y: PAD_Y, title: `Report #${r.id}`,
      lines: [
        `${r.status}${r.submitted_date ? ` · ${shortDate(r.submitted_date)}` : ""}`,
        r.fault_count > 0 ? `${r.fault_count} fault${r.fault_count === 1 ? "" : "s"}, ${r.open_fault_count} open` : "No faults",
      ],
      tone: r.open_fault_count > 0 ? "danger" : r.status === "Approved" ? "success" : r.status === "Escalated" ? "warn" : "neutral",
      details: [
        ["Status", r.status], ["Template", r.template_name ?? "—"],
        ["Submitted by", r.submitted_by ?? "—"], ["Submitted", r.submitted_date ?? "—"],
        ["Closed", r.approved_date ?? "—"], ["MR cost", r.mr_cost != null ? String(r.mr_cost) : "—"],
        ["Faults", String(r.fault_count)], ["Open faults", String(r.open_fault_count)],
      ],
      open: { label: "Show flow of this report", run: () => onShowReportFlow(r.id) },
      also: { label: "Open report", run: () => onOpenReport(r.id) },
    });
    edges.push({ from: i === 0 ? "asset" : `r${flow.reports[i - 1].id}`, to: id });
  });

  // Faults carried forward: dashed arcs between the reports involved (one arc per pair).
  const seenCarry = new Set<string>();
  flow.carries.forEach((c) => {
    if (!colOf.has(c.from_report_id) || !colOf.has(c.to_report_id)) return;
    const k = `${c.from_report_id}>${c.to_report_id}`;
    if (seenCarry.has(k)) return;
    seenCarry.add(k);
    edges.push({ from: `r${c.from_report_id}`, to: `r${c.to_report_id}`, carry: true });
  });

  // Under each report: the tag changes it caused. Changes without a report sit after the last report.
  const stack = new Map<number, number>();
  const lastTagInCol = new Map<number, string>();
  flow.tag_changes.forEach((t, i) => {
    const col = t.report_id != null && colOf.has(t.report_id) ? (colOf.get(t.report_id) as number) : flow.reports.length + 1;
    const n = stack.get(col) ?? 0;
    stack.set(col, n + 1);
    const id = `t${i}`;
    nodes.push({
      id, kind: "tag", x: COL * col, y: PAD_Y + ROW * (n + 1),
      title: `Tag: ${t.previous_tag_status ?? "none"} → ${t.tag_status}`,
      lines: [t.reason ?? "", `${t.changed_by ?? ""} ${shortDate(t.changed_at)}`.trim()].filter(Boolean),
      tone: tagTone(t.tag_status),
      details: [
        ["Change", `${t.previous_tag_status ?? "Not tagged"} → ${t.tag_status}`], ["Reason", t.reason ?? "—"],
        ["Caused by report", t.report_id != null ? `#${t.report_id}` : "—"], ["Changed by", t.changed_by ?? "—"], ["Changed", t.changed_at ?? "—"],
      ],
      open: { label: "Open Asset Registry", run: onOpenAssets, needs: ["assets.view"] },
      also: t.report_id != null ? { label: `Show flow of report #${t.report_id}`, run: () => onShowReportFlow(t.report_id as number) } : undefined,
    });
    const prev = lastTagInCol.get(col);
    edges.push({ from: prev ?? (t.report_id != null && colOf.has(t.report_id) ? `r${t.report_id}` : "asset"), to: id });
    lastTagInCol.set(col, id);
  });

  // Under the asset: MOC exemptions, then enabled triggers.
  let assetRow = 1;
  flow.exemptions.forEach((x, i) => {
    const id = `x${i}`;
    nodes.push({
      id, kind: "exemption", x: 0, y: PAD_Y + ROW * assetRow++, title: `MOC ${x.moc_reference}`,
      lines: [x.status, x.valid_until ? `until ${shortDate(x.valid_until)}` : ""].filter(Boolean),
      tone: x.status === "Active" ? "success" : "neutral",
      details: [["Reference", x.moc_reference], ["Status", x.status], ["Valid", `${x.valid_from ?? "—"} to ${x.valid_until ?? "—"}`], ["Approved by", x.approved_by ?? "—"]],
      open: { label: "Open Asset Registry", run: onOpenAssets, needs: ["assets.view"] },
    });
    edges.push({ from: "asset", to: id });
  });
  flow.triggers.filter((t) => t.enabled).forEach((t, i) => {
    const id = `g${i}`;
    const tone: Tone = t.interval_value > 0 && t.running_value >= t.interval_value ? "danger" : t.warning_value > 0 && t.running_value >= t.warning_value ? "warn" : "neutral";
    nodes.push({
      id, kind: "trigger", x: 0, y: PAD_Y + ROW * assetRow++, title: `${t.mr_level} ${t.trigger_type}`,
      lines: [`${t.running_value} / ${t.interval_value}`, t.last_reset_date ? `reset ${shortDate(t.last_reset_date)}` : ""].filter(Boolean),
      tone,
      details: [["Level", t.mr_level], ["Trigger", t.trigger_type], ["Running", String(t.running_value)], ["Warning at", String(t.warning_value)], ["Interval", String(t.interval_value)], ["Last reset", t.last_reset_date ?? "—"]],
      open: { label: "Open triggers", run: () => onViewTriggers(flow.asset_id, code) },
    });
    edges.push({ from: "asset", to: id });
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const width = Math.max(...nodes.map((n) => n.x)) + NODE_W + 20;
  const height = Math.max(...nodes.map((n) => n.y)) + NODE_H + 20;
  const sel = selected ? byId.get(selected) : null;
  const canOpen = (n: Node) => !n.open.needs || n.open.needs.every((p) => permissions.includes(p));

  function edgePath(a: Node, b: Node, carry?: boolean): string {
    if (carry) {
      const sx = a.x + NODE_W / 2, sy = a.y, ex = b.x + NODE_W / 2, ey = b.y;
      return `M${sx},${sy} C${sx},${sy - 50} ${ex},${ey - 50} ${ex},${ey}`;
    }
    if (b.x >= a.x + NODE_W) {
      const sx = a.x + NODE_W, sy = a.y + NODE_H / 2, ex = b.x, ey = b.y + NODE_H / 2;
      return `M${sx},${sy} C${sx + 40},${sy} ${ex - 40},${ey} ${ex},${ey}`;
    }
    // Same column, below: bottom of the source to top of the target.
    const sx = a.x + NODE_W / 2, sy = a.y + NODE_H, ex = b.x + NODE_W / 2, ey = b.y;
    return `M${sx},${sy} C${sx},${sy + 18} ${ex},${ey - 18} ${ex},${ey}`;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back</button>
      </div>
      <div className="header">
        <h1>{code} — Asset history flow</h1>
        <span className="sub">
          {flow.reports.length} report{flow.reports.length === 1 ? "" : "s"} · {flow.tag_status ? `${flow.tag_status} Tag` : "Not tagged"} · dashed arcs = faults carried forward · select a box for details
        </span>
      </div>

      <div className="panel" style={{ overflow: "auto", padding: 16 }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Asset history flow diagram">
          <defs>
            <marker id="aflow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--text-soft)" />
            </marker>
            <marker id="aflow-arrow-carry" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--warn)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const A = byId.get(e.from), B = byId.get(e.to);
            if (!A || !B) return null;
            return (
              <path
                key={i} d={edgePath(A, B, e.carry)} fill="none"
                stroke={e.carry ? "var(--warn)" : "var(--text-soft)"} strokeWidth={e.carry ? 1.8 : 1.4}
                strokeDasharray={e.carry ? "6 4" : undefined} opacity={e.carry ? 0.95 : 0.7}
                markerEnd={e.carry ? "url(#aflow-arrow-carry)" : "url(#aflow-arrow)"}
              />
            );
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
            {sel.also && <button className="ghost" onClick={sel.also.run}>{sel.also.label}</button>}
            {!canOpen(sel) && <span style={{ fontSize: 11, color: "var(--text-soft)" }}>Your role doesn't have access to that screen.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default AssetFlow;
