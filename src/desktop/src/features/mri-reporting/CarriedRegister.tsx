import { useMemo } from "react";
import { useMriDashboardFaults, type MriDashboardFault } from "../dashboard/hooks/useMriDashboards";
import { useAssets } from "../asset-registry/hooks/useAssets";

// Carried-forward faults register (report 13 of the MR-I reports list, Tier 2), shown on Fault
// decisions. A fault left open is carried to the unit's next MR-I report; this lists the faults
// still open that have been carried at least once, and how many reports they have passed through.
// Read only, from the same country-scoped fault list as the dashboards.

const keyOf = (f: MriDashboardFault) => `${f.asset_id}|${(f.component ?? "").trim().toLowerCase()}|${(f.item ?? "").trim().toLowerCase()}`;
const day = (unix: number | null | undefined) =>
  unix ? new Date(unix * 1000).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export interface CarriedRow { now: MriDashboardFault; first: MriDashboardFault; cycles: number; openDays: number | null }

export function useCarriedFaults() {
  const { data: faults = [], isLoading } = useMriDashboardFaults();
  const rows = useMemo<CarriedRow[]>(() => {
    const carried = faults.filter((f) => f.state === "Carried forward");
    const now = Date.now() / 1000;
    return faults
      .filter((f) => f.state === "Open")
      .map((f) => {
        const before = carried.filter((c) => keyOf(c) === keyOf(f) && (c.found_at ?? 0) <= (f.found_at ?? 0));
        if (before.length === 0) return null;
        const first = [...before].sort((a, b) => (a.found_at ?? 0) - (b.found_at ?? 0))[0];
        return { now: f, first, cycles: before.length, openDays: first.found_at ? Math.floor((now - first.found_at) / 86400) : null };
      })
      .filter((x): x is CarriedRow => !!x)
      .sort((a, b) => b.cycles - a.cycles || (b.openDays ?? 0) - (a.openDays ?? 0));
  }, [faults]);
  return { rows, isLoading };
}

export default function CarriedRegister({ onOpenFlow }: { onOpenFlow?: (reportId: number) => void }) {
  const { rows, isLoading } = useCarriedFaults();
  const { data: assets = [] } = useAssets();
  const code = (id: number) => assets.find((a) => a.id === id)?.asset_code ?? `Unit ${id}`;
  return (
    <div id="pa-carried" style={{ marginTop: 32 }}>
      <h2 className="rk-group-h">Carried-forward faults<small>Faults still open that were carried from one MR-I report to the next</small></h2>
      {isLoading ? <p style={{ color: "var(--text-soft)", fontSize: 13 }}>Loading...</p> : rows.length === 0 ? (
        <p style={{ color: "var(--text-soft)", fontSize: 13 }}>No open fault has been carried forward.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="cf-table">
            <thead><tr><th>Unit</th><th>Item</th><th>Severity</th><th>First found</th><th>Now on</th><th>Carried</th><th>Open for</th><th aria-label="Flow" /></tr></thead>
            <tbody>{rows.map((x) => (
              <tr key={x.now.result_id}>
                <td><b>{code(x.now.asset_id)}</b>{x.now.component ? <span style={{ color: "var(--text-soft)" }}> · {x.now.component}</span> : null}</td>
                <td>{x.now.item ?? "—"}<div style={{ fontSize: 12, color: "var(--text-soft)" }}>{x.now.issue_details ?? ""}</div></td>
                <td>{x.now.severity}</td>
                <td>Report #{x.first.report_id}<div style={{ fontSize: 12, color: "var(--text-soft)" }}>{day(x.first.found_at)}</div></td>
                <td>Report #{x.now.report_id}<div style={{ fontSize: 12, color: "var(--text-soft)" }}>{x.now.stage}</div></td>
                <td className={x.cycles >= 2 ? "cf-warn" : undefined}>{x.cycles} time{x.cycles === 1 ? "" : "s"}</td>
                <td>{x.openDays != null ? `${x.openDays} d` : "—"}</td>
                <td>{onOpenFlow && <button className="ghost pa-sm" onClick={() => onOpenFlow(x.now.report_id)}>Show flow</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <style>{`
        .cf-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .cf-table th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-soft); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .cf-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
        .cf-warn { color: var(--warn); font-weight: 700; }
      `}</style>
    </div>
  );
}
