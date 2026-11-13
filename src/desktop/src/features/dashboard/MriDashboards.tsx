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
import DefectAging, { DefectAgingMini } from "./mri/DefectAging";
import ClosureRate, { ClosureRateMini } from "./mri/ClosureRate";
import DecisionsWaiting, { DecisionsWaitingMini } from "./mri/DecisionsWaiting";
import ReviewTurnaround, { ReviewTurnaroundMini } from "./mri/ReviewTurnaround";
import RepairQueue, { RepairQueueMini } from "./mri/RepairQueue";
import TimeRedYellow, { TimeRedYellowMini } from "./mri/TimeRedYellow";
import RepeatFaults, { RepeatFaultsMini } from "./mri/RepeatFaults";
import PhoneDecisions, { PhoneDecisionsMini } from "./mri/PhoneDecisions";
import ReportsPerPeriod, { ReportsPerPeriodMini } from "./mri/ReportsPerPeriod";
import Exemptions, { ExemptionsMini } from "./mri/Exemptions";
import DueForecast, { DueForecastMini } from "./mri/DueForecast";
import { Inspectors, InspectorsMini, Managers, ManagersMini, Reviewers, ReviewersMini, Supervisors, SupervisorsMini, Technicians, TechniciansMini } from "./mri/UserAnalytics";

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
};

const DASHBOARDS: { no: number; title: string; desc: string }[] = [
  { no: 1, title: "Fleet status by tag colour", desc: "How many units are Green, Yellow or Red." },
  { no: 2, title: "Open defects by severity", desc: "Faults not yet fixed, Minor / Moderate / Critical, and the trend." },
  { no: 3, title: "Defect aging", desc: "How long open faults have waited; overdue ones flagged." },
  { no: 4, title: "Fault closure rate", desc: "Faults closed in the period, against the backlog plus new faults." },
  { no: 5, title: "Decisions waiting, by reviewer", desc: "Fault decisions and report reviews waiting now, and with whom." },
  { no: 6, title: "Review turnaround", desc: "Time from Submit to the fault decision and to report closure." },
  { no: 7, title: "Repair queue and repair time", desc: "Repairs waiting, who is assigned, parts, days to repair." },
  { no: 8, title: "Time spent Red or Yellow", desc: "How long units were out of action." },
  { no: 9, title: "Repeat faults", desc: "Inspection items that fail most often." },
  { no: 10, title: "Phone decisions and acknowledgements", desc: "Decisions still to confirm or acknowledge." },
  { no: 11, title: "MR-I reports per period", desc: "Inspections by stage: Pre-Mob, Pre-Job, Post Job, Yard." },
  { no: 12, title: "Red units under exemption (MOC)", desc: "Exemptions in force, their limits and expiry dates." },
  { no: 13, title: "MR-II due forecast", desc: "Units close to their next MR-II (or MR-III), from the MR-I counters." },
  { no: 14, title: "Inspectors", desc: "Reports submitted, faults found, and faults rejected or downgraded on review." },
  { no: 15, title: "Supervisors", desc: "Reports closed, time from Submit to closure, endorsed reports still open." },
  { no: 16, title: "Reviewers", desc: "Fault decisions, time to decide, reclassified or rejected, decisions waiting." },
  { no: 17, title: "Technicians", desc: "Open repairs, waiting for parts, past planned date, repair time." },
  { no: 18, title: "Managers and FSM", desc: "Phone decisions confirmed, Moderate decisions acknowledged, and waiting." },
];

// Dashboards defined in the "MMS Dashboard Visualization" design (deck 08.10.2026), with the slides
// they come from. They are marked with the design colour so users can tell them apart from the
// dashboards added for the MR-I follow-up.
const DECK_SLIDES: Record<number, string> = { 2: "Slides 9 and 15", 3: "Slides 10 and 15", 4: "Slide 11" };
const DECK_NAME = "MMS Dashboard Visualization design (08.10.2026)";

function DeckBadge({ no, large = false }: { no: number; large?: boolean }) {
  if (!DECK_SLIDES[no]) return null;
  return (
    <span className={`mrid-deck-badge${large ? " is-large" : ""}`} title={`From the ${DECK_NAME}, ${DECK_SLIDES[no]}`}>
      <i aria-hidden="true" />Dashboard design{large ? ` · ${DECK_SLIDES[no]}` : ""}
    </span>
  );
}

