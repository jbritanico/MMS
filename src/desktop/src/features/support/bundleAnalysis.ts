// Reading a support bundle's logs for the Support viewer (checklist items 24 to 27).
// Pure functions, no React, so they can be tested on their own.
//
// Times: screen lines are in the user's local time; Rust lines are in UTC. Everything here is
// shown in the USER's time (as they saw it), using the offset between the manifest's UTC time
// and screen.json's local time. Without screen.json the offset is taken as 0 and UTC lines are
// marked as UTC.

import { parseLog, type CallRecord, type LogLine } from "../../lib/support/bundleFormat";

export interface Ev {
  /** Milliseconds, user's local clock read as if UTC (so it sorts and formats consistently). */
  t: number;
  line: LogLine;
  /** Signed-in user at that moment (from the last "Signed in as" step). */
  user: string | null;
  /** Number of the MMS session (counted from each "Session start"). */
  session: number;
  file: string;
}

export interface LogData {
  events: Ev[];
  sessions: { n: number; start: number; end: number; users: string[]; version: string | null; steps: number; errors: number }[];
  offsetKnown: boolean;
}

function parseTime(time: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/.exec(time);
  if (!m) return 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], m[7] ? +m[7].padEnd(3, "0") : 0);
}

/** Offset (ms) to add to a UTC time to get the user's local time. */
export function userOffset(createdAtUtc: string | undefined, savedAtLocal: string | undefined): number | null {
  if (!createdAtUtc || !savedAtLocal) return null;
  const utc = parseTime(createdAtUtc), loc = parseTime(savedAtLocal);
  if (!utc || !loc) return null;
  // Round to the nearest quarter hour (time zones are whole quarter hours).
  return Math.round((loc - utc) / 900000) * 900000;
}

/** Reads every log file (oldest first) into one timeline. */
export function buildLogData(files: { name: string; text: string }[], offset: number | null): LogData {
  const off = offset ?? 0;
  const events: Ev[] = [];
  let user: string | null = null;
  let session = 0;
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    for (const line of parseLog(f.text)) {
      if (line.where === "rust" && /^Session start/.test(line.text)) { session++; user = null; }
      if (session === 0) session = 1;
      if (line.kind === "STEP") {
        const m = /^Signed in as (.+?) \(/.exec(line.text);
        if (m) user = m[1];
      }
      if (line.kind === "CALL" && line.call?.user !== undefined) user = line.call.user ?? user;
      const t = parseTime(line.time) + (line.utc ? off : 0);
      events.push({ t, line, user, session, file: f.name });
    }
  }
  events.sort((a, b) => a.t - b.t);
  const map = new Map<number, LogData["sessions"][number]>();
  for (const e of events) {
    let s = map.get(e.session);
    if (!s) { s = { n: e.session, start: e.t, end: e.t, users: [], version: null, steps: 0, errors: 0 }; map.set(e.session, s); }
    s.end = Math.max(s.end, e.t); s.start = Math.min(s.start, e.t);
    if (e.user && !s.users.includes(e.user)) s.users.push(e.user);
    const v = /^Session start, MMS (\S+)/.exec(e.line.text);
    if (v) s.version = v[1];
    if (e.line.kind === "STEP") s.steps++;
    if (e.line.level === "ERROR" || e.line.level === "PANIC") s.errors++;
  }
  return { events, sessions: [...map.values()].sort((a, b) => b.start - a.start), offsetKnown: offset != null };
}

// ---------------------------------------------------------------- item 24: Error inbox

export interface ErrorGroup {
  key: string;
  message: string;
  source: string;
  count: number;
  first: number;
  last: number;
  screens: string[];
  users: string[];
  items: Ev[];
}

/** "Command save_x: Report #12 not found (id 33)" -> "Command save_x: Report # not found (id #)". */
export function errorKey(text: string) {
  return text.replace(/\d+(\.\d+)?/g, "#").replace(/"[^"]{0,60}"/g, '"…"').replace(/\s+/g, " ").trim().slice(0, 200);
}

export function errorGroups(d: LogData): ErrorGroup[] {
  const map = new Map<string, ErrorGroup>();
  for (const e of d.events) {
    if (e.line.level !== "ERROR" && e.line.level !== "PANIC") continue;
    const text = e.line.text;
    const i = text.indexOf(": ");
    const source = e.line.level === "PANIC" ? "MMS stopped (panic)" : i > 0 && i < 40 ? text.slice(0, i) : "Error";
    const message = e.line.level === "PANIC" ? text : i > 0 && i < 40 ? text.slice(i + 2) : text;
    const key = errorKey(`${source}|${message}`);
    let g = map.get(key);
    if (!g) { g = { key, message, source, count: 0, first: e.t, last: e.t, screens: [], users: [], items: [] }; map.set(key, g); }
    g.count++; g.first = Math.min(g.first, e.t); g.last = Math.max(g.last, e.t); g.items.push(e);
    if (!g.screens.includes(e.line.where)) g.screens.push(e.line.where);
    if (e.user && !g.users.includes(e.user)) g.users.push(e.user);
  }
  return [...map.values()].sort((a, b) => b.last - a.last);
}

