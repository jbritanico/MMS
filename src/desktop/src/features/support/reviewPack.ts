// "Export for review" in the Support viewer: one Markdown file with everything needed to review
// an issue away from the bundle (with Claude, Claude Code or a developer): what the user saw,
// the environment, the prognosis and fix plan, every error with the exact call and the steps
// before it, likely-bug refusals, crashes, data checks, slow or failing calls and a short
// action replay. Pure function, no React.
//
// What is left out on purpose: the MR-I report and the full copy of data (business data), and
// anything that looks like a password, key or token in call arguments. Record ids are kept so
// the developer can look a record up in the Record inspector.

import type { BundleManifest } from "../../lib/support/bundleFormat";
import { callStats, calls, errorGroups, rejectKind, rejections, stepsBefore, type Ev, type LogData } from "./bundleAnalysis";
import { developerBrief, FIX_TEXT, needsBrief } from "./fixplan";
import { CAUSE_TEXT, LEVEL_TEXT, OVERALL_TEXT, type Prognosis, type PrognosisInput } from "./prognosis";

export interface ReviewPackMeta {
  fileName: string;
  bytes: number;
  missing: string[];
  names: string[];
  /** Who exported it, e.g. "Jess (Administrator)". */
  exportedBy: string;
  exportedAt: string;
  /** The full system.json of the bundle (environment). */
  system?: Record<string, unknown>;
}

const MAX_ERROR_GROUPS = 25;
const MAX_REJECTIONS = 20;
const MAX_REPLAY = 120;

/** Hides values of fields that look secret ("password": "…", key=…, Bearer …). */
export function redact(s: string): string {
  return s
    .replace(/("?(?:password|passcode|pin|secret|token|api_?key|private_?key|credential|db_?key|encryption_?key)"?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|[^,\s}]+)/gi, '$1"[hidden]"')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [hidden]");
}
const cut = (s: string | undefined | null, n: number) => {
  const t = redact(String(s ?? "")).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}… (${t.length} chars)` : t;
};
const code = (s: string) => "`" + s.replace(/`/g, "'") + "`";
const where = (e: Ev) => (e.line.where === "rust" ? "MMS engine (Rust)" : e.line.where);
const msgOf = (e: Ev) => (e.line.kind === "CALL" && e.line.call ? e.line.call.error ?? "failed" : e.line.text);

function evLine(e: Ev): string {
  const c = e.line.kind === "CALL" ? e.line.call : undefined;
  if (c) return `${e.line.time} · ${where(e)} · CALL ${c.cmd} ${c.ok ? "ok" : "FAILED"} (${c.ms} ms)${c.args ? ` · args ${cut(c.args, 240)}` : ""}${!c.ok && c.error ? ` · error: ${cut(c.error, 300)}` : ""}`;
  return `${e.line.time} · ${e.line.level} · ${where(e)} · ${e.line.kind === "TEXT" ? "" : e.line.kind + " "}${cut(e.line.text, 300)}`;
}

function table(head: string[], rows: (string | number)[][]): string[] {
  const esc = (v: string | number) => String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)];
}

