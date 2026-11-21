import React, { useMemo, useState } from "react";
import {
  defaultFilters,
  filterAssets,
  periodRange,
  useMriDashboardScope,
  ymd,
  type DashboardFilters,
  type MriDashboardAsset,
  type PeriodKind,
} from "./hooks/useMriDashboards";
import FleetStatus, { FleetStatusMini } from "./mri/FleetStatus";
import OpenDefects, { OpenDefectsMini } from "./mri/OpenDefects";
import { ReportPreviewProvider } from "./mri/ReportPreview";
import { FLUID_CSS } from "./mri/fluid";
import { CHART3D_CSS } from "./fluent/Chart3D";
import DefectAging, { DefectAgingMini } from "./mri/DefectAging";
import ClosureRate, { ClosureRateMini } from "./mri/ClosureRate";
import DecisionsWaiting, { DecisionsWaitingMini } from "./mri/DecisionsWaiting";
import ReviewTurnaround, { ReviewTurnaroundMini } from "./mri/ReviewTurnaround";
import RepairQueue, { RepairQueueMini } from "./mri/RepairQueue";
import TimeRedYellow, { TimeRedYellowMini } from "./mri/TimeRedYellow";
import RepeatFaults, { RepeatFaultsMini } from "./mri/RepeatFaults";
import FaultTrends, { FaultTrendsMini } from "./mri/FaultTrends";
import PhoneDecisions, { PhoneDecisionsMini } from "./mri/PhoneDecisions";
import ReportsPerPeriod, { ReportsPerPeriodMini } from "./mri/ReportsPerPeriod";
import Exemptions, { ExemptionsMini } from "./mri/Exemptions";
import DueForecast, { DueForecastMini } from "./mri/DueForecast";
import { DASHBOARDS, DASH_ICONS, GROUPS, USER_GROUPS, isMarked, markBadge, markTip } from "./dashCatalog";
import { Inspectors, InspectorsMini, Managers, ManagersMini, Reviewers, ReviewersMini, Supervisors, SupervisorsMini, Technicians, TechniciansMini } from "./mri/UserAnalytics";
import { setScopeFilter, useScopeFilter } from "./scopeFilter";
import { ModeToggle, MODE_READY } from "./dashMode";

// The MR-I dashboards, built one at a time. Task 0: the shared filter bar and the viewer's scope.
// Each dashboard is a card below the filters and receives the filtered units and the period.
// Built dashboards: the card shows a small summary and opens the full dashboard.
const BUILT: Record<number, { Mini: (p: { assets: MriDashboardAsset[] }) => React.ReactElement; Full: (p: { assets: MriDashboardAsset[]; filters: DashboardFilters }) => React.ReactElement }> = {
  1: { Mini: FleetStatusMini, Full: FleetStatus },
  2: { Mini: OpenDefectsMini, Full: OpenDefects },
  3: { Mini: DefectAgingMini, Full: DefectAging },
  4: { Mini: ClosureRateMini, Full: ClosureRate },
  5: { Mini: DecisionsWaitingMini, Full: DecisionsWaiting },
  6: { Mini: ReviewTurnaroundMini, Full: ReviewTurnaround },
  7: { Mini: RepairQueueMini, Full: RepairQueue },
  8: { Mini: TimeRedYellowMini, Full: TimeRedYellow },
  9: { Mini: RepeatFaultsMini, Full: RepeatFaults },
  10: { Mini: PhoneDecisionsMini, Full: PhoneDecisions },
  11: { Mini: ReportsPerPeriodMini, Full: ReportsPerPeriod },
  12: { Mini: ExemptionsMini, Full: Exemptions },
  13: { Mini: DueForecastMini, Full: DueForecast },
  14: { Mini: InspectorsMini, Full: Inspectors },
  15: { Mini: SupervisorsMini, Full: Supervisors },
  16: { Mini: ReviewersMini, Full: Reviewers },
  17: { Mini: TechniciansMini, Full: Technicians },
  18: { Mini: ManagersMini, Full: Managers },
  19: { Mini: FaultTrendsMini, Full: FaultTrends },
};

