import { useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from "recharts";
import { useCurrentUser } from "../../../lib/currentUser";
import {
  openAt,
  sevKey,
  useMriDashboardFaults,
  useMriDashboardMore,
  useMriDashboardScope,
  useMriDashboardWaiting,
} from "../hooks/useMriDashboards";
import { HEALTH, useHealthSeries } from "../mri/health";
import { DASH_ICONS } from "../dashCatalog";
import { FL_ICONS, FlCard, KpiCard, QuickAction, RangeTabs, TrendChip, type FlTone, type ShellSection } from "./FluentShell";
import { chartAnim } from "./motion";
import { FleetHero } from "./FleetHero";
import MonthlyPack from "./MonthlyPack";
import { inScope, ScopeFilterBar, useScopeFilter } from "../scopeFilter";
import { ModeToggle, useAdvanced } from "../dashMode";
import { useDashAccess } from "../dashAccess";

// The Dashboard area's landing page: what needs attention now across the units the user can see.
// Every figure comes from the same data as the MR-I dashboards; nothing here is sample data.

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthEdges(n: number) {
  const d = new Date();
  const out: { name: string; s: number; e: number; t: number }[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const a = new Date(d.getFullYear(), d.getMonth() - k, 1);
    const b = new Date(d.getFullYear(), d.getMonth() - k + 1, 1);
    const s = Math.floor(a.getTime() / 1000);
    const e = Math.min(Math.floor(b.getTime() / 1000), now());
    out.push({ name: `${MON[a.getMonth()]} ${String(a.getFullYear()).slice(2)}`, s, e, t: e });
  }
  return out;
}
const ago = (t: number | null | undefined) => {
  if (t == null) return "";
  const d = Math.floor((now() - t) / DAY);
  if (d <= 0) { const h = Math.max(1, Math.floor((now() - t) / 3600)); return h < 24 ? `${h} h ago` : "today"; }
  return d === 1 ? "yesterday" : `${d} days ago`;
};
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const TT = { background: "var(--surface)", border: "1px solid var(--fl-line)", borderRadius: 12, fontSize: 12, boxShadow: "var(--fl-shadow-2)" };
const AX = { fill: "var(--text-soft)", fontSize: 11.5 };
const RANGES = [{ v: 3, label: "3M" }, { v: 6, label: "6M" }, { v: 12, label: "12M" }];

export default function Overview({ onSection, onOpenDash }: { onSection: (s: ShellSection) => void; onOpenDash: (no: number) => void }) {
  const { user } = useCurrentUser();
  const scope = useMriDashboardScope();
  const faultsQ = useMriDashboardFaults();
  const waitingQ = useMriDashboardWaiting();
  const moreQ = useMriDashboardMore();
  const [range, setRange] = useState(6);
  const [hRange, setHRange] = useState(6);
  const [packOpen, setPackOpen] = useState(false);

  const scopeF = useScopeFilter();
  const allActive = useMemo(() => (scope.data?.assets ?? []).filter((a) => a.active), [scope.data]);
  const assets = useMemo(() => allActive.filter((a) => inScope(a, scopeF)), [allActive, scopeF]);
  const ids = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  const code = useMemo(() => new Map((scope.data?.assets ?? []).map((a) => [a.id, a.asset_code])), [scope.data]);
  const faults = useMemo(() => (faultsQ.data ?? []).filter((f) => ids.has(f.asset_id)), [faultsQ.data, ids]);
  const waiting = useMemo(() => (waitingQ.data ?? []).filter((w) => ids.has(w.asset_id)), [waitingQ.data, ids]);
  const keep = <T extends { asset_id: number }>(l: T[] | undefined) => (l ?? []).filter((x) => ids.has(x.asset_id));
  const more = useMemo(() => ({
    reports: keep(moreQ.data?.reports), decisions: keep(moreQ.data?.decisions), repairs: keep(moreQ.data?.repairs),
    tags: keep(moreQ.data?.tag_changes), triggers: keep(moreQ.data?.triggers),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [moreQ.data, ids]);

  // ---- KPIs ----
  const tags = useMemo(() => {
    const c = { Green: 0, Yellow: 0, Red: 0, None: 0 };
    assets.forEach((a) => { const t = a.tag_status === "Green" || a.tag_status === "Yellow" || a.tag_status === "Red" ? a.tag_status : "None"; c[t]++; });
    return c;
  }, [assets]);
  const t30 = now() - 30 * DAY;
  const openNow = faults.filter((f) => f.state === "Open");
  const open30 = faults.filter((f) => openAt(f, t30)).length;
  const sevCount = (k: string) => openNow.filter((f) => sevKey(f.severity) === k).length;
  const oldestWait = waiting.reduce<number | null>((m, w) => (w.waiting_since != null && (m == null || w.waiting_since < m) ? w.waiting_since : m), null);
  const repairsOpen = more.repairs.filter((r) => r.verified_at == null);
  const repairsParts = repairsOpen.filter((r) => /await|order|wait/i.test(r.parts_status)).length;
  const repairs30 = more.repairs.filter((r) => r.queued_at != null && r.queued_at <= t30 && (r.verified_at == null || r.verified_at > t30)).length;

  // ---- charts ----
  const months = useMemo(() => monthEdges(range), [range]);
  const faultSeries = useMemo(() => months.map((m) => ({
    name: m.name,
    Found: faults.filter((f) => f.found_at != null && f.found_at >= m.s && f.found_at < m.e).length,
    Closed: faults.filter((f) => f.state === "Closed" && f.ended_at != null && f.ended_at >= m.s && f.ended_at < m.e).length,
    Open: faults.filter((f) => openAt(f, m.e)).length,
  })), [months, faults]);
  const hMonths = useMemo(() => monthEdges(hRange).map((m) => ({ name: m.name, t: m.t })), [hRange]);
  const health = useHealthSeries(assets, more.tags, hMonths);
  // Fleet availability 30 days ago (share of active units Green then), from the tag history.
  const ago30 = useMemo(() => [{ name: "30 days ago", t: now() - 30 * DAY }], []);
  const prevHealth = useHealthSeries(assets, more.tags, ago30)[0];
  const prevTotal = prevHealth ? prevHealth.Green + prevHealth.Yellow + prevHealth.Red + prevHealth.None : 0;
  const prevPct = prevTotal ? (prevHealth.Green / prevTotal) * 100 : null;
  const usedHealth = HEALTH.filter((h) => h.key !== "None" || health.some((d) => d.None > 0));

  // ---- lists ----
  const waitList = useMemo(() => [...waiting].sort((a, b) => (a.waiting_since ?? 0) - (b.waiting_since ?? 0)).slice(0, 5), [waiting]);
  const due = useMemo(() => more.triggers
    .filter((t) => t.interval_value > 0)
    .map((t) => ({ ...t, pct: t.running_value / t.interval_value, warn: t.warning_value > 0 && t.running_value >= t.warning_value }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5), [more.triggers]);
  const activity = useMemo(() => {
    type Ev = { t: number; tone: FlTone; text: ReactNode; sub: string };
    const ev: Ev[] = [];
    more.reports.forEach((r) => {
      if (r.submitted_at) ev.push({ t: r.submitted_at, tone: "blue", text: <>Report #{r.id} submitted · {code.get(r.asset_id)}</>, sub: `${r.compliance_stage ?? "MR-I"}${r.submitted_by ? ` · ${r.submitted_by}` : ""}` });
      if (r.status === "Approved" && r.approved_at) ev.push({ t: r.approved_at, tone: "green", text: <>Report #{r.id} closed · {code.get(r.asset_id)}</>, sub: r.approved_by ?? "" });
    });
    more.decisions.forEach((d) => { if (d.decided_at && d.decision !== "Pending") ev.push({ t: d.decided_at, tone: "violet", text: <>{d.decision}: {d.item ?? "fault"} · {code.get(d.asset_id)}</>, sub: `${d.original_severity ?? ""}${d.reviewer ? ` · ${d.reviewer}` : ""}` }); });
    more.tags.forEach((c) => { if (c.changed_at) ev.push({ t: c.changed_at, tone: c.tag_status === "Red" ? "red" : c.tag_status === "Yellow" ? "amber" : "green", text: <>{code.get(c.asset_id)} tagged {c.tag_status}</>, sub: c.reason ?? "" }); });
    more.repairs.forEach((r) => { if (r.verified_at) ev.push({ t: r.verified_at, tone: "teal", text: <>Repair verified · {code.get(r.asset_id)}</>, sub: `${r.item ?? ""}${r.verified_by ? ` · ${r.verified_by}` : ""}` }); });
    return ev.sort((a, b) => b.t - a.t).slice(0, 6);
  }, [more, code]);

  const adv = useAdvanced();
  // Links only to dashboard items this user may open.
  const access = useDashAccess();
  const openIf = (no: number) => (access.dash(no) ? () => onOpenDash(no) : undefined);
  const loading = scope.isLoading || faultsQ.isLoading;
  if (scope.error) return <div className="empty">Could not load the dashboards: {String(scope.error)}</div>;
  const first = (user?.name ?? "").split(/\s+/)[0];
  const split = (["Green", "Yellow", "Red", "None"] as const).filter((k) => tags[k] > 0);
  const tagColor: Record<string, string> = { Green: "var(--fl-green)", Yellow: "var(--tag-yellow, #d4a017)", Red: "var(--fl-red)", None: "var(--text-soft)" };

  return (
    <>
      <ScopeFilterBar shown={assets.length} total={allActive.length} />
      <div className="fl-ov-mode" style={{ gap: 10, alignItems: "center" }}>
        {access.dash(26) && <button type="button" className="ghost" onClick={() => setPackOpen(true)} title="One printable page for a month: status, Major / Critical faults, repairs and overdue reviews">Print monthly pack</button>}
        <ModeToggle />
      </div>
      {packOpen && <MonthlyPack assets={assets} onClose={() => setPackOpen(false)} />}
      <FleetHero
        tags={tags}
        prevPct={prevPct}
        greeting={<>{greeting()}{first ? `, ${first}` : ""} · MR-I overview for {scopeF.country || (scope.data?.allowed_countries ? scope.data.allowed_countries.join(", ") : "all countries")}{scopeF.serviceLine ? ` · ${scopeF.serviceLine}` : ""}</>}
        onOpenFleet={() => { if (access.dash(1)) onOpenDash(1); }}
        onOpenHistory={access.dash(8) ? () => onOpenDash(8) : undefined}
        chips={<>
          <span className="fl-chip"><i style={{ color: "#5ef0b0" }} />Working offline</span>
          <span className="fl-chip">{assets.length} unit{assets.length === 1 ? "" : "s"} in view</span>
          {waiting.length > 0 && <span className="fl-chip">{waiting.length} waiting for review</span>}
        </>}
      />

      {loading ? (
        <div className="empty"><span className="fl-spinner" />Loading the overview…</div>
      ) : (
        <>
          <div className="fl-kpis">
            <KpiCard tone="blue" icon={DASH_ICONS[1]} label="Units by tag" value={assets.length}
              sub={<>{tags.Green} Green · {tags.Yellow} Yellow · {tags.Red} Red{tags.None ? ` · ${tags.None} not tagged` : ""}</>}
              onClick={openIf(1)}>
              <div className="fl-split" aria-hidden="true">{split.map((k) => <i key={k} style={{ flexGrow: tags[k], background: tagColor[k] }} />)}</div>
            </KpiCard>
            <KpiCard tone="red" icon={DASH_ICONS[2]} label="Open faults" value={openNow.length}
              trend={<TrendChip delta={openNow.length - open30} good={openNow.length <= open30} label="vs 30 days ago" />}
              sub={<>{sevCount("Critical")} Major / Critical · {sevCount("Moderate")} Moderate · {sevCount("Minor")} Minor</>}
              onClick={openIf(2)} />
            <KpiCard tone="amber" icon={DASH_ICONS[5]} label="Waiting for review" value={waiting.length}
              sub={oldestWait ? <>Oldest has waited {Math.max(0, Math.floor((now() - oldestWait) / DAY))} days</> : "Nothing waiting"}
              onClick={openIf(5)} />
            <KpiCard tone="teal" icon={DASH_ICONS[7]} label="Repairs in progress" value={repairsOpen.length}
              trend={<TrendChip delta={repairsOpen.length - repairs30} good={repairsOpen.length <= repairs30} label="vs 30 days ago" />}
              sub={<>{repairsParts} waiting for parts</>}
              onClick={openIf(7)} />
          </div>

          {adv && <div className="fl-grid-2">
            <FlCard title="Faults found and closed" note="Per month, with the faults still open at each month end"
              tools={<RangeTabs label="Time range" value={range} options={RANGES} onChange={setRange} />}>
              <div style={{ width: "100%", height: 270 }}>
                <ResponsiveContainer>
                  <ComposedChart data={faultSeries} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                    <defs>
                      <linearGradient id="flg-found" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--fl-blue)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--fl-blue)" stopOpacity={0.02} /></linearGradient>
                      <linearGradient id="flg-closed" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--fl-green)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--fl-green)" stopOpacity={0.02} /></linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--fl-line)" />
                    <XAxis dataKey="name" tick={AX} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
                    <YAxis allowDecimals={false} tick={AX} axisLine={false} tickLine={false} width={40} />
                    <Tooltip contentStyle={TT} cursor={{ stroke: "var(--fl-blue)", strokeOpacity: 0.25 }} />
                    <Area {...chartAnim(900)} type="monotone" dataKey="Found" stroke="var(--fl-blue)" strokeWidth={2.5} fill="url(#flg-found)" />
                    <Area {...chartAnim(1000)} type="monotone" dataKey="Closed" stroke="var(--fl-green)" strokeWidth={2.5} fill="url(#flg-closed)" />
                    <Line {...chartAnim(1100)} type="monotone" dataKey="Open" name="Open at month end" stroke="var(--fl-violet)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, strokeWidth: 0, fill: "var(--fl-violet)" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="fl-legend">
                <span><i style={{ background: "var(--fl-blue)" }} />Found</span>
                <span><i style={{ background: "var(--fl-green)" }} />Closed</span>
                <span><i style={{ background: "var(--fl-violet)" }} />Open at month end</span>
              </div>
            </FlCard>

            <FlCard title="Fleet health" note="Share of units Green, Yellow and Red at each month end"
              tools={<RangeTabs label="Time range" value={hRange} options={RANGES} onChange={setHRange} />}>
              <div style={{ width: "100%", height: 270 }}>
                <ResponsiveContainer>
                  <AreaChart data={health} stackOffset="expand" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      {usedHealth.map((h) => (
                        <linearGradient key={h.key} id={`flh-${h.key}`} x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={h.color} stopOpacity={0.85} /><stop offset="100%" stopColor={h.color} stopOpacity={0.55} />
                        </linearGradient>
                      ))}
                    </defs>
                    <XAxis dataKey="name" tick={AX} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
                    <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={AX} axisLine={false} tickLine={false} width={44} />
                    <Tooltip contentStyle={TT} formatter={(v, n) => [`${v} unit${v === 1 ? "" : "s"}`, n]} />
                    {[...usedHealth].reverse().map((h) => (
                      <Area {...chartAnim(900)} key={h.key} type="monotone" dataKey={h.key} name={h.label} stackId="h" stroke={h.color} strokeWidth={1} fill={`url(#flh-${h.key})`} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="fl-legend">{usedHealth.map((h) => <span key={h.key}><i style={{ background: h.color }} />{h.label}</span>)}</div>
            </FlCard>
          </div>}

          <h2 className="fl-section-title">Quick actions</h2>
          <div className="fl-qas">
            {access.dash(2) && <QuickAction tone="red" icon={DASH_ICONS[2]} label="Open faults" note={`${openNow.length} open`} onClick={() => onOpenDash(2)} />}
            {access.dash(5) && <QuickAction tone="amber" icon={DASH_ICONS[5]} label="Decisions Waiting" note={`${waiting.length} waiting`} onClick={() => onOpenDash(5)} />}
            {access.dash(7) && <QuickAction tone="teal" icon={DASH_ICONS[7]} label="Repair Queue" note={`${repairsOpen.length} in progress`} onClick={() => onOpenDash(7)} />}
            {access.dash(13) && <QuickAction tone="violet" icon={DASH_ICONS[13]} label="MR-II Due Forecast" note="From MR-I counters" onClick={() => onOpenDash(13)} />}
            {access.history && <QuickAction tone="blue" icon={FL_ICONS.history} label="Asset MR-I History" note="Report timeline per unit" onClick={() => onSection("mri-history")} />}
            {access.firstUser != null && <QuickAction tone="green" icon={FL_ICONS.people} label="User Analytics" note="Workload by person" onClick={() => onSection("user-analytics")} />}
          </div>

          <div className={adv ? "fl-grid-3" : "fl-grid-2"}>
            <FlCard title="Waiting for review" note="Oldest first" tools={access.dash(5) ? <button type="button" className="fl-link" onClick={() => onOpenDash(5)}>View all {FL_ICONS.chevron}</button> : undefined}>
              {waitList.length === 0 ? <div className="fl-empty">Nothing is waiting. Reports and fault decisions are up to date.</div> : (
                <div className="fl-list">
                  {waitList.map((w) => {
                    const tone: FlTone = w.severity && /crit|major/i.test(w.severity) ? "red" : w.severity && /mod/i.test(w.severity) ? "amber" : "blue";
                    const d = w.waiting_since ? Math.floor((now() - w.waiting_since) / DAY) : null;
                    return (
                      <div key={`${w.kind}-${w.report_id}-${w.approval_id ?? 0}`} className="fl-list-row">
                        <span className={`fl-ico sm tone-${tone}`}>{w.kind === "fault" ? DASH_ICONS[2] : DASH_ICONS[11]}</span>
                        <span className="fl-list-main"><b>{code.get(w.asset_id)} · {w.item ?? `Report #${w.report_id}`}</b><small>{w.step} · {w.assigned_to_name ?? w.required_authority}</small></span>
                        {d != null && <span className={`fl-pill tone-${d > 7 ? "red" : d > 2 ? "amber" : "green"}`}>{d === 0 ? "today" : `${d} d`}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </FlCard>

            <FlCard title="Closest to MR-II / MR-III" note="Counter used, from the latest MR-I readings" tools={access.dash(13) ? <button type="button" className="fl-link" onClick={() => onOpenDash(13)}>Forecast {FL_ICONS.chevron}</button> : undefined}>
              {due.length === 0 ? <div className="fl-empty">No maintenance counters are set for these units yet.</div> : (
                <div className="fl-list">
                  {due.map((t, n) => {
                    const tone: FlTone = t.pct >= 1 ? "red" : t.warn ? "amber" : "blue";
                    return (
                      <div key={n} className="fl-list-row">
                        <span className={`fl-ico sm tone-${tone}`}>{DASH_ICONS[13]}</span>
                        <span className="fl-list-main"><b>{code.get(t.asset_id)} · {t.mr_level}</b><small>{t.trigger_type}: {t.running_value.toLocaleString()} of {t.interval_value.toLocaleString()}</small></span>
                        <span className={`fl-list-side tone-${tone}`} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <b style={{ color: "var(--text)", fontSize: 13 }}>{Math.round(t.pct * 100)}%</b>
                          <span className={`fl-meter tone-${tone}`}><i style={{ width: `${Math.min(100, t.pct * 100)}%` }} /></span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </FlCard>

            {adv && <FlCard title="Recent activity" note="Latest reports, decisions, tags and repairs">
              {activity.length === 0 ? <div className="fl-empty">No activity yet.</div> : (
                <div className="fl-list">
                  {activity.map((e, n) => (
                    <div key={n} className="fl-list-row">
                      <span className={`fl-dot is-${e.tone === "teal" || e.tone === "violet" ? "blue" : e.tone}`} style={e.tone === "violet" ? { background: "var(--fl-violet)" } : e.tone === "teal" ? { background: "var(--fl-cyan)" } : undefined} />
                      <span className="fl-list-main"><b>{e.text}</b><small>{e.sub}</small></span>
                      <span className="fl-list-side">{ago(e.t)}</span>
                    </div>
                  ))}
                </div>
              )}
            </FlCard>}
          </div>

        </>
      )}
    </>
  );
}

