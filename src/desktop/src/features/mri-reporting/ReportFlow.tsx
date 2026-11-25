import { useState } from "react";
import { useReportFlow, type FlowFault } from "./hooks/useReportFlow";
import { useReportTag } from "./hooks/useReportEdits";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";
import {
  DetailPanel, FlowCard, FlowLink, FX_CSS, Icon, Legend, Section, Stepper,
  day, sevName, sevTone, tagInfo, TONE_COLOR, when, type FlowItem, type Tone,
} from "./flowKit";
import { HintsToggle, useHints } from "../dashboard/hints";
import IsoFlowMap, { FXI_CSS, IsoMapToggle, useIsoMap, type IsoLine, type IsoStep } from "./IsoFlowMap";
import { TIG_CSS } from "../mri-template-builder/TemplateIsoGuide";
import { ADMIN_CSS, ScreenIntro } from "../administration/AdminIsoGuide";
import { KeyGroup, REPORT_KIT_CSS } from "./reportKit";
import JobCompare from "./JobCompare";

export type FlowTarget = "assets" | "pending-approvals" | "rectification-queue";

interface ReportFlowProps {
  reportId: number;
  onBack: () => void;
  onOpenReport: (reportId: number) => void;
  onNavigate: (target: FlowTarget) => void;
  onShowAssetFlow: (assetId: number) => void;
  onShowReportFlow: (reportId: number) => void;
  /** Opened from the dashboards: show only, no links to screens where data can be changed. */
  viewOnly?: boolean;
}

const APPROVAL_PERMS = ["mri.approve", "mri.endorse_report", "mri.record_provisional", "mri.confirm_provisional", "mri.acknowledge_critical"];
const REPAIR_PERMS = ["mri.rectify", "mri.approve", "mri.close_defect"];

/** A fault's decision, in plain words. */
function decisionView(f: FlowFault): { title: string; chip: string; tone: Tone; pending: boolean } {
  const d = f.decision;
  if (d === "Pending") return { title: "Waiting for a decision", chip: "Waiting", tone: "warn", pending: true };
  if (d === "Approved") return { title: "Fault confirmed", chip: `Confirmed as ${sevName(f.new_severity ?? f.original_severity)}`, tone: "success", pending: false };
  if (d === "Reclassified") return { title: "Severity changed", chip: `Now ${sevName(f.new_severity)}`, tone: "info", pending: false };
  if (d === "Rejected") return { title: "Not accepted as a fault", chip: "Rejected", tone: "neutral", pending: false };
  if (d === "Carryforward") return { title: "Carried to a later report", chip: f.carried_to_report_id ? `To report #${f.carried_to_report_id}` : "Carried forward", tone: "warn", pending: false };
  return { title: d, chip: d, tone: "neutral", pending: false };
}

