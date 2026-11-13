import { useMemo, useState } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { fmtDate, sevKey, type DashboardFilters, type MriDashboardAsset, type MriDashDecision } from "../hooks/useMriDashboards";
import ExportMenu from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { FlowSteps, StoryStrip, type StoryLine } from "./fluid";
import { AX, avg, DAY, DrillChips, fmtDur, inRange, Loading, monthsFor, nowSecs, period, Tile, toDays, trimLeading, TT, useMore } from "./kit";

// Dashboard 10: Phone decisions and acknowledgements.
// Phone decision = a decision phoned in and recorded on the authority's behalf ("Provisional").
// It takes effect at once; the real authority must then confirm it.
// Acknowledgement = a Moderate fault decision the Maintenance Manager / FSM must be told about.

const isPhone = (d: MriDashDecision) => d.provisional_status != null;
const toConfirm = (d: MriDashDecision) => d.provisional_status === "Provisional";
const toAck = (d: MriDashDecision) => d.ack_needed && !d.acknowledged_by && d.decision !== "Pending";
type Pick = "confirm" | "ack" | "phone" | "done" | null;

export function PhoneDecisionsMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { decisions } = useMore(assets);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">To confirm <b>{decisions.filter(toConfirm).length}</b></span>
      <span className="mrid-mini-item">To acknowledge <b>{decisions.filter(toAck).length}</b></span>
    </div>
  );
}

