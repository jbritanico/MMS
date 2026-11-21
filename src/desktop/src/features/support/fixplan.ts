// Fix plan for prognosis findings (checklist items 41 to 45). Pure functions, no React.
//
// Same bundle, same offline fixed rules as the prognosis: no outside service and no AI. For each
// finding it says what can be done today without a new MMS version ("do this now"), what kind of
// permanent fix it needs (no change, laptop / set-up, data fix, data structure change or code
// change), who does it and whether a new MMS release is needed. For code and data structure
// changes it writes a plain-text developer brief with the evidence from the bundle.
//
// MMS cannot see its own source code here, so "code change" is a best judgement from the error
// text and where it happened; the brief gives the developer what they need to confirm it.

import { rejectKind, stepsBefore, type Ev } from "./bundleAnalysis";
import type { Finding, PrognosisInput } from "./prognosis";

export type FixType = "code" | "structure" | "data" | "setup" | "none";

export interface FixPlan {
  type: FixType;
  /** A workaround for today, without a new MMS version. */
  now: string;
  /** The lasting fix. */
  permanent: string;
  who: string;
  /** True when the permanent fix needs a new MMS version to be built and installed. */
  release: boolean;
  /** A second kind of fix that may also be needed once the first is confirmed. */
  alsoCheck?: FixType;
  /** Plain words on how sure the rule is. */
  confidence: "likely" | "possible";
}

/** Order for the Fix plan tab and the report: changes that need a developer first. */
export const FIX_ORDER: FixType[] = ["code", "structure", "data", "setup", "none"];

export const FIX_TEXT: Record<FixType, { label: string; short: string; who: string; blurb: string }> = {
  code: { label: "Code change", short: "Code", who: "Developer", blurb: "MMS itself must be changed and a new version installed." },
  structure: { label: "Data structure change", short: "Structure", who: "Developer", blurb: "Tables or columns in the database must change, through a database upgrade in MMS." },
  data: { label: "Data fix", short: "Data", who: "IT or key user", blurb: "Records must be corrected; MMS itself does not change." },
  setup: { label: "Laptop or set-up", short: "Set-up", who: "IT", blurb: "The laptop, the MMS install or the user's permissions must change." },
  none: { label: "No change needed", short: "No change", who: "IT explains to the user", blurb: "MMS works as intended; the user needs guidance or nothing needs doing." },
};

// ---------------------------------------------------------------- reading error text

/** What kind of permanent fix an error or refusal message points to. */
export function fixTypeOfMessage(msg: string): FixType {
  if (/no such (table|column)|has no column named|no column named/i.test(msg)) return "structure";
  if (/database is locked|disk (i\/o|full)|no space|readonly database|unable to open database|access is denied|os error/i.test(msg)) return "setup";
  if (/UNIQUE constraint failed|duplicate/i.test(msg)) return "data";
  if (/(NOT NULL|FOREIGN KEY|CHECK) constraint failed/i.test(msg)) return "code";
  if (/panicked|unwrap|undefined|null|NaN|TypeError|ReferenceError|cannot read propert|is not a function|Maximum update depth|Too many re-renders|syntax error|unexpected/i.test(msg)) return "code";
  const kind = rejectKind(msg);
  if (kind === "permission") return "setup";
  if (kind === "rule") return "none";
  return "code";
}

const rank = (t: FixType) => FIX_ORDER.indexOf(t);
/** The fix type that needs the most work (code first). */
export const heaviest = (types: FixType[]): FixType => (types.length ? types.reduce((a, b) => (rank(b) < rank(a) ? b : a)) : "none");

function messageOf(e: Ev): string {
  if (e.line.kind === "CALL" && e.line.call) return e.line.call.error ?? "failed";
  return e.line.text;
}

// ---------------------------------------------------------------- plans per rule

const P = (type: FixType, now: string, permanent: string, extra: Partial<FixPlan> = {}): FixPlan => ({
  type, now, permanent, who: FIX_TEXT[type].who, release: type === "code" || type === "structure", confidence: "likely", ...extra,
});

function versionBehind(i: PrognosisInput) {
  const v = i.system?.version ?? i.manifest.mms_version;
  if (!v || !i.thisVersion) return false;
  const pa = v.split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = i.thisVersion.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let k = 0; k < Math.max(pa.length, pb.length); k++) { const d = (pa[k] ?? 0) - (pb[k] ?? 0); if (d) return d < 0; }
  return false;
}
/** The user's database has fewer upgrades applied than this laptop's. */
function upgradesBehind(i: PrognosisInput) {
  const theirs = i.system?.schema_migrations, ours = i.thisMigrations;
  return theirs != null && ours != null && theirs < ours;
}

