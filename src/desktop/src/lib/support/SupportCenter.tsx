import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { roleName } from "../roles";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { useCurrentUser } from "../currentUser";
import { copyText, diag, fileStamp, flush, installDiag, localStamp, saveFile, timeOnly, type ErrItem, type IpcItem, type SystemInfo, type TrailItem } from "./diag";
import { SUPPORT_CSS } from "./supportCss";
import { buildSupportBundle, fmtBundleSize, type BundleResult } from "./supportBundle";
import FaqModal from "./FaqModal";

// The support tools, available on every screen:
//   Help button (bottom right) -> Frequently Asked Questions (FAQ, faq.ts), About MMS (#4), Report a problem (#5), Save diagnostics file (#3),
//   Check my data (#7), Export a report for support (#8), Copy last error (#1), Open log folder (#6),
//   Support mode (#10, Administrators).
//   "Something went wrong · Copy details" appears after any error (#1).
//   After a crash, the next start offers to save what happened (#9).
// Keyboard: Ctrl+Shift+F = Report a problem; Ctrl+Shift+D = Support mode (Administrators).

const SCREEN_NAMES: Record<string, string> = {
  menu: "Main menu", assets: "Asset Registry", reports: "Select asset for report", dashboard: "Dashboard", admin: "Administration",
  triggers: "Maintenance triggers", uilab: "UI Lab", "distance-map-test": "Distance map test", "template-builder": "Template builder",
  "select-asset-report": "Select asset for report", "report-wizard": "MR-I report", "pending-approvals": "Pending Approvals",
  "rectification-queue": "Rectification Queue", "report-review-queue": "Reports to Review", "my-reports-queue": "My Reports",
  "report-flow": "Report flow", "asset-flow": "Asset flow",
};

type Modal = null | "faq" | "send" | "about" | "problem" | "diagnostics" | "check" | "export" | "crash";
interface DataCheck { key: string; name: string; status: "ok" | "warn" | "error" | "skip"; count: number; detail: string; examples: number[] }
interface SessionStart { unclean: boolean; previous_started: string | null; crash_note: string | null }

const useDiag = () => useSyncExternalStore(diag.subscribe, () => diag.tick, () => diag.tick);
const call = <T,>(cmd: string, args?: Record<string, unknown>) => tauriInvoke<T>(cmd, args);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtBytes = (n: unknown) => { const b = Number(n) || 0; return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`; };

const ICON = {
  help: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" /><path d="M12 17h.01" /></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></svg>,
  flag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>,
  box: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" /><path d="M4 15v4h16v-4" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.2" /></svg>,
  report: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></svg>,
  copy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>,
  folder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  bug: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="13" rx="5" /><path d="M12 7v13M4 12h3M17 12h3M5 18l2.5-1.5M19 18l-2.5-1.5M5 6l2.5 1.5M19 6l-2.5 1.5M9.5 4.5 10.5 7M14.5 4.5 13.5 7" /></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.2v.1" /></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 3 10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></svg>,
};

// ---------------------------------------------------------------- HTML files

function htmlPage(title: string, body: string, data: unknown) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px/1.5 "Segoe UI",Arial,sans-serif;color:#1a1d1f;max-width:1000px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid #dde3ea;padding-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #e6eaf0;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#f3f6fa;font-weight:600}.muted{color:#6b7280}.err{color:#a32d2d;font-weight:600}.ok{color:#1f7a4d}.warn{color:#a3591b}
pre{background:#f6f8fa;border:1px solid #e3e8ef;border-radius:8px;padding:10px;overflow:auto;font-size:12px;white-space:pre-wrap}
img{max-width:100%;border:1px solid #dde3ea;border-radius:8px}.box{background:#f3f7ff;border-left:4px solid #2f6fed;border-radius:6px;padding:10px 14px}</style></head>
<body>${body}
<script type="application/json" id="mms-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script></body></html>`;
}
const kvTable = (rows: [string, unknown][]) => `<table>${rows.map(([k, v]) => `<tr><th style="width:220px">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
const trailTable = (trail: TrailItem[]) => trail.length
  ? `<table><tr><th>Time</th><th>Screen</th><th>What the user did</th></tr>${[...trail].reverse().map((s) => `<tr><td>${esc(localStamp(s.t))}</td><td>${esc(s.screen)}</td><td>${esc(s.text)}</td></tr>`).join("")}</table>`
  : `<p class="muted">Nothing recorded.</p>`;
const errorTable = (errors: ErrItem[]) => errors.length
  ? `<table><tr><th>Time</th><th>Where</th><th>Error</th></tr>${[...errors].reverse().map((e) => `<tr><td>${esc(localStamp(e.t))}</td><td>${esc(e.screen)}${e.context ? `<div class="muted">${esc(e.context)}</div>` : ""}<div class="muted">${esc(e.source)}</div></td><td class="err">${esc(e.message)}</td></tr>`).join("")}</table>`
  : `<p class="ok">No errors recorded.</p>`;
