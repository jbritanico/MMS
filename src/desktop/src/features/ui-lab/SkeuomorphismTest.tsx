import { useRef, useState } from "react";

// Skeuomorphism sample: controls that imitate real hardware -- brushed metal, leather, glass,
// screws, chrome bezels, lit LEDs, a rotary knob and an analogue gauge. Everything is CSS
// gradients and inline SVG (no images), scoped under .skeu-scene so it cannot leak into the app.
const CSS = `
.skeu-scene {
  --metal-1: #e9ebee; --metal-2: #c9cdd3; --metal-3: #9ea4ad;
  --ink: #2a2d31; --ink-soft: #5b616a;
  min-height: 100%; padding: 28px 24px 60px; box-sizing: border-box;
  background:
    radial-gradient(ellipse at 30% 0%, rgba(255,255,255,0.10), transparent 55%),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"),
    linear-gradient(180deg, #3b3027, #2a211b);
  color: var(--ink); font-family: "Segoe UI", system-ui, sans-serif;
}
.skeu-grid { display: grid; gap: 26px; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); max-width: 1180px; margin: 0 auto; }
.skeu-title { max-width: 1180px; margin: 0 auto 22px; color: #f3e6d2; text-shadow: 0 -1px 0 rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.12); }
.skeu-title h2 { margin: 0 0 4px; font-size: 22px; letter-spacing: 0.04em; }
.skeu-title p { margin: 0; font-size: 13px; color: #cdb79a; }

/* brushed-metal panel with four screws */
.skeu-panel {
  position: relative; padding: 26px 24px 24px; border-radius: 16px;
  background:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='b'><feTurbulence type='fractalNoise' baseFrequency='0.004 0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.35 0'/></filter><rect width='100%' height='100%' filter='url(%23b)'/></svg>"),
    linear-gradient(160deg, var(--metal-1), var(--metal-2) 55%, var(--metal-3));
  box-shadow: 0 18px 30px rgba(0,0,0,0.55), 0 2px 0 rgba(255,255,255,0.7) inset, 0 -3px 6px rgba(0,0,0,0.25) inset, 0 0 0 1px #6f757d;
}
.skeu-panel h3 { margin: 0 0 16px; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-soft);
  text-shadow: 0 1px 0 rgba(255,255,255,0.85); }
.skeu-screw { position: absolute; width: 12px; height: 12px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, #b9bec6 45%, #6d737b);
  box-shadow: 0 1px 2px rgba(0,0,0,0.6), 0 0 0 1px #5d636b inset; }
.skeu-screw::after { content: ""; position: absolute; left: 2px; right: 2px; top: 5px; height: 2px; background: #4a4f56; transform: rotate(var(--r, 35deg)); border-radius: 1px; }
.skeu-screw.tl { top: 9px; left: 9px; } .skeu-screw.tr { top: 9px; right: 9px; --r: -20deg; }
.skeu-screw.bl { bottom: 9px; left: 9px; --r: 70deg; } .skeu-screw.br { bottom: 9px; right: 9px; --r: 10deg; }

/* leather card with stitching */
.skeu-leather {
  position: relative; padding: 24px; border-radius: 16px; color: #f3e6d2;
  background:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='l'><feTurbulence type='turbulence' baseFrequency='0.7' numOctaves='3'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23l)'/></svg>"),
    linear-gradient(160deg, #8a4b2a, #6b3519 60%, #55290f);
  box-shadow: 0 16px 28px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.18) inset, 0 -2px 8px rgba(0,0,0,0.5) inset;
}
.skeu-leather::before { content: ""; position: absolute; inset: 9px; border: 2px dashed rgba(243,214,160,0.75); border-radius: 11px; pointer-events: none; }
.skeu-leather h3 { margin: 0 0 6px; font-size: 18px; text-shadow: 0 -1px 0 rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.15); }
.skeu-leather p { margin: 0 0 14px; font-size: 13px; color: #e2c9a4; }

/* embossed labels */
.skeu-label { display: block; margin-bottom: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); text-shadow: 0 1px 0 rgba(255,255,255,0.8); }
.skeu-field { margin-bottom: 16px; }

/* engraved text slot */
.skeu-input { width: 100%; box-sizing: border-box; padding: 10px 12px; font: inherit; font-size: 14px; color: #1b2a1b; border: 0; border-radius: 8px; outline: none;
  background: linear-gradient(180deg, #d3d8cf, #eef1ea);
  box-shadow: 0 3px 6px rgba(0,0,0,0.45) inset, 0 -1px 0 rgba(0,0,0,0.1) inset, 0 1px 0 rgba(255,255,255,0.9), 0 0 0 1px #8a9087; }
.skeu-input:focus { box-shadow: 0 3px 6px rgba(0,0,0,0.45) inset, 0 0 0 2px #e6a23c, 0 0 10px rgba(230,162,60,0.6); }
select.skeu-input { appearance: none; padding-right: 30px;
  background-image: linear-gradient(45deg, transparent 50%, #444 50%), linear-gradient(135deg, #444 50%, transparent 50%), linear-gradient(180deg, #d3d8cf, #eef1ea);
  background-position: calc(100% - 17px) 50%, calc(100% - 12px) 50%, 0 0; background-size: 5px 5px, 5px 5px, 100% 100%; background-repeat: no-repeat; }

/* convex push buttons */
.skeu-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.skeu-btn { min-width: 96px; padding: 11px 18px; font: inherit; font-weight: 700; font-size: 13px; letter-spacing: 0.04em; cursor: pointer; border-radius: 10px; border: 1px solid rgba(0,0,0,0.55);
  color: var(--ink); text-shadow: 0 1px 0 rgba(255,255,255,0.8);
  background: linear-gradient(180deg, #fdfdfd 0%, #dfe2e6 48%, #c3c8ce 52%, #d9dce1 100%);
  box-shadow: 0 4px 0 #7d838b, 0 7px 10px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.95) inset; transition: transform 60ms, box-shadow 60ms; }
.skeu-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 #7d838b, 0 2px 4px rgba(0,0,0,0.45), 0 2px 5px rgba(0,0,0,0.25) inset; }
.skeu-btn.green { color: #fff; text-shadow: 0 -1px 0 rgba(0,0,0,0.5); background: linear-gradient(180deg, #7fd68a 0%, #3fae52 48%, #2f9444 52%, #46b95a 100%); box-shadow: 0 4px 0 #1d6a2d, 0 7px 10px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.55) inset; }
.skeu-btn.red { color: #fff; text-shadow: 0 -1px 0 rgba(0,0,0,0.5); background: linear-gradient(180deg, #f08a82 0%, #d4382b 48%, #b82a1e 52%, #d9453a 100%); box-shadow: 0 4px 0 #7d1a11, 0 7px 10px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.5) inset; }
.skeu-btn.round { min-width: 0; width: 44px; height: 44px; padding: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
.skeu-btn.round svg { width: 20px; height: 20px; }

/* chrome toggle switch with a lever */
.skeu-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
.skeu-switch { position: relative; width: 74px; height: 34px; border-radius: 17px; border: 0; cursor: pointer; padding: 0;
  background: linear-gradient(180deg, #8d939b, #c4c8ce); box-shadow: 0 4px 8px rgba(0,0,0,0.6) inset, 0 1px 0 rgba(255,255,255,0.9), 0 0 0 1px #5c626a; }
.skeu-switch::before { content: "OFF"; position: absolute; right: 10px; top: 10px; font-size: 10px; font-weight: 800; color: #4a4f56; letter-spacing: 0.08em; }
.skeu-switch.on { background: linear-gradient(180deg, #2f8f46, #62c97a); }
.skeu-switch.on::before { content: "ON"; left: 12px; right: auto; color: #eaffee; text-shadow: 0 -1px 0 rgba(0,0,0,0.4); }
.skeu-switch .lever { position: absolute; top: 3px; left: 3px; width: 28px; height: 28px; border-radius: 50%; transition: left 140ms cubic-bezier(.4,1.4,.6,1);
  background: radial-gradient(circle at 35% 28%, #fff, #d9dce1 50%, #9aa0a8); box-shadow: 0 3px 5px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.9) inset; }
.skeu-switch.on .lever { left: 43px; }

/* fader (range) */
.skeu-range { -webkit-appearance: none; appearance: none; width: 100%; height: 12px; border-radius: 6px; outline: none;
  background: linear-gradient(180deg, #5a5f66, #9da3ab); box-shadow: 0 3px 5px rgba(0,0,0,0.6) inset, 0 1px 0 rgba(255,255,255,0.8); }
.skeu-range::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 34px; border-radius: 5px; cursor: grab; border: 1px solid #4a4f56;
  background: repeating-linear-gradient(90deg, transparent 0 4px, rgba(0,0,0,0.25) 4px 5px), linear-gradient(180deg, #fafafa, #cfd3d8 50%, #a9aeb5);
  box-shadow: 0 4px 6px rgba(0,0,0,0.55), 0 1px 0 #fff inset; }

/* chrome checkbox / radio */
.skeu-check { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 13px; cursor: pointer; text-shadow: 0 1px 0 rgba(255,255,255,0.8); }
.skeu-check input { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; margin: 0; cursor: pointer; display: grid; place-content: center;
  border-radius: 5px; background: linear-gradient(180deg, #8d939b, #d4d7dc); box-shadow: 0 2px 5px rgba(0,0,0,0.55) inset, 0 1px 0 #fff, 0 0 0 1px #5c626a; }
.skeu-check input[type=radio] { border-radius: 50%; }
.skeu-check input:checked::after { content: ""; width: 12px; height: 12px; border-radius: 3px; background: radial-gradient(circle at 35% 30%, #aef2b8, #2f9444); box-shadow: 0 0 8px #4cd964, 0 1px 1px rgba(0,0,0,0.5); }
.skeu-check input[type=radio]:checked::after { border-radius: 50%; }

/* index tabs */
.skeu-tabs { display: flex; gap: 4px; margin-bottom: -1px; position: relative; z-index: 1; }
.skeu-tab { padding: 8px 16px; font: inherit; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; cursor: pointer; border: 1px solid #6f757d; border-bottom: 0; border-radius: 9px 9px 0 0;
  color: var(--ink-soft); background: linear-gradient(180deg, #d8dbe0, #b6bbc2); box-shadow: 0 2px 0 rgba(255,255,255,0.7) inset; }
.skeu-tab.active { color: var(--ink); background: linear-gradient(180deg, #fbfbfb, #e5e8ec); padding-bottom: 10px; }
.skeu-tabbody { padding: 16px; border: 1px solid #6f757d; border-radius: 0 10px 10px 10px; background: linear-gradient(180deg, #e5e8ec, #d3d7dc); box-shadow: 0 2px 6px rgba(0,0,0,0.25) inset; font-size: 13px; min-height: 48px; }

/* LED lamps */
.skeu-leds { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; }
.skeu-led { display: flex; flex-direction: column; align-items: center; gap: 7px; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; color: var(--ink-soft); text-shadow: 0 1px 0 rgba(255,255,255,0.8); cursor: pointer; background: none; border: 0; padding: 0; }
.skeu-led i { width: 30px; height: 30px; border-radius: 50%; display: block; border: 3px solid #8b9199; box-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 0 0 1px #4a4f56; }
.skeu-led.red i { background: radial-gradient(circle at 35% 30%, #5a1511, #2b0907); }
.skeu-led.yellow i { background: radial-gradient(circle at 35% 30%, #5a4711, #2b2207); }
.skeu-led.green i { background: radial-gradient(circle at 35% 30%, #14501f, #082a10); }
.skeu-led.red.lit i { background: radial-gradient(circle at 35% 30%, #ffd6d1, #ff3b2f 45%, #b3140b); box-shadow: 0 0 14px 3px rgba(255,59,47,0.85), 0 2px 4px rgba(0,0,0,0.6); }
.skeu-led.yellow.lit i { background: radial-gradient(circle at 35% 30%, #fff3c2, #ffc928 45%, #b88a05); box-shadow: 0 0 14px 3px rgba(255,201,40,0.85), 0 2px 4px rgba(0,0,0,0.6); }
.skeu-led.green.lit i { background: radial-gradient(circle at 35% 30%, #d9ffe0, #36d65a 45%, #0e8a2d); box-shadow: 0 0 14px 3px rgba(54,214,90,0.85), 0 2px 4px rgba(0,0,0,0.6); }

/* knob + gauge */
.skeu-dials { display: flex; gap: 22px; align-items: center; justify-content: space-around; flex-wrap: wrap; }
.skeu-knob { position: relative; width: 112px; height: 112px; border-radius: 50%; cursor: grab; touch-action: none; user-select: none;
  background: conic-gradient(from 0deg, #f4f5f7, #aeb3ba, #f4f5f7, #aeb3ba, #f4f5f7, #aeb3ba, #f4f5f7);
  box-shadow: 0 10px 16px rgba(0,0,0,0.6), 0 0 0 5px #8e949c, 0 0 0 7px #4a4f56, 0 2px 0 rgba(255,255,255,0.9) inset; }
.skeu-knob::before { content: ""; position: absolute; inset: 12px; border-radius: 50%; background: radial-gradient(circle at 35% 28%, #fff, #d6d9de 55%, #9ba1a9); box-shadow: 0 3px 6px rgba(0,0,0,0.4), 0 1px 0 #fff inset; }
.skeu-knob .tick { position: absolute; left: 50%; top: 6px; width: 6px; height: 28px; margin-left: -3px; border-radius: 3px; background: linear-gradient(180deg, #ff6a5e, #c0261a); box-shadow: 0 1px 2px rgba(0,0,0,0.6); }
.skeu-knob:active { cursor: grabbing; }
.skeu-readout { margin-top: 10px; text-align: center; font-family: "Consolas", monospace; font-size: 15px; color: #7dff9a; background: #0f1a12; border-radius: 6px; padding: 4px 10px;
  box-shadow: 0 3px 6px rgba(0,0,0,0.7) inset, 0 1px 0 rgba(255,255,255,0.7); text-shadow: 0 0 6px rgba(125,255,154,0.8); }
.skeu-gauge { width: 230px; max-width: 100%; border-radius: 16px; padding: 10px; background: linear-gradient(160deg, #3b3f45, #15171a); box-shadow: 0 8px 14px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.35) inset; }
.skeu-gauge svg { display: block; width: 100%; border-radius: 10px; }

/* thermometer-style bar */
.skeu-bar { height: 20px; border-radius: 10px; padding: 3px; background: linear-gradient(180deg, #5a5f66, #9da3ab); box-shadow: 0 3px 5px rgba(0,0,0,0.6) inset, 0 1px 0 rgba(255,255,255,0.85); }
.skeu-bar > div { height: 100%; border-radius: 7px; min-width: 14px; background: linear-gradient(180deg, #b8f2c3, #36d65a 50%, #12983a); box-shadow: 0 0 8px rgba(54,214,90,0.75), 0 1px 0 rgba(255,255,255,0.6) inset; transition: width 120ms; }
.skeu-badge { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; color: #5a3a12; background: linear-gradient(180deg, #ffe7a8, #e0b04a); box-shadow: 0 2px 4px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.7) inset; border: 1px solid #8a6420; }
`;

