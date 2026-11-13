import { Fragment, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TagLamp } from "../../../components/Instruments";
import type { DashboardFilters, MriDashboardAsset } from "../hooks/useMriDashboards";
import ExportMenu, { type ExportRow } from "./ExportMenu";
import { UnitReports } from "./ReportPreview";
import { monthsFor, nowSecs, useMore } from "./kit";
import { Sparkline, StoryStrip, TrendDelta, type StoryLine } from "./fluid";
import { HealthStream, useHealthSeries } from "./health";

// Dashboard 1: Fleet status by tag colour.
// Current tag of every active unit the viewer may see (after the country / service line /
// equipment type filters). The tag is a "now" value, so the period filter does not apply.

type Tag = "Green" | "Yellow" | "Red" | "None";
const TAGS: { key: Tag; label: string; plain: string; color: string }[] = [
  { key: "Green", label: "Green", plain: "Ready for service", color: "var(--success)" },
  { key: "Yellow", label: "Yellow", plain: "Under repair", color: "var(--tag-yellow, #d4a017)" },
  { key: "Red", label: "Red", plain: "Not safe to use", color: "var(--danger)" },
  { key: "None", label: "Not tagged", plain: "No inspection result yet", color: "var(--text-soft)" },
];

export function tagOf(a: MriDashboardAsset): Tag {
  const t = (a.tag_status ?? "").trim();
  return t === "Green" || t === "Yellow" || t === "Red" ? t : "None";
}

export interface FleetCounts {
  total: number;
  inactive: number;
  by: Record<Tag, number>;
}

export function fleetCounts(assets: MriDashboardAsset[]): FleetCounts {
  const by: Record<Tag, number> = { Green: 0, Yellow: 0, Red: 0, None: 0 };
  let inactive = 0;
  for (const a of assets) {
    if (!a.active) {
      inactive++;
      continue;
    }
    by[tagOf(a)]++;
  }
  return { total: by.Green + by.Yellow + by.Red + by.None, inactive, by };
}

/** Small summary for the dashboard card. */
export function FleetStatusMini({ assets }: { assets: MriDashboardAsset[] }) {
  const c = fleetCounts(assets);
  return (
    <div className="mrid-mini">
      {TAGS.filter((t) => t.key !== "None" || c.by.None > 0).map((t) => (
        <span key={t.key} className="mrid-mini-item" title={`${t.label}: ${t.plain}`}>
          <TagLamp status={t.key === "None" ? null : t.key} size={12} /> <b>{c.by[t.key]}</b>
        </span>
      ))}
    </div>
  );
}

