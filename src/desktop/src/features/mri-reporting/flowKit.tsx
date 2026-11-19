import type { ReactNode } from "react";
import { useMotion } from "../dashboard/fluent/motion";

// Shared look for the Document flow (one report) and the Asset history flow (one unit):
// Fluent 2 cards, plain-language step labels, colour-coded status chips and flowing links,
// built from the app's theme tokens so both screens follow the theme the user picked.

export type Tone = "neutral" | "danger" | "warn" | "success" | "info";

export const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--text-soft)",
  danger: "var(--danger)",
  warn: "var(--warn)",
  success: "var(--success)",
  info: "var(--accent-blue, #2f6fed)",
};

/** Something the user can open from a card: a screen, another flow, the report. */
/** `edit` = opens a screen where data can be changed; hidden when the flow is view-only. */
export interface FlowAction { label: string; run: () => void; needs?: string[]; any?: boolean; edit?: boolean }

/** Everything the details panel shows for one card. */
export interface FlowItem {
  id: string;
  icon: keyof typeof ICONS;
  tone: Tone;
  step?: string;
  title: string;
  chip?: string;
  lines: string[];
  details: [string, string][];
  open?: FlowAction;
  also?: FlowAction;
  /** A future step that has not happened yet: drawn faded, not selectable. */
  ghost?: boolean;
  /** Own picture and colour instead of the line icon, e.g. a counter's icon so it matches
   *  Asset MR-I History and the Asset Registry. */
  glyph?: { node: ReactNode; color: string; bg: string };
}

export const ICONS = {
  unit: "M3 7h11v9H3zM14 10h4l3 3v3h-7zM6.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  report: "M7 3h7l4 4v14H7zM14 3v4h4",
  fault: "M12 3.5 22 20H2zM12 10v4.5M12 17.3h.01",
  decision: "M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  waiting: "M12 7v5l4 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  repair: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  done: "M5 13l4 4 10-10",
  tag: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  cost: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3.2 6 1.8 6 5 0 1.4-1.3 2.7-3 2.7s-3-1.1-3-2.5M12 5v2M12 17v2",
  carried: "M4 12h13M13 6l6 6-6 6M4 5v14",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  counter: "M4 15a8 8 0 1 1 16 0M12 15l4-5",
  close: "M6 6l12 12M18 6 6 18",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 18l-6-6 6-6",
};

/** Card icon: the item's own glyph (counters) or its line icon, in a tinted square. */
function ItemIcon({ item, large = false }: { item: FlowItem; large?: boolean }) {
  if (item.glyph) {
    return (
      <span className={`fx-ico fx-glyph${large ? " lg" : ""}`} style={{ color: item.glyph.color, background: item.glyph.bg }}>
        {item.glyph.node}
      </span>
    );
  }
  return <span className={`fx-ico${large ? " lg" : ""}`}><Icon name={item.icon} size={large ? 22 : 20} /></span>;
}

