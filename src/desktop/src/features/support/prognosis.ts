// Prognosis for a support bundle (checklist items 29 to 34; fix plan 41 to 45 in fixplan.ts). Pure functions, no React.
//
// Runs offline, inside MMS, with fixed rules: no outside service and no AI. Each rule looks at
// one thing in the bundle and, when it finds something, returns a finding with how serious it
// is, the likely cause, what to do and the evidence. The overall rating is the worst finding.
// New rules (MR-II, MR-III, SharePoint sync) are added as new entries in RULES.

import { errorGroups, percentile, rejections, type Ev, type LogData } from "./bundleAnalysis";
import type { BundleManifest } from "../../lib/support/bundleFormat";
import { FIX_ORDER, FIX_TEXT, fixPlanFor, type FixPlan } from "./fixplan";

export type Level = "action" | "attention" | "info";
export type Cause = "bug" | "data" | "user" | "setup" | "laptop";
export type Overall = "healthy" | "attention" | "action";
/** Tabs a finding can point to (same ids as the Support viewer's tabs). */
export type TabLink = "environment" | "errors" | "replay" | "calls" | "rejected" | "records" | "crashes" | "checks" | "contents";

export interface Finding {
  rule: string;
  level: Level;
  cause: Cause;
  title: string;
  /** What MMS saw, in one or two plain sentences. */
  why: string;
  /** What to do about it. */
  fix: string;
  /** What happens if it is left (optional). */
  ifLeft?: string;
  /** Up to five short lines of evidence. */
  evidence: string[];
  tab?: TabLink;
  /** The log lines behind the finding, for the developer brief. */
  events?: Ev[];
  /** Do this now / permanent fix / fix type (filled in by runPrognosis from fixplan.ts). */
  plan?: FixPlan;
}

export interface CheckResult { key: string; name: string; status: "ok" | "warn" | "error" | "skip"; count: number; detail: string; examples: number[] }
export interface SessionResult { ended: "clean" | "unclean" | "open" | "unknown"; started: { at?: string; version?: string; build?: string }; crashNote?: string | null }
export interface SystemFacts {
  version?: string; build?: string; database_bytes?: number; schema_migrations?: number; last_migration?: string | null;
  trial?: { enabled?: boolean; days_left?: number | null; expired?: boolean; clock_back?: boolean } | null;
}

export interface PrognosisInput {
  manifest: BundleManifest;
  missingParts: string[];
  system?: SystemFacts;
  /** MMS version on the laptop reading the bundle. */
  thisVersion?: string;
  /** Database upgrades applied on the laptop reading the bundle (to tell "upgrade did not run" from "upgrade missing"). */
  thisMigrations?: number;
  sessions?: SessionResult[];
  checks?: CheckResult[];
  logs?: LogData;
}

export const CAUSE_TEXT: Record<Cause, string> = {
  bug: "MMS bug",
  data: "Data problem",
  user: "User action / training",
  setup: "Set-up or permission",
  laptop: "Laptop",
};
export const LEVEL_TEXT: Record<Level, string> = { action: "Action required", attention: "Needs attention", info: "Good to know" };
export const OVERALL_TEXT: Record<Overall, string> = { healthy: "Healthy", attention: "Needs attention", action: "Action required" };