type GroupBy = "country" | "service_line" | "asset_type";
const GROUP_LABEL: Record<GroupBy, string> = { country: "Country", service_line: "Service line", asset_type: "Equipment type" };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export default function FleetStatus({ assets, filters }: { assets: MriDashboardAsset[]; filters: DashboardFilters }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("country");
  const [showUntagged, setShowUntagged] = useState(false);
  // Drill-down: click a tag tile and/or a bar to list those units, then a unit to see its reports.
  const [tagPick, setTagPick] = useState<Tag | null>(null);
  const [groupPick, setGroupPick] = useState<string | null>(null);
  const counts = fleetCounts(assets);
  const active = assets.filter((a) => a.active);
  // ---- fluid layer: tag colours at each of the last 12 month-ends, from the tag history ----
  const { tag_changes } = useMore(assets);
  const monthPoints = useMemo(() => {
    const now = new Date();
    return monthsFor(new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)).map((m) => ({ name: m.name, t: Math.min(m.e, nowSecs()) }));
  }, []);
  const history = useHealthSeries(assets, tag_changes, monthPoints);
  const prevH = history.length > 1 ? history[history.length - 2] : null;

  const groups = useMemo(() => {
    const m = new Map<string, Record<Tag, number>>();
    for (const a of active) {
      const k = ((a[groupBy] as string | null) ?? "").trim() || "Not set";
      const row = m.get(k) ?? { Green: 0, Yellow: 0, Red: 0, None: 0 };
      row[tagOf(a)]++;
      m.set(k, row);
    }
    return [...m.entries()]
      .map(([name, r]) => ({ name, ...r, total: r.Green + r.Yellow + r.Red + r.None }))
      .sort((a, b) => b.Red - a.Red || b.Yellow - a.Yellow || b.total - a.total || a.name.localeCompare(b.name));
  }, [active, groupBy]);

  const notReady = active
    .filter((a) => tagOf(a) === "Red" || tagOf(a) === "Yellow")
    .sort((a, b) => (tagOf(a) === tagOf(b) ? a.asset_code.localeCompare(b.asset_code) : tagOf(a) === "Red" ? -1 : 1));
  const untagged = active.filter((a) => tagOf(a) === "None");
  const groupKey = (a: MriDashboardAsset) => ((a[groupBy] as string | null) ?? "").trim() || "Not set";
  const drilling = tagPick != null || groupPick != null;
  const drilled = active
    .filter((a) => (tagPick == null || tagOf(a) === tagPick) && (groupPick == null || groupKey(a) === groupPick))
    .sort((a, b) => TAGS.findIndex((t) => t.key === tagOf(b)) - TAGS.findIndex((t) => t.key === tagOf(a)) || a.asset_code.localeCompare(b.asset_code));
  const tagLabel = (t: Tag) => TAGS.find((x) => x.key === t)!.label;

  const unitRow = (a: MriDashboardAsset): ExportRow => ({
    Tag: tagOf(a) === "None" ? "Not tagged" : tagOf(a),
    Unit: a.asset_code,
    Description: a.asset_description,
    Country: a.country,
    "Service line": a.service_line,
    "Equipment type": a.asset_type,
    Reason: a.tag_reason,
  });
  const story: StoryLine[] = [];
  {
    const notReadyN = counts.by.Red + counts.by.Yellow;
    if (notReadyN) {
      const worstGroup = groups.find((g) => g.Red + g.Yellow > 0);
      story.push({ tone: counts.by.Red ? "attention" : "info", text: <><b>{notReadyN}</b> of {counts.total} units are not ready ({counts.by.Red} Red, {counts.by.Yellow} Yellow){worstGroup ? <>; most in <b>{worstGroup.name}</b> ({worstGroup.Red + worstGroup.Yellow})</> : null}.</> });
    } else story.push({ tone: "better", text: <>Every tagged unit is Green.</> });
    if (prevH) {
      const nowNot = counts.by.Red + counts.by.Yellow, was = prevH.Red + prevH.Yellow;
      if (nowNot !== was) story.push({ tone: nowNot > was ? "worse" : "better", text: <>Units not ready {nowNot > was ? "rose" : "fell"} from {was} to <b>{nowNot}</b> since the end of {prevH.name}.</> });
    }
    if (counts.by.None) story.push({ tone: "info", text: <>{counts.by.None} unit{counts.by.None === 1 ? " has" : "s have"} no tag yet (no MR-I result).</> });
  }

  const exportTables = () => [
    {
      name: "Summary",
      rows: TAGS.map((t) => ({ Tag: t.label, Meaning: t.plain, Units: counts.by[t.key], "Percent of fleet": pct(counts.by[t.key], counts.total) })),
    },
    {
      name: `By ${GROUP_LABEL[groupBy].toLowerCase()}`,
      rows: groups.map((g) => ({ [GROUP_LABEL[groupBy]]: g.name, Green: g.Green, Yellow: g.Yellow, Red: g.Red, "Not tagged": g.None, Total: g.total })),
    },
    { name: "Units not ready", rows: notReady.map(unitRow) },
    { name: "Units without a tag", rows: untagged.map(unitRow) },
    ...(drilling ? [{ name: "Selected units", rows: drilled.map(unitRow) }] : []),
  ];

  if (counts.total === 0) {
    return <div className="empty">No active units match the filters.</div>;
  }

  return (
    <div className="mrid-dash">
      <div className="mrid-dash-bar">
      <p className="mrid-note">
        Current tag of each unit. This dashboard shows the situation <b>now</b>, so the period filter does not change it.
        {counts.inactive > 0 && <> {counts.inactive} inactive unit{counts.inactive === 1 ? " is" : "s are"} left out.</>}
      </p>
      <ExportMenu dashboardNo={1} title="Fleet status by tag colour" filters={filters} tables={exportTables} periodApplies={false} />
      </div>

      <StoryStrip lines={story} />

      <div className="mrid-kpis">
        {TAGS.map((t) => (
          <button
            type="button"
            key={t.key}
            className={`mrid-kpi${tagPick === t.key ? " is-on" : ""}`}
            style={{ ["--kpi" as string]: t.color }}
            onClick={() => setTagPick((v) => (v === t.key ? null : t.key))}
            title={`List the ${t.label} units`}
          >
            <div className="mrid-kpi-head">
              <TagLamp status={t.key === "None" ? null : t.key} size={16} />
              <span>{t.label}</span>
            </div>
            <div className="mrid-kpi-value">{counts.by[t.key]}</div>
            {t.key !== "None" && (
              <>
                <TrendDelta now={counts.by[t.key]} prev={prevH ? prevH[t.key] : null} lowerIsBetter={t.key !== "Green"} label={prevH ? `vs end of ${prevH.name}` : ""} />
                <Sparkline values={history.map((h) => h[t.key])} color={t.color} title={`${t.label} units at each month-end`} />
              </>
            )}
            <div className="mrid-kpi-sub">
              {pct(counts.by[t.key], counts.total)}% of {counts.total} · {t.plain}
            </div>
            <div className="mrid-kpi-hint">{tagPick === t.key ? "Showing these units ↓" : "Click to list units"}</div>
          </button>
        ))}
      </div>

      <HealthStream
        title="Tag colour over the last 12 months"
        data={history}
        note="Share of active units in each tag colour at the end of each month (today for this month). Hover for the number of units."
      />

      <div className="mrid-panel">
        <div className="mrid-panel-head">
          <h3>Tag colour by {GROUP_LABEL[groupBy].toLowerCase()}</h3>
          <label className="mrid-field mrid-inline">
            <span>Group by</span>
            <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value as GroupBy); setGroupPick(null); }}>
              {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                <option key={g} value={g}>{GROUP_LABEL[g]}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ width: "100%", height: Math.max(160, groups.length * 44 + 70) }}>
          <ResponsiveContainer>
            <BarChart data={groups} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--text-soft)", fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fill: "var(--text)", fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: "var(--accent-soft)" }}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              {TAGS.map((t) => (
                <Bar
                  key={t.key}
                  dataKey={t.key}
                  name={t.label}
                  stackId="tag"
                  fill={t.color}
                  maxBarSize={26}
                  cursor="pointer"
                  onClick={(_, i) => {
                    const g = groups[i];
                    if (g) { setGroupPick(g.name); setTagPick(t.key); }
                  }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mrid-legend">
          {TAGS.map((t) => (
            <span key={t.key}><i style={{ background: t.color }} />{t.label}</span>
          ))}
        </div>
        <p className="mrid-note" style={{ textAlign: "center" }}>Click a coloured bar to list those units.</p>
      </div>

      {drilling && (
        <div className="mrid-panel" id="mrid-drill">
          <div className="mrid-panel-head"><h3>Selected units ({drilled.length})</h3></div>
          <div className="mrid-drill">
            {tagPick && <span className="mrid-chip">Tag: <b>{tagLabel(tagPick)}</b></span>}
            {groupPick && <span className="mrid-chip">{GROUP_LABEL[groupBy]}: <b>{groupPick}</b></span>}
            <button type="button" className="ghost mrid-clear" onClick={() => { setTagPick(null); setGroupPick(null); }}>✕ Clear selection</button>
          </div>
          {drilled.length === 0 ? <p className="mrid-note">No units match this selection.</p> : <UnitTable rows={drilled} />}
        </div>
      )}

      <div className="mrid-panel">
        <div className="mrid-panel-head">
          <h3>Units not ready ({notReady.length})</h3>
        </div>
        {notReady.length === 0 ? (
          <p className="mrid-note">Every tagged unit is Green.</p>
        ) : (
          <UnitTable rows={notReady} />
        )}
        {untagged.length > 0 && (
          <>
            <button type="button" className="ghost mrid-more" onClick={() => setShowUntagged((v) => !v)}>
              {showUntagged ? "Hide" : "Show"} units without a tag ({untagged.length})
            </button>
            {showUntagged && <UnitTable rows={untagged} />}
          </>
        )}
      </div>
    </div>
  );
}

function UnitTable({ rows }: { rows: MriDashboardAsset[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <div className="mrid-table-wrap">
      <table className="mrid-table">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Unit</th>
            <th>Country</th>
            <th>Service line</th>
            <th>Equipment type</th>
            <th>Reason</th>
            <th>MR-I reports</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <Fragment key={a.id}>
            <tr className="mrid-click" onClick={() => setOpenId((v) => (v === a.id ? null : a.id))}>
              <td><TagLamp status={tagOf(a) === "None" ? null : tagOf(a)} size={14} showText /></td>
              <td><b>{a.asset_code}</b>{a.asset_description ? <span className="mrid-soft"> · {a.asset_description}</span> : null}</td>
              <td>{a.country ?? "—"}</td>
              <td>{a.service_line ?? "—"}</td>
              <td>{a.asset_type ?? "—"}</td>
              <td className="mrid-soft">{a.tag_reason ?? "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}><span className="mrid-caret">{openId === a.id ? "▾" : "▸"}</span> {openId === a.id ? "Hide" : "Show"}</td>
            </tr>
            {openId === a.id && (
              <tr className="mrid-expand">
                <td colSpan={7}><UnitReports assetId={a.id} /></td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
