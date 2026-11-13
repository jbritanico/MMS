import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TagLamp } from "../../../components/Instruments";
import { buckets, fmtDate, type DashboardFilters, type MriDashboardAsset, type MriDashTagChange } from "../hooks/useMriDashboards";
import ExportMenu from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { AX, DrillChips, fmtDur, Loading, monthsFor, period, Tile, toDays, TT, useMore } from "./kit";
import { Sparkline, StoryStrip, type StoryLine } from "./fluid";
import { HealthStream, useHealthSeries } from "./health";

// Dashboard 8: Time spent Red or Yellow.
// From the tag history, how long each unit was Red (not safe to use) or Yellow (under repair)
// during the period. Before the first recorded change, a unit is taken to have had the tag the
// first change came from (or its current tag when it has no history).

type Tag = "Red" | "Yellow" | "Green" | "None";
const norm = (t: string | null | undefined): Tag => (t === "Red" || t === "Yellow" || t === "Green" ? t : "None");
const RED = "var(--danger)", YEL = "var(--tag-yellow, #d4a017)";

interface UnitTime { asset: MriDashboardAsset; red: number; yellow: number; turnedRed: number; longestRed: number; changes: MriDashTagChange[] }

function timeFor(asset: MriDashboardAsset, changes: MriDashTagChange[], s: number, e: number): UnitTime {
  const ch = changes.filter((c) => c.changed_at != null).sort((a, b) => a.changed_at! - b.changed_at!);
  const before = ch.filter((c) => c.changed_at! <= s);
  let cur: Tag = before.length ? norm(before[before.length - 1].tag_status) : ch.length ? norm(ch[0].previous_tag_status) : norm(asset.tag_status);
  let t0 = s, red = 0, yellow = 0, turnedRed = 0, longestRed = 0;
  let redStart: number | null = cur === "Red" ? (before.length ? before[before.length - 1].changed_at! : s) : null;
  const add = (to: number) => { if (cur === "Red") red += to - t0; else if (cur === "Yellow") yellow += to - t0; };
  const inWin = ch.filter((c) => c.changed_at! > s && c.changed_at! < e);
  for (const c of inWin) {
    add(c.changed_at!);
    const next = norm(c.tag_status);
    if (next === "Red" && cur !== "Red") { turnedRed++; redStart = c.changed_at!; }
    if (cur === "Red" && next !== "Red" && redStart != null) { longestRed = Math.max(longestRed, c.changed_at! - redStart); redStart = null; }
    cur = next;
    t0 = c.changed_at!;
  }
  add(e);
  if (cur === "Red" && redStart != null) longestRed = Math.max(longestRed, e - redStart);
  return { asset, red, yellow, turnedRed, longestRed, changes: ch };
}

function useTimes(assets: MriDashboardAsset[], s: number, e: number) {
  const more = useMore(assets);
  const times = useMemo(() => {
    const by = new Map<number, MriDashTagChange[]>();
    more.tag_changes.forEach((c) => by.set(c.asset_id, [...(by.get(c.asset_id) ?? []), c]));
    return assets.filter((a) => a.active).map((a) => timeFor(a, by.get(a.id) ?? [], s, e));
  }, [assets, more.tag_changes, s, e]);
  return { ...more, times };
}

export function TimeRedYellowMini({ assets }: { assets: MriDashboardAsset[] }) {
  const d = new Date();
  const s = Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000), e = Math.floor(Date.now() / 1000);
  const { times } = useTimes(assets, s, e);
  const red = times.reduce((a, t) => a + t.red, 0), yel = times.reduce((a, t) => a + t.yellow, 0);
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item" title="Unit-days this month"><i className="mrid-dot" style={{ background: RED }} /> Red <b>{toDays(red) ?? 0} d</b></span>
      <span className="mrid-mini-item" title="Unit-days this month"><i className="mrid-dot" style={{ background: YEL }} /> Yellow <b>{toDays(yel) ?? 0} d</b></span>
    </div>
  );
}

