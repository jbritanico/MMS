import { PrintSheet } from "../../components/PrintSheet";
import { useMriDashboardFaults, useMriDashboardMore } from "../dashboard/hooks/useMriDashboards";
import type { AssetFlow, AssetFlowTrigger } from "./hooks/useAssetFlow";

// Unit readiness sheet (report 1 of the MR-I reports list, Read Only tier).
// One page per unit that answers "can I use this unit today, and with what limits?":
// tag colour, open faults, operating limits set by the repair team, active exemptions (MOC)
// and how close the unit is to its next MR-II / MR-III. Read only; it prints on one A4 page.
// Uses the same country-scoped data as the dashboards, so a user only sees units they may see.

const COUNTER_NAME: Record<string, string> = { OH: "Operating hours", CA: "Calendar days", KM: "Distance", RIF: "Running-in-foot", EH: "Engine hours" };
const COUNTER_UNIT: Record<string, string> = { OH: "h", CA: "days", KM: "km", RIF: "ft", EH: "h" };
const SEV_ORDER: Record<string, number> = { Critical: 0, Major: 0, Moderate: 1, Minor: 2 };

const day = (unix: number | null | undefined) =>
  unix ? new Date(unix * 1000).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const daysSince = (unix: number | null | undefined) => (unix ? Math.max(0, Math.floor((Date.now() / 1000 - unix) / 86400)) : null);
const pct = (t: AssetFlowTrigger) => (t.interval_value > 0 ? Math.round((t.running_value / t.interval_value) * 100) : 0);
const counterState = (t: AssetFlowTrigger) =>
  t.interval_value > 0 && t.running_value >= t.interval_value ? "Due now"
    : t.warning_value > 0 && t.running_value >= t.warning_value ? "Due soon" : "On track";

function verdict(tag: string | null, activeMoc: boolean, limits: number) {
  if (tag === "Red") return activeMoc
    ? { tone: "red", head: "Not ready for service", sub: "Red tag. It may only be used within the active exemption (MOC) below." }
    : { tone: "red", head: "Not ready for service", sub: "Red tag. Do not use this unit until the repair is verified." };
  if (tag === "Yellow") return { tone: "amber", head: "Under maintenance", sub: limits ? "Yellow tag. Use only within the operating limits below." : "Yellow tag. Check with the maintenance supervisor before use." };
  if (tag === "Green") return { tone: "green", head: "Ready for service", sub: limits ? "Green tag. Follow the operating limits below." : "Green tag. No limits recorded." };
  return { tone: "grey", head: "Not tagged yet", sub: "No MR-I report has set a tag for this unit." };
}

