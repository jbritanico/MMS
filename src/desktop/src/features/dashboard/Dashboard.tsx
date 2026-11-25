import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  useAssetsWithMriHistorySummary,
  useAssetMriHistory,
  type AssetMriHistorySummaryRow,
} from "./hooks/useMriHistory";
import HistoryPrint from "./HistoryPrint";
import { useAssetTriggers } from "../asset-registry/hooks/useTriggers";
import { type Theme } from "../../lib/theme";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useAssetTypes } from "../administration/hooks/useAssetTypes";
import { TagLamp } from "../../components/Instruments";
import { DEFAULT_TRIGGER_ICON, TRIGGER_TYPE_COLORS, TRIGGER_TYPE_ICONS, triggerIconBg } from "../../components/triggerIcons";
import MriDashboards from "./MriDashboards";
import { FL_ICONS, FluentShell, HeroBanner, RangeTabs, sectionOfDash, type FlTone, type ShellSection } from "./fluent/FluentShell";
import Overview from "./fluent/Overview";
import { DASHBOARDS, GROUPS, USER_GROUPS } from "./dashCatalog";
import { inScope, ScopeFilterBar, useScopeFilter } from "./scopeFilter";
import { useDashAccess, type DashAccess } from "./dashAccess";
import { useMriDashboardScope } from "./hooks/useMriDashboards";

const STATUS_COLOR: Record<string, string> = {
  Draft: "var(--st-grey)",
  Submitted: "var(--st-amber)",
  Endorsed: "var(--st-blue)",
  Escalated: "var(--st-teal)",
  Approved: "var(--st-green)",
};

// Same mapping used on the Maintenance Triggers admin screen / Select Asset for Report /
// Asset Registry -- duplicated here rather than shared, per the app's existing convention.
const TRIGGER_TYPE_LABELS: Record<string, string> = {
  OH: "Operating hours",
  CA: "Calendar days",
  KM: "Distance (KM)",
  RIF: "Running-in-foot",
  EH: "Engine hours",
};









const DOCUMENT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 3h7l4 4v14H7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 13l4 4 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PENDING_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 7v5l4 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CALENDAR_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M4 9h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const LOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const PERSON_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5 20c1.2-3.6 4-5.4 7-5.4s5.8 1.8 7 5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const WARNING_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3.5 22 20H2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M12 10v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="17.3" r="1" fill="currentColor" />
  </svg>
);

const THUMBS_UP_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 11v9H4v-9h3zm0 0 4.2-7c.6-1 2-.9 2.5.2.3.6.3 1.3 0 2L12.7 9H18a2 2 0 0 1 1.9 2.7l-2.2 6A2 2 0 0 1 15.8 20H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ARROW_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Icons kept for upcoming dashboard tiles; referenced here so noUnusedLocals does not
// fail the build while they are unused.
void PERSON_ICON;
void ARROW_ICON;

const PDF_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 3h7l4 4v14H7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 17v-4h1.2a1.2 1.2 0 1 1 0 2.4H9M12.6 17v-4h1.3M12.6 15.2h1.1M16.4 13v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);


function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return value;
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function reportIconFor(status: string): ReactElement {
  if (status === "Draft") return DOCUMENT_ICON;
  if (status === "Approved") return CHECK_ICON;
  return PENDING_ICON;
}

function reportIconStyle(status: string): { background: string; color: string } {
  if (status === "Draft") return { background: "var(--chip-bg)", color: "var(--text-soft)" };
  return { background: STATUS_COLOR[status] ?? "var(--st-grey)", color: "var(--on-status)" };
}

interface DashboardAssetCardProps {
  asset: AssetMriHistorySummaryRow;
  onSelect: () => void;
  /** FB-030: smaller card (counters shown as level chips only), so long unit lists stay easy to browse. */
  compact?: boolean;
}

const tagTone = (tag: string | null | undefined): FlTone => (tag === "Red" ? "red" : tag === "Yellow" ? "amber" : tag === "Green" ? "green" : "blue");
const fmtDay = (value: string | null | undefined) => {
  if (!value) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? new Date(n * 1000).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : value;
};
const triggerTone = (t: { running_value: number; interval_value: number; warning_value: number }) =>
  t.interval_value > 0 && t.running_value >= t.interval_value ? "var(--danger)" : t.warning_value && t.running_value >= t.warning_value ? "var(--st-amber)" : "var(--success)";