type Pick = "red" | "yellow" | "out" | null;

export default function TimeRedYellow({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const p = period(filters);
  const { times, tag_changes, isLoading, error } = useTimes(assets, p.s, p.e);
  // ---- fluid layer: health stream over the period, and Red / Yellow unit-days by month ----
  const points = useMemo(
    () => buckets(p.from, p.to).filter((b) => b.start.getTime() / 1000 < p.e).map((b) => ({ name: b.label, t: Math.min(Math.floor(b.end.getTime() / 1000), p.e) })),
    [p.from.getTime(), p.to.getTime(), p.e], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const health = useHealthSeries(assets, tag_changes, points);
  const monthly = useMemo(() => {
    const by = new Map<number, MriDashTagChange[]>();
    tag_changes.forEach((c) => by.set(c.asset_id, [...(by.get(c.asset_id) ?? []), c]));
    return monthsFor(p.from, p.to).map((m) => {
      const l = assets.filter((a) => a.active).map((a) => timeFor(a, by.get(a.id) ?? [], m.s, m.e));
      const days = Math.max(1, (Math.min(m.e, Math.floor(Date.now() / 1000)) - m.s) / 86400);
      return { name: m.name, red: l.reduce((x, u) => x + u.red, 0) / 86400, yellow: l.reduce((x, u) => x + u.yellow, 0) / 86400, days };
    });
  }, [assets, tag_changes, p.from.getTime(), p.to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const mPrev = monthly.length > 1 ? monthly[monthly.length - 2] : null, mLast = monthly.length ? monthly[monthly.length - 1] : null;
  const [pick, setPick] = useState<Pick>(null);
  const [unitPick, setUnitPick] = useState<number | null>(null);
  const clearAll = () => { setPick(null); setUnitPick(null); };
  const span = Math.max(1, p.e - p.s);

  const red = times.reduce((a, t) => a + t.red, 0), yel = times.reduce((a, t) => a + t.yellow, 0);
  const affected = times.filter((t) => t.red + t.yellow > 0);
  const ready = times.length ? Math.round((1 - (red + yel) / (span * times.length)) * 1000) / 10 : null;
  const turned = times.reduce((a, t) => a + t.turnedRed, 0);

  const ranked = affected
    .filter((t) => (pick !== "red" || t.red > 0) && (pick !== "yellow" || t.yellow > 0))
    .sort((a, b) => b.red + b.yellow - (a.red + a.yellow));
  const chart = ranked.slice(0, 20).map((t) => ({ id: t.asset.id, name: t.asset.asset_code, Red: toDays(t.red), Yellow: toDays(t.yellow) }));
  const unit = unitPick != null ? times.find((t) => t.asset.id === unitPick) : undefined;
  const pct = (t: UnitTime) => Math.round(((t.red + t.yellow) / span) * 1000) / 10;

  const story: StoryLine[] = [];
  {
    const longest = [...times].sort((a, b) => b.longestRed - a.longestRed)[0];
    const redNow = times.filter((u) => norm(u.asset.tag_status) === "Red");
    if (redNow.length) story.push({ tone: "attention", text: <><b>{redNow.length}</b> unit{redNow.length === 1 ? " is" : "s are"} Red now{longest && longest.longestRed > 0 ? <>; the longest Red spell in this period is <b>{longest.asset.asset_code}</b> at {fmtDur(longest.longestRed)}</> : null}.</> });
    if (mPrev && mLast) {
      // Compare the average number of Red units per day, so a month in progress is compared fairly.
      const a = Math.round((mPrev.red / mPrev.days) * 10) / 10, b = Math.round((mLast.red / mLast.days) * 10) / 10;
      if (a !== b) story.push({ tone: b > a ? "worse" : "better", text: <>On average {b} unit{b === 1 ? " was" : "s were"} Red each day in {mLast.name}{p.isCurrent ? " so far" : ""}, {b > a ? "up" : "down"} from {a} in {mPrev.name}.</> });
    }
    if (ready != null) story.push({ tone: ready >= 95 ? "better" : "info", text: <>The fleet was ready for service <b>{ready}%</b> of the time in {p.label}. Units turned Red {turned} time{turned === 1 ? "" : "s"}.</> });
  }

  const exportTables = () => [
    { name: "Summary", rows: [
      { Measure: "Red unit-days", Value: toDays(red) }, { Measure: "Yellow unit-days", Value: toDays(yel) },
      { Measure: "Units Red or Yellow at some point", Value: affected.length }, { Measure: "Active units", Value: times.length },
      { Measure: "Times a unit turned Red", Value: turned }, { Measure: "Ready-for-service time %", Value: ready },
    ] },
    { name: "Units", rows: ranked.map((t) => ({ Unit: t.asset.asset_code, Country: t.asset.country, "Equipment type": t.asset.asset_type, "Tag now": norm(t.asset.tag_status), "Days Red": toDays(t.red), "Days Yellow": toDays(t.yellow), "% of period out of action": pct(t), "Times turned Red": t.turnedRed, "Longest Red spell (days)": toDays(t.longestRed) })) },
    ...(unit ? [{ name: "Tag changes", rows: unit.changes.map((c) => ({ Unit: unit.asset.asset_code, Changed: fmtDate(c.changed_at), From: c.previous_tag_status, To: c.tag_status, Reason: c.reason, By: c.changed_by, Report: c.report_id ? `#${c.report_id}` : null })) }] : []),
  ];

  const loading = Loading({ isLoading, error });
  if (loading) return loading;

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">Time each unit spent Red (not safe to use) or Yellow (under repair) in <b>{p.label}</b>{p.isCurrent ? " so far" : ""}, from the tag history. Unit-days add up the days of every unit.</p>
        <ExportMenu dashboardNo={8} title="Time spent Red or Yellow" filters={filters} tables={exportTables} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        <Tile k="red" pick={pick} setPick={setPick} color={RED} label={<><TagLamp status="Red" size={14} /> Red</>} value={`${toDays(red) ?? 0} d`} sub={`unit-days · turned Red ${turned} time${turned === 1 ? "" : "s"}`}
          extra={<Sparkline values={monthly.map((m) => m.red)} color={RED} title="Red unit-days by month" />} />
        <Tile k="yellow" pick={pick} setPick={setPick} color={YEL} label={<><TagLamp status="Yellow" size={14} /> Yellow</>} value={`${toDays(yel) ?? 0} d`} sub="unit-days under repair"
          extra={<Sparkline values={monthly.map((m) => m.yellow)} color={YEL} title="Yellow unit-days by month" />} />
        <Tile k="out" pick={pick} setPick={setPick} color="var(--text-soft)" label="Units out of action" value={affected.length} sub={`of ${times.length} active units, for some of the time`} />
        <div className="mrid-kpi" style={{ ["--kpi" as string]: "var(--success)" }}>
          <div className="mrid-kpi-head"><span>Ready-for-service time</span></div>
          <div className="mrid-kpi-value">{ready == null ? "—" : `${ready}%`}</div>
          <div className="mrid-kpi-sub">Share of all unit time not Red or Yellow</div>
        </div>
      </div>

      <HealthStream
        title="Fleet health over the period"
        data={health}
        note="Share of active units in each tag colour at the end of each day, week or month. Hover for the number of units."
      />

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Days Red or Yellow, by unit{ranked.length > 20 ? " (top 20)" : ""}</h3></div>
        {chart.length === 0 ? <p className="mrid-note">No unit was Red or Yellow in this period.</p> : (
          <>
            <div style={{ width: "100%", height: Math.max(130, chart.length * 34 + 50) }}>
              <ResponsiveContainer>
                <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" tick={AX} unit=" d" />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: "var(--text)", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={TT} formatter={(v) => `${v} days`} />
                  <Bar dataKey="Red" stackId="t" fill={RED} maxBarSize={22} cursor="pointer" onClick={(_, i) => setUnitPick(chart[i]?.id ?? null)} />
                  <Bar dataKey="Yellow" stackId="t" fill={YEL} maxBarSize={22} cursor="pointer" onClick={(_, i) => setUnitPick(chart[i]?.id ?? null)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mrid-legend"><span><i style={{ background: RED }} />Red</span><span><i style={{ background: YEL }} />Yellow</span></div>
            <p className="mrid-note" style={{ textAlign: "center" }}>Click a unit to see its tag changes and the reports behind them.</p>
          </>
        )}
      </div>

      {unit && (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>Tag changes for {unit.asset.asset_code}</h3></div>
          <DrillChips onClear={() => setUnitPick(null)} chips={[<>Unit: <b>{unit.asset.asset_code}</b></>]} />
          {unit.changes.length === 0 ? <p className="mrid-note">No tag changes recorded for this unit.</p> : (
            <div className="mrid-table-wrap"><table className="mrid-table">
              <thead><tr><th>Changed</th><th>From</th><th>To</th><th>Reason</th><th>By</th><th>MR-I report</th></tr></thead>
              <tbody>{[...unit.changes].reverse().map((c, i) => (
                <tr key={i} style={c.changed_at != null && c.changed_at >= p.s && c.changed_at < p.e ? undefined : { opacity: 0.6 }}>
                  <td>{fmtDate(c.changed_at)}</td>
                  <td><TagLamp status={norm(c.previous_tag_status) === "None" ? null : norm(c.previous_tag_status)} size={12} showText /></td>
                  <td><TagLamp status={norm(c.tag_status) === "None" ? null : norm(c.tag_status)} size={12} showText /></td>
                  <td className="mrid-soft">{c.reason ?? "—"}</td><td>{c.changed_by ?? "—"}</td>
                  <td>{c.report_id ? <PreviewButton reportId={c.report_id} /> : "—"}</td>
                </tr>))}</tbody>
            </table><p className="mrid-note">Faded rows are outside the period.</p></div>
          )}
        </div>
      )}

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Units out of action ({ranked.length})</h3></div>
        <DrillChips onClear={clearAll} chips={[pick === "red" && <b>Red</b>, pick === "yellow" && <b>Yellow</b>]} />
        {ranked.length === 0 ? <p className="mrid-note">No units match.</p> : (
          <div className="mrid-table-wrap"><table className="mrid-table">
            <thead><tr><th>Unit</th><th>Tag now</th><th>Days Red</th><th>Days Yellow</th><th>Out of action</th><th>Turned Red</th><th>Longest Red spell</th></tr></thead>
            <tbody>{ranked.map((t) => (
              <tr key={t.asset.id} className="mrid-click" onClick={() => setUnitPick(t.asset.id)} style={unitPick === t.asset.id ? { outline: "2px solid var(--accent)" } : undefined}>
                <td><b>{t.asset.asset_code}</b><div className="mrid-soft">{t.asset.asset_type ?? ""}{t.asset.country ? ` · ${t.asset.country}` : ""}</div></td>
                <td><TagLamp status={norm(t.asset.tag_status) === "None" ? null : norm(t.asset.tag_status)} size={12} showText /></td>
                <td>{t.red ? fmtDur(t.red) : "—"}</td><td>{t.yellow ? fmtDur(t.yellow) : "—"}</td><td>{pct(t)}% of the period</td><td>{t.turnedRed}</td><td>{t.longestRed ? fmtDur(t.longestRed) : "—"}</td>
              </tr>))}</tbody>
          </table><p className="mrid-note">Click a unit to see its tag changes.</p></div>
        )}
      </div>
    </div>
  );
}