export default function ReadinessSheet({ flow, onClose }: { flow: AssetFlow; onClose: () => void }) {
  const { data: faults = [], isLoading: fLoad } = useMriDashboardFaults();
  const { data: more, isLoading: mLoad } = useMriDashboardMore();
  const id = flow.asset_id;
  const now = Date.now() / 1000;

  const open = faults
    .filter((f) => f.asset_id === id && f.state === "Open")
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3) || (a.found_at ?? 0) - (b.found_at ?? 0));
  const limits = (more?.repairs ?? []).filter((r) => r.asset_id === id && !r.verified_at && (r.limitations_note ?? "").trim());
  const mocs = (more?.exemptions ?? []).filter((e) => e.asset_id === id && e.status === "Active" && !e.revoked_at && (e.valid_until == null || e.valid_until >= now));
  const counters = flow.triggers.filter((t) => t.enabled && t.interval_value > 0).sort((a, b) => pct(b) - pct(a));
  const v = verdict(flow.tag_status, mocs.length > 0, limits.length);
  const loading = fLoad || mLoad;

  return (
    <PrintSheet
      eyebrow="Unit readiness sheet · MR-I"
      title={`${flow.asset_code ?? "Unit"}${flow.asset_description ? ` · ${flow.asset_description}` : ""}`}
      sub={[flow.asset_type, flow.country, flow.service_line].filter(Boolean).join(" · ") || "—"}
      note={`Taken from MMS on ${day(now)}. Tags, faults and limits can change after this sheet is printed: check MMS before use.`}
      onClose={onClose}
      ready={!loading}
    >
      <style>{RS_CSS}</style>
          <section className={`rs-verdict is-${v.tone}`}>
            <span className="rs-lamp" aria-hidden="true" />
            <div>
              <h2>{v.head}</h2>
              <p>{v.sub}</p>
              {flow.tag_reason && <p className="rs-reason">Tag reason: {flow.tag_reason}</p>}
            </div>
          </section>

          {loading ? <p className="ps-empty">Loading…</p> : (
            <>
              <section>
                <h3>Open faults ({open.length})</h3>
                {open.length === 0 ? <p className="ps-empty">No open faults.</p> : (
                  <table className="ps-table">
                    <thead><tr><th>Severity</th><th>Item</th><th>What's wrong</th><th>Report</th><th>Open for</th><th>Where it stands</th></tr></thead>
                    <tbody>{open.map((f) => (
                      <tr key={f.result_id}>
                        <td><span className={`rs-sev is-${(f.severity || "").toLowerCase()}`}>{f.severity}</span></td>
                        <td>{f.item ?? "—"}{f.component ? <small> · {f.component}</small> : null}</td>
                        <td>{f.issue_details ?? "—"}</td>
                        <td>#{f.report_id}</td>
                        <td>{daysSince(f.found_at) != null ? `${daysSince(f.found_at)} d` : "—"}</td>
                        <td>{f.stage}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </section>

              <section>
                <h3>Operating limits ({limits.length})</h3>
                {limits.length === 0 ? <p className="ps-empty">No operating limits recorded.</p> : (
                  <ul className="ps-list">{limits.map((r) => (
                    <li key={r.rectification_id}><strong>{r.limitations_note}</strong><small>For {r.item ?? "a repair"} · report #{r.report_id}{r.parts_status ? ` · parts: ${r.parts_status}` : ""}</small></li>
                  ))}</ul>
                )}
              </section>

              <section>
                <h3>Active exemptions (MOC) ({mocs.length})</h3>
                {mocs.length === 0 ? <p className="ps-empty">No active exemption.</p> : (
                  <ul className="ps-list">{mocs.map((m) => (
                    <li key={m.id}><strong>{m.moc_reference} · valid until {day(m.valid_until)}</strong>
                      <small>Limits: {m.limitations || "—"}</small>
                      <small>Controls: {m.required_controls || "—"}</small>
                      <small>Approved by {m.approved_by || "—"}</small></li>
                  ))}</ul>
                )}
              </section>

              <section>
                <h3>Next MR-II / MR-III</h3>
                {counters.length === 0 ? <p className="ps-empty">No counters set for this unit.</p> : (
                  <table className="ps-table">
                    <thead><tr><th>Level</th><th>Counter</th><th>Used</th><th>Limit</th><th>%</th><th>Status</th></tr></thead>
                    <tbody>{counters.map((t, i) => (
                      <tr key={i}>
                        <td>{t.mr_level}</td>
                        <td>{COUNTER_NAME[t.trigger_type] ?? t.trigger_type}</td>
                        <td>{t.running_value.toLocaleString()} {COUNTER_UNIT[t.trigger_type] ?? ""}</td>
                        <td>{t.interval_value.toLocaleString()} {COUNTER_UNIT[t.trigger_type] ?? ""}</td>
                        <td>{pct(t)}%</td>
                        <td><span className={`rs-due is-${counterState(t).replace(/\s/g, "").toLowerCase()}`}>{counterState(t)}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </section>
            </>
          )}
    </PrintSheet>
  );
}

// The sheet is paper: always white with dark text, in every theme, so it prints the same way.
const RS_CSS = `
.rs-verdict { display: flex; gap: 14px; align-items: flex-start; padding: 12px 14px; border-radius: 8px; border: 2px solid; }
.rs-verdict p { margin: 2px 0 0; color: inherit; }
.rs-verdict .rs-reason { color: #4a5568; font-size: 12px; }
.rs-lamp { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; background: currentColor; }
.rs-verdict.is-red { border-color: #c62828; background: #fdecec; color: #8e1b1b; }
.rs-verdict.is-amber { border-color: #c77700; background: #fff4e0; color: #7a4a00; }
.rs-verdict.is-green { border-color: #1f8a4c; background: #e7f6ee; color: #145c33; }
.rs-verdict.is-grey { border-color: #8a94a6; background: #f1f3f6; color: #3b4454; }
.rs-sev, .rs-due { display: inline-block; font-weight: 700; font-size: 11px; padding: 1px 7px; border-radius: 99px; border: 1px solid; }
.rs-sev.is-critical, .rs-sev.is-major, .rs-due.is-duenow { color: #8e1b1b; border-color: #c62828; background: #fdecec; }
.rs-sev.is-moderate, .rs-due.is-duesoon { color: #7a4a00; border-color: #c77700; background: #fff4e0; }
.rs-sev.is-minor { color: #5c4a00; border-color: #b59b00; background: #fffbe0; }
.rs-due.is-ontrack { color: #145c33; border-color: #1f8a4c; background: #e7f6ee; }
`;
