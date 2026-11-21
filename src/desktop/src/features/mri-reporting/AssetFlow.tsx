import { useMemo, useState } from "react";
import { useAssetFlow, type AssetFlowTrigger } from "./hooks/useAssetFlow";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useAssetTypes } from "../administration/hooks/useAssetTypes";
import {
  DetailPanel, FlowCard, FlowLink, FX_CSS, Icon, Legend, Section,
  day, tagInfo, TONE_COLOR, when, type FlowItem, type Tone,
} from "./flowKit";
import { HintsToggle, useHints } from "../dashboard/hints";
import { triggerColor, triggerIcon, triggerIconBg } from "../../components/triggerIcons";
import IsoFlowMap, { FXI_CSS, IsoMapToggle, IsoTimeline, useIsoMap, type IsoLine, type IsoState, type IsoStep, type IsoTlNode } from "./IsoFlowMap";

interface AssetFlowProps {
  assetId: number;
  onBack: () => void;
  onOpenReport: (reportId: number) => void;
  onShowReportFlow: (reportId: number) => void;
  onOpenAssets: () => void;
  onViewTriggers: (assetId: number, assetCode: string) => void;
  /** Opened from the dashboards: show only, no links to screens where data can be changed. */
  viewOnly?: boolean;
}

const COUNTER_NAME: Record<string, string> = { OH: "Operating hours", CA: "Calendar days", KM: "Distance", RIF: "Running-in-foot", EH: "Engine hours" };
const COUNTER_UNIT: Record<string, string> = { OH: "h", CA: "days", KM: "km", RIF: "ft", EH: "h" };
const counterState = (t: AssetFlowTrigger): { tone: Tone; text: string } =>
  t.interval_value > 0 && t.running_value >= t.interval_value ? { tone: "danger", text: "Due now" }
    : t.warning_value > 0 && t.running_value >= t.warning_value ? { tone: "warn", text: "Due soon" }
    : { tone: "success", text: "On track" };

