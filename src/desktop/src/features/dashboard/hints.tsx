import { useSyncExternalStore } from "react";

// Explainer and hint texts ("Click a bar to list...", chart notes, page descriptions) are
// hidden by default so the dashboards stay clear. The lightbulb button shows them when the
// user wants them. The choice is remembered on this computer.

const KEY = "mms.dashboards.hints";
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
let on = read();
const listeners = new Set<() => void>();

export function setHints(v: boolean) {
  on = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* applies for this session */ }
  listeners.forEach((fn) => fn());
}
export const useHints = () =>
  useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => on, () => on);

const BULB = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" />
  </svg>
);

/** Round header button that shows or hides the hint texts. */
export function HintsToggle({ className = "fl-icon-btn" }: { className?: string }) {
  const v = useHints();
  return (
    <button type="button" className={`${className} hints-btn${v ? " is-on" : ""}`} aria-pressed={v}
      aria-label={v ? "Hide hints" : "Show hints"} title={v ? "Hide hints and explanations" : "Show hints and explanations"}
      onClick={() => setHints(!v)}>
      {BULB}
    </button>
  );
}

/** Hidden unless hints are on. Empty-state messages ("No faults…") use .mrid-empty and stay visible. */
export const HINTS_CSS = `
.fl-shell:not(.show-hints) .mrid-note:not(.mrid-empty),
.fl-shell:not(.show-hints) .mrid-kpi-hint,
.fl-shell:not(.show-hints) .mrid-formula,
.fl-shell:not(.show-hints) .mrid-headrow .header > .sub,
.fl-shell:not(.show-hints) .fl-titles > p,
.fl-shell:not(.show-hints) .fl-card-head p,
.fl-shell:not(.show-hints) .fl-hero p,
.fl-shell:not(.show-hints) .mrid-flow-note,
.fl-shell:not(.show-hints) .mrid-story { display: none !important; }
.fl-shell:not(.show-hints) .mrid-dash-bar { justify-content: flex-end; }
.fl-shell .hints-btn.is-on { color: #fff !important; background: var(--st-amber, #d97706) !important; box-shadow: 0 0 0 4px color-mix(in srgb, var(--st-amber, #d97706) 22%, transparent) !important; }
.fl-shell.show-hints .mrid-note:not(.mrid-empty), .fl-shell.show-hints .mrid-kpi-hint, .fl-shell.show-hints .mrid-story { animation: hint-in .25s ease-out; }
@keyframes hint-in { from { opacity: 0; transform: translateY(-2px); } }
`;
