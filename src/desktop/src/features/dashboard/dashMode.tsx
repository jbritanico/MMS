import { useSyncExternalStore } from "react";
import { RangeTabs } from "./fluent/FluentShell";

// Simple / Advanced view for the dashboards. Simple shows only what is needed to decide
// (the summary, the KPI cards and the list to act on); Advanced adds every chart, trend and
// breakdown. Every visit to the Dashboard area opens in Simple; a switch to Advanced lasts
// until the user leaves the Dashboard area, and applies to every dashboard.

export type DashMode = "simple" | "advanced";
/** Dashboards with a Simple view: all except 12 (Red units under exemption), which has no charts to hide. */
export const MODE_READY = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18]);

let mode: DashMode = "simple";
const listeners = new Set<() => void>();

export function setDashMode(m: DashMode) {
  if (mode === m) return;
  mode = m;
  listeners.forEach((fn) => fn());
}
/** Back to the default (Simple). Called when the user leaves the Dashboard area. */
export const resetDashMode = () => setDashMode("simple");
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