// Asset history flow for one unit, laid out so anyone can read it: the unit and its tag now,
// its MR-I reports in date order from left to right (faults carried from one report to the
// next shown between them, and the tag changes each report caused shown under it), then its
// MR-II / MR-III counters and MOC exemptions. Read-only and country-scoped.
function AssetFlow({ assetId, onBack, onOpenReport, onShowReportFlow, onOpenAssets, onViewTriggers, viewOnly = false }: AssetFlowProps) {
  const { user } = useCurrentUser();
  const { data: flow, isLoading, error } = useAssetFlow(assetId, user?.id ?? 0);
  const { data: permissions = [] } = useEffectivePermissions(user?.id ?? 0);
  const hints = useHints();
  const { data: registry = [] } = useAssets();
  const { data: assetTypes = [] } = useAssetTypes();
  const [selected, setSelected] = useState<string | null>("asset");
  const [isoOn, setIsoOn] = useIsoMap();

  const carriesBetween = useMemo(() => {
    const m = new Map<string, string[]>();
    (flow?.carries ?? []).forEach((c) => { const k = `${c.from_report_id}>${c.to_report_id}`; m.set(k, [...(m.get(k) ?? []), c.item_name]); });
    return m;
  }, [flow]);

  if (isLoading) return <div className="empty">Loading...</div>;
  if (error || !flow) {
    return (
      <div>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back</button>
        <div className="toast err" style={{ marginTop: 12 }}>Could not load the asset flow: {String(error ?? "not found")}</div>
      </div>
    );
  }

  const code = flow.asset_code ?? "Unit";
  const tag = tagInfo(flow.tag_status);
  const typeId = registry.find((a) => a.id === flow.asset_id)?.asset_type_id;
  const pic = typeId != null ? assetTypes.find((t) => t.id === typeId)?.icon : undefined;
  const items = new Map<string, FlowItem>();
  const add = (it: FlowItem) => { items.set(it.id, it); return it; };

  add({
    id: "asset", icon: "unit", tone: tag.tone, step: "The unit", title: code, chip: flow.tag_status ? `${flow.tag_status} · ${tag.plain}` : tag.plain,
    lines: [flow.asset_description ?? ""],
    details: [
      ["Unit", code], ["Description", flow.asset_description ?? "—"], ["Equipment type", flow.asset_type ?? "—"],
      ["Country", flow.country ?? "—"], ["Service line", flow.service_line ?? "—"],
      ["Tag now", flow.tag_status ?? "Not tagged"], ["Meaning", tag.plain], ["Tag reason", flow.tag_reason ?? "—"],
      ["MR-I reports", String(flow.reports.length)],
    ],
    open: { label: "Open Asset Registry", run: onOpenAssets, needs: ["assets.view"], edit: true },
  });

  // Reports, oldest first, each with the tag changes it caused.
  const reports = flow.reports.map((r, i) => {
    const tone: Tone = r.open_fault_count > 0 ? "danger" : r.status === "Approved" ? "success" : r.status === "Escalated" ? "warn" : r.status === "Draft" ? "neutral" : "info";
    const item = add({
      id: `r${r.id}`, icon: "report", tone, step: `Report ${i + 1} of ${flow.reports.length}`, title: `MR-I report #${r.id}`,
      chip: r.status === "Approved" ? "Closed" : r.status,
      lines: [
        r.submitted_date ? day(r.submitted_date) : "Not submitted",
        r.fault_count === 0 ? "No faults found" : `${r.fault_count} fault${r.fault_count === 1 ? "" : "s"}${r.open_fault_count ? `, ${r.open_fault_count} still open` : ", all closed"}`,
      ],
      details: [
        ["Status", r.status === "Approved" ? "Closed (Approved)" : r.status], ["Checklist", r.template_name ?? "—"],
        ["Submitted by", r.submitted_by ?? "—"], ["Submitted", when(r.submitted_date)], ["Closed", when(r.approved_date)],
        ["Faults found", String(r.fault_count)], ["Still open", String(r.open_fault_count)], ["MR cost", r.mr_cost != null ? r.mr_cost.toLocaleString() : "—"],
      ],
      open: { label: "Show this report's flow", run: () => onShowReportFlow(r.id) },
      also: { label: "Open report", run: () => onOpenReport(r.id) },
    });
    const tags = flow.tag_changes.map((t, ti) => ({ t, ti })).filter(({ t }) => t.report_id === r.id).map(({ t, ti }) => add({
      id: `t${ti}`, icon: "tag", tone: tagInfo(t.tag_status).tone, step: "Tag changed", title: `${t.previous_tag_status ?? "Not tagged"} → ${t.tag_status}`,
      chip: tagInfo(t.tag_status).plain, lines: [t.reason ?? "", day(t.changed_at)],
      details: [["Change", `${t.previous_tag_status ?? "Not tagged"} → ${t.tag_status}`], ["Meaning", tagInfo(t.tag_status).plain], ["Reason", t.reason ?? "—"],
        ["Caused by", `Report #${r.id}`], ["Changed by", t.changed_by ?? "—"], ["When", when(t.changed_at)]],
      open: { label: "Open Asset Registry", run: onOpenAssets, needs: ["assets.view"], edit: true },
      also: { label: `Show report #${r.id}'s flow`, run: () => onShowReportFlow(r.id) },
    }));
    return { r, item, tags };
  });
  const loose = flow.tag_changes.map((t, ti) => ({ t, ti })).filter(({ t }) => t.report_id == null || !flow.reports.some((r) => r.id === t.report_id)).map(({ t, ti }) => add({
    id: `t${ti}`, icon: "tag", tone: tagInfo(t.tag_status).tone, step: "Tag changed", title: `${t.previous_tag_status ?? "Not tagged"} → ${t.tag_status}`,
    chip: tagInfo(t.tag_status).plain, lines: [t.reason ?? "", day(t.changed_at)],
    details: [["Change", `${t.previous_tag_status ?? "Not tagged"} → ${t.tag_status}`], ["Reason", t.reason ?? "—"], ["Changed by", t.changed_by ?? "—"], ["When", when(t.changed_at)]],
    open: { label: "Open Asset Registry", run: onOpenAssets, needs: ["assets.view"], edit: true },
  }));

  // Counters (MR-II / MR-III) and MOC exemptions.
  const counters = flow.triggers.filter((t) => t.enabled).map((t, i) => {
    const s = counterState(t);
    const unit = COUNTER_UNIT[t.trigger_type] ?? "";
    const pct = t.interval_value > 0 ? Math.min(100, (t.running_value / t.interval_value) * 100) : 0;
    const it = add({
      id: `g${i}`, icon: "counter", glyph: { node: triggerIcon(t.trigger_type), color: triggerColor(t.trigger_type), bg: triggerIconBg(t.trigger_type) }, tone: s.tone, step: `${t.mr_level} counter`, title: COUNTER_NAME[t.trigger_type] ?? t.trigger_type, chip: s.text,
      lines: [`${t.running_value.toLocaleString()} of ${t.interval_value.toLocaleString()} ${unit} (${Math.round(pct)}%)`, t.last_reset_date ? `Since ${day(t.last_reset_date)}` : ""],
      details: [["Level", t.mr_level], ["Counter", COUNTER_NAME[t.trigger_type] ?? t.trigger_type], ["Used so far", `${t.running_value.toLocaleString()} ${unit}`],
        ["Warning at", `${t.warning_value.toLocaleString()} ${unit}`], ["Due at", `${t.interval_value.toLocaleString()} ${unit}`], ["Last reset", day(t.last_reset_date)], ["Status", s.text]],
      open: { label: "Open counters (triggers)", run: () => onViewTriggers(flow.asset_id, code), edit: true },
    });
    return { it, pct };
  });
  const exemptions = flow.exemptions.map((x, i) => add({
    id: `x${i}`, icon: "shield", tone: x.status === "Active" ? "success" : "neutral", step: "MOC exemption", title: `MOC ${x.moc_reference}`, chip: x.status,
    lines: [x.valid_until ? `Valid until ${day(x.valid_until)}` : "", x.approved_by ? `Approved by ${x.approved_by}` : ""],
    details: [["Reference", x.moc_reference], ["Status", x.status], ["Valid", `${day(x.valid_from)} to ${day(x.valid_until)}`], ["Approved by", x.approved_by ?? "—"]],
    open: { label: "Open Asset Registry", run: onOpenAssets, needs: ["assets.view"], edit: true },
  }));

  // Reports that still have an open fault (a fault carried forward stays on the report that found it).
  const reportsOpen = flow.reports.filter((r) => r.open_fault_count > 0).length;
  const last = flow.reports[flow.reports.length - 1];
  const sel = selected ? items.get(selected) ?? null : null;
  const pick = (id: string) => setSelected(id);
  const assetItem = items.get("asset")!;

  // ---- isometric map: the unit's story in five platforms ----
  const MAXL = 3;
  const newest = [...reports].reverse();
  const reportLines: IsoLine[] = newest.map(({ r, item }) => ({ text: `#${r.id} · ${item.chip ?? r.status} · ${r.submitted_date ? day(r.submitted_date) : "draft"}`, tone: item.tone, id: item.id }));
  const openReports = newest.filter(({ r }) => r.open_fault_count > 0);
  const totalFaults = flow.reports.reduce((n, r) => n + r.fault_count, 0);
  const carriedN = (flow.carries ?? []).length;
  const faultLines: IsoLine[] = [
    ...openReports.map(({ r, item }) => ({ text: `#${r.id}: ${r.open_fault_count} still open`, tone: "danger" as const, id: item.id })),
    ...(carriedN ? [{ text: `${carriedN} carried to a later report`, tone: "warn" as const }] : []),
  ];
  const tagItems = flow.tag_changes.map((_, ti) => items.get(`t${ti}`)).filter((x): x is FlowItem => !!x).reverse();
  const tagLines: IsoLine[] = tagItems.map((t) => ({ text: `${t.title}${t.lines[1] ? ` · ${t.lines[1]}` : ""}`, tone: t.tone, id: t.id }));
  const dueNow = counters.filter((c) => c.it.tone === "danger"), dueSoon = counters.filter((c) => c.it.tone === "warn");
  const counterLines: IsoLine[] = [
    ...[...dueNow, ...dueSoon, ...counters.filter((c) => c.it.tone === "success")].map(({ it, pct }) => ({ text: `${(it.step ?? "").replace(" counter", "")} ${it.title}: ${Math.round(pct)}%`, tone: it.tone, id: it.id })),
    ...exemptions.map((x) => ({ text: `${x.title} · ${x.chip ?? ""}`, tone: x.tone, id: x.id })),
  ];
  const cut = (l: IsoLine[]) => ({ lines: l.slice(0, MAXL), more: Math.max(0, l.length - MAXL) });
  const faultState: IsoState = openReports.length ? "now" : totalFaults ? "done" : flow.reports.length ? "skip" : "todo";
  const counterState2: IsoState = dueNow.length || dueSoon.length ? "now" : counters.length ? "done" : "skip";
  const isoSteps: IsoStep[] = [
    { label: "The unit", sub: flow.asset_type ?? "Unit", state: "done", stateLabel: flow.tag_status ? `${flow.tag_status} tag` : "Not tagged", stateTone: tag.tone, icon: "unit", cardTitle: code, selectId: "asset",
      lines: [{ text: flow.tag_status ? `${flow.tag_status} · ${tag.plain}` : tag.plain, tone: tag.tone }, ...(flow.tag_reason ? [{ text: flow.tag_reason, tone: tag.tone }] : []), { text: `${flow.country ?? "—"} · ${flow.service_line ?? "—"}`, tone: "neutral" as const }] },
    { label: "Inspections", sub: `${flow.reports.length} MR-I report${flow.reports.length === 1 ? "" : "s"}`, state: flow.reports.length ? "done" : "todo", stateLabel: flow.reports.length ? `Last ${last?.submitted_date ? day(last.submitted_date) : "—"}` : "None yet",
      icon: "report", cardTitle: `Reports (${flow.reports.length})`, selectId: newest[0]?.item.id ?? null, ...cut(reportLines.length ? reportLines : [{ text: "No reports yet", tone: "neutral" }]) },
    { label: "Faults", sub: openReports.length ? `${openReports.length} report${openReports.length === 1 ? "" : "s"} with open faults` : totalFaults ? `${totalFaults} found, all closed` : "None found", state: faultState,
      stateLabel: openReports.length ? "Needs attention" : undefined, stateTone: openReports.length ? "danger" : undefined, icon: "decide", cardTitle: `Faults (${totalFaults})`, selectId: openReports[0]?.item.id ?? newest[0]?.item.id ?? null,
      ...cut(faultLines.length ? faultLines : [{ text: totalFaults ? "All faults closed" : "No faults found", tone: "success" }]) },
    { label: "Tag changes", sub: `${flow.tag_changes.length} change${flow.tag_changes.length === 1 ? "" : "s"}`, state: flow.tag_changes.length ? "done" : "skip", icon: "tag", cardTitle: "Tag history", selectId: tagItems[0]?.id ?? null,
      ...cut(tagLines.length ? tagLines : [{ text: "No tag changes", tone: "neutral" }]) },
    { label: "MR-II / MR-III", sub: dueNow.length ? `${dueNow.length} due now` : dueSoon.length ? `${dueSoon.length} due soon` : counters.length ? "On track" : "No counters", state: counterState2,
      stateLabel: dueNow.length ? "Due now" : dueSoon.length ? "Due soon" : undefined, stateTone: dueNow.length ? "danger" : dueSoon.length ? "warn" : undefined, icon: "gauge", cardTitle: "Counters", selectId: (dueNow[0] ?? dueSoon[0] ?? counters[0])?.it.id ?? exemptions[0]?.id ?? null,
      ...cut(counterLines.length ? counterLines : [{ text: "No counters set", tone: "neutral" }]) },
  ];

  return (
    <div className={`fx${hints ? " show-hints" : ""}`}>
      <style>{FX_CSS}</style>
      <style>{FXI_CSS}</style>
      <div className="fx-top">
        <button type="button" className="fx-back" onClick={onBack}><Icon name="back" size={15} />Back</button>
        <HintsToggle className="fx-hint-btn" />
      </div>

      <header className="fx-hero">
        <span className="fx-hero-pic">{pic && pic.trim().startsWith("data:") ? <img src={pic} alt="" /> : <Icon name="unit" />}</span>
        <div className="fx-hero-body">
          <span className="fx-eyebrow">Asset history · {flow.asset_type ?? "Unit"}{viewOnly && <span className="fx-badge"><Icon name="shield" size={12} />View only</span>}</span>
          <h1>{code}{flow.asset_description ? ` · ${flow.asset_description}` : ""}</h1>
          <p>Everything that happened to this unit, oldest on the left. Select a card to see its details and open its screen.</p>
          <span className="fx-tagbig" style={{ ["--tone" as string]: TONE_COLOR[tag.tone] }}>
            <i />{flow.tag_status ? `${flow.tag_status} tag` : "Not tagged"} <small>· {tag.plain}{flow.tag_reason ? ` · ${flow.tag_reason}` : ""}</small>
          </span>
        </div>
        <div className="fx-hero-stats">
          <div className="fx-stat"><b>{flow.reports.length}</b><span>MR-I reports</span></div>
          <div className="fx-stat"><b>{reportsOpen}</b><span>Reports with open faults</span></div>
          <div className="fx-stat"><b>{last?.submitted_date ? day(last.submitted_date) : "—"}</b><span>Last inspection</span></div>
        </div>
      </header>

      <IsoMapToggle iso={isoOn} onChange={setIsoOn} />

      <div className="fx-body">
        <div className="fx-main">
          {isoOn && (
            <IsoFlowMap steps={isoSteps} selected={selected} onSelect={pick} label="Asset history map"
              loop={{ title: "Next MR-I inspection", sub: "Each new report adds to this unit's history" }}
              aside={{ title: code, sub: flow.asset_description ?? "No description", tag: { text: flow.tag_status ?? "Not tagged", tone: tag.tone },
                rows: [["Type", flow.asset_type ?? "—"], ["Reports", String(flow.reports.length)], ["Country", flow.country ?? "—"]] }} />
          )}
          <Section
            title={`Inspection timeline (${flow.reports.length})`}
            hint="Reports from oldest to newest. Orange badges show faults that stayed open and moved to the next report. Tag changes sit under the report that caused them."
          >
            {isoOn ? (
              <IsoTimeline selected={selected} onSelect={pick} nodes={[
                { id: "asset", kind: "unit", title: code, sub: flow.asset_type ?? "The unit", chip: flow.tag_status ? `${flow.tag_status} tag` : "Not tagged", tone: tag.tone, tags: [] },
                ...reports.map(({ r, item, tags }, i): IsoTlNode => {
                  const prev = i > 0 ? flow.reports[i - 1].id : null;
                  const carried = prev != null ? carriesBetween.get(`${prev}>${r.id}`) ?? [] : [];
                  const fromOlder = [...carriesBetween.entries()].filter(([k]) => k.endsWith(`>${r.id}`) && k !== `${prev}>${r.id}`).reduce((n, [, v]) => n + v.length, 0);
                  return { id: item.id, kind: "report", title: `#${r.id}`, sub: r.submitted_date ? day(r.submitted_date) : "Not submitted", chip: item.chip ?? r.status, tone: item.tone,
                    tags: tags.map((t) => ({ id: t.id, text: `${t.title}`, tone: t.tone })), carriedIn: carried, fromOlder };
                }),
              ]} />
            ) : (
            <div className="fx-timeline" role="list">
              <div className="fx-tl-item" role="listitem"><FlowCard item={assetItem} selected={selected === "asset"} onSelect={pick} /></div>
              {reports.map(({ r, item, tags }, i) => {
                const prev = i > 0 ? flow.reports[i - 1].id : null;
                const carried = prev != null ? carriesBetween.get(`${prev}>${r.id}`) ?? [] : [];
                const fromOlder = [...carriesBetween.entries()].filter(([k]) => k.endsWith(`>${r.id}`) && k !== `${prev}>${r.id}`).reduce((n, [, v]) => n + v.length, 0);
                return (
                  <div key={r.id} style={{ display: "contents" }}>
                    <div className="fx-tl-link">
                      <FlowLink tone={carried.length ? "warn" : "info"} live={carried.length > 0} />
                      {carried.length > 0 && <span className="fx-carry" title={carried.join(", ")}><Icon name="carried" size={12} />{carried.length} carried</span>}
                    </div>
                    <div className="fx-tl-item" role="listitem">
                      <FlowCard item={item} selected={selected === item.id} onSelect={pick} />
                      {fromOlder > 0 && <span className="fx-carry" style={{ alignSelf: "flex-start" }}><Icon name="carried" size={12} />{fromOlder} from older reports</span>}
                      {tags.length > 0 && (
                        <div className="fx-tl-sub">
                          {tags.map((t) => (
                            <div key={t.id} style={{ display: "contents" }}>
                              <FlowLink vertical tone={t.tone} />
                              <FlowCard item={t} selected={selected === t.id} onSelect={pick} compact />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
            {flow.reports.length === 0 && <div className="fx-empty">No MR-I reports have been filed for this unit yet.</div>}
          </Section>

          {counters.length > 0 && (
            <Section title="MR-II / MR-III counters" hint="How close the unit is to its next MR-II or MR-III. Due when the first counter of a level reaches its limit.">
              <div className="fx-grid">
                {counters.map(({ it, pct }) => (
                  <div key={it.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <FlowCard item={it} selected={selected === it.id} onSelect={pick} compact />
                    <span className="fx-meter" style={{ ["--tone" as string]: TONE_COLOR[it.tone] }} aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(exemptions.length > 0 || loose.length > 0) && (
            <Section title="Also linked to this unit">
              <div className="fx-grid">
                {[...exemptions, ...loose].map((m) => <FlowCard key={m.id} item={m} selected={selected === m.id} onSelect={pick} compact />)}
              </div>
            </Section>
          )}

          <Legend items={[
            { tone: "danger", text: "Red tag, open faults, counter due now" },
            { tone: "warn", text: "Yellow tag, carried faults, due soon" },
            { tone: "success", text: "Green tag, closed, on track" },
            { tone: "info", text: "In progress" },
          ]} />
        </div>

        <DetailPanel item={sel} permissions={permissions} onClose={() => setSelected(null)} viewOnly={viewOnly} />
      </div>
    </div>
  );
}

export default AssetFlow;
