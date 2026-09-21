import { useEffect, useState, type ReactNode } from "react";
import { useCurrentUser } from "./currentUser";
import fieldOpsImage from "../assets/FieldMaintenance.png";

interface TierReference {
  name: string;
  description: string;
  responsibilities: string[];
  accent: string;
}

const TIER_REFERENCE: TierReference[] = [
  {
    name: "Data Miner View",
    description: "Read-only access for browsing dashboards and reports.",
    responsibilities: [
      "Read-only access to dashboards and reports",
      "Views and exports data for analysis",
      "Cannot edit, submit, or approve anything",
    ],
    accent: "#2f6fed",
  },
  {
    name: "Operator",
    description: "Field personnel who perform inspections and submit MR-I reports.",
    responsibilities: [
      "Performs inspections and field data capture",
      "Attaches photos, records, and comments",
      "Submits MR-I reports for review",
    ],
    accent: "#d97706",
  },
  {
    name: "Job Supervisor",
    description: "On-site lead and first point of contact for review.",
    responsibilities: [
      "Reviews inspections and gives initial evaluation",
      "Approves reports with no fault or Minor findings",
      "Escalates Moderate/Critical issues to the right authority",
    ],
    accent: "#2f6fed",
  },
  {
    name: "Maintenance Supervisor",
    description: "Reviews and closes Moderate-severity faults.",
    responsibilities: [
      "Reviews and closes Moderate-severity faults",
      "Manages escalations and reassigns as needed",
      "Monitors turnaround and report status",
    ],
    accent: "#7c3aed",
  },
  {
    name: "Maintenance Manager / FSM",
    description: "Reviews and closes Critical-severity faults.",
    responsibilities: [
      "Reviews and closes Critical-severity faults",
      "Makes go/no-go decisions on escalations",
      "Oversees tagged equipment and rectification",
    ],
    accent: "#0d9488",
  },
  {
    name: "Administrator",
    description: "Full system access, unrestricted.",
    responsibilities: [
      "Full system access, user and role management",
      "Configures templates, assets, and workflows",
      "Manages MR-I review and approval permissions",
    ],
    accent: "#4b5563",
  },
];

export function tierAccent(role: string): string {
  const match = TIER_REFERENCE.find((t) => t.name === role);
  return match ? match.accent : roleBadge(role).color;
}

export function roleBadge(role: string): { label: string; color: string } {
  const r = role.toLowerCase();
  if (r.includes("admin")) return { label: role, color: "#2f6fed" };
  if (r.includes("tier 1") || r.includes("operator")) return { label: role, color: "#d97706" };
  if (r.includes("job supervisor")) return { label: role, color: "#2f6fed" };
  if (r.includes("tier 2") || r.includes("maintenance supervisor") || r.includes("supervisor")) return { label: role, color: "#7c3aed" };
  if (r.includes("tier 3") || r.includes("manager") || r.includes("fsm")) return { label: role, color: "#0d9488" };
  if (r.includes("view") || r.includes("data miner")) return { label: role, color: "#4b5563" };
  return { label: role, color: "#6b7280" };
}

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function StatusPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
      <span style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-soft)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text, #1c211d)" }}>{value}</span>
    </div>
  );
}

type AuthMode = "local" | "sso";

function Microsoft365Mockup() {
  const [showComingSoon, setShowComingSoon] = useState(false);

  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
      <div
        className="menu-card"
        style={{
          width: "100%",
          maxWidth: 420,
          alignItems: "center",
          textAlign: "center",
          padding: "36px 32px",
          cursor: "default",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 21 21" style={{ marginBottom: 14 }}>
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
        <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>Sign in with Microsoft 365</h3>
        <p style={{ margin: "0 0 20px", fontSize: 12.5, color: "var(--text-soft)" }}>
          Use your work or school account to continue.
        </p>
        <input
          type="text"
          placeholder="someone@sprint-ae.com"
          disabled
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--line, #d8dcd2)",
            marginBottom: 14,
            fontSize: 13.5,
            background: "var(--bg, #f4f5f2)",
            color: "var(--text-soft)",
          }}
        />
        <button
          onClick={() => setShowComingSoon(true)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            background: "#2f6fed",
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
        {showComingSoon && (
          <p style={{ margin: "14px 0 0", fontSize: 12, color: "var(--text-soft)" }}>
            Microsoft 365 sign-in will be available in a future release. Use the local user picker for now.
          </p>
        )}
      </div>
    </div>
  );
}