// The dashboard list, grouped by topic.
const GROUPS: { title: string; nos: number[] }[] = [
  { title: "Faults and defects", nos: [2, 3, 4, 9] },
  { title: "Reviews and decisions", nos: [5, 6, 10] },
  { title: "Fleet condition and repairs", nos: [1, 8, 7, 12] },
  { title: "Inspections and maintenance due", nos: [11, 13] },
];

// One line icon per dashboard type (24x24, stroke = currentColor), same style as the hub tiles.
const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const DASH_ICONS: Record<number, React.ReactElement> = {
  // 1 fleet status: tag lamps (Red / Yellow / Green)
  1: svg(<><rect x="7.5" y="2.5" width="9" height="19" rx="3" /><circle cx="12" cy="7" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="17" r="1.8" /></>),
  // 2 open defects: warning triangle
  2: svg(<><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.2v.1" /></>),
  // 3 defect aging: hourglass
  3: svg(<><path d="M5.5 3h13M5.5 21h13M7 3v2.5c0 3 5 4.5 5 6.5s-5 3.5-5 6.5V21M17 3v2.5c0 3-5 4.5-5 6.5s5 3.5 5 6.5V21" /><path d="M9.5 18.5h5" /></>),
  // 4 closure rate: ring with tick
  4: svg(<><path d="M20 12a8 8 0 1 1-3-6.2" /><path d="m9 12 2.5 2.5L20 6" /></>),
  // 5 decisions waiting: person with clock
  5: svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.6-3.6 3-5.5 5.5-5.5" /><circle cx="17" cy="16" r="4" /><path d="M17 14v2l1.3 1" /></>),
  // 6 review turnaround: stopwatch
  6: svg(<><circle cx="12" cy="13.5" r="7" /><path d="M12 13.5V10M10 3h4M12 3v3.5M18.5 6.5l1.5-1.5" /></>),
  // 7 repair queue: wrench
  7: svg(<><path d="M14.5 5.5a4 4 0 0 0-5 5L3.5 16.5l3 3 6-6a4 4 0 0 0 5-5l-2.5 2.5-2.2-.6-.6-2.2z" /></>),
  // 8 time red / yellow: stopped clock with tag
  8: svg(<><circle cx="10" cy="12" r="7" /><path d="M10 8v4l2.5 1.5" /><path d="M17.5 4.5h3.5v3.5l-2 2-3.5-3.5z" /></>),
  // 9 repeat faults: circular arrows
  9: svg(<><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3M4.5 12A7.5 7.5 0 0 1 17.3 6.7" /><path d="M17.5 3v4h-4M6.5 21v-4h4" /></>),
  // 10 phone decisions: phone handset
  10: svg(<><path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" /></>),
  // 11 reports per period: bar chart
  11: svg(<><path d="M4 20V10M10 20V5M16 20v-7M22 20H2" /></>),
  // 12 exemptions: shield with tick
  12: svg(<><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.2" /></>),
  // 13 MR-II forecast: calendar with gauge needle
  // User Analytics: a person with a role mark (clipboard, tick, scales, wrench, star)
  14: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><rect x="15" y="9" width="6" height="8" rx="1.2" /><path d="M16.8 12h2.4M16.8 14.5h2.4" /></>),
  15: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M15.5 13.5l2 2 3.5-4" /></>),
  16: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M18 8v9M15.5 10h5M15.5 10l-1.2 3h2.4zM20.5 10l-1.2 3h2.4z" /></>),
  17: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M20.5 9.5a2.5 2.5 0 0 1-3.3 2.4l-2.4 2.4-1.2-1.2 2.4-2.4a2.5 2.5 0 0 1 3.1-3.2l-1.4 1.4.8.8z" /></>),
  18: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M18 8.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" /></>),
  13: svg(<><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><path d="M8.5 17a3.5 3.5 0 0 1 7 0M12 17l1.8-2" /></>),
};

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
  onBack: () => void;
  /** "mri" = the MR-I dashboards; "users" = the separate User Analytics group. */
  section?: "mri" | "users";
}

// User Analytics is its own group on the Dashboard hub, separate from the MR-I dashboards.
const USER_GROUPS: { title: string; nos: number[] }[] = [
  { title: "By role in the MR-I process", nos: [14, 15, 16, 17, 18] },
];

function MriDashboards({ onBack, section = "mri" }: MriDashboardsProps) {
  const isUsers = section === "users";
  const groups = isUsers ? USER_GROUPS : GROUPS;
  const { data: scope, isLoading, error } = useMriDashboardScope();
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [open, setOpen] = useState<number | null>(null);
  const openDash = open != null ? DASHBOARDS.find((d) => d.no === open) : undefined;
  const assets = scope?.assets ?? [];
  const shown = useMemo(() => filterAssets(assets, filters), [assets, filters]);

  return (
    <ReportPreviewProvider>
    <div className="mrid">
      <style>{MRID_CSS + FLUID_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        {openDash ? (
          <button className="ghost" onClick={() => setOpen(null)} style={{ padding: "6px 12px", fontSize: 12 }}>
            ← {isUsers ? "All User Analytics" : "All MR-I dashboards"}
          </button>
        ) : (
          <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>
            ← Back to dashboards
          </button>
        )}
      </div>
      <div className={openDash ? "mrid-headrow" : undefined}>
      <div className="header">
        {openDash ? (
          <h1 className="mrid-title"><span className={`mrid-icon${DECK_SLIDES[openDash.no] ? " is-deck" : ""}`}>{DASH_ICONS[openDash.no]}</span>{openDash.title}<DeckBadge no={openDash.no} large /></h1>
        ) : (
          <h1>{isUsers ? "User Analytics" : "MR-I Dashboards"}</h1>
        )}
        <span className="sub">{openDash ? openDash.desc : isUsers ? "Workload and response times by person, for each role in the MR-I process" : "Fleet condition, defects, reviews and inspections from MR-I reports"}</span>
      </div>
      {openDash && !isLoading && !error && <FilterBar filters={filters} onChange={setFilters} assets={assets} />}
      </div>

      {isLoading ? (
        <div className="empty">Loading...</div>
      ) : error ? (
        <div className="empty">Could not load the dashboards: {String(error)}</div>
      ) : (
        <>
          <div className="mrid-scope">
            {openDash ? (
              <span className="mrid-chip"><b>{shown.length}</b> of {assets.length} unit{assets.length === 1 ? "" : "s"} match the filters</span>
            ) : (
              <span className="mrid-chip">Card figures cover all <b>{assets.length}</b> unit{assets.length === 1 ? "" : "s"} you can see; filters are inside each dashboard</span>
            )}
            <span className="mrid-chip">
              {scope?.allowed_countries ? <>Your access: <b>{scope.allowed_countries.join(", ")}</b></> : <>Your access: <b>all countries</b></>}
            </span>
          </div>

          {openDash && BUILT[openDash.no] ? (
            (() => {
              const Full = BUILT[openDash.no].Full;
              return <Full assets={shown} filters={filters} />;
            })()
          ) : (
            <div className="mrid-groups">
              {!isUsers && (
                <div className="mrid-key" role="note">
                  <span><i className="mrid-key-swatch is-deck" />From the {DECK_NAME}</span>
                  <span><i className="mrid-key-swatch" />Added for MR-I follow-up</span>
                </div>
              )}
              {groups.map((g) => (
                <section key={g.title} className="mrid-group">
                  <h2 className="mrid-group-title">{g.title}</h2>
                  <div className="mrid-grid">
                    {g.nos.map((no) => {
                      const d = DASHBOARDS.find((x) => x.no === no)!;
                      const built = BUILT[no];
                      return (
                        <button
                          key={no}
                          type="button"
                          className={`mrid-card${built ? " mrid-card-live" : " mrid-card-pending"}${DECK_SLIDES[no] ? " is-deck" : ""}`}
                          onClick={built ? () => setOpen(no) : undefined}
                          disabled={!built}
                          title={DECK_SLIDES[no] ? `${d.desc}\nFrom the ${DECK_NAME}, ${DECK_SLIDES[no]}` : d.desc}
                        >
                          <span className={`mrid-icon${DECK_SLIDES[no] ? " is-deck" : ""}`}>{DASH_ICONS[no]}</span>
                          <span className="mrid-card-body">
                            <span className="mrid-card-title">{d.title}</span>
                            {DECK_SLIDES[no] ? <DeckBadge no={no} /> : null}
                            {built ? <built.Mini assets={assets} /> : <span className="mrid-card-desc">Coming next</span>}
                          </span>
                          <span className="mrid-card-go" aria-hidden="true">›</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
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