type Lamp = "red" | "yellow" | "green";

function Gauge({ value }: { value: number }) {
  const angle = -120 + (value / 100) * 240;
  const ticks = Array.from({ length: 11 }, (_, i) => i);
  return (
    <div className="skeu-gauge">
      <svg viewBox="0 0 200 150" role="img" aria-label={`Gauge reading ${value} percent`}>
        <defs>
          <radialGradient id="skeu-face" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#fffdf2" /><stop offset="100%" stopColor="#d9d2b6" />
          </radialGradient>
          <linearGradient id="skeu-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" /><stop offset="45%" stopColor="rgba(255,255,255,0.05)" /><stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <rect width="200" height="150" fill="url(#skeu-face)" />
        {ticks.map((t) => {
          const a = ((-120 + t * 24) * Math.PI) / 180;
          const x1 = 100 + Math.sin(a) * 66, y1 = 105 - Math.cos(a) * 66;
          const x2 = 100 + Math.sin(a) * (t % 5 === 0 ? 52 : 58), y2 = 105 - Math.cos(a) * (t % 5 === 0 ? 52 : 58);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke={t >= 8 ? "#c9382b" : "#2a2d31"} strokeWidth={t % 5 === 0 ? 2.5 : 1.4} strokeLinecap="round" />;
        })}
        <text x="100" y="86" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#4a4538" letterSpacing="1.5">AVAILABILITY</text>
        <text x="100" y="132" textAnchor="middle" fontSize="12" fontWeight="700" fill="#4a4538">% FLEET</text>
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: "100px 105px", transition: "transform 180ms cubic-bezier(.3,1.5,.6,1)" }}>
          <polygon points="97,105 100,40 103,105" fill="#c9382b" stroke="#6b130b" strokeWidth="0.6" />
          <polygon points="98.6,105 100,150 101.4,105" fill="#333" opacity="0.6" transform="translate(0,-8)" />
        </g>
        <circle cx="100" cy="105" r="9" fill="#2a2d31" /><circle cx="98" cy="102.5" r="3" fill="#8a9098" />
        <rect width="200" height="75" fill="url(#skeu-glass)" />
      </svg>
    </div>
  );
}

