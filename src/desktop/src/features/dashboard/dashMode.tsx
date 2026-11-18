import { useSyncExternalStore } from "react";
import { RangeTabs } from "./fluent/FluentShell";

// Simple / Advanced view for the dashboards. Simple shows only what is needed to decide
// (the summary, the KPI cards and the list to act on); Advanced adds every chart, trend and
// breakdown. The choice is remembered on this computer and applies to every dashboard.

export type DashMode = "simple" | "advanced";
const KEY = "mms.dashboards.mode";
/** Dashboards that have a Simple view so far (Faults and defects: 2, 3, 4). */
export const MODE_READY = new Set([2, 3, 4]);

const read = (): DashMode => {
  try { return localStorage.getItem(KEY) === "advanced" ? "advanced" : "simple"; } catch { return "simple"; }
};
let mode: DashMode = read();
const listeners = new Set<() => void>();

export function setDashMode(m: DashMode) {
  mode = m;
  try { localStorage.setItem(KEY, m); } catch { /* not saved: still applies for this session */ }
  listeners.forEach((fn) => fn());
}
export const useDashMode = (): DashMode =>
  useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => mode, () => mode);
/** True when the dashboard should show everything. */
export const useAdvanced = () => useDashMode() === "advanced";

export function ModeToggle() {
  const m = useDashMode();
  return (
    <div className="mrid-mode" title="Simple: only what you need to decide. Advanced: every chart, trend and breakdown.">
      <span className="mrid-mode-label">View</span>
      <RangeTabs<DashMode> label="Dashboard view" value={m} onChange={setDashMode}
        options={[{ v: "simple", label: "Simple" }, { v: "advanced", label: "Advanced" }]} />
    </div>
  );
}
