import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { fmtDate, sevKey, SEVERITIES, useMriDashboardWaiting, type DashboardFilters, type MriDashboardAsset, type MriDashboardWaiting } from "../hooks/useMriDashboards";
import ExportMenu, { type ExportRow } from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { FlowSteps, StoryStrip, type StoryLine } from "./fluid";

// Dashboard 5: Decisions waiting, by reviewer.
// Everything waiting for a reviewer NOW: fault decisions (Pending) and reports waiting for the
// Supervisor to review or close. Shows who it is waiting with and for how long. The period filter
// does not apply (it is a "now" view); the country / service line / equipment filters do.

const DAY = 86400;
const nowSecs = () => Math.floor(Date.now() / 1000);
const AGES = [
  { key: "a0", label: "Under 1 day", min: 0, max: 0, color: "var(--success)" },
  { key: "a1", label: "1–3 days", min: 1, max: 3, color: "var(--accent-blue, #2f6fed)" },
  { key: "a2", label: "4–7 days", min: 4, max: 7, color: "var(--warn)" },
  { key: "a3", label: "Over 7 days", min: 8, max: Infinity, color: "var(--danger)" },
] as const;
type AgeKey = (typeof AGES)[number]["key"];
const ageKey = (d: number): AgeKey => AGES.find((a) => d >= a.min && d <= a.max)!.key;
const daysWaiting = (w: MriDashboardWaiting) => (w.waiting_since == null ? 0 : Math.max(0, Math.floor((nowSecs() - w.waiting_since) / DAY)));
const fmtDays = (d: number) => (d === 0 ? "Today" : `${d} day${d === 1 ? "" : "s"}`);

/** Who it is waiting with, in plain words. */
export function waitingWith(w: MriDashboardWaiting) {
  if (w.kind === "report") return "Maintenance Supervisor (anyone)";
  return w.assigned_to_name?.trim() || `Not named: any ${w.required_authority}`;
}
const isUnnamed = (w: MriDashboardWaiting) => w.kind === "fault" && !w.assigned_to_name?.trim();

function useScoped(assets: MriDashboardAsset[]) {
  const { data = [], isLoading, error } = useMriDashboardWaiting();
  const ids = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  return { rows: useMemo(() => data.filter((w) => ids.has(w.asset_id)), [data, ids]), isLoading, error };
}

export function DecisionsWaitingMini({ assets }: { assets: MriDashboardAsset[] }) {
  const { rows } = useScoped(assets);
  const faults = rows.filter((w) => w.kind === "fault").length;
  const reports = rows.length - faults;
  const late = rows.filter((w) => daysWaiting(w) > 7).length;
  return (
    <div className="mrid-mini">
      <span className="mrid-mini-item">Fault decisions <b>{faults}</b></span>
      <span className="mrid-mini-item">Reports <b>{reports}</b></span>
      <span className="mrid-mini-item" style={{ color: late ? "var(--danger)" : undefined }}>Over 7 days <b>{late}</b></span>
    </div>
  );
}

type Pick = "faults" | "reports" | "unnamed" | "late" | null;

