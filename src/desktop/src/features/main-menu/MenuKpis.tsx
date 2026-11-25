import { useEffect, useState, type KeyboardEvent } from "react";
import { Num, motionFactor, useMotion } from "../dashboard/fluent/motion";

// The two KPI cards on the left of the main menu, in the same style as the dashboard
// percentage cards: Fleet availability with a liquid level that rises to the percentage, and
// Open faults with a flowing wave. Colours follow the theme the user picked (surface, text,
// accent). Clicking either opens the dashboards.

const WAVE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='14' viewBox='0 0 120 14' preserveAspectRatio='none'%3E%3Cpath d='M0 7Q30 0 60 7T120 7V14H0Z'/%3E%3C/svg%3E")`;

/** Colour band of the liquid, same as the Overview hero (display only; the manual sets no target). */
const band = (p: number) => (p >= 85 ? "good" : p >= 70 ? "watch" : "low");

export function MenuKpis({ availability, notReady, openDefects, onOpen }: {
  availability: number;
  notReady: number;
  openDefects: number;
  onOpen: () => void;
}) {
  const motion = useMotion();
  const [level, setLevel] = useState(motion === 0 ? availability : 0);
  useEffect(() => { const r = requestAnimationFrame(() => setLevel(availability)); return () => cancelAnimationFrame(r); }, [availability]);
  const shown = Number.isInteger(Math.round(availability * 10) / 10) ? String(Math.round(availability)) : (Math.round(availability * 10) / 10).toFixed(1);
  const key = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } };

  return (
    <div className={`mk${motion === 0 ? " is-still" : ""}`} style={{ ["--mk-k" as string]: String(motionFactor(motion) || 1) }}>
      <style>{MK_CSS}</style>

      <div className={`mk-card mk-avail is-${band(availability)}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={key}
        aria-label={`Fleet availability ${shown} percent. Open the dashboards.`} style={{ ["--p" as string]: `${level}%` }}>
        <span className="mk-liquid-back" aria-hidden="true" />
        <span className="mk-liquid" aria-hidden="true"><span className="mk-bubbles"><i /><i /><i /></span></span>
        <span className="mk-label">Fleet availability</span>
        <span className="mk-value"><Num v={`${shown}%`} /></span>
        <span className="mk-sub">{notReady > 0 ? <><i className="mk-dot bad" />{notReady} unit{notReady === 1 ? "" : "s"} not ready</> : <><i className="mk-dot good" />All units ready</>}</span>
      </div>

      <div className={`mk-card mk-defects${openDefects > 0 ? " has-open" : ""}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={key}
        aria-label={`${openDefects} open faults. Open the dashboards.`}>
        <span className="mk-flow" aria-hidden="true" />
        <span className="mk-flow two" aria-hidden="true" />
        <span className="mk-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 20h20zM12 10v4M12 17h.01" /></svg>
        </span>
        <span className="mk-label">Open faults</span>
        <span className="mk-value"><Num v={openDefects} /></span>
        <span className="mk-sub">{openDefects > 0 ? "Waiting for a decision or repair" : "Nothing waiting"}</span>
      </div>
    </div>
  );
}

