import { useMemo, useState, type ReactNode } from "react";
import { fmtDate, type DashboardFilters } from "../hooks/useMriDashboards";
import { useCurrentUser } from "../../../lib/currentUser";
import ExportMenu, { type ExportRow } from "./ExportMenu";
import { PreviewButton } from "./ReportPreview";
import { DrillChips } from "./kit";
import { Sparkline, StoryStrip, type StoryLine } from "./fluid";

// Shared view for the User Analytics dashboards: one row per person with neutral measures,
// the team average for comparison, a 12-month sparkline, and a drill-down to their records.
// Administrators and the Maintenance Manager / FSM see everyone (in their countries);
// everyone else sees only their own figures.

export interface UserItem { key: string; date: number | null; unit: string; what: ReactNode; detail?: ReactNode; took?: string; waiting?: boolean; reportId?: number; exportWhat?: string }
export interface Person { name: string; values: Record<string, number | null>; spark: number[]; items: UserItem[] }
export interface UserCol { key: string; label: string; fmt?: (v: number | null) => string; total?: "sum" | "avg" }
export interface UserTile { label: string; value: ReactNode; sub: ReactNode; color: string; spark?: number[] }

const SEE_ALL = ["Administrator", "Maintenance Manager / FSM"];
export const sameName = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Who is viewing, and whether they may see other people's figures. */
export function useUserScope() {
  const { user } = useCurrentUser();
  return { me: user?.name ?? null, seeAll: !!user && SEE_ALL.includes(user.role) };
}

/** Groups records by person name (case and spaces ignored). */
export function byPerson<T>(list: T[], nameOf: (x: T) => string | null | undefined) {
  const m = new Map<string, { name: string; list: T[] }>();
  for (const x of list) {
    const n = nameOf(x)?.trim();
    if (!n) continue;
    const k = n.toLowerCase();
    const e = m.get(k) ?? { name: n, list: [] };
    e.list.push(x);
    m.set(k, e);
  }
  return m;
}

export const fmtNum = (v: number | null) => (v == null ? "—" : String(Math.round(v * 10) / 10));
export const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
export const fmtDays = (v: number | null) => (v == null ? "—" : v < 1 ? `${Math.round(v * 24)} h` : `${Math.round(v * 10) / 10} d`);