// Separate component so it can call useAssetTriggers for its own asset -- hooks can't be
// called conditionally inside the parent's .map().
// ---- MR-II / MR-III counters, grouped by maintenance level ----
type Trig = { id: number; mr_level: string; trigger_type: string; running_value: number; interval_value: number; warning_value: number; enabled: boolean };
const COUNTER_SHORT: Record<string, string> = { KM: "Distance", CA: "Calendar", OH: "Operating", EH: "Engine", RIF: "Running-in" };
const LEVEL_NAME: Record<string, string> = { "MR-II": "Preventive maintenance", "MR-III": "Major maintenance" };
const usedPct = (t: Trig) => (t.interval_value > 0 ? (t.running_value / t.interval_value) * 100 : 0);
/** Counter state: 2 = interval reached, 1 = warning value reached, 0 = on track. */
const counterState = (t: Trig) => (t.interval_value > 0 && t.running_value >= t.interval_value ? 2 : t.warning_value > 0 && t.running_value >= t.warning_value ? 1 : 0);
const STATE_INFO = [
  { text: "On track", tone: "var(--success)" },
  { text: "Due soon", tone: "var(--st-amber)" },
  { text: "Due now", tone: "var(--danger)" },
];
const levelRank = (l: string) => { const i = ["MR-II", "MR-III"].indexOf(l); return i < 0 ? 9 : i; };
/** Enabled counters grouped by MR level (MR-II first), most used first inside each level. */
function groupCounters(triggers: Trig[]) {
  const by = new Map<string, Trig[]>();
  triggers.filter((t) => t.enabled).forEach((t) => by.set(t.mr_level, [...(by.get(t.mr_level) ?? []), t]));
  return [...by.entries()]
    .sort((a, b) => levelRank(a[0]) - levelRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([level, items]) => ({ level, items: items.sort((a, b) => usedPct(b) - usedPct(a)), state: Math.max(...items.map(counterState)) }));
}
const fmtCount = (n: number) => Math.round(n).toLocaleString();

/** The picture set for the unit's equipment type (the same icon its MR-I template uses), or the generic unit icon. */
function AssetPic({ assetTypeId, tone, large }: { assetTypeId: number | null | undefined; tone: FlTone; large?: boolean }) {
  const { data: assetTypes = [] } = useAssetTypes();
  const icon = assetTypeId != null ? assetTypes.find((t) => t.id === assetTypeId)?.icon : undefined;
  if (icon && icon.trim().startsWith("data:"))
    return <span className={`fl-asset-pic tone-${tone}${large ? " lg" : ""}`}><img src={icon} alt="" /></span>;
  return <span className={`fl-ico${large ? " lg" : ""} tone-${tone}`}>{FL_ICONS.fleet}</span>;
}