function UserPickerGate({ children }: { children: ReactNode }) {
  const { user, users, isLoading, setCurrentUserId } = useCurrentUser();
  const now = useLiveClock();
  const [authMode, setAuthMode] = useState<AuthMode>("local");
  const [userIndex, setUserIndex] = useState(0);
  const [flipDir, setFlipDir] = useState<"next" | "prev">("next");

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <span style={{ color: "var(--text-soft)", fontSize: 13 }}>Loading users...</span>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  const activeUsers = users.filter((u) => u.active);
  const dateLabel = now.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const safeUserIndex = activeUsers.length === 0 ? 0 : userIndex % activeUsers.length;
  const activeUser = activeUsers[safeUserIndex];

  function nextUser() {
    if (activeUsers.length < 2) return;
    setFlipDir("next");
    setUserIndex((i) => (i + 1) % activeUsers.length);
  }

  function prevUser() {
    if (activeUsers.length < 2) return;
    setFlipDir("prev");
    setUserIndex((i) => (i - 1 + activeUsers.length) % activeUsers.length);
  }

  return (
    <>
      <style>{`
        @keyframes flip-in-next {
          from { transform: perspective(1000px) rotateY(90deg); opacity: 0; }
          to { transform: perspective(1000px) rotateY(0deg); opacity: 1; }
        }
        @keyframes flip-in-prev {
          from { transform: perspective(1000px) rotateY(-90deg); opacity: 0; }
          to { transform: perspective(1000px) rotateY(0deg); opacity: 1; }
        }
        .user-hero-card {
          animation-duration: 0.35s;
          animation-timing-function: ease;
          backface-visibility: hidden;
        }
        .flip-next { animation-name: flip-in-next; }
        .flip-prev { animation-name: flip-in-prev; }
      `}</style>
      <div style={{ position: "relative", height: "100%", overflowY: "auto", background: "var(--bg, #f4f5f2)" }}>
      {/* Full-bleed photo backdrop, top of the page only */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 560, overflow: "hidden" }}>
        <img
          src={fieldOpsImage}
          alt="Field maintenance operations"
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
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 140,
            background: "linear-gradient(to bottom, rgba(244,245,242,0) 0%, var(--bg, #f4f5f2) 100%)",
          }}
        />
      </div>

      <div style={{ position: "relative", maxWidth: 1100, margin: "0 auto", padding: "24px 24px 40px" }}>

        {/* Header: logo + status pills */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 19, fontWeight: 700, color: "var(--text, #1c211d)" }}>Sprint MMS</span>
            <span style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--text-soft)" }}>MAINTENANCE EXCELLENCE</span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 20,
              alignItems: "center",
              flexWrap: "wrap",
              background: "var(--surface, #fff)",
              border: "1px solid var(--line, #e2e2e2)",
              borderRadius: 12,
              padding: "10px 18px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
            }}
          >
            <StatusPill label="System Status" value={<span style={{ color: "#1f7a4d" }}>&#9679; Online</span>} />
            <StatusPill label="Data Sync" value="Synced" />
            <StatusPill label="Date" value={dateLabel} />
            <StatusPill label="Time" value={timeLabel} />
          </div>
        </div>

        {/* Hero text over the photo */}
        <h1 style={{ color: "var(--text, #1c211d)", margin: 0, fontSize: 34, lineHeight: 1.15, maxWidth: 560 }}>
          Maintenance Management System <span style={{ color: "#d97706" }}>2.0</span>
        </h1>
        <p style={{ color: "var(--text-soft)", fontSize: 14, margin: "10px 0 4px" }}>
          Connected Assets &middot; Smart Inspections &middot; Digital Workflows
        </p>
        <p style={{ color: "var(--text-soft)", fontSize: 13.5, margin: "0 0 20px" }}>
          Welcome! Please select your user profile to continue.
        </p>

        {/* Local Users / Microsoft 365 segmented toggle */}
        <div
          style={{
            display: "inline-flex",
            background: "var(--surface, #fff)",
            border: "1px solid var(--line, #e2e2e2)",
            borderRadius: 10,
            padding: 4,
            marginBottom: 24,
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          {(["local", "sso"] as AuthMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setAuthMode(mode)}
              style={{
                border: "none",
                borderRadius: 7,
                padding: "7px 16px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                background: authMode === mode ? "#2f6fed" : "transparent",
                color: authMode === mode ? "#fff" : "var(--text-soft)",
              }}
            >
              {mode === "local" ? "Local Users" : "Microsoft 365"}
            </button>
          ))}
        </div>

        {/* User profile picker OR Microsoft 365 mockup */}
        {authMode === "sso" ? (
          <Microsoft365Mockup />
        ) : activeUsers.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-soft)", fontSize: 13 }}>
            No active users found. Add a user under Administration first.
          </p>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginBottom: 16 }}>
            {activeUsers.length > 1 && (
              <button
                aria-label="Previous user"
                onClick={prevUser}
                style={{
                  flex: "0 0 auto", width: 34, height: 34, borderRadius: "50%",
                  border: "1px solid var(--line, #e2e2e2)", background: "var(--surface, #fff)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.12)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}
              >
                ‹
              </button>
            )}
            <div style={{ perspective: 1200, width: "100%", maxWidth: 420 }}>
              {activeUser && (
                <button
                  key={activeUser.id}
                  className={`menu-card user-hero-card ${flipDir === "next" ? "flip-next" : "flip-prev"}`}
                  style={{
                    width: "100%",
                    minHeight: 150,
                    textAlign: "left",
                    alignItems: "flex-start",
                    borderLeft: `16px solid ${tierAccent(activeUser.role)}`,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  }}
                  onClick={() => setCurrentUserId(activeUser.id)}
                >
                  <div className="menu-icon-wrap">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M4.5 20c0-3.6 3.4-6.5 7.5-6.5s7.5 2.9 7.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h3 style={{ margin: "10px 0 6px" }}>{activeUser.name}</h3>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-soft)" }}>
                    {activeUser.role}
                  </p>
                </button>
              )}
              {activeUsers.length > 1 && (
                <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--text-soft)", margin: "10px 0 0" }}>
                  {safeUserIndex + 1} of {activeUsers.length}
                </p>
              )}
            </div>
            {activeUsers.length > 1 && (
              <button
                aria-label="Next user"
                onClick={nextUser}
                style={{
                  flex: "0 0 auto", width: 34, height: 34, borderRadius: "50%",
                  border: "1px solid var(--line, #e2e2e2)", background: "var(--surface, #fff)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.12)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}
              >
                ›
              </button>
            )}
          </div>
        )}

        {/* Roles & responsibilities reference */}
        <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-soft)", margin: "0 0 12px" }}>
          User Roles &amp; Responsibilities
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 20 }}>
          {TIER_REFERENCE.map((tier) => (
            <div
              key={tier.name}
              className="menu-card"
              style={{ textAlign: "left", alignItems: "flex-start", borderLeft: `4px solid ${tier.accent}`, cursor: "default" }}
            >
              <h3 style={{ margin: "0 0 8px" }}>{tier.name}</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-soft)", lineHeight: 1.6 }}>
                {tier.responsibilities.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 11.5,
            color: "var(--text-soft)",
            padding: "10px 4px 0",
            borderTop: "1px solid var(--line, #e2e2e2)",
          }}
        >
          <span>Sprint MMS 2.0 · Offline First · Built for Reliability</span>
          <span>Powered by Sprint Digital Transformation</span>
        </div>
      </div>
    </div>
    </>
  );
}

export default UserPickerGate;