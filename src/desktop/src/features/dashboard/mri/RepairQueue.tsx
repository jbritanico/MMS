import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { fmtDate, sevKey, type DashboardFilters, type MriDashboardAsset, type MriDashRepair } from "../hooks/useMriDashboards";
import ExportMenu from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { AX, avg, DAY, DrillChips, fmtDur, inRange, Loading, median, monthsFor, nowSecs, period, Tile, toDays, TT, useMore } from "./kit";
import { FlowSteps, Sparkline, StoryStrip, TrendDelta, type StoryLine } from "./fluid";

// Dashboard 7: Repair queue and repair time.
// The repair queue = faults that left the unit Red-Tagged and are not yet verified as repaired.
// Repair time = from the repair entering the queue to the repair being verified (Green).

const isOpen = (r: MriDashRepair) => r.verified_at == null && r.tag_status !== "Green";
const PARTS_COLOR: Record<string, string> = { Awaiting: "var(--danger)", Ordered: "var(--warn)", Available: "var(--success)" };
const partsColor = (k: string) => PARTS_COLOR[k] ?? "var(--text-soft)";
const PARTS_ORDER = ["Awaiting", "Ordered", "Available"];
type Pick = "open" | "parts" | "unassigned" | "done" | null;
const needsParts = (r: MriDashRepair) => r.parts_status.trim().toLowerCase() !== "available";

export function RepairQueueMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { repairs } = useMore(assets);
  const open = repairs.filter(isOpen);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">In the queue <b>{open.length}</b></span>
      <span className="mrid-mini-item">No technician <b>{open.filter((r) => !r.technician?.trim()).length}</b></span>
    </div>
  );
}

