import { useState, type ReactElement, type ReactNode } from "react";
import {
  useAssetsWithMriHistorySummary,
  useAssetMriHistory,
  type AssetMriHistorySummaryRow,
} from "./hooks/useMriHistory";
import { useAssetTriggers } from "../asset-registry/hooks/useTriggers";
import dashboardBgImage from "../../assets/FieldMaintenance.png";

const STATUS_COLOR: Record<string, string> = {
  Draft: "#6b7280",
  Submitted: "#d97706",
  Endorsed: "#2f6fed",
  Escalated: "#0d9488",
  Approved: "#16a34a",
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

const TRIGGER_TYPE_COLORS: Record<string, string> = {
  OH: "var(--accent-blue)",
  CA: "var(--warn)",
  KM: "var(--success)",
  RIF: "var(--accent)",
  EH: "var(--danger)",
};

// Soft tint backgrounds for the stat-card icon chips -- reusing the theme's existing soft
// tokens where one lines up with the trigger color; OH's blue has no themed soft token, so
// it gets a fixed low-alpha tint instead.
const TRIGGER_STAT_ICON_BG: Record<string, string> = {
  KM: "var(--success-soft)",
  OH: "rgba(47, 111, 237, 0.14)",
  EH: "var(--danger-soft)",
};

const TRIGGER_TYPE_ICONS: Record<string, ReactElement> = {
  OH: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  CA: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 9h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  KM: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  RIF: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="9" width="18" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9v3M11 9v3M15 9v3M19 9v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  EH: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 15a8 8 0 1 1 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 15l4-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" />
    </svg>
  ),
};

const DEFAULT_TRIGGER_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </svg>
);

const HISTORY_TILE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FAULT_TREND_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FLEET_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const BUDGET_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 8v8M9 10.5c0-1.4 1.3-2.5 3-2.5s3 .9 3 2c0 2.5-6 1.5-6 4 0 1.1 1.3 2 3 2s3-1.1 3-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

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

const PDF_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 3h7l4 4v14H7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 17v-4h1.2a1.2 1.2 0 1 1 0 2.4H9M12.6 17v-4h1.3M12.6 15.2h1.1M16.4 13v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const STAT_DEFS: { type: string; label: string }[] = [
  { type: "KM", label: "Distance Travelled (KM)" },
  { type: "OH", label: "Operating hours" },
  { type: "EH", label: "Engine hours" },
];

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
  if (status === "Draft") return { background: "var(--neu-shadow-dark)", color: "var(--text-soft)" };
  return { background: STATUS_COLOR[status] ?? "#6b7280", color: "#fff" };
}

// Washed-out background photo layer, the same treatment used on the Main Menu screen,
// applied behind every Dashboard sub-screen for a consistent look across the app.
function DashboardBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-bg-wrap">
      <div className="dashboard-bg-layer">
        <img src={dashboardBgImage} alt="" />
        <div className="dashboard-bg-veil" />
      </div>
      <div className="dashboard-bg-content">{children}</div>
    </div>
  );
}

interface DashboardAssetCardProps {
  asset: AssetMriHistorySummaryRow;
  onSelect: () => void;
}

