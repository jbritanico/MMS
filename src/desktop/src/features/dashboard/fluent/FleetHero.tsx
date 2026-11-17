import { useEffect, useState, type ReactNode } from "react";
import { Num } from "./motion";

// The Overview's main hero card: fleet availability (units Green, ready for service, out of all
// active units in view). Behind the card, a liquid rises from the bottom to the same percentage,
// like a liquid level gauge, with moving waves on its surface.

type Counts = { Green: number; Yellow: number; Red: number; None: number };

/** Colour band of the fill. Display only: the manual sets no availability target. */
const band = (p: number) => (p >= 85 ? "good" : p >= 70 ? "watch" : "low");

export function FleetHero({ tags, prevPct, greeting, chips, onOpenFleet }: {
  tags: Counts;
  /** Availability 30 days ago, from the tag history (null when unknown). */
  prevPct: number | null;
  greeting: ReactNode;
  chips?: ReactNode;
  onOpenFleet: () => void;
}) {
  const total = tags.Green + tags.Yellow + tags.Red + tags.None;
  const pct = total ? Math.round((tags.Green / total) * 1000) / 10 : 0;
  const shown = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  // Start empty and fill up once on screen, so the liquid visibly rises to the value.
  const [fill, setFill] = useState(0);
  useEffect(() => { const r = requestAnimationFrame(() => setFill(pct)); return () => cancelAnimationFrame(r); }, [pct]);
  const delta = prevPct == null ? null : Math.round((pct - prevPct) * 10) / 10;
  const stats: { key: keyof Counts; label: string; tone: string }[] = [
    { key: "Green", label: "Ready (Green)", tone: "green" },
    { key: "Yellow", label: "Under repair (Yellow)", tone: "amber" },
    { key: "Red", label: "Not ready (Red)", tone: "red" },
    { key: "None", label: "Not tagged", tone: "grey" },
  ];

  return (
    <section className={`fl-avail is-${band(pct)}`} style={{ ["--p" as string]: `${fill}%` }}>
      <style>{FLEET_HERO_CSS}</style>
      <div className="fl-avail-back" aria-hidden="true" />
      <div className="fl-avail-fill" role="progressbar" aria-label="Fleet availability" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span className="fl-avail-bubbles" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
      </div>
      <div className="fl-avail-gauge" aria-hidden="true">
        {[25, 50, 75].map((m) => <span key={m} style={{ bottom: `${m}%` }}><em>{m}%</em></span>)}
      </div>

      <div className="fl-avail-body">
        <div className="fl-avail-greet">{greeting}</div>
        <div className="fl-avail-head"><span className="fl-avail-title">Fleet availability</span></div>
        <div className="fl-avail-value"><Num v={`${shown}%`} /></div>
        <p className="fl-avail-text">
          <span>{total ? <><b>{tags.Green}</b> of <b>{total}</b> active unit{total === 1 ? " is" : "s are"} ready for service (Green tag).</> : <>No active units in view.</>}</span>
          {delta != null && total > 0 && (
            <span className={`fl-avail-trend ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`}>
              {delta === 0 ? "No change" : <>{delta > 0 ? "▲ +" : "▼ "}{delta} pts</>} vs 30 days ago
            </span>
          )}
        </p>
        {chips && <div className="fl-hero-chips">{chips}</div>}
      </div>

      <div className="fl-avail-side">
        {stats.map((s) => (
          <button key={s.key} type="button" className={`fl-avail-stat t-${s.tone}`} onClick={onOpenFleet} title="Open Fleet status by tag colour">
            <b><Num v={tags[s.key]} /></b><span>{s.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// One period of a sine wave, solid underneath: used as a mask so the liquid's surface moves like water.
const WAVE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='24' viewBox='0 0 240 24' preserveAspectRatio='none'%3E%3Cpath d='M0 12Q60 0 120 12T240 12V24H0Z'/%3E%3C/svg%3E")`;

const FLEET_HERO_CSS = `
.fl-avail { --liq: 52, 211, 153; position: relative; overflow: hidden; isolation: isolate; display: flex; flex-wrap: wrap; align-items: center; gap: 20px 28px;
  min-height: 200px; padding: 28px 32px; border-radius: var(--fl-r-xl, 22px); color: #fff;
  background: linear-gradient(118deg, var(--fl-navy, #0b2a6b) 0%, color-mix(in srgb, var(--fl-blue) 70%, var(--fl-navy, #0b2a6b)) 100%);
  box-shadow: 0 18px 40px color-mix(in srgb, var(--fl-blue) 26%, transparent); }
.fl-avail.is-watch { --liq: 251, 191, 36; }
.fl-avail.is-low { --liq: 248, 113, 113; }
.app[data-theme="dark"] .fl-avail, .app[data-theme="macos-dark"] .fl-avail {
  background: linear-gradient(118deg, color-mix(in srgb, var(--fl-blue) 22%, #0b1220) 0%, color-mix(in srgb, var(--fl-blue) 40%, #0b1220) 100%); box-shadow: 0 18px 40px rgba(0,0,0,.35); }

/* The liquid: one element whose top edge is cut into a wave by a mask, so wave and body are the same layer. */
.fl-avail-fill, .fl-avail-back { position: absolute; z-index: -1; left: 0; right: 0; bottom: 0; height: calc(var(--p) + 22px);
  -webkit-mask: ${WAVE} repeat-x 0 0 / 240px 24px, linear-gradient(#000 0 0) no-repeat 0 22px / 100% 100%;
  mask: ${WAVE} repeat-x 0 0 / 240px 24px, linear-gradient(#000 0 0) no-repeat 0 22px / 100% 100%;
  transition: height calc(2s / var(--fl-k, 1)) cubic-bezier(.22,.8,.2,1); animation: fl-liq-wave calc(3.4s / var(--fl-k, 1)) linear infinite; }
.fl-avail-fill { background: linear-gradient(180deg, rgba(var(--liq), .58) 0%, rgba(var(--liq), .4) 45%, rgba(var(--liq), .28) 100%); }
.fl-avail-back { height: calc(var(--p) + 30px); background: rgba(var(--liq), .22);
  -webkit-mask-size: 330px 30px, 100% 100%; mask-size: 330px 30px, 100% 100%; -webkit-mask-position: 0 0, 0 28px; mask-position: 0 0, 0 28px;
  animation: fl-liq-wave2 calc(5.6s / var(--fl-k, 1)) linear infinite; }
.fl-avail-fill::after { content: ""; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,.12) 45%, transparent 60%);
  background-size: 260% 100%; animation: fl-liq-shine calc(7s / var(--fl-k, 1)) linear infinite; }
.fl-avail-bubbles { position: absolute; inset: 22px 0 0; overflow: hidden; }
.fl-avail-bubbles i { position: absolute; bottom: -10px; width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,.4);
  animation: fl-liq-bubble calc(6s / var(--fl-k, 1)) ease-in infinite; }
.fl-avail-bubbles i:nth-child(1) { left: 8%; animation-delay: 0s; }
.fl-avail-bubbles i:nth-child(2) { left: 22%; width: 5px; height: 5px; animation-delay: -2.4s; }
.fl-avail-bubbles i:nth-child(3) { left: 41%; animation-delay: -4.1s; }
.fl-avail-bubbles i:nth-child(4) { left: 58%; width: 4px; height: 4px; animation-delay: -1.2s; }
.fl-avail-bubbles i:nth-child(5) { left: 74%; width: 6px; height: 6px; animation-delay: -5.1s; }
.fl-avail-bubbles i:nth-child(6) { left: 91%; width: 4px; height: 4px; animation-delay: -3.3s; }
@keyframes fl-liq-wave { from { -webkit-mask-position: 0 0, 0 22px; mask-position: 0 0, 0 22px; } to { -webkit-mask-position: 240px 0, 0 22px; mask-position: 240px 0, 0 22px; } }
@keyframes fl-liq-wave2 { from { -webkit-mask-position: 0 0, 0 28px; mask-position: 0 0, 0 28px; } to { -webkit-mask-position: -330px 0, 0 28px; mask-position: -330px 0, 0 28px; } }
@keyframes fl-liq-shine { from { background-position: 130% 0; } to { background-position: -130% 0; } }
@keyframes fl-liq-bubble { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 90% { opacity: .8; } 100% { transform: translateY(-260px); opacity: 0; } }
.fl-shell[data-motion="0"] .fl-avail *, .fl-shell[data-motion="0"] .fl-avail *::after { animation: none !important; transition: none !important; }
.fl-shell[data-motion="0"] .fl-avail-bubbles { display: none; }

.fl-avail-gauge { position: absolute; z-index: -1; inset: 0; pointer-events: none; }
.fl-avail-gauge span { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(255,255,255,.16); }
.fl-avail-gauge em { position: absolute; bottom: 3px; right: 12px; font-style: normal; font-size: 10.5px; font-weight: 600; opacity: .55; }

.fl-avail-body { position: relative; flex: 1 1 340px; min-width: 0; }
.fl-avail-greet { font-size: 13px; opacity: .85; margin-bottom: 6px; }
.fl-avail-head { display: flex; align-items: center; gap: 8px; }
.fl-avail-title { font-size: 12.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: .9; }
.fl-avail-value { font-size: clamp(48px, 6vw, 72px); font-weight: 750; line-height: 1; letter-spacing: -0.03em; margin: 6px 0 8px; font-variant-numeric: tabular-nums;
  text-shadow: 0 2px 18px rgba(0,0,0,.18); }
.fl-avail-text { margin: 0; font-size: 14.5px; line-height: 1.5; opacity: .95; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.fl-avail-trend { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700;
  background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.26); }
.fl-avail-trend.up { color: #b9f6d6; } .fl-avail-trend.down { color: #ffd0d0; }
.fl-avail .fl-hero-chips { margin-top: 14px; }

.fl-avail-side { position: relative; flex: 0 1 auto; display: grid; grid-template-columns: repeat(2, minmax(118px, 1fr)); gap: 10px; }
.fl-shell .fl-avail-stat { all: unset; box-sizing: border-box; cursor: pointer; padding: 12px 14px; border-radius: 16px; min-width: 118px;
  background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.24) !important; backdrop-filter: blur(8px); color: #fff; transition: background .15s, transform .15s; }
.fl-shell .fl-avail-stat:hover { background: rgba(255,255,255,.22); transform: translateY(-1px); }
.fl-shell .fl-avail-stat:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.fl-avail-stat b { display: block; font-size: 26px; font-weight: 700; line-height: 1.1; }
.fl-avail-stat span { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: .9; }
.fl-avail-stat span::before { content: ""; width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dot); box-shadow: 0 0 0 2px rgba(255,255,255,.25); }
.fl-avail-stat.t-green { --dot: #34d399; } .fl-avail-stat.t-amber { --dot: #fbbf24; } .fl-avail-stat.t-red { --dot: #f87171; } .fl-avail-stat.t-grey { --dot: #cbd5e1; }
.fl-shell .fl-avail .info-dot { color: #fff; background: rgba(255,255,255,.18); border-color: rgba(255,255,255,.45) !important; }
.fl-shell .fl-avail .info-dot:hover { background: #fff; color: var(--fl-blue); }
@media (max-width: 640px) { .fl-avail { padding: 22px 18px; } .fl-avail-side { width: 100%; } }
`;
