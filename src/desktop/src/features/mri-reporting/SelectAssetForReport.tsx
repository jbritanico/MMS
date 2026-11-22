import { useMemo, useState, type ReactNode } from "react";
import { useAssetsForViewer } from "../asset-registry/hooks/useAssets";
import { useAssetTypes } from "../administration/hooks/useAssetTypes";
import { useMriTemplates } from "../administration/hooks/useMriTemplates";
import { useAssetTriggers } from "../asset-registry/hooks/useTriggers";
import { useAllTemplateComponents } from "../mri-template-builder/hooks/useTemplateComponents";
import type { Asset } from "../asset-registry/types";
import { TagLamp } from "../../components/Instruments";
import { DEFAULT_TRIGGER_ICON, TRIGGER_TYPE_COLORS, TRIGGER_TYPE_ICONS } from "../../components/triggerIcons";
import {
  useCreateMriReport,
  useCreateMriReportFromLastPostJob,
  useMriReports,
  useAssetsWithPendingIssues,
  useStandbyPrejobReminders,
  type LastPostJobInfo,
} from "./hooks/useMriReports";
import { invoke } from "../../lib/ipc";
import { useCurrentUser } from "../../lib/currentUser";
import { useUserCountryAccess } from "../administration/hooks/useUserAdmin";
import { IsoIconPlatform, TIG_CSS } from "../mri-template-builder/TemplateIsoGuide";
import { ADMIN_CSS, RowTile, ScreenIntro, type Tone } from "../administration/AdminIsoGuide";
import { REPORT_KIT_CSS } from "./reportKit";

// Option B look (MR-I Reporting checklist, Group 2). Display only: which units are listed (active, the
// user's countries), which can be started, the component picker, the Post-Job choice and creating the
// report all work exactly as before. The Country and Service line filters only narrow the list on screen.

// Same mapping used on the Maintenance Triggers admin screen.
const TRIGGER_TYPE_LABELS: Record<string, string> = {
  OH: "Operating hours",
  CA: "Calendar days",
  KM: "Distance (KM)",
  RIF: "Running-in-foot",
  EH: "Engine hours",
};

// Card or list view, remembered on this PC (display only).
const VIEW_KEY = "mms.mri.selectAsset.view";
type SelectView = "cards" | "list";
const readView = (): SelectView => {
  try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards"; } catch { return "cards"; }
};