export default function UserBoard({ dashboardNo, title, filters, intro, people, columns, tiles, story, itemsTitle, personLabel }: {
  dashboardNo: number; title: string; filters: DashboardFilters; intro: ReactNode; people: Person[]; columns: UserCol[];
  tiles: UserTile[]; story: StoryLine[]; itemsTitle: string; personLabel: string;
}) {
  const { me, seeAll } = useUserScope();
  const [pick, setPick] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: columns[0].key, dir: -1 });

  const visible = useMemo(() => (seeAll ? people : people.filter((p) => sameName(p.name, me))), [people, seeAll, me]);
  const sorted = [...visible].sort((a, b) => ((a.values[sort.key] ?? -Infinity) - (b.values[sort.key] ?? -Infinity)) * sort.dir || a.name.localeCompare(b.name));
  const teamAvg = (c: UserCol) => {
    const l = people.map((p) => p.values[c.key]).filter((v): v is number => v != null);
    return l.length ? l.reduce((x, y) => x + y, 0) / l.length : null;
  };
  const person = pick ? visible.find((p) => p.name === pick) : undefined;
  const fmt = (c: UserCol, v: number | null) => (c.fmt ?? fmtNum)(v);

  const exportTables = () => [
    { name: "People", rows: sorted.map((p) => Object.fromEntries([[personLabel, p.name], ...columns.map((c) => [c.label, p.values[c.key] == null ? null : Math.round(p.values[c.key]! * 10) / 10])]) as ExportRow) },
    { name: "Team average", rows: [Object.fromEntries(columns.map((c) => [c.label, teamAvg(c) == null ? null : Math.round(teamAvg(c)! * 10) / 10])) as ExportRow] },
    ...(person ? [{ name: "Records", rows: person.items.map((i) => ({ [personLabel]: person.name, Date: fmtDate(i.date), Unit: i.unit, What: i.exportWhat ?? (typeof i.what === "string" ? i.what : ""), Took: i.took ?? null, Waiting: i.waiting ? "Yes" : "No", Report: i.reportId ? `#${i.reportId}` : null })) }] : []),
  ];

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
        <p className="mrid-note">{intro}</p>
        <ExportMenu dashboardNo={dashboardNo} title={title} filters={filters} tables={exportTables} />
      </div>

      {!seeAll && (
        <div className="mrid-scope" style={{ marginTop: 0 }}>
          <span className="mrid-chip">You see <b>your own figures</b> and the team average. The Maintenance Manager / FSM and Administrators see the whole team.</span>
        </div>
      )}

      {seeAll && <StoryStrip lines={story} />}

      <div className="mrid-kpis">
        {tiles.map((t) => (
          <div key={t.label} className="mrid-kpi" style={{ ["--kpi" as string]: t.color }}>
            <div className="mrid-kpi-head"><span>{t.label}</span></div>
            <div className="mrid-kpi-value">{t.value}</div>
            {t.spark ? <Sparkline values={t.spark} color={t.color} title={`${t.label} by month`} /> : null}
            <div className="mrid-kpi-sub">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="mrid-panel">
        <div className="mrid-panel-head"><h3>{seeAll ? `${personLabel}s` : "Your figures"} ({sorted.length})</h3></div>
        {sorted.length === 0 ? (
          <p className="mrid-note">{seeAll ? "No records for this period." : "You have no records in this period."}</p>
        ) : (
          <div className="mrid-table-wrap">
            <table className="mrid-table">
              <thead>
                <tr>
                  <th>{personLabel}</th>
                  {columns.map((c) => (
                    <th key={c.key} className="mrid-sortable" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
                      {c.label}{sort.key === c.key ? (sort.dir === -1 ? " ▾" : " ▴") : ""}
                    </th>
                  ))}
                  <th style={{ width: 130 }}>Last 12 months</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.name} className="mrid-click" onClick={() => setPick((v) => (v === p.name ? null : p.name))} style={pick === p.name ? { outline: "2px solid var(--accent)" } : undefined}>
                    <td><b>{p.name}</b>{sameName(p.name, me) ? <span className="mrid-soft"> (you)</span> : null}</td>
                    {columns.map((c) => <td key={c.key}>{fmt(c, p.values[c.key])}</td>)}
                    <td><Sparkline values={p.spark} color="var(--accent-blue, #2f6fed)" height={22} title={`${p.name}, by month`} /></td>
                  </tr>
                ))}
                <tr className="mrid-team-row">
                  <td>Team average</td>
                  {columns.map((c) => <td key={c.key}>{fmt(c, teamAvg(c))}</td>)}
                  <td />
                </tr>
              </tbody>
            </table>
            <p className="mrid-note">Click a column to sort, or a name to see the records behind the figures. Figures show workload and response times; field conditions, parts and travel also affect them.</p>
          </div>
        )}
      </div>

      {person && (
        <div className="mrid-panel">
          <div className="mrid-panel-head"><h3>{itemsTitle}: {person.name} ({person.items.length})</h3></div>
          <DrillChips onClear={() => setPick(null)} chips={[<>{personLabel}: <b>{person.name}</b></>]} />
          {person.items.length === 0 ? <p className="mrid-note">No records.</p> : (
            <div className="mrid-table-wrap">
              <table className="mrid-table">
                <thead><tr><th>Date</th><th>Unit</th><th>What</th><th>Detail</th><th>Took</th><th>MR-I report</th></tr></thead>
                <tbody>
                  {[...person.items].sort((a, b) => Number(!!b.waiting) - Number(!!a.waiting) || (b.date ?? 0) - (a.date ?? 0)).map((i) => (
                    <tr key={i.key}>
                      <td>{fmtDate(i.date)}</td>
                      <td><b>{i.unit}</b></td>
                      <td>{i.what}{i.waiting ? <div className="mrid-over">Waiting now</div> : null}</td>
                      <td className="mrid-soft">{i.detail ?? "—"}</td>
                      <td>{i.took ?? "—"}</td>
                      <td>{i.reportId ? <PreviewButton reportId={i.reportId} /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
