import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { invoke } from "./ipc";

// Beta trial gate: a beta build works for 25 days from the first time it is opened on a computer
// (see get_trial_status in lib.rs). When the period is over, MMS shows this screen instead of the
// app. Nothing is deleted; installing the latest beta starts a new period with all data kept.

export interface TrialStatus {
  enabled: boolean;
  days: number;
  first_use: number | null;
  expires_at: number | null;
  days_left: number | null;
  expired: boolean;
  clock_back: boolean;
  build: string;
}

const TrialContext = createContext<TrialStatus | null>(null);
/** The beta trial status (null when the check has not run or failed). */
export const useTrial = () => useContext(TrialContext);

export const fmtTrialDate = (secs: number | null) => {
  if (secs == null) return "—";
  const d = new Date(secs * 1000);
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
};

export default function TrialGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TrialStatus | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () =>
      invoke<TrialStatus>("get_trial_status")
        .then((s) => alive && setStatus(s))
        .catch(() => alive && setStatus(null)) // if the check itself fails, do not lock testers out
        .finally(() => alive && setChecked(true));
    check();
    const timer = window.setInterval(check, 30 * 60 * 1000); // re-check every 30 minutes while open
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  if (!checked) return null;
  if (status?.enabled && status.expired) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.icon} aria-hidden="true">⏳</div>
          <h1 style={S.h1}>This MMS beta has ended on this computer</h1>
          {status.clock_back ? (
            <p style={S.p}>The computer's date appears to have been set back. Please correct the Windows date and time, then open MMS again.</p>
          ) : (
            <p style={S.p}>The {status.days}-day test period started on <b>{fmtTrialDate(status.first_use)}</b> and ended on <b>{fmtTrialDate(status.expires_at)}</b>.</p>
          )}
          <p style={S.p}><b>Your data is safe.</b> Install the latest MMS beta to continue; everything you entered will still be there.</p>
          <p style={S.small}>Need the latest version? Contact the MMS team (Sprint IT).</p>
        </div>
      </div>
    );
  }
  const left = status?.enabled ? status.days_left : null;
  return (
    <TrialContext.Provider value={status}>
      {children}
      {left != null && left <= 5 && (
        <div style={S.banner} role="status" title={`Beta test period ends ${fmtTrialDate(status!.expires_at)}`}>
          Beta: {left} day{left === 1 ? "" : "s"} left on this computer
        </div>
      )}
    </TrialContext.Provider>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#eef0f3", fontFamily: "system-ui, 'Segoe UI', sans-serif", color: "#1f2328", padding: 24 },
  card: { maxWidth: 520, padding: "32px 36px", borderRadius: 20, background: "#eef0f3", boxShadow: "10px 10px 24px #c9ced6, -10px -10px 24px #ffffff", textAlign: "center" },
  icon: { fontSize: 40, marginBottom: 8 },
  h1: { fontSize: 22, margin: "0 0 12px" },
  p: { fontSize: 14.5, lineHeight: 1.5, margin: "0 0 10px" },
  small: { fontSize: 12.5, color: "#6b7280", margin: "14px 0 0" },
  banner: { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 12, zIndex: 3000, padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: "#7a4a00", background: "#fff4dc", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", fontFamily: "system-ui, 'Segoe UI', sans-serif" },
};
