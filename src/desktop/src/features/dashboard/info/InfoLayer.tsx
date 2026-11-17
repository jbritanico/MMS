import { useEffect, useRef, useState, type RefObject } from "react";
import { DASH_INFO, infoFor, manualSecs, type InfoResult, type ManualRef } from "./dashInfo";

// The (i) buttons on every dashboard card, and the popup that explains the card in plain words
// with the part of the MMS Manual it supports. The buttons are added to the card headings
// already on screen, so each dashboard does not need its own code for them.

const HOSTS = ".mrid-kpi-head, .mrid-panel-head, .fl-kpi-top, .fl-card-head, h2.fl-section-title, .fl-avail-head";

/** The heading text of a card, without the (i) button. */
function headText(host: Element): string {
  const pick =
    host.matches(".mrid-panel-head, .fl-card-head") ? host.querySelector("h3") :
    host.matches(".fl-kpi-top") ? host.querySelector(".fl-kpi-label") :
    host.matches(".mrid-kpi-head") ? host.querySelector(":scope > span:not(.instr-lamp):not(.info-dot):not(.mrid-target)") : host;
  const el = (pick ?? host).cloneNode(true) as Element;
  el.querySelectorAll(".info-dot").forEach((n) => n.remove());
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function makeDot(host: Element, onOpen: (title: string) => void) {
  const dot = document.createElement("span");
  dot.className = "info-dot";
  dot.setAttribute("role", "button");
  dot.tabIndex = 0;
  dot.textContent = "i";
  const label = () => `About: ${headText(host) || "this card"}`;
  dot.title = label();
  dot.setAttribute("aria-label", label());
  const open = (e: Event) => { e.preventDefault(); e.stopPropagation(); onOpen(headText(host)); };
  dot.addEventListener("click", open);
  dot.addEventListener("pointerdown", (e) => e.stopPropagation());
  dot.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") open(e); });
  dot.addEventListener("mouseenter", () => { dot.title = label(); });
  return dot;
}

/** Adds an (i) button to every card heading inside `root`, now and whenever new cards appear. */
export function useInfoDots(root: RefObject<HTMLElement | null>, scope: string | null, onOpen: (r: InfoResult) => void) {
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const attach = () => {
      el.querySelectorAll(HOSTS).forEach((host) => {
        if (host.querySelector(":scope > .info-dot, :scope > h3 ~ .info-dot")) return;
        if (host.closest(".info-pop, .fl-pop, .fl-header")) return;
        const dot = makeDot(host, (title) => openRef.current(infoFor(scopeRef.current, title)));
        const h3 = host.matches(".mrid-panel-head") ? host.querySelector(":scope > h3") : null;
        if (h3) h3.after(dot); else host.appendChild(dot);
      });
    };
    attach();
    let raf = 0;
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(attach); });
    mo.observe(el, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, [root]);
}

/** Header part: the manual sections for this dashboard and an "About this dashboard" button. */
export function DashInfoHead({ scope, onOpen }: { scope: string | null; onOpen: (r: InfoResult) => void }) {
  const dash = scope ? DASH_INFO[scope] : undefined;
  if (!dash) return null;
  const secs = manualSecs(scope);
  const open = () => onOpen({ title: dash.name, entry: dash, dash, generic: false });
  return (
    <div className="info-head">
      {secs.length > 0 && (
        <button type="button" className="info-manual" onClick={open} title="Parts of the MMS Manual (Rev. 02) this dashboard supports">
          <span className="info-book" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></svg>
          </span>
          Manual {secs.join(" · ")}
        </button>
      )}
      <button type="button" className="info-about" onClick={open}><span className="info-dot is-static" aria-hidden="true">i</span>About this dashboard</button>
    </div>
  );
}

function RefRow({ r }: { r: ManualRef }) {
  return (
    <li className={r.src === "doc" ? "is-doc" : ""}>
      <span className="info-sec">{r.sec}</span>
      <span className="info-refname">{r.name}</span>
      {r.page && <span className="info-page">p. {r.page}</span>}
    </li>
  );
}

