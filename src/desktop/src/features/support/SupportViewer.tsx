import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { useCurrentUser } from "../../lib/currentUser";
import { diag, fileStamp, saveFile } from "../../lib/support/diag";
import { fmtBundleSize } from "../../lib/support/supportBundle";
import { parseSessions, PART, type BundleManifest, type SessionEvent } from "../../lib/support/bundleFormat";
import {
  buildLogData, callStats, calls, errorGroups, fmtDay, fmtMs, fmtT, percentile, rejectKind, rejections, stepsBefore, userOffset,
  type Ev, type LogData, type RejectKind,
} from "./bundleAnalysis";
import RecordInspector, { RI_CSS } from "./RecordInspector";
import { useReportAdminKpis } from "../administration/AdminIsoGuide";
import { RecordStore } from "./recordStore";
import {
  CAUSE_TEXT, LEVEL_TEXT, OVERALL_TEXT, prognosisReportHtml, runPrognosis,
  type Finding, type Level, type Prognosis, type PrognosisInput, type Trend,
} from "./prognosis";
import { developerBrief, FIX_ORDER, FIX_TEXT, needsBrief, type FixType } from "./fixplan";

// Support viewer (Administration › Diagnostics), Administrator tier only.
//  Item 19  open a .mmsbundle (read into memory on the Rust side, never imported)
//  Item 20  the screen: bundle summary, a place for the prognosis, one tab per dashboard
//  Item 21  Environment tab        (system.json)
//  Item 22  Crash history tab      (sessions.log)
//  Item 23  Data checks tab        (checks.json)
//  Item 24  Error inbox tab        (logs)
//  Item 25  Action replay tab      (logs)
//  Item 26  Call log tab           (logs)
//  Item 27  Rejected actions tab   (logs)
//  Item 28  Record inspector tab   (report.json, backup.json; read when the tab is first opened)
//  Items 29-34  Prognosis card at the top (prognosis.ts): rating, findings with cause and fix, outlook, one-page report
//  Items 41-45  Fix plan tab (fixplan.ts): do this now, permanent fix, fix type, developer brief
// Later items add tabs for the Error inbox, Action replay, Call log, Rejected actions and the
// Record inspector, and fill in the prognosis.
//
// Look: the app's own panel, buttons, heading and segmented tabs (the --seg-* theme variables,
// as in Checklist Bank), plus a small scoped style that only uses theme tokens, so Light, Dark,
// macOS and Fluent all style it. One type scale: 11px labels · 12.5px secondary · 14px body ·
// 16px titles, all in the app font.

export interface BundleOverview {
  file_name: string;
  bytes: number;
  manifest: BundleManifest;
  names: string[];
  missing: string[];
}

interface DataCheck { key: string; name: string; status: "ok" | "warn" | "error" | "skip"; count: number; detail: string; examples: number[] }
type SystemInfo = Record<string, unknown> & {
  version?: string; build?: string; windows_version?: string; computer?: string; data_folder?: string; database_file?: string;
  database_bytes?: number; sqlite_version?: string; schema_migrations?: number; last_migration?: string | null; generated_at?: string;
  table_rows?: Record<string, number>;
  trial?: { enabled?: boolean; days_left?: number | null; expires_at?: number | null; expired?: boolean; clock_back?: boolean } | null;
};
interface Loaded { system?: SystemInfo; sessions?: SessionEvent[]; checks?: DataCheck[]; logs?: LogData; problems: string[] }

type Tab = "fixplan" | "environment" | "errors" | "replay" | "calls" | "rejected" | "records" | "crashes" | "checks" | "contents";

/** Reads one part of the open bundle (Administrator only, checked again on the Rust side). */
export function readBundlePart(userId: number, path: string) {
  return tauriInvoke<string>("diag_bundle_part", { userId, path });
}

const I = {
  bundle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M4 7.5 12 3.5l8 4v9l-8 4-8-4z" /><path d="M4 7.5l8 4 8-4M12 11.5v9" /></svg>,
  logs: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 4h9l3 3v13H6z" /><path d="M9 11h6M9 14.5h6M9 18h4" /></svg>,
  system: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="11" rx="1.5" /><path d="M8 20h8M12 16v4" /></svg>,
  checks: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.2" /></svg>,
  sessions: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  screen: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4l5 15 2.2-6.3L18.5 10z" /></svg>,
  report: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></svg>,
  backup: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><ellipse cx="12" cy="6" rx="7" ry="2.6" /><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" /></svg>,
  other: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 4h9l3 3v13H6z" /></svg>,
  lock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" /></svg>,
  pulse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2.5-6 4 12 2.5-6H21" /></svg>,
};

const SECTIONS: { key: string; label: string; icon: ReactNode }[] = [
  { key: "logs", label: "App log", icon: I.logs },
  { key: "screen", label: "Steps, errors and timings on screen", icon: I.screen },
  { key: "system", label: "Laptop and MMS details", icon: I.system },
  { key: "checks", label: "Check my data results", icon: I.checks },
  { key: "sessions", label: "Start and close history", icon: I.sessions },
  { key: "report", label: "MR-I report", icon: I.report },
  { key: "backup", label: "Full copy of MMS data", icon: I.backup },
];

// ---------------------------------------------------------------- helpers

