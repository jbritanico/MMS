import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// Support and debugging: the in-memory record the support tools read from.
//  - Activity trail (#2): the last 50 things the user did (screens opened, buttons pressed).
//    Never what they typed.
//  - Recent errors: every error message, failed command and script error.
//  - Command log (#10): the last 200 calls to the Rust side, with time taken and result.
//  - Log lines are batched and written to the app log file (#6) by the Rust side.
// The trail and errors are also kept in localStorage, so after a crash the next start can
// still show what happened just before (#9).

export interface TrailItem { t: number; text: string; screen: string }
export interface ErrItem { t: number; message: string; source: string; screen: string; context: string }
export interface IpcItem { id: number; t: number; cmd: string; ms: number; ok: boolean; args: string; result: string; error?: string }
export interface SessionSnapshot { savedAt: number; screen: string; user: string; trail: TrailItem[]; errors: ErrItem[] }
export type SystemInfo = Record<string, unknown>;

const MAX_TRAIL = 50;
const MAX_ERRORS = 30;
const MAX_IPC = 200;
const STORE_KEY = "mms.diag.session";

function loadPrevious(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as SessionSnapshot) : null;
  } catch {
    return null;
  }
}

const state = {
  screen: "Start",
  context: {} as Record<string, string | number | null | undefined>,
  user: null as { name: string; role: string } | null,
  trail: [] as TrailItem[],
  errors: [] as ErrItem[],
  ipc: [] as IpcItem[],
  system: null as SystemInfo | null,
  previous: loadPrevious(),
  tick: 0,
};
let ipcSeq = 0;
const listeners = new Set<() => void>();
const pending: string[] = [];
let flushTimer: number | null = null;
let saveTimer: number | null = null;