export default function DecisionsWaiting({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const { rows, isLoading, error } = useScoped(assets);
  const unitOf = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const [pick, setPick] = useState<Pick>(null);
  const [whoPick, setWhoPick] = useState<string | null>(null);
  const [agePick, setAgePick] = useState<AgeKey | null>(null);
  const clearAll = () => { setPick(null); setWhoPick(null); setAgePick(null); };

  const faults = rows.filter((w) => w.kind === "fault");
  const reports = rows.filter((w) => w.kind === "report");
  const unnamed = rows.filter(isUnnamed);
  const late = rows.filter((w) => daysWaiting(w) > 7);
  const oldest = (l: MriDashboardWaiting[]) => (l.length ? Math.max(...l.map(daysWaiting)) : 0);
  const critical = faults.filter((w) => sevKey(w.severity ?? "") === "Critical").length;

  const byWho = useMemo(() => {
    const m = new Map<string, Record<AgeKey, number> & { total: number; oldest: number }>();
    for (const w of rows) {
      const k = waitingWith(w);
      const r = m.get(k) ?? { a0: 0, a1: 0, a2: 0, a3: 0, total: 0, oldest: 0 };
      const d = daysWaiting(w);
      r[ageKey(d)]++;
      r.total++;
      r.oldest = Math.max(r.oldest, d);
      m.set(k, r);
    }
    return [...m.entries()].map(([name, r]) => ({ name, ...r })).sort((a, b) => b.a3 - a.a3 || b.total - a.total || a.name.localeCompare(b.name));
  }, [rows]);

  const list = rows
    .filter(
      (w) =>
        (pick == null ||
          (pick === "faults" && w.kind === "fault") ||
          (pick === "reports" && w.kind === "report") ||
          (pick === "unnamed" && isUnnamed(w)) ||
          (pick === "late" && daysWaiting(w) > 7)) &&
        (whoPick == null || waitingWith(w) === whoPick) &&
        (agePick == null || ageKey(daysWaiting(w)) === agePick),
    )
    .sort((a, b) => daysWaiting(b) - daysWaiting(a));
  const picking = pick || whoPick || agePick;

  const row = (w: MriDashboardWaiting): ExportRow => ({
    "Waiting with": waitingWith(w),
    "Who may decide": w.required_authority,
    "Waiting for": w.kind === "fault" ? "Fault decision" : w.step,
    Unit: unitOf.get(w.asset_id)?.asset_code ?? String(w.asset_id),
    Component: w.component,
    Item: w.item,
    Severity: w.severity ? sevKey(w.severity) : null,
    Issue: w.issue_details,
    "Submitted by": w.submitted_by,
    "Waiting since": fmtDate(w.waiting_since),
    "Days waiting": daysWaiting(w),
    Reminders: w.reminders,
    "Last reminder": w.last_reminder_at ? `${fmtDate(w.last_reminder_at)}${w.last_reminder_by ? ` by ${w.last_reminder_by}` : ""}` : null,
    Report: `#${w.report_id}`,
    Country: unitOf.get(w.asset_id)?.country ?? null,
  });
  // ---- fluid layer ----
  const story: StoryLine[] = [];
  {
    const longest = [...rows].sort((a, b) => daysWaiting(b) - daysWaiting(a))[0];
    if (longest) story.push({ tone: daysWaiting(longest) > 7 ? "attention" : "info", text: <>Longest wait: <b>{longest.kind === "fault" ? `${longest.item ?? "a fault"} decision` : longest.step.toLowerCase()}</b> on {unitOf.get(longest.asset_id)?.asset_code}, {fmtDays(daysWaiting(longest)).toLowerCase()}, waiting with <b>{waitingWith(longest)}</b>.</> });
    const slow = byWho.filter((r) => r.a3 > 0)[0];
    if (slow) story.push({ tone: "worse", text: <><b>{slow.name}</b> has {slow.a3} item{slow.a3 === 1 ? "" : "s"} waiting more than 7 days.</> });
    if (unnamed.length) story.push({ tone: "info", text: <>{unnamed.length} fault decision{unnamed.length === 1 ? " is" : "s are"} not named to a person; any reviewer with authority can take {unnamed.length === 1 ? "it" : "them"}.</> });
    if (!rows.length) story.push({ tone: "better", text: <>Nothing is waiting for a decision.</> });
  }
  const supReview = reports.filter((w) => w.step.startsWith("Supervisor review"));
  const supClose = reports.filter((w) => w.step.startsWith("Supervisor to close"));

  const exportTables = () => [
    {
      name: "Summary",
      rows: [
        { Measure: "Fault decisions waiting", Count: faults.length, "Oldest (days)": oldest(faults) },
        { Measure: "Reports waiting for the Supervisor", Count: reports.length, "Oldest (days)": oldest(reports) },
        { Measure: "Fault decisions not named to a person", Count: unnamed.length, "Oldest (days)": oldest(unnamed) },
        { Measure: "Waiting over 7 days", Count: late.length, "Oldest (days)": oldest(late) },
      ],
    },
    { name: "By reviewer", rows: byWho.map((r) => ({ "Waiting with": r.name, "Under 1 day": r.a0, "1-3 days": r.a1, "4-7 days": r.a2, "Over 7 days": r.a3, Total: r.total, "Oldest (days)": r.oldest })) },
    { name: picking ? "Waiting (selection)" : "Waiting", rows: list.map(row) },
  ];

  if (isLoading) return <div className="empty">Loading...</div>;
  if (error) return <div className="empty">Could not load the waiting items: {String(error)}</div>;

  const tile = (key: Exclude<Pick, null>, label: string, value: number, sub: string, color: string) => (
    <button type="button" className={`mrid-kpi${pick === key ? " is-on" : ""}`} style={{ ["--kpi" as string]: color }} onClick={() => setPick((v) => (v === key ? null : key))}>
      <div className="mrid-kpi-head"><span>{label}</span></div>
      <div className="mrid-kpi-value">{value}</div>
      <div className="mrid-kpi-sub">{sub}</div>
      <div className="mrid-kpi-hint">{pick === key ? "Showing these ↓" : "Click to list"}</div>
    </button>
  );

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">
          Decisions waiting <b>now</b>, and who they are waiting with. The period filter does not change this dashboard.
        </p>
        <ExportMenu dashboardNo={5} title="Decisions waiting by reviewer" filters={filters} tables={exportTables} periodApplies={false} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        {tile("faults", "Fault decisions waiting", faults.length, `${critical} Critical · oldest ${fmtDays(oldest(faults)).toLowerCase()}`, "var(--danger)")}
        {tile("reports", "Reports waiting for the Supervisor", reports.length, `To review or close · oldest ${fmtDays(oldest(reports)).toLowerCase()}`, "var(--accent-blue, #2f6fed)")}
        {tile("unnamed", "Not named to a person", unnamed.length, "Fault decisions any reviewer with authority can take", "var(--warn)")}
        {tile("late", "Waiting over 7 days", late.length, late.length ? `Oldest ${oldest(late)} days` : "Nothing waiting that long", "var(--text-soft)")}
      </div>

      <FlowSteps
        title="Where things are waiting in the review flow"
        steps={[
          { label: "Supervisor review of the report", value: supReview.length, sub: supReview.length ? `oldest ${fmtDays(oldest(supReview)).toLowerCase()}` : "nothing waiting", color: "var(--accent-blue, #2f6fed)", onClick: () => setPick((v) => (v === "reports" ? null : "reports")), active: pick === "reports" },
          { label: "Fault decision", value: faults.length, sub: faults.length ? `${critical} Critical · oldest ${fmtDays(oldest(faults)).toLowerCase()}` : "nothing waiting", color: "var(--danger)", onClick: () => setPick((v) => (v === "faults" ? null : "faults")), active: pick === "faults" },
          { label: "Supervisor to close the report", value: supClose.length, sub: supClose.length ? `oldest ${fmtDays(oldest(supClose)).toLowerCase()}` : "nothing waiting", color: "var(--success)", onClick: () => setPick((v) => (v === "reports" ? null : "reports")), active: false },
        ]}
        note="A report is reviewed by the Supervisor, its Moderate / Critical faults go for a decision, then the Supervisor closes it. Click a stage to list what is waiting there."
      />

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>Waiting with whom, and for how long</h3></div>
        {byWho.length === 0 ? (
          <p className="mrid-note">Nothing is waiting for a decision.</p>
        ) : (
          <>
            <div style={{ width: "100%", height: Math.max(150, byWho.length * 44 + 60) }}>
              <ResponsiveContainer>
                <BarChart data={byWho} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--text-soft)", fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={260} tick={{ fill: "var(--text)", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  {AGES.map((a) => (
                    <Bar
                      key={a.key}
                      dataKey={a.key}
                      name={a.label}
                      stackId="age"
                      fill={a.color}
                      maxBarSize={26}
                      cursor="pointer"
                      onClick={(_, i) => {
                        const r = byWho[i];
                        if (r) { setWhoPick(r.name); setAgePick(a.key); }
                      }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mrid-legend">
              {AGES.map((a) => (
                <span key={a.key}><i style={{ background: a.color }} />{a.label}</span>
              ))}
            </div>
            <p className="mrid-note" style={{ textAlign: "center" }}>Click a bar to list those items.</p>
          </>
        )}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>{picking ? "Selected items" : "Everything waiting, longest first"} ({list.length})</h3></div>
        {picking && (
          <div className="mrid-drill">
            {pick && <span className="mrid-chip"><b>{{ faults: "Fault decisions", reports: "Reports for the Supervisor", unnamed: "Not named to a person", late: "Over 7 days" }[pick]}</b></span>}
            {whoPick && <span className="mrid-chip">Waiting with: <b>{whoPick}</b></span>}
            {agePick && <span className="mrid-chip">Waiting: <b>{AGES.find((a) => a.key === agePick)!.label}</b></span>}
            <button type="button" className="ghost mrid-clear" onClick={clearAll}>✕ Clear selection</button>
          </div>
        )}
        {list.length === 0 ? (
          <p className="mrid-note">Nothing matches this selection.</p>
        ) : (
          <div className="mrid-table-wrap">
            <table className="mrid-table">
              <thead>
                <tr><th>Waiting with</th><th>Waiting for</th><th>Unit</th><th>Item / issue</th><th>Waiting since</th><th>Waiting</th><th>Reminders</th><th>MR-I report</th></tr>
              </thead>
              <tbody>
                {list.map((w) => {
                  const d = daysWaiting(w);
                  const sev = w.severity ? sevKey(w.severity) : null;
                  return (
                    <tr key={`${w.kind}-${w.approval_id ?? w.report_id}`}>
                      <td><b>{waitingWith(w)}</b>{w.kind === "fault" && w.assigned_to_name ? <div className="mrid-soft">{w.required_authority}</div> : null}</td>
                      <td>
                        {sev ? (
                          <span className="mrid-sev"><i className="mrid-dot" style={{ background: SEVERITIES.find((s) => s.key === sev)!.color }} />{sev} fault decision</span>
                        ) : (
                          w.step
                        )}
                      </td>
                      <td><b>{unitOf.get(w.asset_id)?.asset_code ?? w.asset_id}</b>{w.component ? <span className="mrid-soft"> · {w.component}</span> : null}{w.submitted_by ? <div className="mrid-soft">Submitted by {w.submitted_by}</div> : null}</td>
                      <td>{w.item ? <b>{w.item}</b> : null}{w.issue_details ? <div className="mrid-soft">{w.issue_details}</div> : null}</td>
                      <td>{fmtDate(w.waiting_since)}</td>
                      <td className={d > 7 ? "mrid-over" : undefined}>{fmtDays(d)}</td>
                      <td className="mrid-soft">{w.reminders ? `${w.reminders} · last ${fmtDate(w.last_reminder_at)}${w.last_reminder_by ? ` by ${w.last_reminder_by}` : ""}` : "—"}</td>
                      <td><PreviewButton reportId={w.report_id} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
