// Option B look for the Administration screens: plain names, small 3D tiles in the sidebar, and a
// "What you'll do here" box with a 3D guide on every screen. Display only — permissions, saving and
// every screen's behaviour stay exactly as they are.

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AdminSection, GroupId } from "./Administration";
import { IsoShelfGuide } from "../mri-template-builder/TemplateIsoGuide";

export type Glyph = "people" | "shield" | "list" | "clipboard" | "unit" | "folders" | "database" | "eraser" | "flame" | "archive" | "report" | "lifebuoy" | "gauge";

export interface AdminMeta {
  name: string;   // plain name
  tech: string;   // original name, shown underneath
  title: string;  // plain question used as the screen title
  explain: string;
  todo: string[];
  glyph: Glyph;
  soon?: boolean;
}

export const GROUP_NAMES: Record<GroupId, string> = {
  users: "People",
  references: "Lists & libraries",
  "data-tools": "Data tools",
  "mr-templates": "Report templates",
  diagnostics: "Help & diagnostics",
};

export const ADMIN_META: Record<AdminSection, AdminMeta> = {
  users: { name: "People", tech: "Users", glyph: "people", title: "Who can use MMS?",
    explain: "Everyone who can sign in to MMS. Give each person a role, and the countries whose units they can see.",
    todo: ["Type a name and email, pick a role, then add the person", "Click “Countries” to choose which countries they can see", "Switch someone off instead of deleting them — their reports stay"] },
  roles: { name: "Roles & permissions", tech: "Roles", glyph: "shield", title: "What can each role do?",
    explain: "Each person gets one role. A role is a set of switches that decide what they can see and do. Changes apply to everyone with that role.",
    todo: ["Pick a role", "Turn switches on or off — they save straight away", "Use “All on / All off” for a whole area"] },
  lookups: { name: "Drop-down lists", tech: "Lookups", glyph: "list", title: "What can people pick from?",
    explain: "These are the choices in drop-down boxes across MMS — like clients, countries and service lines. Add a choice here and it appears everywhere.",
    todo: ["Pick a list", "Add choices one by one, or upload / paste many from Excel", "Switch a choice off to hide it without losing old reports"] },
  "checklist-bank": { name: "Checklist Bank", tech: "Checklist Databank", glyph: "clipboard", title: "Which checks can go on templates?",
    explain: "The library of every check (like “Hydraulic hoses — no leaks”). Templates pick their checks from here, so each check is written once.",
    todo: ["Type a code and a short description, then add the check", "Or upload many checks at once from Excel", "Edit a check here and every template using it updates"] },
  "asset-types": { name: "Kinds of units", tech: "Asset Types", glyph: "unit", title: "What kinds of units do we have?",
    explain: "Every unit in the Asset Registry is one of these kinds. Each kind gets its own MR-I template and an icon people recognise.",
    todo: ["Type the kind of unit and add it", "Click the icon button to choose a picture for it", "Switch a kind off if you no longer use it"] },
  "checklist-sections": { name: "Check groups", tech: "Checklist Sections", glyph: "folders", title: "How are checks grouped on reports?",
    explain: "Groups put related checks together on a report, like “Power end” or “Safety”. Template builders choose a group for each check.",
    todo: ["Type a group name and add it", "Or upload many groups from Excel", "Rename a group and every template shows the new name"] },
  "data-browser": { name: "Look at the data", tech: "Data Browser", glyph: "database", title: "What's stored in MMS?",
    explain: "A read-only view of the tables behind MMS. Use it to check a record or answer a question.",
    todo: ["Pick what you want to look at", "Search across every column", "Group the rows to see totals"] },
  "data-removal": { name: "Remove records", tech: "Removal", glyph: "eraser", soon: true, title: "Remove a wrong record",
    explain: "This will let an administrator remove a single record that was entered by mistake, with a reason kept on file.",
    todo: ["Not ready yet — for now, ask the MMS team"] },
  "data-purge": { name: "Clear old data", tech: "Purging", glyph: "flame", title: "Clear old data for good",
    explain: "Permanently removes old reports and their files to keep MMS fast. Choose exactly what to clear, check it, then confirm.",
    todo: ["Choose the country, service line, kind of unit or unit", "Check what will be removed", "Save a backup first, then confirm"] },
  "data-backup": { name: "Back up & restore", tech: "Backup", glyph: "archive", title: "Keep a safe copy of everything",
    explain: "A backup is one file holding all of MMS. Save one often. Restoring puts everything back to how it was when that file was saved.",
    todo: ["Save a backup file and keep it somewhere safe", "Only restore if something has gone wrong", "Save a backup before restoring, just in case"] },
  "mri-template": { name: "MR-I templates", tech: "MR-I", glyph: "report", title: "Which MR-I forms do inspectors fill in?",
    explain: "Each kind of unit gets one MR-I template. It decides what inspectors fill in on an MR-I report. Each tower shows the parts of the form: green looks complete, orange is worth a look, grey is not filled in yet.",
    todo: ["Type a name, pick the kind of unit, then click “+ Make template”", "Click a template card to open it and build it step by step", "Only templates “In use” can be picked by inspectors — the status button changes it"] },
  "mrii-template": { name: "MR-II templates", tech: "MR-II", glyph: "report", soon: true, title: "MR-II templates",
    explain: "MR-II is the deeper, interval-based maintenance check. Its templates will be built the same way as MR-I.",
    todo: ["Not ready yet"] },
  "mriii-template": { name: "MR-III templates", tech: "MR-III", glyph: "report", soon: true, title: "MR-III templates",
    explain: "MR-III is the major overhaul check. Its templates will be built the same way as MR-I.",
    todo: ["Not ready yet"] },
  "support-viewer": { name: "Open a support bundle", tech: "Support viewer", glyph: "lifebuoy", title: "Look inside a support bundle",
    explain: "When someone has a problem they can send a support bundle from Help. Open it here to see what happened on their PC.",
    todo: ["Choose the .zip they sent", "Read the summary and the suggested fix", "Open the details only if you need them"] },
};

