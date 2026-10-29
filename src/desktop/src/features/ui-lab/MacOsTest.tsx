import { useState } from "react";

// macOS-style sample: a desktop window with traffic lights, translucent sidebar, toolbar with a
// segmented control, and the standard Mac controls (push buttons, switch, popup, stepper, slider,
// checkbox, radio, table, sheet). Light and dark appearance. Pure CSS; scoped under .mac-scene.
const CSS = `
.mac-scene { min-height: 100%; box-sizing: border-box; padding: 72px 24px 60px; display: flex; justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", system-ui, sans-serif; font-size: 13px; letter-spacing: -0.01em;
  background: radial-gradient(1200px 700px at 15% 10%, #6ea8fe 0%, transparent 55%), radial-gradient(900px 700px at 90% 80%, #c07df0 0%, transparent 55%), linear-gradient(160deg, #3f6fd8, #8a53c9 60%, #e0728f); }
.mac-scene.dark { --win: #1e1e20; --side: rgba(44,44,48,0.78); --bar: #2b2b2e; --line: rgba(255,255,255,0.10); --text: #f2f2f4; --soft: #9a9aa2; --field: #2a2a2d; --ctl: #4a4a4f; --sel: rgba(10,132,255,0.35); --row: rgba(255,255,255,0.04); color-scheme: dark; }
.mac-scene.light { --win: #ffffff; --side: rgba(236,236,240,0.82); --bar: #ececef; --line: rgba(0,0,0,0.12); --text: #1d1d1f; --soft: #6e6e73; --field: #ffffff; --ctl: #ffffff; --sel: rgba(0,122,255,0.16); --row: rgba(0,0,0,0.035); color-scheme: light; }
.mac-win { width: 100%; max-width: 1060px; border-radius: 12px; overflow: hidden; color: var(--text); background: var(--win);
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.5), 0 24px 60px rgba(0,0,0,0.45), 0 3px 10px rgba(0,0,0,0.3); }
.mac-bar { display: flex; align-items: center; gap: 14px; height: 52px; padding: 0 14px; background: var(--bar); border-bottom: 1px solid var(--line); }
.mac-lights { display: flex; gap: 8px; }
.mac-lights i { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 0.5px rgba(0,0,0,0.25) inset; }
.mac-lights i:nth-child(1) { background: #ff5f57; } .mac-lights i:nth-child(2) { background: #febc2e; } .mac-lights i:nth-child(3) { background: #28c840; }
.mac-bar-title { flex: 1; text-align: center; font-weight: 600; font-size: 13px; }
.mac-body { display: grid; grid-template-columns: 210px 1fr; min-height: 560px; }
@media (max-width: 760px) { .mac-body { grid-template-columns: 1fr; } }
.mac-side { padding: 14px 10px; background: var(--side); backdrop-filter: blur(24px) saturate(1.6); border-right: 1px solid var(--line); }
.mac-side h6 { margin: 12px 8px 4px; font-size: 11px; font-weight: 600; color: var(--soft); }
.mac-side button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: default; }
.mac-side button.on { background: #0a84ff; color: #fff; }
.mac-side button svg { width: 15px; height: 15px; flex: none; color: #0a84ff; } .mac-side button.on svg { color: #fff; }
.mac-main { padding: 22px 26px 28px; display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.mac-main h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.mac-sub { margin: 2px 0 0; color: var(--soft); }
.mac-seg { display: inline-flex; padding: 2px; border-radius: 8px; background: rgba(120,120,128,0.18); }
.mac-seg button { padding: 3px 14px; border: 0; border-radius: 6px; background: transparent; color: var(--text); font: inherit; font-size: 12px; cursor: default; }
.mac-seg button.on { background: var(--ctl); box-shadow: 0 0.5px 1.5px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(0,0,0,0.04); font-weight: 600; }
.mac-scene.dark .mac-seg button.on { background: #636366; }
.mac-group { border: 1px solid var(--line); border-radius: 10px; background: var(--row); }
.mac-form-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 14px; border-top: 1px solid var(--line); }
.mac-form-row:first-child { border-top: 0; }
.mac-form-row > label, .mac-form-row > span.lab { color: var(--text); }
.mac-input { width: 220px; max-width: 100%; box-sizing: border-box; padding: 4px 8px; font: inherit; color: var(--text); background: var(--field); border: 1px solid var(--line); border-radius: 6px; outline: none;
  box-shadow: 0 0.5px 1px rgba(0,0,0,0.12) inset; }
.mac-input:focus { border-color: #0a84ff; box-shadow: 0 0 0 3.5px rgba(10,132,255,0.35); }
.mac-popup { appearance: none; padding: 3px 26px 3px 10px; font: inherit; color: var(--text); background: var(--ctl); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 0.5px 1.5px rgba(0,0,0,0.2);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18'><rect width='18' height='18' rx='4' fill='%230a84ff'/><path d='M5.5 7.5L9 4.5l3.5 3M5.5 10.5L9 13.5l3.5-3' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>"); background-repeat: no-repeat; background-size: 18px 18px; background-position: right 3px center; position: relative; }
.mac-btn { padding: 3px 14px; min-height: 22px; font: inherit; color: var(--text); background: var(--ctl); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 0.5px 1.5px rgba(0,0,0,0.22); cursor: default; }
.mac-btn:active { filter: brightness(0.92); }
.mac-btn.primary { color: #fff; border-color: #0a6cdc; background: linear-gradient(180deg, #3d9dff, #0a7cff); }
.mac-btn.danger { color: #ff453a; }
.mac-switch { position: relative; width: 38px; height: 22px; border: 0; border-radius: 11px; padding: 0; background: rgba(120,120,128,0.32); transition: background 160ms; cursor: default; }
.mac-switch.on { background: #34c759; }
.mac-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 160ms; }
.mac-switch.on::after { transform: translateX(16px); }
.mac-range { appearance: none; width: 200px; height: 4px; border-radius: 2px; background: linear-gradient(90deg, #0a84ff var(--v), rgba(120,120,128,0.32) var(--v)); outline: none; }
.mac-range::-webkit-slider-thumb { appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 0.5px rgba(0,0,0,0.15), 0 2px 5px rgba(0,0,0,0.35); }
.mac-check { display: inline-flex; align-items: center; gap: 8px; margin-right: 18px; vertical-align: middle; line-height: 16px; }
.mac-check input { appearance: none; width: 16px; height: 16px; margin: 0; border-radius: 4px; background: var(--field); border: 1px solid rgba(120,120,128,0.55); display: grid; place-content: center; }
.mac-check input[type=radio] { border-radius: 50%; }
.mac-check input:checked { background: #0a84ff; border-color: #0a84ff; }
.mac-check input[type=checkbox]:checked::after { content: ""; width: 4px; height: 8px; border: solid #fff; border-width: 0 2px 2px 0; transform: translateY(-1px) rotate(45deg); }
.mac-check input[type=radio]:checked::after { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #fff; }
.mac-progress { width: 200px; height: 6px; border-radius: 3px; background: rgba(120,120,128,0.28); overflow: hidden; }
.mac-progress > div { height: 100%; background: #0a84ff; border-radius: 3px; transition: width 160ms; }
.mac-stepper { display: inline-flex; align-items: center; gap: 6px; }
.mac-stepper b { min-width: 28px; text-align: center; font-weight: 500; }
.mac-stepper span { display: inline-flex; flex-direction: column; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: var(--ctl); }
.mac-stepper button { width: 18px; height: 11px; line-height: 9px; font-size: 8px; padding: 0; border: 0; background: transparent; color: var(--text); cursor: default; }
.mac-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.mac-table th { text-align: left; font-weight: 500; color: var(--soft); padding: 6px 12px; border-bottom: 1px solid var(--line); }
.mac-table td { padding: 6px 12px; }
.mac-table tr:nth-child(even) td { background: var(--row); }
.mac-table tr.sel td { background: #0a84ff; color: #fff; }
.mac-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.mac-sheet-wrap { display: flex; justify-content: center; }
.mac-sheet { width: 300px; padding: 20px 20px 14px; text-align: center; border-radius: 14px; background: var(--side); backdrop-filter: blur(30px) saturate(1.6); border: 1px solid var(--line); box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
.mac-sheet h4 { margin: 8px 0 4px; font-size: 13px; } .mac-sheet p { margin: 0 0 14px; font-size: 11.5px; color: var(--soft); }
.mac-sheet .icon { width: 48px; height: 48px; margin: 0 auto; border-radius: 11px; background: linear-gradient(180deg, #ffb340, #ff7a00); display: grid; place-content: center; color: #fff; font-size: 26px; font-weight: 700; }
.mac-sheet .row { display: flex; gap: 8px; } .mac-sheet .row .mac-btn { flex: 1; }
`;