const SEL_CSS = `
.sel-view { display: inline-flex; gap: 2px; padding: var(--seg-track-pad, 3px); border-radius: var(--seg-track-radius, 10px); background: var(--tab-track, rgba(0,0,0,0.05)); align-self: flex-end; }
.sel-view button { display: inline-flex; align-items: center; gap: 6px; padding: var(--seg-pad, 6px 12px) !important; min-height: 0 !important; font-size: var(--seg-font, 12.5px) !important;
  border: var(--seg-border, 0) !important; border-radius: var(--seg-radius, 8px) !important; background: transparent !important; box-shadow: none !important; color: var(--seg-off-color, var(--text-soft)) !important; font-weight: var(--seg-off-weight, 500) !important; }
.sel-view button[aria-pressed="true"] { background: var(--seg-on-bg, var(--surface)) !important; color: var(--seg-on-color, var(--text)) !important; font-weight: var(--seg-on-weight, 600) !important; box-shadow: var(--seg-on-shadow, 0 1px 3px rgba(0,0,0,0.12)) !important; }
.sel-view svg { width: 15px; height: 15px; }
.sel-table-wrap { overflow-x: auto; }
.sel-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.sel-table th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-soft); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.sel-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.sel-table tr.sel-row { cursor: pointer; }
.sel-table tr.sel-row:hover td { background: var(--hover-highlight); }
.sel-table tr.sel-row.is-off { cursor: default; opacity: .72; }
.sel-table tr.sel-row.is-off:hover td { background: none; }
.sel-table tr.sel-row:focus-visible { outline: 2px solid var(--tig-blue); outline-offset: -2px; }
.sel-table .sel-card-code { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.sel-table .sel-say { padding: 3px 8px; font-size: 12px; display: inline-block; }
.sel-table mark { background: color-mix(in srgb, var(--tig-blue) 22%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }
.sel-filters { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-end; margin: 4px 0 6px; }
.sel-filters label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; font-weight: 600; color: var(--text-soft); }
.sel-filters .sel-grow { flex: 1 1 280px; }
.sel-filters .sel-grow input { width: 100%; max-width: none; margin: 0; }
.sel-note { font-size: 12.5px; color: var(--text-soft); margin: 4px 0 14px; }
.sel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.sel-card { display: flex; flex-direction: column; gap: 10px; cursor: pointer; }
.sel-card.is-off { cursor: default; opacity: .78; }
.sel-card.is-off:hover { transform: none; }
.sel-card-top { display: flex; align-items: center; gap: 12px; min-width: 0; }
.sel-card-code { font-weight: 700; font-size: 15px; }
.sel-card-desc { font-size: 13px; color: var(--text-soft); }
.sel-card mark { background: color-mix(in srgb, var(--tig-blue) 22%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }
.sel-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; color: var(--text-soft); }
.sel-due { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--tig-line, var(--border, #d6dbe4)); border-radius: 99px; padding: 1px 8px 1px 4px; font-size: 12px; }
.sel-due svg { flex: none; }
.sel-due > span > svg { width: 14px; height: 14px; }
.sel-say { font-size: 12.5px; border-radius: 8px; padding: 6px 10px; background: var(--tig-look-soft); color: var(--tig-look); font-weight: 600; }
.sel-say.is-bad { background: var(--tig-bad-soft); color: var(--tig-bad); }
.sel-say.is-blue { background: var(--tig-blue-soft); color: var(--tig-blue); }
.sel-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.sel-picks { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 18px 20px; padding: 8px 14px 10px 4px; margin: 12px 0; }
.sel-picks .iso-card.is-off { cursor: default; opacity: .6; }
.sel-picks .iso-card b { font-size: 14px; }
.sel-picks .iso-card span { font-size: 12px; color: var(--text-soft); }
`;

/** The matching part of a code or description, highlighted. */
function Hl({ text, q }: { text: string; q: string }): ReactNode {
  const s = q.trim();
  const i = s ? text.toLowerCase().indexOf(s.toLowerCase()) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + s.length)}</mark>{text.slice(i + s.length)}</>;
}

interface AssetSelectCardProps {
  asset: Asset;
  icon: string | undefined;
  assetTypeLabel: string;
  disabled: boolean;
  hasPendingIssue: boolean;
  noTemplate: boolean;
  blockingReportId: number | null;
  blockingStatus: string | null;
  isCreating: boolean;
  standbyDay: number | null;
  componentLabels: string[];
  query: string;
  onSelect: () => void;
  /** "row" draws the same facts as one row of the list view. */
  variant?: "card" | "row";
}

