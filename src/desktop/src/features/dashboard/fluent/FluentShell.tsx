import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useCurrentUser } from "../../../lib/currentUser";
import { useMriDashboardScope, useMriDashboardWaiting } from "../hooks/useMriDashboards";
import { DASHBOARDS, DASH_ICONS, DECK_SLIDES, GROUPS, USER_GROUPS } from "../dashCatalog";
import { FLUENT_CSS } from "./fluentCss";
import { MotionSetting, Num, motionFactor, useMotion } from "./motion";
import { DashInfoHead, InfoDialog, INFO_CSS, useInfoDots } from "../info/InfoLayer";
import type { InfoResult } from "../info/dashInfo";
import { LIQUID_CSS } from "./Liquid";
import { SCOPE_CSS } from "../scopeFilter";
import { CONTROLS_CSS } from "./controlsCss";
import { HINTS_CSS, HintsToggle, useHints } from "../hints";
import { resetDashMode } from "../dashMode";
import { useDashAccess } from "../dashAccess";

// The dashboard area's shell, in the Fluent 2 + Fluid style: blue sidebar, header with search,
// notifications and the signed-in user, and the page content. Colours come from the MMS theme
// tokens (--accent-blue, --accent, --success, ...) so the dashboards follow the theme the user picked.

export type ShellSection = "overview" | "mri-history" | "mri-dashboards" | "user-analytics";