function DashboardAssetCard({ asset, onSelect, compact }: DashboardAssetCardProps) {
  const { data: triggers = [] } = useAssetTriggers(asset.asset_id);
  const activeTriggers = triggers.filter((t) => t.enabled);
  // Tag lamp: the asset's current Red / Yellow / Green tag (shared, cached Asset Registry list).
  const { data: registryAssets = [] } = useAssets();
  const registryAsset = registryAssets.find((x) => x.id === asset.asset_id);
  const tag = registryAsset?.tag_status ?? null;
  const tone = tagTone(tag);

  if (compact) {
    const groups = groupCounters(activeTriggers);
    return (
      <button type="button" className={`fl-asset is-compact tone-${tone}`} onClick={onSelect}
        aria-label={`${asset.asset_code}: open MR-I history`} title={`${asset.asset_code}${asset.asset_description ? " · " + asset.asset_description : ""}`}>
        <span className="fl-asset-top">
          <AssetPic assetTypeId={registryAsset?.asset_type_id} tone={tone} />
          <span className="fl-asset-name"><b>{asset.asset_code}</b><small>{asset.asset_description || "\u2014"}</small></span>
          {tag && <TagLamp status={tag} size={12} title={registryAsset?.tag_reason ?? undefined} />}
        </span>
        <span className="fl-asset-stats">
          <span className="fl-asset-count"><b>{asset.report_count}</b> report{asset.report_count === 1 ? "" : "s"}</span>
          {asset.latest_status && (
            <span className="fl-pill" style={{ ["--tone" as string]: STATUS_COLOR[asset.latest_status] ?? "var(--st-grey)" }}>{asset.latest_status}</span>
          )}
          <span className="fl-asset-date">{asset.latest_date ? fmtDay(asset.latest_date) : "No reports"}</span>
        </span>
        {groups.length > 0 && (
          <span className="fl-cnt-mini">
            {groups.map((g) => (
              <span key={g.level} className="fl-cnt-level" style={{ ["--tone" as string]: STATE_INFO[g.state].tone }}
                title={`${g.level} \u00b7 ${STATE_INFO[g.state].text}: ${g.items.map((t) => `${COUNTER_SHORT[t.trigger_type] ?? t.trigger_type} ${Math.round(usedPct(t))}%`).join(", ")}`}>
                {g.level}
              </span>
            ))}
          </span>
        )}
      </button>
    );
  }

  return (
    <button type="button" className={`fl-asset tone-${tone}`} onClick={onSelect}>
      <span className="fl-asset-top">
        <AssetPic assetTypeId={registryAsset?.asset_type_id} tone={tone} />
        <span className="fl-asset-name"><b>{asset.asset_code}</b><small>{asset.asset_description || "—"}</small></span>
        {tag && <TagLamp status={tag} size={14} title={registryAsset?.tag_reason ?? undefined} />}
      </span>
      <span className="fl-asset-stats">
        <span className="fl-asset-count"><b>{asset.report_count}</b> report{asset.report_count === 1 ? "" : "s"}</span>
        {asset.latest_status && (
          <span className="fl-pill" style={{ ["--tone" as string]: STATUS_COLOR[asset.latest_status] ?? "var(--st-grey)" }}>{asset.latest_status}</span>
        )}
        <span className="fl-asset-date">{asset.latest_date ? <>Last {fmtDay(asset.latest_date)}</> : "No reports yet"}</span>
      </span>
      {activeTriggers.length > 0 && (
        <span className="fl-cnt-list">
          {groupCounters(activeTriggers).map((g) => (
            <span key={g.level} className="fl-cnt-group">
              <span className="fl-cnt-level" style={{ ["--tone" as string]: STATE_INFO[g.state].tone }} title={`${g.level} · ${STATE_INFO[g.state].text}`}>{g.level}</span>
              <span className="fl-cnt-rows">
                {g.items.map((t) => {
                  const pct = Math.min(100, usedPct(t));
                  const unit = STAT_UNITS[t.trigger_type] ?? "";
                  return (
                    <span key={t.id} className="fl-cnt-row" title={`${g.level} · ${TRIGGER_TYPE_LABELS[t.trigger_type] ?? t.trigger_type}: ${fmtCount(t.running_value)} of ${fmtCount(t.interval_value)} ${unit} (${Math.round(usedPct(t))}%)`}>
                      <span className="fl-cnt-ico" style={{ color: TRIGGER_TYPE_COLORS[t.trigger_type] ?? "var(--text-soft)" }}>{TRIGGER_TYPE_ICONS[t.trigger_type] ?? DEFAULT_TRIGGER_ICON}</span>
                      <span className="fl-cnt-name">{COUNTER_SHORT[t.trigger_type] ?? t.trigger_type}</span>
                      <span className="fl-meter"><i style={{ width: `${pct}%`, background: triggerTone(t) }} /></span>
                      <span className="fl-cnt-val"><b>{fmtCount(t.running_value)}</b> / {fmtCount(t.interval_value)} {unit}</span>
                    </span>
                  );
                })}
              </span>
            </span>
          ))}
        </span>
      )}
      <span className="fl-asset-go">Open history {FL_ICONS.chevron}</span>
    </button>
  );
}

type HistoryFilter = "all" | "open" | "closed" | "none";
type CardSize = "compact" | "detailed";
// FB-030: the card size choice is remembered on this computer; compact is the default.
const CARD_SIZE_KEY = "mms.dashboards.historyCards";
const readCardSize = (): CardSize => { try { return localStorage.getItem(CARD_SIZE_KEY) === "detailed" ? "detailed" : "compact"; } catch { return "compact"; } };
const isOpenStatus = (s: string | null) => !!s && s !== "Approved";