// A separate component (not inline in the map below) because it needs to call
// useAssetTriggers for its own asset -- hooks can't be called conditionally
// inside a .map() in the parent component.
function AssetSelectCard({
  asset,
  icon,
  assetTypeLabel,
  disabled,
  hasPendingIssue,
  noTemplate,
  blockingReportId,
  blockingStatus,
  isCreating,
  standbyDay,
  componentLabels,
  query,
  onSelect,
  variant = "card",
}: AssetSelectCardProps) {
  const { data: triggers = [] } = useAssetTriggers(asset.id);
  const activeTriggers = triggers.filter((t) => t.enabled);
  const dueTone = (run: number, every: number): Tone => (every > 0 && run >= every ? "bad" : every > 0 && run >= every * 0.8 ? "look" : "ok");
  const counters = activeTriggers.map((t) => (
    <span key={t.id} className="sel-due" title={TRIGGER_TYPE_LABELS[t.trigger_type] ?? t.trigger_type}>
      <RowTile tone={dueTone(t.running_value, t.interval_value)} />
      <span style={{ color: TRIGGER_TYPE_COLORS[t.trigger_type] ?? "var(--text-soft)", display: "inline-flex" }}>
        {TRIGGER_TYPE_ICONS[t.trigger_type] ?? DEFAULT_TRIGGER_ICON}
      </span>
      {t.running_value}/{t.interval_value}
    </span>
  ));

  if (variant === "row") {
    const tone: Tone = asset.tag_status === "Red" ? "bad" : asset.tag_status === "Yellow" ? "look" : asset.tag_status === "Green" ? "ok" : "skip";
    return (
      <tr
        className={`sel-row${disabled ? " is-off" : ""}`}
        onClick={() => !disabled && onSelect()}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(); } }}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
      >
        <td>{asset.tag_status ? <TagLamp status={asset.tag_status} size={16} title={asset.tag_reason ?? undefined} /> : <span className="sel-card-desc">—</span>}</td>
        <td>
          <div className="sel-card-code"><RowTile tone={tone} /><Hl text={asset.asset_code} q={query} /></div>
          <div className="sel-card-desc"><Hl text={asset.asset_description || "—"} q={query} /></div>
        </td>
        <td>{assetTypeLabel}</td>
        <td>{asset.country || "—"}</td>
        <td>{asset.service_line || "—"}</td>
        <td><div className="sel-meta">{counters.length ? counters : "—"}</div></td>
        <td>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-soft)" }} title={hasPendingIssue ? "Has pending issue" : "No pending issues"}>
            <span className="sel-dot" style={{ background: hasPendingIssue ? "var(--danger)" : "var(--tig-ok)" }} />
            {hasPendingIssue ? "Open issue" : "None"}
          </span>
        </td>
        <td>
          {isCreating ? <span className="sel-say is-blue">Starting...</span>
            : noTemplate ? <span className="sel-say">No MR-I template yet</span>
            : blockingReportId !== null && blockingStatus ? <span className="sel-say is-bad" title={`Report #${blockingReportId} is ${blockingStatus}`}>Report #{blockingReportId} is {blockingStatus} — close it first</span>
            : standbyDay !== null ? <span className="sel-say" title="Equipment kept on stand-by after its Post-Job report needs a new Pre-Job MR-I on day 8">Pre-Job MR-I due — day {standbyDay}</span>
            : componentLabels.length > 0 ? <span className="sel-say is-blue" title="Choose the component when you start a report">Parts: {componentLabels.join(" · ")}</span>
            : <span className="sel-card-desc">Ready to start</span>}
        </td>
      </tr>
    );
  }

  return (
    <div
      className={`review-card sel-card ${disabled ? "is-off" : "adm-lift"}`}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(); } }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <div className="sel-card-top">
        <IsoIconPlatform icon={icon} size={84} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="sel-card-code"><Hl text={asset.asset_code} q={query} /></div>
          <div className="sel-card-desc"><Hl text={asset.asset_description || "—"} q={query} /></div>
        </div>
        {asset.tag_status && <TagLamp status={asset.tag_status} size={18} title={asset.tag_reason ?? undefined} />}
      </div>
      <div className="sel-meta">
        <span>{assetTypeLabel}</span>·<span title="Country of this asset">{asset.country || "No country"}</span>
        {asset.service_line && <>·<span>{asset.service_line}</span></>}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }} title={hasPendingIssue ? "Has pending issue" : "No pending issues"}>
          <span className="sel-dot" style={{ background: hasPendingIssue ? "var(--danger)" : "var(--tig-ok)" }} />
          {hasPendingIssue ? "Open issue" : "No open issues"}
        </span>
      </div>
      {activeTriggers.length > 0 && <div className="sel-meta">{counters}</div>}
      {componentLabels.length > 0 && (
        <div className="sel-say is-blue" title="Choose the component when you start a report">
          Checked in parts: {componentLabels.join(" · ")} — you'll pick one when you start
        </div>
      )}
      {noTemplate && <div className="sel-say">No MR-I template yet for this kind of unit — an Administrator can make one</div>}
      {blockingReportId !== null && blockingStatus && (
        <div className="sel-say is-bad" title={`Report #${blockingReportId} is ${blockingStatus}`}>
          Report #{blockingReportId} is {blockingStatus} — it has to be closed before a new one can start
        </div>
      )}
      {standbyDay !== null && (
        <div className="sel-say" title="Equipment kept on stand-by after its Post-Job report needs a new Pre-Job MR-I on day 8">
          Pre-Job MR-I due — day {standbyDay} on stand-by
        </div>
      )}
      {isCreating && <div className="sel-say is-blue">Starting...</div>}
    </div>
  );
}