const i = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const FL_ICONS = {
  home: i(<><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9v10.5h13V9" /><path d="M10 19.5V14h4v5.5" /></>),
  history: i(<><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4.5v3.5h3.5" /><path d="M12 8v4.2l2.8 1.8" /></>),
  chart: i(<><path d="M4 19.5h16" /><path d="M6.5 16v-4M11 16V8M15.5 16v-6M20 16V5.5" /></>),
  people: i(<><circle cx="9" cy="8" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2a4.5 4.5 0 0 1 5 4.3" /></>),
  trend: i(<><path d="M4 17l5-5 3.5 3.5L20 8" /><path d="M15 8h5v5" /></>),
  fleet: i(<><rect x="3" y="9" width="12" height="7" rx="1.5" /><path d="M15 11.5h3l2.5 2.5v2H15" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></>),
  budget: i(<><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M3.5 10h17" /><path d="M7 14.5h4" /></>),
  search: i(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>),
  bell: i(<><path d="M6 10a6 6 0 1 1 12 0c0 4.5 1.8 6 1.8 6H4.2S6 14.5 6 10z" /><path d="M10 19.5a2.2 2.2 0 0 0 4 0" /></>),
  offline: i(<><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8 15.5a6 6 0 0 1 8 0" /><circle cx="12" cy="18.5" r="1" /></>),
  menu: i(<><path d="M4 7h16M4 12h16M4 17h16" /></>),
  chevron: i(<path d="m9 6 6 6-6 6" />),
  back: i(<path d="m15 6-6 6 6 6" />),
  settings: i(<><path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h13M21 12h-1" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /><circle cx="18.5" cy="12" r="1.5" /></>),
};

// Sidebar accordions: one per dashboard group. Each lists its dashboards.
type Acc = { key: string; title: string; nos: number[]; icon: ReactNode };
const SHORT: Record<number, string> = {
  1: "Fleet status by tag", 5: "Decisions waiting", 7: "Repair queue", 10: "Phone decisions", 12: "Red units under MOC", 13: "MR-II due forecast", 18: "Managers and FSM",
};
const ACCS: Acc[] = [
  ...GROUPS.map((g) => ({ key: g.title, title: g.title, nos: g.nos, icon: DASH_ICONS[g.nos[0]] })),
  { key: "users", title: "User Analytics", nos: USER_GROUPS.flatMap((g) => g.nos), icon: i(<><circle cx="9" cy="8" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2a4.5 4.5 0 0 1 5 4.3" /></>) },
];
const accOf = (no: number | null | undefined) => (no == null ? undefined : ACCS.find((a) => a.nos.includes(no))?.key);

const SOON: { label: string; icon: ReactNode }[] = [
  { label: "Fault Trends", icon: FL_ICONS.trend },
  { label: "Fleet Utilization", icon: FL_ICONS.fleet },
  { label: "Budget & Planning", icon: FL_ICONS.budget },
];

const USER_NOS = new Set(USER_GROUPS.flatMap((g) => g.nos));
export const sectionOfDash = (no: number): ShellSection => (USER_NOS.has(no) ? "user-analytics" : "mri-dashboards");

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const daysAgo = (t: number | null) => (t == null ? null : Math.max(0, Math.floor((Date.now() / 1000 - t) / 86400)));

/** Search the dashboards by name and open one. */
function DashSearch({ onOpenDash, allowed }: { onOpenDash: (no: number) => void; allowed: number[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return DASHBOARDS.filter((d) => allowed.includes(d.no) && `${d.title} ${d.desc}`.toLowerCase().includes(t)).slice(0, 7);
  }, [q, allowed]);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, []);
  const pick = (no: number) => { onOpenDash(no); setQ(""); setOpen(false); };
  return (
    <div className="fl-search" ref={wrap}>
      <span className="fl-search-icon">{FL_ICONS.search}</span>
      <input
        type="search"
        placeholder="Search dashboards"
        aria-label="Search dashboards"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === "Enter" && hits[hi]) pick(hits[hi].no);
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && q.trim() && (
        <div className="fl-pop fl-search-pop" role="listbox">
          {hits.length === 0 ? (
            <div className="fl-pop-empty">No dashboard matches "{q.trim()}"</div>
          ) : hits.map((d, n) => (
            <button key={d.no} type="button" role="option" aria-selected={n === hi} className={`fl-pop-item${n === hi ? " is-hi" : ""}`} onMouseEnter={() => setHi(n)} onClick={() => pick(d.no)}>
              <span className="fl-ico sm">{DASH_ICONS[d.no]}</span>
              <span className="fl-pop-text"><b>{d.title}</b><small>{USER_NOS.has(d.no) ? "User Analytics" : "MR-I Dashboards"} · {d.desc}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bell: what is waiting for a review or a decision now, for the units the user can see. */
/** Display settings: the animation level slider. */
function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, []);
  return (
    <div className="fl-bell-wrap" ref={wrap}>
      <button type="button" className="fl-icon-btn" aria-label="Dashboard settings" aria-expanded={open} title="Dashboard settings" onClick={() => setOpen((v) => !v)}>{FL_ICONS.settings}</button>
      {open && (
        <div className="fl-pop fl-settings-pop" role="dialog" aria-label="Dashboard settings">
          <div className="fl-pop-head">Dashboard settings</div>
          <MotionSetting />
          <p className="fl-motion-note">Saved on this computer. Applies to every dashboard.</p>
        </div>
      )}
    </div>
  );
}

function WaitingBell({ onOpenDash }: { onOpenDash: (no: number) => void }) {
  const { data: waiting = [] } = useMriDashboardWaiting();
  const { data: scope } = useMriDashboardScope();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, []);
  const code = useMemo(() => new Map((scope?.assets ?? []).map((a) => [a.id, a.asset_code])), [scope]);
  const top = useMemo(() => [...waiting].sort((a, b) => (a.waiting_since ?? 0) - (b.waiting_since ?? 0)).slice(0, 5), [waiting]);
  return (
    <div className="fl-bell-wrap" ref={wrap}>
      <button type="button" className="fl-icon-btn" aria-label={`${waiting.length} item${waiting.length === 1 ? "" : "s"} waiting for review`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {FL_ICONS.bell}
        {waiting.length > 0 && <span className="fl-badge" key={waiting.length}>{waiting.length > 99 ? "99+" : waiting.length}</span>}
      </button>
      {open && (
        <div className="fl-pop fl-bell-pop">
          <div className="fl-pop-head">Waiting for review <span>{waiting.length}</span></div>
          {top.length === 0 ? (
            <div className="fl-pop-empty">Nothing is waiting. All reports and fault decisions are up to date.</div>
          ) : top.map((w) => {
            const d = daysAgo(w.waiting_since);
            return (
              <div key={`${w.kind}-${w.report_id}-${w.approval_id ?? 0}`} className="fl-pop-row">
                <span className={`fl-dot ${w.severity && /crit|major/i.test(w.severity) ? "is-red" : w.severity && /mod/i.test(w.severity) ? "is-amber" : "is-blue"}`} />
                <span className="fl-pop-text">
                  <b>{code.get(w.asset_id) ?? `Unit ${w.asset_id}`} · {w.item ?? `Report #${w.report_id}`}</b>
                  <small>{w.step} · {w.assigned_to_name ?? w.required_authority}{d != null ? ` · ${d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`}` : ""}</small>
                </span>
              </div>
            );
          })}
          <button type="button" className="fl-pop-foot" onClick={() => { setOpen(false); onOpenDash(5); }}>Open "Decisions waiting" {FL_ICONS.chevron}</button>
        </div>
      )}
    </div>
  );
}

export function FluentShell({
  section,
  dash,
  onSection,
  onOpenDash,
  title,
  subtitle,
  children,
}: {
  section: ShellSection;
  /** The dashboard on screen (MR-I / User Analytics), highlighted in the sidebar. */
  dash?: number | null;
  onSection: (s: ShellSection) => void;
  onOpenDash: (no: number) => void;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { user } = useCurrentUser();
  const motion = useMotion();
  const hints = useHints();
  // Every visit to the Dashboard area starts in Simple view.
  useEffect(() => () => resetDashMode(), []); // back to Simple when the user leaves the Dashboard area
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  // New page: start at the top.
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [section, title]);
  // (i) buttons on every card, and the popup that explains a card or the whole dashboard.
  const infoScope = section === "overview" ? "overview" : section === "mri-history" ? "history" : dash != null ? String(dash) : null;
  const [info, setInfo] = useState<InfoResult | null>(null);
  const closeInfo = useCallback(() => setInfo(null), []);
  useInfoDots(mainRef, infoScope, setInfo);
  useEffect(() => { setInfo(null); }, [section, dash, title]);
  // Dashboard items the user may open (Administration > Roles / Users > Permissions, "Dashboards").
  const access = useDashAccess();
  const accs = ACCS.map((a) => ({ ...a, nos: a.nos.filter(access.dash) })).filter((a) => a.nos.length > 0);
  const go = (s: ShellSection) => { onSection(s); setNavOpen(false); };
  const pick = (no: number) => { onOpenDash(no); setNavOpen(false); };
  const activeAcc = section === "mri-dashboards" || section === "user-analytics" ? accOf(dash) : undefined;
  // Accordions: the one holding the open dashboard starts expanded; the user can open or close any.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(activeAcc ? [activeAcc] : accs[0] ? [accs[0].key] : []));
  useEffect(() => { if (activeAcc) setExpanded((s) => (s.has(activeAcc) ? s : new Set([...s, activeAcc]))); }, [activeAcc]);
  const toggle = (k: string) => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className={`fl-shell${navOpen ? " nav-open" : ""}${hints ? " show-hints" : ""}`} data-motion={motion} style={{ ["--fl-k" as string]: String(motionFactor(motion) || 0.001) }}>
      <style>{FLUENT_CSS + INFO_CSS + LIQUID_CSS + SCOPE_CSS + CONTROLS_CSS + HINTS_CSS}</style>
      <aside className="fl-side" aria-label="Dashboards">
        <div className="fl-brand">
          <span className="fl-logo" aria-hidden="true">
            <svg viewBox="0 0 32 32"><path d="M6 22c4-1 6-7 10-7s6 6 10 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><circle cx="16" cy="9.5" r="3" fill="currentColor" /></svg>
          </span>
          <span className="fl-brand-text"><b>Sprint MMS</b><small>Dashboards</small></span>
        </div>
        <nav className="fl-nav">
          {access.overview && (
          <button type="button" className={`fl-nav-item${section === "overview" ? " is-on" : ""}`} aria-current={section === "overview" ? "page" : undefined} onClick={() => go("overview")}>
            <span className="fl-nav-ico">{FL_ICONS.home}</span><span className="fl-nav-label">Overview</span>
          </button>
          )}

          {accs.some((a) => a.key !== "users") && <div className="fl-nav-sep">MR-I Dashboards</div>}
          {accs.map((acc, n) => {
            const isOpen = expanded.has(acc.key);
            const holdsActive = activeAcc === acc.key;
            return (
              <div key={acc.key} className={`fl-acc${isOpen ? " is-open" : ""}${holdsActive ? " has-active" : ""}`}>
                {acc.key === "users" && <div className="fl-nav-sep">People</div>}
                <button type="button" className="fl-nav-item fl-acc-head" aria-expanded={isOpen} aria-controls={`fl-acc-${n}`}
                  title={acc.title}
                  onClick={() => toggle(acc.key)}>
                  <span className="fl-nav-ico">{acc.icon}</span>
                  <span className="fl-nav-label">{acc.title}</span>
                  <span className="fl-acc-count">{acc.nos.length}</span>
                  <span className="fl-acc-chev" aria-hidden="true">{FL_ICONS.chevron}</span>
                </button>
                {/* Icon-only sidebar: the group icon opens its first dashboard instead. */}
                <button type="button" className="fl-nav-item fl-acc-rail" title={acc.title} onClick={() => pick(acc.nos.includes(dash ?? -1) ? dash! : acc.nos[0])}>
                  <span className="fl-nav-ico">{acc.icon}</span>
                </button>
                <div className="fl-acc-body" id={`fl-acc-${n}`} role="group" aria-label={acc.title}>
                  <div className="fl-acc-inner">
                    {acc.nos.map((no) => {
                      const d = DASHBOARDS.find((x) => x.no === no)!;
                      const on = holdsActive && dash === no;
                      return (
                        <button key={no} type="button" tabIndex={isOpen ? 0 : -1}
                          className={`fl-sub-item${on ? " is-on" : ""}${DECK_SLIDES[no] ? " is-deck" : ""}`}
                          aria-current={on ? "page" : undefined}
                          title={DECK_SLIDES[no] ? `${d.desc}\nFrom the MMS Dashboard Visualization design, ${DECK_SLIDES[no]}` : d.desc}
                          onClick={() => pick(no)}>
                          <span className="fl-sub-ico">{DASH_ICONS[no]}</span>
                          <span className="fl-sub-label">{SHORT[no] ?? d.title}</span>
                          {DECK_SLIDES[no] && <i className="fl-deck-dot" aria-label="From the dashboard design" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {access.history && <>
          <div className="fl-nav-sep">Records</div>
          <button type="button" className={`fl-nav-item${section === "mri-history" ? " is-on" : ""}`} aria-current={section === "mri-history" ? "page" : undefined} onClick={() => go("mri-history")}>
            <span className="fl-nav-ico">{FL_ICONS.history}</span><span className="fl-nav-label">Asset MR-I History</span>
          </button>
          </>}

          <div className="fl-nav-sep">Coming soon</div>
          {SOON.map((n) => (
            <div key={n.label} className="fl-nav-item is-soon" aria-disabled="true" title={`${n.label}: coming soon`}>
              <span className="fl-nav-ico">{n.icon}</span><span className="fl-nav-label">{n.label}</span>
            </div>
          ))}
        </nav>
        <div className="fl-side-foot">
          <div className="fl-status" title="This beta works offline. Reports are saved on this laptop.">
            <span className="fl-status-dot" />
            <span className="fl-nav-label"><b>Working offline</b><small>Data saved on this laptop</small></span>
          </div>
          {user && (
            <div className="fl-me">
              <span className="fl-avatar">{initials(user.name)}</span>
              <span className="fl-nav-label"><b>{user.name}</b><small>{user.role}</small></span>
            </div>
          )}
        </div>
      </aside>
      {navOpen && <button type="button" className="fl-scrim" aria-label="Close menu" onClick={() => setNavOpen(false)} />}

      <div className="fl-main" ref={mainRef}>
        <div className="fl-backdrop" aria-hidden="true">
          <svg viewBox="0 0 1200 600" preserveAspectRatio="none">
            <path d="M0,120 C220,40 420,220 700,140 C900,85 1050,30 1200,70 L1200,0 L0,0 Z" className="b1" />
            <path d="M0,600 L0,470 C260,420 520,560 820,500 C1000,465 1110,430 1200,440 L1200,600 Z" className="b2" />
          </svg>
        </div>
        <header className="fl-header">
          <button type="button" className="fl-icon-btn fl-burger" aria-label="Open menu" onClick={() => setNavOpen(true)}>{FL_ICONS.menu}</button>
          <div className="fl-titles">
            <h1>{title}</h1>
            <p>{subtitle}</p>
            <DashInfoHead scope={infoScope} onOpen={setInfo} />
          </div>
          <div className="fl-header-tools">
            <DashSearch onOpenDash={onOpenDash} allowed={access.allowed} />
            <WaitingBell onOpenDash={onOpenDash} />
            <HintsToggle />
            <SettingsMenu />
            {user && <span className="fl-avatar sm" title={`${user.name} · ${user.role}`}>{initials(user.name)}</span>}
          </div>
        </header>
        <div className="fl-page" key={`${section}:${title}`}>{children}</div>
      </div>
      <InfoDialog info={info} onClose={closeInfo} />
    </div>
  );
}

/** Wide welcome banner: blue gradient with flowing shapes. No photographs. */
export function HeroBanner({ eyebrow, title, text, chips, children }: { eyebrow?: string; title: ReactNode; text: ReactNode; chips?: ReactNode; children?: ReactNode }) {
  return (
    <section className="fl-hero">
      <svg className="fl-hero-art" viewBox="0 0 800 260" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="flh1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <linearGradient id="flh2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset="1" stopColor="#fff" stopOpacity=".02" /></linearGradient>
        </defs>
        <path d="M380,260 C470,170 560,210 640,130 C700,70 760,60 800,40 L800,260 Z" fill="url(#flh1)" />
        <path d="M470,260 C540,210 620,240 690,190 C740,155 775,150 800,145 L800,260 Z" fill="url(#flh2)" />
        <circle cx="690" cy="58" r="74" fill="url(#flh2)" />
        <circle cx="560" cy="30" r="26" fill="#fff" fillOpacity=".12" />
        <path d="M300,250 C420,150 520,190 620,105 C690,45 760,30 800,22" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
        <path d="M330,260 C450,170 545,205 650,125 C715,75 770,62 800,58" fill="none" stroke="#fff" strokeOpacity=".2" strokeWidth="1.2" />
      </svg>
      <div className="fl-hero-body">
        {eyebrow && <span className="fl-hero-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        <p>{text}</p>
        {chips && <div className="fl-hero-chips">{chips}</div>}
      </div>
      {children && <div className="fl-hero-side">{children}</div>}
    </section>
  );
}

export type FlTone = "blue" | "teal" | "green" | "amber" | "red" | "violet";

/** KPI card: icon in a tinted circle, big number, description, optional trend, wave at the bottom. */
export function KpiCard({ tone, icon, label, value, sub, trend, onClick, children }: {
  tone: FlTone; icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; trend?: ReactNode; onClick?: () => void; children?: ReactNode;
}) {
  const body = (
    <>
      <div className="fl-kpi-top">
        <span className={`fl-ico tone-${tone}`}>{icon}</span>
        <span className="fl-kpi-label">{label}</span>
      </div>
      <div className="fl-kpi-value"><Num v={value} /></div>
      {trend && <div className="fl-kpi-trend">{trend}</div>}
      {sub && <div className="fl-kpi-sub">{sub}</div>}
      {children}
      <svg className="fl-kpi-wave" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,28 C40,12 70,36 110,22 C145,10 170,16 200,8 L200,40 L0,40 Z" />
        <path d="M0,34 C50,22 80,40 120,30 C155,22 178,26 200,20 L200,40 L0,40 Z" />
      </svg>
    </>
  );
  return onClick ? (
    <button type="button" className={`fl-kpi tone-${tone}`} onClick={onClick}>{body}</button>
  ) : (
    <div className={`fl-kpi tone-${tone}`}>{body}</div>
  );
}

/** Trend chip: up / down arrow with a short label. good = the change is an improvement. */
export function TrendChip({ delta, good, label }: { delta: number; good: boolean; label: string }) {
  if (delta === 0) return <span className="fl-trend is-flat">No change {label}</span>;
  return (
    <span className={`fl-trend ${good ? "is-good" : "is-bad"}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d={delta > 0 ? "M6 2.5 10 8H2z" : "M6 9.5 2 4h8z"} fill="currentColor" /></svg>
      {delta > 0 ? "+" : ""}{delta} {label}
    </span>
  );
}

/** Card with a header (title, optional note and tools) and body. */
export function FlCard({ title, note, tools, children, className = "", style }: { title?: ReactNode; note?: ReactNode; tools?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`fl-card ${className}`} style={style}>
      {(title || tools) && (
        <div className="fl-card-head">
          <div>{title && <h3>{title}</h3>}{note && <p>{note}</p>}</div>
          {tools && <div className="fl-card-tools">{tools}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Segmented time-range selector. */
export function RangeTabs<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="fl-seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="tab" aria-selected={o.v === value} className={o.v === value ? "is-on" : ""} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Colourful quick-action tile. */
export function QuickAction({ tone, icon, label, note, onClick }: { tone: FlTone; icon: ReactNode; label: string; note?: string; onClick: () => void }) {
  return (
    <button type="button" className={`fl-qa tone-${tone}`} onClick={onClick}>
      <span className={`fl-ico lg tone-${tone}`}>{icon}</span>
      <span className="fl-qa-label">{label}</span>
      {note && <span className="fl-qa-note">{note}</span>}
    </button>
  );
}
