import { useState, type ReactElement } from "react";
import { THEMES, type Theme } from "../../lib/theme";
import fieldOpsImage from "../../assets/FieldMaintenance.png";
import { useCurrentUser } from "../../lib/currentUser";
import { isMapFeatureEnabled, setMapFeatureEnabled } from "../../lib/mapFeatureFlag";
import { useEffectivePermissions } from "../administration/hooks/useUserAdmin";
import { usePendingMriFaultApprovals } from "../mri-reporting/hooks/useMriFaultApprovals";

type Screen = "assets" | "reports" | "dashboard" | "admin" | "uilab" | "distance-map-test" | "pending-approvals";
type MrLevel = "MR-I" | "MR-II" | "MR-III";

interface MainMenuProps {
  onNavigate: (screen: Screen, mrLevel?: MrLevel) => void;
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
}

const OPTIONS: { id: Screen; label: string; desc: string; icon: ReactElement }[] = [
  {
    id: "assets",
    label: "Asset Registry",
    desc: "Manage equipment and fixed asset records",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="4" width="18" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 8V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "reports",
    label: "Maintenance Report",
    desc: "MR-I, MR-II, MR-III report entry",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14.7 6.3a3 3 0 0 1-4 4L6 15l3 3 4.7-4.7a3 3 0 0 1 4-4l-2.3 2.3-1.7-1.7 2.3-2.3z"
          stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M5 19l-1 2 2-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "dashboard",
    label: "Dashboard",
    desc: "Fleet-wide compliance and status",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="12" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="10" y="7" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="16" y="4" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    id: "admin",
    label: "Administration",
    desc: "Users, MR-code definitions, settings",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

const MR_LEVELS: { id: MrLevel; short: string; desc: string }[] = [
  { id: "MR-I", short: "I", desc: "Field inspection" },
  { id: "MR-II", short: "II", desc: "Scheduled maintenance" },
  { id: "MR-III", short: "III", desc: "Major overhaul" },
];

const KPI_DATA = [
  { key: "availability", label: "Fleet Availability", value: "91.4", unit: "%", delta: "+0.8", good: true },
  { key: "defects", label: "Open Defects", value: "47", unit: "", delta: "-3", good: true },
];

function MainMenu({ onNavigate, currentTheme, onThemeChange }: MainMenuProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [mapFeatureOn, setMapFeatureOn] = useState(() => isMapFeatureEnabled());

  function handleMapFeatureToggle() {
    const next = !mapFeatureOn;
    setMapFeatureOn(next);
    setMapFeatureEnabled(next);
  }

  const { user: currentUser, clearCurrentUser } = useCurrentUser();
  const { data: effectivePermissions = [] } = useEffectivePermissions(currentUser?.id ?? 0);
  const canReviewApprovals = effectivePermissions.includes("mri.close_defect") || effectivePermissions.includes("mri.approve");
  const { data: pendingApprovals = [] } = usePendingMriFaultApprovals();
  const pendingApprovalsCount = pendingApprovals.length;

  function handleSwitchUser() {
    setDrawerOpen(false);
    clearCurrentUser();
  }

  function handleCardClick(id: Screen) {
    if (id === "reports") {
      setReportsExpanded((prev) => !prev);
      return;
    }
    onNavigate(id);
  }

  function handleThemeSelect(t: Theme) {
    onThemeChange(t);
    setDrawerOpen(false);
  }

  return (
    <>
      <div style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <img
            src={fieldOpsImage}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(100deg, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.82) 30%, rgba(255,255,255,0.45) 65%, rgba(255,255,255,0.15) 100%)",
            }}
          />
        </div>
        <div className="menu-screen" style={{ position: "relative", zIndex: 1 }} onClick={() => setReportsExpanded(false)}>
          <div className="menu-grid">
            {OPTIONS.map((opt) => (
              <div
                key={opt.id}
                className="menu-card"
                onClick={(e) => { e.stopPropagation(); handleCardClick(opt.id); }}
                style={{ background: "rgba(255,255,255,0.5)", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
              >
                <div className="menu-icon-wrap">{opt.icon}</div>
                <h3>{opt.label}</h3>
                <p>{opt.desc}</p>
                {opt.id === "reports" && reportsExpanded && (
                  <div className="mr-level-row" onClick={(e) => e.stopPropagation()}>
                    {MR_LEVELS.map((lvl) => (
                      <button
                        key={lvl.id}
                        className="mr-level-btn"
                        onClick={() => onNavigate("reports", lvl.id)}
                      >
                        {lvl.short}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              position: "fixed",
              left: 24,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
              zIndex: 5,
              width: 200,
            }}
          >
            {KPI_DATA.map((k) => (
              <div
                key={k.key}
                onClick={() => onNavigate("dashboard")}
                style={{ background: "none", boxShadow: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <span className="kpi-footer-label" style={{ textShadow: "0 1px 4px rgba(255,255,255,0.85)" }}>
                  {k.label}
                </span>
                <div className="kpi-footer-row">
                  <span
                    className={`kpi-footer-value ${k.key === "defects" ? "pale-red" : ""}`}
                    style={{ textShadow: "0 1px 4px rgba(255,255,255,0.85)" }}
                  >
                    {k.value}
                    <span className="kpi-footer-unit">{k.unit}</span>
                  </span>
                  <span className={`kpi-footer-delta ${k.good ? "good" : "bad"}`}>{k.delta}</span>
                </div>
                {k.key === "availability" && (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.7)",
                      borderRadius: 8,
                      padding: "4px 6px",
                      marginTop: 4,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                    }}
                  >
                    <div className="kpi-gauge-track">
                      <div className="kpi-gauge-mask" style={{ width: `${100 - parseFloat(k.value)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="side-drawer-handle" aria-label="Open menu" onClick={() => setDrawerOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.5 20c0-3.6 3.4-6.5 7.5-6.5s7.5 2.9 7.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {drawerOpen && (
        <div className="side-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="side-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-user-card">
              <div className="drawer-user-name">{currentUser?.name ?? "Unknown user"}</div>
              <div className="drawer-user-role">{currentUser?.role ?? "No role"}</div>
              <button
                className="ghost"
                style={{ marginTop: 8, padding: "6px 12px", fontSize: 12, width: "100%" }}
                onClick={handleSwitchUser}
              >
                Switch User
              </button>
            </div>

            {canReviewApprovals && (
              <div>
                <div className="drawer-section-label">Fault Review</div>
                <button
                  className="drawer-nav-btn"
                  onClick={() => { setDrawerOpen(false); onNavigate("pending-approvals"); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                  Pending Approvals
                  {pendingApprovalsCount > 0 && (
                    <span
                      style={{
                        marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "2px 8px",
                        borderRadius: 20, background: "var(--danger)", color: "#fff",
                      }}
                    >
                      {pendingApprovalsCount}
                    </span>
                  )}
                </button>
              </div>
            )}

            <div>
              <div className="drawer-section-label">Theme</div>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`theme-option ${currentTheme === t.id ? "active" : ""}`}
                  onClick={() => handleThemeSelect(t.id)}
                >
                  <span className="theme-swatch" style={{ background: t.swatch }} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <div>
              <div className="drawer-section-label">More</div>
              <button
                className="drawer-nav-btn"
                onClick={() => { setDrawerOpen(false); onNavigate("uilab"); }}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M8 12c0-2 1.5-3.5 4-3.5S16 10 16 12s-1.5 3.5-4 3.5S8 14 8 12z" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                UI Lab
              </button>
              <button
                className="drawer-nav-btn"
                onClick={() => { setDrawerOpen(false); onNavigate("distance-map-test"); }}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                Distance Map (Test)
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 13, color: "var(--text-soft)" }}>
                  Enable Map &amp; Routing (MR-I)
                </span>
                <button
                  className="neu-toggle"
                  data-on={mapFeatureOn}
                  onClick={handleMapFeatureToggle}
                  aria-label="Toggle map and routing feature"
                >
                  <span className="neu-toggle-knob" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


    </>
  );
}

export default MainMenu;