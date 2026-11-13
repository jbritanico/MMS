import { Fragment, useState } from "react";
import { TagLamp } from "../../../components/Instruments";
import { fmtDate, type DashboardFilters, type MriDashboardAsset, type MriDashExemption } from "../hooks/useMriDashboards";
import ExportMenu from "./ExportMenu";
import { UnitReports } from "./ReportPreview";
import { StoryStrip, type StoryLine } from "./fluid";
import { DAY, DrillChips, Loading, nowSecs, Tile, useMore } from "./kit";

// Dashboard 12: Red units under exemption (MOC).
// A Red-Tagged unit must not be deployed without an approved exemption (Management of Change).
// Shows the exemptions in force now, their limits and expiry, and Red units without one.
// "Valid until" counts the whole of that day.

const SOON_DAYS = 7;
type State = "In force" | "Expiring soon" | "Expired" | "Not started" | "Revoked" | "Closed";
function stateOf(x: MriDashExemption, now: number): State {
  const st = x.status.trim().toLowerCase();
  if (st === "revoked") return "Revoked";
  if (st && st !== "active") return "Closed";
  if (x.valid_from != null && now < x.valid_from) return "Not started";
  const end = x.valid_until != null ? x.valid_until + DAY : null;
  if (end != null && now >= end) return "Expired";
  if (end != null && end - now <= SOON_DAYS * DAY) return "Expiring soon";
  return "In force";
}
const STATE_COLOR: Record<State, string> = {
  "In force": "var(--success)", "Expiring soon": "var(--warn)", Expired: "var(--danger)", "Not started": "var(--accent-blue, #2f6fed)", Revoked: "var(--text-soft)", Closed: "var(--text-soft)",
};
const daysLeft = (x: MriDashExemption, now: number) => (x.valid_until == null ? null : Math.ceil((x.valid_until + DAY - now) / DAY));
const isRed = (a: MriDashboardAsset) => a.active && (a.tag_status ?? "").trim() === "Red";

export function ExemptionsMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { exemptions } = useMore(assets);
  const now = nowSecs();
  const live = (x: MriDashExemption) => ["In force", "Expiring soon"].includes(stateOf(x, now));
  const red = assets.filter(isRed);
  const covered = red.filter((a) => exemptions.some((x) => x.asset_id === a.id && live(x))).length;
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item"><TagLamp status="Red" size={12} /> Red <b>{red.length}</b></span>
      <span className="mrid-mini-item">With exemption <b>{covered}</b></span>
      <span className="mrid-mini-item">Expiring ≤{SOON_DAYS} d <b>{exemptions.filter((x) => stateOf(x, now) === "Expiring soon").length}</b></span>
    </div>
  );
}

type Pick = "red" | "covered" | "soon" | "none" | "expired" | null;