export function fixPlanFor(f: Finding, i: PrognosisInput): FixPlan {
  const behind = versionBehind(i);
  switch (f.rule) {
    case "bundle-damaged":
      return P("none", "Ask the user for a new bundle (Help → Send to IT) and to send it without opening or renaming it.", "Nothing to change in MMS.", { who: "User" });
    case "no-logs":
      return P("none", "Ask for a new bundle right after the problem happens.", "Nothing to change in MMS.", { who: "User" });

    case "crash-panic":
      return behind
        ? P("setup", "Update the laptop to the current MMS version, then ask the user to repeat what they were doing.", "If it still stops after the update, MMS needs a code change.", { alsoCheck: "code", confidence: "possible" })
        : P("code", "Restart MMS. Until it is fixed, avoid the steps shown in Action replay just before the stop, and save work often.", "Find the internal error in the MMS engine (the panic text names the file and line) and fix it; release a new MMS version.");
    case "render-loop":
      return behind
        ? P("setup", "Update the laptop to the current MMS version; the MR-I report redraw fix is in 19 Nov 2026 and later.", "If it continues after the update, the screen needs a code change.", { alsoCheck: "code", confidence: "possible" })
        : P("code", "Leave the screen and open it again; re-enter anything that was lost. Avoid the steps that led to it (Action replay).", "Fix the screen so it stops redrawing itself in a loop; release a new MMS version.");
    case "schema-mismatch": {
      if (behind || upgradesBehind(i))
        return P("structure", "Install the current MMS version on the laptop and restart it, so the database upgrade runs. Take a backup first.", "No new release needed: the upgrade already exists. If it still fails after the update, check the upgrade step for that table.", { release: false, who: "IT" });
      return P("structure", "None safe on the laptop: actions that use the missing table or column will keep failing. Use a laptop where it works, or restore a backup made on this version.", "Add a database upgrade in MMS that creates the missing table or column (and fills existing records), then release a new MMS version.");
    }
    case "possible-bug": {
      const types = (f.events ?? []).map((e) => fixTypeOfMessage(messageOf(e)));
      const t = heaviest(types.length ? types : ["code"]);
      if (t === "data")
        return P("data", "Find the record that is duplicated (the message names the table) and correct or remove it in the Data Browser, after a backup.", "If MMS let the duplicate in, also add a check in MMS so it cannot be saved twice.", { alsoCheck: "code", confidence: "possible" });
      if (t === "setup")
        return P("setup", "Close other copies of MMS, check free disk space and that the data folder is not read only or blocked by antivirus.", "Nothing to change in MMS if the laptop problem is fixed.", { confidence: "possible" });
      return P("code", "Reproduce the steps on a test laptop. Until it is fixed, avoid that action or do it on another laptop.", "Fix the command named in the evidence so it no longer fails; release a new MMS version.", { confidence: "possible" });
    }
    case "repeated-errors":
      return behind
        ? P("setup", "Update the laptop to the current MMS version; the error may already be fixed.", "If it continues after the update, it needs a code change.", { alsoCheck: "code", confidence: "possible" })
        : P("code", "Reload the screen (leave and open it again). Note which steps bring the error back.", "Fix the screen named in the evidence; release a new MMS version.");
    case "errors-near-bundle": {
      const types = (f.events ?? []).map((e) => fixTypeOfMessage(messageOf(e)));
      const t = heaviest(types);
      return P(t, "Open Action replay at the end of the latest session, repeat the user's steps on a test laptop, and see which finding above matches.",
        t === "code" ? "Same as the matching finding above; most likely a code change." : `Same as the matching finding above (${FIX_TEXT[t].label.toLowerCase()}).`,
        { confidence: "possible" });
    }
    case "unclean-shutdowns":
      if (f.cause === "bug" && behind)
        return P("setup", "Update the laptop to the current MMS version and restart; ask the user to save often.", "If MMS still stops after the update, fix the internal error named in the crash note (code change).", { alsoCheck: "code", confidence: "possible" });
      return f.cause === "bug"
        ? P("code", "Restart MMS; ask the user to save often until it is fixed.", "Fix the internal error named in the crash note; release a new MMS version.")
        : P("setup", "Ask the user to close MMS before shutting the laptop, and whether it froze.", "If MMS froze, check the last steps in Action replay; a repeated freeze on the same steps needs a code change.", { alsoCheck: "code", confidence: "possible" });

    case "old-version":
      return P("setup", "Install the current MMS version on the user's laptop (take a backup first).", "Nothing to change in MMS.");
    case "developer-run":
      return P("none", "Nothing for a test.", "Make sure real users run the installed MMS.");
    case "trial":
      return f.cause === "user"
        ? P("setup", "Set the laptop's date and time to automatic.", "Nothing to change in MMS.")
        : P("setup", "Install the current beta build before the trial runs out.", "Nothing to change in MMS.");
    case "permission-refusals":
      return P("setup", "If the user should be allowed, change their role or permissions in Administration → Users. Otherwise tell them who can do it.", "Nothing to change in MMS. If the rule itself is wrong for Sprint's process, it is a code change.", { alsoCheck: "code", confidence: "possible" });
    case "checks-could-not-run":
      return P("structure", "Install the current MMS version on the laptop and restart it so the database upgrade runs.", "No new release needed if the upgrade exists. If the laptop is on the current version, a database upgrade is missing in MMS.", { release: upgradesBehind(i) || behind ? false : true, who: "IT, then developer if it persists" });

    case "data-errors":
      return P("data", "Take a backup, then correct the records named in the evidence (Record inspector shows their history; correct them in the Data Browser).", "Find how the record got that way. If MMS allowed it (for example a counter going below zero), MMS also needs a code change so it cannot happen again.", { alsoCheck: "code" });
    case "data-warnings":
      return P("data", "Review the records in the Data checks tab and tidy them if they are leftovers.", "Usually nothing else. If the same warning keeps coming back, check whether MMS should clean these up itself.", { alsoCheck: "code", confidence: "possible" });
    case "rule-refusals":
      return P("none", "Explain the rule in the message to the user.", "No change needed. If users often misunderstand the message, a clearer message is a small code change.", { alsoCheck: "code", confidence: "possible" });
    case "database-size":
      return P("data", "Take a backup, then remove old test records and large photos that are no longer needed.", "If it keeps growing quickly, MMS may need an archive or purge step (code change).", { alsoCheck: "code", confidence: "possible" });

    case "slow-saves":
    case "slow-reads":
    case "slow-startup":
    case "slow-screens":
      return P("setup", "Check free disk space, battery saver and antivirus scanning of the MMS data folder; restart the laptop.", "If the laptop is fine and the same action is slow on other laptops too, that action needs a code change (a faster query).", { alsoCheck: "code", confidence: "possible" });
  }
  // A rule without a plan yet: judge from the cause.
  const byCause: Record<Finding["cause"], FixType> = { bug: "code", data: "data", user: "none", setup: "setup", laptop: "setup" };
  return P(byCause[f.cause], f.fix, "See the finding.", { confidence: "possible" });
}

