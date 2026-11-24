import { useEffect, useMemo, useRef, useState } from "react";
import { FAQ, type FaqItem } from "./faq";

// Help › Frequently Asked Questions: the MMS FAQ inside the app (inline documentation).
// Answers are written with simple line markup (see faq.ts) and shown as paragraphs, bullets and numbered steps.
// Search, pick a topic, or see the questions for the screen you are on first.

const FAQ_CSS = `
.faq-dialog { width: min(820px, 100%); height: min(720px, calc(100vh - 40px)); }
.faq-tools { display: flex; flex-direction: column; gap: 10px; padding: 4px 22px 10px; border-bottom: 1px solid var(--sup-line); }
.sup-root .faq-search { all: unset; box-sizing: border-box; width: 100%; padding: 9px 12px !important; border-radius: 10px !important; border: 1px solid var(--sup-line) !important;
  background: color-mix(in srgb, var(--text, #1a1d1f) 3%, var(--sup-card)) !important; color: var(--text) !important; font: 13.5px/1.3 var(--sup-font) !important; }
.sup-root .faq-search:focus { border-color: var(--sup-blue) !important; }
.faq-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.sup-root .faq-chip { all: unset; box-sizing: border-box; padding: 4px 10px !important; border-radius: 999px !important; border: 1px solid var(--sup-line) !important; font: 600 12px/1.3 var(--sup-font) !important;
  color: var(--text-soft) !important; cursor: pointer; }
.sup-root .faq-chip.on { background: var(--sup-blue) !important; border-color: transparent !important; color: #fff !important; }
.faq-body { flex: 1; overflow: auto; padding: 6px 22px 16px; }
.faq-cat { margin: 14px 0 6px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-soft); }
.faq-item { border: 1px solid var(--sup-line); border-radius: 12px; margin-bottom: 6px; background: var(--sup-card); }
.faq-item[open] { border-color: color-mix(in srgb, var(--sup-blue) 40%, transparent); }
.faq-item summary { list-style: none; cursor: pointer; padding: 10px 14px; font-weight: 600; font-size: 13.5px; display: flex; gap: 10px; align-items: baseline; }
.faq-item summary::-webkit-details-marker { display: none; }
.faq-item summary::before { content: "+"; flex: none; width: 14px; color: var(--sup-blue); font-weight: 700; }
.faq-item[open] summary::before { content: "−"; }
.faq-a { padding: 0 14px 12px 38px; font-size: 13.5px; line-height: 1.55; }
.sup-root .faq-a p.faq-p { margin: 0 0 6px !important; }
.sup-root .faq-a ul.faq-list, .sup-root .faq-a ol.faq-list { margin: 2px 0 8px !important; padding-left: 22px !important; display: block !important; }
.sup-root .faq-a ul.faq-list { list-style: disc outside !important; }
.sup-root .faq-a ol.faq-list { list-style: decimal outside !important; }
.sup-root .faq-a .faq-list li { display: list-item !important; margin: 3px 0 !important; padding-left: 2px !important; }
.faq-who { display: inline-block; margin-top: 4px; font-size: 11.5px; color: var(--text-soft); }
.faq-empty { padding: 30px 0; text-align: center; color: var(--text-soft); }
.faq-count { font-size: 12px; color: var(--text-soft); }
.faq-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.faq-item mark { background: color-mix(in srgb, #f5c542 45%, transparent); color: inherit; border-radius: 3px; }
`;

const CATS = [...new Set(FAQ.map((f) => f.cat))];
const norm = (s: string) => s.toLowerCase();

function Hl({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

type Block = { t: "p" | "ul" | "ol"; items: string[] };
/** Turns an answer's line markup into paragraphs, bullet lists and numbered steps. */
function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const line of text.split("\n")) {
    const m = /^(- |\d+\. )(.*)$/.exec(line);
    const t: Block["t"] = !m ? "p" : m[1] === "- " ? "ul" : "ol";
    const body = (m ? m[2] : line).trim();
    if (!body) continue;
    const last = out[out.length - 1];
    if (t !== "p" && last && last.t === t) last.items.push(body);
    else out.push({ t, items: [body] });
  }
  return out;
}
function Answer({ text, words }: { text: string; words: string[] }) {
  return (
    <>
      {blocks(text).map((b, i) =>
        b.t === "p" ? <p key={i} className="faq-p"><Hl text={b.items[0]} words={words} /></p>
          : b.t === "ul" ? <ul key={i} className="faq-list">{b.items.map((x, j) => <li key={j}><Hl text={x} words={words} /></li>)}</ul>
          : <ol key={i} className="faq-list">{b.items.map((x, j) => <li key={j}><Hl text={x} words={words} /></li>)}</ol>)}
    </>
  );
}

export default function FaqModal({ screen, screenName, onClose }: { screen: string; screenName: string; onClose: () => void }) {
  const here = useMemo(() => FAQ.filter((f) => f.screens.includes(screen)), [screen]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>(here.length ? "here" : "all");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const words = norm(q).split(/\s+/).filter((w) => w.length > 1);
  const list: FaqItem[] = useMemo(() => {
    const base = words.length ? FAQ : cat === "here" ? here : cat === "all" ? FAQ : FAQ.filter((f) => f.cat === cat);
    if (!words.length) return base;
    return base.filter((f) => { const t = norm(`${f.q} ${f.a} ${f.cat} ${f.who}`); return words.every((w) => t.includes(w)); });
  }, [cat, here, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = CATS.map((c) => [c, list.filter((f) => f.cat === c)] as const).filter(([, l]) => l.length);

  return (
    <div className="sup-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{FAQ_CSS}</style>
      <div className="sup-dialog faq-dialog" role="dialog" aria-modal="true" aria-label="Frequently Asked Questions">
        <div className="sup-dialog-head">
          <span className="sup-dialog-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /><path d="M10 8.2a2 2 0 0 1 3.9.6c0 1.3-1.9 1.7-1.9 2.8M12 14h.01" /></svg></span>
          <h3>Frequently Asked Questions</h3>
          <button type="button" className="sup-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="faq-tools">
          <input ref={searchRef} className="faq-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, e.g. red tag, endorse, job number, backup" aria-label="Search questions" />
          {!words.length && (
            <div className="faq-chips" role="tablist">
              {here.length > 0 && <button type="button" className={`faq-chip${cat === "here" ? " on" : ""}`} onClick={() => setCat("here")}>On this screen · {screenName} ({here.length})</button>}
              <button type="button" className={`faq-chip${cat === "all" ? " on" : ""}`} onClick={() => setCat("all")}>All ({FAQ.length})</button>
              {CATS.map((c) => <button key={c} type="button" className={`faq-chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
            </div>
          )}
          <div className="faq-row">
            <span className="faq-count">{words.length ? `${list.length} answer${list.length === 1 ? "" : "s"} for "${q.trim()}"` : `${list.length} question${list.length === 1 ? "" : "s"}`}</span>
            <span className="faq-count">Not answered here? Help › Send to IT.</span>
          </div>
        </div>
        <div className="faq-body">
          {!list.length && <p className="faq-empty">No answer matches. Try fewer or different words.</p>}
          {groups.map(([c, l]) => (
            <section key={c}>
              <div className="faq-cat">{c}</div>
              {l.map((f) => (
                <details key={f.id} className="faq-item" open={words.length > 0 && list.length <= 3}>
                  <summary><span><Hl text={f.q} words={words} /></span></summary>
                  <div className="faq-a"><Answer text={f.a} words={words} /><span className="faq-who">For: {f.who}</span></div>
                </details>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