export function reviewPackMarkdown(input: PrognosisInput, p: Prognosis, meta: ReviewPackMeta): string {
  const m: BundleManifest = input.manifest;
  const logs: LogData | undefined = input.logs;
  const sys = meta.system ?? {};
  const L: string[] = [];
  const h = (s: string) => { L.push("", `## ${s}`, ""); };

  L.push(`# MMS issue review pack`);
  L.push("");
  L.push(`Bundle ${code(meta.fileName)} from ${m.user ? `${m.user.name} (${m.user.role})` : "an unknown user"}, made ${m.created_at}. Exported ${meta.exportedAt} by ${meta.exportedBy} from the MMS Support viewer.`);
  L.push("");
  L.push("> **For the reviewer (Claude, Claude Code or a developer).** Use this file to find the cause of the user's problem and propose a fix.");
  L.push("> 1. Start with *What the user reported* and *Prognosis*, then read the *Errors* section: each error has the exact command, its arguments and the steps the user took just before.");
  L.push("> 2. MMS is a Tauri 2 desktop app: React + TypeScript screens in `src/desktop/src/`, Rust commands in `src/desktop/src-tauri/src/lib.rs` (a `CALL <name>` line is the Tauri command `<name>`), SQLite database.");
  L.push("> 3. Separate business rules doing their job (expected refusals) from real bugs. Say how sure you are, and how to reproduce it before changing code.");
  L.push("> 4. Propose the smallest fix, the files to change, a workaround for the user today, and a test to confirm it.");
  L.push("> 5. Times are the user's local time unless marked UTC. Report contents and the full data copy are not included; record ids are.");

  h("What the user reported");
  L.push(...table(["", ""], [
    ["User's note", m.note || "(no note written)"],
    ["Screen when sent", m.screen || "not recorded"],
    ["User", m.user ? `${m.user.name} (${m.user.role})` : "unknown"],
    ["Report attached", m.includes_report != null ? `MR-I report #${m.includes_report}` : "no"],
    ["Full data copy attached", m.includes_backup ? "yes (not exported here)" : "no"],
  ]));

  h("Environment");
  const env: (string | number)[][] = [
    ["MMS version", `${String(sys.version ?? m.mms_version)} (build ${String(sys.build ?? m.build ?? "?")})`],
    ["MMS on the IT laptop", input.thisVersion ?? "unknown"],
    ["Windows", String(sys.windows_version ?? "?")],
    ["Computer", m.computer || "?"],
    ["SQLite", String(sys.sqlite_version ?? "?")],
    ["Database upgrades applied", `${String(sys.schema_migrations ?? "?")}${sys.last_migration ? ` (last: ${String(sys.last_migration)})` : ""}${input.thisMigrations != null ? ` · IT laptop: ${input.thisMigrations}` : ""}`],
    ["Database size", sys.database_bytes != null ? `${Math.round(Number(sys.database_bytes) / 1024)} KB` : "?"],
  ];
  const trial = sys.trial as Record<string, unknown> | null | undefined;
  if (trial && trial.enabled) env.push(["Beta trial", `${trial.expired ? "EXPIRED" : `${String(trial.days_left ?? "?")} days left`}${trial.clock_back ? " · clock turned back" : ""}`]);
  L.push(...table(["", ""], env));
  const rows = sys.table_rows as Record<string, number> | undefined;
  if (rows && Object.keys(rows).length) {
    L.push("", "Rows per table: " + Object.entries(rows).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k} ${v}`).join(", ") + ".");
  }
  if (meta.missing.length) L.push("", `**Warning:** parts listed in the bundle but missing from the file: ${meta.missing.join(", ")}.`);
  L.push("", `Bundle parts: ${meta.names.length ? meta.names.join(", ") : "none"}.`);

  h(`Prognosis: ${OVERALL_TEXT[p.overall] ?? p.overall}`);
  L.push(`${p.rulesChecked} rules checked · ${p.counts.action ?? 0} need action · ${p.counts.attention ?? 0} need attention · ${p.counts.info ?? 0} for information.`);
  if (!p.findings.length) L.push("", "No findings.");
  p.findings.forEach((f, i) => {
    L.push("", `### ${i + 1}. ${f.title}`);
    L.push(`Level: ${LEVEL_TEXT[f.level] ?? f.level} · cause: ${CAUSE_TEXT[f.cause] ?? f.cause}${f.plan ? ` · fix type: ${FIX_TEXT[f.plan.type].label} · new MMS release needed: ${f.plan.release ? "yes" : "no"} · ${f.plan.confidence}` : ""}`);
    L.push("", f.why);
    if (f.evidence.length) { L.push(""); f.evidence.forEach((e) => L.push(`- ${cut(e, 400)}`)); }
    if (f.plan) L.push("", `- Today: ${f.plan.now}`, `- Permanent: ${f.plan.permanent}`, `- Who: ${f.plan.who}`);
    if (f.ifLeft) L.push(`- If left: ${f.ifLeft}`);
    if (f.plan && needsBrief(f.plan)) L.push("", "Developer brief:", "", "```text", redact(developerBrief(f, f.plan, input, meta.fileName)), "```");
  });

  h("Errors");
  if (!logs) L.push("The bundle has no app log, so errors and steps cannot be shown.");
  else {
    const groups = errorGroups(logs).filter((g) => !(g.source.startsWith("Command ") && rejectKind(g.message) !== "bug"));
    if (!groups.length) L.push("No errors in the log.");
    groups.slice(0, MAX_ERROR_GROUPS).forEach((g, i) => {
      L.push("", `### E${i + 1}. ${cut(g.source, 80)}: ${cut(g.message, 160)}`);
      L.push(`${g.count} time${g.count === 1 ? "" : "s"} · first ${g.items[0]?.line.time ?? "?"} · last ${g.items[g.items.length - 1]?.line.time ?? "?"} · screens: ${g.screens.join(", ") || "?"}${g.users.length ? ` · users: ${g.users.join(", ")}` : ""}`);
      L.push("", "Full message:", "", "```text", cut(msgOf(g.items[g.items.length - 1]), 2000), "```");
      const last = g.items[g.items.length - 1];
      const steps = stepsBefore(logs, last, 12);
      if (steps.length) { L.push("", "Steps just before the last occurrence (oldest first):"); steps.forEach((s) => L.push(`- ${evLine(s)}`)); }
      const near = logs.events.filter((e) => e.session === last.session && e.t <= last.t && e.t >= last.t - 15000 && e.line.kind === "CALL").slice(-6);
      if (near.length) { L.push("", "Calls in the 15 seconds before it:"); near.forEach((e) => L.push(`- ${evLine(e)}`)); }
    });
    if (groups.length > MAX_ERROR_GROUPS) L.push("", `…and ${groups.length - MAX_ERROR_GROUPS} more error groups (see the Error inbox).`);
  }

  h("Refused actions");
  if (logs) {
    const rej = rejections(logs).sort((a, b) => (a.kind === "bug" ? 0 : 1) - (b.kind === "bug" ? 0 : 1) || b.count - a.count);
    if (!rej.length) L.push("None.");
    else {
      L.push("Kind is a guess from the message: *bug* = looks technical, *rule* = a business rule doing its job, *permission* = role not allowed.", "");
      L.push(...table(["Kind", "Command", "Message", "Times", "Screens"], rej.slice(0, MAX_REJECTIONS).map((r) => [r.kind, r.cmd, cut(r.message, 200), r.count, r.screens.join(", ")])));
    }
  } else L.push("No app log.");

  h("Crashes and unclean closes");
  const unclean = (input.sessions ?? []).filter((s) => s.ended === "unclean");
  if (!input.sessions) L.push("No start and close history in the bundle.");
  else if (!unclean.length) L.push(`None in ${input.sessions.length} recorded starts.`);
  else unclean.forEach((s) => L.push(`- Started ${s.started.at ?? "?"} (MMS ${s.started.version ?? "?"}) and did not close properly${s.crashNote ? `: ${cut(s.crashNote, 600)}` : "."}`));

  h("Data checks");
  if (!input.checks) L.push("No Check my data results in the bundle.");
  else {
    const bad = input.checks.filter((c) => c.status === "warn" || c.status === "error");
    L.push(`${input.checks.length} checks · ${bad.length} with problems.`);
    if (bad.length) { L.push(""); L.push(...table(["Status", "Check", "Count", "Detail", "Example ids"], bad.map((c) => [c.status, c.name, c.count, cut(c.detail, 200), c.examples.slice(0, 10).join(", ")]))); }
  }

  h("Slow or failing calls");
  if (logs) {
    const st = callStats(calls(logs)).filter((s) => s.failed || s.max >= 1000).sort((a, b) => b.failed - a.failed || b.max - a.max).slice(0, 15);
    if (!st.length) L.push("No command failed and none took 1 second or more.");
    else L.push(...table(["Command", "Calls", "Failed", "Avg ms", "Max ms"], st.map((s) => [s.cmd, s.count, s.failed, s.avg, s.max])));
  } else L.push("No app log.");

  h("Action replay (latest session, most recent last)");
  if (logs && logs.events.length) {
    const lastSession = logs.events[logs.events.length - 1].session;
    const evs = logs.events.filter((e) => e.session === lastSession && (e.line.kind === "STEP" || e.line.level === "ERROR" || e.line.level === "PANIC" || e.line.level === "WARN" || (e.line.kind === "CALL" && e.line.call && !e.line.call.ok)));
    const shown = evs.slice(-MAX_REPLAY);
    if (evs.length > shown.length) L.push(`(Last ${shown.length} of ${evs.length} steps, warnings and errors in this session.)`, "");
    L.push("```text", ...shown.map(evLine), "```");
  } else L.push("No app log.");

  L.push("", "---", "Made by the MMS Support viewer (offline, fixed rules). Values that looked like passwords, keys or tokens were replaced with [hidden].");
  return L.join("\n") + "\n";
}