// ---------------------------------------------------------------- developer brief (item 44)

export const needsBrief = (p: FixPlan) => p.type === "code" || p.type === "structure" || p.alsoCheck === "code";

/** Plain text for a ticket, an e-mail or Claude Code. Contains no business data beyond what the evidence already shows. */
export function developerBrief(f: Finding, p: FixPlan, i: PrognosisInput, fileName: string): string {
  const m = i.manifest;
  const L: string[] = [];
  L.push(`MMS issue: ${f.title}`);
  L.push(`Fix type: ${FIX_TEXT[p.type].label}${p.alsoCheck ? ` (may also need: ${FIX_TEXT[p.alsoCheck].label.toLowerCase()})` : ""} · new MMS release needed: ${p.release ? "yes" : "no"} · ${p.confidence === "likely" ? "likely" : "possible, confirm first"}`);
  L.push("");
  L.push("Where it came from");
  L.push(`- Bundle: ${fileName} (made ${m.created_at})`);
  L.push(`- User: ${m.user ? `${m.user.name} (${m.user.role})` : "unknown"} · computer ${m.computer || "?"}`);
  L.push(`- MMS ${i.system?.version ?? m.mms_version} (${i.system?.build ?? m.build ?? "?"})${i.thisVersion ? ` · current on IT laptop: ${i.thisVersion}` : ""}`);
  if (i.system?.schema_migrations != null) L.push(`- Database upgrades applied: ${i.system.schema_migrations}${i.system.last_migration ? ` (last: ${i.system.last_migration})` : ""}${i.thisMigrations != null ? ` · IT laptop: ${i.thisMigrations}` : ""}`);
  if (m.screen) L.push(`- Screen when sent: ${m.screen}`);
  if (m.note) L.push(`- User's note: ${m.note}`);
  L.push("");
  L.push("What MMS saw");
  L.push(f.why);
  if (f.evidence.length) { L.push(""); L.push("Evidence"); f.evidence.forEach((e) => L.push(`- ${e}`)); }
  const evs = (f.events ?? []).slice(-3);
  if (evs.length) {
    L.push(""); L.push("Exact errors (latest last)");
    evs.forEach((e) => {
      const c = e.line.kind === "CALL" ? e.line.call : undefined;
      L.push(`- ${e.line.time} · ${e.line.where === "rust" ? "MMS engine" : e.line.where}${c ? ` · command ${c.cmd} (${c.ms} ms)` : ""}`);
      L.push(`  ${messageOf(e).slice(0, 400)}`);
      if (c?.args) L.push(`  arguments: ${String(c.args).slice(0, 300)}`);
    });
    const last = evs[evs.length - 1];
    if (i.logs) {
      const steps = stepsBefore(i.logs, last, 10);
      if (steps.length) {
        L.push(""); L.push("Steps the user took just before (oldest first)");
        steps.forEach((s) => L.push(`- ${s.line.time} · ${s.line.where} · ${s.line.text}`));
      }
    }
  }
  L.push("");
  L.push("Suggested fix");
  L.push(`- Today: ${p.now}`);
  L.push(`- Permanent: ${p.permanent}`);
  L.push("");
  L.push("Made by the MMS Support viewer from fixed rules (offline). Confirm by reproducing the steps before changing code.");
  return L.join("\n");
}
