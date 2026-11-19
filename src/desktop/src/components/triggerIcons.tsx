import type { ReactElement } from "react";

// One set of MR-II / MR-III counter (trigger) icons and colours for every screen that shows
// counters: Asset MR-I History, the Asset flow, the Asset Registry and Select asset.
// OH operating hours, CA calendar days, KM distance, RIF running-in-foot, EH engine hours.

export const TRIGGER_TYPE_COLORS: Record<string, string> = {
  OH: "var(--accent-blue)",
  CA: "var(--warn)",
  KM: "var(--success)",
  RIF: "var(--trig-rif, var(--accent))",
  EH: "var(--danger)",
};

/** Soft tint behind a counter icon (stat chips, flow cards). */
export const TRIGGER_ICON_BG: Record<string, string> = {
  CA: "color-mix(in srgb, var(--warn) 14%, transparent)",
  RIF: "color-mix(in srgb, var(--trig-rif, var(--accent)) 14%, transparent)",
  KM: "var(--success-soft)",
  OH: "rgba(47, 111, 237, 0.14)",
  EH: "var(--danger-soft)",
};

export const TRIGGER_TYPE_ICONS: Record<string, ReactElement> = {
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

export const DEFAULT_TRIGGER_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </svg>
);

export const triggerIcon = (type: string) => TRIGGER_TYPE_ICONS[type] ?? DEFAULT_TRIGGER_ICON;
export const triggerColor = (type: string) => TRIGGER_TYPE_COLORS[type] ?? "var(--text-soft)";
export const triggerIconBg = (type: string) => TRIGGER_ICON_BG[type] ?? "var(--chip-bg)";
