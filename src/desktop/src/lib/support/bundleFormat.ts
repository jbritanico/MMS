// Support bundle (.mmsbundle) format, screen side. Mirrors src-tauri/src/bundle.rs
// (checklist items 5 and 6). Used by "Send to IT" and by the Support viewer.
//
// A bundle is one ZIP file; every part inside is a plain JSON or text file (see bundle.rs for
// the full list). The viewer reads manifest.json first and refuses formats it does not know.

export const BUNDLE_FORMAT = "mms-support-bundle";
export const BUNDLE_FORMAT_VERSION = 1;
export const BUNDLE_EXTENSION = "mmsbundle";

export const PART = {
  manifest: "manifest.json",
  system: "system.json",
  checks: "checks.json",
  sessions: "sessions.log",
  screen: "screen.json",
  report: "report.json",
  backup: "backup.json",
  logsDir: "logs/",
} as const;

export type BundleSection = "manifest" | "logs" | "system" | "checks" | "sessions" | "screen" | "report" | "backup" | "other";

export interface BundlePart { path: string; section: BundleSection | string; bytes: number }
export interface BundleUser { name: string; role: string }
export interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  format_version: number;
  /** UTC, "YYYY-MM-DD HH:MM:SS UTC" */
  created_at: string;
  mms_version: string;
  build: string;
  computer: string;
  user: BundleUser | null;
  screen: string;
  note: string;
  includes_backup: boolean;
  includes_report: number | null;
  parts: BundlePart[];
}

/** One line of sessions.log (crash history). */
export interface SessionEvent {
  event: "start" | "end" | "unclean_end" | string;
  at: string;
  version?: string;
  build?: string;
  db_bytes?: number;
  previous_started?: string;
  previous_version?: string;
  crash_note?: string | null;
}

// ---------------------------------------------------------------- log lines

export type LogLevel = "INFO" | "WARN" | "ERROR" | "PANIC";
export type LogKind = "CALL" | "PERF" | "STEP" | "TEXT";

/** A CALL line's JSON. Lines written before this format have `legacy: true` and fewer fields. */
export interface CallRecord { cmd: string; ms: number; ok: boolean; args?: string; result?: string; error?: string; user?: string | null; legacy?: boolean }
export interface PerfRecord { kind: "startup" | "screen_open" | "db_size" | string; ms?: number; screen?: string; timed_out?: boolean; bytes?: number; wal_bytes?: number }

export interface LogLine {
  raw: string;
  /** As written: local time with milliseconds (screen side) or UTC (Rust side, `utc: true`). */
  time: string;
  utc: boolean;
  level: LogLevel;
  /** The screen name, or "rust" for lines from the Rust side. */
  where: string;
  kind: LogKind;
  /** The message after the screen name (for CALL/PERF/STEP: after that word). */
  text: string;
  call?: CallRecord;
  perf?: PerfRecord;
}

const LINE_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)( UTC)? (INFO|WARN|ERROR|PANIC) \[([^\]]*)\] ?(.*)$/;
const LEGACY_CALL_RE = /^(\S+) (\d+) ms ?(.*?)(?: -> (.*))?$/;

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Reads one log line. Returns null for lines that are not in the MMS log format. */
export function parseLogLine(raw: string): LogLine | null {
  const m = LINE_RE.exec(raw.trimEnd());
  if (!m) return null;
  const [, time, utc, level, where, msg] = m;
  const base = { raw, time, utc: !!utc, level: level as LogLevel, where };
  const word = msg.split(" ", 1)[0];
  const rest = msg.slice(word.length + 1);

  if (word === "CALL") {
    const j = parseJson(rest);
    if (j && typeof j.cmd === "string") {
      return { ...base, kind: "CALL", text: rest, call: { ...(j as unknown as CallRecord), ms: Number(j.ms) || 0, ok: j.ok !== false } };
    }
    const lm = LEGACY_CALL_RE.exec(rest);
    if (lm) return { ...base, kind: "CALL", text: rest, call: { cmd: lm[1], ms: Number(lm[2]), ok: true, args: lm[3] || "", result: lm[4] ?? "", legacy: true } };
  }
  if (word === "PERF") {
    const j = parseJson(rest);
    if (j && typeof j.kind === "string") return { ...base, kind: "PERF", text: rest, perf: j as unknown as PerfRecord };
  }
  if (word === "STEP") return { ...base, kind: "STEP", text: rest };
  return { ...base, kind: "TEXT", text: msg };
}

/** Reads a whole log file; lines that are not in the MMS format are skipped. */
export function parseLog(text: string): LogLine[] {
  const out: LogLine[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const p = parseLogLine(line);
    if (p) out.push(p);
  }
  return out;
}

/** Reads sessions.log; lines that cannot be read are skipped. */
export function parseSessions(text: string): SessionEvent[] {
  const out: SessionEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const j = line.trim() ? parseJson(line.trim()) : null;
    if (j && typeof j.event === "string") out.push(j as unknown as SessionEvent);
  }
  return out;
}