// Separate component so it can call useAssetTriggers for its own asset -- hooks can't be
// called conditionally inside the parent's .map().
function DashboardAssetCard({ asset, onSelect }: DashboardAssetCardProps) {
  const { data: triggers = [] } = useAssetTriggers(asset.asset_id);
  const activeTriggers = triggers.filter((t) => t.enabled);

  return (
    <div className="mri-history-card" onClick={onSelect}>
      <div className="card-main">
        <div className="code">{asset.asset_code}</div>
        <div className="desc">{asset.asset_description || "—"}</div>
        <div className="meta">
          <span className="pill neutral">
            {asset.report_count} report{asset.report_count === 1 ? "" : "s"}
          </span>
          {asset.latest_status && (
            <span
              className="pill"
              style={{ background: STATUS_COLOR[asset.latest_status] ?? "#6b7280", color: "#fff" }}
            >
              {asset.latest_status}
            </span>
          )}
          {asset.latest_date && <span className="pill neutral">{formatDate(asset.latest_date)}</span>}
        </div>
        {activeTriggers.length > 0 && (
          <div className="meta" style={{ marginTop: 4 }}>
            {activeTriggers.map((t) => (
              <span
                key={t.id}
                className="trigger-icon-chip"
                title={TRIGGER_TYPE_LABELS[t.trigger_type] ?? t.trigger_type}
              >
                <span
                  style={{
                    color: TRIGGER_TYPE_COLORS[t.trigger_type] ?? "var(--text-soft)",
                    display: "inline-flex",
                  }}
                >
                  {TRIGGER_TYPE_ICONS[t.trigger_type] ?? DEFAULT_TRIGGER_ICON}
                </span>
                <span>{t.running_value}/{t.interval_value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  type: string;
  label: string;
  runningValue: number;
  intervalValue: number;
}

function StatCard({ type, label, runningValue, intervalValue }: StatCardProps) {
  const color = TRIGGER_TYPE_COLORS[type] ?? "var(--text-soft)";
  const iconBg = TRIGGER_STAT_ICON_BG[type] ?? "var(--neu-shadow-dark)";
  const pct = intervalValue > 0 ? Math.min(100, Math.max(0, (runningValue / intervalValue) * 100)) : 0;

  return (
    <div className="mri-stat-card">
      <span className="mri-stat-icon" style={{ background: iconBg, color }}>
        {TRIGGER_TYPE_ICONS[type] ?? DEFAULT_TRIGGER_ICON}
      </span>
      <div className="mri-stat-body">
        <div className="mri-stat-label">{label}</div>
        <div className="mri-stat-value">{runningValue.toLocaleString()}</div>
        <div className="mri-stat-bar-track">
          <div className="mri-stat-bar-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
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
}

function AssetHistoryPanel({ assetId, assetCode, assetDescription, onBack, onOpenReport }: AssetHistoryPanelProps) {
  const { data: rows = [], isLoading } = useAssetMriHistory(assetId);
  const { data: triggers = [] } = useAssetTriggers(assetId);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>
          ← Back to assets
        </button>
      </div>

      <div className="header">
        <h1>{assetCode}</h1>
        <span className="sub">{assetDescription ?? "No description"} · MR-I report history</span>
      </div>

      <div className="mri-stat-grid">
        {STAT_DEFS.map((def) => {
          const trigger = triggers.find((t) => t.trigger_type === def.type && t.enabled);
          if (!trigger) return null;
          return (
            <StatCard
              key={def.type}
              type={def.type}
              label={def.label}
              runningValue={trigger.running_value}
              intervalValue={trigger.interval_value}
            />
          );
        })}
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 20 }}>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 20 }}>No MR-I reports have been filed for this asset yet.</p>
      ) : (
        <div className="mri-report-timeline">
          {rows.map((row) => {
            const iconStyle = reportIconStyle(row.status);
            const kmTrigger = triggers.find((t) => t.trigger_type === "KM" && t.enabled);
            const ohTrigger = triggers.find((t) => t.trigger_type === "OH" && t.enabled);
            const ehTrigger = triggers.find((t) => t.trigger_type === "EH" && t.enabled);

            return (
              <div key={row.id} className="mri-report-item">
                <span className="mri-report-dot" style={{ background: STATUS_COLOR[row.status] ?? "#6b7280" }} />
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

                  <button className="mri-report-view-btn" onClick={() => onOpenReport?.(row.id)}>
                    {PDF_ICON}
                    <span>View Report</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type DashboardView = "hub" | "mri-history";

interface DashboardProps {
  onOpenReport?: (reportId: number) => void;
}

function Dashboard({ onOpenReport }: DashboardProps) {
  const [view, setView] = useState<DashboardView>("hub");
  const [selectedAsset, setSelectedAsset] = useState<{ id: number; code: string; description: string | null } | null>(null);
  const { data: assets = [], isLoading } = useAssetsWithMriHistorySummary();

  if (view === "mri-history" && selectedAsset) {
    return (
      <DashboardBackdrop>
        <AssetHistoryPanel
          assetId={selectedAsset.id}
          assetCode={selectedAsset.code}
          assetDescription={selectedAsset.description}
          onBack={() => setSelectedAsset(null)}
          onOpenReport={onOpenReport}
        />
      </DashboardBackdrop>
    );
  }

  if (view === "mri-history") {
    return (
      <DashboardBackdrop>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <button className="ghost" onClick={() => setView("hub")} style={{ padding: "6px 12px", fontSize: 12 }}>
              ← Back to dashboards
            </button>
          </div>

          <div className="header">
            <h1>Asset MR-I History</h1>
            <span className="sub">Select an asset to view its full MR-I report timeline</span>
          </div>

          {isLoading ? (
            <div className="empty">Loading...</div>
          ) : assets.length === 0 ? (
            <div className="empty">No assets yet — create one in Asset Registry to get started</div>
          ) : (
            <div className="mri-history-grid">
              {assets.map((a) => (
                <DashboardAssetCard
                  key={a.asset_id}
                  asset={a}
                  onSelect={() => setSelectedAsset({ id: a.asset_id, code: a.asset_code, description: a.asset_description })}
                />
              ))}
            </div>
          )}
        </div>
      </DashboardBackdrop>
    );
  }

  return (
    <DashboardBackdrop>
      <div>
        <div className="header">
          <h1>Dashboard</h1>
          <span className="sub">Choose a view</span>
        </div>

        <div className="dashboard-hub-grid">
          <div className="dashboard-tile" onClick={() => setView("mri-history")}>
            <span className="dashboard-tile-icon">{HISTORY_TILE_ICON}</span>
            <span className="dashboard-tile-title">Asset MR-I History</span>
            <span className="dashboard-tile-desc">Browse every asset's MR-I report timeline, trigger status, and trend.</span>
          </div>

          <div className="dashboard-tile disabled">
            <span className="dashboard-tile-icon">{FAULT_TREND_ICON}</span>
            <span className="dashboard-tile-title">Fault Trends</span>
            <span className="dashboard-tile-desc">Recurring faults and rectification turnaround across the fleet.</span>
            <span className="dashboard-tile-badge">Coming soon</span>
          </div>

          <div className="dashboard-tile disabled">
            <span className="dashboard-tile-icon">{FLEET_ICON}</span>
            <span className="dashboard-tile-title">Fleet Utilization</span>
            <span className="dashboard-tile-desc">Uptime, active vs. idle assets, and country-level coverage.</span>
            <span className="dashboard-tile-badge">Coming soon</span>
          </div>

          <div className="dashboard-tile disabled">
            <span className="dashboard-tile-icon">{BUDGET_ICON}</span>
            <span className="dashboard-tile-title">Budget & Planning</span>
            <span className="dashboard-tile-desc">MR-III planning cost projections and budget tracking.</span>
            <span className="dashboard-tile-badge">Coming soon</span>
          </div>
        </div>
      </div>
    </DashboardBackdrop>
  );
}

export default Dashboard;