interface SelectAssetForReportProps {
  onReportCreated: (reportId: number) => void;
}
function SelectAssetForReport({ onReportCreated }: SelectAssetForReportProps) {
  const { data: assets = [] } = useAssetsForViewer();
  const { data: assetTypes = [] } = useAssetTypes();
  const { data: templates = [] } = useMriTemplates();
  const { data: existingReports = [] } = useMriReports();
  const { data: pendingIssueAssetIds = [] } = useAssetsWithPendingIssues();
  const createReport = useCreateMriReport();
  const createFromPostJob = useCreateMriReportFromLastPostJob();
  const { data: standbyReminders = [] } = useStandbyPrejobReminders();
  const { data: allComponents = [] } = useAllTemplateComponents();
  // Template with components: the user picks which component the report is for.
  const [componentChoice, setComponentChoice] = useState<{ assetId: number; assetTypeId: number | null } | null>(null);
  // Figure 2: shown when the last report on the chosen asset was a Post-Job one, so the
  // user picks between duplicating it (<= 72 h) and starting a fresh Pre-Mob.
  const [postJobChoice, setPostJobChoice] = useState<{
    assetId: number;
    templateId: number;
    componentId: number | null;
    info: LastPostJobInfo;
  } | null>(null);
  const { user: currentUser } = useCurrentUser();
  // Empty array = unrestricted (sees every country) -- the same convention the backend uses.
  const { data: myCountries = [] } = useUserCountryAccess(currentUser?.id ?? 0);

  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [lineFilter, setLineFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [view, setViewState] = useState<SelectView>(readView);
  const setView = (v: SelectView) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* not remembered */ } };
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [creatingFor, setCreatingFor] = useState<number | null>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 4000);
  }

  function findActiveTemplate(assetTypeId: number | null) {
    if (!assetTypeId) return null;
    return templates.find((t) => t.asset_type_id === assetTypeId && t.status === "Active") ?? null;
  }

  function assetTypeName(id: number | null) {
    return assetTypes.find((a) => a.id === id)?.description ?? "No type assigned";
  }

  // Units this user may start a report on: active and in one of their countries (unchanged).
  const allowed = assets.filter((a) => a.active && (myCountries.length === 0 || myCountries.includes(a.country)));
  // Country drop-down: only the user's countries (every country with units when their list is empty).
  const countryOptions = useMemo(
    () => (myCountries.length ? [...myCountries] : [...new Set(allowed.map((a) => a.country).filter(Boolean))]).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myCountries.join("|"), allowed.map((a) => a.country).join("|")],
  );
  // Service line drop-down: only the service lines of units in the chosen country.
  const lineOptions = [...new Set(allowed.filter((a) => !countryFilter || a.country === countryFilter).map((a) => a.service_line).filter(Boolean))].sort();
  const filtered = allowed.filter(
    (a) =>
      `${a.asset_code} ${a.asset_description}`.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!countryFilter || a.country === countryFilter) &&
      (!lineFilter || a.service_line === lineFilter) &&
      (!typeFilter || (typeFilter === "none" ? !a.asset_type_id : String(a.asset_type_id) === typeFilter))
  );
  // Asset type drop-down: only the asset types of units in the chosen country and service line.
  const typeScope = allowed.filter((a) => (!countryFilter || a.country === countryFilter) && (!lineFilter || a.service_line === lineFilter));
  const typeOptions = assetTypes
    .filter((t) => typeScope.some((a) => a.asset_type_id === t.id))
    .sort((x, y) => x.description.localeCompare(y.description));
  const typeNoneInScope = typeScope.some((a) => !a.asset_type_id);
  const filtersOn = !!(query || countryFilter || lineFilter || typeFilter);

  // The components an MR-I template defines (e.g. Left / Right pump).
  function componentsFor(templateId: number | undefined) {
    return templateId === undefined ? [] : allComponents.filter((c) => c.template_id === templateId && c.active);
  }

  // Reports are tracked per component: a pending report on the Left pump does not block a
  // report on the Right pump. componentId null = the whole asset (assets with no components).
  function blockingReportFor(assetId: number, componentId: number | null = null) {
    // Mirrors the backend's create_mri_report guard: any report on this asset (or component)
    // that isn't Draft (still being filled out) or Approved (finished) blocks a new one.
    return existingReports.find(
      (r) =>
        r.asset_id === assetId &&
        (r.component_id ?? null) === componentId &&
        r.status !== "Draft" &&
        r.status !== "Approved"
    );
  }

  function draftFor(assetId: number, templateId: number, componentId: number | null) {
    return existingReports.find(
      (r) =>
        r.asset_id === assetId &&
        r.template_id === templateId &&
        (r.component_id ?? null) === componentId &&
        r.status === "Draft"
    );
  }

  async function handleSelect(assetId: number, assetTypeId: number | null, componentId: number | null = null) {
    const template = findActiveTemplate(assetTypeId);
    if (!template) {
      flash("No active MR-I template exists for this asset's type yet", "err");
      return;
    }

    // A template with components asks which component this report is for first.
    if (componentId === null && componentsFor(template.id).length > 0) {
      setComponentChoice({ assetId, assetTypeId });
      return;
    }

    const existingDraft = draftFor(assetId, template.id, componentId);
    if (existingDraft) {
      onReportCreated(existingDraft.id);
      return;
    }

    const blocking = blockingReportFor(assetId, componentId);
    if (blocking) {
      flash(
        `Report #${blocking.id} for this asset${componentId !== null ? " component" : ""} is still ${blocking.status} — it must be closed before a new MR-I report can be started.`,
        "err"
      );
      return;
    }

    let info: LastPostJobInfo | null = null;
    try {
      info = await invoke<LastPostJobInfo | null>("get_last_post_job_info", { assetId, componentId });
    } catch {
      info = null;
    }
    if (info) {
      setPostJobChoice({ assetId, templateId: template.id, componentId, info });
      return;
    }

    await startBlank(assetId, template.id, componentId);
  }

  async function startBlank(assetId: number, templateId: number, componentId: number | null = null) {
    setPostJobChoice(null);
    setCreatingFor(assetId);
    try {
      const reportId = await createReport.mutateAsync({ template_id: templateId, asset_id: assetId, component_id: componentId });
      onReportCreated(reportId);
    } catch (err) {
      flash(String(err), "err");
    } finally {
      setCreatingFor(null);
    }
  }

  async function startFromPostJob(assetId: number, templateId: number, componentId: number | null = null) {
    setPostJobChoice(null);
    setCreatingFor(assetId);
    try {
      const reportId = await createFromPostJob.mutateAsync({ assetId, templateId, componentId });
      onReportCreated(reportId);
    } catch (err) {
      flash(String(err), "err");
    } finally {
      setCreatingFor(null);
    }
  }

  const noTemplateCount = allowed.filter((a) => !findActiveTemplate(a.asset_type_id)).length;
  const pendingCount = filtered.filter((a) => a.id !== null && pendingIssueAssetIds.includes(a.id)).length;
  const redCount = filtered.filter((a) => a.tag_status === "Red").length;

  return (
    <div className="tig rk">
      <style>{TIG_CSS + ADMIN_CSS + REPORT_KIT_CSS + SEL_CSS}</style>
      <div className="header">
        <h1>Which unit is this report for?</h1>
        <span className="sub">Select asset</span>
      </div>

      <ScreenIntro
        glyph="unit"
        label="Start a report: what you'll do here"
        kpis={[
          { label: "units shown", value: `${filtered.length} of ${allowed.length}`, tone: "blue" },
          { label: "Pre-Job due", value: standbyReminders.length, tone: standbyReminders.length ? "look" : "skip" },
          { label: "with an open issue", value: pendingCount, tone: pendingCount ? "bad" : "skip" },
          { label: "Red", value: redCount, tone: redCount ? "bad" : "skip" },
          { label: "no MR-I template", value: noTemplateCount, tone: noTemplateCount ? "look" : "skip" },
        ]}
        explain="Pick the unit you are inspecting. MMS opens the right MR-I form for its kind of unit and fills in the unit's details for you."
        todo={[
          "Type part of the unit code or its description",
          "Narrow it down by country and service line",
          "Click the card to start the report — or carry on with its draft",
        ]}
        hints={[
          ...(standbyReminders.length ? [`${standbyReminders.length} ${standbyReminders.length === 1 ? "unit needs" : "units need"} a Pre-Job MR-I (day 8 on stand-by)`] : []),
          ...(noTemplateCount ? [`${noTemplateCount} ${noTemplateCount === 1 ? "unit has" : "units have"} no MR-I template yet — ask an Administrator`] : []),
        ]}
      />

      <div className="sel-filters">
        <label className="sel-grow">Find a unit
          <input
            type="search"
            className="search"
            placeholder="Code or description, e.g. PU-2 or frac pump"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>Country
          <select className="neu-select" value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value); setLineFilter(""); setTypeFilter(""); }}>
            <option value="">{myCountries.length ? "All my countries" : "All countries"}</option>
            {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Service line
          <select className="neu-select" value={lineFilter} onChange={(e) => { setLineFilter(e.target.value); setTypeFilter(""); }}>
            <option value="">All service lines</option>
            {lineOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label>Asset type
          <select className="neu-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All asset types</option>
            {typeOptions.map((t) => <option key={t.id} value={String(t.id)}>{t.description}</option>)}
            {typeNoneInScope && <option value="none">No asset type set</option>}
          </select>
        </label>
        {filtersOn && (
          <button type="button" className="ghost" onClick={() => { setQuery(""); setCountryFilter(""); setLineFilter(""); setTypeFilter(""); }}>
            Reset filters
          </button>
        )}
        <div className="sel-view" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")} title="Card view">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /></svg>
            Cards
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} title="List view">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
            List
          </button>
        </div>
      </div>
      <p className="sel-note">
        {myCountries.length ? `You can see units in ${myCountries.join(", ")}.` : "You can see units in every country."} Service lines come from the units in the country you pick.
      </p>

      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 520, marginBottom: 12 }}>{status.msg}</div>}
      {standbyReminders.length > 0 && (
        <div className="tig-hint" role="status" style={{ maxWidth: 680, marginBottom: 16 }}>
          <strong>Pre-Job MR-I due — equipment kept on stand-by has reached day 8 since its Post-Job report:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {standbyReminders.map((r) => (
              <li key={`${r.asset_id}-${r.component_id ?? "all"}`}>
                {r.asset_code}{r.component_label ? ` (${r.component_label})` : ""} — day {r.days_since} since its Post-Job report
              </li>
            ))}
          </ul>
        </div>
      )}
      {postJobChoice && (
        <div className="modal-overlay">
          <div className="modal tig rk" style={{ width: "min(540px, 94vw)", textAlign: "left" }}>
            <h3 style={{ marginTop: 0 }}>The last report was a Post-Job report</h3>
            {postJobChoice.info.within_72h ? (
              <p>
                It was submitted {postJobChoice.info.hours_since} hours ago — 72 hours or less. You can copy it
                as the new Pre-Mob report, so only a few extra entries are needed. Or start a new report.
              </p>
            ) : (
              <p>
                It was submitted {postJobChoice.info.hours_since} hours ago — more than 72 hours, so it can't be
                copied. A new Pre-Mob MR-I has to be filled in.
              </p>
            )}
            <div className="modal-actions" style={{ justifyContent: "flex-start", gap: 10, flexWrap: "wrap" }}>
              {postJobChoice.info.within_72h && (
                <button
                  className="primary"
                  onClick={() => startFromPostJob(postJobChoice.assetId, postJobChoice.templateId, postJobChoice.componentId)}
                >
                  Copy it as the Pre-Mob report
                </button>
              )}
              <button
                className={postJobChoice.info.within_72h ? "ghost" : "primary"}
                onClick={() => startBlank(postJobChoice.assetId, postJobChoice.templateId, postJobChoice.componentId)}
              >
                Start a new report
              </button>
              <button className="ghost" onClick={() => setPostJobChoice(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {componentChoice && (() => {
        const template = findActiveTemplate(componentChoice.assetTypeId);
        const asset = assets.find((a) => a.id === componentChoice.assetId);
        return (
          <div className="modal-overlay" onClick={() => setComponentChoice(null)}>
            <div className="modal tig rk" style={{ width: "min(560px, 94vw)", textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Which part of {asset?.asset_code} is this report for?</h3>
              <p style={{ fontSize: 13 }}>
                <strong>{asset?.asset_code}</strong> is checked in parts. Each part has its own reports, all on the same
                template{template ? ` (${template.template_name})` : ""} — a report on one part doesn't hold up the other.
              </p>
              <div className="sel-picks">
                {componentsFor(template?.id).map((c) => {
                  const draft = template ? draftFor(componentChoice.assetId, template.id, c.id) : undefined;
                  const blocking = blockingReportFor(componentChoice.assetId, c.id);
                  const blocked = !!blocking && !draft;
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={blocked ? -1 : 0}
                      aria-disabled={blocked}
                      className={`iso-card${blocked ? " is-off" : ""}`}
                      onClick={() => {
                        if (blocked) return;
                        const target = componentChoice;
                        setComponentChoice(null);
                        handleSelect(target.assetId, target.assetTypeId, c.id);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as HTMLDivElement).click(); } }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <RowTile tone={blocked ? "bad" : draft ? "look" : "blue"} />
                        <b>{c.label}</b>
                      </div>
                      <span>
                        {draft
                          ? `Carry on with draft #${draft.id}`
                          : blocked
                            ? `Report #${blocking!.id} is ${blocking!.status} — close it first`
                            : "Start new report"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                <button className="ghost" onClick={() => setComponentChoice(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
      {filtered.length === 0 ? (
        <div className="empty">
          {allowed.length === 0 ? "No active assets match your search" : "No units match — clear the search or pick another country or service line"}
        </div>
      ) : (
        (() => {
          const items = filtered.map((a) => {
            const template = findActiveTemplate(a.asset_type_id);
            const comps = componentsFor(template?.id);
            const hasComponents = comps.length > 0;
            const hasDraftForTemplate =
              a.id !== null && !!template &&
              existingReports.some(
                (r) => r.asset_id === a.id && r.template_id === template.id && (r.component_id ?? null) === null && r.status === "Draft"
              );
            // With components, blocking is decided per component in the picker, not on the card.
            const blockingReport = a.id !== null && !hasComponents ? blockingReportFor(a.id, null) : undefined;
            const disabled = !template || creatingFor === a.id || (!!blockingReport && !hasDraftForTemplate);
            const icon = assetTypes.find((t) => t.id === a.asset_type_id)?.icon;
            const resolvedIcon = icon && icon.trim().startsWith("data:") ? icon : undefined;
            return (
              <AssetSelectCard
                key={a.id}
                asset={a}
                icon={resolvedIcon}
                assetTypeLabel={assetTypeName(a.asset_type_id)}
                disabled={disabled}
                hasPendingIssue={a.id !== null && pendingIssueAssetIds.includes(a.id)}
                noTemplate={!template}
                blockingReportId={blockingReport && !hasDraftForTemplate ? blockingReport.id : null}
                blockingStatus={blockingReport && !hasDraftForTemplate ? blockingReport.status : null}
                isCreating={creatingFor === a.id}
                standbyDay={standbyReminders.find((r) => r.asset_id === a.id)?.days_since ?? null}
                componentLabels={comps.map((c) => c.label)}
                query={query}
                onSelect={() => a.id !== null && handleSelect(a.id, a.asset_type_id)}
                variant={view === "list" ? "row" : "card"}
              />
            );
          });
          return view === "list" ? (
            <div className="sel-table-wrap">
              <table className="sel-table">
                <thead>
                  <tr><th>Tag</th><th>Unit</th><th>Kind of unit</th><th>Country</th><th>Service line</th><th>Counters</th><th>Open issues</th><th>Report</th></tr>
                </thead>
                <tbody>{items}</tbody>
              </table>
            </div>
          ) : (
            <div className="sel-grid">{items}</div>
          );
        })()
      )}
    </div>
  );
}

export default SelectAssetForReport;