const GLYPH_PATHS: Record<Glyph, string[]> = {
  people: ["M10 18a6 6 0 1 0 12 0a6 6 0 1 0-12 0", "M2 44c2-10 10-14 14-14s12 4 14 14", "M30 14a5 5 0 1 1 6 10", "M34 30c6 1 10 6 12 14"],
  shield: ["M24 2l18 6v12c0 12-8 20-18 24C14 40 6 32 6 20V8z", "M16 24l6 6 11-12"],
  list: ["M14 8h28", "M14 24h28", "M14 40h28", "M4 8h2", "M4 24h2", "M4 40h2"],
  clipboard: ["M10 6h28v40H10z", "M18 2h12v8H18z", "M16 20l4 4 8-8", "M16 34h16"],
  unit: ["M4 18l20-10 20 10-20 10z", "M4 18v16l20 10V28", "M44 18v16L24 44"],
  folders: ["M4 10h14l4 5h22v25H4z", "M4 20h40"],
  database: ["M6 10c0-8 36-8 36 0s-36 8-36 0", "M6 10v28c0 8 36 8 36 0V10", "M6 24c0 8 36 8 36 0"],
  eraser: ["M8 32l18-18 14 14-12 12H16z", "M20 40h22"],
  flame: ["M24 4c4 10 14 14 14 26a14 14 0 0 1-28 0c0-7 4-10 6-14 2 4 4 6 6 6-2-6 0-12 2-18z"],
  archive: ["M4 8h40v10H4z", "M8 18v24h32V18", "M18 28h12"],
  report: ["M10 4h22l8 8v32H10z", "M32 4v8h8", "M16 22h18", "M16 30h18", "M16 38h10"],
  gauge: ["M6 34a18 18 0 0 1 36 0", "M24 34l9-12", "M12 24l-3-2", "M24 16v-4", "M36 24l3-2", "M18 40h12"],
  lifebuoy: ["M24 4a20 20 0 1 0 0.01 0", "M24 14a10 10 0 1 0 0.01 0", "M10 10l7 7", "M38 10l-7 7", "M10 38l7-7", "M38 38l-7-7"],
};

// ------------------------------------------------------------------ hints shared with the sidebar
/** A key number shown in the collapsed banner. Display only. */
export interface BannerKpi { label: string; value: string | number; tone?: Tone }
interface HintsCtx {
  hints: Partial<Record<AdminSection, string[]>>; setHints: (s: AdminSection, h: string[]) => void;
  kpis: Partial<Record<AdminSection, BannerKpi[]>>; setKpis: (s: AdminSection, k: BannerKpi[]) => void;
}
const AdminHintsContext = createContext<HintsCtx>({ hints: {}, setHints: () => {}, kpis: {}, setKpis: () => {} });
const kpiKey = (k: BannerKpi[]) => k.map((x) => `${x.label}=${x.value}=${x.tone ?? ""}`).join("|");

export function AdminHintsProvider({ children }: { children: ReactNode }) {
  const [hints, setAll] = useState<Partial<Record<AdminSection, string[]>>>({});
  const [kpis, setAllKpis] = useState<Partial<Record<AdminSection, BannerKpi[]>>>({});
  const value = useMemo<HintsCtx>(() => ({
    hints,
    setHints: (s, h) => setAll((prev) => ((prev[s] ?? []).join("\n") === h.join("\n") ? prev : { ...prev, [s]: h })),
    kpis,
    setKpis: (s, k) => setAllKpis((prev) => (kpiKey(prev[s] ?? []) === kpiKey(k) ? prev : { ...prev, [s]: k })),
  }), [hints, kpis]);
  return <AdminHintsContext.Provider value={value}>{children}</AdminHintsContext.Provider>;
}

export function useAdminHints() { return useContext(AdminHintsContext).hints; }

/** A screen reports its reminders (plain sentences); the sidebar shows the count. Display only. */
export function useReportAdminHints(section: AdminSection, hints: string[]) {
  const { setHints } = useContext(AdminHintsContext);
  const key = hints.join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setHints(section, hints); }, [section, key]);
}

/** A screen reports the key numbers shown when its banner is folded away. Display only. */
export function useReportAdminKpis(section: AdminSection, kpis: BannerKpi[]) {
  const { setKpis } = useContext(AdminHintsContext);
  const key = kpiKey(kpis);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setKpis(section, kpis); }, [section, key]);
}

// ------------------------------------------------------------------ banner that folds away
const BANNER_DELAY_MS = 5000;
const BANNER_SMALL = 0.2;