/** Asset MR-I History: every unit, with search and a status filter. */
function AssetHistoryList({ assets: allAssets, isLoading, onSelect }: { assets: AssetMriHistorySummaryRow[]; isLoading: boolean; onSelect: (a: AssetMriHistorySummaryRow) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [cardSize, setCardSizeState] = useState<CardSize>(readCardSize);
  const setCardSize = (v: CardSize) => { setCardSizeState(v); try { localStorage.setItem(CARD_SIZE_KEY, v); } catch { /* applies for this session */ } };
  // Country / service line filter shared with the other dashboards (unit details from the dashboard scope).
  const scopeF = useScopeFilter();
  const { data: scopeData } = useMriDashboardScope();
  const unitOf = useMemo(() => new Map((scopeData?.assets ?? []).map((a) => [a.id, a])), [scopeData]);
  const assets = useMemo(() => (scopeF.country || scopeF.serviceLine
    ? allAssets.filter((a) => { const u = unitOf.get(a.asset_id); return !!u && inScope(u, scopeF); })
    : allAssets), [allAssets, unitOf, scopeF]);
  const reports = assets.reduce((n, a) => n + a.report_count, 0);
  const openN = assets.filter((a) => isOpenStatus(a.latest_status)).length;
  const noneN = assets.filter((a) => a.report_count === 0).length;
  const closedN = assets.filter((a) => a.latest_status === "Approved").length;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return assets.filter((a) =>
      (!t || `${a.asset_code} ${a.asset_description ?? ""}`.toLowerCase().includes(t)) &&
      (filter === "all" || (filter === "open" ? isOpenStatus(a.latest_status) : filter === "closed" ? a.latest_status === "Approved" : a.report_count === 0)));
  }, [assets, q, filter]);

  return (
    <>
      <HeroBanner
        eyebrow="Asset MR-I History"
        title="Every unit's MR-I report timeline"
        text="Pick a unit to see each MR-I report in order, its readings, faults found and where its MR-II / MR-III counters stand."
        chips={<>
          <span className="fl-chip">{assets.length} unit{assets.length === 1 ? "" : "s"}</span>
          <span className="fl-chip">{reports} MR-I report{reports === 1 ? "" : "s"}</span>
        </>}
      >
        <div className="fl-hero-stat"><b>{openN}</b><span>Last report open</span></div>
        <div className="fl-hero-stat"><b>{noneN}</b><span>No reports yet</span></div>
      </HeroBanner>

      <ScopeFilterBar shown={assets.length} total={allAssets.length} />

      <div className="fl-toolbar">
        <div className="fl-search fl-toolbar-search">
          <span className="fl-search-icon">{FL_ICONS.search}</span>
          <input type="search" placeholder="Find a unit by code or description" aria-label="Find a unit" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <RangeTabs<HistoryFilter>
          label="Show units"
          value={filter}
          onChange={setFilter}
          options={[{ v: "all", label: `All ${assets.length}` }, { v: "open", label: `Last report open ${openN}` }, { v: "closed", label: `Last report closed ${closedN}` }, { v: "none", label: `No reports ${noneN}` }]}
        />
        <RangeTabs<CardSize>
          label="Card size"
          value={cardSize}
          onChange={setCardSize}
          options={[{ v: "compact", label: "Compact" }, { v: "detailed", label: "Detailed" }]}
        />
      </div>

      {isLoading ? (
        <div className="empty"><span className="fl-spinner" />Loading the units…</div>
      ) : assets.length === 0 ? (
        <div className="empty">No assets yet — create one in Asset Registry to get started</div>
      ) : shown.length === 0 ? (
        <div className="empty">No unit matches the search and filter.</div>
      ) : (
        <div className={`fl-asset-grid${cardSize === "compact" ? " is-compact" : ""}`}>
          {shown.map((a) => <DashboardAssetCard key={a.asset_id} asset={a} compact={cardSize === "compact"} onSelect={() => onSelect(a)} />)}
        </div>
      )}
    </>
  );
}

interface StatCardProps {
  type: string;
  label: string;
  runningValue: number;
  intervalValue: number;
  warningValue?: number;
}

const STAT_UNITS: Record<string, string> = { KM: "km", OH: "h", EH: "h", CA: "days", RIF: "ft" };

