import { invoke } from "../ipc";
import { diag, flush, localStamp } from "./diag";
import type { BundlePart } from "./bundleFormat";

// "Send to IT" support bundle, screen side (checklist items 9 to 13).
// The Rust command diag_build_bundle (src-tauri/src/diag.rs) packs the logs, laptop details,
// Check my data results and crash history into one .mmsbundle file; this file adds what only
// the screen side knows (steps, recent errors, recent calls, timings) and the user's note.

export interface BuildBundleOptions {
  /** The user's own words about the problem. */
  note: string;
  /** Report number to include (the report the user is on). */
  includeReport?: number | null;
  /** Full backup, off by default. Photos, drawings and anything like a password are left out. */
  includeBackup?: boolean;
}

export interface BundleResult {
  path: string;
  file_name: string;
  folder: string;
  bytes: number;
  parts: BundlePart[];
  /** Plain-language notes for the user (size, left-out log days, parts that could not be added). */
  warnings: string[];
  /** What the safety filter left out. */
  removed: string[];
  log_days_included: number;
  log_days_dropped: number;
}

/** What goes into screen.json: the in-memory record the support tools keep. */
export function screenPart() {
  const s = diag.state;
  return {
    format_version: 1,
    saved_at: localStamp(Date.now(), true),
    screen: s.screen,
    context: s.context,
    user: s.user,
    trail: s.trail,
    errors: s.errors,
    calls: s.ipc,
    timings: s.perf,
    previous_session: s.previous,
  };
}

/** Builds the support bundle and saves it to the Downloads folder. */
export async function buildSupportBundle(opts: BuildBundleOptions): Promise<BundleResult> {
  diag.step(`Making a support bundle${opts.includeBackup ? " (with full backup)" : ""}`);
  // Write the newest log lines first, so the bundle has everything up to this moment.
  await flush();
  const s = diag.state;
  const result = await invoke<BundleResult>("diag_build_bundle", {
    request: {
      note: opts.note.trim(),
      userName: s.user?.name ?? null,
      userRole: s.user?.role ?? null,
      screen: s.screen,
      includeReport: opts.includeReport ?? null,
      includeBackup: !!opts.includeBackup,
      screenPart: screenPart(),
    },
  });
  diag.step(`Saved support bundle ${result.file_name}`);
  return result;
}

export const fmtBundleSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