const ICON = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

function MacOsTest() {
  const [dark, setDark] = useState(false);
  const [nav, setNav] = useState("Assets");
  const [mode, setMode] = useState<"General" | "Notifications" | "Advanced">("General");
  const [name, setName] = useState("ASSET2");
  const [line, setLine] = useState("Stimulation");
  const [lock, setLock] = useState(true);
  const [auto, setAuto] = useState(false);
  const [vol, setVol] = useState(60);
  const [qty, setQty] = useState(3);
  const [c1, setC1] = useState(true);
  const [c2, setC2] = useState(false);
  const [radio, setRadio] = useState("a");
  const [row, setRow] = useState(0);
  const [sheet, setSheet] = useState(true);

  const nav1: [string, string][] = [["Assets", "M4 8l8-4 8 4v8l-8 4-8-4z"], ["Reports", "M7 3h8l4 4v14H7z"], ["Approvals", "M5 12l4 4 10-10"]];
  const nav2: [string, string][] = [["Rectification", "M14 6l4 4-8 8H6v-4z"], ["Dashboard", "M4 20V10M10 20V4M16 20v-8M22 20H2"]];
  const rows = [["ASSET1", "Coiled tubing unit", "Pakistan", "#34c759", "Green"], ["ASSET2", "Pumping unit", "Pakistan", "#ff3b30", "Red"], ["ASSET3", "Cementing unit", "UAE", "#ffcc00", "Yellow"]];

  return (
    <div className={`mac-scene ${dark ? "dark" : "light"}`}>
      <style>{CSS}</style>
      <div className="mac-win">
        <div className="mac-bar">
          <div className="mac-lights"><i /><i /><i /></div>
          <div className="mac-bar-title">Sprint MMS — {nav}</div>
          <div className="mac-seg" role="group" aria-label="Appearance">
            <button className={!dark ? "on" : ""} onClick={() => setDark(false)}>Light</button>
            <button className={dark ? "on" : ""} onClick={() => setDark(true)}>Dark</button>
          </div>
        </div>

        <div className="mac-body">
          <aside className="mac-side">
            <h6>Maintenance</h6>
            {nav1.map(([n, d]) => (<button key={n} className={nav === n ? "on" : ""} onClick={() => setNav(n)}>{ICON(d)}{n}</button>))}
            <h6>Follow-up</h6>
            {nav2.map(([n, d]) => (<button key={n} className={nav === n ? "on" : ""} onClick={() => setNav(n)}>{ICON(d)}{n}</button>))}
          </aside>

          <main className="mac-main">
            <div>
              <h2>{nav}</h2>
              <p className="mac-sub">A macOS-style window: translucent sidebar, segmented control, system controls and a Mac alert.</p>
            </div>

            <div className="mac-seg" style={{ alignSelf: "flex-start" }}>
              {(["General", "Notifications", "Advanced"] as const).map((m) => (
                <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m}</button>
              ))}
            </div>

            <div className="mac-group">
              <div className="mac-form-row"><label htmlFor="mac-n">Asset code</label><input id="mac-n" className="mac-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="mac-form-row"><span className="lab">Service line</span>
                <select className="mac-popup" value={line} onChange={(e) => setLine(e.target.value)}><option>Coiled tubing</option><option>Stimulation</option><option>Cementing</option></select></div>
              <div className="mac-form-row"><span className="lab">Lock when Red-tagged</span><button className={`mac-switch ${lock ? "on" : ""}`} onClick={() => setLock(!lock)} aria-pressed={lock} aria-label="Lock when Red-tagged" /></div>
              <div className="mac-form-row"><span className="lab">Auto-close Minor faults</span><button className={`mac-switch ${auto ? "on" : ""}`} onClick={() => setAuto(!auto)} aria-pressed={auto} aria-label="Auto-close Minor faults" /></div>
              <div className="mac-form-row"><span className="lab">Warning level</span><input type="range" className="mac-range" style={{ ["--v" as string]: `${vol}%` }} min={0} max={100} value={vol} onChange={(e) => setVol(Number(e.target.value))} /></div>
              <div className="mac-form-row"><span className="lab">Reminders per fault</span>
                <span className="mac-stepper"><b>{qty}</b><span><button onClick={() => setQty(qty + 1)} aria-label="Increase">▲</button><button onClick={() => setQty(Math.max(0, qty - 1))} aria-label="Decrease">▼</button></span></span></div>
              <div className="mac-form-row"><span className="lab">Options</span>
                <span><label className="mac-check"><input type="checkbox" checked={c1} onChange={(e) => setC1(e.target.checked)} />Function test</label>
                <label className="mac-check" style={{ marginRight: 0 }}><input type="checkbox" checked={c2} onChange={(e) => setC2(e.target.checked)} />Repaired on site</label></span></div>
              <div className="mac-form-row"><span className="lab">Stage</span>
                <span><label className="mac-check"><input type="radio" name="mac-r" checked={radio === "a"} onChange={() => setRadio("a")} />Pre-Job</label>
                <label className="mac-check" style={{ marginRight: 0 }}><input type="radio" name="mac-r" checked={radio === "b"} onChange={() => setRadio("b")} />Post-Job</label></span></div>
              <div className="mac-form-row"><span className="lab">Sync</span><div className="mac-progress"><div style={{ width: `${vol}%` }} /></div></div>
              <div className="mac-form-row" style={{ justifyContent: "flex-end" }}>
                <button className="mac-btn" onClick={() => setSheet(true)}>Show alert</button>
                <button className="mac-btn danger">Delete…</button>
                <button className="mac-btn primary">Save</button>
              </div>
            </div>

            <div className="mac-group" style={{ overflow: "hidden" }}>
              <table className="mac-table">
                <thead><tr><th>Asset</th><th>Description</th><th>Country</th><th>Tag</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r[0]} className={row === i ? "sel" : ""} onClick={() => setRow(i)}>
                      <td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td><i className="mac-dot" style={{ background: r[3] }} />{r[4]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sheet && (
              <div className="mac-sheet-wrap">
                <div className="mac-sheet" role="alertdialog" aria-label="Alert">
                  <div className="icon">!</div>
                  <h4>Close report with open faults?</h4>
                  <p>Two Moderate faults are still pending approval. This cannot be undone.</p>
                  <div className="row">
                    <button className="mac-btn" onClick={() => setSheet(false)}>Cancel</button>
                    <button className="mac-btn primary" onClick={() => setSheet(false)}>Close report</button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default MacOsTest;