const ipcTable = (ipc: IpcItem[]) => ipc.length
  ? `<table><tr><th>Time</th><th>Command</th><th>ms</th><th>Result</th><th>Details</th></tr>${[...ipc].reverse().map((c) => `<tr><td>${esc(timeOnly(c.t))}</td><td>${esc(c.cmd)}</td><td>${c.ms}</td><td class="${c.ok ? "ok" : "err"}">${c.ok ? "OK" : "Failed"}</td><td>${esc(c.args)}${c.ok ? ` → ${esc(c.result)}` : `<div class="err">${esc(c.error)}</div>`}</td></tr>`).join("")}</table>`
  : `<p class="muted">No calls recorded.</p>`;
const checksTable = (checks: DataCheck[] | null) => checks
  ? `<table><tr><th>Check</th><th>Result</th><th>Details</th></tr>${checks.map((c) => `<tr><td>${esc(c.name)}</td><td class="${c.status === "ok" ? "ok" : c.status === "error" ? "err" : "warn"}">${c.status === "ok" ? "OK" : c.status === "skip" ? "Not run" : `${c.count} found`}</td><td>${esc(c.detail)}${c.examples.length ? ` <span class="muted">(${c.examples.map((x) => `#${x}`).join(", ")})</span>` : ""}</td></tr>`).join("")}</table>`
  : `<p class="muted">Not run.</p>`;
function systemRows(sys: SystemInfo | null): [string, unknown][] {
  const s = sys ?? {};
  const trial = (s.trial ?? {}) as Record<string, unknown>;
  return [
    ["MMS version", `${s.version ?? "?"} (${s.build ?? "?"})`],
    ["Beta days left", trial.enabled ? `${trial.days_left ?? "?"} of ${trial.days ?? "?"}` : "No time limit"],
    ["Windows", s.windows_version], ["Computer", s.computer],
    ["Database file", s.database_file], ["Database size", fmtBytes(s.database_bytes)],
    ["Database schema", `${s.schema_migrations ?? "?"} updates · last: ${s.last_migration ?? "—"}`], ["SQLite", s.sqlite_version],
    ["Log folder", s.log_folder], ["Information read at", s.generated_at],
  ];
}

// ---------------------------------------------------------------- main component

// Hidden 20 Nov 2026: Send to IT packs all of these into one file, so their separate
// Help menu buttons are not shown. Their code stays; take a key out to show it again.
const HIDDEN_HELP = new Set(["problem", "diag", "export", "copy", "logs"]);

export default function SupportCenter({ screen, context }: { screen: string; context?: Record<string, string | number | null | undefined> }) {
  const { user } = useCurrentUser();
  useDiag();
  const isAdmin = user?.role === "Administrator";
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [support, setSupport] = useState(false);
  const [session, setSession] = useState<SessionStart | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pillFor, setPillFor] = useState<ErrItem | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Start-up: listeners, system information, crash check.
  useEffect(() => {
    installDiag();
    call<SystemInfo>("diag_system_info").then((s) => diag.setSystem(s)).catch(() => {});
    call<SessionStart>("diag_session_start").then((s) => { setSession(s); if (s.unclean) setModal("crash"); }).catch(() => {});
  }, []);
  useEffect(() => { diag.setUser(user ? { name: user.name, role: user.role } : null); }, [user]);
  useEffect(() => { diag.setScreen(SCREEN_NAMES[screen] ?? screen); }, [screen]);
  useEffect(() => { diag.setContext(context ?? {}); }, [context]);
  useEffect(() => { if (!isAdmin) setSupport(false); }, [isAdmin]);

  // "Something went wrong · Copy details" after a new error.
  const last = diag.lastError();
  useEffect(() => {
    if (!last || Date.now() - last.t > 5000) return;
    setPillFor(last);
    const id = window.setTimeout(() => setPillFor((p) => (p === last ? null : p)), 25000);
    return () => window.clearTimeout(id);
  }, [last]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.shiftKey)) return;
      const k = e.key.toLowerCase();
      if (k === "f") { e.preventDefault(); setModal(HIDDEN_HELP.has("problem") ? "send" : "problem"); setMenuOpen(false); }
      if (k === "d" && isAdmin) { e.preventDefault(); setSupport((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin]);
  useEffect(() => {
    if (!menuOpen) return;
    const out = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [menuOpen]);

  const notify = (msg: string) => { setToast(msg); window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 6000); };
  const copyDetails = async (err?: ErrItem | null) => {
    const ok = await copyText(diag.detailsText(err));
    notify(ok ? "Details copied. Paste them into the testing form or a Teams message (Ctrl + V)." : "Could not copy. Use Help → Send to IT instead.");
  };
  const openLogs = () => call("diag_open_log_folder").catch((e) => notify(String(e)));

  const items: { key: string; icon: ReactNode; label: string; hint?: string; run: () => void; admin?: boolean }[] = [
    { key: "faq", icon: ICON.help, label: "Frequently Asked Questions", hint: "How MMS works, by topic and screen", run: () => setModal("faq") },
    { key: "send", icon: ICON.send, label: "Send to IT", hint: "One file with everything IT needs", run: () => setModal("send") },
    { key: "about", icon: ICON.info, label: "About MMS", hint: "Version, computer and database", run: () => setModal("about") },
    { key: "problem", icon: ICON.flag, label: "Report a problem", hint: "Ctrl + Shift + F", run: () => setModal("problem") },
    { key: "diag", icon: ICON.box, label: "Save diagnostics file", hint: "One file for Jess", run: () => setModal("diagnostics") },
    { key: "check", icon: ICON.check, label: "Check my data", hint: "Read-only health check", run: () => setModal("check") },
    { key: "export", icon: ICON.report, label: "Export a report for support", hint: "One MR-I report as a file", run: () => setModal("export") },
    { key: "copy", icon: ICON.copy, label: "Copy last error details", hint: diag.lastError() ? timeOnly(diag.lastError()!.t) : "No error yet", run: () => copyDetails() },
    { key: "logs", icon: ICON.folder, label: "Open log folder", run: openLogs },
    { key: "support", icon: ICON.bug, label: support ? "Turn off support mode" : "Support mode", hint: "Ctrl + Shift + D", run: () => setSupport((v) => !v), admin: true },
  ];

  return (
    <div className="sup-root" data-diag-ignore>
      <style>{SUPPORT_CSS}</style>

      {pillFor && !modal && (
        <div className="sup-pill" role="status">
          <span className="sup-pill-ico">{ICON.warn}</span>
          <span className="sup-pill-text"><b>Something went wrong</b><small>{pillFor.message.slice(0, 90)}{pillFor.message.length > 90 ? "…" : ""}</small></span>
          {!HIDDEN_HELP.has("copy") && <button type="button" className="sup-pill-btn" onClick={() => copyDetails(pillFor)}>Copy details</button>}
          {HIDDEN_HELP.has("copy") && <button type="button" className="sup-pill-btn" onClick={() => { setPillFor(null); setModal("send"); }}>Send to IT</button>}
          <button type="button" className="sup-x" aria-label="Hide" onClick={() => setPillFor(null)}>×</button>
        </div>
      )}
      {toast && <div className="sup-toast" role="status">{toast}</div>}

      <div className="sup-help" ref={menuRef}>
        {menuOpen && (
          <div className="sup-menu" role="menu">
            <div className="sup-menu-head">Help and support</div>
            {items.filter((it) => (!it.admin || isAdmin) && !HIDDEN_HELP.has(it.key)).map((it) => (
              <button key={it.key} type="button" role="menuitem" className="sup-menu-item" onClick={() => { setMenuOpen(false); it.run(); }}>
                <span className="sup-menu-ico">{it.icon}</span>
                <span className="sup-menu-text"><b>{it.label}</b>{it.hint && <small>{it.hint}</small>}</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" className={`sup-help-btn${support ? " is-support" : ""}`} aria-label="Help and support" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)} title="Help and support">
          {ICON.help}<span>Help</span>
        </button>
      </div>

      {support && isAdmin && <SupportPanel onClose={() => setSupport(false)} />}

      {modal === "faq" && <FaqModal screen={screen} screenName={SCREEN_NAMES[screen] ?? screen} onClose={() => setModal(null)} />}
      {modal === "send" && <SendToItModal report={context?.report ?? null} onClose={() => setModal(null)} />}
      {modal === "about" && <AboutModal onClose={() => setModal(null)} onCopy={notify} onLogs={openLogs} onDiagnostics={() => setModal("diagnostics")} onSend={() => setModal("send")} hideOld={HIDDEN_HELP.has("diag")} />}
      {modal === "problem" && <ProblemModal onClose={() => setModal(null)} onSaved={notify} />}
      {modal === "diagnostics" && <DiagnosticsModal onClose={() => setModal(null)} onSaved={notify} />}
      {modal === "check" && <CheckModal onClose={() => setModal(null)} onSaved={notify} />}
      {modal === "export" && <ExportModal initial={context?.report ?? null} onClose={() => setModal(null)} onSaved={notify} />}
      {modal === "crash" && session && <CrashModal session={session} onClose={() => setModal(null)} onSave={() => setModal(HIDDEN_HELP.has("diag") ? "send" : "diagnostics")} sendToIt={HIDDEN_HELP.has("diag")} />}
    </div>
  );
}

// ---------------------------------------------------------------- dialogs

function Dialog({ title, icon, children, onClose, wide = false, footer }: { title: string; icon?: ReactNode; children: ReactNode; onClose: () => void; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="sup-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sup-dialog${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sup-dialog-head">
          {icon && <span className="sup-dialog-ico">{icon}</span>}
          <h3>{title}</h3>
          <button type="button" className="sup-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="sup-dialog-body">{children}</div>
        {footer && <div className="sup-dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

function AboutModal({ onClose, onCopy, onLogs, onDiagnostics, onSend, hideOld }: { onClose: () => void; onCopy: (m: string) => void; onLogs: () => void; onDiagnostics: () => void; onSend?: () => void; hideOld?: boolean }) {
  const [sys, setSys] = useState<SystemInfo | null>(diag.state.system);
  const [err, setErr] = useState<string | null>(null);
  const [showTables, setShowTables] = useState(false);
  useEffect(() => { call<SystemInfo>("diag_system_info").then((s) => { setSys(s); diag.setSystem(s); }).catch((e) => setErr(String(e))); }, []);
  const rows = systemRows(sys);
  const text = () => ["About MMS", ...rows.map(([k, v]) => `${k}: ${v ?? ""}`), `Signed in as: ${diag.state.user ? `${diag.state.user.name} (${roleName(diag.state.user.role)})` : "—"}`].join("\n");
  const tables = Object.entries((sys?.table_rows ?? {}) as Record<string, number>);
  return (
    <Dialog title="About MMS" icon={ICON.info} onClose={onClose}
      footer={<>
        {!hideOld && <button type="button" className="ghost" onClick={onLogs}>{ICON.folder} Open log folder</button>}
        {!hideOld && <button type="button" className="ghost" onClick={onDiagnostics}>{ICON.box} Save diagnostics file</button>}
        {hideOld && onSend && <button type="button" className="ghost" onClick={onSend}>{ICON.send} Send to IT</button>}
        <button type="button" className="primary" onClick={async () => { const ok = await copyText(text()); onCopy(ok ? "About MMS copied. Paste it with Ctrl + V." : "Could not copy."); }}>{ICON.copy} Copy</button>
      </>}>
      {err && <p className="sup-err">{err}</p>}
      {!sys && !err ? <p className="sup-muted"><span className="sup-spin" /> Reading…</p> : (
        <dl className="sup-kv">
          {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v ?? "—")}</dd></div>)}
          <div><dt>Signed in as</dt><dd>{diag.state.user ? `${diag.state.user.name} (${roleName(diag.state.user.role)})` : "—"}</dd></div>
        </dl>
      )}
      {tables.length > 0 && (
        <details className="sup-details" open={showTables} onToggle={(e) => setShowTables((e.target as HTMLDetailsElement).open)}>
          <summary>Records per table ({tables.length} tables)</summary>
          <div className="sup-tablegrid">{tables.map(([t, n]) => <span key={t}><code>{t}</code><b>{n}</b></span>)}</div>
        </details>
      )}
    </Dialog>
  );
}

function ProblemModal({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const [what, setWhat] = useState("");
  const [doing, setDoing] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [withSteps, setWithSteps] = useState(true);
  const s = diag.state;
  const readImage = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = () => setShot(String(r.result));
    r.readAsDataURL(file);
  };
  const save = () => {
    const name = `MMS-problem-${fileStamp()}.html`;
    const ctx = Object.entries(s.context).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k} ${v}`).join(", ");
    const body = `<h1>MMS problem report</h1><p class="muted">${esc(localStamp())} · ${esc(s.user ? `${s.user.name} (${s.user.role})` : "Nobody signed in")}</p>
<div class="box"><b>What went wrong</b><br>${esc(what).replace(/\n/g, "<br>")}</div>
${doing.trim() ? `<h2>What I was trying to do</h2><p>${esc(doing).replace(/\n/g, "<br>")}</p>` : ""}
<h2>Where</h2>${kvTable([["Screen", s.screen], ["Record", ctx || "—"]])}
${shot ? `<h2>Screenshot</h2><img src="${shot}" alt="Screenshot">` : ""}
<h2>Recent errors</h2>${errorTable(s.errors.slice(-10))}
${withSteps ? `<h2>Last steps</h2>${trailTable(s.trail.slice(-30))}` : ""}
<h2>System</h2>${kvTable(systemRows(s.system))}`;
    saveFile(name, htmlPage("MMS problem report", body, { kind: "MMS problem report", what, doing, screen: s.screen, context: s.context, user: s.user, errors: s.errors.slice(-10), trail: withSteps ? s.trail.slice(-30) : [], system: s.system }));
    diag.step(`Saved problem report ${name}`);
    onSaved(`Saved "${name}" in your Downloads folder. Attach it to your issue in the testing form, or send it to Jess.`);
    onClose();
  };
  return (
    <Dialog title="Report a problem" icon={ICON.flag} onClose={onClose}
      footer={<><button type="button" className="ghost" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!what.trim()} onClick={save}>Save problem report</button></>}>
      <p className="sup-muted">MMS adds the screen you are on, your last steps, recent errors and the version. Nothing is sent anywhere: you get one file in Downloads.</p>
      <label className="sup-field"><span>What went wrong? <b>*</b></span>
        <textarea autoFocus value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. Submit did nothing on the Footer step" rows={3} /></label>
      <label className="sup-field"><span>What were you trying to do? (optional)</span>
        <textarea value={doing} onChange={(e) => setDoing(e.target.value)} rows={2} /></label>
      <div className="sup-field"><span>Screenshot (optional)</span>
        <div className="sup-paste" tabIndex={0} onPaste={(e) => readImage(Array.from(e.clipboardData.files)[0])}>
          {shot ? <><img src={shot} alt="Screenshot to attach" /><button type="button" className="ghost" onClick={() => setShot(null)}>Remove</button></> : (
            <p>Press <kbd>Windows</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>, select the area, then click here and press <kbd>Ctrl</kbd> + <kbd>V</kbd>.
              <br />Or <label className="sup-link">choose a picture<input type="file" accept="image/*" hidden onChange={(e) => readImage(e.target.files?.[0])} /></label>.</p>
          )}
        </div>
      </div>
      <label className="sup-check"><input type="checkbox" checked={withSteps} onChange={(e) => setWithSteps(e.target.checked)} /> Include my last steps ({s.trail.length})</label>
    </Dialog>
  );
}

function DiagnosticsModal({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const savedRef = useRef(onSaved);
  savedRef.current = onSaved;
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      flush();
      const s = diag.state;
      const [sys, logTail, checks] = await Promise.all([
        call<SystemInfo>("diag_system_info").catch((e) => ({ error: String(e) }) as SystemInfo),
        call<string>("diag_read_log_tail", { maxLines: 600 }).catch((e) => `Could not read the log: ${e}`),
        call<DataCheck[]>("diag_check_data").catch(() => null),
      ]);
      if (cancelled) return;
      diag.setSystem(sys);
      const prev = s.previous;
      const file = `MMS-diagnostics-${(s.user?.name ?? "user").replace(/\W+/g, "")}-${fileStamp()}.html`;
      const body = `<h1>MMS diagnostics</h1><p class="muted">${esc(localStamp())} · ${esc(s.user ? `${s.user.name} (${s.user.role})` : "Nobody signed in")} · screen: ${esc(s.screen)}</p>
<div class="box">This file is for MMS support. It contains settings, recent actions, errors and record counts, but not the contents of reports.</div>
<h2>System</h2>${kvTable(systemRows(sys))}
<h2>Recent errors</h2>${errorTable(s.errors)}
<h2>Last steps (this session)</h2>${trailTable(s.trail)}
${prev && prev.trail?.length ? `<h2>Previous session (saved ${esc(localStamp(prev.savedAt))})</h2><p class="muted">Last screen: ${esc(prev.screen)} · ${esc(prev.user)}</p>${errorTable(prev.errors ?? [])}${trailTable(prev.trail)}` : ""}
<h2>Check my data</h2>${checksTable(checks)}
<h2>Recent commands</h2>${ipcTable(s.ipc.slice(-100))}
<h2>Records per table</h2>${kvTable(Object.entries((sys.table_rows ?? {}) as Record<string, number>))}
<h2>App log (last 600 lines)</h2><pre>${esc(logTail)}</pre>`;
      saveFile(file, htmlPage("MMS diagnostics", body, { kind: "MMS diagnostics", savedAt: Date.now(), screen: s.screen, context: s.context, user: s.user, system: sys, errors: s.errors, trail: s.trail, previous: prev, checks, ipc: s.ipc.slice(-100), log: logTail }));
      setName(file);
      setBusy(false);
      savedRef.current(`Saved "${file}" in your Downloads folder. Send it to Jess by Teams or e-mail.`);
    })().catch((e) => { setErr(String(e)); setBusy(false); });
    return () => { cancelled = true; };
  }, []);
  return (
    <Dialog title="Save diagnostics file" icon={ICON.box} onClose={onClose}
      footer={<button type="button" className="primary" onClick={onClose} disabled={busy}>Done</button>}>
      {busy ? <p className="sup-muted"><span className="sup-spin" /> Collecting the version, recent errors, your last steps, a data check and the log…</p>
        : err ? <p className="sup-err">{err}</p>
          : <div className="sup-done"><span className="sup-done-ico">{ICON.check}</span><div><b>{name}</b><p>Saved in your <b>Downloads</b> folder. Send this one file to Jess by Teams or e-mail. It holds no report contents.</p></div></div>}
    </Dialog>
  );
}

function CheckModal({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const [checks, setChecks] = useState<DataCheck[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    setChecks(null); setErr(null);
    call<DataCheck[]>("diag_check_data").then(setChecks).catch((e) => setErr(String(e)));
  }, [run]);
  const problems = checks?.filter((c) => c.status === "error" || c.status === "warn").length ?? 0;
  const save = () => {
    if (!checks) return;
    const file = `MMS-data-check-${fileStamp()}.html`;
    saveFile(file, htmlPage("MMS data check", `<h1>MMS data check</h1><p class="muted">${esc(localStamp())}</p>${checksTable(checks)}<h2>System</h2>${kvTable(systemRows(diag.state.system))}`, { kind: "MMS data check", checks, system: diag.state.system }));
    onSaved(`Saved "${file}" in your Downloads folder.`);
  };
  return (
    <Dialog title="Check my data" icon={ICON.check} onClose={onClose} wide
      footer={<><button type="button" className="ghost" onClick={() => setRun((n) => n + 1)} disabled={!checks}>Run again</button><button type="button" className="ghost" onClick={save} disabled={!checks}>Save results</button><button type="button" className="primary" onClick={onClose}>Close</button></>}>
      <p className="sup-muted">Looks for damage and broken links in the data on this computer. It only reads; nothing is changed.</p>
      {err && <p className="sup-err">{err}</p>}
      {!checks && !err && <p className="sup-muted"><span className="sup-spin" /> Checking…</p>}
      {checks && (
        <>
          <div className={`sup-summary ${problems ? "is-bad" : "is-ok"}`}>{problems ? `${problems} thing${problems === 1 ? "" : "s"} to look at. Save the results and send them to Jess.` : "Everything looks right."}</div>
          <ul className="sup-checks">
            {checks.map((c) => (
              <li key={c.key} className={`is-${c.status}`}>
                <i aria-hidden="true">{c.status === "ok" ? "✓" : c.status === "skip" ? "–" : "!"}</i>
                <div><b>{c.name}</b><small>{c.status === "ok" ? c.detail : c.status === "skip" ? c.detail : `${c.count} found. ${c.detail}${c.examples.length ? ` (${c.examples.map((x) => `#${x}`).join(", ")})` : ""}`}</small></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- Send to IT (support bundle)

interface BundlePreview { log_days: number; log_bytes: number; log_days_over_budget: number; has_sessions: boolean; database_bytes: number; folder: string }

/** Checklist items 14 to 16: the user writes a note, chooses the optional parts, sees what goes
 *  into the file, saves it to Downloads and gets help attaching it to an e-mail or Teams message. */
function SendToItModal({ report, onClose }: { report: string | number | null; onClose: () => void }) {
  const reportNo = report != null ? Number(String(report).replace(/\D/g, "")) || null : null;
  const [note, setNote] = useState("");
  const [withReport, setWithReport] = useState(reportNo != null);
  const [withBackup, setWithBackup] = useState(false);
  const [preview, setPreview] = useState<BundlePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<BundleResult | null>(null);
  const [copied, setCopied] = useState(false);
  const s = diag.state;
  useEffect(() => { call<BundlePreview>("diag_bundle_preview").then(setPreview).catch(() => setPreview(null)); }, []);

  const make = async () => {
    if (!note.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      setDone(await buildSupportBundle({ note, includeReport: withReport ? reportNo : null, includeBackup: withBackup }));
    } catch (e) {
      setErr(String(e).replace(/^Error:\s*/, ""));
    } finally { setBusy(false); }
  };
  const showFile = () => { if (done) call("diag_show_bundle", { path: done.path }).catch((e) => setErr(String(e))); };
  const copyPath = async () => { if (done) { const ok = await copyText(done.path); setCopied(ok); } };

  if (done) {
    return (
      <Dialog title="Send to IT" icon={ICON.send} onClose={onClose}
        footer={<>
          <button type="button" className="ghost" onClick={copyPath}>{ICON.copy} {copied ? "Copied" : "Copy file location"}</button>
          <button type="button" className="ghost" onClick={showFile}>{ICON.folder} Show the file</button>
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </>}>
        <div className="sup-done"><span className="sup-done-ico">{ICON.check}</span><div>
          <b>{done.file_name}</b>
          <p>Saved in your <b>Downloads</b> folder ({fmtBundleSize(done.bytes)}).</p>
        </div></div>
        {done.warnings.length > 0 && <ul className="sup-notes">{done.warnings.map((w) => <li key={w}>{ICON.warn}<span>{w}</span></li>)}</ul>}
        <h4 className="sup-h4">Now send it to IT</h4>
        <ol className="sup-howto">
          <li>Press <b>Show the file</b> below. The Downloads folder opens with the file selected.</li>
          <li>In <b>Outlook</b>, start an e-mail to IT, or in <b>Teams</b> open a chat with IT.</li>
          <li>Drag the file into the e-mail or chat (or use <b>Attach</b> and pick it from Downloads).</li>
          <li>Add one line about what went wrong, then send.</li>
        </ol>
        <p className="sup-muted">Please send the file as it is. Do not open, rename or change it.</p>
        {done.removed.length > 0 && (
          <details className="sup-details"><summary>Left out for safety ({done.removed.length})</summary>
            <ul className="sup-plain">{done.removed.map((r) => <li key={r}>{r}</li>)}</ul></details>
        )}
        {err && <p className="sup-err">{err}</p>}
      </Dialog>
    );
  }

  const logLine = preview
    ? `Last ${preview.log_days} day${preview.log_days === 1 ? "" : "s"} of the MMS log (${fmtBundleSize(preview.log_bytes)} before packing)`
    : "The MMS log of the last 14 days";
  const contents: [string, string | null][] = [
    ["Your note", note.trim() ? "Ready" : "Write it above"],
    [logLine, preview?.log_days_over_budget ? `${preview.log_days_over_budget} older day(s) left out to keep the file small` : null],
    ["This laptop's MMS details (version, Windows, database size)", null],
    ["Check my data results", null],
    ["When MMS was started and closed (crash history)", preview && !preview.has_sessions ? "None recorded yet" : null],
    [`Your last steps, errors and timings on screen (${s.trail.length} steps, ${s.errors.length} errors)`, null],
  ];
  if (withReport && reportNo) contents.push([`MR-I report #${reportNo}`, "Photos left out"]);
  if (withBackup) contents.push(["A full copy of your MMS data", preview ? `About ${fmtBundleSize(preview.database_bytes)} before packing · photos and drawings left out` : "Photos and drawings left out"]);

  return (
    <Dialog title="Send to IT" icon={ICON.send} onClose={busy ? () => {} : onClose} wide
      footer={<>
        <button type="button" className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="primary" onClick={make} disabled={!note.trim() || busy}>{busy ? <><span className="sup-spin" /> Making the file…</> : <>{ICON.box} Make the file</>}</button>
      </>}>
      <p className="sup-muted">MMS packs everything IT needs to find the problem into <b>one file</b> in your Downloads folder. Nothing is sent automatically: you attach the file to an e-mail or Teams message yourself.</p>
      <label className="sup-field"><span>What went wrong? <b>*</b></span>
        <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} disabled={busy}
          placeholder="e.g. Saving the Footer of the MR-I report for unit 12 did nothing." /></label>
      <div className="sup-options">
        {reportNo != null && (
          <label className="sup-check"><input type="checkbox" checked={withReport} disabled={busy} onChange={(e) => setWithReport(e.target.checked)} /> Include the report I am on (#{reportNo})</label>
        )}
        <label className="sup-check"><input type="checkbox" checked={withBackup} disabled={busy} onChange={(e) => setWithBackup(e.target.checked)} /> Include a full copy of my MMS data <small>(only when IT asks for it)</small></label>
      </div>
      <h4 className="sup-h4">What goes into the file</h4>
      <ul className="sup-contents">
        {contents.map(([label, note2]) => <li key={label}>{ICON.check}<span>{label}{note2 && <small>{note2}</small>}</span></li>)}
      </ul>
      <p className="sup-never">{ICON.warn}<span><b>Never included:</b> photos, drawings, passwords and the database key.</span></p>
      {err && <p className="sup-err">{err}</p>}
    </Dialog>
  );
}

function ExportModal({ initial, onClose, onSaved }: { initial: string | number | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [id, setId] = useState(initial != null ? String(initial).replace(/\D/g, "") : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    const n = Number(id);
    if (!n) return;
    setBusy(true); setErr(null);
    try {
      const json = await call<string>("diag_export_report", { reportId: n });
      const file = `MMS-report-${n}-for-support-${fileStamp()}.json`;
      saveFile(file, json, "application/json");
      diag.step(`Exported report #${n} for support`);
      onSaved(`Saved "${file}" in your Downloads folder. Send it to Jess with your issue.`);
      onClose();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog title="Export a report for support" icon={ICON.report} onClose={onClose}
      footer={<><button type="button" className="ghost" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={go} disabled={!Number(id) || busy}>{busy ? "Exporting…" : "Export"}</button></>}>
      <p className="sup-muted">Saves one MR-I report with its answers, faults, decisions and repairs, so Jess can reproduce a problem exactly. Photos are left out.</p>
      <label className="sup-field"><span>Report number</span>
        <input type="number" min={1} autoFocus value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} placeholder="e.g. 12" /></label>
      {err && <p className="sup-err">{err}</p>}
    </Dialog>
  );
}

function CrashModal({ session, onClose, onSave, sendToIt }: { session: SessionStart; onClose: () => void; onSave: () => void; sendToIt?: boolean }) {
  const prev = diag.state.previous;
  return (
    <Dialog title="MMS did not close properly last time" icon={ICON.warn} onClose={onClose}
      footer={<><button type="button" className="ghost" onClick={onClose}>Not now</button><button type="button" className="primary" onClick={onSave}>{sendToIt ? "Send to IT" : "Save diagnostics file"}</button></>}>
      <p>The last session{session.previous_started ? ` (started ${session.previous_started})` : ""} ended without closing normally, for example the program stopped or the computer was switched off.</p>
      {prev?.trail?.length ? <p className="sup-muted">Last thing recorded: <b>{prev.trail[prev.trail.length - 1].text}</b> on {prev.screen}, {localStamp(prev.savedAt)}.</p> : null}
      {session.crash_note && <pre className="sup-pre">{session.crash_note}</pre>}
      <p>{sendToIt ? "If something went wrong, use Send to IT to make one file for IT. It includes what you did just before." : "If something went wrong, save a diagnostics file and send it to Jess. It includes what you did just before."}</p>
    </Dialog>
  );
}

// ---------------------------------------------------------------- support mode (#10)

function SupportPanel({ onClose }: { onClose: () => void }) {
  useDiag();
  const [filter, setFilter] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [tab, setTab] = useState<"calls" | "steps" | "errors">("calls");
  const s = diag.state;
  const calls = useMemo(() => [...s.ipc].reverse().filter((c) => (!errorsOnly || !c.ok) && (!filter || c.cmd.includes(filter) || c.args.includes(filter))), [s.ipc, filter, errorsOnly]);
  return (
    <div className="sup-panel" role="complementary" aria-label="Support mode">
      <div className="sup-panel-head">
        <b><i className="sup-live" /> Support mode</b>
        <div className="sup-tabs">
          {(["calls", "steps", "errors"] as const).map((t) => <button key={t} type="button" className={tab === t ? "is-on" : ""} onClick={() => setTab(t)}>{t === "calls" ? `Commands ${s.ipc.length}` : t === "steps" ? `Steps ${s.trail.length}` : `Errors ${s.errors.length}`}</button>)}
        </div>
        <button type="button" className="sup-x" aria-label="Close support mode" onClick={onClose}>×</button>
      </div>
      {tab === "calls" && (
        <div className="sup-panel-tools">
          <input type="search" placeholder="Filter by command" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label className="sup-check"><input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> Failed only</label>
          <button type="button" className="ghost" onClick={() => diag.clearIpc()}>Clear</button>
        </div>
      )}
      <div className="sup-panel-body">
        {tab === "calls" && (calls.length === 0 ? <p className="sup-muted">No commands yet. Use MMS and they appear here.</p> : (
          <table><thead><tr><th>Time</th><th>Command</th><th>ms</th><th>Result</th></tr></thead><tbody>
            {calls.slice(0, 200).map((c) => (
              <tr key={c.id} className={c.ok ? "" : "is-err"} title={c.args}>
                <td>{timeOnly(c.t)}</td><td><code>{c.cmd}</code>{c.args && <small>{c.args}</small>}</td>
                <td className={c.ms > 500 ? "is-slow" : ""}>{c.ms}</td><td>{c.ok ? c.result : c.error}</td>
              </tr>
            ))}
          </tbody></table>
        ))}
        {tab === "steps" && <ol className="sup-steps">{[...s.trail].reverse().map((t, n) => <li key={n}><span>{timeOnly(t.t)}</span>{t.text}<small>{t.screen}</small></li>)}</ol>}
        {tab === "errors" && (s.errors.length === 0 ? <p className="sup-muted">No errors.</p> : <ol className="sup-steps">{[...s.errors].reverse().map((e, n) => <li key={n} className="is-err"><span>{timeOnly(e.t)}</span>{e.message}<small>{e.screen} · {e.source}</small></li>)}</ol>)}
      </div>
    </div>
  );
}