/** The popup. */
export function InfoDialog({ info, onClose }: { info: InfoResult | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [last, setLast] = useState<Element | null>(null);
  useEffect(() => {
    if (!info) return;
    setLast(document.activeElement);
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [info, onClose]);
  useEffect(() => { if (!info && last instanceof HTMLElement) { last.focus(); setLast(null); } }, [info, last]);
  if (!info) return null;
  const { entry, dash, generic, title } = info;
  const manual = entry.refs.filter((r) => r.src !== "doc");
  const docs = entry.refs.filter((r) => r.src === "doc");
  const isDash = !!dash && title === dash.name && !generic;
  return (
    <div className="info-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="info-pop" role="dialog" aria-modal="true" aria-labelledby="info-pop-title">
        <div className="info-pop-head">
          <span className="info-dot is-static is-big" aria-hidden="true">i</span>
          <div>
            <span className="info-eyebrow">{isDash ? "About this dashboard" : dash ? `About this card · ${dash.name}` : "About this card"}</span>
            <h3 id="info-pop-title">{title || "This card"}</h3>
          </div>
          <button ref={closeRef} type="button" className="info-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="info-pop-body">
          {generic && <p className="info-note">There is no separate note for this card, so here is what the whole dashboard is about.</p>}
          <section><h4>What it shows</h4><p>{entry.what}</p></section>
          {entry.how && <section><h4>How to read it</h4><p>{entry.how}</p></section>}
          {entry.why && <section><h4>Why it matters</h4><p>{entry.why}</p></section>}
          <section>
            <h4>MMS Manual reference</h4>
            {manual.length ? <ul className="info-refs">{manual.map((r, i) => <RefRow key={i} r={r} />)}</ul>
              : <p className="info-muted">Not covered directly by the manual.</p>}
            <p className="info-muted">Maintenance Management Manual, SPC-MTN-OMN-01/v2, Rev. 02 (30 June 2026).</p>
          </section>
          {docs.length > 0 && (
            <section>
              <h4>Supporting documents</h4>
              <ul className="info-refs">{docs.map((r, i) => <RefRow key={i} r={r} />)}</ul>
            </section>
          )}
        </div>
        <div className="info-pop-foot"><button type="button" className="info-ok" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

export const INFO_CSS = `
.fl-shell .info-dot { all: unset; box-sizing: border-box; display: inline-grid; place-items: center; flex: none; width: 18px; height: 18px; border-radius: 50%;
  font: italic 700 11px/1 Georgia, "Times New Roman", serif; cursor: pointer; color: var(--fl-blue, var(--accent-blue));
  background: color-mix(in srgb, var(--fl-blue, var(--accent-blue)) 12%, transparent); border: 1px solid color-mix(in srgb, var(--fl-blue, var(--accent-blue)) 35%, transparent) !important;
  transition: background .15s, color .15s, transform .15s; }
.fl-shell .info-dot:hover, .fl-shell .info-dot:focus-visible { background: var(--fl-blue, var(--accent-blue)); color: #fff; transform: scale(1.08); }
.fl-shell .info-dot:focus-visible { outline: 2px solid var(--fl-blue, var(--accent-blue)); outline-offset: 2px; }
.fl-shell .info-dot.is-static { cursor: inherit; }
.fl-shell .info-dot.is-big { width: 30px; height: 30px; font-size: 16px; background: var(--fl-blue, var(--accent-blue)); color: #fff; }
.fl-shell .mrid-kpi-head > .info-dot, .fl-shell .fl-kpi-top > .info-dot, .fl-shell .fl-card-head > .info-dot { margin-left: auto; align-self: center; }
.fl-shell .mrid-panel-head > h3 + .info-dot { margin: 0 auto 2px 8px; align-self: center; }
.fl-shell h2.fl-section-title > .info-dot { margin-left: 8px; vertical-align: 1px; text-transform: none; letter-spacing: 0; }
.fl-shell .fl-card-head { align-items: flex-start; }

.fl-shell .info-head { display: flex; flex-wrap: wrap; gap: 6px 8px; margin-top: 6px; }
.fl-shell .info-manual, .fl-shell .info-about { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  font-size: 12px; font-weight: 600; padding: 3px 10px 3px 6px; border-radius: 999px; color: var(--fl-blue, var(--accent-blue));
  background: color-mix(in srgb, var(--fl-blue, var(--accent-blue)) 9%, transparent); border: 1px solid color-mix(in srgb, var(--fl-blue, var(--accent-blue)) 22%, transparent) !important; }
.fl-shell .info-manual:hover, .fl-shell .info-about:hover { background: color-mix(in srgb, var(--fl-blue, var(--accent-blue)) 16%, transparent); }
.fl-shell .info-manual:focus-visible, .fl-shell .info-about:focus-visible { outline: 2px solid var(--fl-blue, var(--accent-blue)); outline-offset: 2px; }
.fl-shell .info-book { display: inline-grid; width: 16px; height: 16px; } .fl-shell .info-book svg { width: 16px; height: 16px; }

.fl-shell .info-scrim { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px;
  background: color-mix(in srgb, #0b1220 42%, transparent); backdrop-filter: blur(3px); animation: info-fade calc(.18s * var(--fl-k, 1)) ease-out; }
.fl-shell .info-pop { width: min(560px, 100%); max-height: min(86vh, 760px); display: flex; flex-direction: column; overflow: hidden;
  background: var(--fl-card, var(--surface)); color: var(--text); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.12); animation: info-rise calc(.24s * var(--fl-k, 1)) cubic-bezier(.2,.8,.2,1); }
.fl-shell[data-motion="0"] .info-scrim, .fl-shell[data-motion="0"] .info-pop { animation: none; }
.fl-shell .info-pop-head { display: flex; gap: 12px; align-items: flex-start; padding: 18px 18px 12px; border-bottom: 1px solid var(--border); }
.fl-shell .info-pop-head > div { flex: 1; min-width: 0; }
.fl-shell .info-eyebrow { display: block; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-soft); }
.fl-shell .info-pop-head h3 { margin: 2px 0 0; font-size: 18px; font-weight: 600; line-height: 1.3; text-wrap: balance; }
.fl-shell .info-x { all: unset; cursor: pointer; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 8px; font-size: 22px; line-height: 1; color: var(--text-soft); }
.fl-shell .info-x:hover { background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--text); }
.fl-shell .info-x:focus-visible { outline: 2px solid var(--fl-blue, var(--accent-blue)); }
.fl-shell .info-pop-body { padding: 4px 18px 8px; overflow: auto; }
.fl-shell .info-pop-body section { padding: 12px 0; border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent); }
.fl-shell .info-pop-body section:last-child { border-bottom: 0; }
.fl-shell .info-pop-body h4 { margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--fl-blue, var(--accent-blue)); }
.fl-shell .info-pop-body p { margin: 0; font-size: 14px; line-height: 1.55; }
.fl-shell .info-pop-body .info-muted { margin-top: 8px; font-size: 12px; color: var(--text-soft); }
.fl-shell .info-note { margin: 12px 0 0 !important; padding: 8px 10px; border-radius: 8px; font-size: 12.5px !important; color: var(--text-soft);
  background: color-mix(in srgb, var(--warn) 10%, transparent); }
.fl-shell .info-refs { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.fl-shell .info-refs li { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: baseline; padding: 7px 10px; border-radius: 8px;
  background: color-mix(in srgb, var(--fl-blue, var(--accent-blue)) 6%, transparent); font-size: 13px; }
.fl-shell .info-refs li.is-doc { background: color-mix(in srgb, var(--text) 5%, transparent); }
.fl-shell .info-sec { font-weight: 700; color: var(--fl-blue, var(--accent-blue)); white-space: nowrap; }
.fl-shell .info-refs li.is-doc .info-sec { color: var(--text-soft); }
.fl-shell .info-refname { min-width: 0; }
.fl-shell .info-page { font-size: 12px; color: var(--text-soft); white-space: nowrap; }
.fl-shell .info-pop-foot { display: flex; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid var(--border); }
.fl-shell .info-ok { all: unset; cursor: pointer; padding: 7px 18px; border-radius: 8px; font-size: 13.5px; font-weight: 600; color: #fff; background: var(--fl-blue, var(--accent-blue)); }
.fl-shell .info-ok:hover { filter: brightness(1.08); } .fl-shell .info-ok:focus-visible { outline: 2px solid var(--fl-blue, var(--accent-blue)); outline-offset: 2px; }
@keyframes info-fade { from { opacity: 0; } }
@keyframes info-rise { from { opacity: 0; transform: translateY(10px) scale(.98); } }
@media (max-width: 520px) { .fl-shell .info-refs li { grid-template-columns: auto 1fr; } .fl-shell .info-page { grid-column: 2; } }
`;