// Modern KPI card: big reading, slim progress bar with the warning point marked,
// and a status pill (On track / Due soon / Overdue) driven by the trigger's own thresholds.
function StatCard({ type, label, runningValue, intervalValue, warningValue }: StatCardProps) {
  const color = TRIGGER_TYPE_COLORS[type] ?? "var(--text-soft)";
  const iconBg = triggerIconBg(type);
  const unit = STAT_UNITS[type] ?? "";
  const pct = intervalValue > 0 ? Math.min(100, Math.max(0, (runningValue / intervalValue) * 100)) : 0;
  const warnPct = intervalValue > 0 && warningValue ? Math.min(100, (warningValue / intervalValue) * 100) : null;
  const status =
    intervalValue > 0 && runningValue >= intervalValue
      ? { text: "Overdue", tone: "var(--danger)" }
      : warningValue && runningValue >= warningValue
        ? { text: "Due soon", tone: "var(--st-amber)" }
        : { text: "On track", tone: "var(--success)" };
  const left = intervalValue - runningValue;

  return (
    <div className="mri-stat-card mri-kpi-card">
      <div className="mri-kpi-head">
        <span className="mri-stat-icon" style={{ background: iconBg, color }}>
          {TRIGGER_TYPE_ICONS[type] ?? DEFAULT_TRIGGER_ICON}
        </span>
        <div className="mri-stat-label">{label}</div>
        <span className="mri-kpi-pill" style={{ color: status.tone, background: `color-mix(in srgb, ${status.tone} 14%, transparent)` }}>
          <i style={{ background: status.tone }} />
          {status.text}
        </span>
      </div>
      <div className="mri-kpi-value">
        {runningValue.toLocaleString()}
        <span className="mri-kpi-unit">{unit}</span>
        <span className="mri-kpi-of">of {intervalValue.toLocaleString()} {unit}</span>
      </div>
      <div
        className="mri-kpi-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={intervalValue}
        aria-valuenow={runningValue}
        aria-label={`${label}: ${runningValue} of ${intervalValue}`}
      >
        <div className="mri-kpi-fill" style={{ width: `${pct}%`, background: status.tone }} />
        {warnPct !== null && <span className="mri-kpi-warn" style={{ left: `${warnPct}%` }} title={`Warning at ${warningValue!.toLocaleString()} ${unit}`} />}
      </div>
      <div className="mri-kpi-foot">
        <span>{left >= 0 ? `${left.toLocaleString()} ${unit} left` : `${(-left).toLocaleString()} ${unit} over`}</span>
        <span>{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

interface AssetHistoryPanelProps {
  assetId: number;
  assetCode: string;
  assetDescription: string | null;
  onBack: () => void;
  onOpenReport?: (reportId: number) => void;
  onShowAssetFlow?: (assetId: number) => void;
}

// FB-023: stage names as people say them, for the stage filter.
const STAGE_LABEL: Record<string, string> = { PREMOB: "Pre-Mob", PREJOB: "Pre-Job", POSTJOB: "Post-Job", YARDINSPECTION: "Yard inspection", YARD: "Yard inspection" };
const stageLabel = (s: string) => STAGE_LABEL[s.replace(/[^A-Za-z]/g, "").toUpperCase()] ?? s;
type ReportPeriod = "all" | "30" | "90" | "365";
const PERIOD_DAYS: Record<ReportPeriod, number> = { all: 0, "30": 30, "90": 90, "365": 365 };

function AssetHistoryPanel({ assetId, assetCode, assetDescription, onBack, onOpenReport, onShowAssetFlow }: AssetHistoryPanelProps) {
  const { data: rows = [], isLoading } = useAssetMriHistory(assetId);
  const [printing, setPrinting] = useState(false);
  const { data: triggers = [] } = useAssetTriggers(assetId);
  const { data: registryAssets = [] } = useAssets();
  const registryAsset = registryAssets.find((x) => x.id === assetId);
  const tag = registryAsset?.tag_status ?? null;
  const counterGroups = useMemo(() => groupCounters(triggers), [triggers]);

  // FB-023: find a report of this unit by number, date, stage, status, people or fault text.
  const [rq, setRq] = useState("");
  const [stage, setStage] = useState("all");
  const [period, setPeriod] = useState<ReportPeriod>("all");
  const stages = useMemo(() => [...new Set(rows.map((r) => r.compliance_stage).filter((s): s is string => !!s))], [rows]);
  const shownRows = useMemo(() => {
    const terms = rq.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const days = PERIOD_DAYS[period];
    const since = days ? Date.now() - days * 86400000 : 0;
    return rows.filter((r) => {
      if (stage !== "all" && r.compliance_stage !== stage) return false;
      if (since) { const t = new Date(r.created_date).getTime(); if (!(t >= since)) return false; }
      if (!terms.length) return true;
      const text = [
        `#${r.id}`, String(r.id), r.status, r.compliance_stage ?? "", r.compliance_stage ? stageLabel(r.compliance_stage) : "", r.component_label ?? "",
        r.submitted_by ?? "", r.approved_by ?? "", r.created_date, r.submitted_date ?? "", r.approved_date ?? "",
        formatDate(r.created_date), r.submitted_date ? formatDate(r.submitted_date) : "", r.approved_date ? formatDate(r.approved_date) : "",
        ...r.key_issues,
      ].join(" ").toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  }, [rows, rq, stage, period]);
  const filtersOn = rq.trim() !== "" || stage !== "all" || period !== "all";

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>
          ← All units
        </button>
      </div>

      <div className="fl-asset-head">
        <AssetPic assetTypeId={registryAsset?.asset_type_id} tone={tagTone(tag)} large />
        <div className="fl-asset-headtext">
          <h2>{assetCode}{tag && <TagLamp status={tag} size={16} showText title={registryAsset?.tag_reason ?? undefined} />}</h2>
          <p>{assetDescription ?? "No description"} · MR-I report history{registryAsset?.tag_reason ? ` · ${registryAsset.tag_reason}` : ""}</p>
        </div>
        <div className="fl-asset-headtools">
          {!isLoading && <span className="fl-pill tone-blue">{rows.length} report{rows.length === 1 ? "" : "s"}</span>}
          {onShowAssetFlow && (
            <button className="ghost" onClick={() => onShowAssetFlow(assetId)} style={{ padding: "6px 12px", fontSize: 12 }}>
              Show flow
            </button>
          )}
          <button className="ghost" onClick={() => setPrinting(true)} disabled={isLoading} style={{ padding: "6px 12px", fontSize: 12 }}>
            Print history
          </button>
        </div>
      </div>
      {printing && (
        <HistoryPrint assetId={assetId} assetCode={assetCode} assetDescription={assetDescription} tag={tag} tagReason={registryAsset?.tag_reason ?? null}
          rows={rows} triggers={triggers} onClose={() => setPrinting(false)} />
      )}

      {counterGroups.length > 0 && <h2 className="fl-section-title fl-gap">MR-II / MR-III counters</h2>}
      {counterGroups.map((g) => (
        <section key={g.level} className="fl-cnt-board" style={{ ["--tone" as string]: STATE_INFO[g.state].tone }}>
          <div className="fl-cnt-board-head">
            <span className="fl-cnt-level lg">{g.level}</span>
            <div className="fl-cnt-board-text">
              <b>{LEVEL_NAME[g.level] ?? "Maintenance"}</b>
              <small>{g.items.length === 1 ? "Due when this counter reaches its limit" : `Due when the first of these ${g.items.length} counters reaches its limit`}</small>
            </div>
            <span className="fl-cnt-state"><i />{STATE_INFO[g.state].text}</span>
          </div>
          <div className="mri-stat-grid">
            {g.items.map((t) => (
              <StatCard key={t.id} type={t.trigger_type} label={TRIGGER_TYPE_LABELS[t.trigger_type] ?? t.trigger_type}
                runningValue={t.running_value} intervalValue={t.interval_value} warningValue={t.warning_value} />
            ))}
          </div>
        </section>
      ))}

      <h2 className="fl-section-title fl-gap">Report timeline</h2>
      {!isLoading && rows.length > 0 && (
        <div className="fl-toolbar" style={{ marginTop: 12 }}>
          <div className="fl-search fl-toolbar-search">
            <span className="fl-search-icon">{FL_ICONS.search}</span>
            <input type="search" placeholder="Find a report: number, date, stage, name or fault" aria-label="Find a report of this unit" value={rq} onChange={(e) => setRq(e.target.value)} />
          </div>
          {stages.length > 1 && (
            <select className="neu-select" aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} style={{ width: "auto" }}>
              <option value="all">All stages</option>
              {stages.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
            </select>
          )}
          <RangeTabs<ReportPeriod>
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[{ v: "all", label: "All time" }, { v: "30", label: "30 days" }, { v: "90", label: "90 days" }, { v: "365", label: "12 months" }]}
          />
          <span className="fl-chip">{filtersOn ? `${shownRows.length} of ${rows.length} reports` : `${rows.length} report${rows.length === 1 ? "" : "s"}`}</span>
          {filtersOn && (
            <button type="button" className="ghost" onClick={() => { setRq(""); setStage("all"); setPeriod("all"); }} style={{ padding: "6px 12px", fontSize: 12 }}>
              Clear
            </button>
          )}
        </div>
      )}
      {isLoading ? (
        <div className="empty" style={{ marginTop: 14 }}><span className="fl-spinner" />Loading the reports…</div>
      ) : rows.length === 0 ? (
        <div className="empty" style={{ marginTop: 14 }}>No MR-I reports have been filed for this asset yet.</div>
      ) : shownRows.length === 0 ? (
        <div className="empty" style={{ marginTop: 14 }}>No report matches the search and filters.</div>
      ) : (
        <div className="mri-report-timeline">
          {shownRows.map((row) => {
            const iconStyle = reportIconStyle(row.status);
            const kmTrigger = triggers.find((t) => t.trigger_type === "KM" && t.enabled);
            const ohTrigger = triggers.find((t) => t.trigger_type === "OH" && t.enabled);
            const ehTrigger = triggers.find((t) => t.trigger_type === "EH" && t.enabled);

            return (
              <div key={row.id} className="mri-report-item">
                <span className="mri-report-dot" style={{ background: STATUS_COLOR[row.status] ?? "var(--st-grey)" }} />
                <div className="mri-report-card">
                  {(row.km_reading !== null || row.oh_reading !== null || row.eh_reading !== null) && (
                    <div className="mri-report-readings">
                      {row.km_reading !== null && (
                        <span className="trigger-icon-chip" title="Distance travelled (KM) at this stage">
                          <span style={{ color: TRIGGER_TYPE_COLORS.KM, display: "inline-flex" }}>{TRIGGER_TYPE_ICONS.KM}</span>
                          <span>
                            {Math.round(row.km_reading).toLocaleString()}
                            {kmTrigger ? `/${kmTrigger.interval_value.toLocaleString()}` : ""}
                          </span>
                        </span>
                      )}
                      {row.oh_reading !== null && (
                        <span className="trigger-icon-chip" title="Operating hours at this stage">
                          <span style={{ color: TRIGGER_TYPE_COLORS.OH, display: "inline-flex" }}>{TRIGGER_TYPE_ICONS.OH}</span>
                          <span>
                            {Math.round(row.oh_reading).toLocaleString()}
                            {ohTrigger ? `/${ohTrigger.interval_value.toLocaleString()}` : ""}
                          </span>
                        </span>
                      )}
                      {row.eh_reading !== null && (
                        <span className="trigger-icon-chip" title="Engine hours at this stage">
                          <span style={{ color: TRIGGER_TYPE_COLORS.EH, display: "inline-flex" }}>{TRIGGER_TYPE_ICONS.EH}</span>
                          <span>
                            {Math.round(row.eh_reading).toLocaleString()}
                            {ehTrigger ? `/${ehTrigger.interval_value.toLocaleString()}` : ""}
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                  <span className="mri-report-icon" style={iconStyle}>
                    {reportIconFor(row.status)}
                  </span>

                  <div className="mri-report-info">
                    <div className="mri-report-title">
                      Report #{row.id}
                      {row.component_label && <span> · {row.component_label}</span>}
                      {row.compliance_stage && <span> / {row.compliance_stage}</span>}
                    </div>
                    <div className="mri-report-fields">
                      <span className="mri-report-field-label">Created</span>
                      <span className="mri-report-field-date">
                        {CALENDAR_ICON}
                        <span>{formatDate(row.created_date)}</span>
                      </span>

                      <span className="mri-report-field-label">{row.submitted_by ?? "Not submitted"}</span>
                      <span className="mri-report-field-date">
                        {row.submitted_date && (
                          <>
                            {CALENDAR_ICON}
                            <span>{formatDate(row.submitted_date)}</span>
                          </>
                        )}
                      </span>

                      <span className="mri-report-field-label">{row.approved_by ?? "Not closed"}</span>
                      <span className="mri-report-field-date">
                        {row.approved_date && (
                          <>
                            {CALENDAR_ICON}
                            <span>{formatDate(row.approved_date)}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="mri-report-issues-block">
                    <div className="mri-report-issues" style={{ color: row.issue_count > 0 ? "var(--danger)" : "var(--success)" }}>
                      {row.issue_count > 0 ? WARNING_ICON : THUMBS_UP_ICON}
                      <span>{row.issue_count} issue{row.issue_count === 1 ? "" : "s"}</span>
                    </div>

                    {row.key_issues.length > 0 && (
                      <span className="mri-report-key-issue">
                        {LOCK_ICON}
                        <span>{row.key_issues.join(" / ")}</span>
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="mri-report-view-btn" onClick={() => onOpenReport?.(row.id)}>
                      {PDF_ICON}
                      <span>View Report</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

type DashboardView = "hub" | "mri-history" | "mri-dashboards" | "user-analytics";
// Which dashboard view, asset and dashboard are open. Held by App so Back from a flow returns to them.
export type DashboardNav = { view: DashboardView; asset: { id: number; code: string; description: string | null } | null; dash?: number | null };

interface DashboardProps {
  onOpenReport?: (reportId: number) => void;
  onShowAssetFlow?: (assetId: number) => void;
  /** Kept for the caller; the Fluent dashboard area takes its colours from the theme tokens. */
  theme: Theme;
  nav: DashboardNav;
  onNavChange: (nav: DashboardNav) => void;
}

const VIEW_OF: Record<ShellSection, DashboardView> = { overview: "hub", "mri-history": "mri-history", "mri-dashboards": "mri-dashboards", "user-analytics": "user-analytics" };
const SECTION_OF: Record<DashboardView, ShellSection> = { hub: "overview", "mri-history": "mri-history", "mri-dashboards": "mri-dashboards", "user-analytics": "user-analytics" };
const HEAD: Record<DashboardView, [string, string]> = {
  hub: ["Dashboard", "MR-I overview for the units you can see"],
  "mri-dashboards": ["MR-I Dashboards", "Fleet condition, faults, reviews and inspections from MR-I reports"],
  "user-analytics": ["User Analytics", "Workload and response times by person, for each role in the MR-I process"],
  "mri-history": ["Asset MR-I History", "Every unit's MR-I report timeline, trigger status and trend"],
};

/** Shown when the item the user opened is turned off for them; lists what they can open instead. */
function NoDashAccess({ access, onOpenDash, onSection }: { access: DashAccess; onOpenDash: (no: number) => void; onSection: (s: ShellSection) => void }) {
  const any = access.overview || access.history || access.allowed.length > 0;
  return (
    <div className="empty" style={{ display: "grid", gap: 12, justifyItems: "center", padding: "48px 16px" }}>
      <b style={{ fontSize: 16 }}>This dashboard is not available for your account</b>
      <span>{any ? "Your Administrator has turned it off for you. You can open:" : "Your Administrator has not given you access to any dashboard yet."}</span>
      {any && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 720 }}>
          {access.overview && <button type="button" className="ghost" onClick={() => onSection("overview")}>Overview</button>}
          {access.history && <button type="button" className="ghost" onClick={() => onSection("mri-history")}>Asset MR-I History</button>}
          {access.allowed.map((no) => {
            const d = DASHBOARDS.find((x) => x.no === no);
            return d ? <button key={no} type="button" className="ghost" onClick={() => onOpenDash(no)}>{d.title}</button> : null;
          })}
        </div>
      )}
    </div>
  );
}

function Dashboard({ onOpenReport, onShowAssetFlow, nav, onNavChange }: DashboardProps) {
  const view = nav.view;
  const selectedAsset = nav.asset;
  const setSection = (s: ShellSection) => onNavChange({ view: VIEW_OF[s], asset: s === "mri-history" ? nav.asset : null, dash: null });
  const openDash = (no: number) => onNavChange({ view: VIEW_OF[sectionOfDash(no)], asset: null, dash: no });
  const setSelectedAsset = (a: DashboardNav["asset"]) => onNavChange({ ...nav, asset: a });
  const { data: assets = [], isLoading } = useAssetsWithMriHistorySummary();
  const [title, subtitle] = HEAD[view];
  const access = useDashAccess();
  // The dashboard on screen in the MR-I / User Analytics sections (first one the user may open until one is picked).
  const activeDash = view === "mri-dashboards" ? nav.dash ?? access.firstMri ?? GROUPS[0].nos[0] : view === "user-analytics" ? nav.dash ?? access.firstUser ?? USER_GROUPS[0].nos[0] : null;
  // Items turned off for this user (Administration > Roles / Users > Permissions) are not shown.
  const blocked =
    (view === "hub" && !access.overview) ||
    (view === "mri-history" && !access.history) ||
    ((view === "mri-dashboards" || view === "user-analytics") && (activeDash == null || !access.dash(activeDash)));

  // Overview turned off: open the first item the user may see instead of an empty landing page.
  const landing = view === "hub" && !access.overview
    ? (access.firstMri ?? access.firstUser) != null ? `d${access.firstMri ?? access.firstUser}` : access.history ? "history" : null
    : null;
  useEffect(() => {
    if (landing === "history") setSection("mri-history");
    else if (landing) openDash(Number(landing.slice(1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing]);

  let body: ReactNode;
  if (blocked) {
    body = <NoDashAccess access={access} onOpenDash={openDash} onSection={setSection} />;
  } else if (view === "mri-history" && selectedAsset) {
    body = (
      <AssetHistoryPanel
        assetId={selectedAsset.id}
        assetCode={selectedAsset.code}
        assetDescription={selectedAsset.description}
        onBack={() => setSelectedAsset(null)}
        onOpenReport={onOpenReport}
        onShowAssetFlow={onShowAssetFlow}
      />
    );
  } else if (view === "user-analytics" || view === "mri-dashboards") {
    body = <MriDashboards key={view} section={view === "user-analytics" ? "users" : "mri"} open={activeDash} />;
  } else if (view === "mri-history") {
    body = (
      <AssetHistoryList
        assets={assets}
        isLoading={isLoading}
        onSelect={(a) => setSelectedAsset({ id: a.asset_id, code: a.asset_code, description: a.asset_description })}
      />
    );
  } else {
    body = <Overview onSection={setSection} onOpenDash={openDash} />;
  }

  return (
    <FluentShell section={SECTION_OF[view]} dash={activeDash} onSection={setSection} onOpenDash={openDash} title={title} subtitle={subtitle}>
      {body}
    </FluentShell>
  );
}

export default Dashboard;