function DeckBadge({ no, large = false }: { no: number; large?: boolean }) {
  if (!isMarked(no)) return null;
  return (
    <span className={`mrid-deck-badge${large ? " is-large" : ""}`} title={markTip(no)}>
      <i aria-hidden="true" />{markBadge(no, large)}
    </span>
  );
}

const uniq = (xs: (string | null)[]) =>
  [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

function shiftAnchor(f: DashboardFilters, step: number): string {
  if (f.kind === "week") {
    const d = new Date(`${f.anchor || ymd(new Date())}T00:00:00`);
    return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * step));
  }
  if (f.kind === "year") return String((Number(f.anchor) || new Date().getFullYear()) + step);
  const [y, m] = f.anchor.split("-").map(Number);
  const d = new Date(y || new Date().getFullYear(), (m || 1) - 1 + step, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function anchorFor(kind: PeriodKind): string {
  const now = new Date();
  if (kind === "week") return ymd(now);
  if (kind === "year") return String(now.getFullYear());
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function FilterBar({
  filters,
  onChange,
  assets,
}: {
  filters: DashboardFilters;
  onChange: (f: DashboardFilters) => void;
  assets: MriDashboardAsset[];
}) {
  const set = (patch: Partial<DashboardFilters>) => onChange({ ...filters, ...patch });
  // Each list only offers values that exist for the other choices already made.
  const countries = uniq(filterAssets(assets, { ...filters, country: "" }).map((a) => a.country));
  const serviceLines = uniq(filterAssets(assets, { ...filters, serviceLine: "" }).map((a) => a.service_line));
  const types = uniq(filterAssets(assets, { ...filters, equipmentType: "" }).map((a) => a.asset_type));
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => String(thisYear - 4 + i));
  const range = periodRange(filters);

  return (
    <div className="mrid-filters">
      <div className="mrid-filter-row">
        <label className="mrid-field">
          <span>Period</span>
          <select value={filters.kind} onChange={(e) => { const kind = e.target.value as PeriodKind; set({ kind, anchor: anchorFor(kind) }); }}>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>

        {filters.kind === "custom" ? (
          <>
            <label className="mrid-field">
              <span>From</span>
              <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
            </label>
            <label className="mrid-field">
              <span>To</span>
              <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
            </label>
          </>
        ) : (
          <div className="mrid-field">
            <span>{filters.kind === "week" ? "Week" : filters.kind === "year" ? "Year" : "Month"}</span>
            <div className="mrid-stepper">
              <button type="button" className="ghost" aria-label="Previous period" onClick={() => set({ anchor: shiftAnchor(filters, -1) })}>‹</button>
              {filters.kind === "week" && (
                <input type="date" value={filters.anchor} onChange={(e) => set({ anchor: e.target.value })} />
              )}
              {filters.kind === "month" && (
                <input type="month" value={filters.anchor} onChange={(e) => set({ anchor: e.target.value })} />
              )}
              {filters.kind === "year" && (
                <select value={filters.anchor} onChange={(e) => set({ anchor: e.target.value })}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              <button type="button" className="ghost" aria-label="Next period" onClick={() => set({ anchor: shiftAnchor(filters, 1) })}>›</button>
            </div>
          </div>
        )}

        <label className="mrid-field">
          <span>Country</span>
          <select value={filters.country} onChange={(e) => set({ country: e.target.value })}>
            <option value="">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="mrid-field">
          <span>Service line</span>
          <select value={filters.serviceLine} onChange={(e) => set({ serviceLine: e.target.value })}>
            <option value="">All service lines</option>
            {serviceLines.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="mrid-field">
          <span>Equipment type</span>
          <select value={filters.equipmentType} onChange={(e) => set({ equipmentType: e.target.value })}>
            <option value="">All equipment types</option>
            {types.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" className="ghost mrid-reset" onClick={() => onChange(defaultFilters())}>Reset filters</button>
      </div>
      <div className="mrid-period">Showing: <b>{range.label}</b></div>
    </div>
  );
}

interface MriDashboardsProps {
  /** Not used inside the Fluent shell (the sidebar navigates); kept for older callers. */
  onBack?: () => void;
  /** Open dashboard number, when the caller controls it (the Fluent shell: search, quick actions). */
  open?: number | null;
  onOpen?: (no: number | null) => void;
  /** "mri" = the MR-I dashboards; "users" = the separate User Analytics group. */
  section?: "mri" | "users";
}

function MriDashboards({ section = "mri", open: openProp }: MriDashboardsProps) {
  const isUsers = section === "users";
  const groups = isUsers ? USER_GROUPS : GROUPS;
  const { data: scope, isLoading, error } = useMriDashboardScope();
  const [own, setOwn] = useState<DashboardFilters>(defaultFilters);
  // Country and service line are shared with the Overview and Asset MR-I History.
  const scopeF = useScopeFilter();
  const filters = useMemo(() => ({ ...own, country: scopeF.country, serviceLine: scopeF.serviceLine }), [own, scopeF]);
  const setFilters = (f: DashboardFilters) => { setOwn(f); setScopeFilter({ country: f.country, serviceLine: f.serviceLine }); };
  // Dashboards are chosen in the sidebar; with none chosen yet, the first one of the section opens.
  const fallback = groups[0].nos[0];
  const openDash = DASHBOARDS.find((d) => d.no === (openProp ?? fallback)) ?? DASHBOARDS.find((d) => d.no === fallback)!;
  const assets = scope?.assets ?? [];
  const shown = useMemo(() => filterAssets(assets, filters), [assets, filters]);
  const Full = BUILT[openDash.no]?.Full;

  return (
    <ReportPreviewProvider>
    <div className="mrid">
      <style>{MRID_CSS + FLUID_CSS + CHART3D_CSS}</style>
      <div className="mrid-headrow">
        <div className="header">
          <h1 className="mrid-title"><span className={`mrid-icon${isMarked(openDash.no) ? " is-deck" : ""}`}>{DASH_ICONS[openDash.no]}</span>{openDash.title}<DeckBadge no={openDash.no} large /></h1>
          <span className="sub">{openDash.desc}</span>
          {MODE_READY.has(openDash.no) && <ModeToggle />}
        </div>
        {!isLoading && !error && <FilterBar filters={filters} onChange={setFilters} assets={assets} />}
      </div>

      {isLoading ? (
        <div className="empty"><span className="fl-spinner" />Loading the dashboard…</div>
      ) : error ? (
        <div className="empty">Could not load the dashboards: {String(error)}</div>
      ) : (
        <>
          <div className="mrid-scope">
            <span className="mrid-chip"><b>{shown.length}</b> of {assets.length} unit{assets.length === 1 ? "" : "s"} match the filters</span>
            <span className="mrid-chip">
              {scope?.allowed_countries ? <>Your access: <b>{scope.allowed_countries.join(", ")}</b></> : <>Your access: <b>all countries</b></>}
            </span>
          </div>
          {Full ? <Full key={openDash.no} assets={shown} filters={filters} /> : <div className="empty">This dashboard is not built yet.</div>}
        </>
      )}
    </div>
    </ReportPreviewProvider>
  );
}

const MRID_CSS = `
.mrid { --deck: #7dd3fc; --deck-soft: rgba(125, 211, 252, 0.22); --deck-text: #0369a1; }
[data-theme="dark"] .mrid { --deck-text: #7dd3fc; }
.mrid-card.is-deck { box-shadow: inset 4px 0 0 var(--deck), 4px 4px 10px var(--neu-shadow-dark), -4px -4px 10px var(--neu-shadow-light); }
.mrid-icon.is-deck { background: var(--deck-soft); color: var(--deck-text); }
.mrid-deck-badge { display: inline-flex; align-items: center; gap: 5px; align-self: flex-start; font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em;
  color: var(--deck-text); background: var(--deck-soft); border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
.mrid-deck-badge i { width: 6px; height: 6px; border-radius: 50%; background: var(--deck); }
.mrid-deck-badge.is-large { font-size: 12px; padding: 3px 10px; margin-left: 4px; font-weight: 600; align-self: center; }
.mrid-key { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12px; color: var(--text-soft); }
.mrid-key span { display: inline-flex; align-items: center; gap: 7px; }
.mrid-key-swatch { width: 14px; height: 14px; border-radius: 4px; background: var(--surface); border: 1px solid var(--border); }
.mrid-key-swatch.is-deck { box-shadow: inset 4px 0 0 var(--deck); background: var(--deck-soft); border-color: transparent; }
.mrid-headrow { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 20px; }
.mrid-headrow > .header { flex: 1 1 300px; min-width: 0; }
.mrid-mode { display: flex; width: fit-content; align-items: center; gap: 8px; margin-top: 10px; }
.mrid-mode-label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-soft); }
.mrid-headrow > .mrid-filters { flex: 0 1 auto; margin-top: 0; padding: 4px 0 0; background: none; box-shadow: none; border-radius: 0; }
.mrid-headrow .mrid-filter-row { gap: 8px 10px; flex-wrap: wrap; justify-content: flex-end; }
.mrid-headrow .mrid-field > span { font-size: 10.5px; }
.mrid-headrow .mrid-field select, .mrid-headrow .mrid-field input { min-width: 0; width: 132px; font-size: 12.5px; padding-top: 5px; padding-bottom: 5px; }
.mrid-headrow .mrid-stepper input { width: 148px; }
/* One height for every filter control. !important beats the global input rule in App.tsx (its many :not() selectors outrank a class). */
.mrid-filters select, .mrid-filters input, .mrid-filters .mrid-stepper button, .mrid-filters .mrid-reset {
  box-sizing: border-box !important; height: 32px !important; min-height: 32px !important; max-height: 32px !important; margin: 0 !important;
  padding-top: 0 !important; padding-bottom: 0 !important; line-height: 30px !important; font-size: 12.5px !important; vertical-align: middle; }
.mrid-filters select, .mrid-filters input { padding-left: 10px !important; padding-right: 8px !important; }
.mrid-filters input::-webkit-datetime-edit, .mrid-filters input::-webkit-datetime-edit-fields-wrapper { padding: 0; line-height: 30px; }
.mrid-filters input::-webkit-calendar-picker-indicator { margin: 0; padding: 0; }
.mrid-filters .mrid-stepper button { width: 28px; padding-left: 0; padding-right: 0; display: inline-flex; align-items: center; justify-content: center; }
.mrid-filters .mrid-reset { display: inline-flex; align-items: center; }
.mrid-headrow .mrid-reset { margin-left: 0; align-self: flex-end; }
.mrid-headrow .mrid-period { margin-top: 6px; font-size: 11.5px; text-align: right; }
.mrid-filters { margin-top: 16px; padding: 14px 16px; border-radius: 14px; background: var(--surface);
  box-shadow: 6px 6px 14px var(--neu-shadow-dark), -6px -6px 14px var(--neu-shadow-light); }
.mrid-filter-row { display: flex; flex-wrap: wrap; gap: 12px 14px; align-items: flex-end; }
.mrid-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.mrid-field > span { font-size: 11.5px; font-weight: 600; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.04em; }
.mrid-field select, .mrid-field input { min-width: 150px; }
.mrid-stepper { display: flex; gap: 6px; align-items: center; }
.mrid-stepper button { padding: 6px 10px; }
.mrid-reset { margin-left: auto; padding: 6px 12px; font-size: 12px; }
.mrid-period { margin-top: 10px; font-size: 12.5px; color: var(--text-soft); }
.mrid-scope { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 4px; }
.mrid-chip { font-size: 12px; padding: 4px 10px; border-radius: 20px; background: var(--accent-soft); color: var(--text); }
.mrid-groups { display: grid; gap: 18px; margin-top: 14px; }
.mrid-group-title { margin: 0 0 8px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-soft); }
.mrid-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; }
.mrid-card { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 11px 12px 11px 14px; border-radius: 12px;
  background: var(--surface); box-shadow: 4px 4px 10px var(--neu-shadow-dark), -4px -4px 10px var(--neu-shadow-light); min-width: 0; }
.mrid-card-pending { box-shadow: none; border: 1px dashed var(--neu-shadow-dark); opacity: 0.7; cursor: default; }
.mrid-icon { width: 38px; height: 38px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent); flex-shrink: 0; }
.mrid-icon svg { width: 20px; height: 20px; }
.mrid-title .mrid-icon { width: 42px; height: 42px; }
.mrid-title .mrid-icon svg { width: 22px; height: 22px; }
.mrid-card-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mrid-card-title { font-size: 14px; font-weight: 600; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mrid-card-desc { margin: 0; font-size: 11.5px; color: var(--text-soft); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mrid-card .mrid-mini { font-size: 12px; gap: 2px 12px; margin-top: 3px; color: var(--text-soft); }
.mrid-card .mrid-mini b { color: var(--text); }
.mrid-card .mrid-dot { width: 8px; height: 8px; }
.mrid-card-go { font-size: 22px; line-height: 1; color: var(--text-soft); transition: transform 0.12s, color 0.12s; }
.mrid-card-live { text-align: left; border: none; cursor: pointer; font: inherit; color: inherit; transition: transform 0.12s, box-shadow 0.12s; }
.mrid-card-live:hover { transform: translateY(-1px); }
.mrid-card-live:hover .mrid-card-go { transform: translateX(3px); color: var(--accent); }
.mrid-card-live:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.mrid-mini { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; }
.mrid-sortable { cursor: pointer; user-select: none; }
.mrid-sortable:hover { color: var(--accent); }
.mrid-team-row td { font-weight: 600; color: var(--text-soft); background: var(--accent-soft); }
.mrid-mini-item { display: inline-flex; gap: 6px; align-items: center; }
button.mrid-kpi { font: inherit; color: inherit; text-align: left; cursor: pointer; border-left: 0; border-right: 0; border-bottom: 0; transition: transform 0.12s, box-shadow 0.12s; }
button.mrid-kpi:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
button.mrid-kpi.is-on { outline: 2px solid var(--kpi); outline-offset: 2px; }
.mrid-kpi-hint { font-size: 11px; color: var(--accent); margin-top: 6px; font-weight: 600; }
.mrid-drill { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
.mrid-drill .mrid-chip { background: var(--accent-soft); }
.mrid-clear { padding: 3px 10px !important; font-size: 11.5px !important; }
.mrid-click { cursor: pointer; }
.mrid-click:hover td { background: var(--accent-soft); }
.mrid-expand td { background: var(--surface-2, rgba(0,0,0,0.02)); padding: 8px 12px 12px; }
.mrid-subtable { font-size: 12px; }
.mrid-caret { display: inline-block; width: 12px; color: var(--text-soft); }
.mrid-preview-btn { padding: 3px 9px !important; font-size: 11.5px !important; white-space: nowrap; }
.mrid-preview { position: fixed; inset: 0; z-index: 1000; background: rgba(15,20,25,0.55); display: flex; justify-content: center; align-items: stretch; padding: 24px; }
.mrid-preview-panel { background: var(--bg, var(--surface)); border-radius: 14px; width: min(1180px, 100%); display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
.mrid-preview-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 13px; background: var(--surface); }
.mrid-preview-body { overflow: auto; padding: 16px 20px; flex: 1; }
/* Printing the report from the preview: show only the preview and let it run over every page.
   (The app root is a fixed-height, overflow-hidden box, which cut the print to the first page.) */
@media print {
  html:has(.mrid-preview), body:has(.mrid-preview), #root:has(.mrid-preview) { height: auto !important; overflow: visible !important; }
  .app:has(> .mrid-preview) { height: auto !important; width: auto !important; min-height: 0 !important; overflow: visible !important; display: block !important; zoom: 1 !important; }
  .app:has(> .mrid-preview) > *:not(.mrid-preview):not(style) { display: none !important; }
  .mrid-preview { position: static !important; inset: auto !important; display: block !important; padding: 0 !important; background: none !important; }
  .mrid-preview-panel { display: block !important; width: auto !important; overflow: visible !important; box-shadow: none !important; border-radius: 0 !important; background: none !important; }
  .mrid-preview-body { overflow: visible !important; padding: 0 !important; }
}
.mrid-over { color: var(--danger); font-weight: 600; white-space: nowrap; }
.mrid-ok { color: var(--success); white-space: nowrap; }
.mrid-toggle { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--text-soft); cursor: pointer; }
.mrid-tabs { display: inline-flex; gap: 4px; background: var(--accent-soft); padding: 3px; border-radius: 10px; }
.mrid-tabs button { padding: 4px 12px; font-size: 12px; border-radius: 8px; border: 0; background: transparent; color: var(--text-soft); cursor: pointer; }
.mrid-tabs button.is-on { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.mrid-target { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; margin-left: 6px; }
.mrid-target.ok { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
.mrid-target.bad { background: color-mix(in srgb, var(--danger) 15%, transparent); color: var(--danger); }
.mrid-formula { font-size: 12px; color: var(--text-soft); background: var(--accent-soft); border-radius: 8px; padding: 6px 10px; display: inline-block; }
.mrid-monthtable th, .mrid-monthtable td { text-align: center; white-space: nowrap; }
.mrid-monthtable th:first-child, .mrid-monthtable td:first-child { text-align: left; }
.mrid-monthtable .is-on { background: var(--accent-soft); }
.mrid-click-cell { cursor: pointer; }
.mrid-click-cell:hover { background: var(--accent-soft); }
.mrid-sharebar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; min-width: 4px; }
.mrid-sharebar i { display: block; height: 100%; }
.mrid-crumbs { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; margin-bottom: 8px; }
.mrid-crumbs button { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; font-weight: 600; }
.mrid-crumbs span.sep { color: var(--text-soft); }
.mrid-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.mrid-sev { display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
.mrid-title { display: flex; align-items: center; gap: 12px; }
.mrid-dash { display: flex; flex-direction: column; gap: 16px; margin-top: 14px; }
.mrid-note { margin: 0; font-size: 12.5px; color: var(--text-soft); }
.mrid-dash-bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.mrid-export { position: relative; margin-left: auto; }
.mrid-export > button { padding: 6px 14px; font-size: 12.5px; }
.mrid-export-menu { position: absolute; right: 0; left: auto; top: calc(100% + 4px); min-width: 150px; z-index: 20; }
.mrid-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; }
.mrid-kpi { padding: 14px 16px; border-radius: 14px; background: var(--surface); border-top: 4px solid var(--kpi);
  box-shadow: 6px 6px 14px var(--neu-shadow-dark), -6px -6px 14px var(--neu-shadow-light); }
.mrid-kpi-head { display: flex; gap: 8px; align-items: center; font-size: 12.5px; font-weight: 600; color: var(--text-soft); }
.mrid-kpi-value { font-size: 30px; font-weight: 700; margin: 4px 0 2px; color: var(--text); }
.mrid-kpi-sub { font-size: 12px; color: var(--text-soft); }
.mrid-panel { padding: 14px 16px; border-radius: 14px; background: var(--surface);
  box-shadow: 6px 6px 14px var(--neu-shadow-dark), -6px -6px 14px var(--neu-shadow-light); }
.mrid-panel-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.mrid-panel-head h3 { margin: 0; font-size: 14.5px; }
.mrid-inline { flex-direction: row; align-items: center; gap: 8px; }
.mrid-inline select { min-width: 140px; }
.mrid-table-wrap { overflow-x: auto; }
.mrid-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.mrid-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-soft); padding: 6px 8px; border-bottom: 1px solid var(--border); }
.mrid-table td { padding: 7px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
.mrid-soft { color: var(--text-soft); }
.mrid-more { margin-top: 10px; padding: 5px 12px; font-size: 12px; }
.mrid-legend { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; font-size: 12px; color: var(--text-soft); margin-top: 4px; }
.mrid-legend i { display: inline-block; width: 11px; height: 11px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
`;

export default MriDashboards;