const MK_CSS = `
.mk { --mk-acc: var(--accent, var(--accent-blue, #2f6fed)); --mk-card: var(--neu-bg, var(--surface, #fff)); display: flex; flex-direction: column; gap: 14px; width: 210px;
  font-family: "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", Aptos, var(--sans, system-ui), sans-serif; }
/* Card colours come from the theme the user picked: its panel colour (--neu-bg, which every theme pairs with its text colour), text, border and accent. */
.mk-card { --liq: var(--mk-acc); position: relative; isolation: isolate; overflow: hidden; display: flex; flex-direction: column; gap: 2px; min-height: 128px; padding: 14px 16px 16px;
  border-radius: 20px; color: var(--text); cursor: pointer; outline: none;
  background: color-mix(in srgb, var(--mk-card) 86%, transparent); backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2);
  border: 1px solid color-mix(in srgb, var(--mk-acc) 22%, var(--border, rgba(0,0,0,.1)));
  box-shadow: 0 14px 30px color-mix(in srgb, var(--mk-acc) 16%, transparent), 0 2px 6px rgba(0,0,0,.10);
  transition: transform .18s ease, box-shadow .18s ease; }
.mk-card:hover { transform: translateY(-3px); box-shadow: 0 18px 36px color-mix(in srgb, var(--mk-acc) 24%, transparent), 0 2px 6px rgba(0,0,0,.12); }
.mk-card:focus-visible { box-shadow: 0 0 0 3px var(--mk-card), 0 0 0 6px var(--mk-acc); }
.mk-card::before { content: ""; position: absolute; z-index: -1; right: -60px; top: -80px; width: 200px; height: 200px; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--mk-acc) 18%, transparent), transparent 70%); }
.mk-card::after { content: ""; position: absolute; left: 0; top: 16px; bottom: 16px; width: 4px; border-radius: 0 4px 4px 0; background: var(--mk-acc); }
.mk-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-soft); }
.mk-value { font-size: 38px; font-weight: 750; line-height: 1.05; letter-spacing: -.03em; font-variant-numeric: tabular-nums; color: var(--text); }
.mk-sub { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12px; font-weight: 600; color: var(--text-soft); }
.mk-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 0%, transparent); }
.mk-dot.good { background: var(--success, #16a34a); } .mk-dot.bad { background: var(--danger, #dc2626); }

/* availability: liquid rising to the percentage */
/* the liquid takes the theme accent; it turns amber or red when availability is low */
.mk-avail.is-watch { --liq: var(--warn, #d97706); } .mk-avail.is-low { --liq: var(--danger, #dc2626); }
.mk-liquid, .mk-liquid-back { position: absolute; z-index: -1; left: 0; right: 0; bottom: 0; height: calc(var(--p) + 12px);
  -webkit-mask: ${WAVE} repeat-x 0 0 / 120px 14px, linear-gradient(#000 0 0) no-repeat 0 12px / 100% 100%;
  mask: ${WAVE} repeat-x 0 0 / 120px 14px, linear-gradient(#000 0 0) no-repeat 0 12px / 100% 100%;
  transition: height calc(1.8s / var(--mk-k)) cubic-bezier(.22,.8,.2,1); animation: mk-wave calc(3s / var(--mk-k)) linear infinite; }
.mk-liquid { background: linear-gradient(180deg, color-mix(in srgb, var(--liq) 42%, transparent), color-mix(in srgb, var(--liq) 18%, transparent)); }
.mk-liquid-back { height: calc(var(--p) + 18px); background: color-mix(in srgb, var(--liq) 16%, transparent); -webkit-mask-size: 170px 18px, 100% 100%; mask-size: 170px 18px, 100% 100%;
  -webkit-mask-position: 0 0, 0 16px; mask-position: 0 0, 0 16px; animation: mk-wave2 calc(5s / var(--mk-k)) linear infinite; }
.mk-bubbles { position: absolute; inset: 12px 0 0; overflow: hidden; }
.mk-bubbles i { position: absolute; bottom: -8px; width: 5px; height: 5px; border-radius: 50%; background: color-mix(in srgb, var(--liq) 55%, #fff); animation: mk-bubble calc(5s / var(--mk-k)) ease-in infinite; }
.mk-bubbles i:nth-child(1) { left: 18%; } .mk-bubbles i:nth-child(2) { left: 52%; width: 4px; height: 4px; animation-delay: -1.8s; } .mk-bubbles i:nth-child(3) { left: 80%; animation-delay: -3.3s; }

/* open faults: flowing wave along the bottom */
.mk-flow { position: absolute; z-index: -1; left: 0; right: 0; bottom: 0; height: 34px; background: color-mix(in srgb, var(--mk-acc) 18%, transparent);
  -webkit-mask: ${WAVE} repeat-x 0 0 / 140px 34px; mask: ${WAVE} repeat-x 0 0 / 140px 34px; animation: mk-flow calc(4s / var(--mk-k)) linear infinite; }
.mk-flow.two { height: 24px; background: color-mix(in srgb, var(--mk-acc) 12%, transparent); -webkit-mask-size: 200px 24px; mask-size: 200px 24px; animation-duration: calc(6.5s / var(--mk-k)); animation-direction: reverse; }
.mk-defects.has-open .mk-flow { background: color-mix(in srgb, var(--danger, #dc2626) 20%, transparent); }
.mk-defects.has-open::after { background: var(--danger, #dc2626); }
.mk-ico { position: absolute; right: 14px; top: 14px; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: var(--mk-acc); background: color-mix(in srgb, var(--mk-acc) 14%, transparent); }
.mk-ico svg { width: 18px; height: 18px; }
.mk-defects.has-open .mk-ico { color: #fff; background: var(--danger, #dc2626); }
.mk-avail.is-watch::after { background: var(--warn, #d97706); } .mk-avail.is-low::after { background: var(--danger, #dc2626); }

@keyframes mk-wave { from { -webkit-mask-position: 0 0, 0 12px; mask-position: 0 0, 0 12px; } to { -webkit-mask-position: 120px 0, 0 12px; mask-position: 120px 0, 0 12px; } }
@keyframes mk-wave2 { from { -webkit-mask-position: 0 0, 0 16px; mask-position: 0 0, 0 16px; } to { -webkit-mask-position: -170px 0, 0 16px; mask-position: -170px 0, 0 16px; } }
@keyframes mk-flow { from { -webkit-mask-position: 0 0; mask-position: 0 0; } to { -webkit-mask-position: 140px 0; mask-position: 140px 0; } }
@keyframes mk-bubble { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: .9; } 100% { transform: translateY(-110px); opacity: 0; } }
.mk.is-still *, .mk.is-still *::before { animation: none !important; transition: none !important; }
.mk.is-still .mk-bubbles { display: none; }
@media (prefers-reduced-motion: reduce) { .mk * { animation: none !important; } }
`;