export const Icon = ({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
);

// ---- dates and labels ----
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const toDate = (raw: string | number | null | undefined): Date | null => {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = Number(raw);
  const d = !isNaN(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
};
/** 04 Nov 2026 */
export const day = (raw: string | number | null | undefined) => {
  const d = toDate(raw);
  return d ? `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} ${d.getFullYear()}` : raw ? String(raw) : "—";
};
/** 04 Nov 2026, 14:05 */
export const when = (raw: string | number | null | undefined) => {
  const d = toDate(raw);
  return d ? `${day(raw)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : raw ? String(raw) : "—";
};
/** Severity as named in the Manual, Table 3. */
export const sevName = (s: string | null | undefined) => (!s ? "—" : /crit|major/i.test(s) ? "Major / Critical" : s);
export const sevTone = (s: string | null | undefined): Tone => (!s ? "neutral" : /crit|major/i.test(s) ? "danger" : /mod/i.test(s) ? "warn" : "info");
/** Tag colours in plain words (Manual §8.1). */
export const TAG_INFO: Record<string, { tone: Tone; plain: string }> = {
  Green: { tone: "success", plain: "Ready for service" },
  Yellow: { tone: "warn", plain: "Under maintenance" },
  Red: { tone: "danger", plain: "Not ready for service" },
};
export const tagInfo = (t: string | null | undefined) => (t && TAG_INFO[t]) || { tone: "neutral" as Tone, plain: "No inspection result yet" };

export const canRun = (a: FlowAction | undefined, permissions: string[]) =>
  !!a && (!a.needs || (a.any ? a.needs.some((p) => permissions.includes(p)) : a.needs.every((p) => permissions.includes(p))));

// ---- building blocks ----

/** One card in a flow. */
export function FlowCard({ item, selected, onSelect, compact }: { item: FlowItem; selected: boolean; onSelect: (id: string) => void; compact?: boolean }) {
  const col = TONE_COLOR[item.tone];
  return (
    <div
      className={`fx-card${selected ? " is-sel" : ""}${item.ghost ? " is-ghost" : ""}${compact ? " is-compact" : ""}`}
      style={{ ["--tone" as string]: col }}
      role={item.ghost ? undefined : "button"}
      tabIndex={item.ghost ? -1 : 0}
      aria-pressed={item.ghost ? undefined : selected}
      aria-label={`${item.step ? item.step + ": " : ""}${item.title}${item.chip ? ", " + item.chip : ""}`}
      onClick={() => !item.ghost && onSelect(item.id)}
      onKeyDown={(e) => { if (!item.ghost && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(item.id); } }}
    >
      <div className="fx-card-top">
        <ItemIcon item={item} />
        <div className="fx-card-head">
          {item.step && <span className="fx-step">{item.step}</span>}
          <b className="fx-title" title={item.title}>{item.title}</b>
        </div>
      </div>
      {item.chip && <span className="fx-chip"><i />{item.chip}</span>}
      {item.lines.filter(Boolean).slice(0, compact ? 2 : 3).map((l, i) => <span key={i} className="fx-line" title={l}>{l}</span>)}
    </div>
  );
}

/** The arrow between two cards. `live` = the work after it is still open (moving dots). */
export function FlowLink({ tone = "neutral", live, label, vertical }: { tone?: Tone; live?: boolean; label?: string; vertical?: boolean }) {
  const motion = useMotion();
  return (
    <div className={`fx-link${vertical ? " is-v" : ""}${live ? " is-live" : ""}`} style={{ ["--tone" as string]: TONE_COLOR[tone] }} aria-hidden="true">
      <span className="fx-link-line">{live && motion > 0 && <><i /><i /><i /></>}</span>
      <span className="fx-link-head" />
      {label && <span className="fx-link-label">{label}</span>}
    </div>
  );
}

/** The "where is this report" stepper. */
export function Stepper({ steps }: { steps: { label: string; sub?: string; state: "done" | "now" | "todo" | "skip" }[] }) {
  return (
    <ol className="fx-stepper">
      {steps.map((s, i) => (
        <li key={i} className={`is-${s.state}`}>
          <span className="fx-dot">{s.state === "done" ? <Icon name="done" size={14} /> : s.state === "skip" ? "–" : i + 1}</span>
          <span className="fx-step-text"><b>{s.label}</b>{s.sub && <small>{s.sub}</small>}</span>
          {s.state === "now" && <span className="fx-here">You are here</span>}
        </li>
      ))}
    </ol>
  );
}

/** Details of the selected card, with the buttons to open its screen. */
export function DetailPanel({ item, permissions, onClose, viewOnly }: { item: FlowItem | null; permissions: string[]; onClose: () => void; viewOnly?: boolean }) {
  if (!item) {
    return (
      <aside className="fx-detail is-empty">
        <span className="fx-detail-hint"><Icon name="arrow" size={18} />Select a card to see its details and open its screen.</span>
      </aside>
    );
  }
  const col = TONE_COLOR[item.tone];
  // View-only (opened from the dashboards): screens where data can be changed are not offered.
  const open = viewOnly && item.open?.edit ? undefined : item.open;
  const also = viewOnly && item.also?.edit ? undefined : item.also;
  const hidden = viewOnly && ((item.open?.edit ?? false) || (item.also?.edit ?? false));
  const ok = canRun(open, permissions);
  return (
    <aside className="fx-detail" style={{ ["--tone" as string]: col }} aria-live="polite">
      <div className="fx-detail-head">
        <ItemIcon item={item} large />
        <div>
          {item.step && <span className="fx-step">{item.step}</span>}
          <h2>{item.title}</h2>
          {item.chip && <span className="fx-chip"><i />{item.chip}</span>}
        </div>
        <button type="button" className="fx-x" aria-label="Close details" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <dl className="fx-dl">
        {item.details.map(([k, v], i) => (
          <div key={i}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {(open || also) && (
        <div className="fx-actions">
          {open && (
            <button type="button" className="fx-btn primary" onClick={open.run} disabled={!ok} title={!ok ? "Your role doesn't have access to that screen" : undefined}>
              {open.label}<Icon name="arrow" size={15} />
            </button>
          )}
          {also && <button type="button" className={`fx-btn${open ? "" : " primary"}`} onClick={also.run}>{also.label}</button>}
          {open && !ok && <small className="fx-muted">Your role doesn't have access to that screen.</small>}
        </div>
      )}
      {hidden && <small className="fx-viewonly"><Icon name="shield" size={14} />View only. Screens where this can be changed are not opened from the dashboards.</small>}
    </aside>
  );
}

export function Section({ title, hint, children, aside }: { title: string; hint?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="fx-section">
      <div className="fx-section-head">
        <div><h3>{title}</h3>{hint && <p>{hint}</p>}</div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Legend({ items }: { items: { tone: Tone; text: string }[] }) {
  return (
    <div className="fx-legend" aria-label="What the colours mean">
      {items.map((it, i) => <span key={i} style={{ ["--tone" as string]: TONE_COLOR[it.tone] }}><i />{it.text}</span>)}
    </div>
  );
}

export const FX_CSS = `
.fx { --fx-card: var(--surface, #fff); --fx-line: color-mix(in srgb, var(--text, #1a1d1f) 10%, transparent);
  --fx-blue: var(--accent-blue, #2f6fed); --fx-font: "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", Aptos, system-ui, sans-serif;
  --fx-shadow: 0 1px 2px color-mix(in srgb, #000 6%, transparent), 0 6px 18px color-mix(in srgb, #000 7%, transparent);
  font-family: var(--fx-font); color: var(--text); display: flex; flex-direction: column; gap: 16px; }
.fx * { box-sizing: border-box; }
.fx-back { all: unset; cursor: pointer; align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px;
  font: 600 12.5px var(--fx-font); color: var(--fx-blue); background: color-mix(in srgb, var(--fx-blue) 9%, transparent); }
.fx-back:hover { background: color-mix(in srgb, var(--fx-blue) 15%, transparent); }
.fx-back:focus-visible { outline: 2px solid var(--fx-blue); outline-offset: 2px; }
.fx-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.fx-hint-btn { all: unset; cursor: pointer; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: var(--text-soft);
  background: var(--fx-card); border: 1px solid var(--fx-line); box-shadow: var(--fx-shadow); }
.fx-hint-btn svg { width: 18px; height: 18px; }
.fx-hint-btn:hover { color: var(--fx-blue); }
.fx-hint-btn.is-on { color: #fff; background: var(--st-amber, #d97706); border-color: transparent; }
.fx-hint-btn:focus-visible { outline: 2px solid var(--fx-blue); outline-offset: 2px; }
/* hint and explainer texts only when the lightbulb is on */
.fx:not(.show-hints) .fx-hero p, .fx:not(.show-hints) .fx-section-head p, .fx:not(.show-hints) .fx-legend,
.fx:not(.show-hints) .fx-detail-hint, .fx:not(.show-hints) .fx-viewonly { display: none !important; }
.fx:not(.show-hints) .fx-detail.is-empty { display: none; }

/* hero */
.fx-hero { position: relative; overflow: hidden; display: flex; flex-wrap: wrap; align-items: center; gap: 18px 24px; padding: 22px 24px; border-radius: 20px; color: #fff;
  background: linear-gradient(118deg, color-mix(in srgb, var(--fx-blue) 70%, #0b1b3a) 0%, var(--fx-blue) 55%, color-mix(in srgb, var(--fx-blue) 55%, #22c1c3) 100%);
  box-shadow: 0 16px 36px color-mix(in srgb, var(--fx-blue) 24%, transparent); }
.app[data-theme="dark"] .fx-hero, .app[data-theme="macos-dark"] .fx-hero { background: linear-gradient(118deg, color-mix(in srgb, var(--fx-blue) 26%, #0b1220), color-mix(in srgb, var(--fx-blue) 48%, #0b1220)); }
.fx-hero::after { content: ""; position: absolute; right: -80px; top: -120px; width: 360px; height: 360px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,.18), transparent 70%); pointer-events: none; }
.fx-hero-pic { width: 72px; height: 72px; flex: none; border-radius: 18px; display: grid; place-items: center; background: rgba(255,255,255,.92); padding: 6px; }
.fx-hero-pic img { width: 100%; height: 100%; object-fit: contain; }
.fx-hero-pic svg { width: 36px; height: 36px; color: var(--fx-blue); }
.fx-hero-body { position: relative; flex: 1 1 320px; min-width: 0; }
.fx-eyebrow { font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
.fx-hero h1 { margin: 4px 0 0 !important; font: 700 clamp(22px, 2.4vw, 28px)/1.15 var(--fx-font) !important; letter-spacing: -.02em; color: #fff !important; text-transform: none !important; }
.fx-hero p { margin: 6px 0 0; font-size: 14px; line-height: 1.5; opacity: .95; max-width: 680px; }
.fx-now { margin-top: 12px; display: inline-flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: 14px; font-size: 14px; font-weight: 600;
  background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.28); backdrop-filter: blur(6px); }
.fx-now svg { flex: none; }
.fx-hero-stats { position: relative; display: flex; flex-wrap: wrap; gap: 10px; }
.fx-stat { min-width: 112px; padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.26); }
.fx-stat b { display: block; font-size: 24px; line-height: 1.1; }
.fx-stat span { font-size: 12px; opacity: .9; }
.fx-tagbig { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; padding: 6px 14px 6px 8px; border-radius: 999px; background: rgba(255,255,255,.95); color: #1a1d1f; font-size: 13px; font-weight: 700; }
.fx-tagbig i { width: 18px; height: 18px; border-radius: 50%; background: var(--tone); box-shadow: 0 0 0 4px color-mix(in srgb, var(--tone) 25%, transparent); }
.fx-tagbig small { font-weight: 500; color: #555; }

/* stepper */
.fx-stepper { list-style: none; margin: 0; padding: 14px 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;
  background: var(--fx-card); border: 1px solid var(--fx-line); border-radius: 18px; box-shadow: var(--fx-shadow); }
.fx-stepper li { position: relative; display: flex; align-items: flex-start; gap: 10px; padding: 6px 4px; }
.fx-stepper li + li::before { content: ""; position: absolute; left: -10px; top: 19px; width: 10px; height: 2px; background: var(--fx-line); }
.fx-dot { width: 28px; height: 28px; flex: none; border-radius: 50%; display: grid; place-items: center; font: 700 12px var(--fx-font);
  color: var(--text-soft); background: color-mix(in srgb, var(--text-soft) 12%, transparent); border: 2px solid transparent; }
.fx-stepper .is-done .fx-dot { background: var(--success); color: #fff; }
.fx-stepper .is-now .fx-dot { background: var(--fx-card); color: var(--fx-blue); border-color: var(--fx-blue); box-shadow: 0 0 0 4px color-mix(in srgb, var(--fx-blue) 18%, transparent); }
.fx-stepper .is-skip { opacity: .55; }
.fx-step-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.fx-step-text b { font-size: 13px; }
.fx-step-text small { font-size: 11.5px; color: var(--text-soft); }
.fx-here { position: absolute; right: 2px; top: -8px; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; color: #fff; background: var(--fx-blue); }
.fx-stepper .is-now { }

/* layout: content + details */
.fx-body { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
@container (max-width: 1080px) { .fx-body { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 1180px) { .fx-body { grid-template-columns: minmax(0, 1fr); } }
.fx-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

.fx-section { padding: 16px 18px 18px; border-radius: 18px; background: var(--fx-card); border: 1px solid var(--fx-line); box-shadow: var(--fx-shadow); min-width: 0; }
.fx-section-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 8px 16px; margin-bottom: 14px; }
.fx-section-head h3 { margin: 0 !important; font: 650 16px var(--fx-font) !important; color: var(--text) !important; text-transform: none !important; letter-spacing: -.01em !important; }
.fx-section-head p { margin: 3px 0 0; font-size: 12.5px; color: var(--text-soft); }

/* lanes: card → link → card → link → card */
.fx-lanes { display: flex; flex-direction: column; gap: 14px; }
.fx-lane { display: grid; grid-template-columns: minmax(170px, 1fr) 56px minmax(170px, 1fr) 56px minmax(170px, 1fr) 42px auto; align-items: stretch;
  padding: 10px; border-radius: 16px; background: color-mix(in srgb, var(--tone, var(--fx-blue)) 4%, transparent); border: 1px dashed color-mix(in srgb, var(--tone, var(--fx-blue)) 22%, transparent); }
.fx-lane-end { display: flex; align-items: center; }
.fx-endcap { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap;
  color: var(--tone); background: color-mix(in srgb, var(--tone) 13%, transparent); border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent); }
@media (max-width: 900px) { .fx-lane { grid-template-columns: 1fr; } .fx-lane .fx-link { height: 30px; } .fx-lane .fx-link:not(.is-v) .fx-link-line { left: 50%; right: auto; top: 0; bottom: 6px; width: 2px; height: auto; }
  .fx-lane .fx-link-head { left: calc(50% - 5px); right: auto; top: auto; bottom: 0; transform: rotate(90deg); } }

/* cards */
.fx-card { position: relative; display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 12px 14px 12px 16px; border-radius: 14px; cursor: pointer;
  background: var(--fx-card); border: 1px solid var(--fx-line); box-shadow: var(--fx-shadow); transition: transform .15s ease, box-shadow .15s ease, border-color .15s; outline: none; }
.fx-card::before { content: ""; position: absolute; left: 0; top: 12px; bottom: 12px; width: 4px; border-radius: 0 4px 4px 0; background: var(--tone); }
.fx-card:hover { transform: translateY(-2px); box-shadow: 0 2px 4px color-mix(in srgb, #000 8%, transparent), 0 12px 28px color-mix(in srgb, #000 12%, transparent); }
.fx-card:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--fx-blue) 40%, transparent), var(--fx-shadow); }
.fx-card.is-sel { border-color: var(--fx-blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--fx-blue) 22%, transparent), var(--fx-shadow); }
.fx-card.is-ghost { cursor: default; background: transparent; box-shadow: none; border-style: dashed; opacity: .75; }
.fx-card.is-ghost:hover { transform: none; }
.fx-card.is-ghost::before { background: var(--fx-line); }
.fx-card-top { display: flex; align-items: center; gap: 10px; min-width: 0; }
.fx-ico { width: 34px; height: 34px; flex: none; border-radius: 10px; display: grid; place-items: center; color: var(--tone); background: color-mix(in srgb, var(--tone) 14%, transparent); }
.fx-ico.lg { width: 44px; height: 44px; border-radius: 13px; }
.fx-glyph svg { width: 20px; height: 20px; } .fx-glyph.lg svg { width: 24px; height: 24px; }
.fx-card-head { display: flex; flex-direction: column; min-width: 0; }
.fx-step { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-soft); }
.fx-title { font-size: 13.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fx-chip { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700;
  color: var(--tone); background: color-mix(in srgb, var(--tone) 13%, transparent); }
.fx-chip i { width: 7px; height: 7px; border-radius: 50%; background: var(--tone); }
.fx-line { font-size: 12px; color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fx-card.is-compact { padding: 10px 12px 10px 14px; }

/* links */
.fx-link { position: relative; min-width: 30px; min-height: 30px; align-self: center; height: 100%; }
.fx-link-line { position: absolute; left: 4px; right: 10px; top: 50%; height: 2px; transform: translateY(-50%); background: color-mix(in srgb, var(--tone) 55%, transparent); overflow: visible; }
.fx-link.is-live .fx-link-line { background: repeating-linear-gradient(90deg, var(--tone) 0 6px, transparent 6px 11px); background-size: 22px 2px; animation: fx-dash 1s linear infinite; }
.fx-link-head { position: absolute; right: 2px; top: calc(50% - 5px); width: 0; height: 0; border-left: 9px solid color-mix(in srgb, var(--tone) 80%, transparent); border-top: 5px solid transparent; border-bottom: 5px solid transparent; }
.fx-link-line i { position: absolute; top: -3px; left: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--tone); box-shadow: 0 0 6px var(--tone); animation: fx-flow 2.2s linear infinite; opacity: 0; }
.fx-link-line i:nth-child(2) { animation-delay: .73s; } .fx-link-line i:nth-child(3) { animation-delay: 1.46s; }
.fx-link-label { position: absolute; left: 50%; top: calc(50% + 8px); transform: translateX(-50%); font-size: 10.5px; font-weight: 700; white-space: nowrap; color: var(--tone); }
.fx-link.is-v { height: 26px; min-height: 26px; width: 100%; }
.fx-link.is-v .fx-link-line { left: 50%; right: auto; top: 0; bottom: 8px; width: 2px; height: auto; transform: none; }
.fx-link.is-v .fx-link-head { left: calc(50% - 4px); right: auto; top: auto; bottom: 0; transform: rotate(90deg); }
@keyframes fx-dash { to { background-position: 22px 0; } }
@keyframes fx-flow { 0% { left: 0; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { left: calc(100% - 8px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fx-link-line i { display: none; } .fx-link.is-live .fx-link-line { animation: none; } .fx-card { transition: none; } }

/* small card grids */
.fx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }

/* tag history pills */
.fx-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.fx-tagpill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px 5px 6px; border-radius: 999px; font-size: 12px; font-weight: 650;
  background: color-mix(in srgb, var(--tone) 12%, var(--fx-card)); border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent); }
.fx-tagpill i { width: 14px; height: 14px; border-radius: 50%; background: var(--tone); }
.fx-tagpill small { color: var(--text-soft); font-weight: 500; }
.fx-tag-arrow { color: var(--text-soft); }
.fx-tags.is-click { cursor: pointer; padding: 8px 10px; border-radius: 12px; outline: none; }
.fx-tags.is-click:hover, .fx-tags.is-click:focus-visible { background: color-mix(in srgb, var(--fx-blue) 6%, transparent); }
.fx-tags.is-sel { box-shadow: 0 0 0 2px var(--fx-blue); }

/* details */
.fx-detail { position: sticky; top: 8px; display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 18px; background: var(--fx-card);
  border: 1px solid var(--fx-line); border-top: 4px solid var(--tone, var(--fx-blue)); box-shadow: var(--fx-shadow); min-width: 0; }
.fx-detail.is-empty { border-top-color: var(--fx-line); }
.fx-detail-hint { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-soft); }
.fx-detail-head { display: flex; align-items: flex-start; gap: 12px; }
.fx-detail-head > div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.fx-detail-head h2 { margin: 0 !important; font: 650 16px/1.3 var(--fx-font) !important; color: var(--text) !important; text-transform: none !important; letter-spacing: 0 !important; }
.fx-x { all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--text-soft); }
.fx-x:hover { background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--text); }
.fx-dl { margin: 0; display: flex; flex-direction: column; }
.fx-dl > div { display: grid; grid-template-columns: minmax(96px, 40%) 1fr; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--fx-line); font-size: 13px; }
.fx-dl dt { color: var(--text-soft); }
.fx-dl dd { margin: 0; overflow-wrap: anywhere; }
.fx-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.fx-btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px; font: 600 13px var(--fx-font);
  color: var(--fx-blue); background: color-mix(in srgb, var(--fx-blue) 9%, transparent); border: 1px solid color-mix(in srgb, var(--fx-blue) 22%, transparent); }
.fx-btn.primary { color: #fff; background: var(--fx-blue); border-color: var(--fx-blue); }
.fx-btn:hover { filter: brightness(1.06); }
.fx-btn:focus-visible { outline: 2px solid var(--fx-blue); outline-offset: 2px; }
.fx-btn[disabled] { opacity: .45; cursor: not-allowed; }
.fx-muted { color: var(--text-soft); font-size: 11.5px; }
.fx-viewonly { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 10px; font-size: 12px; color: var(--text-soft); background: color-mix(in srgb, var(--text-soft) 9%, transparent); }
.fx-badge { display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .04em; vertical-align: 3px; background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.35); }

/* legend */
.fx-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--text-soft); }
.fx-legend span { display: inline-flex; align-items: center; gap: 6px; }
.fx-legend i { width: 10px; height: 10px; border-radius: 3px; background: var(--tone); }

/* timeline (asset flow) */
.fx-timeline { display: flex; align-items: stretch; gap: 0; overflow-x: auto; padding: 4px 2px 12px; scroll-snap-type: x proximity; }
.fx-tl-item { flex: 0 0 224px; display: flex; flex-direction: column; gap: 10px; scroll-snap-align: start; }
.fx-tl-link { flex: 0 0 72px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 48px; gap: 4px; }
.fx-tl-link .fx-link { height: 30px; flex: none; width: 100%; }
.fx-tl-sub { display: flex; flex-direction: column; gap: 8px; }
.fx-carry { display: inline-flex; align-items: center; gap: 5px; align-self: center; margin-top: 2px; padding: 3px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; white-space: nowrap;
  color: var(--warn); background: color-mix(in srgb, var(--warn) 13%, transparent); border: 1px dashed color-mix(in srgb, var(--warn) 45%, transparent); }
.fx-empty { padding: 18px; text-align: center; font-size: 13px; color: var(--text-soft); border: 1px dashed var(--fx-line); border-radius: 14px; }

/* counters */
.fx-meter { height: 8px; border-radius: 999px; background: var(--fx-line); overflow: hidden; }
.fx-meter i { display: block; height: 100%; border-radius: 999px; background: var(--tone); }
`;