// ---------------------------------------------------------------- helpers

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function compareVersions(a: string, b: string) {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return Math.sign(d); }
  return 0;
}
const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`);
const fmtMb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
/** Ev.t is the user's clock read as UTC: day key "2026-11-19". */
export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const time = (t: number) => new Date(t).toISOString().slice(11, 16);
/** Calls that change data (saves), by their command name. */
export const isWrite = (cmd: string) => /^(set|save|create|update|add|remove|delete|submit|endorse|close|approve|reject|record|verify|import|purge|reset|assign|confirm|acknowledge|send|reclassify|carry)_/.test(cmd);
const SCHEMA = /no such (table|column)|has no column named/i;
const callsOf = (logs?: LogData) => (logs ? logs.events.filter((e) => e.line.kind === "CALL" && e.line.call) : []);
/** UTC "YYYY-MM-DD HH:MM:SS UTC" to the user's clock (same scale as Ev.t), using the log offset if known. */
function createdAtUserClock(m: BundleManifest, logs?: LogData): number | null {
  const x = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(m.created_at);
  if (!x) return null;
  const utc = Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5], +x[6]);
  if (logs?.offsetKnown) return utc + logs.offset;
  // No screen record: the last log line is at most a few seconds before the bundle, so use it.
  const last = logs?.events[logs.events.length - 1]?.t;
  if (last == null) return utc;
  return utc + Math.round((last - utc) / 900000) * 900000;
}

// ---------------------------------------------------------------- rules

type Rule = { id: string; run: (i: PrognosisInput) => Finding | Finding[] | null };

export const RULES: Rule[] = [
  // --- the bundle itself
  {
    id: "bundle-damaged",
    run: (i) => i.missingParts.length ? {
      rule: "bundle-damaged", level: "attention", cause: "laptop", title: "The bundle file is incomplete",
      why: `${plural(i.missingParts.length, "part")} listed in the bundle ${i.missingParts.length === 1 ? "is" : "are"} missing from the file.`,
      fix: "Ask the user to make a new bundle with Help → Send to IT and send it again without opening or renaming it.",
      evidence: i.missingParts.slice(0, 5), tab: "contents",
    } : null,
  },
  {
    id: "no-logs",
    run: (i) => !i.logs || i.logs.events.length === 0 ? {
      rule: "no-logs", level: "info", cause: "setup", title: "No app log in the bundle",
      why: "Without the log, errors, steps and timings cannot be checked, so this prognosis only covers the laptop details and data checks.",
      fix: "If the problem is still happening, ask for a new bundle right after it happens.",
      evidence: [], tab: "contents",
    } : null,
  },

  // --- MMS bugs
  {
    id: "crash-panic",
    run: (i) => {
      const p = i.logs?.events.filter((e) => e.line.level === "PANIC") ?? [];
      return p.length ? {
        rule: "crash-panic", level: "action", cause: "bug", title: "MMS stopped because of an internal error",
        why: `MMS's engine stopped ${plural(p.length, "time")} with an internal error (a "panic"). This is a fault in MMS, not something the user did.`,
        fix: "Send the error text below to the developer with this bundle. Check Action replay for what the user did just before.",
        ifLeft: "It will happen again whenever the same steps are repeated, and unsaved work is lost each time.",
        evidence: p.slice(-3).map((e) => `${dayOf(e.t)} ${time(e.t)} · ${e.line.text.slice(0, 160)}`), tab: "errors", events: p.slice(-3),
      } : null;
    },
  },
  {
    id: "render-loop",
    run: (i) => {
      const g = i.logs ? errorGroups(i.logs).filter((x) => /Maximum update depth|Too many re-renders/i.test(x.message)) : [];
      if (!g.length) return null;
      const n = g.reduce((s, x) => s + x.count, 0);
      return {
        rule: "render-loop", level: "attention", cause: "bug", title: "A screen kept redrawing itself",
        why: `React stopped a screen that was stuck redrawing (${plural(n, "time")}, on ${[...new Set(g.flatMap((x) => x.screens))].join(", ")}). It can make the screen slow or lose what was just typed.`,
        fix: "Check whether the laptop runs the MMS version with the MR-I report fix (19 Nov 2026). If it does, send the steps from Action replay to the developer.",
        evidence: g.map((x) => `${x.count}× on ${x.screens.join(", ")}, last ${dayOf(x.last)} ${time(x.last)}`), tab: "errors",
        events: g.flatMap((x) => x.items).sort((a, b) => a.t - b.t).slice(-3),
      };
    },
  },
  {
    id: "schema-mismatch",
    run: (i) => {
      const r = i.logs ? rejections(i.logs).filter((x) => SCHEMA.test(x.message)) : [];
      if (!r.length) return null;
      return {
        rule: "schema-mismatch", level: "action", cause: "setup", title: "The database does not match this MMS version",
        why: "MMS asked the database for a table or column that is not there. This usually means a database upgrade did not finish, or the database came from a different MMS version.",
        fix: "Compare 'Database upgrades' in the Environment tab with a working laptop. Restart MMS so the upgrade runs again; if it persists, restore from a backup taken on this version.",
        ifLeft: "Every action that needs the missing table or column will keep failing.",
        evidence: r.slice(0, 4).map((x) => `${x.cmd}: ${x.message} (${x.count}×)`), tab: "rejected",
        events: r.map((x) => x.items[x.items.length - 1]),
      };
    },
  },
  {
    id: "possible-bug",
    run: (i) => {
      const r = i.logs ? rejections(i.logs).filter((x) => x.kind === "bug" && !SCHEMA.test(x.message)) : [];
      if (!r.length) return null;
      const n = r.reduce((s, x) => s + x.count, 0);
      return {
        rule: "possible-bug", level: n >= 3 ? "action" : "attention", cause: "bug", title: "Actions failed for a technical reason",
        why: `${plural(n, "action")} failed with a technical message rather than a business rule (${plural(r.length, "different message")}).`,
        fix: "Open Rejected actions, read the steps before each failure and reproduce them on a test laptop.",
        evidence: r.slice(0, 4).map((x) => `${x.cmd}: ${x.message.slice(0, 120)} (${x.count}×)`), tab: "rejected",
        events: r.map((x) => x.items[x.items.length - 1]),
      };
    },
  },
  {
    id: "repeated-errors",
    run: (i) => {
      const g = i.logs ? errorGroups(i.logs).filter((x) => !x.source.startsWith("Command ") && !/Maximum update depth|Too many re-renders/i.test(x.message) && !/\[vite\]/.test(x.message)) : [];
      const rep = g.filter((x) => x.count >= 3);
      if (!rep.length) return null;
      const worst = rep.reduce((a, b) => (b.count > a.count ? b : a));
      return {
        rule: "repeated-errors", level: worst.count >= 10 ? "action" : "attention", cause: "bug", title: "The same error keeps coming back",
        why: `${plural(rep.length, "error")} happened three times or more; the most frequent ${worst.count} times.`,
        fix: "Open the Error inbox, start with the most frequent error and look at the steps before it.",
        ifLeft: "Users will keep meeting it on the same screens.",
        evidence: rep.slice(0, 4).map((x) => `${x.count}× · ${x.message.slice(0, 110)} (${x.screens.join(", ")})`), tab: "errors",
        events: rep.map((x) => x.items[x.items.length - 1]),
      };
    },
  },
  {
    id: "errors-near-bundle",
    run: (i) => {
      const at = createdAtUserClock(i.manifest, i.logs);
      if (!i.logs || at == null) return null;
      const recent = i.logs.events.filter((e) => (e.line.level === "ERROR" || e.line.level === "PANIC" || (e.line.kind === "CALL" && e.line.call && !e.line.call.ok)) && e.t <= at + 60000 && e.t >= at - 15 * 60000);
      if (!recent.length) return null;
      const last = recent[recent.length - 1];
      return {
        rule: "errors-near-bundle", level: "attention", cause: "bug", title: "Errors or refusals just before the user sent this",
        why: `${plural(recent.length, "error or refused action", "errors or refused actions")} in the 15 minutes before the bundle was made. These are most likely what the user's note is about.`,
        fix: "Open Action replay at the end of the latest session to see exactly what the user did.",
        evidence: recent.slice(-4).map((e) => `${time(e.t)} · ${e.line.kind === "CALL" ? `${e.line.call!.cmd}: ${e.line.call!.error ?? "failed"}` : e.line.text.slice(0, 120)}`),
        tab: last.line.kind === "CALL" ? "rejected" : "errors", events: recent.slice(-4),
      };
    },
  },

  // --- crashes
  {
    id: "unclean-shutdowns",
    run: (i) => {
      const u = (i.sessions ?? []).filter((s) => s.ended === "unclean");
      if (!u.length) return null;
      const panicked = u.some((s) => /panick/i.test(s.crashNote ?? ""));
      return {
        rule: "unclean-shutdowns", level: u.length >= 3 ? "action" : "attention", cause: panicked ? "bug" : "laptop",
        title: u.length === 1 ? "MMS did not close properly once" : `MMS did not close properly ${u.length} times`,
        why: panicked ? "At least one ended with an internal MMS error." : "MMS was stopped without closing normally: a freeze, the laptop switched off, or MMS ended in Task Manager.",
        fix: panicked ? "Treat it as an MMS bug: send the crash note to the developer." : "Ask the user whether the laptop was switched off or MMS froze. If it froze, check Action replay for the last steps.",
        ifLeft: u.length >= 3 ? "Crashes are repeating; unsaved work is at risk each time." : undefined,
        evidence: u.slice(0, 4).map((s) => `Started ${s.started.at ?? "?"}${s.crashNote ? ` · ${s.crashNote.slice(0, 100)}` : ""}`), tab: "crashes",
      };
    },
  },

  // --- set-up
  {
    id: "old-version",
    run: (i) => {
      const v = i.system?.version ?? i.manifest.mms_version;
      if (!v || !i.thisVersion || compareVersions(v, i.thisVersion) >= 0) return null;
      return {
        rule: "old-version", level: "attention", cause: "setup", title: "The user has an older MMS",
        why: `The user's laptop runs MMS ${v}; yours runs ${i.thisVersion}. The problem may already be fixed.`,
        fix: `Update their laptop to MMS ${i.thisVersion}, then ask them to try again.`,
        evidence: [`User: ${v} (${i.system?.build ?? i.manifest.build ?? "?"})`, `This laptop: ${i.thisVersion}`], tab: "environment",
      };
    },
  },
  {
    id: "developer-run",
    run: (i) => (i.system?.build ?? i.manifest.build) === "Developer run" ? {
      rule: "developer-run", level: "info", cause: "setup", title: "Made from a developer run",
      why: "This bundle came from MMS started with 'tauri dev', not an installed copy. Timings are slower and closes are not recorded.",
      fix: "Nothing to do for a test. For a real user, make sure they run the installed MMS.",
      evidence: [], tab: "environment",
    } : null,
  },
  {
    id: "trial",
    run: (i) => {
      const t = i.system?.trial;
      if (!t?.enabled) return null;
      if (t.expired) return { rule: "trial", level: "action", cause: "setup", title: "The beta trial has ended", why: "MMS on this laptop has passed its trial period and will not open.", fix: "Install the current beta build on the laptop.", evidence: [], tab: "environment" };
      if (t.clock_back) return { rule: "trial", level: "attention", cause: "user", title: "The laptop clock was set back", why: "MMS noticed the date on the laptop went backwards. Dates on reports may be wrong.", fix: "Ask the user to set the laptop's date and time to automatic.", evidence: [], tab: "environment" };
      if (t.days_left != null && t.days_left <= 5) return {
        rule: "trial", level: "attention", cause: "setup", title: `The beta trial ends in ${plural(t.days_left, "day")}`,
        why: "After that MMS will not open on this laptop.", fix: "Plan the update to the next beta build before it runs out.",
        ifLeft: "The user will be locked out of MMS when the trial ends.", evidence: [], tab: "environment",
      };
      return null;
    },
  },
  {
    id: "permission-refusals",
    run: (i) => {
      const r = i.logs ? rejections(i.logs).filter((x) => x.kind === "permission") : [];
      if (!r.length) return null;
      const n = r.reduce((s, x) => s + x.count, 0);
      return {
        rule: "permission-refusals", level: "attention", cause: "setup", title: "The user was blocked by permissions",
        why: `MMS refused ${plural(n, "action")} because the user's role or settings do not allow it.`,
        fix: "If the user should be able to do this, check their role and permissions in Administration → Users. Otherwise explain that it needs another role.",
        evidence: r.slice(0, 4).map((x) => `${x.message.slice(0, 120)} (${x.count}×, ${x.users.join(", ") || "user unknown"})`), tab: "rejected",
      };
    },
  },
  {
    id: "checks-could-not-run",
    run: (i) => {
      const s = (i.checks ?? []).filter((c) => c.status === "skip");
      return s.length ? {
        rule: "checks-could-not-run", level: "attention", cause: "setup", title: "Some data checks could not run",
        why: `${plural(s.length, "check")} failed to run, which usually means the database is older than this MMS version.`,
        fix: "Compare 'Database upgrades' in the Environment tab with a working laptop.",
        evidence: s.slice(0, 4).map((c) => `${c.name}: ${c.detail.slice(0, 100)}`), tab: "checks",
      } : null;
    },
  },

  // --- data
  {
    id: "data-errors",
    run: (i) => {
      const e = (i.checks ?? []).filter((c) => c.status === "error");
      if (!e.length) return null;
      return {
        rule: "data-errors", level: "action", cause: "data", title: "The data breaks MMS rules",
        why: `${plural(e.length, "data check")} found records that should not exist, for example a counter below zero or a decision still pending on a closed report.`,
        fix: "Open each record in the Record inspector to see how it got there, then correct it on the user's laptop (Data Browser) or ask the developer for a fix.",
        ifLeft: "Dashboards, forecasts and approvals that use these records will show wrong results.",
        evidence: e.slice(0, 4).map((c) => `${c.name}: ${c.count}${c.examples?.length ? ` (e.g. #${c.examples.slice(0, 3).join(", #")})` : ""}`), tab: "checks",
      };
    },
  },
  {
    id: "data-warnings",
    run: (i) => {
      const w = (i.checks ?? []).filter((c) => c.status === "warn");
      if (!w.length) return null;
      return {
        rule: "data-warnings", level: "attention", cause: "data", title: "Leftover or unusual records",
        why: `${plural(w.length, "data check")} found records worth a look, such as results without a report or a Red unit without a reason.`,
        fix: "Review them in the Data checks tab. They rarely stop work but can confuse reports.",
        evidence: w.slice(0, 4).map((c) => `${c.name}: ${c.count}`), tab: "checks",
      };
    },
  },
  {
    id: "rule-refusals",
    run: (i) => {
      const r = i.logs ? rejections(i.logs).filter((x) => x.kind === "rule" && x.count >= 3) : [];
      if (!r.length) return null;
      return {
        rule: "rule-refusals", level: "attention", cause: "user", title: "The user keeps running into the same rule",
        why: "MMS refused the same action three times or more because a business rule was not met. MMS is working as intended; the user may not know the rule.",
        fix: "Explain the rule to the user (see the message), or check whether the MMS message could be clearer.",
        evidence: r.slice(0, 4).map((x) => `${x.message.slice(0, 120)} (${x.count}×)`), tab: "rejected",
      };
    },
  },
  {
    id: "database-size",
    run: (i) => {
      const b = Number(i.system?.database_bytes ?? 0);
      return b >= 500 * 1048576 ? {
        rule: "database-size", level: "attention", cause: "data", title: "The database is large",
        why: `The database is ${fmtMb(b)}. Large databases make start-up, backups and saving slower.`,
        fix: "Check the biggest tables in Environment → records per table; consider purging old test data or photos.",
        evidence: [], tab: "environment",
      } : null;
    },
  },

  // --- laptop and speed
  {
    id: "slow-saves",
    run: (i) => {
      const w = callsOf(i.logs).filter((e) => isWrite(e.line.call!.cmd) && e.line.call!.ok);
      const slow = w.filter((e) => e.line.call!.ms >= 2000);
      if (!slow.length) return null;
      const max = Math.max(...slow.map((e) => e.line.call!.ms));
      return {
        rule: "slow-saves", level: max >= 5000 ? "action" : "attention", cause: "laptop", title: "Saving is slow",
        why: `${plural(slow.length, "save")} took 2 seconds or more (slowest ${fmtMs(max)}). Saves should take well under a second.`,
        fix: "Check the laptop: free disk space, antivirus scanning the MMS data folder, and whether it is on battery saver. Compare with the database size.",
        ifLeft: "Users may press Save twice or leave a screen before the save finishes.",
        evidence: slow.slice(-4).map((e) => `${e.line.call!.cmd} · ${fmtMs(e.line.call!.ms)} · ${e.line.where}`), tab: "calls",
      };
    },
  },
  {
    id: "slow-reads",
    run: (i) => {
      const r = callsOf(i.logs).filter((e) => !isWrite(e.line.call!.cmd));
      if (r.length < 20) return null;
      const p95 = percentile(r.map((e) => e.line.call!.ms), 95);
      if (p95 < 1000) return null;
      return {
        rule: "slow-reads", level: "attention", cause: "laptop", title: "Screens load slowly",
        why: `5% of data loads took ${fmtMs(p95)} or more. On a healthy laptop almost all finish in under half a second.`,
        fix: "Check the Call log sorted by 'Slowest on average' to see which screens; then check the laptop and the database size.",
        evidence: [], tab: "calls",
      };
    },
  },
  {
    id: "slow-startup",
    run: (i) => {
      const s = (i.logs?.events ?? []).filter((e) => e.line.kind === "PERF" && e.line.perf?.kind === "startup" && (e.line.perf.ms ?? 0) >= 10000);
      return s.length ? {
        rule: "slow-startup", level: "attention", cause: "laptop", title: "MMS takes long to start",
        why: `Start-up took 10 seconds or more ${plural(s.length, "time")} (slowest ${fmtMs(Math.max(...s.map((e) => e.line.perf!.ms ?? 0)))}).`,
        fix: "Check the laptop's speed and the database size; developer runs are always slower.",
        evidence: [], tab: "environment",
      } : null;
    },
  },
  {
    id: "slow-screens",
    run: (i) => {
      const p = (i.logs?.events ?? []).filter((e) => e.line.kind === "PERF" && e.line.perf?.kind === "screen_open");
      const by = new Map<string, number[]>();
      p.forEach((e) => { const k = e.line.perf!.screen ?? "?"; by.set(k, [...(by.get(k) ?? []), e.line.perf!.ms ?? 0]); });
      const slow = [...by.entries()].map(([k, v]) => [k, percentile(v, 50)] as const).filter(([, ms]) => ms >= 3000);
      return slow.length ? {
        rule: "slow-screens", level: "attention", cause: "laptop", title: "Some screens open slowly",
        why: `${plural(slow.length, "screen")} usually took 3 seconds or more to open with its data.`,
        fix: "Look at those screens in the Call log to find the slow request.",
        evidence: slow.map(([k, ms]) => `${k}: typically ${fmtMs(ms)}`), tab: "calls",
      } : null;
    },
  },
];

// ---------------------------------------------------------------- outlook (item 33)

export interface Trend {
  id: string;
  title: string;
  /** Per-day values, oldest first. */
  days: { day: string; value: number }[];
  /** Plain sentence about where it is heading. */
  text: string;
  tone: "ok" | "warn" | "bad" | "muted";
  unit: string;
}

/** Compares the later half of the days with the earlier half. */
function direction(values: number[]): number {
  if (values.length < 2) return 0;
  const h = Math.max(1, Math.floor(values.length / 2));
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  const a = avg(values.slice(0, h)), b = avg(values.slice(values.length - h));
  if (a === 0) return b > 0 ? 1 : 0;
  const ch = (b - a) / a;
  return ch > 0.3 ? 1 : ch < -0.3 ? -1 : 0;
}

export function outlook(i: PrognosisInput): Trend[] {
  const out: Trend[] = [];
  const ev = i.logs?.events ?? [];
  const days = [...new Set(ev.map((e) => dayOf(e.t)))].sort();
  if (days.length >= 2) {
    const per = (f: (e: Ev) => boolean) => days.map((d) => ({ day: d, value: ev.filter((e) => dayOf(e.t) === d && f(e)).length }));
    const errs = per((e) => e.line.level === "ERROR" || e.line.level === "PANIC");
    const dir = direction(errs.map((x) => x.value));
    const total = errs.reduce((s, x) => s + x.value, 0);
    out.push({
      id: "errors", title: "Errors per day", days: errs, unit: "errors",
      tone: total === 0 ? "ok" : dir > 0 ? "bad" : dir < 0 ? "ok" : "warn",
      text: total === 0 ? "No errors on any day." : dir > 0 ? "Rising: more errors in the later days. Likely to get worse if nothing changes." : dir < 0 ? "Falling: fewer errors in the later days." : "Steady: about the same each day.",
    });
    const saves = days.map((d) => {
      const w = ev.filter((e) => dayOf(e.t) === d && e.line.kind === "CALL" && e.line.call && e.line.call.ok && isWrite(e.line.call.cmd)).map((e) => e.line.call!.ms);
      return { day: d, value: w.length ? Math.round(percentile(w, 50)) : 0 };
    }).filter((x) => x.value > 0);
    if (saves.length >= 2) {
      const sd = direction(saves.map((x) => x.value));
      const last = saves[saves.length - 1].value;
      out.push({
        id: "saves", title: "Typical save time", days: saves, unit: "ms",
        tone: sd > 0 && last >= 500 ? "bad" : sd > 0 ? "warn" : "ok",
        text: sd > 0 ? `Getting slower (now about ${fmtMs(last)}). ${last >= 500 ? "Users will notice soon." : "Still fast enough for now."}` : `Steady at about ${fmtMs(last)}.`,
      });
    }
  }
  // Database size: from the start history (db_bytes at each start) or PERF db_size lines.
  const sizes = new Map<string, number>();
  ev.filter((e) => e.line.kind === "PERF" && e.line.perf?.kind === "db_size" && e.line.perf.bytes).forEach((e) => sizes.set(dayOf(e.t), e.line.perf!.bytes!));
  const sizeDays = [...sizes.entries()].sort().map(([day, value]) => ({ day, value }));
  if (sizeDays.length >= 2) {
    const first = sizeDays[0].value, last = sizeDays[sizeDays.length - 1].value;
    const growth = first ? (last - first) / first : 0;
    out.push({
      id: "db", title: "Database size", days: sizeDays.map((x) => ({ day: x.day, value: Math.round(x.value / 1048576 * 10) / 10 })), unit: "MB",
      tone: growth > 0.5 ? "warn" : "ok",
      text: growth > 0.5 ? `Grew ${Math.round(growth * 100)}% over these days (${fmtMb(first)} → ${fmtMb(last)}). At this rate start-up and backups will slow down.` : `Stable at about ${fmtMb(last)}.`,
    });
  }
  // Crashes: did not close properly, by day the session started.
  const s = i.sessions ?? [];
  if (s.length) {
    const byDay = new Map<string, number>();
    s.forEach((x) => { const d = (x.started.at ?? "").slice(0, 10); if (d) byDay.set(d, (byDay.get(d) ?? 0) + (x.ended === "unclean" ? 1 : 0)); });
    const cd = [...byDay.entries()].sort().map(([day, value]) => ({ day, value }));
    const total = cd.reduce((a, x) => a + x.value, 0);
    const recent = cd.slice(-3).reduce((a, x) => a + x.value, 0);
    out.push({
      id: "crashes", title: "Did not close properly", days: cd, unit: "times",
      tone: total === 0 ? "ok" : recent >= 2 ? "bad" : "warn",
      text: total === 0 ? "Every session closed normally." : recent >= 2 ? "Repeating in recent days. Expect more until the cause is found." : "Happened before but not repeating recently.",
    });
  }
  return out;
}

// ---------------------------------------------------------------- run

export interface Prognosis { overall: Overall; findings: Finding[]; trends: Trend[]; rulesChecked: number; counts: Record<Level, number> }

const LEVEL_ORDER: Record<Level, number> = { action: 0, attention: 1, info: 2 };

export function runPrognosis(input: PrognosisInput): Prognosis {
  const findings: Finding[] = [];
  for (const r of RULES) {
    try {
      const f = r.run(input);
      if (f) findings.push(...(Array.isArray(f) ? f : [f]));
    } catch {
      // A rule that fails must not hide the others.
    }
  }
  findings.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  for (const f of findings) {
    try { f.plan = fixPlanFor(f, input); } catch { /* the finding still shows without a plan */ }
  }
  const counts = { action: 0, attention: 0, info: 0 } as Record<Level, number>;
  findings.forEach((f) => { counts[f.level]++; });
  return {
    overall: counts.action ? "action" : counts.attention ? "attention" : "healthy",
    findings, trends: outlook(input), rulesChecked: RULES.length, counts,
  };
}

// ---------------------------------------------------------------- one-page report (item 34)

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A self-contained, printable HTML page (A4) with the prognosis, for the feedback item or the user. */
export function prognosisReportHtml(p: Prognosis, m: BundleManifest, fileName: string, madeBy: string, madeAt: string): string {
  const tone = (l: Level | Overall) => (l === "action" ? "#a32d2d" : l === "attention" ? "#a3591b" : l === "healthy" ? "#1f7a4d" : "#4b5967");
  const rows = p.findings.map((f) => `
    <div class="f">
      <div class="fh"><b>${esc(f.title)}</b><span style="color:${tone(f.level)}">${esc(LEVEL_TEXT[f.level])}</span></div>
      <div class="meta">Likely cause: ${esc(CAUSE_TEXT[f.cause])}</div>
      <p>${esc(f.why)}</p>
      <p><b>What to do:</b> ${esc(f.fix)}</p>
      ${f.ifLeft ? `<p><b>If left:</b> ${esc(f.ifLeft)}</p>` : ""}
      ${f.plan ? `<div class="plan"><b>Fix type: ${esc(FIX_TEXT[f.plan.type].label)}</b>${f.plan.alsoCheck ? ` (may also need ${esc(FIX_TEXT[f.plan.alsoCheck].label.toLowerCase())})` : ""} · ${esc(f.plan.who)} · new MMS release: ${f.plan.release ? "yes" : "no"}${f.plan.confidence === "possible" ? " · confirm first" : ""}
        <p><b>Do this now:</b> ${esc(f.plan.now)}</p><p><b>Permanent fix:</b> ${esc(f.plan.permanent)}</p></div>` : ""}
      ${f.evidence.length ? `<ul>${f.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
    </div>`).join("");
  const planRows = FIX_ORDER.map((t) => {
    const fs = p.findings.filter((f) => f.plan?.type === t);
    return fs.length ? `<tr><td><b>${esc(FIX_TEXT[t].label)}</b><br><span class="meta">${esc([...new Set(fs.map((f) => f.plan!.who))].join(", "))}</span></td><td>${fs.length}</td><td>${fs.some((f) => f.plan!.release) ? "Yes" : "No"}</td><td>${fs.map((f) => esc(f.title)).join("<br>")}</td></tr>` : "";
  }).join("");
  const trends = p.trends.map((t) => `<tr><td>${esc(t.title)}</td><td>${esc(t.days.map((d) => `${d.day.slice(5)}: ${d.value}`).join(" · "))}</td><td>${esc(t.text)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>MMS prognosis – ${esc(fileName)}</title>
<style>
@page { size: A4; margin: 16mm; }
body { font: 12px/1.45 "Segoe UI", Arial, sans-serif; color: #1a1d1f; max-width: 780px; margin: 0 auto; padding: 16px; }
h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #4b5967; margin: 18px 0 6px; }
.muted, .meta { color: #6b7280; font-size: 11px; }
.overall { display: inline-block; margin: 10px 0 4px; padding: 6px 12px; border-radius: 8px; font-weight: 700; color: #fff; background: ${tone(p.overall)}; }
.f { border: 1px solid #e0e2e5; border-radius: 8px; padding: 8px 12px; margin: 0 0 8px; page-break-inside: avoid; }
.fh { display: flex; justify-content: space-between; gap: 10px; } .f p { margin: 4px 0; } .f ul { margin: 4px 0 0 18px; padding: 0; color: #4b5967; }
.plan { margin-top: 6px; padding: 6px 10px; border-radius: 6px; background: #f3f5f8; } .plan p { margin: 3px 0; }
table { width: 100%; border-collapse: collapse; } td, th { text-align: left; vertical-align: top; padding: 5px 6px; border-bottom: 1px solid #e0e2e5; }
</style></head><body>
<h1>MMS support bundle prognosis</h1>
<div class="muted">${esc(fileName)} · sent by ${esc(m.user ? `${m.user.name} (${m.user.role})` : "unknown user")} · made ${esc(m.created_at)} · MMS ${esc(m.mms_version)} · ${esc(m.computer)}</div>
<div class="overall">${esc(OVERALL_TEXT[p.overall])}</div>
<div class="muted">${p.counts.action} action required · ${p.counts.attention} needs attention · ${p.counts.info} good to know · ${p.rulesChecked} checks run</div>
<h2>The user's note</h2><p>${esc(m.note || "No note was written.")}</p>
${planRows ? `<h2>Fix plan</h2><table><tr><th>Kind of fix</th><th>Issues</th><th>New MMS release</th><th>Which</th></tr>${planRows}</table>` : ""}
<h2>Findings</h2>${rows || "<p>Nothing needs attention.</p>"}
${trends ? `<h2>Outlook</h2><table><tr><th>What</th><th>Per day</th><th>Where it is heading</th></tr>${trends}</table>` : ""}
<p class="muted" style="margin-top:18px">Prepared by ${esc(madeBy)} on ${esc(madeAt)} with the MMS Support viewer. The prognosis is MMS's best judgement from fixed rules; confirm before acting.</p>
</body></html>`;
}