// Document flow for one MR-I report, laid out as a story a field user can follow:
// where the report is now, then one lane per fault (problem found -> decision -> repair),
// then everything else linked to the report. Read-only; a card's details panel opens the
// screen that owns it, when the signed-in user has the permission for that screen.
function ReportFlow({ reportId, onBack, onOpenReport, onNavigate, onShowAssetFlow, onShowReportFlow, viewOnly = false }: ReportFlowProps) {
  const { user } = useCurrentUser();
  const { data: flow, isLoading, error } = useReportFlow(reportId, user?.id ?? 0);
  const { data: permissions = [] } = useEffectivePermissions(user?.id ?? 0);
  const hints = useHints();
  const [selected, setSelected] = useState<string | null>("report");
  const [isoOn, setIsoOn] = useIsoMap();
  const [tab, setTab] = useState<"flow" | "compare">("flow");
  // FB-032 (Manual 8.1 / 8.2): a closed report shows the tag the unit had when it was closed.
  const { data: reportTag } = useReportTag(reportId);

  if (isLoading) return <div className="empty">Loading...</div>;
  if (error || !flow) {
    return (
      <div>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back</button>
        <div className="toast err" style={{ marginTop: 12 }}>Could not load the flow: {String(error ?? "not found")}</div>
      </div>
    );
  }

  const unit = flow.asset_code ?? "Unit";
  const closed = flow.status === "Approved";
  const items = new Map<string, FlowItem>();
  const add = (it: FlowItem) => { items.set(it.id, it); return it; };

  // ---- the unit and the report ----
  const tag = tagInfo(flow.asset_tag_status);
  const unitItem = add({
    id: "asset", icon: "unit", tone: tag.tone, step: "The unit", title: unit,
    chip: flow.asset_tag_status ? `${flow.asset_tag_status} · ${tag.plain}` : tag.plain,
    lines: [flow.asset_description ?? ""],
    details: [["Unit", unit], ["Description", flow.asset_description ?? "—"], ["Tag now", flow.asset_tag_status ?? "Not tagged"], ["Meaning", tag.plain], ["Country", flow.country ?? "—"]],
    open: { label: "Open Asset Registry", run: () => onNavigate("assets"), needs: ["assets.view"], edit: true },
    also: { label: "Show this unit's history", run: () => onShowAssetFlow(flow.asset_id) },
  });
  const reportTone: Tone = closed ? "success" : flow.status === "Escalated" ? "warn" : flow.status === "Draft" ? "neutral" : "info";
  const reportItem = add({
    id: "report", icon: "report", tone: reportTone, step: "The inspection report", title: `MR-I report #${flow.report_id}`,
    chip: closed ? "Closed" : flow.status,
    lines: [flow.template_name ?? "", flow.submitted_by ? `By ${flow.submitted_by}${flow.submitted_date ? `, ${day(flow.submitted_date)}` : ""}` : ""],
    details: [
      ["Status", closed ? "Closed (Approved)" : flow.status], ["Checklist", flow.template_name ?? "—"],
      ["Submitted by", flow.submitted_by ?? "—"], ["Submitted", when(flow.submitted_date)],
      [closed ? "Closed by" : "Endorsed by", flow.approved_by ?? "—"], [closed ? "Closed" : "Endorsed", when(flow.approved_date)],
      ["Faults sent for a decision", String(flow.faults.length)], ["Country", flow.country ?? "—"],
    ],
    open: { label: "Open report", run: () => onOpenReport(flow.report_id) },
  });

  // ---- one lane per fault: problem found -> decision -> repair ----
  const lanes = flow.faults.map((f) => {
    const finalSev = f.new_severity ?? f.original_severity;
    const fault = add({
      id: `f${f.approval_id}`, icon: "fault", tone: sevTone(finalSev), step: "1 · Problem found", title: f.item_name,
      chip: sevName(finalSev),
      lines: [f.new_severity && f.new_severity !== f.original_severity ? `Reported as ${sevName(f.original_severity)}` : "Severity as reported"],
      details: [["Problem", f.item_name], ["Reported severity", sevName(f.original_severity)], ["Final severity", sevName(f.new_severity ?? f.original_severity)],
        ["Carried to report", f.carried_to_report_id ? `#${f.carried_to_report_id}` : "—"]],
      open: { label: "Open Pending Approvals", run: () => onNavigate("pending-approvals"), needs: APPROVAL_PERMS, any: true, edit: true },
      also: f.carried_to_report_id ? { label: `Show report #${f.carried_to_report_id}`, run: () => onShowReportFlow(f.carried_to_report_id as number) } : undefined,
    });
    const dv = decisionView(f);
    const lastLog = f.log.length ? f.log[f.log.length - 1] : null;
    const who = f.reviewer ?? f.assigned_to;
    const phone = lastLog?.review_method === "Phone";
    const decision = add({
      id: `d${f.approval_id}`, icon: dv.pending ? "waiting" : phone ? "phone" : "decision", tone: dv.tone, step: "2 · Decision", title: dv.title, chip: dv.chip,
      lines: [
        who ? `${dv.pending ? "With" : "By"} ${who}` : dv.pending ? "Any reviewer with authority" : "",
        !dv.pending && lastLog ? `${lastLog.review_method === "Phone" ? "By phone" : "In person"}${lastLog.is_provisional ? ", to be confirmed" : ""}` : "",
        f.acknowledged_by ? `Acknowledged by ${f.acknowledged_by}` : "",
      ],
      details: [
        ["Decision", f.decision], ["Reviewer", f.reviewer ?? "—"], ["Assigned to", f.assigned_to ?? "—"],
        ["How", !dv.pending && lastLog ? lastLog.review_method : "—"], ["Phone decision", f.provisional_status ?? "—"],
        ["Acknowledged by", f.acknowledged_by ?? "—"], ["Reminders sent", String(f.reminders)],
        ...f.log.map((l, li): [string, string] => [
          `Step ${li + 1}: ${l.action}${l.is_provisional ? " (by phone, to confirm)" : ""}`,
          `${sevName(l.from_severity)}${l.to_severity && l.to_severity !== l.from_severity ? ` → ${sevName(l.to_severity)}` : ""} · ${l.reviewer} · recorded by ${l.recorded_by} · ${when(l.logged_at)}${l.notes ? ` · ${l.notes}` : ""}`,
        ]),
        ...(f.log.length === 0 ? ([["History", "No decision recorded yet"]] as [string, string][]) : []),
      ],
      open: { label: "Open Pending Approvals", run: () => onNavigate("pending-approvals"), needs: APPROVAL_PERMS, any: true, edit: true },
    });
    let repair: FlowItem;
    let end: { text: string; tone: Tone };
    if (f.repair) {
      const ok = !!f.repair.verified_by;
      repair = add({
        id: `r${f.approval_id}`, icon: ok ? "done" : "repair", tone: ok ? "success" : "danger", step: "3 · Repair",
        title: ok ? "Repaired and checked" : "Repair in progress", chip: ok ? "Done" : f.repair.parts_status ? `Parts: ${f.repair.parts_status}` : "Open",
        lines: [f.repair.assigned_technician ? `Technician: ${f.repair.assigned_technician}` : "No technician yet", ok ? `Checked by ${f.repair.verified_by}` : f.repair.repair_date ? `Planned ${day(f.repair.repair_date)}` : ""],
        details: [
          ["Technician", f.repair.assigned_technician ?? "—"], ["Parts", f.repair.parts_status ?? "—"], ["Repair date", f.repair.repair_date ? day(f.repair.repair_date) : "—"],
          ["What was done", f.repair.action_taken ?? "—"],
          ["Function test", f.repair.function_test_passed == null ? "—" : f.repair.function_test_passed ? "Passed" : "Not passed"],
          ["Checked by", f.repair.verified_by ?? "—"], ["Checked", when(f.repair.verified_date)], ["Tag after repair", f.repair.tag_status ?? "—"],
        ],
        open: { label: "Open Rectification Queue", run: () => onNavigate("rectification-queue"), needs: REPAIR_PERMS, any: true, edit: true },
      });
      end = ok ? { text: "Back in service", tone: "success" } : { text: "Unit waiting for repair", tone: "danger" };
    } else {
      repair = { id: `r${f.approval_id}`, icon: "repair", tone: "neutral", step: "3 · Repair", ghost: true, details: [],
        title: dv.pending ? "Not reached yet" : f.decision === "Rejected" ? "Not needed" : "No repair recorded",
        lines: [dv.pending ? "Comes after the decision" : f.decision === "Carryforward" ? "Follows on the later report" : ""] };
      end = dv.pending ? { text: "Still open", tone: "warn" } : f.decision === "Carryforward" ? { text: "Carried over", tone: "warn" } : { text: "Finished", tone: "success" };
    }
    return { fault, decision, repair, end, livePending: dv.pending, liveRepair: !!f.repair && !f.repair.verified_by };
  });

  // ---- everything else linked to the report ----
  const more: FlowItem[] = [];
  flow.onsite_repairs.forEach((o, i) => more.push(add({
    id: `o${i}`, icon: "done", tone: "success", step: "Fixed on site", title: o.item_name, chip: sevName(o.severity),
    lines: [o.repaired_by ? `By ${o.repaired_by}` : "", o.action_taken ?? ""],
    details: [["Problem", o.item_name], ["Severity", sevName(o.severity)], ["What was done", o.action_taken ?? "—"], ["Fixed by", o.repaired_by ?? "—"], ["When", when(o.repaired_at)]],
    open: { label: "Open report", run: () => onOpenReport(flow.report_id) },
  })));
  flow.carried_in.forEach((c) => more.push(add({
    id: `c${c.approval_id}`, icon: "carried", tone: "warn", step: "Carried in", title: c.item_name, chip: `From report #${c.from_report_id}`,
    lines: ["Still open from an earlier report"],
    details: [["Problem", c.item_name], ["First reported on", `Report #${c.from_report_id}`]],
    open: { label: `Open report #${c.from_report_id}`, run: () => onOpenReport(c.from_report_id) },
    also: { label: `Show report #${c.from_report_id}`, run: () => onShowReportFlow(c.from_report_id) },
  })));
  if (flow.mr_cost != null) more.push(add({
    id: "cost", icon: "cost", tone: "neutral", step: "Cost", title: `MR cost ${flow.mr_cost.toLocaleString()}`,
    lines: [flow.mr_cost_by ? `Entered by ${flow.mr_cost_by}` : "", flow.mr_cost_date ? day(flow.mr_cost_date) : ""],
    details: [["MR cost", flow.mr_cost.toLocaleString()], ["Entered by", flow.mr_cost_by ?? "—"], ["Entered", when(flow.mr_cost_date)]],
    open: { label: "Open report", run: () => onOpenReport(flow.report_id) },
  }));
  flow.exemptions.forEach((x, i) => more.push(add({
    id: `x${i}`, icon: "shield", tone: x.status === "Active" ? "success" : "neutral", step: "MOC exemption", title: `MOC ${x.moc_reference}`, chip: x.status,
    lines: [x.valid_until ? `Valid until ${day(x.valid_until)}` : "", x.approved_by ? `Approved by ${x.approved_by}` : ""],
    details: [["Reference", x.moc_reference], ["Status", x.status], ["Valid", `${day(x.valid_from)} to ${day(x.valid_until)}`], ["Approved by", x.approved_by ?? "—"]],
    open: { label: "Open Asset Registry", run: () => onNavigate("assets"), needs: ["assets.view"], edit: true },
  })));
  const tagItem = flow.tag_changes.length ? add({
    id: "tag", icon: "tag", tone: tagInfo(flow.tag_changes[flow.tag_changes.length - 1].tag_status).tone, step: "Tag changes", title: "Tag history from this report",
    chip: flow.tag_changes[flow.tag_changes.length - 1].tag_status, lines: [],
    details: flow.tag_changes.map((t, i): [string, string] => [`${i + 1}. ${t.previous_tag_status ?? "Not tagged"} → ${t.tag_status}`, `${t.reason ?? "No reason given"}${t.changed_by ? ` · ${t.changed_by}` : ""} · ${when(t.changed_at)}`]),
    open: { label: "Open Asset Registry", run: () => onNavigate("assets"), needs: ["assets.view"], edit: true },
  }) : null;

  // ---- where is this report? ----
  const pendingN = flow.faults.filter((f) => f.decision === "Pending").length;
  const repairs = flow.faults.filter((f) => f.repair);
  const openRepairs = repairs.filter((f) => !f.repair!.verified_by).length;
  const submitted = !!flow.submitted_date && flow.status !== "Draft";
  const reviewed = ["Endorsed", "Escalated", "Approved"].includes(flow.status);
  const st = (done: boolean, skip = false) => (skip ? "skip" : done ? "done" : "todo") as "done" | "todo" | "skip";
  const steps = [
    { label: "Submitted", sub: submitted ? day(flow.submitted_date) : "Not yet", state: st(submitted) },
    { label: "Supervisor review", sub: reviewed ? (flow.approved_by ?? "Done") : "Waiting", state: st(reviewed) },
    { label: "Fault decisions", sub: flow.faults.length === 0 ? "None needed" : pendingN ? `${pendingN} waiting` : "All decided", state: st(pendingN === 0, flow.faults.length === 0) },
    { label: "Repairs", sub: repairs.length === 0 ? "None needed" : openRepairs ? `${openRepairs} open` : "All checked", state: st(openRepairs === 0, repairs.length === 0) },
    { label: "Report closed", sub: closed ? day(flow.approved_date) : "Not yet", state: st(closed) },
  ];
  const nowIdx = steps.findIndex((s) => s.state === "todo");
  const stepsShown = steps.map((s, i) => (i === nowIdx ? { ...s, state: "now" as const } : s));
  const nextWho = flow.faults.find((f) => f.decision === "Pending");
  const nowText = !submitted ? "This report has not been submitted yet."
    : closed ? "This report is closed. Nothing is waiting."
    : pendingN ? `${pendingN} fault${pendingN === 1 ? " is" : "s are"} waiting for a decision${nextWho?.assigned_to ? ` from ${nextWho.assigned_to}` : ""}.`
    : openRepairs ? `${openRepairs} repair${openRepairs === 1 ? " is" : "s are"} still in progress.`
    : !reviewed ? "Waiting for the Supervisor to review the report."
    : "Everything is done. Waiting for the report to be closed.";

  // ---- isometric map: the same five steps, each with a small card of what is in it ----
  const MAXL = 3;
  const faultLines: IsoLine[] = lanes.map((l) => ({ text: `${l.decision.chip}: ${l.fault.title}`, tone: l.decision.tone, id: l.decision.id }));
  const repairLanes = lanes.filter((l) => !l.repair.ghost);
  const repairLines: IsoLine[] = repairLanes.map((l) => ({ text: `${l.repair.chip ?? l.repair.title}: ${l.fault.title}`, tone: l.repair.tone, id: l.repair.id }));
  const firstPending = lanes.find((l) => l.livePending) ?? lanes[0];
  const firstRepair = repairLanes.find((l) => l.liveRepair) ?? repairLanes[0];
  // FB-032: the tag at closure (closed report) and the unit's tag today, each labelled.
  const atClose = closed && !!reportTag?.closed && !!reportTag.as_of;
  const closeTag = atClose ? reportTag!.tag_status ?? null : null;
  const nowTag = flow.asset_tag_status ?? null;
  const reportTagPill = atClose
    ? { text: `${closeTag ?? "Not tagged"} at closure`, tone: tagInfo(closeTag).tone }
    : { text: nowTag ? `${nowTag} tag now` : "Not tagged", tone: tag.tone };
  const closedTagLines: IsoLine[] = atClose
    ? [{ text: `Tag at closure: ${closeTag ?? "Not tagged"}`, tone: tagInfo(closeTag).tone }, ...(closeTag !== nowTag ? [{ text: `Tag now: ${nowTag ?? "Not tagged"}`, tone: tagInfo(nowTag).tone }] : [])]
    : [{ text: `Tag now: ${nowTag ?? "Not tagged"}`, tone: tagInfo(nowTag).tone }];
  const isoSteps: IsoStep[] = [
    { label: "Submitted", sub: stepsShown[0].sub ?? "", state: stepsShown[0].state, icon: "report", cardTitle: `Report #${flow.report_id}`, selectId: "report",
      lines: [{ text: flow.template_name ?? "MR-I checklist", tone: "info" }, { text: flow.submitted_by ? `By ${flow.submitted_by}` : "Not submitted yet", tone: submitted ? "success" : "neutral" }, { text: `${flow.faults.length} fault${flow.faults.length === 1 ? "" : "s"} for decision`, tone: flow.faults.length ? "warn" : "success" }] },
    { label: "Supervisor review", sub: stepsShown[1].sub ?? "", state: stepsShown[1].state, icon: "people", cardTitle: "Review", selectId: "report",
      lines: [{ text: reviewed ? `${flow.status} by ${flow.approved_by ?? "Supervisor"}` : "Waiting for the Supervisor", tone: reviewed ? "success" : "warn" }, { text: `Status: ${closed ? "Closed" : flow.status}`, tone: reportTone }] },
    { label: "Fault decisions", sub: stepsShown[2].sub ?? "", state: stepsShown[2].state, icon: "decide", cardTitle: `Decisions (${lanes.length})`, selectId: firstPending ? firstPending.decision.id : null,
      lines: faultLines.length ? faultLines.slice(0, MAXL) : [{ text: "No decisions needed", tone: "success" }], more: Math.max(0, faultLines.length - MAXL) },
    { label: "Repairs", sub: stepsShown[3].sub ?? "", state: stepsShown[3].state, icon: "repair", cardTitle: `Repairs (${repairLanes.length})`, selectId: firstRepair ? firstRepair.repair.id : null,
      lines: repairLines.length ? repairLines.slice(0, MAXL) : [{ text: "No repairs needed", tone: "success" }], more: Math.max(0, repairLines.length - MAXL) },
    { label: "Report closed", sub: stepsShown[4].sub ?? "", state: stepsShown[4].state, icon: "archive", cardTitle: closed ? "Closed" : "Not closed yet", selectId: tagItem ? tagItem.id : "report",
      lines: [{ text: closed ? `Closed ${day(flow.approved_date)}` : "Still open", tone: closed ? "success" : "warn" }, ...closedTagLines, ...(more.length ? [{ text: `${more.length} more linked item${more.length === 1 ? "" : "s"}`, tone: "neutral" as const }] : [])] },
  ];

  const sel = selected ? items.get(selected) ?? null : null;
  const pick = (id: string) => setSelected(id);

  return (
    <div className={`fx${hints ? " show-hints" : ""}`}>
      <style>{FX_CSS}</style>
      <style>{FXI_CSS}</style>
      <style>{TIG_CSS + ADMIN_CSS + REPORT_KIT_CSS}</style>
      <div className="fx-top">
        <button type="button" className="fx-back" onClick={onBack}><Icon name="back" size={15} />Back</button>
        <HintsToggle className="fx-hint-btn" />
      </div>

      <header className="fx-hero">
        <span className="fx-hero-pic"><Icon name="report" /></span>
        <div className="fx-hero-body">
          <span className="fx-eyebrow">Document flow · {unit}{viewOnly && <span className="fx-badge"><Icon name="shield" size={12} />View only</span>}</span>
          <h1>MR-I report #{flow.report_id}</h1>
          <p>Follow this report from the inspection to the last repair. Each card is one step; select it to see the details and open its screen.</p>
          <span className="fx-now"><Icon name={closed ? "done" : "waiting"} size={18} />{nowText}</span>
        </div>
        <div className="fx-hero-stats">
          <div className="fx-stat"><b>{flow.faults.length}</b><span>Faults for decision</span></div>
          <div className="fx-stat"><b>{pendingN}</b><span>Waiting for decision</span></div>
          <div className="fx-stat"><b>{openRepairs}</b><span>Repairs open</span></div>
        </div>
      </header>

      <div className="tig no-print">
        <ScreenIntro
          glyph="report"
          label="Document flow: what you'll do here"
          kpis={[
            { label: "faults for decision", value: flow.faults.length, tone: "blue" },
            { label: "waiting for a decision", value: pendingN, tone: pendingN ? "look" : "skip" },
            { label: "repairs open", value: openRepairs, tone: openRepairs ? "look" : "skip" },
          ]}
          explain="This page follows one MR-I report from the inspection to the last repair: its faults, the decisions on them, the repairs and the tag changes."
          todo={[
            "Click a tile on the map to see its details and open its screen",
            "Use search and the legend to find a fault or a step",
            "Switch to Simple steps for a plain list",
            "Use Pre-Job vs Post-Job to see what changed during the job",
          ]}
        />
      </div>

      <div className="tig rk no-print fx-tabs">
        <KeyGroup label="Document flow parts" small value={tab} onChange={setTab}
          options={[{ id: "flow", label: "Document flow" }, { id: "compare", label: "Pre-Job vs Post-Job" }]} />
      </div>

      {tab === "compare" ? (
        <JobCompare reportId={flow.report_id} onOpenReport={onOpenReport} />
      ) : (
      <>
      <IsoMapToggle iso={isoOn} onChange={setIsoOn} />
      <div className={isoOn ? "fxi-print-only" : undefined}><Stepper steps={stepsShown} /></div>

      <div className="fx-body">
        <div className="fx-main">
          {isoOn && (
            <IsoFlowMap steps={isoSteps} selected={selected} onSelect={pick}
              hub={{ title: `MR-I report #${flow.report_id}`, sub: `${unit} · ${closed ? "Closed" : flow.status}`, icon: "report", selectId: "report", tag: reportTagPill }}
              aside={{ title: unit, sub: flow.asset_description ?? "No description", tag: { text: nowTag ? `${nowTag} now` : "Not tagged", tone: tag.tone },
                rows: [["Report", `#${flow.report_id}`], ["Checklist", flow.template_name ?? "—"], ["Country", flow.country ?? "—"]] }} />
          )}
          <Section title="The unit and the report" hint="Where this inspection started.">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 56px minmax(0,1fr)", alignItems: "stretch" }}>
              <FlowCard item={unitItem} selected={selected === unitItem.id} onSelect={pick} />
              <FlowLink tone="info" />
              <FlowCard item={reportItem} selected={selected === reportItem.id} onSelect={pick} />
            </div>
          </Section>

          <Section
            title={`What happened to each fault (${lanes.length})`}
            hint="Each row follows one fault: found → decision → repair. A moving line means that step is still open."
          >
            {lanes.length === 0 ? (
              <div className="fx-empty">No Moderate or Major / Critical faults on this report, so no decisions or repairs were needed.</div>
            ) : (
              <div className="fx-lanes">
                {lanes.map((l) => (
                  <div key={l.fault.id} className="fx-lane" style={{ ["--tone" as string]: TONE_COLOR[l.end.tone] }}>
                    <FlowCard item={l.fault} selected={selected === l.fault.id} onSelect={pick} />
                    <FlowLink tone={l.decision.tone} live={l.livePending} />
                    <FlowCard item={l.decision} selected={selected === l.decision.id} onSelect={pick} />
                    <FlowLink tone={l.repair.ghost ? "neutral" : l.repair.tone} live={l.liveRepair} />
                    <FlowCard item={l.repair} selected={selected === l.repair.id} onSelect={pick} />
                    <FlowLink tone={l.end.tone} />
                    <div className="fx-lane-end"><span className="fx-endcap" style={{ ["--tone" as string]: TONE_COLOR[l.end.tone] }}>{l.end.text}</span></div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {(more.length > 0 || tagItem) && (
            <Section title="Also linked to this report">
              {tagItem && (
                <div className={`fx-tags is-click${selected === tagItem.id ? " is-sel" : ""}`} style={{ marginBottom: more.length ? 14 : 0 }} role="button" tabIndex={0}
                  onClick={() => pick(tagItem.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(tagItem.id); } }}
                  aria-label="Tag history from this report">
                  <span className="fx-step" style={{ marginRight: 4 }}>Tag history</span>
                  {flow.tag_changes.map((t, i) => (
                    <span key={i} style={{ display: "contents" }}>
                      {i === 0 && <span className="fx-tagpill" style={{ ["--tone" as string]: TONE_COLOR[tagInfo(t.previous_tag_status).tone] }}><i />{t.previous_tag_status ?? "Not tagged"}</span>}
                      <span className="fx-tag-arrow">→</span>
                      <span className="fx-tagpill" style={{ ["--tone" as string]: TONE_COLOR[tagInfo(t.tag_status).tone] }} title={t.reason ?? ""}>
                        <i />{t.tag_status}<small>{day(t.changed_at)}</small>
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {more.length > 0 && <div className="fx-grid">{more.map((m) => <FlowCard key={m.id} item={m} selected={selected === m.id} onSelect={pick} compact />)}</div>}
            </Section>
          )}

          <Legend items={[
            { tone: "danger", text: "Major / Critical, Red tag or repair open" },
            { tone: "warn", text: "Moderate, waiting or carried over" },
            { tone: "success", text: "Confirmed, repaired, Green" },
            { tone: "info", text: "Minor, in progress" },
            { tone: "neutral", text: "Not reached yet / other" },
          ]} />
        </div>

        <DetailPanel item={sel && !sel.ghost ? sel : null} permissions={permissions} onClose={() => setSelected(null)} viewOnly={viewOnly} />
      </div>
      </>
      )}
    </div>
  );
}

export default ReportFlow;