function changed() {
  state.tick++;
  listeners.forEach((f) => f());
  if (saveTimer == null) {
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      try {
        const snap: SessionSnapshot = { savedAt: Date.now(), screen: state.screen, user: userText(), trail: state.trail, errors: state.errors };
        localStorage.setItem(STORE_KEY, JSON.stringify(snap));
      } catch { /* storage full or unavailable */ }
    }, 1500);
  }
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
export function localStamp(t = Date.now(), withMs = false) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${withMs ? "." + pad(d.getMilliseconds(), 3) : ""}`;
}
export const timeOnly = (t: number) => localStamp(t).slice(11);
const userText = () => (state.user ? `${state.user.name} (${state.user.role})` : "Nobody signed in");
const contextText = () =>
  Object.entries(state.context)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");

function queueLog(level: "INFO" | "WARN" | "ERROR", msg: string) {
  pending.push(`${localStamp(Date.now(), true)} ${level} [${state.screen}] ${msg}`);
  if (level === "ERROR") flush();
  else if (flushTimer == null) flushTimer = window.setTimeout(flush, 3000);
}
export function flush() {
  if (flushTimer != null) { window.clearTimeout(flushTimer); flushTimer = null; }
  if (!pending.length) return;
  const lines = pending.splice(0, pending.length);
  tauriInvoke("diag_write_log", { lines }).catch(() => { /* not running inside MMS (browser preview) */ });
}

/** Short, privacy-safe summary of a command's arguments: numbers and flags, plus a few known text fields. */
function argsSummary(args?: Record<string, unknown>) {
  if (!args) return "";
  const SAFE_TEXT = /(status|stage|level|type|kind|decision|method|role|table|severity|criteria|view|section)$/i;
  return Object.entries(args)
    .map(([k, v]) => {
      if (v == null) return `${k}=null`;
      if (typeof v === "number" || typeof v === "boolean") return `${k}=${v}`;
      if (typeof v === "string") return SAFE_TEXT.test(k) ? `${k}="${v.slice(0, 24)}"` : `${k}=<text ${v.length}>`;
      if (Array.isArray(v)) return `${k}=[${v.length}]`;
      return `${k}={…}`;
    })
    .join(" ");
}
function resultSummary(r: unknown) {
  if (r == null) return "nothing";
  if (Array.isArray(r)) return `${r.length} row${r.length === 1 ? "" : "s"}`;
  if (typeof r === "string") return r.length > 60 ? `text ${r.length} chars` : `"${r}"`;
  if (typeof r === "object") return `{${Object.keys(r as object).slice(0, 4).join(", ")}${Object.keys(r as object).length > 4 ? ", …" : ""}}`;
  return String(r);
}

export const diag = {
  subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; },
  get tick() { return state.tick; },
  get state() { return state; },

  setScreen(name: string) {
    if (name === state.screen) return;
    state.screen = name;
    diag.step(`Opened ${name}`);
  },
  setContext(ctx: Record<string, string | number | null | undefined>) {
    state.context = ctx;
  },
  setUser(u: { name: string; role: string } | null) {
    const before = state.user?.name;
    state.user = u;
    if (u && u.name !== before) diag.step(`Signed in as ${u.name} (${u.role})`);
  },
  setSystem(info: SystemInfo) { state.system = info; changed(); },

  step(text: string) {
    state.trail = [...state.trail, { t: Date.now(), text, screen: state.screen }].slice(-MAX_TRAIL);
    queueLog("INFO", `STEP ${text}`);
    changed();
  },
  error(message: string, source: string) {
    const msg = String(message || "Unknown error").replace(/^Error:\s*/, "").slice(0, 2000);
    const last = state.errors[state.errors.length - 1];
    if (last && last.message === msg && Date.now() - last.t < 1500) return; // same error reported twice
    state.errors = [...state.errors, { t: Date.now(), message: msg, source, screen: state.screen, context: contextText() }].slice(-MAX_ERRORS);
    queueLog("ERROR", `${source}: ${msg}`);
    changed();
  },
  ipcDone(cmd: string, args: Record<string, unknown> | undefined, ms: number, ok: boolean, result?: unknown, error?: string) {
    const item: IpcItem = { id: ++ipcSeq, t: Date.now(), cmd, ms: Math.round(ms), ok, args: argsSummary(args), result: ok ? resultSummary(result) : "", error };
    state.ipc = [...state.ipc, item].slice(-MAX_IPC);
    if (ok) queueLog("INFO", `CALL ${cmd} ${item.ms} ms ${item.args} -> ${item.result}`);
    else diag.error(error ?? "Command failed", `Command ${cmd}`);
    changed();
  },
  clearIpc() { state.ipc = []; changed(); },
  info(msg: string) { queueLog("INFO", msg); },

  lastError(): ErrItem | null { return state.errors[state.errors.length - 1] ?? null; },

  /** Plain text for "Copy details" (#1). */
  detailsText(err?: ErrItem | null) {
    const e = err ?? diag.lastError();
    const sys = state.system ?? {};
    const trail = state.trail.slice(-12);
    const lines = [
      "MMS problem details",
      "===================",
      `Time: ${localStamp(e?.t ?? Date.now())}`,
      e ? `Error: ${e.message}` : "Error: (no error recorded)",
      e ? `Where: ${e.screen}${e.context ? ` (${e.context})` : ""} · ${e.source}` : `Where: ${state.screen}`,
      `Signed in as: ${userText()}`,
      `MMS version: ${sys.version ?? "?"} (${sys.build ?? "?"})`,
      `Computer: ${sys.computer ?? "?"} · ${sys.windows_version ?? ""}`,
      "",
      "Last steps:",
      ...(trail.length ? trail.map((s, n) => `${String(n + 1).padStart(2, " ")}. ${timeOnly(s.t)}  ${s.text}`) : ["(none recorded)"]),
    ];
    return lines.join("\n");
  },
};

/** Copies text; falls back to a hidden text box when the clipboard API is not allowed. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Saves a file to the Downloads folder (same way as the full backup). */
export function saveFile(name: string, content: string | Blob, type = "text/html") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  diag.info(`Saved file ${name}`);
}
export const fileStamp = () => localStamp().replace(/[-:]/g, "").replace(" ", "-").slice(0, 13);

let installed = false;
/** Global listeners: clicks and choices for the trail, script errors, error messages on screen. */
export function installDiag() {
  if (installed) return;
  installed = true;

  const labelOf = (el: Element) => {
    const aria = el.getAttribute("aria-label") || el.getAttribute("title");
    const text = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim();
    const s = (text && text.length <= 60 ? text : aria) || text || "";
    return s.slice(0, 60);
  };
  document.addEventListener("click", (ev) => {
    const target = ev.target as Element | null;
    const el = target?.closest?.("button, a, [role=button], [role=tab], [role=option], [role=menuitem], summary, input[type=checkbox], input[type=radio], .mrid-click, .dashboard-tile, .menu-card");
    if (!el || el.closest("[data-diag-ignore]")) return;
    const label = labelOf(el);
    if (!label) return;
    const kind = el instanceof HTMLInputElement ? (el.checked ? "Ticked" : "Unticked") : "Pressed";
    diag.step(`${kind} "${label}"`);
  }, true);
  document.addEventListener("change", (ev) => {
    const el = ev.target as HTMLElement | null;
    if (!(el instanceof HTMLSelectElement) || el.closest("[data-diag-ignore]")) return;
    const field = el.getAttribute("aria-label") || el.closest("label")?.querySelector("span")?.textContent || el.name || "a list";
    const chosen = el.selectedOptions[0]?.text ?? el.value;
    diag.step(`Chose "${chosen.slice(0, 40)}" in ${String(field).trim().slice(0, 40)}`);
  }, true);

  window.addEventListener("error", (ev) => diag.error(ev.message || String(ev.error), "Script error"));
  window.addEventListener("unhandledrejection", (ev) => diag.error(String((ev.reason as Error)?.message ?? ev.reason), "Unhandled error"));
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origError(...args);
    try {
      const first = args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : "")).find(Boolean);
      // React development warnings are not errors for the user.
      if (first && !/^Warning:|act\(|DevTools/.test(first)) diag.error(first, "Console error");
    } catch { /* ignore */ }
  };

  // Error messages drawn on screen (red toasts and banners) are recorded too.
  const seen = new WeakSet<Element>();
  const scan = (root: ParentNode) => {
    root.querySelectorAll?.(".toast.err, .toast.error").forEach((el) => {
      if (seen.has(el) || el.closest("[data-diag-ignore]")) return;
      seen.add(el);
      const text = (el as HTMLElement).innerText?.trim();
      if (text) diag.error(text, "Message on screen");
    });
  };
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => { if (n instanceof Element) { if (n.matches(".toast.err, .toast.error")) scan(n.parentElement ?? document); else scan(n); } });
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener("beforeunload", () => flush());
  diag.info("App started");
}