export default function RepairQueue({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const { repairs, unitOf, isLoading, error } = useMore(assets);
  const p = period(filters);
  const [pick, setPick] = useState<Pick>(null);
  const [techPick, setTechPick] = useState<string | null>(null);
  const [partsPick, setPartsPick] = useState<string | null>(null);
  const clearAll = () => { setPick(null); setTechPick(null); setPartsPick(null); };
  const now = nowSecs();

  const open = repairs.filter(isOpen);
  const waitingParts = open.filter(needsParts);
  const unassigned = open.filter((r) => !r.technician?.trim());
  const done = repairs.filter((r) => inRange(r.verified_at, p.s, p.e)).map((r) => ({ r, secs: r.queued_at != null ? Math.max(0, r.verified_at! - r.queued_at) : null }));
  const doneSecs = done.map((d) => d.secs).filter((x): x is number => x != null);
  const age = (r: MriDashRepair) => (r.queued_at == null ? null : now - r.queued_at);
  const oldest = open.length ? Math.max(...open.map((r) => age(r) ?? 0)) : null;

  const partsKinds = useMemo(() => [...new Set(open.map((r) => r.parts_status.trim() || "Not set"))].sort((a, b) => (PARTS_ORDER.indexOf(a) + 1 || 9) - (PARTS_ORDER.indexOf(b) + 1 || 9)), [open.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const techName = (r: MriDashRepair) => r.technician?.trim() || "Not assigned";
  const byTech = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    open.forEach((r) => {
      const k = techName(r);
      const row = m.get(k) ?? {};
      const ps = r.parts_status.trim() || "Not set";
      row[ps] = (row[ps] ?? 0) + 1;
      m.set(k, row);
    });
    return [...m.entries()].map(([name, r]) => ({ name, ...r, total: Object.values(r).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  }, [open.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = (pick === "done" ? [] : open)
    .filter((r) => (pick !== "parts" || needsParts(r)) && (pick !== "unassigned" || !r.technician?.trim()) && (techPick == null || techName(r) === techPick) && (partsPick == null || (r.parts_status.trim() || "Not set") === partsPick))
    .sort((a, b) => (age(b) ?? 0) - (age(a) ?? 0));
  const code = (id: number) => unitOf.get(id)?.asset_code ?? String(id);

  // ---- fluid layer ----
  const queueAt = (t: number) => repairs.filter((r) => r.queued_at != null && r.queued_at < t && (r.verified_at == null || r.verified_at >= t)).length;
  const qMonths = monthsFor(p.from, p.to).map((m) => ({ name: m.name, n: queueAt(Math.min(m.e, now + 1)) }));
  const qPrev = qMonths.length > 1 ? qMonths[qMonths.length - 2] : null;
  const byParts = (k: string) => open.filter((r) => r.parts_status.trim().toLowerCase() === k.toLowerCase());
  const story: StoryLine[] = [];
  {
    const oldestR = [...open].sort((a, b) => (a.queued_at ?? 0) - (b.queued_at ?? 0))[0];
    if (oldestR) story.push({ tone: (age(oldestR) ?? 0) > 7 * DAY ? "attention" : "info", text: <>Longest in the queue: <b>{oldestR.item ?? "a repair"}</b> on {code(oldestR.asset_id)}, {fmtDur(age(oldestR))}{oldestR.technician ? <> (with {oldestR.technician})</> : <>, <b>no technician assigned</b></>}.</> });
    const late = open.filter((r) => r.repair_at != null && r.repair_at < now);
    if (late.length) story.push({ tone: "worse", text: <>{late.length} repair{late.length === 1 ? " has" : "s have"} passed the planned repair date.</> });
    if (qPrev) {
      const nowQ = open.length;
      if (nowQ !== qPrev.n) story.push({ tone: nowQ > qPrev.n ? "worse" : "better", text: <>The repair queue {nowQ > qPrev.n ? "grew" : "shrank"} from {qPrev.n} to <b>{nowQ}</b> since the end of {qPrev.name}.</> });
    }
    if (done.length) story.push({ tone: "info", text: <>{done.length} repair{done.length === 1 ? "" : "s"} verified in {p.label}, taking {fmtDur(avg(doneSecs))} on average.</> });
    if (!open.length && !done.length) story.push({ tone: "better", text: <>The repair queue is empty.</> });
  }

  const exportTables = () => [
    {
      name: "Summary",
      rows: [
        { Measure: "Repairs in the queue now", Value: open.length },
        { Measure: "Waiting for parts", Value: waitingParts.length },
        { Measure: "No technician assigned", Value: unassigned.length },
        { Measure: "Oldest in the queue (days)", Value: toDays(oldest) },
        { Measure: `Repairs completed in ${p.label}`, Value: done.length },
        { Measure: "Average repair time (days)", Value: toDays(avg(doneSecs)) },
        { Measure: "Median repair time (days)", Value: toDays(median(doneSecs)) },
      ],
    },
    { name: "By technician", rows: byTech.map((t) => ({ Technician: t.name, ...Object.fromEntries(partsKinds.map((k) => [k, (t as Record<string, unknown>)[k] as number ?? 0])), Total: t.total })) },
    { name: "Queue", rows: list.map((r) => ({ Unit: code(r.asset_id), Item: r.item, Severity: sevKey(r.severity ?? ""), Technician: r.technician, Parts: r.parts_status, "In queue since": fmtDate(r.queued_at), "Days in queue": toDays(age(r)), "Planned repair": fmtDate(r.repair_at), "Limitations told to field": r.limitations_note, Report: `#${r.report_id}` })) },
    { name: "Completed", rows: done.map(({ r, secs }) => ({ Unit: code(r.asset_id), Item: r.item, Technician: r.technician, "Verified by": r.verified_by, "In queue since": fmtDate(r.queued_at), Verified: fmtDate(r.verified_at), "Repair days": toDays(secs), Report: `#${r.report_id}` })) },
  ];

  const loading = Loading({ isLoading, error });
  if (loading) return loading;

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">The queue is shown as it is <b>now</b>. Repair times are for repairs verified in <b>{p.label}</b> (from entering the queue to the verified repair).</p>
        <ExportMenu dashboardNo={7} title="Repair queue and repair time" filters={filters} tables={exportTables} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        <Tile k="open" pick={pick} setPick={setPick} color="var(--danger)" label="In the repair queue" value={open.length} sub={oldest != null ? `Oldest ${fmtDur(oldest)}` : "Nothing waiting"}
          extra={<><TrendDelta now={open.length} prev={qPrev?.n ?? null} label={qPrev ? `vs end of ${qPrev.name}` : ""} /><Sparkline values={qMonths.map((m) => m.n)} color="var(--danger)" title="Repairs in the queue at each month-end" /></>} />
        <Tile k="parts" pick={pick} setPick={setPick} color="var(--warn)" label="Waiting for parts" value={waitingParts.length} sub="Parts not yet available" />
        <Tile k="unassigned" pick={pick} setPick={setPick} color="var(--accent-blue, #2f6fed)" label="No technician" value={unassigned.length} sub="Repairs nobody is assigned to" />
        <Tile k="done" pick={pick} setPick={setPick} color="var(--success)" label="Average repair time" value={fmtDur(avg(doneSecs))} sub={`${done.length} repair${done.length === 1 ? "" : "s"} verified in the period · median ${fmtDur(median(doneSecs))}`} />
      </div>

      <FlowSteps
        title="Repair flow"
        steps={[
          { label: "Waiting for parts", value: byParts("Awaiting").length, sub: "parts not ordered yet", color: "var(--danger)", onClick: () => { setPartsPick((v) => (v === "Awaiting" ? null : "Awaiting")); setTechPick(null); setPick(null); }, active: partsPick === "Awaiting" },
          { label: "Parts ordered", value: byParts("Ordered").length, sub: "on the way", color: "var(--warn)", onClick: () => { setPartsPick((v) => (v === "Ordered" ? null : "Ordered")); setTechPick(null); setPick(null); }, active: partsPick === "Ordered" },
          { label: "Ready to repair", value: byParts("Available").length, sub: "parts available", color: "var(--accent-blue, #2f6fed)", onClick: () => { setPartsPick((v) => (v === "Available" ? null : "Available")); setTechPick(null); setPick(null); }, active: partsPick === "Available" },
          { label: "Repaired and verified", value: done.length, sub: `in ${p.label}`, color: "var(--success)", onClick: () => setPick((v) => (v === "done" ? null : "done")), active: pick === "done" },
        ]}
        note="Click a stage to list its repairs."
      />

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Queue by technician and parts</h3></div>
        {byTech.length === 0 ? <p className="mrid-note">The repair queue is empty.</p> : (
          <>
            <div style={{ width: "100%", height: Math.max(130, byTech.length * 42 + 50) }}>
              <ResponsiveContainer>
                <BarChart data={byTech} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" allowDecimals={false} tick={AX} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fill: "var(--text)", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} />
                  {partsKinds.map((k) => (
                    <Bar key={k} dataKey={k} stackId="p" fill={partsColor(k)} maxBarSize={24} cursor="pointer"
                      onClick={(_, idx) => { const t = byTech[idx]; if (t) { setTechPick(t.name); setPartsPick(k); setPick(null); } }} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mrid-legend">{partsKinds.map((k) => <span key={k}><i style={{ background: partsColor(k) }} />Parts: {k}</span>)}</div>
            <p className="mrid-note" style={{ textAlign: "center" }}>Click a bar to list those repairs.</p>
          </>
        )}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>{pick === "done" ? `Repairs verified in ${p.label} (${done.length})` : `Repairs waiting, longest first (${list.length})`}</h3></div>
        <DrillChips onClear={clearAll} chips={[pick && pick !== "open" && <b>{{ parts: "Waiting for parts", unassigned: "No technician", done: "Completed", open: "" }[pick]}</b>, techPick && <>Technician: <b>{techPick}</b></>, partsPick && <>Parts: <b>{partsPick}</b></>]} />
        {pick === "done" ? (
          done.length === 0 ? <p className="mrid-note">No repairs were verified in this period.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Unit</th><th>Item</th><th>Technician</th><th>Verified by</th><th>In queue since</th><th>Verified</th><th>Repair time</th><th>MR-I report</th></tr></thead>
              <tbody>{done.map(({ r, secs }) => (
                <tr key={r.rectification_id}><td><b>{code(r.asset_id)}</b></td><td>{r.item ?? "—"}</td><td>{r.technician ?? "—"}</td><td>{r.verified_by ?? "—"}</td>
                  <td>{fmtDate(r.queued_at)}</td><td>{fmtDate(r.verified_at)}</td><td>{fmtDur(secs)}</td><td><PreviewButton reportId={r.report_id} /></td></tr>))}</tbody>
            </table></div>)
        ) : list.length === 0 ? <p className="mrid-note">Nothing matches this selection.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Unit</th><th>Item</th><th>Technician</th><th>Parts</th><th>In queue since</th><th>Waiting</th><th>Planned repair</th><th>Limitations told to field</th><th>MR-I report</th></tr></thead>
            <tbody>{list.map((r) => {
              const a = age(r);
              return (
                <tr key={r.rectification_id}>
                  <td><b>{code(r.asset_id)}</b><div className="mrid-soft">{r.tag_status === "Planned" ? "Repair planned" : "Red-Tagged"}</div></td>
                  <td>{r.item ?? "—"}<div className="mrid-soft">{sevKey(r.severity ?? "")}</div></td>
                  <td>{r.technician?.trim() || <span className="mrid-over">Not assigned</span>}</td>
                  <td>{r.parts_status || "—"}</td><td>{fmtDate(r.queued_at)}</td>
                  <td className={a != null && a > 7 * DAY ? "mrid-over" : undefined}>{fmtDur(a)}</td>
                  <td>{fmtDate(r.repair_at)}{r.repair_at != null && r.repair_at < now ? <div className="mrid-over">Date passed</div> : null}</td>
                  <td className="mrid-soft">{r.limitations_note ?? "—"}</td>
                  <td><PreviewButton reportId={r.report_id} /></td>
                </tr>);
            })}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