function utcToDate(utc: string | undefined | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(utc ?? "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}
/** "2026-11-19 09:54:22 UTC" -> "19 Nov 2026, 13:54" in this laptop's time. */
function localTime(utc: string | undefined | null) {
  const d = utcToDate(utc);
  return d ? d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : utc || "—";
}
function duration(ms: number) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}
function compareVersions(a: string, b: string) {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return Math.sign(d); }
  return 0;
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface SessionRow { started: SessionEvent; ended: "clean" | "unclean" | "open" | "unknown"; endAt?: string; crashNote?: string | null }
/** Pairs each start with how it ended: clean end, "did not close properly" (next start says so),
 *  still running when the bundle was made (last start), or unknown (developer runs). */
function sessionRows(events: SessionEvent[]): SessionRow[] {
  const rows: SessionRow[] = [];
  events.forEach((e, i) => {
    if (e.event !== "start") return;
    const rest = events.slice(i + 1);
    const nextStart = rest.findIndex((x) => x.event === "start");
    const between = nextStart < 0 ? rest : rest.slice(0, nextStart);
    const end = between.find((x) => x.event === "end");
    const unclean = between.find((x) => x.event === "unclean_end") ?? (nextStart >= 0 ? rest.slice(nextStart - 1, nextStart).find((x) => x.event === "unclean_end") : undefined);
    if (end) rows.push({ started: e, ended: "clean", endAt: end.at });
    else if (unclean) rows.push({ started: e, ended: "unclean", crashNote: unclean.crash_note });
    else if (nextStart < 0) rows.push({ started: e, ended: "open" });
    else rows.push({ started: e, ended: "unknown" });
  });
  return rows.reverse();
}

// ---------------------------------------------------------------- screen

export default function SupportViewer() {
  const { user } = useCurrentUser();
  const [overview, setOverview] = useState<BundleOverview | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [records, setRecords] = useState<{ store: RecordStore | null; loading: boolean; problem?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("environment");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Forget the bundle when leaving the screen.
  useEffect(() => () => { tauriInvoke("diag_close_bundle").catch(() => {}); }, []);

  async function readParts(ov: BundleOverview, userId: number): Promise<Loaded> {
    const out: Loaded = { problems: [] };
    const read = async (path: string) => (ov.names.includes(path) ? readBundlePart(userId, path) : null);
    try { const t = await read(PART.system); if (t) out.system = JSON.parse(t); } catch (e) { out.problems.push(`Laptop details could not be read: ${e}`); }
    try { const t = await read(PART.sessions); if (t != null) out.sessions = parseSessions(t); } catch (e) { out.problems.push(`Start and close history could not be read: ${e}`); }
    try { const t = await read(PART.checks); if (t) { const j = JSON.parse(t); if (Array.isArray(j)) out.checks = j; } } catch (e) { out.problems.push(`Data check results could not be read: ${e}`); }
    try {
      let savedAt: string | undefined;
      try { const t = await read(PART.screen); if (t) savedAt = JSON.parse(t).saved_at; } catch { /* no screen record: times stay as logged */ }
      const logNames = ov.names.filter((n) => n.startsWith(PART.logsDir));
      const files = await Promise.all(logNames.map(async (name) => ({ name, text: await readBundlePart(userId, name) })));
      out.logs = buildLogData(files, userOffset(ov.manifest.created_at, savedAt));
    } catch (e) { out.problems.push(`The app log could not be read: ${e}`); }
    return out;
  }

  async function open(file: File | undefined) {
    if (!file || !user) return;
    setBusy(true); setErr(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ov = await tauriInvoke<BundleOverview>("diag_open_bundle", bytes, {
        headers: { "x-mms-user-id": String(user.id), "x-mms-file-name": encodeURIComponent(file.name) },
      });
      const parts = await readParts(ov, user.id);
      setOverview(ov); setLoaded(parts); setRecords(null); setSaved(null); setTab("fixplan");
      diag.step(`Opened support bundle ${ov.file_name}`);
    } catch (e) {
      setErr(String(e).replace(/^Error:\s*/, ""));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function close() {
    tauriInvoke("diag_close_bundle").catch(() => {});
    setOverview(null); setLoaded(null); setRecords(null); setErr(null);
  }
  const pick = () => fileRef.current?.click();

  // Record inspector: read the report and full copy only when the tab is first opened (the full
  // copy can be several MB).
  useEffect(() => {
    if (tab !== "records" || !overview || !user || records) return;
    setRecords({ store: null, loading: true });
    const read = async (path: string) => (overview.names.includes(path) ? JSON.parse(await readBundlePart(user.id, path)) : null);
    (async () => {
      try {
        const [report, backup] = await Promise.all([read(PART.report), read(PART.backup)]);
        setRecords({ store: RecordStore.from(report, backup), loading: false });
      } catch (e) {
        setRecords({ store: null, loading: false, problem: `The report or data in the bundle could not be read: ${e}` });
      }
    })();
  }, [tab, overview, user, records]);

  const m = overview?.manifest;
  const sessions = loaded?.sessions ? sessionRows(loaded.sessions) : [];
  const crashes = sessions.filter((s) => s.ended === "unclean").length;
  const checkIssues = (loaded?.checks ?? []).filter((c) => c.status === "warn" || c.status === "error").length;
  const pInput = useMemo<PrognosisInput | null>(() => (overview && loaded ? {
    manifest: overview.manifest, missingParts: overview.missing, system: loaded.system,
    thisVersion: diag.state.system?.version as string | undefined,
    thisMigrations: diag.state.system?.schema_migrations as number | undefined,
    sessions: loaded.sessions ? sessionRows(loaded.sessions) : undefined, checks: loaded.checks, logs: loaded.logs,
  } : null), [overview, loaded]);
  const prognosis = useMemo(() => (pInput ? runPrognosis(pInput) : null), [pInput]);
  const devFixes = (prognosis?.findings ?? []).filter((f) => f.plan?.release).length;
  const [saved, setSaved] = useState<string | null>(null);
  const findings = prognosis ? (prognosis.counts.action ?? 0) + (prognosis.counts.attention ?? 0) : null;
  useReportAdminKpis("support-viewer", [
    { label: "bundle open", value: overview ? "1" : "none", tone: overview ? "ok" : "skip" },
    { label: "findings in it", value: findings ?? "—", tone: findings ? "look" : findings === 0 ? "ok" : "skip" },
    { label: "read only", value: "✓", tone: "ok" },
  ]);
  const [dragOver, setDragOver] = useState(false);
  // The old "Opened recently on this PC" list was removed; clear what it had kept on this PC.
  useEffect(() => { try { localStorage.removeItem("mms.support.recentBundles"); } catch { /* storage unavailable */ } }, []);
  function saveReport() {
    if (!overview || !prognosis) return;
    const who = (overview.manifest.user?.name ?? "user").replace(/[^A-Za-z0-9]+/g, "-");
    const name = `MMS-Prognosis-${who}-${fileStamp()}.html`;
    saveFile(name, prognosisReportHtml(prognosis, overview.manifest, overview.file_name, user ? `${user.name} (${user.role})` : "IT", new Date().toLocaleString()));
    diag.step(`Saved prognosis report ${name}`);
    setSaved(name);
  }
  const errorCount = loaded?.logs ? inboxGroups(loaded.logs).length : 0;
  const bugCount = loaded?.logs ? rejections(loaded.logs).filter((r) => r.kind === "bug").length : 0;
  const tabs: { id: Tab; label: string; badge?: number; tone?: "warn" | "bad" }[] = [
    { id: "fixplan", label: "Fix plan", badge: devFixes || undefined, tone: "bad" },
    { id: "environment", label: "Environment" },
    { id: "errors", label: "Error inbox", badge: errorCount || undefined, tone: "bad" },
    { id: "replay", label: "Action replay" },
    { id: "calls", label: "Call log" },
    { id: "rejected", label: "Rejected actions", badge: bugCount || undefined, tone: "bad" },
    { id: "records", label: "Record inspector" },
    { id: "crashes", label: "Crash history", badge: crashes || undefined, tone: "bad" },
    { id: "checks", label: "Data checks", badge: checkIssues || undefined, tone: "warn" },
    { id: "contents", label: "Contents" },
  ];

  return (
    <div className="sv">
      <style>{SV_CSS + RI_CSS}</style>
      <input ref={fileRef} type="file" accept=".mmsbundle" style={{ display: "none" }} onChange={(e) => open(e.target.files?.[0])} />

      <div className="sv-top">
        <div className="sv-top-text">
          <p>Open a support bundle that someone sent with <b>Help → Send to IT</b>. It is only read here; nothing from it is added to this laptop's data.</p>
        </div>
        {overview && (
          <div className="sv-top-actions">
            <button className="ghost" onClick={close} disabled={busy}>Close</button>
            <button className="primary" onClick={pick} disabled={busy || !user}>{busy ? "Opening…" : "Open another"}</button>
          </div>
        )}
      </div>

      {err && <div className="toast err sv-toast">{err}</div>}

      {!overview || !m || !loaded ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div
          className="panel sv-panel sv-empty"
          style={{ borderStyle: "dashed", borderWidth: 2, borderColor: dragOver ? "var(--tig-blue)" : undefined, background: dragOver ? "var(--tig-blue-soft)" : undefined }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (user && !busy) open(e.dataTransfer.files?.[0]); }}
        >
          <DropPlatform active={dragOver} />
          <div className="sv-title">Drop a support bundle here</div>
          <p className="sv-soft">Or choose the <b>MMS-Support-….mmsbundle</b> file, for example from your Downloads folder or an e-mail attachment you saved.</p>
          <button className="primary" onClick={pick} disabled={busy || !user}>{busy ? "Opening…" : "Choose bundle…"}</button>
        </div>
        </div>
      ) : (
        <div className="sv-cols">
          <div className="sv-side">
          {/* Summary */}
          <div className="panel sv-panel">
            <div className="sv-head">
              <span className="sv-tile">{I.bundle}</span>
              <div className="sv-head-text">
                <div className="sv-title">{overview.file_name}</div>
                <div className="sv-soft">{fmtBundleSize(overview.bytes)} · made {localTime(m.created_at)} · bundle format {m.format_version}</div>
              </div>
              <span className="sv-chip is-ok">{I.lock}Read only</span>
            </div>
            <div className="sv-label">What went wrong</div>
            <div className="sv-note">{m.note || "No note was written."}</div>
            <div className="sv-facts">
              <Fact label="Sent by" value={m.user?.name ?? "Unknown user"} sub={m.user?.role || "Role not recorded"} />
              <Fact label="Where" value={m.screen || "Not recorded"} sub={m.includes_report != null ? `Report #${m.includes_report}` : "No report included"} />
              <Fact label="MMS version" value={m.mms_version} sub={m.build || "—"} />
              <Fact label="Computer" value={m.computer || "Not recorded"} sub={m.includes_backup ? "Full copy of data included" : "No full copy of data"} />
            </div>
            {overview.missing.length > 0 && (
              <div className="toast err sv-toast">Listed in the bundle but missing from the file: {overview.missing.join(", ")}. The file may be damaged or changed.</div>
            )}
            {loaded.problems.map((p) => <div key={p} className="toast err sv-toast">{p}</div>)}
          </div>

          {/* Prognosis (items 29 to 34) */}
          {prognosis && (
            <PrognosisCard p={prognosis} tabLabel={(id) => tabs.find((t) => t.id === id)?.label ?? id}
              onOpenTab={(id) => setTab(id as Tab)} onSave={saveReport} saved={saved} pulse={I.pulse} />
          )}

          </div>

          <div className="sv-main">
          {/* Tabs */}
          <div className="sv-tabs" role="tablist" aria-label="Support bundle">
            {tabs.map((t) => {
              const on = tab === t.id;
              return (
                <button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)}
                  style={{
                    padding: "var(--seg-pad, 7px 16px)", border: "var(--seg-border, none)", borderRadius: "var(--seg-radius, 9px)",
                    fontSize: "var(--seg-font, 13px)", fontWeight: on ? "var(--seg-on-weight, 600)" : "var(--seg-off-weight, 600)",
                    background: on ? "var(--seg-on-bg, var(--neu-bg))" : "transparent",
                    color: on ? "var(--seg-on-color, var(--accent-blue))" : "var(--seg-off-color, var(--text-soft))",
                    boxShadow: on ? "var(--seg-on-shadow, var(--neu-inset-sm))" : "none",
                  }}>
                  {t.label}{t.badge ? <span className={`sv-badge ${t.tone === "bad" ? "is-bad" : "is-warn"}`}>{t.badge}</span> : null}
                </button>
              );
            })}
          </div>

          <div className="panel sv-panel">
            {tab === "fixplan" && prognosis && pInput && <FixPlanTab p={prognosis} input={pInput} fileName={overview.file_name}
              tabLabel={(id) => tabs.find((t) => t.id === id)?.label ?? id} onOpenTab={(id) => setTab(id as Tab)} />}
            {tab === "environment" && <EnvironmentTab system={loaded.system} />}
            {tab === "crashes" && <CrashTab rows={sessions} has={loaded.sessions != null} />}
            {tab === "checks" && <ChecksTab checks={loaded.checks} />}
            {tab === "errors" && <ErrorsTab logs={loaded.logs} />}
            {tab === "replay" && <ReplayTab logs={loaded.logs} />}
            {tab === "calls" && <CallsTab logs={loaded.logs} />}
            {tab === "rejected" && <RejectedTab logs={loaded.logs} />}
            {tab === "records" && <RecordInspector store={records?.store ?? null} loading={!records || records.loading} problem={records?.problem} />}
            {tab === "contents" && <ContentsTab overview={overview} />}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={`sv-fact${tone ? ` is-${tone}` : ""}`}>
      <span className="sv-label">{label}</span>
      <b>{value}</b>
      {sub != null && <span className="sv-soft">{sub}</span>}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="sv-soft sv-empty-line">{children}</p>;
}

// ---------------------------------------------------------------- item 21: Environment

function EnvironmentTab({ system }: { system?: SystemInfo }) {
  const [showTables, setShowTables] = useState(false);
  if (!system) return <Empty>This bundle has no laptop details.</Empty>;
  const here = diag.state.system?.version as string | undefined;
  const v = system.version ?? "";
  const cmp = here && v ? compareVersions(v, here) : 0;
  const versionNote = !here || !v ? undefined : cmp === 0 ? "Same as this laptop" : cmp < 0 ? `Older than this laptop (${here})` : `Newer than this laptop (${here})`;
  const trial = system.trial;
  const trialText = !trial || !trial.enabled ? "Not a trial build"
    : trial.expired ? "Trial has ended"
    : trial.days_left != null ? `${plural(trial.days_left, "day")} left` : "Trial";
  const trialTone = trial?.enabled && (trial.expired || (trial.days_left ?? 99) <= 5) ? "bad" : undefined;
  const tables = Object.entries(system.table_rows ?? {}).sort((a, b) => b[1] - a[1]);
  const totalRows = tables.reduce((s, [, n]) => s + Math.max(0, n), 0);
  return (
    <div className="sv-tab">
      <div className="sv-tab-head">
        <div><div className="sv-title">Laptop and MMS</div><div className="sv-soft">As read on the user's laptop at {localTime(system.generated_at as string)}.</div></div>
      </div>
      <div className="sv-facts">
        <Fact label="MMS version" value={v || "—"} sub={versionNote} tone={cmp < 0 ? "warn" : undefined} />
        <Fact label="Build" value={system.build || "—"} sub={system.build === "Developer run" ? "Not an installed copy" : undefined} />
        <Fact label="Trial" value={trialText} sub={trial?.clock_back ? "The laptop clock was set back" : undefined} tone={trialTone ?? (trial?.clock_back ? "warn" : undefined)} />
        <Fact label="Database size" value={fmtBundleSize(Number(system.database_bytes) || 0)} sub={`${totalRows.toLocaleString()} records`} />
      </div>
      <dl className="sv-rows">
        <Row k="Windows" v={system.windows_version} />
        <Row k="Computer name" v={system.computer} />
        <Row k="Database upgrades" v={system.schema_migrations != null ? `${system.schema_migrations} applied${system.last_migration ? ` · last: ${system.last_migration}` : ""}` : undefined} />
        <Row k="SQLite" v={system.sqlite_version} />
        <Row k="Data folder" v={system.data_folder} />
        <Row k="Database file" v={system.database_file} />
      </dl>
      {tables.length > 0 && (
        <>
          <button className="ghost sv-link" onClick={() => setShowTables((s) => !s)}>{showTables ? "Hide" : "Show"} records per table ({tables.length} tables)</button>
          {showTables && (
            <div className="sv-tablegrid">
              {tables.map(([t, n]) => <span key={t}><span>{t}</span><b>{n < 0 ? "?" : n.toLocaleString()}</b></span>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
function Row({ k, v }: { k: string; v: unknown }) {
  return <div><dt>{k}</dt><dd>{v == null || v === "" ? "—" : String(v)}</dd></div>;
}

// ---------------------------------------------------------------- item 22: Crash history

function CrashTab({ rows, has }: { rows: SessionRow[]; has: boolean }) {
  if (!has) return <Empty>This bundle has no start and close history. It was probably made by an older MMS.</Empty>;
  if (!rows.length) return <Empty>No starts were recorded.</Empty>;
  const clean = rows.filter((r) => r.ended === "clean").length;
  const unclean = rows.filter((r) => r.ended === "unclean").length;
  const unknown = rows.filter((r) => r.ended === "unknown").length;
  const versions = [...new Set(rows.map((r) => r.started.version).filter(Boolean))];
  return (
    <div className="sv-tab">
      <div className="sv-tab-head">
        <div><div className="sv-title">Starts and closes</div><div className="sv-soft">Newest first. Times are in this laptop's time.</div></div>
      </div>
      <div className="sv-facts">
        <Fact label="Times started" value={rows.length} />
        <Fact label="Closed normally" value={clean} tone={clean ? "ok" : undefined} />
        <Fact label="Did not close properly" value={unclean} sub={unclean ? "Crash, freeze or power off" : "None"} tone={unclean ? "bad" : "ok"} />
        <Fact label="Versions used" value={versions.join(", ") || "—"} sub={versions.length > 1 ? "Upgraded during this period" : undefined} />
      </div>
      {unknown > 0 && <p className="sv-soft">{plural(unknown, "start")} with no close recorded. This is normal for developer runs, which are stopped without closing.</p>}
      <ul className="sv-events">
        {rows.map((r, i) => {
          const s = utcToDate(r.started.at), e = utcToDate(r.endAt);
          const tone = r.ended === "clean" ? "ok" : r.ended === "unclean" ? "bad" : r.ended === "open" ? "info" : "muted";
          const text = r.ended === "clean" ? `Closed normally${s && e ? ` after ${duration(e.getTime() - s.getTime())}` : ""}`
            : r.ended === "unclean" ? "Did not close properly"
            : r.ended === "open" ? "Still open when the bundle was made"
            : "No close recorded";
          return (
            <li key={i} className={`is-${tone}`}>
              <i aria-hidden="true" />
              <div className="sv-ev-main">
                <b>{localTime(r.started.at)}</b>
                <span className="sv-soft">{text}{r.crashNote ? ` · ${r.crashNote}` : ""}</span>
              </div>
              <span className="sv-ev-side">{r.started.version ? `MMS ${r.started.version}` : ""}{r.started.build ? <small>{r.started.build}</small> : null}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- item 23: Data checks

const CHECK_TEXT: Record<DataCheck["status"], string> = { ok: "OK", warn: "Check", error: "Problem", skip: "Could not run" };

function ChecksTab({ checks }: { checks?: DataCheck[] }) {
  if (!checks) return <Empty>This bundle has no data check results.</Empty>;
  const order = { error: 0, warn: 1, skip: 2, ok: 3 } as const;
  const sorted = [...checks].sort((a, b) => order[a.status] - order[b.status]);
  const errors = checks.filter((c) => c.status === "error").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const skipped = checks.filter((c) => c.status === "skip").length;
  const ok = checks.filter((c) => c.status === "ok").length;
  return (
    <div className="sv-tab">
      <div className="sv-tab-head">
        <div><div className="sv-title">Check my data</div><div className="sv-soft">The read-only checks MMS ran on the user's laptop when the bundle was made.</div></div>
      </div>
      <div className="sv-facts">
        <Fact label="Problems" value={errors} tone={errors ? "bad" : "ok"} sub={errors ? "Data that breaks a rule" : "None"} />
        <Fact label="To check" value={warns} tone={warns ? "warn" : "ok"} sub={warns ? "Leftover or unusual records" : "None"} />
        <Fact label="Passed" value={ok} tone="ok" />
        <Fact label="Could not run" value={skipped} tone={skipped ? "warn" : undefined} />
      </div>
      <ul className="sv-events sv-checks">
        {sorted.map((c) => {
          const tone = c.status === "error" ? "bad" : c.status === "warn" ? "warn" : c.status === "ok" ? "ok" : "muted";
          return (
            <li key={c.key} className={`is-${tone}`}>
              <i aria-hidden="true" />
              <div className="sv-ev-main">
                <b>{c.name}</b>
                {c.status !== "ok" && <span className="sv-soft">{c.detail}{c.examples?.length ? ` · e.g. record ${c.examples.map((x) => `#${x}`).join(", ")}` : ""}</span>}
              </div>
              <span className="sv-ev-side"><span className={`sv-chip is-${tone}`}>{c.status === "ok" ? CHECK_TEXT.ok : `${c.count} · ${CHECK_TEXT[c.status]}`}</span></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}


// ---------------------------------------------------------------- shared bits for the log tabs

function NoLogs({ logs }: { logs?: LogData }) {
  if (!logs) return <Empty>This bundle has no app log.</Empty>;
  return null;
}
function TimeNote({ logs }: { logs: LogData }) {
  return <span>{logs.offsetKnown ? "Times are the user's own clock." : "Times are as logged (screen times are the user's clock, MMS engine times are UTC)."}</span>;
}
/** The steps before an event, as a small numbered list. */
function StepsBefore({ logs, ev }: { logs: LogData; ev: Ev }) {
  const steps = stepsBefore(logs, ev, 8);
  if (!steps.length) return <p className="sv-soft">No steps were recorded before this.</p>;
  return (
    <ol className="sv-steps">
      {steps.map((s, i) => <li key={i}><span>{fmtT(s.t, false)}</span>{s.line.text}<small>{where(s.line.where)}</small></li>)}
      <li className="is-bad"><span>{fmtT(ev.t, false)}</span>{ev.line.kind === "CALL" ? `${ev.line.call?.cmd}: ${ev.line.call?.error ?? "failed"}` : ev.line.text}<small>{where(ev.line.where)}</small></li>
    </ol>
  );
}
function Group({ open, onToggle, dot, title, sub, side, children }: { open: boolean; onToggle: () => void; dot: string; title: ReactNode; sub?: ReactNode; side?: ReactNode; children?: ReactNode }) {
  return (
    <li className={`is-${dot}${open ? " is-open" : ""}`}>
      <div role="button" tabIndex={0} className="sv-group-btn" onClick={onToggle} aria-expanded={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}>
        <i aria-hidden="true" />
        <div className="sv-ev-main"><b>{title}</b>{sub && <span className="sv-soft">{sub}</span>}</div>
        <span className="sv-ev-side">{side}</span>
        <svg className="sv-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>
      {open && <div className="sv-group-body">{children}</div>}
    </li>
  );
}
const where = (w: string) => (w === "rust" ? "MMS" : w);
const list = (xs: string[], none = "—") => (xs.length ? xs.map(where).join(", ") : none);

// ---------------------------------------------------------------- item 24: Error inbox

/** Errors worth IT's attention: refusals by a business rule or permission are left to Rejected actions. */
function inboxGroups(logs: LogData) {
  return errorGroups(logs).filter((g) => !(g.source.startsWith("Command ") && rejectKind(g.message) !== "bug"));
}

function ErrorsTab({ logs }: { logs?: LogData }) {
  const groups = useMemo(() => (logs ? inboxGroups(logs) : []), [logs]);
  const [open, setOpen] = useState<string | null>(null);
  if (!logs) return <NoLogs logs={logs} />;
  const total = groups.reduce((s, g) => s + g.count, 0);
  const users = [...new Set(groups.flatMap((g) => g.users))];
  const repeated = groups.filter((g) => g.count > 1).length;
  return (
    <div className="sv-tab">
      <div className="sv-tab-head">
        <div><div className="sv-title">Error inbox</div><div className="sv-soft">Every error, with repeats grouped, newest first. Open one to see the steps just before it. <TimeNote logs={logs} /></div></div>
      </div>
      <div className="sv-facts">
        <Fact label="Different errors" value={groups.length} tone={groups.length ? "bad" : "ok"} sub={groups.length ? undefined : "None"} />
        <Fact label="Times they happened" value={total} />
        <Fact label="Happened more than once" value={repeated} tone={repeated ? "warn" : undefined} />
        <Fact label="Users affected" value={users.length} sub={list(users, "None")} />
      </div>
      {!groups.length ? <Empty>No errors in the log. Refused actions (rules and permissions) are in Rejected actions.</Empty> : (
        <ul className="sv-events sv-groups">
          {groups.map((g) => (
            <Group key={g.key} open={open === g.key} onToggle={() => setOpen(open === g.key ? null : g.key)} dot={g.source.startsWith("MMS stopped") ? "bad" : "warn"}
              title={g.message} sub={`${g.source} · ${list(g.screens)}${g.users.length ? ` · ${list(g.users)}` : ""}`}
              side={<><span className={`sv-chip ${g.count > 1 ? "is-bad" : "is-muted"}`}>{g.count}×</span><small>last {fmtT(g.last)}</small></>}>
              <div className="sv-label">Steps before the last time it happened</div>
              <StepsBefore logs={logs} ev={g.items[g.items.length - 1]} />
              {g.count > 1 && <p className="sv-soft">First seen {fmtT(g.first)} · {g.count} times in {new Set(g.items.map((i) => i.session)).size} session(s).</p>}
            </Group>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- item 25: Action replay

function ReplayTab({ logs }: { logs?: LogData }) {
  const [session, setSession] = useState<number | null>(null);
  const [withCalls, setWithCalls] = useState(false);
  if (!logs) return <NoLogs logs={logs} />;
  if (!logs.sessions.length) return <Empty>No sessions in the log.</Empty>;
  const cur = logs.sessions.find((s) => s.n === session) ?? logs.sessions[0];
  const evs = logs.events.filter((e) => e.session === cur.n && (e.line.kind === "STEP" || e.line.level === "ERROR" || e.line.level === "PANIC" || (e.line.kind === "CALL" && (!e.line.call?.ok || withCalls)) || (e.line.where === "rust" && /^(Session|Support bundle|Refused)/.test(e.line.text))));
  const dup = (e: Ev, i: number) => {
    if (e.line.level !== "ERROR") return false;
    const m = /^Command (\S+): /.exec(e.line.text);
    if (!m) return false;
    const prev = evs[i - 1];
    return !!prev && prev.line.kind === "CALL" && prev.line.call?.cmd === m[1] && !prev.line.call.ok && e.t - prev.t < 1000;
  };
  const shown = evs.filter((e, i) => !dup(e, i)).slice(-1000);
  return (
    <div className="sv-tab">
      <div className="sv-tab-head">
        <div><div className="sv-title">Action replay</div><div className="sv-soft">What the user did, step by step: screens opened, buttons pressed, choices made, and any errors. What they typed is never recorded. <TimeNote logs={logs} /></div></div>
      </div>
      <div className="sv-filters">
        <label className="sv-field"><span className="sv-label">Session</span>
          <select value={cur.n} onChange={(e) => setSession(Number(e.target.value))}>
            {logs.sessions.map((s) => (
              <option key={s.n} value={s.n}>{fmtDay(s.start)}, {fmtT(s.start, false).slice(0, 5)}–{fmtT(s.end, false).slice(0, 5)} · {list(s.users, "nobody signed in")} · {s.steps} steps{s.errors ? ` · ${s.errors} errors` : ""}</option>
            ))}
          </select>
        </label>
        <label className="check sv-check"><input type="checkbox" checked={withCalls} onChange={(e) => setWithCalls(e.target.checked)} /> Show database calls</label>
      </div>
      {shown.length >= 1000 && <p className="sv-soft">Showing the last 1000 entries of this session.</p>}
      <ol className="sv-replay">
        {shown.map((e, i) => {
          const isErr = e.line.level === "ERROR" || e.line.level === "PANIC" || (e.line.kind === "CALL" && !e.line.call?.ok);
          const isOpen = e.line.kind === "STEP" && /^Opened /.test(e.line.text);
          const isCall = e.line.kind === "CALL";
          const text = isCall ? `${e.line.call!.cmd} · ${fmtMs(e.line.call!.ms)}${e.line.call!.ok ? ` · ${e.line.call!.result ?? ""}` : ` · ${e.line.call!.error ?? "failed"}`}` : e.line.text;
          return (
            <li key={i} className={isErr ? "is-bad" : isOpen ? "is-screen" : isCall ? "is-call" : ""}>
              <span className="sv-replay-t">{fmtT(e.t, false)}</span>
              <span className="sv-replay-x">{text}</span>
              <small>{e.line.where === "rust" ? "MMS" : e.line.where}</small>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- item 26: Call log

type CallSort = "slowest" | "average" | "used" | "failed";

function CallsTab({ logs }: { logs?: LogData }) {
  const [screen, setScreen] = useState("");
  const [userF, setUserF] = useState("");
  const [sort, setSort] = useState<CallSort>("slowest");
  const [open, setOpen] = useState<string | null>(null);
  const all = useMemo(() => (logs ? calls(logs) : []), [logs]);
  if (!logs) return <NoLogs logs={logs} />;
  const screens = [...new Set(all.map((e) => e.line.where))].sort();
  const users = [...new Set(all.map((e) => e.user).filter(Boolean) as string[])].sort();
  const sel = all.filter((e) => (!screen || e.line.where === screen) && (!userF || e.user === userF));
  const stats = callStats(sel).sort((a, b) =>
    sort === "slowest" ? b.max - a.max : sort === "average" ? b.avg - a.avg : sort === "used" ? b.count - a.count : b.failed - a.failed || b.count - a.count);
  const failed = sel.filter((e) => !e.line.call!.ok).length;
  const times = sel.map((e) => e.line.call!.ms);
  const slow = sel.filter((e) => e.line.call!.ms >= 1000).length;
  const slowest = sel.reduce<Ev | null>((m, e) => (!m || e.line.call!.ms > m.line.call!.ms ? e : m), null);
  const top = Math.max(1, ...stats.map((s) => (sort === "average" ? s.avg : s.max)));
  return (
    <div className="sv-tab">
      <div className="sv-tab-head">
        <div><div className="sv-title">Call log</div><div className="sv-soft">Every request a screen made to the MMS database, with how long it took and whether it worked. Open a row to see each call.</div></div>
      </div>
      <div className="sv-filters">
        <label className="sv-field"><span className="sv-label">Screen</span>
          <select value={screen} onChange={(e) => setScreen(e.target.value)}><option value="">All screens</option>{screens.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="sv-field"><span className="sv-label">User</span>
          <select value={userF} onChange={(e) => setUserF(e.target.value)}><option value="">All users</option>{users.map((u) => <option key={u}>{u}</option>)}</select></label>
        <label className="sv-field"><span className="sv-label">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as CallSort)}>
            <option value="slowest">Slowest single call</option><option value="average">Slowest on average</option><option value="used">Most used</option><option value="failed">Most failures</option>
          </select></label>
      </div>
      <div className="sv-facts">
        <Fact label="Calls" value={sel.length.toLocaleString()} sub={`${stats.length} different requests`} />
        <Fact label="Failed" value={failed} tone={failed ? "bad" : "ok"} sub={failed ? "See Rejected actions" : "None"} />
        <Fact label="Slower than 1 second" value={slow} tone={slow ? "warn" : "ok"} sub={slowest ? `Slowest: ${slowest.line.call!.cmd}, ${fmtMs(slowest.line.call!.ms)}` : undefined} />
        <Fact label="Typical time" value={fmtMs(percentile(times, 50))} sub={`95% within ${fmtMs(percentile(times, 95))}`} />
      </div>
      {!stats.length ? <Empty>No database calls match these filters.</Empty> : (
        <ul className="sv-events sv-groups">
          {stats.map((s) => {
            const v = sort === "average" ? s.avg : s.max;
            const tone = s.failed ? "bad" : s.max >= 1000 ? "warn" : "ok";
            const items = sel.filter((e) => e.line.call!.cmd === s.cmd);
            return (
              <Group key={s.cmd} open={open === s.cmd} onToggle={() => setOpen(open === s.cmd ? null : s.cmd)} dot={tone}
                title={s.cmd} sub={`${s.count.toLocaleString()} call${s.count === 1 ? "" : "s"} · average ${fmtMs(s.avg)} · slowest ${fmtMs(s.max)}${s.failed ? ` · ${s.failed} failed` : ""}`}
                side={<span className="sv-bar sv-bar-sm"><i style={{ width: `${Math.max(3, Math.round((v / top) * 100))}%` }} /></span>}>
                <table className="sv-table">
                  <thead><tr><th>Time</th><th>Screen</th><th>User</th><th className="num">Took</th><th>Result</th></tr></thead>
                  <tbody>
                    {items.slice(-50).reverse().map((e, i) => {
                      const c = e.line.call!;
                      return (
                        <tr key={i} className={c.ok ? "" : "is-bad"}>
                          <td>{fmtT(e.t)}</td><td>{e.line.where}</td><td>{e.user ?? "—"}</td>
                          <td className="num">{fmtMs(c.ms)}</td>
                          <td>{c.ok ? c.result || "OK" : c.error || "Failed"}{c.args ? <small> · {c.args}</small> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {items.length > 50 && <p className="sv-soft">Showing the newest 50 of {items.length}.</p>}
              </Group>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- item 27: Rejected actions

const KIND_TEXT: Record<RejectKind, { label: string; tone: string; help: string }> = {
  rule: { label: "Rule working as intended", tone: "ok", help: "MMS refused because a business rule was not met. Usually training, not a bug." },
  permission: { label: "Permission", tone: "muted", help: "The user's role or settings do not allow this. Check their permissions if they should." },
  bug: { label: "Possible bug", tone: "bad", help: "Looks like a technical failure, not a rule. Worth investigating." },
};

function RejectedTab({ logs }: { logs?: LogData }) {
  const rows = useMemo(() => (logs ? rejections(logs) : []), [logs]);
  const [open, setOpen] = useState<string | null>(null);
  if (!logs) return <NoLogs logs={logs} />;
  const count = (k: RejectKind) => rows.filter((r) => r.kind === k).reduce((s, r) => s + r.count, 0);
  return (
    <div className="sv-tab">
      <div className="sv-tab-head">
        <div><div className="sv-title">Rejected actions</div><div className="sv-soft">Things MMS refused to do, with its reason, so you can tell a bug from a rule doing its job. The label is MMS's best guess from the message. <TimeNote logs={logs} /></div></div>
      </div>
      <div className="sv-facts">
        <Fact label="Rule working as intended" value={count("rule")} tone={count("rule") ? undefined : "ok"} sub="Usually training" />
        <Fact label="Permission" value={count("permission")} sub="Role or settings" />
        <Fact label="Possible bug" value={count("bug")} tone={count("bug") ? "bad" : "ok"} sub={count("bug") ? "Worth investigating" : "None"} />
        <Fact label="Users" value={[...new Set(rows.flatMap((r) => r.users))].length} sub={list([...new Set(rows.flatMap((r) => r.users))], "None")} />
      </div>
      {!rows.length ? <Empty>MMS did not refuse anything in this log.</Empty> : (
        <ul className="sv-events sv-groups">
          {rows.map((r) => {
            const k = KIND_TEXT[r.kind];
            return (
              <Group key={r.key} open={open === r.key} onToggle={() => setOpen(open === r.key ? null : r.key)} dot={r.kind === "bug" ? "bad" : r.kind === "rule" ? "info" : "muted"}
                title={r.message} sub={`${r.cmd} · ${list(r.screens)}${r.users.length ? ` · ${list(r.users)}` : ""}`}
                side={<><span className={`sv-chip is-${k.tone}`}>{k.label}</span><small>{r.count}× · last {fmtT(r.last)}</small></>}>
                <p className="sv-soft">{k.help}</p>
                <div className="sv-label">Steps before the last time</div>
                <StepsBefore logs={logs} ev={r.items[r.items.length - 1]} />
              </Group>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Contents

function ContentsTab({ overview }: { overview: BundleOverview }) {
  const m = overview.manifest;
  const bySection = new Map<string, { count: number; bytes: number }>();
  m.parts.forEach((p) => {
    const cur = bySection.get(p.section) ?? { count: 0, bytes: 0 };
    bySection.set(p.section, { count: cur.count + 1, bytes: cur.bytes + p.bytes });
  });
  const rows = [
    ...SECTIONS.filter((s) => bySection.has(s.key)).map((s) => ({ ...s, ...bySection.get(s.key)! })),
    ...[...bySection.entries()].filter(([k]) => !SECTIONS.some((s) => s.key === k)).map(([k, v]) => ({ key: k, label: k, icon: I.other, ...v })),
  ];
  const biggest = Math.max(1, ...rows.map((r) => r.bytes));
  return (
    <div className="sv-tab">
      <div className="sv-tab-head">
        <div><div className="sv-title">What is in the file</div><div className="sv-soft">Sizes before packing. Photos, drawings, passwords and the database key are never included.</div></div>
      </div>
      <ul className="sv-list">
        {rows.map((r) => (
          <li key={r.key}>
            <span className="sv-list-ico">{r.icon}</span>
            <span className="sv-list-name">
              {r.label}
              {r.key === "logs" && <span className="sv-soft"> · {plural(r.count, "day")}</span>}
              {r.key === "report" && m.includes_report != null && <span className="sv-soft"> · #{m.includes_report}</span>}
            </span>
            <span className="sv-bar"><i style={{ width: `${Math.max(3, Math.round((r.bytes / biggest) * 100))}%` }} /></span>
            <span className="sv-size">{fmtBundleSize(r.bytes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- items 29-34: Prognosis

const LEVEL_DOT: Record<Level, string> = { action: "bad", attention: "warn", info: "info" };
const LEVEL_CHIP: Record<Level, string> = { action: "bad", attention: "warn", info: "info" };

function PrognosisCard({ p, tabLabel, onOpenTab, onSave, saved, pulse }: {
  p: Prognosis; tabLabel: (id: string) => string; onOpenTab: (id: string) => void; onSave: () => void; saved: string | null; pulse: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? p.findings : p.findings.slice(0, 6);
  const summary = [
    p.counts.action ? `${p.counts.action} action required` : "",
    p.counts.attention ? `${p.counts.attention} need${p.counts.attention === 1 ? "s" : ""} attention` : "",
    p.counts.info ? `${p.counts.info} good to know` : "",
  ].filter(Boolean).join(" · ");
  return (
    <div className={`panel sv-panel pg is-${p.overall}`}>
      <div className="pg-head">
        <span className="sv-tile pg-tile">{pulse}</span>
        <div className="sv-head-text">
          <div className="sv-label">Prognosis</div>
          <div className="pg-overall">{OVERALL_TEXT[p.overall]}</div>
          <div className="sv-soft">{summary || "Nothing needs attention"} · {p.rulesChecked} checks run</div>
        </div>
        <button type="button" className="pg-save" onClick={onSave} title="Save a one-page report to your Downloads folder">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
          Save report
        </button>
      </div>
      {saved && <div className="toast ok sv-toast">Saved {saved} in your Downloads folder. Open it in a browser to print it or save it as PDF.</div>}

      {p.findings.length === 0 ? (
        <p className="sv-soft">MMS found nothing that needs attention in this bundle: no errors, crashes, refused actions, data problems or slow saves. If the user still has a problem, use Action replay to see what they did.</p>
      ) : (
        <ul className="sv-events sv-groups">
          {shown.map((f, i) => {
            const key = `${f.rule}-${i}`;
            return (
              <Group key={key} open={open === key} onToggle={() => setOpen(open === key ? null : key)} dot={LEVEL_DOT[f.level]}
                title={f.title} sub={`Likely cause: ${CAUSE_TEXT[f.cause]}${f.plan ? ` · Fix: ${FIX_TEXT[f.plan.type].label}` : ""}`}
                side={<span className={`sv-chip is-${LEVEL_CHIP[f.level]}`}>{LEVEL_TEXT[f.level]}</span>}>
                <FindingBody f={f} tabLabel={tabLabel} onOpenTab={onOpenTab} />
              </Group>
            );
          })}
        </ul>
      )}
      {p.findings.length > 6 && (
        <button type="button" className="ri-link" onClick={() => setAll((x) => !x)}>{all ? "Show the first 6" : `Show all ${p.findings.length} findings`}</button>
      )}

      {p.trends.length > 0 && (
        <>
          <div className="sv-label pg-sub">Outlook: what happens if nothing changes</div>
          <div className="pg-trends">{p.trends.map((t) => <TrendCard key={t.id} t={t} />)}</div>
        </>
      )}
      <p className="sv-soft pg-foot">MMS's best judgement from fixed checks built into MMS. Confirm before acting.</p>
    </div>
  );
}

function FindingBody({ f, tabLabel, onOpenTab }: { f: Finding; tabLabel: (id: string) => string; onOpenTab: (id: string) => void }) {
  return (
    <div className="pg-body">
      <p>{f.why}</p>
      <p><b>What to do:</b> {f.fix}</p>
      {f.ifLeft && <p><b>If left:</b> {f.ifLeft}</p>}
      {f.evidence.length > 0 && <ul className="pg-evidence">{f.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <div className="pg-links">
        {f.tab && <button type="button" className="ri-link pg-open" onClick={() => onOpenTab(f.tab!)}>Open {tabLabel(f.tab)} →</button>}
        {f.plan && <button type="button" className="ri-link pg-open" onClick={() => onOpenTab("fixplan")}>Fix plan: {FIX_TEXT[f.plan.type].label} →</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- items 41 to 45: Fix plan

const FIX_TONE: Record<FixType, string> = { code: "bad", structure: "bad", data: "warn", setup: "info", none: "muted" };

function FixPlanTab({ p, input, fileName, tabLabel, onOpenTab }: {
  p: Prognosis; input: PrognosisInput; fileName: string; tabLabel: (id: string) => string; onOpenTab: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const planned = p.findings.filter((f) => f.plan);
  const byType = (t: FixType) => planned.filter((f) => f.plan!.type === t);
  const releases = planned.filter((f) => f.plan!.release).length;

  async function copyBrief(f: Finding) {
    const text = developerBrief(f, f.plan!, input, fileName);
    try { await navigator.clipboard.writeText(text); setMsg("Developer brief copied. Paste it into the ticket, e-mail or Claude Code."); }
    catch { saveBrief(f); }
  }
  function saveBrief(f: Finding) {
    const who = (input.manifest.user?.name ?? "user").replace(/[^A-Za-z0-9]+/g, "-");
    const name = `MMS-Dev-Brief-${f.rule}-${who}-${fileStamp()}.txt`;
    saveFile(name, developerBrief(f, f.plan!, input, fileName), "text/plain");
    diag.step(`Saved developer brief ${name}`);
    setMsg(`Saved ${name} in your Downloads folder.`);
  }

  return (
    <div className="sv-tab">
      <div className="sv-tab-head">
        <div><div className="sv-title">Fix plan</div>
          <div className="sv-soft">For each finding: what to do today without a new MMS version, and what kind of permanent fix it needs. MMS cannot see its own code here, so a code change is its best judgement from the errors; the developer brief gives the evidence to confirm it.</div></div>
      </div>
      <div className="sv-facts fp-facts">
        {FIX_ORDER.map((t) => {
          const n = byType(t).length;
          return <Fact key={t} label={FIX_TEXT[t].label} value={n} tone={n && (t === "code" || t === "structure") ? "bad" : n && t === "data" ? "warn" : undefined} sub={FIX_TEXT[t].who} />;
        })}
      </div>
      <p className="sv-soft">{planned.length === 0 ? "Nothing to fix in this bundle." : releases ? `${plural(releases, "issue")} need${releases === 1 ? "s" : ""} a new MMS version. Everything else can be fixed on the laptop or in the data.` : "No new MMS version is needed: everything can be fixed on the laptop, in the data or by guiding the user."}</p>
      {msg && <div className="toast ok sv-toast">{msg}</div>}

      {FIX_ORDER.map((t) => {
        const fs = byType(t);
        if (!fs.length) return null;
        return (
          <div key={t} className="fp-group">
            <div className="fp-group-head"><span className={`sv-chip is-${FIX_TONE[t]}`}>{FIX_TEXT[t].label}</span><span className="sv-soft">{FIX_TEXT[t].blurb}</span></div>
            <ul className="sv-events sv-groups">
              {fs.map((f, i) => {
                const key = `${t}-${f.rule}-${i}`;
                const pl = f.plan!;
                return (
                  <Group key={key} open={open === key} onToggle={() => setOpen(open === key ? null : key)} dot={LEVEL_DOT[f.level]}
                    title={f.title} sub={`${pl.who} · new MMS version: ${pl.release ? "yes" : "no"}${pl.confidence === "possible" ? " · confirm first" : ""}`}
                    side={<span className={`sv-chip is-${LEVEL_CHIP[f.level]}`}>{LEVEL_TEXT[f.level]}</span>}>
                    <div className="pg-body">
                      <div className="fp-step is-now"><span className="sv-label">Do this now</span><p>{pl.now}</p></div>
                      <div className="fp-step"><span className="sv-label">Permanent fix</span><p>{pl.permanent}</p></div>
                      {pl.alsoCheck && <p className="sv-soft">May also need: <b>{FIX_TEXT[pl.alsoCheck].label.toLowerCase()}</b>, once the cause is confirmed.</p>}
                      {f.evidence.length > 0 && <ul className="pg-evidence">{f.evidence.map((e, j) => <li key={j}>{e}</li>)}</ul>}
                      <div className="pg-links">
                        {needsBrief(pl) && <>
                          <button type="button" className="pg-save" onClick={() => copyBrief(f)}>Copy developer brief</button>
                          <button type="button" className="ri-link pg-open" onClick={() => saveBrief(f)}>Save brief as text</button>
                        </>}
                        {f.tab && <button type="button" className="ri-link pg-open" onClick={() => onOpenTab(f.tab!)}>Open {tabLabel(f.tab)} →</button>}
                      </div>
                    </div>
                  </Group>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function TrendCard({ t }: { t: Trend }) {
  const max = Math.max(1, ...t.days.map((d) => d.value));
  return (
    <div className={`pg-trend is-${t.tone}`}>
      <div className="pg-trend-head"><b>{t.title}</b><span className="sv-soft">{t.days.length} day{t.days.length === 1 ? "" : "s"}</span></div>
      <div className="pg-bars" role="img" aria-label={`${t.title}: ${t.days.map((d) => `${d.day} ${d.value} ${t.unit}`).join(", ")}`}>
        {t.days.slice(-14).map((d) => (
          <span key={d.day} title={`${d.day}: ${d.value} ${t.unit}`}><i style={{ height: `${Math.max(4, Math.round((d.value / max) * 100))}%` }} /></span>
        ))}
      </div>
      <div className="pg-bar-days"><span>{t.days[0]?.day.slice(5)}</span><span>{t.days[t.days.length - 1]?.day.slice(5)}</span></div>
      <p className="sv-soft">{t.text}</p>
    </div>
  );
}

const SV_CSS = `
.sv { font-family: var(--sans); color: var(--text); display: grid; gap: 16px; max-width: 1760px; container-type: inline-size; }
.sv > * { max-width: 920px; min-width: 0; }
.sv-cols { display: grid; gap: 16px; align-items: start; }
.sv-side, .sv-main { display: grid; gap: 16px; align-content: start; min-width: 0; }
@container (min-width: 1240px) {
  .sv > .sv-cols, .sv > .sv-top, .sv > .toast { max-width: none; }
  .sv-cols { grid-template-columns: minmax(440px, 5fr) minmax(0, 7fr); }
  .sv-side .pg-trends { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
}
.sv b { font-weight: 600; }
.sv-top { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-end; justify-content: space-between; }
.sv-top-text { min-width: 0; flex: 1 1 360px; }
.sv-top h2 { margin: 0 0 4px; }
.sv-top p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-soft); }
.sv-top-actions { display: flex; gap: 8px; }
.sv-toast { margin: 0; }
.sv-panel { padding: 20px 22px; display: grid; gap: 14px; }
.sv-soft { font-size: 12.5px; line-height: 1.45; color: var(--text-soft); margin: 0; }
.sv-title { font-size: 16px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.sv-label { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-soft); }
.sv-tile { width: 40px; height: 40px; flex: none; border-radius: 12px; display: grid; place-items: center;
  color: var(--accent-blue); background: color-mix(in srgb, var(--accent-blue) 13%, transparent); }
.sv-tile.is-soft { color: var(--text-soft); background: color-mix(in srgb, var(--text) 6%, transparent); }
.sv-tile svg { width: 22px; height: 22px; }
.sv-empty { justify-items: center; text-align: center; padding: 44px 24px; gap: 10px; }
.sv-empty .sv-soft { max-width: 420px; }
.sv-empty button { margin-top: 6px; }
.sv-head { display: flex; gap: 14px; align-items: center; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
.sv-head-text { flex: 1; min-width: 0; display: grid; gap: 2px; }
.sv-prog { display: flex; gap: 14px; align-items: center; padding: 14px 22px; }
.sv-chip { display: inline-flex; align-items: center; gap: 5px; flex: none; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
.sv-chip svg { width: 13px; height: 13px; }
.sv-chip.is-ok { color: var(--success); background: color-mix(in srgb, var(--success) 12%, transparent); }
.sv-chip.is-warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 14%, transparent); }
.sv-chip.is-bad { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }
.sv-chip.is-muted { color: var(--text-soft); background: color-mix(in srgb, var(--text) 7%, transparent); }
.sv-note { font-size: 14px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: -6px;
  padding: 10px 14px; border-left: 3px solid var(--accent-blue); border-radius: 0 var(--radius, 10px) var(--radius, 10px) 0;
  background: color-mix(in srgb, var(--accent-blue) 7%, transparent); }
.sv-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
.sv-fact { display: grid; gap: 3px; align-content: start; min-width: 0; padding: 12px 14px; border-radius: var(--radius, 10px);
  border: 1px solid var(--border); background: color-mix(in srgb, var(--text) 2.5%, transparent); }
.sv-fact b { font-size: 14px; line-height: 1.35; overflow-wrap: anywhere; }
.sv-fact.is-ok b { color: var(--success); }
.sv-fact.is-warn b { color: var(--warn); }
.sv-fact.is-bad b { color: var(--danger); }
.sv-tabs { display: flex; flex-wrap: wrap; gap: 4px; width: fit-content; max-width: 100%; padding: var(--seg-track-pad, 4px); background: var(--tab-track); border-radius: var(--seg-track-radius, 12px); }
.sv-tabs button { display: inline-flex; align-items: center; gap: 7px; font-family: var(--sans); }
.sv-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; display: inline-grid; place-items: center; font-size: 11px; font-weight: 700; color: #fff; }
.sv-badge.is-bad { background: var(--danger); }
.sv-badge.is-warn { background: var(--warn); }
.sv-tab { display: grid; gap: 14px; }
.sv-tab-head { display: flex; gap: 12px; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; }
.sv-empty-line { padding: 18px 0; text-align: center; }
.sv-rows { margin: 0; display: grid; }
.sv-rows > div { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 14px; padding: 8px 2px; border-bottom: 1px solid var(--border); font-size: 14px; }
.sv-rows > div:last-child { border-bottom: 0; }
.sv-rows dt { font-size: 12.5px; color: var(--text-soft); }
.sv-rows dd { margin: 0; overflow-wrap: anywhere; }
.sv .sv-link { justify-self: start; padding: 6px 2px !important; border: 0 !important; box-shadow: none !important; background: transparent !important; font-size: 13px; font-weight: 600; color: var(--accent-blue) !important; }
.sv-tablegrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0 18px; }
.sv-tablegrid > span { display: flex; justify-content: space-between; gap: 10px; padding: 6px 2px; border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--text-soft); }
.sv-tablegrid b { color: var(--text); font-variant-numeric: tabular-nums; }
.sv-events { list-style: none; margin: 0; padding: 0; }
.sv-events li { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 2px; border-bottom: 1px solid var(--border); }
.sv-events li:last-child { border-bottom: 0; }
.sv-events li > i { width: 10px; height: 10px; border-radius: 50%; background: var(--text-soft); }
.sv-events li.is-ok > i { background: var(--success); }
.sv-events li.is-warn > i { background: var(--warn); }
.sv-events li.is-bad > i { background: var(--danger); }
.sv-events li.is-info > i { background: var(--accent-blue); }
.sv-events li.is-muted > i { background: color-mix(in srgb, var(--text) 25%, transparent); }
.sv-ev-main { display: grid; gap: 2px; min-width: 0; font-size: 14px; }
.sv-ev-main b { font-weight: 600; }
.sv-ev-side { display: grid; justify-items: end; gap: 1px; font-size: 12.5px; color: var(--text-soft); font-variant-numeric: tabular-nums; }
.sv-ev-side small { font-size: 11px; }
.sv-list { list-style: none; margin: 0; padding: 0; }
.sv-list li { display: grid; grid-template-columns: 22px minmax(0, 1fr) minmax(60px, 120px) 64px; gap: 12px; align-items: center;
  padding: 9px 2px; border-bottom: 1px solid var(--border); font-size: 14px; }
.sv-list li:last-child { border-bottom: 0; }
.sv-list-ico { display: grid; place-items: center; color: var(--text-soft); }
.sv-list-ico svg { width: 17px; height: 17px; }
.sv-list-name { min-width: 0; overflow-wrap: anywhere; }
.sv-bar { height: 6px; border-radius: 999px; background: color-mix(in srgb, var(--text) 8%, transparent); overflow: hidden; }
.sv-bar i { display: block; height: 100%; border-radius: 999px; background: color-mix(in srgb, var(--accent-blue) 70%, transparent); }
.sv-size { font-size: 12.5px; color: var(--text-soft); text-align: right; font-variant-numeric: tabular-nums; }
.sv-filters { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-end; }
.sv-field { display: grid; gap: 4px; min-width: 0; }
.sv-field select { font-family: var(--sans); font-size: 13px; max-width: 100%; }
.sv-check { font-size: 13px; padding-bottom: 8px; }
.sv-groups li { display: block; padding: 0; }
.sv-group-btn { box-sizing: border-box; width: 100%; cursor: pointer; user-select: none; display: grid; grid-template-columns: 12px minmax(0, 1fr) auto 16px; gap: 12px; align-items: center; padding: 10px 2px; font-family: var(--sans); }
.sv-group-btn:hover .sv-ev-main b { color: var(--accent-blue); }
.sv-group-btn:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 2px; border-radius: 6px; }
.sv-group-btn > i { width: 10px; height: 10px; border-radius: 50%; background: var(--text-soft); }
.sv-groups li.is-ok .sv-group-btn > i { background: var(--success); }
.sv-groups li.is-warn .sv-group-btn > i { background: var(--warn); }
.sv-groups li.is-bad .sv-group-btn > i { background: var(--danger); }
.sv-groups li.is-info .sv-group-btn > i { background: var(--accent-blue); }
.sv-groups li.is-muted .sv-group-btn > i { background: color-mix(in srgb, var(--text) 25%, transparent); }
.sv-groups .sv-ev-main b { overflow-wrap: anywhere; }
.sv-chev { width: 16px; height: 16px; color: var(--text-soft); transition: transform .15s; }
.sv-groups li.is-open .sv-chev { transform: rotate(90deg); }
.sv-group-body { display: grid; gap: 8px; padding: 2px 2px 14px 24px; }
.sv-steps { margin: 0; padding: 0 0 0 18px; font-size: 13px; }
.sv-steps li { padding: 3px 0; }
.sv-steps li span { display: inline-block; min-width: 70px; color: var(--text-soft); font-variant-numeric: tabular-nums; font-size: 12.5px; }
.sv-steps li small { margin-left: 8px; color: var(--text-soft); font-size: 11.5px; }
.sv-steps li.is-bad { color: var(--danger); font-weight: 600; }
.sv-replay { list-style: none; margin: 0; padding: 0; max-height: 560px; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius, 10px); }
.sv-replay li { display: grid; grid-template-columns: 70px minmax(0, 1fr) auto; gap: 12px; align-items: baseline; padding: 6px 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
.sv-replay li:last-child { border-bottom: 0; }
.sv-replay-t { font-size: 12.5px; color: var(--text-soft); font-variant-numeric: tabular-nums; }
.sv-replay-x { overflow-wrap: anywhere; }
.sv-replay li small { font-size: 11.5px; color: var(--text-soft); text-align: right; }
.sv-replay li.is-screen { background: color-mix(in srgb, var(--accent-blue) 6%, transparent); font-weight: 600; }
.sv-replay li.is-call { color: var(--text-soft); font-size: 12.5px; }
.sv-replay li.is-bad { color: var(--danger); background: color-mix(in srgb, var(--danger) 7%, transparent); font-weight: 600; }
.sv-bar-sm { display: block; width: 110px; }
.sv-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.sv-table th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-soft); padding: 6px 8px; border-bottom: 1px solid var(--border); }
.sv-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; overflow-wrap: anywhere; }
.sv-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sv-table tr.is-bad td { color: var(--danger); }
.sv-table small { color: var(--text-soft); }
.pg { gap: 12px; }
.pg-head { display: flex; gap: 14px; align-items: center; }
.sv button.pg-save { margin-left: auto; flex-shrink: 0; display: inline-flex !important; align-items: center; gap: 7px; min-height: 34px; padding: 6px 14px !important; font-size: 12.5px !important; font-weight: 600 !important; color: var(--accent, var(--primary)) !important; background: var(--surface, var(--panel, transparent)) !important; border: 1px solid color-mix(in srgb, var(--accent, var(--primary)) 45%, var(--border)) !important; border-radius: var(--radius-sm, 8px) !important; box-shadow: none !important; cursor: pointer; white-space: nowrap; }
.sv button.pg-save:hover { background: color-mix(in srgb, var(--accent, var(--primary)) 10%, transparent) !important; border-color: var(--accent, var(--primary)) !important; }
.sv button.pg-save:focus-visible { outline: 2px solid var(--accent, var(--primary)); outline-offset: 2px; }
.pg-tile { color: var(--success); background: color-mix(in srgb, var(--success) 13%, transparent); }
.pg.is-attention .pg-tile { color: var(--warn); background: color-mix(in srgb, var(--warn) 14%, transparent); }
.pg.is-action .pg-tile { color: var(--danger); background: color-mix(in srgb, var(--danger) 13%, transparent); }
.pg-overall { font-size: 16px; font-weight: 700; line-height: 1.3; color: var(--success); }
.pg.is-attention .pg-overall { color: var(--warn); }
.pg.is-action .pg-overall { color: var(--danger); }
.pg.is-action { box-shadow: inset 3px 0 0 var(--danger), var(--shadow-card, none); }
.pg.is-attention { box-shadow: inset 3px 0 0 var(--warn), var(--shadow-card, none); }
.pg-body { display: grid; gap: 6px; font-size: 13.5px; line-height: 1.5; }
.pg-body p { margin: 0; }
.pg-evidence { margin: 2px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--text-soft); display: grid; gap: 2px; overflow-wrap: anywhere; }
.sv button.ri-link.pg-open { padding-left: 0 !important; }
.pg-sub { margin-top: 4px; }
.pg-links { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; }
.sv .pg-links button.pg-save { margin-left: 0; }
.fp-facts { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
.fp-group { display: grid; gap: 6px; }
.fp-group-head { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding-top: 6px; }
.fp-step { display: grid; gap: 2px; }
.fp-step.is-now { padding: 8px 12px; border-left: 3px solid var(--accent-blue); border-radius: 0 var(--radius, 10px) var(--radius, 10px) 0; background: color-mix(in srgb, var(--accent-blue) 7%, transparent); }
.pg-trends { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.pg-trend { display: grid; gap: 6px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius, 10px); background: color-mix(in srgb, var(--text) 2.5%, transparent); --pg-c: var(--success); }
.pg-trend.is-warn { --pg-c: var(--warn); }
.pg-trend.is-bad { --pg-c: var(--danger); }
.pg-trend.is-muted { --pg-c: var(--text-soft); }
.pg-trend-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; font-size: 13.5px; }
.pg-bars { display: flex; gap: 3px; align-items: flex-end; height: 38px; }
.pg-bars span { flex: 1; height: 100%; display: flex; align-items: flex-end; }
.pg-bars i { display: block; width: 100%; border-radius: 3px 3px 0 0; background: color-mix(in srgb, var(--pg-c) 75%, transparent); }
.pg-bar-days { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-soft); font-variant-numeric: tabular-nums; }
.pg-foot { font-size: 12px; }
.sv-chip.is-info { color: var(--accent-blue); background: color-mix(in srgb, var(--accent-blue) 12%, transparent); }
@media (max-width: 640px) { .sv-list li { grid-template-columns: 22px minmax(0, 1fr) 64px; } .sv-bar { display: none; } .sv-rows > div { grid-template-columns: minmax(0, 1fr); gap: 2px; } }
`;

// ------------------------------------------------------------------ Option B: drop platform (display only)
function DropPlatform({ active }: { active: boolean }) {
  return (
    <svg width="180" height="120" viewBox="0 0 180 120" aria-hidden="true" style={{ overflow: "visible" }}>
      <ellipse cx="90" cy="108" rx="78" ry="10" fill="var(--tig-shadow)" />
      <polygon points="14,74 90,108 90,116 14,82" className="tig-slab-l" />
      <polygon points="90,108 166,74 166,82 90,116" className="tig-slab-r" />
      <polygon points="90,40 166,74 90,108 14,74" fill={active ? "var(--tig-blue-soft)" : "var(--tig-top)"} stroke="var(--tig-blue)" strokeWidth={1.6} strokeDasharray={active ? "0" : "6 5"} />
      <g className="tig-lift" style={{ transform: active ? "translateY(14px)" : undefined, transition: "transform .4s cubic-bezier(.34,1.56,.64,1)" }}>
        <polygon points="70,28 90,38 90,58 70,48" className="tig-slab-l" />
        <polygon points="90,38 110,28 110,48 90,58" className="tig-slab-r" />
        <polygon points="90,18 110,28 90,38 70,28" fill="var(--tig-look-soft)" stroke="var(--tig-look)" strokeWidth={1.2} />
      </g>
    </svg>
  );
}