function SkeuomorphismTest() {
  const [text, setText] = useState("");
  const [dropdown, setDropdown] = useState("one");
  const [lock, setLock] = useState(true);
  const [level, setLevel] = useState(72);
  const [lamps, setLamps] = useState<Record<Lamp, boolean>>({ red: false, yellow: false, green: true });
  const [c1, setC1] = useState(true);
  const [c2, setC2] = useState(false);
  const [radio, setRadio] = useState("a");
  const [tab, setTab] = useState<"info" | "log" | "notes">("info");
  const [presses, setPresses] = useState(0);

  // Rotary knob: drag around its centre; -135 deg .. +135 deg maps to 0 .. 100.
  const knobRef = useRef<HTMLDivElement>(null);
  function knobMove(e: React.PointerEvent) {
    if (!(e.buttons & 1) || !knobRef.current) return;
    const r = knobRef.current.getBoundingClientRect();
    const deg = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    const clamped = Math.max(-135, Math.min(135, deg));
    setLevel(Math.round(((clamped + 135) / 270) * 100));
  }
  const knobDeg = -135 + (level / 100) * 270;

  return (
    <div className="skeu-scene">
      <style>{CSS}</style>
      <div className="skeu-title">
        <h2>Skeuomorphism sample</h2>
        <p>Controls that look like real hardware: brushed metal, leather with stitching, chrome, glass and lit lamps. Press, drag and flip things.</p>
      </div>

      <div className="skeu-grid">
        <div className="skeu-panel">
          <span className="skeu-screw tl" /><span className="skeu-screw tr" /><span className="skeu-screw bl" /><span className="skeu-screw br" />
          <h3>Inputs</h3>
          <div className="skeu-field">
            <label className="skeu-label">Asset code</label>
            <input className="skeu-input" placeholder="Type something..." value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="skeu-field">
            <label className="skeu-label">Service line</label>
            <select className="skeu-input" value={dropdown} onChange={(e) => setDropdown(e.target.value)}>
              <option value="one">Coiled tubing</option>
              <option value="two">Stimulation</option>
              <option value="three">Cementing</option>
            </select>
          </div>
          <div className="skeu-field">
            <label className="skeu-label">Notes</label>
            <textarea className="skeu-input" rows={3} placeholder="Multi-line text..." />
          </div>
          <div className="skeu-actions">
            <button className="skeu-btn green" onClick={() => setPresses((p) => p + 1)}>Save</button>
            <button className="skeu-btn" onClick={() => setPresses((p) => p + 1)}>Cancel</button>
            <button className="skeu-btn red" onClick={() => setPresses((p) => p + 1)}>Delete</button>
            <button className="skeu-btn round" aria-label="Add" onClick={() => setPresses((p) => p + 1)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--ink-soft)", textShadow: "0 1px 0 rgba(255,255,255,0.8)" }}>Button presses: {presses}</div>
        </div>

        <div className="skeu-panel">
          <span className="skeu-screw tl" /><span className="skeu-screw tr" /><span className="skeu-screw bl" /><span className="skeu-screw br" />
          <h3>Dials and gauge</h3>
          <div className="skeu-dials">
            <div>
              <div className="skeu-knob" ref={knobRef} onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); knobMove(e); }} onPointerMove={knobMove} role="slider" aria-label="Level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}>
                <div style={{ position: "absolute", inset: 0, transform: `rotate(${knobDeg}deg)` }}><span className="tick" /></div>
              </div>
              <div className="skeu-readout">{String(level).padStart(3, "0")} %</div>
            </div>
            <Gauge value={level} />
          </div>
          <div className="skeu-field" style={{ marginTop: 20 }}>
            <label className="skeu-label">Fader</label>
            <input type="range" className="skeu-range" min={0} max={100} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
          </div>
          <div className="skeu-field" style={{ marginBottom: 0 }}>
            <label className="skeu-label">Progress</label>
            <div className="skeu-bar"><div style={{ width: `${level}%` }} /></div>
          </div>
        </div>

        <div className="skeu-panel">
          <span className="skeu-screw tl" /><span className="skeu-screw tr" /><span className="skeu-screw bl" /><span className="skeu-screw br" />
          <h3>Switches and lamps</h3>
          <div className="skeu-row">
            <span className="skeu-label" style={{ margin: 0 }}>Red-tag lock</span>
            <button className={`skeu-switch ${lock ? "on" : ""}`} onClick={() => setLock(!lock)} aria-label="Toggle red-tag lock" aria-pressed={lock}><span className="lever" /></button>
          </div>
          <div className="skeu-field">
            <span className="skeu-label">Tag lamps (press a lamp)</span>
            <div className="skeu-leds">
              {(["red", "yellow", "green"] as Lamp[]).map((l) => (
                <button key={l} className={`skeu-led ${l} ${lamps[l] ? "lit" : ""}`} onClick={() => setLamps({ ...lamps, [l]: !lamps[l] })} aria-pressed={lamps[l]}>
                  <i />{l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="skeu-field">
            <label className="skeu-check"><input type="checkbox" checked={c1} onChange={(e) => setC1(e.target.checked)} />Function test performed</label>
            <label className="skeu-check"><input type="checkbox" checked={c2} onChange={(e) => setC2(e.target.checked)} />Repaired on site</label>
          </div>
          <div className="skeu-field" style={{ marginBottom: 0 }}>
            <label className="skeu-check"><input type="radio" name="skeu-r" checked={radio === "a"} onChange={() => setRadio("a")} />Pre-Job</label>
            <label className="skeu-check"><input type="radio" name="skeu-r" checked={radio === "b"} onChange={() => setRadio("b")} />Post-Job</label>
          </div>
        </div>

        <div className="skeu-panel">
          <span className="skeu-screw tl" /><span className="skeu-screw tr" /><span className="skeu-screw bl" /><span className="skeu-screw br" />
          <h3>Index tabs</h3>
          <div className="skeu-tabs">
            {(["info", "log", "notes"] as const).map((t) => (
              <button key={t} className={`skeu-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t === "info" ? "Details" : t === "log" ? "Log" : "Notes"}</button>
            ))}
          </div>
          <div className="skeu-tabbody">
            {tab === "info" && "ASSET2 · PUMPING UNIT · Pakistan · Active"}
            {tab === "log" && "Report 2 submitted, five Moderate faults, decisions pending."}
            {tab === "notes" && "Everything here is pure CSS: no images were used for the textures."}
          </div>
        </div>

        <div className="skeu-leather">
          <h3>Leather card</h3>
          <p>A stitched leather panel with debossed type, the classic notebook look.</p>
          <span className="skeu-badge">PRIORITY</span>
        </div>
      </div>
    </div>
  );
}

export default SkeuomorphismTest;