/** The last `n` steps (and screen openings) before an event, in the same session. */
export function stepsBefore(d: LogData, ev: Ev, n = 8): Ev[] {
  const out: Ev[] = [];
  const i = d.events.indexOf(ev);
  for (let j = i - 1; j >= 0 && out.length < n; j--) {
    const e = d.events[j];
    if (e.session !== ev.session) break;
    if (e.line.kind === "STEP") out.push(e);
  }
  return out.reverse();
}

// ---------------------------------------------------------------- item 26: Call log

export interface CallStat { cmd: string; count: number; failed: number; avg: number; max: number; total: number }

export function calls(d: LogData, filter: { screen?: string; user?: string } = {}): Ev[] {
  return d.events.filter((e) => e.line.kind === "CALL" && e.line.call
    && (!filter.screen || e.line.where === filter.screen)
    && (!filter.user || e.user === filter.user));
}

export function callStats(list: Ev[]): CallStat[] {
  const map = new Map<string, CallStat>();
  for (const e of list) {
    const c = e.line.call as CallRecord;
    let s = map.get(c.cmd);
    if (!s) { s = { cmd: c.cmd, count: 0, failed: 0, avg: 0, max: 0, total: 0 }; map.set(c.cmd, s); }
    s.count++; s.total += c.ms; s.max = Math.max(s.max, c.ms);
    if (!c.ok) s.failed++;
  }
  for (const s of map.values()) s.avg = Math.round(s.total / s.count);
  return [...map.values()];
}

export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))];
}

// ---------------------------------------------------------------- item 27: Rejected actions

export type RejectKind = "rule" | "permission" | "bug";
export interface Rejection { key: string; cmd: string; message: string; kind: RejectKind; count: number; last: number; screens: string[]; users: string[]; items: Ev[] }

const PERMISSION = /permission|not allowed|only an administrator|only the|not authori[sz]ed|access denied|cannot be scoped|restricted|refused/i;
const RULE = /cannot|can't|must|required|before|after|pending|already|not yet|still open|not found on this computer|is closed|is locked|exceed|at least|no more than|invalid|duplicate|not ready|red[- ]tag|exemption|missing|only one|single country/i;
const TECHNICAL = /no such (table|column)|syntax error|constraint failed|database is locked|disk|panicked|unwrap|failed to|could not (open|read|write)|unexpected|undefined|null|NaN|TypeError|cannot read propert/i;

/** Plain-language guess: a business rule doing its job, a permission refusal, or a likely bug. */
export function rejectKind(message: string): RejectKind {
  if (TECHNICAL.test(message)) return "bug";
  if (PERMISSION.test(message)) return "permission";
  if (RULE.test(message)) return "rule";
  return "bug";
}

export function rejections(d: LogData): Rejection[] {
  const map = new Map<string, Rejection>();
  const add = (e: Ev, cmd: string, message: string) => {
    const key = errorKey(`${cmd}|${message}`);
    let r = map.get(key);
    if (!r) { r = { key, cmd, message, kind: rejectKind(message), count: 0, last: e.t, screens: [], users: [], items: [] }; map.set(key, r); }
    r.count++; r.last = Math.max(r.last, e.t); r.items.push(e);
    if (!r.screens.includes(e.line.where)) r.screens.push(e.line.where);
    if (e.user && !r.users.includes(e.user)) r.users.push(e.user);
  };
  for (const e of d.events) {
    if (e.line.kind === "CALL" && e.line.call && !e.line.call.ok) add(e, e.line.call.cmd, e.line.call.error || "Refused (no reason given)");
    else if (e.line.where === "rust" && e.line.level === "WARN" && /^Refused: /.test(e.line.text)) {
      const m = /^Refused: (.+?) \(user/.exec(e.line.text);
      add(e, m ? m[1] : "MMS", e.line.text.replace(/^Refused: /, ""));
    }
  }
  return [...map.values()].sort((a, b) => b.last - a.last);
}

// ---------------------------------------------------------------- formatting

/** A timeline time as the user saw it: "19 Nov, 13:54:07". */
export function fmtT(t: number, withDate = true) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  const time = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  if (!withDate) return time;
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${d.getUTCDate()} ${mon}, ${time}`;
}
export function fmtDay(t: number) {
  const d = new Date(t);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}`;
}
export function fmtMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;
}