export default function PhoneDecisions({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const { decisions, unitOf, isLoading, error } = useMore(assets);
  const p = period(filters);
  const [pick, setPick] = useState<Pick>(null);
  const [monthPick, setMonthPick] = useState<{ name: string; s: number; e: number } | null>(null);
  const s = monthPick?.s ?? p.s, e = monthPick?.e ?? p.e;
  const now = nowSecs();
  const clearAll = () => { setPick(null); setMonthPick(null); };

  const confirm = decisions.filter(toConfirm);
  const ack = decisions.filter(toAck);
  const decidedIn = decisions.filter((d) => inRange(d.decided_at, s, e));
  const phoneIn = decidedIn.filter(isPhone);
  const confirmedIn = decisions.filter((d) => inRange(d.confirmed_at, s, e) && d.decided_at != null);
  const ackedIn = decisions.filter((d) => inRange(d.acknowledged_at, s, e) && d.decided_at != null);
  const confSecs = confirmedIn.map((d) => d.confirmed_at! - d.decided_at!);
  const ackSecs = ackedIn.map((d) => d.acknowledged_at! - d.decided_at!);
  const waited = (d: MriDashDecision) => (d.decided_at == null ? null : now - d.decided_at);
  const oldest = (l: MriDashDecision[]) => (l.length ? Math.max(...l.map((d) => waited(d) ?? 0)) : null);

  const months = useMemo(() => monthsFor(p.from, p.to), [p.from.getTime(), p.to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const trend = trimLeading(
    months.map((m) => {
      const l = decisions.filter((d) => inRange(d.decided_at, m.s, m.e));
      return { ...m, "By phone": l.filter(isPhone).length, Direct: l.filter((d) => !isPhone(d)).length };
    }),
    (r) => r["By phone"] + r.Direct > 0,
  );

  const tab: "confirm" | "ack" | "done" = pick === "ack" ? "ack" : pick === "done" || pick === "phone" ? "done" : pick === "confirm" ? "confirm" : confirm.length ? "confirm" : ack.length ? "ack" : "done";
  const done = [...new Map([...confirmedIn, ...ackedIn, ...(pick === "phone" ? phoneIn : [])].map((d) => [d.approval_id, d])).values()].sort((a, b) => (b.decided_at ?? 0) - (a.decided_at ?? 0));
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);
  const periodName = monthPick?.name ?? p.label;
  const row = (d: MriDashDecision) => ({
    Unit: code(d.asset_id), Item: d.item, Severity: sevKey(d.original_severity ?? ""), Decision: d.decision, "New severity": d.new_severity,
    Authority: d.reviewer, "Recorded by": d.recorded_by, Method: d.review_method, Decided: fmtDate(d.decided_at),
    Confirmed: d.confirmed_at ? `${fmtDate(d.confirmed_at)} by ${d.confirmed_by ?? "—"}` : d.provisional_status === "Provisional" ? "Waiting" : null,
    "To acknowledge": d.ack_needed ? (d.acknowledged_by ? `${fmtDate(d.acknowledged_at)} by ${d.acknowledged_by}` : `Waiting${d.ack_assigned_to ? ` (${d.ack_assigned_to})` : ""}`) : null,
    "Days waiting": toAck(d) || toConfirm(d) ? toDays(waited(d)) : null, Report: `#${d.report_id}`,
  });
  // ---- fluid layer ----
  const story: StoryLine[] = [];
  {
    const oc = [...confirm].sort((a, b) => (a.decided_at ?? 0) - (b.decided_at ?? 0))[0];
    if (oc) story.push({ tone: (waited(oc) ?? 0) > 7 * DAY ? "attention" : "info", text: <><b>{confirm.length}</b> phone decision{confirm.length === 1 ? " is" : "s are"} still to be confirmed; the oldest (<b>{oc.item ?? "a fault"}</b> on {code(oc.asset_id)}) has waited {fmtDur(waited(oc))}.</> });
    const oa = [...ack].sort((a, b) => (a.decided_at ?? 0) - (b.decided_at ?? 0))[0];
    if (oa) story.push({ tone: (waited(oa) ?? 0) > 7 * DAY ? "worse" : "info", text: <><b>{ack.length}</b> Moderate decision{ack.length === 1 ? " is" : "s are"} waiting for the Maintenance Manager / FSM to acknowledge; the oldest has waited {fmtDur(waited(oa))}.</> });
    if (decidedIn.length) story.push({ tone: "info", text: <>{Math.round((phoneIn.length / decidedIn.length) * 100)}% of the {decidedIn.length} decision{decidedIn.length === 1 ? "" : "s"} in {periodName} were made by phone.</> });
    if (!confirm.length && !ack.length) story.push({ tone: "better", text: <>Nothing is waiting to be confirmed or acknowledged.</> });
  }

  const exportTables = () => [
    { name: "Summary", rows: [
      { Measure: "Phone decisions waiting for confirmation (now)", Value: confirm.length },
      { Measure: "Decisions waiting for acknowledgement (now)", Value: ack.length },
      { Measure: `Decisions in ${periodName}`, Value: decidedIn.length }, { Measure: `By phone in ${periodName}`, Value: phoneIn.length },
      { Measure: "Average days to confirm", Value: toDays(avg(confSecs)) }, { Measure: "Average days to acknowledge", Value: toDays(avg(ackSecs)) },
    ] },
    { name: "By month", rows: trend.map((t) => ({ Month: t.name, "By phone": t["By phone"], Direct: t.Direct })) },
    { name: "To confirm", rows: confirm.map(row) },
    { name: "To acknowledge", rows: ack.map(row) },
    { name: "Done in period", rows: done.map(row) },
  ];

  const loading = Loading({ isLoading, error });
  if (loading) return loading;

  const table = (l: MriDashDecision[], kind: "confirm" | "ack" | "done") => l.length === 0 ? (
    <p className="mrid-note">{kind === "done" ? "Nothing confirmed or acknowledged in this time." : "Nothing waiting."}</p>
  ) : (
    <div className="mrid-table-wrap"><table className="mrid-table">
      <thead><tr><th>Unit</th><th>Item</th><th>Decision</th><th>{kind === "ack" ? "Who must be told" : "Authority / recorded by"}</th><th>Decided</th><th>{kind === "done" ? "Confirmed / acknowledged" : "Waiting"}</th><th>MR-I report</th></tr></thead>
      <tbody>{l.map((d) => { const w = waited(d); return (
        <tr key={d.approval_id}>
          <td><b>{code(d.asset_id)}</b></td>
          <td>{d.item ?? "—"}<div className="mrid-soft">{sevKey(d.original_severity ?? "")}</div></td>
          <td>{d.decision}{d.new_severity ? <span className="mrid-soft"> → {d.new_severity}</span> : null}{isPhone(d) ? <div className="mrid-soft">By phone</div> : null}</td>
          <td>{kind === "ack" ? (d.ack_assigned_to ?? "Any Maintenance Manager / FSM") : <>{d.reviewer ?? "—"}{d.recorded_by && d.recorded_by !== d.reviewer ? <div className="mrid-soft">recorded by {d.recorded_by}</div> : null}</>}</td>
          <td>{fmtDate(d.decided_at)}</td>
          <td>{kind === "done" ? (
            <>{d.confirmed_at ? <div>Confirmed {fmtDate(d.confirmed_at)} by {d.confirmed_by ?? "—"}</div> : null}{d.acknowledged_at ? <div>Acknowledged {fmtDate(d.acknowledged_at)} by {d.acknowledged_by ?? "—"}</div> : null}{!d.confirmed_at && !d.acknowledged_at ? "—" : null}</>
          ) : <span className={w != null && w > 7 * DAY ? "mrid-over" : undefined}>{fmtDur(w)}</span>}</td>
          <td><PreviewButton reportId={d.report_id} /></td>
        </tr>); })}</tbody>
    </table></div>
  );

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Phone decisions take effect at once but must be <b>confirmed</b> by the real authority. Moderate fault decisions must be <b>acknowledged</b> by the Maintenance Manager / FSM. Waiting items are shown as they are now; the rest is for <b>{periodName}</b>.</p>
        <ExportMenu dashboardNo={10} title="Phone decisions and acknowledgements" filters={filters} tables={exportTables} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        <Tile k="confirm" pick={pick} setPick={setPick} color="var(--danger)" label="Waiting for confirmation" value={confirm.length} sub={confirm.length ? `Oldest ${fmtDur(oldest(confirm))}` : "Every phone decision is confirmed"} />
        <Tile k="ack" pick={pick} setPick={setPick} color="var(--warn)" label="Waiting for acknowledgement" value={ack.length} sub={ack.length ? `Oldest ${fmtDur(oldest(ack))}` : "Nothing to acknowledge"} />
        <Tile k="phone" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="Decisions made by phone" value={phoneIn.length}
          sub={`of ${decidedIn.length} decision${decidedIn.length === 1 ? "" : "s"} in the period${decidedIn.length ? ` (${Math.round((phoneIn.length / decidedIn.length) * 100)}%)` : ""}`} />
        <Tile k="done" pick={pick} setPick={setPick} color="var(--success)" label="Time to confirm" value={fmtDur(avg(confSecs))} sub={`average of ${confirmedIn.length} · time to acknowledge ${fmtDur(avg(ackSecs))}`} />
      </div>

      <FlowSteps
        title="Phone decision flow"
        steps={[
          { label: "Decided by phone", value: phoneIn.length, sub: `in ${periodName}`, color: "var(--accent-blue, #2f6fed)", onClick: () => setPick((v) => (v === "phone" ? null : "phone")), active: pick === "phone" },
          { label: "Waiting for confirmation", value: confirm.length, sub: confirm.length ? `oldest ${fmtDur(oldest(confirm))}` : "none now", color: "var(--danger)", onClick: () => setPick((v) => (v === "confirm" ? null : "confirm")), active: pick === "confirm" },
          { label: "Confirmed by the authority", value: confirmedIn.length, sub: `in ${periodName}`, color: "var(--success)", onClick: () => setPick((v) => (v === "done" ? null : "done")), active: pick === "done" },
        ]}
        note="A phoned-in decision takes effect at once; the real authority then confirms it. Click a stage to list its decisions."
      />

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Decisions by month: by phone or direct</h3></div>
        {trend.length === 0 ? <p className="mrid-note">No fault decisions in these months.</p> : (
          <>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                {trend.length >= 3 ? (
                  <AreaChart data={trend} stackOffset="silhouette" margin={{ top: 10, right: 16, bottom: 4, left: 16 }} style={{ cursor: "pointer" }}
                    onClick={(st) => { const i = Number(st?.activeIndex); const m = Number.isFinite(i) ? trend[i] : undefined; if (m) { setMonthPick({ name: m.name, s: m.s, e: m.e }); setPick("done"); } }}>
                    <defs>
                      <linearGradient id="pd-dir" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity={0.85} /><stop offset="100%" stopColor="var(--success)" stopOpacity={0.55} /></linearGradient>
                      <linearGradient id="pd-ph" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--accent-blue, #2f6fed)" stopOpacity={0.85} /><stop offset="100%" stopColor="var(--accent-blue, #2f6fed)" stopOpacity={0.55} /></linearGradient>
                    </defs>
                    <XAxis dataKey="name" tick={AX} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={TT} />
                    <Area type="monotone" dataKey="Direct" stackId="d" stroke="var(--success)" strokeWidth={1} fill="url(#pd-dir)" animationDuration={900} />
                    <Area type="monotone" dataKey="By phone" stackId="d" stroke="var(--accent-blue, #2f6fed)" strokeWidth={1} fill="url(#pd-ph)" animationDuration={900} />
                  </AreaChart>
                ) : (
                  <BarChart data={trend} margin={{ top: 10, right: 16, bottom: 4, left: 0 }} style={{ cursor: "pointer" }}
                    onClick={(st) => { const i = Number(st?.activeIndex); const m = Number.isFinite(i) ? trend[i] : undefined; if (m) { setMonthPick({ name: m.name, s: m.s, e: m.e }); setPick("done"); } }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" tick={AX} />
                    <YAxis allowDecimals={false} tick={AX} width={32} />
                    <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} />
                    <Bar dataKey="Direct" stackId="d" fill="var(--success)" maxBarSize={34} />
                    <Bar dataKey="By phone" stackId="d" fill="var(--accent-blue, #2f6fed)" maxBarSize={34} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="mrid-legend"><span><i style={{ background: "var(--success)" }} />Direct</span><span><i style={{ background: "var(--accent-blue, #2f6fed)" }} />By phone</span></div>
            <p className="mrid-note" style={{ textAlign: "center" }}>Click a month to see what was confirmed or acknowledged in it.</p>
          </>
        )}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head">
          <h3>{tab === "confirm" ? `Phone decisions to confirm (${confirm.length})` : tab === "ack" ? `Decisions to acknowledge (${ack.length})` : `Confirmed or acknowledged in ${periodName} (${done.length})`}</h3>
          <div className="mrid-tabs">
            <button type="button" className={tab === "confirm" ? "is-on" : ""} onClick={() => setPick("confirm")}>To confirm ({confirm.length})</button>
            <button type="button" className={tab === "ack" ? "is-on" : ""} onClick={() => setPick("ack")}>To acknowledge ({ack.length})</button>
            <button type="button" className={tab === "done" ? "is-on" : ""} onClick={() => setPick("done")}>Done</button>
          </div>
        </div>
        <DrillChips onClear={clearAll} chips={[monthPick && <>Month: <b>{monthPick.name}</b></>, pick === "phone" && <b>Phone decisions in the period</b>]} />
        {table(tab === "confirm" ? confirm : tab === "ack" ? ack : done, tab)}
      </div>
    </div>
  );
}