/** The "What you'll do here" banner: full size when the screen opens, folded to 20% of its height after
 *  5 seconds, showing the screen's key numbers. Pointing at it (or tabbing to it) opens it again. */
export function CollapsingBanner({ resetKey, kpis, children, label }: { resetKey: string; kpis: BannerKpi[]; children: ReactNode; label: string }) {
  const [folded, setFolded] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [fullH, setFullH] = useState<number | null>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const leaveT = useRef<number | undefined>(undefined);
  useEffect(() => {
    setFolded(false);
    const t = window.setTimeout(() => setFolded(true), BANNER_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [resetKey]);
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setFullH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => window.clearTimeout(leaveT.current), []);
  const small = folded && !hover && !focus;
  const smallH = Math.max(56, Math.round((fullH ?? 280) * BANNER_SMALL));
  return (
    <div
      className={`adm-banner${small ? " is-small" : ""}`}
      style={{ height: small ? smallH : fullH ?? "auto" }}
      tabIndex={0}
      role="region"
      aria-label={small ? `${label}: key numbers. Point here or press Tab to open the help` : label}
      onMouseEnter={() => { window.clearTimeout(leaveT.current); setHover(true); }}
      onMouseLeave={() => { leaveT.current = window.setTimeout(() => setHover(false), 250); }}
      onFocus={() => setFocus(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false); }}
    >
      <div ref={innerRef} className="adm-banner-full" aria-hidden={small}>{children}</div>
      <div className="adm-banner-kpis" aria-hidden={!small} style={{ height: smallH }}>
        {kpis.length === 0 && <span className="adm-banner-none">{label}</span>}
        {kpis.map((k, i) => (
          <span key={i} className={`adm-kpi is-${k.tone ?? "blue"}`}>
            <RowTile tone={k.tone ?? "blue"} />
            <b>{k.value}</b>
            <span>{k.label}</span>
          </span>
        ))}
        <span className="adm-banner-more" aria-hidden="true">Point here for help ▾</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pieces
export type TileState = "current" | "ok" | "look" | "soon";

export function AdminTile({ state }: { state: TileState }) {
  const top = state === "current" ? "var(--tig-blue-soft)" : state === "look" ? "var(--tig-look-soft)" : state === "soon" ? "var(--tig-hole)" : "var(--tig-ok-soft)";
  return (
    <svg className="adm-tile" width="30" height="19" viewBox="0 0 64 40" aria-hidden="true">
      <polygon points="2,16 32,30 32,36 2,22" className="tig-slab-l" />
      <polygon points="32,30 62,16 62,22 32,36" className="tig-slab-r" />
      <polygon points="32,2 62,16 32,30 2,16" fill={top} stroke={state === "current" ? "var(--tig-blue)" : "none"} strokeWidth={2.5} />
    </svg>
  );
}

export function AdminGuide({ glyph, count, soon, slabs }: { glyph: Glyph; count: number; soon?: boolean; slabs: number }) {
  const layers = Array.from({ length: slabs }, (_, i) => {
    const cx = 210, cy = 178 - i * 22, hw = 120 - i * 8, hd = hw * 0.5, t = 12;
    const top = i === slabs - 1;
    return (
      <g key={i} className="tig-lift" style={{ animationDelay: `${i * 0.08}s` }}>
        <polygon points={`${cx - hw},${cy} ${cx},${cy + hd} ${cx},${cy + hd + t} ${cx - hw},${cy + t}`} className="tig-slab-l" />
        <polygon points={`${cx},${cy + hd} ${cx + hw},${cy} ${cx + hw},${cy + t} ${cx},${cy + hd + t}`} className="tig-slab-r" />
        <polygon points={`${cx},${cy - hd} ${cx + hw},${cy} ${cx},${cy + hd} ${cx - hw},${cy}`}
          fill={top ? (soon ? "var(--tig-hole)" : count ? "var(--tig-look-soft)" : "var(--tig-ok-soft)") : "var(--tig-top)"}
          stroke={top ? "var(--tig-blue)" : "none"} strokeWidth={2} />
      </g>
    );
  });
  return (
    <svg className="tig-guide" viewBox="0 0 420 230" width="420" height="230" role="img" aria-label="Illustration for this screen">
      <ellipse cx="210" cy="205" rx="150" ry="18" fill="var(--tig-shadow)" />
      {layers}
      <g className="tig-lift" style={{ animationDelay: ".35s" }}>
        <circle cx="210" cy="62" r="40" fill="var(--surface, #fff)" stroke="var(--tig-blue)" strokeWidth={3} />
        <g transform="translate(186 38)" fill="none" stroke="var(--tig-blue)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          {GLYPH_PATHS[glyph].map((d, i) => <path key={i} d={d} />)}
        </g>
        {count > 0 && (
          <g>
            <circle cx="244" cy="30" r="14" fill="var(--tig-look)" />
            <text x="244" y="35" textAnchor="middle" fontSize="14" fontWeight={800} fill="var(--tig-on)">{count}</text>
          </g>
        )}
      </g>
    </svg>
  );
}

const SLABS: Partial<Record<AdminSection, number>> = { "data-browser": 4, "data-purge": 2, "support-viewer": 2, "data-removal": 1, "mrii-template": 1, "mriii-template": 1 };

/** Screen header (group · original name, plain title) and the "What you'll do here" box. */
export function AdminScreenIntro({ section, groupId }: { section: AdminSection; groupId: GroupId }) {
  const m = ADMIN_META[section];
  const hints = useAdminHints()[section] ?? [];
  const reported = useContext(AdminHintsContext).kpis[section];
  const kpis: BannerKpi[] = m.soon ? [{ label: "Coming soon", value: "—", tone: "skip" }]
    : [...(reported ?? []), ...(hints.length ? [{ label: hints.length === 1 ? "reminder" : "reminders", value: hints.length, tone: "look" as Tone }] : [])];
  return (
    <>
      <div className="adm-head">
        <span className="adm-eyebrow">{GROUP_NAMES[groupId]} · {m.tech}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 className="adm-title">{m.title}</h2>
          {m.soon && <span className="adm-soon">Coming soon</span>}
        </div>
      </div>
      <CollapsingBanner resetKey={section} kpis={kpis} label={`${m.name}: what you'll do here`}>
      <div className="tig-intro">
        {section === "mri-template" ? <IsoShelfGuide /> : <AdminGuide glyph={m.glyph} count={hints.length} soon={m.soon} slabs={SLABS[section] ?? 3} />}
        <div className="tig-intro-text">
          <p className="tig-explain">{m.explain}</p>
          <span className="tig-todo-h">What you'll do here</span>
          <ol className="tig-todo">
            {m.todo.map((t, i) => <li key={i}><span className="tig-todo-n" aria-hidden="true">{i + 1}</span><span>{t}</span></li>)}
          </ol>
          {hints.map((h, i) => <div key={i} className="tig-hint" role="status">{h}</div>)}
        </div>
      </div>
      </CollapsingBanner>
    </>
  );
}

/** "What you'll do here" box for screens outside Administration (e.g. the Asset Registry). */
export function ScreenIntro({ glyph, explain, todo, hints = [], kpis, label = "What you'll do here" }: { glyph: Glyph; explain: string; todo: string[]; hints?: string[]; kpis?: BannerKpi[]; label?: string }) {
  const box = (
    <div className="tig-intro">
      <AdminGuide glyph={glyph} count={hints.length} slabs={3} />
      <div className="tig-intro-text">
        <p className="tig-explain">{explain}</p>
        <span className="tig-todo-h">What you'll do here</span>
        <ol className="tig-todo">
          {todo.map((t, i) => <li key={i}><span className="tig-todo-n" aria-hidden="true">{i + 1}</span><span>{t}</span></li>)}
        </ol>
        {hints.map((h, i) => <div key={i} className="tig-hint" role="status">{h}</div>)}
      </div>
    </div>
  );
  if (!kpis) return <div style={{ marginBottom: 18 }}>{box}</div>;
  return <CollapsingBanner resetKey="screen" kpis={kpis} label={label}>{box}</CollapsingBanner>;
}

// ------------------------------------------------------------------ 3D building blocks for the screens
export type Tone = "ok" | "look" | "blue" | "skip" | "bad";
const TONE_TOP: Record<Tone, string> = { ok: "var(--tig-ok-soft)", look: "var(--tig-look-soft)", blue: "var(--tig-blue-soft)", skip: "var(--tig-hole)", bad: "var(--tig-bad-soft)" };
const TONE_EDGE: Record<Tone, string> = { ok: "var(--tig-ok)", look: "var(--tig-look)", blue: "var(--tig-blue)", skip: "var(--tig-skip)", bad: "var(--tig-bad)" };

/** Isometric bars: one prism per item, height by value. */
export function IsoBars({ items, label }: { items: { label: string; value: number; tone: Tone; note?: string }[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const step = 112, W = Math.max(320, 50 + items.length * step), H = 190;
  return (
    <div className="adm-bars" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: "100%", height: "auto", display: "block" }}>
        {items.map((it, i) => {
          const x = 50 + i * step, base = 150, h = Math.max(6, (it.value / max) * 100), w = 30, d = 15;
          return (
            <g key={i} className="tig-lift" style={{ animationDelay: `${i * 0.06}s` }}>
              <polygon points={`${x - w},${base - h} ${x},${base - h + d} ${x},${base + d} ${x - w},${base}`} className="tig-slab-l" />
              <polygon points={`${x},${base - h + d} ${x + w},${base - h} ${x + w},${base} ${x},${base + d}`} className="tig-slab-r" />
              <polygon points={`${x},${base - h - d} ${x + w},${base - h} ${x},${base - h + d} ${x - w},${base - h}`} fill={TONE_TOP[it.tone]} stroke={TONE_EDGE[it.tone]} strokeWidth={1.4} />
              <text x={x} y={base - h - d - 8} textAnchor="middle" className="adm-bar-v">{it.value}</text>
              <text x={x} y={base + d + 18} textAnchor="middle" className="adm-bar-l">{it.label.length > 17 ? it.label.slice(0, 16) + "…" : it.label}</text>
              {it.note && <title>{it.note}</title>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Pick one item from isometric tiles (lists, tables…); the chosen tile lifts. */
export function IsoTiles<T extends string>({ items, selected, onPick, label }: {
  items: { id: T; label: string; count?: string; tone?: Tone }[]; selected: T | null; onPick: (id: T) => void; label: string;
}) {
  return (
    <div className="adm-tiles" role="group" aria-label={label}>
      {items.map((it) => {
        const on = it.id === selected;
        return (
          <button key={it.id} type="button" className={`adm-tilebtn${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => onPick(it.id)}>
            <svg width="46" height="29" viewBox="0 0 64 40" aria-hidden="true" style={{ overflow: "visible", flexShrink: 0 }}>
              <polygon points="2,16 32,30 32,36 2,22" className="tig-slab-l" />
              <polygon points="32,30 62,16 62,22 32,36" className="tig-slab-r" />
              <polygon points="32,2 62,16 32,30 2,16" fill={TONE_TOP[it.tone ?? "ok"]} stroke={on ? "var(--tig-blue)" : TONE_EDGE[it.tone ?? "ok"]} strokeWidth={on ? 2.5 : 1} />
            </svg>
            <span className="adm-tilebtn-t"><strong>{it.label}</strong>{it.count && <span>{it.count}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Steps drawn as isometric platforms joined by arrows; the current step lifts. */
export function IsoSteps({ steps, current }: { steps: string[]; current: number }) {
  const gap = 200, W = 60 + (steps.length - 1) * gap + 120;
  return (
    <svg className="adm-steps" viewBox={`0 0 ${W} 150`} width={W} height={150} role="img" aria-label={`Step ${current + 1} of ${steps.length}: ${steps[current]}`} style={{ maxWidth: "100%", height: "auto", display: "block" }}>
      {steps.map((st, i) => {
        const cx = 90 + i * gap, cy = 70 - (i === current ? 10 : 0), hw = 70, hd = 35, t = 10;
        const tone: Tone = i < current ? "ok" : i === current ? "blue" : "skip";
        return (
          <g key={i}>
            {i < steps.length - 1 && <path d={`M${cx + hw + 8} ${70} L${cx + gap - hw - 14} ${70}`} stroke="var(--tig-blue)" strokeWidth={4} strokeLinecap="round" markerEnd="" opacity={i < current ? 1 : 0.35} />}
            {i < steps.length - 1 && <polygon points={`${cx + gap - hw - 4},70 ${cx + gap - hw - 18},62 ${cx + gap - hw - 18},78`} fill="var(--tig-blue)" opacity={i < current ? 1 : 0.35} />}
            <g className="tig-lift" style={{ animationDelay: `${i * 0.1}s` }}>
              <polygon points={`${cx - hw},${cy} ${cx},${cy + hd} ${cx},${cy + hd + t} ${cx - hw},${cy + t}`} className="tig-slab-l" />
              <polygon points={`${cx},${cy + hd} ${cx + hw},${cy} ${cx + hw},${cy + t} ${cx},${cy + hd + t}`} className="tig-slab-r" />
              <polygon points={`${cx},${cy - hd} ${cx + hw},${cy} ${cx},${cy + hd} ${cx - hw},${cy}`} fill={TONE_TOP[tone]} stroke={TONE_EDGE[tone]} strokeWidth={i === current ? 2.5 : 1.2} />
              <circle cx={cx} cy={cy} r={13} fill={TONE_EDGE[tone]} />
              <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight={800} fill="var(--tig-on)">{i < current ? "✓" : i + 1}</text>
            </g>
            <text x={cx} y={135} textAnchor="middle" className="adm-bar-l" style={{ fontWeight: i === current ? 700 : 500 }}>{st}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** "Under construction" platform for coming-soon screens. */
export function IsoScaffold() {
  return (
    <svg viewBox="0 0 360 200" width="360" height="200" role="img" aria-label="Under construction" style={{ maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" }}>
      <ellipse cx="180" cy="176" rx="140" ry="16" fill="var(--tig-shadow)" />
      <g className="tig-lift">
        <polygon points="60,130 180,190 180,200 60,140" className="tig-slab-l" />
        <polygon points="180,190 300,130 300,140 180,200" className="tig-slab-r" />
        <polygon points="180,70 300,130 180,190 60,130" fill="var(--tig-hole)" stroke="var(--tig-skip)" strokeWidth={1.5} strokeDasharray="6 5" />
      </g>
      <g className="tig-lift" style={{ animationDelay: ".15s" }}>
        <polygon points="150,110 180,125 180,145 150,130" className="tig-slab-l" />
        <polygon points="180,125 210,110 210,130 180,145" className="tig-slab-r" />
        <polygon points="180,95 210,110 180,125 150,110" fill="var(--tig-look-soft)" />
        <path d="M110 135 V60 M250 135 V60 M110 70 H250 M110 100 L250 70" stroke="var(--tig-skip)" strokeWidth={4} strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

/** Small person / item tile for list rows. */
export function RowTile({ tone }: { tone: Tone }) {
  return (
    <svg className="adm-rowtile" width="34" height="22" viewBox="0 0 64 40" aria-hidden="true">
      <polygon points="2,16 32,30 32,36 2,22" className="tig-slab-l" />
      <polygon points="32,30 62,16 62,22 32,36" className="tig-slab-r" />
      <polygon points="32,2 62,16 32,30 2,16" fill={TONE_TOP[tone]} stroke={TONE_EDGE[tone]} strokeWidth={1.2} />
    </svg>
  );
}


// ------------------------------------------------------------------ isometric switch and keys
// Same behaviour as a normal on/off switch (button, role="switch", aria-checked); only the look is 3D:
// a cube slides along an isometric track, green when on.
const SW = { ox: 5, oy: 30, L: 38, w: 15, t: 6, s: 6.5, h: 10 };
const SD = [0.866, -0.5], SR = [0.866, 0.5];
const sp = (u: number, v: number, lift = 0): string => {
  const x = SW.ox + u * SD[0] + v * SR[0], y = SW.oy + u * SD[1] + v * SR[1] - lift;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
};
export function IsoSwitch({ on, onToggle, label, disabled, size = 68 }: { on: boolean; onToggle: () => void; label: string; disabled?: boolean; size?: number }) {
  const { L, w, t, s, h } = SW;
  const u0 = 9, travel = L - 18;              // knob centre moves from u0 to u0 + travel along the track
  const v = w / 2;
  const dx = travel * SD[0], dy = travel * SD[1];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`iso-switch${on ? " is-on" : ""}`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      <svg viewBox="0 0 66 48" width={size} height={size * 48 / 66} aria-hidden="true">
        <ellipse cx="34" cy="40" rx="29" ry="6" fill="var(--tig-shadow)" />
        <polygon points={`${sp(0, 0)} ${sp(0, w)} ${sp(0, w, -t)} ${sp(0, 0, -t)}`} className="tig-slab-l" />
        <polygon points={`${sp(0, w)} ${sp(L, w)} ${sp(L, w, -t)} ${sp(0, w, -t)}`} className="tig-slab-r" />
        <polygon className="iso-sw-track" points={`${sp(0, 0)} ${sp(L, 0)} ${sp(L, w)} ${sp(0, w)}`} />
        <polygon className="iso-sw-groove" points={`${sp(u0, v - 1.4)} ${sp(u0 + travel, v - 1.4)} ${sp(u0 + travel, v + 1.4)} ${sp(u0, v + 1.4)}`} />
        <g className="iso-sw-knob" style={{ transform: on ? `translate(${dx}px, ${dy}px)` : "translate(0px, 0px)" }}>
          <polygon points={`${sp(u0 - s, v - s, h)} ${sp(u0 - s, v + s, h)} ${sp(u0 - s, v + s)} ${sp(u0 - s, v - s)}`} className="tig-slab-l" />
          <polygon points={`${sp(u0 - s, v + s, h)} ${sp(u0 + s, v + s, h)} ${sp(u0 + s, v + s)} ${sp(u0 - s, v + s)}`} className="tig-slab-r" />
          <polygon className="iso-sw-cap" points={`${sp(u0 - s, v - s, h)} ${sp(u0 + s, v - s, h)} ${sp(u0 + s, v + s, h)} ${sp(u0 - s, v + s, h)}`} />
        </g>
      </svg>
    </button>
  );
}

/** A small isometric key (e.g. "All on" / "All off"); it sits pressed down when it already applies. */
export function IsoKey({ label, pressed, tone, onClick, disabled }: { label: string; pressed: boolean; tone: Tone; onClick: () => void; disabled?: boolean }) {
  const h = pressed ? 2 : 7;
  return (
    <button type="button" className={`iso-key${pressed ? " is-pressed" : ""}`} aria-pressed={pressed} onClick={onClick} disabled={disabled}>
      <svg width="30" height="24" viewBox="0 0 40 32" aria-hidden="true" style={{ overflow: "visible" }}>
        <polygon points={`4,${16 - h} 20,${24 - h} 20,24 4,16`} className="tig-slab-l" />
        <polygon points={`20,${24 - h} 36,${16 - h} 36,16 20,24`} className="tig-slab-r" />
        <polygon points={`20,${8 - h} 36,${16 - h} 20,${24 - h} 4,${16 - h}`} fill={TONE_TOP[tone]} stroke={TONE_EDGE[tone]} strokeWidth={pressed ? 2 : 1.2} />
      </svg>
      <span>{label}</span>
    </button>
  );
}

// ------------------------------------------------------------------ backups saved from this PC (display only)
// Kept in this PC's browser storage, not the database: the app's data and the backup itself are unchanged.
const BACKUP_KEY = "mms.backups.savedAt";
export function readBackups(): number[] {
  try { const v = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((n) => typeof n === "number") : []; } catch { return []; }
}
export function recordBackup() {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify([Date.now(), ...readBackups()].slice(0, 6))); } catch { /* storage unavailable */ }
}
export function backupHint(): string | null {
  const last = readBackups()[0];
  if (!last) return "No backup has been saved from this PC yet";
  const days = Math.floor((Date.now() - last) / 86400000);
  return days >= 7 ? `Last backup from this PC was ${days} days ago` : null;
}
export const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** A 3D archive box (backup / restore cards). */
export function IsoBox({ tone, arrow }: { tone: Tone; arrow: "down" | "up" }) {
  return (
    <svg width="96" height="84" viewBox="0 0 96 84" aria-hidden="true" style={{ flexShrink: 0, overflow: "visible" }}>
      <ellipse cx="48" cy="76" rx="40" ry="7" fill="var(--tig-shadow)" />
      <g className="tig-lift">
        <polygon points="8,34 48,54 48,78 8,58" className="tig-slab-l" />
        <polygon points="48,54 88,34 88,58 48,78" className="tig-slab-r" />
        <polygon points="48,14 88,34 48,54 8,34" fill={TONE_TOP[tone]} stroke={TONE_EDGE[tone]} strokeWidth={1.5} />
        <path d={arrow === "down" ? "M48 4v22M40 18l8 8 8-8" : "M48 26V4M40 12l8-8 8 8"} stroke={TONE_EDGE[tone]} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Filter chips row (Everyone / Switched off …). */
export function FilterChips<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="adm-chips" role="group" aria-label="Show">
      {options.map((o) => (
        <button key={o.id} type="button" className={`adm-chip${o.id === value ? " is-on" : ""}`} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export const ADMIN_CSS = `
.iso-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 22px 24px; padding: 10px 14px 12px 4px; }
.iso-card { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 14px 14px 12px; border-radius: 4px; cursor: pointer; user-select: none;
  background: var(--tig-top); border: 1.5px solid var(--tig-side-l); color: var(--tig-ink);
  --dy: 7px; --dx: 12.1px; --on: var(--tig-blue); --on-soft: var(--tig-blue-soft); transform: translate(-7.8px, -4.5px);
  transition: transform .38s cubic-bezier(.34,1.56,.64,1), background .25s, border-color .25s; }
html[data-holo] .iso-card { --on: var(--tig-ok); --on-soft: var(--tig-ok-soft); }
.iso-card::before { content: ""; position: absolute; left: -1.5px; right: -1.5px; top: 100%; margin-top: 1.5px; height: var(--dy);
  background: var(--tig-side-l); transform-origin: top left; transform: skewX(60deg); transition: height .38s cubic-bezier(.34,1.56,.64,1), background .25s; }
.iso-card::after { content: ""; position: absolute; top: -1.5px; bottom: -1.5px; left: 100%; margin-left: 1.5px; width: var(--dx);
  background: var(--tig-side-r); transform-origin: top left; transform: skewY(30deg); transition: width .38s cubic-bezier(.34,1.56,.64,1), background .25s; }
.iso-card.is-on { --dy: 2.5px; --dx: 4.3px; transform: translate(0, 0); background: var(--on-soft); border-color: var(--on); }
.iso-card.is-on::before { background: color-mix(in srgb, var(--on) 55%, var(--tig-side-l)); }
.iso-card.is-on::after { background: color-mix(in srgb, var(--on) 35%, var(--tig-side-r)); }
.iso-card:hover { border-color: var(--tig-blue); }
.iso-card:active { transform: translate(-5px, -2.9px); }
.iso-card.is-on:active { transform: translate(1px, .6px); }
.iso-card > div:first-child { color: var(--tig-soft); }
.iso-card.is-on > div:first-child > div { color: var(--on) !important; }
.iso-card-label { font-size: 13px; font-weight: 600; line-height: 1.3; }
.iso-card.is-on .iso-card-label { color: var(--on); }
.iso-card.is-override { border-width: 2px; }
.iso-card.is-revoked { border-color: var(--tig-bad); }
.iso-card.is-revoked .iso-card-override { color: var(--tig-bad); }
.iso-card-state { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tig-soft); }
.iso-card.is-on .iso-card-state { color: var(--on); }
@media (prefers-reduced-motion: reduce) { .iso-card, .iso-card::before, .iso-card::after { transition: none; } }
.iso-switch, .iso-key { background: none !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; min-height: 0 !important; clip-path: none !important; filter: none !important; cursor: pointer; line-height: 0; }
.iso-switch { border-radius: 8px !important; }
.iso-switch:disabled, .iso-key:disabled { cursor: not-allowed; opacity: .55; }
.iso-switch:focus-visible, .iso-key:focus-visible { outline: 2px solid var(--tig-blue); outline-offset: 2px; }
.iso-switch svg { display: block; overflow: visible; }
.iso-sw-track { fill: var(--tig-hole); stroke: var(--tig-skip); stroke-width: 1; transition: fill .25s, stroke .25s; }
.iso-sw-groove { fill: var(--tig-shadow); }
.iso-sw-cap { fill: var(--tig-top); stroke: var(--tig-skip); stroke-width: 1; transition: fill .25s, stroke .25s; }
.iso-sw-knob { transition: transform .38s cubic-bezier(.34,1.56,.64,1); }
.iso-switch.is-on .iso-sw-track { fill: var(--tig-ok-soft); stroke: var(--tig-ok); }
.iso-switch.is-on .iso-sw-cap { fill: var(--tig-ok); stroke: var(--tig-ok); }
.iso-switch:hover:not(:disabled) .iso-sw-cap { stroke: var(--tig-blue); stroke-width: 1.6; }
.iso-key { display: inline-flex !important; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; color: var(--tig-ink) !important; line-height: 1.2; }
.iso-key svg polygon { transition: points .2s; }
.iso-key:hover:not(:disabled) svg { transform: translateY(-1px); }
.iso-key.is-pressed span { color: var(--tig-soft); }
@media (prefers-reduced-motion: reduce) { .iso-sw-knob, .iso-sw-track, .iso-sw-cap { transition: none; } }
.adm-banner { position: relative; overflow: hidden; margin-bottom: 18px; border-radius: 14px; outline: none; transition: height .45s cubic-bezier(.2,.8,.2,1); }
.adm-banner:focus-visible { box-shadow: 0 0 0 2px var(--tig-blue); }
.adm-banner-full { transition: opacity .25s; }
.adm-banner.is-small .adm-banner-full { opacity: 0; pointer-events: none; }
.adm-banner-kpis { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 8px 18px; padding: 0 18px; border-radius: 14px; background: var(--tig-panel); opacity: 0; pointer-events: none; transition: opacity .25s; overflow: hidden; white-space: nowrap; }
.adm-banner.is-small .adm-banner-kpis { opacity: 1; pointer-events: auto; cursor: default; }
.adm-kpi { display: inline-flex; align-items: center; gap: 7px; color: var(--tig-ink); font-size: 12.5px; }
.adm-kpi b { font-size: 19px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
.adm-kpi span { color: var(--tig-soft); }
.adm-kpi.is-look b { color: var(--tig-look); } .adm-kpi.is-bad b { color: var(--tig-bad); } .adm-kpi.is-ok b { color: var(--tig-ok); }
.adm-kpi .adm-rowtile { width: 26px; height: 17px; }
.adm-banner-none { color: var(--tig-soft); font-size: 13px; }
.adm-banner-more { margin-left: auto; padding-left: 12px; font-size: 12px; color: var(--tig-soft); }
@media (prefers-reduced-motion: reduce) { .adm-banner, .adm-banner-full, .adm-banner-kpis { transition: none; } }
.tig .admin-child-item { gap: 10px; transition: background .15s, transform .35s cubic-bezier(.34,1.56,.64,1); }
.tig .admin-child-item:hover { transform: translateX(3px); }
.tig .adm-child-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; text-align: left; line-height: 1.25; }
.tig .adm-child-name { font-weight: 600; color: var(--tig-ink); }
.tig .adm-child-tech { font-size: 11px; color: var(--tig-soft); font-weight: 500; }
.tig .adm-tile { flex-shrink: 0; overflow: visible; }
.tig .admin-child-item.active .adm-child-name, .tig .admin-child-item.active .adm-child-tech { color: inherit; }
.tig .admin-child-item.active .adm-child-tech { opacity: .85; }
.tig .adm-badge { font-size: 11px; font-weight: 800; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; display: inline-flex;
  align-items: center; justify-content: center; background: var(--tig-look); color: var(--tig-on); flex-shrink: 0; }
.tig .adm-badge.is-soon { background: var(--tig-hole); color: var(--tig-soft); font-weight: 700; }
.tig .adm-head { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
.tig .adm-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--tig-soft); }
.tig .panel h2.adm-title { font-size: 24px !important; font-weight: 700 !important; text-transform: none !important; letter-spacing: 0 !important; color: var(--tig-ink) !important; margin: 0 !important; }
.tig .adm-soon { font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; background: var(--tig-hole); color: var(--tig-soft); }
.tig .adm-bars { overflow-x: auto; padding: 4px 0 8px; }
.tig .adm-bar-v { font-size: 13px; font-weight: 800; fill: var(--tig-ink); }
.tig .adm-bar-l { font-size: 12px; fill: var(--tig-soft); }
.tig .adm-tiles { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.tig .adm-tilebtn { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 14px 6px 8px; border-radius: 12px; cursor: pointer;
  border: 1.5px solid color-mix(in srgb, var(--tig-soft) 25%, transparent); background: transparent; color: var(--tig-ink);
  transition: transform .4s cubic-bezier(.34,1.56,.64,1), border-color .2s; box-shadow: none; }
.tig .adm-tilebtn:hover { transform: translateY(-2px); }
.tig .adm-tilebtn.is-on { border-color: var(--tig-blue) !important; background: var(--tig-blue-soft) !important; transform: translateY(-4px); }
.tig .adm-tilebtn-t { display: flex; flex-direction: column; text-align: left; font-size: 13.5px; line-height: 1.25; }
.tig .adm-tilebtn-t span { font-size: 12px; color: var(--tig-soft); }
.tig .adm-rowtile { flex-shrink: 0; overflow: visible; margin-right: 4px; }
.tig .adm-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.tig .adm-chip { min-height: 34px; padding: 0 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600; cursor: pointer; box-shadow: none;
  border: 1.5px solid color-mix(in srgb, var(--tig-soft) 30%, transparent); background: transparent; color: var(--tig-soft); }
.tig .adm-chip.is-on { background: var(--tig-blue) !important; border-color: var(--tig-blue) !important; color: var(--tig-on) !important; }
.tig .adm-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 4px 0 12px; }
.tig .adm-toolbar .search { flex: 1 1 240px; }
.tig .adm-lift { transition: transform .4s cubic-bezier(.34,1.56,.64,1); }
.tig .adm-lift:hover, .tig .adm-lift:focus-within { transform: translateY(-3px); }
.tig .adm-pill-look { background: var(--tig-look-soft) !important; color: var(--tig-look) !important; }
.tig .adm-row-look { border-color: var(--tig-look) !important; }
.tig .adm-section-h { font-size: 15px; font-weight: 700; color: var(--tig-ink); margin: 6px 0 8px; }
@media (prefers-reduced-motion: reduce) { .tig .adm-tilebtn, .tig .adm-lift { transition: none; } .tig .adm-tilebtn:hover, .tig .adm-lift:hover { transform: none; } }
@media (prefers-reduced-motion: reduce) { .tig .admin-child-item { transition: none; } .tig .admin-child-item:hover { transform: none; } }
`;