export default function Exemptions({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const { exemptions, unitOf, isLoading, error } = useMore(assets);
  const now = nowSecs();
  const [pick, setPick] = useState<Pick>(null);
  const [showAll, setShowAll] = useState(false);
  const [openUnit, setOpenUnit] = useState<number | null>(null);

  const live = (x: MriDashExemption) => ["In force", "Expiring soon"].includes(stateOf(x, now));
  const red = assets.filter(isRed);
  const liveFor = (id: number) => exemptions.filter((x) => x.asset_id === id && live(x));
  const covered = red.filter((a) => liveFor(a.id).length > 0);
  const uncovered = red.filter((a) => liveFor(a.id).length === 0);
  const soon = exemptions.filter((x) => stateOf(x, now) === "Expiring soon");
  const expired = exemptions.filter((x) => stateOf(x, now) === "Expired");

  const exList = exemptions
    .filter((x) => {
      const s = stateOf(x, now);
      if (pick === "soon") return s === "Expiring soon";
      if (pick === "expired") return s === "Expired";
      if (pick === "covered") return live(x) && red.some((a) => a.id === x.asset_id);
      return showAll || (s !== "Revoked" && s !== "Closed");
    })
    .sort((a, b) => (a.valid_until ?? Infinity) - (b.valid_until ?? Infinity));
  const unitList = pick === "none" ? uncovered : pick === "red" ? red : uncovered;
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);

  const exRow = (x: MriDashExemption) => ({
    Unit: code(x.asset_id), "Tag now": unitOf.get(x.asset_id)?.tag_status ?? null, "MOC reference": x.moc_reference, "Approved by": x.approved_by,
    "Valid from": fmtDate(x.valid_from), "Valid until": fmtDate(x.valid_until), "Days left": stateOf(x, now) === "Expired" ? 0 : daysLeft(x, now), State: stateOf(x, now),
    Limitations: x.limitations, "Required controls": x.required_controls, "Return conditions": x.return_conditions,
    Revoked: x.revoked_at ? `${fmtDate(x.revoked_at)}${x.revoke_reason ? `: ${x.revoke_reason}` : ""}` : null,
  });
  // ---- fluid layer ----
  const story: StoryLine[] = [];
  {
    if (uncovered.length) story.push({ tone: "attention", text: <><b>{uncovered.length}</b> Red unit{uncovered.length === 1 ? " has" : "s have"} no exemption and must not be deployed: <b>{uncovered.slice(0, 3).map((a) => a.asset_code).join(", ")}</b>{uncovered.length > 3 ? ` and ${uncovered.length - 3} more` : ""}.</> });
    const first = [...soon].sort((a, b) => (a.valid_until ?? Infinity) - (b.valid_until ?? Infinity))[0];
    if (first) story.push({ tone: "worse", text: <>Exemption <b>{first.moc_reference}</b> on {code(first.asset_id)} ends {fmtDate(first.valid_until)} ({daysLeft(first, now)} day{daysLeft(first, now) === 1 ? "" : "s"} left).</> });
    if (expired.length) story.push({ tone: "worse", text: <>{expired.length} exemption{expired.length === 1 ? " is" : "s are"} past the end date but still marked Active; close or renew {expired.length === 1 ? "it" : "them"}.</> });
    if (red.length && !uncovered.length) story.push({ tone: "better", text: <>Every Red unit has an exemption in force.</> });
    if (!red.length) story.push({ tone: "better", text: <>No unit is Red.</> });
  }

  const exportTables = () => [
    { name: "Summary", rows: [
      { Measure: "Red units", Value: red.length }, { Measure: "Red units with an exemption in force", Value: covered.length },
      { Measure: "Red units without an exemption", Value: uncovered.length }, { Measure: `Exemptions expiring within ${SOON_DAYS} days`, Value: soon.length },
      { Measure: "Exemptions past their end date but not closed", Value: expired.length },
    ] },
    { name: "Exemptions", rows: exemptions.map(exRow) },
    { name: "Red units without exemption", rows: uncovered.map((a) => ({ Unit: a.asset_code, Country: a.country, "Equipment type": a.asset_type, Reason: a.tag_reason })) },
  ];

  const loading = Loading({ isLoading, error });
  if (loading) return loading;
  const listUnits = pick === "none" || pick === "red";

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">A Red-Tagged unit must not be deployed without an approved exemption (MOC). Shown as it is <b>now</b>; the period filter does not change this dashboard.</p>
        <ExportMenu dashboardNo={12} title="Red units under exemption (MOC)" filters={filters} tables={exportTables} periodApplies={false} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        <Tile k="red" pick={pick} setPick={setPick} color="var(--danger)" label={<><TagLamp status="Red" size={14} /> Red units</>} value={red.length} sub={`${covered.length} with an exemption in force`} />
        <Tile k="none" pick={pick} setPick={setPick} color="var(--danger)" label="Red, no exemption" value={uncovered.length} sub="Must not be deployed" />
        <Tile k="soon" pick={pick} setPick={setPick} color="var(--warn)" label={`Expiring within ${SOON_DAYS} days`} value={soon.length} sub={soon.length ? `First ends ${fmtDate(Math.min(...soon.map((x) => x.valid_until ?? Infinity)))}` : "None"} />
        <Tile k="expired" pick={pick} setPick={setPick} color="var(--text-soft)" label="Past end date, not closed" value={expired.length} sub="Still marked Active after the end date" />
      </div>

      {listUnits ? (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>{pick === "red" ? "Red units" : "Red units without an exemption"} ({unitList.length})</h3></div>
          <DrillChips onClear={() => setPick(null)} chips={[<b>{pick === "red" ? "All Red units" : "No exemption"}</b>]} />
          {unitList.length === 0 ? <p className="mrid-note">None.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Unit</th><th>Country</th><th>Equipment type</th><th>Why Red</th><th>Exemption</th><th>MR-I reports</th></tr></thead>
              <tbody>{unitList.map((a) => { const l = liveFor(a.id); return (
                <Fragment key={a.id}>
                  <tr className="mrid-click" onClick={() => setOpenUnit((v) => (v === a.id ? null : a.id))}>
                    <td><b>{a.asset_code}</b>{a.asset_description ? <span className="mrid-soft"> · {a.asset_description}</span> : null}</td>
                    <td>{a.country ?? "—"}</td><td>{a.asset_type ?? "—"}</td><td className="mrid-soft">{a.tag_reason ?? "—"}</td>
                    <td>{l.length ? <span className="mrid-ok">{l[0].moc_reference} until {fmtDate(l[0].valid_until)}</span> : <span className="mrid-over">None</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}><span className="mrid-caret">{openUnit === a.id ? "▾" : "▸"}</span> {openUnit === a.id ? "Hide" : "Show"}</td>
                  </tr>
                  {openUnit === a.id && <tr className="mrid-expand"><td colSpan={6}><UnitReports assetId={a.id} /></td></tr>}
                </Fragment>); })}</tbody>
            </table></div>
          )}
        </div>
      ) : (
        <div className="mrid-panel">
          <div className="mrid-panel-head">
            <h3>Exemptions ({exList.length})</h3>
            {pick == null && <label className="mrid-toggle"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Include revoked and closed</label>}
          </div>
          <DrillChips onClear={() => setPick(null)} chips={[pick === "soon" && <b>Expiring within {SOON_DAYS} days</b>, pick === "expired" && <b>Past end date</b>, pick === "covered" && <b>In force on Red units</b>]} />
          {exList.length === 0 ? <p className="mrid-note">No exemptions match.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Unit</th><th>MOC</th><th>Valid</th><th>State</th><th>Limitations</th><th>Required controls</th><th>Return to service when</th></tr></thead>
              <tbody>{exList.map((x) => { const st = stateOf(x, now); const dl = daysLeft(x, now); const a = unitOf.get(x.asset_id); return (
                <tr key={x.id}>
                  <td><b>{code(x.asset_id)}</b><div><TagLamp status={a?.tag_status === "Red" || a?.tag_status === "Yellow" || a?.tag_status === "Green" ? a.tag_status : null} size={11} showText /></div></td>
                  <td><b>{x.moc_reference}</b><div className="mrid-soft">Approved by {x.approved_by}</div></td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(x.valid_from)}<div className="mrid-soft">to {fmtDate(x.valid_until)}</div></td>
                  <td><span className="mrid-sev" style={{ color: STATE_COLOR[st], fontWeight: 600 }}><i className="mrid-dot" style={{ background: STATE_COLOR[st] }} />{st}</span>
                    {(st === "In force" || st === "Expiring soon") && dl != null ? <div className="mrid-soft">{dl} day{dl === 1 ? "" : "s"} left</div> : null}
                    {st === "Revoked" && x.revoke_reason ? <div className="mrid-soft">{x.revoke_reason}</div> : null}</td>
                  <td className="mrid-soft">{x.limitations || "—"}</td><td className="mrid-soft">{x.required_controls || "—"}</td><td className="mrid-soft">{x.return_conditions || "—"}</td>
                </tr>); })}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
