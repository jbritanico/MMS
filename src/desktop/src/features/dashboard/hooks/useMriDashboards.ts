import { useQuery } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";
import { useCurrentUser } from "../../../lib/currentUser";

// ---------- MR-I dashboards: scope (Task 0) ----------

export interface MriDashboardAsset {
  id: number;
  asset_code: string;
  asset_description: string | null;
  country: string | null;
  service_line: string | null;
  asset_type: string | null;
  active: boolean;
  tag_status: string | null;
  tag_reason: string | null;
}

export interface MriDashboardScope {
  /** null = the signed-in user may see every country */
  allowed_countries: string[] | null;
  assets: MriDashboardAsset[];
}

/** Units the signed-in user may see on the MR-I dashboards (limited by country access). */
export function useMriDashboardScope() {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: ["mri-dashboard-scope", user?.id ?? 0],
    queryFn: () => invoke<MriDashboardScope>("get_mri_dashboard_scope", { viewerUserId: user?.id ?? null }),
  });
}

// ---------- shared filters ----------

export type PeriodKind = "week" | "month" | "year" | "custom";

export interface DashboardFilters {
  kind: PeriodKind;
  /** week: any day in the week (YYYY-MM-DD); month: YYYY-MM; year: YYYY */
  anchor: string;
  from: string; // custom only, YYYY-MM-DD
  to: string; // custom only, YYYY-MM-DD
  country: string; // "" = all
  serviceLine: string;
  equipmentType: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function defaultFilters(): DashboardFilters {
  const now = new Date();
  return {
    kind: "month",
    anchor: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
    from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: ymd(now),
    country: "",
    serviceLine: "",
    equipmentType: "",
  };
}

export interface PeriodRange {
  /** start of the period, local time, inclusive */
  from: Date;
  /** end of the period, local time, exclusive */
  to: Date;
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (d: Date) => `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** Turns the period choice into a date range. Weeks run Monday to Sunday. */
export function periodRange(f: DashboardFilters): PeriodRange {
  if (f.kind === "week") {
    const d = f.anchor ? new Date(`${f.anchor}T00:00:00`) : new Date();
    const day = (d.getDay() + 6) % 7; // Monday = 0
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    const last = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1);
    return { from, to, label: `Week of ${fmt(from)} to ${fmt(last)}` };
  }
  if (f.kind === "year") {
    const y = Number(f.anchor) || new Date().getFullYear();
    return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1), label: `Year ${y}` };
  }
  if (f.kind === "custom") {
    const from = f.from ? new Date(`${f.from}T00:00:00`) : new Date(2000, 0, 1);
    const end = f.to ? new Date(`${f.to}T00:00:00`) : new Date();
    const to = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    return { from, to, label: `${fmt(from)} to ${fmt(end)}` };
  }
  const [y, m] = (f.anchor || "").split("-").map(Number);
  const year = y || new Date().getFullYear();
  const month = (m || new Date().getMonth() + 1) - 1;
  return { from: new Date(year, month, 1), to: new Date(year, month + 1, 1), label: `${MONTHS[month]} ${year}` };
}

/** Units that match the country / service line / equipment type filters. */
export function filterAssets(assets: MriDashboardAsset[], f: DashboardFilters): MriDashboardAsset[] {
  const eq = (a: string | null, b: string) => !b || (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
  return assets.filter((a) => eq(a.country, f.country) && eq(a.service_line, f.serviceLine) && eq(a.asset_type, f.equipmentType));
}

// ---------- faults (Dashboards 2, 3, 4, 9) ----------

export interface MriDashboardFault {
  result_id: number;
  report_id: number;
  asset_id: number;
  component: string | null;
  item: string | null;
  original_severity: string | null;
  /** Severity after any reclassification */
  severity: string;
  issue_details: string | null;
  /** Unix seconds: when the report with the fault was submitted */
  found_at: number | null;
  /** Unix seconds: when it stopped counting as open (closed, or carried to a later report) */
  ended_at: number | null;
  state: "Open" | "Closed" | "Carried forward";
  /** Plain words: where an open fault stands, or how it was closed */
  stage: string;
}

/** One row per fault on submitted MR-I reports, for the units the signed-in user may see. */
export function useMriDashboardFaults() {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: ["mri-dashboard-faults", user?.id ?? 0],
    queryFn: () => invoke<MriDashboardFault[]>("get_mri_dashboard_faults", { viewerUserId: user?.id ?? null }),
  });
}

/** Was the fault open at moment t (Unix seconds)? */
export const openAt = (f: MriDashboardFault, t: number) =>
  f.found_at != null && f.found_at < t && (f.ended_at == null || f.ended_at >= t);

export const SEVERITIES = [
  { key: "Critical", plain: "Unit not safe to use", color: "var(--danger)" },
  { key: "Moderate", plain: "Repair needed, unit can work", color: "var(--warn)" },
  { key: "Minor", plain: "Small issue", color: "var(--accent-blue, #2f6fed)" },
] as const;

export const sevKey = (s: string) => (/crit|major/i.test(s) ? "Critical" : /mod/i.test(s) ? "Moderate" : "Minor");

/** Time buckets for trend charts: days for a week or month, months for a year, and a sensible size for custom dates. */
export function buckets(from: Date, to: Date): { label: string; start: Date; end: Date }[] {
  const days = Math.round((to.getTime() - from.getTime()) / 86400000);
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const out: { label: string; start: Date; end: Date }[] = [];
  if (days <= 62) {
    for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))
      out.push({ label: `${d.getDate()} ${M[d.getMonth()]}`, start: d, end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) });
  } else if (days <= 366 && !(from.getDate() === 1 && to.getDate() === 1 && days >= 360)) {
    for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
      const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
      out.push({ label: `${d.getDate()} ${M[d.getMonth()]}`, start: d, end: e < to ? e : to });
    }
  } else {
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const s = d < from ? from : d;
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      out.push({ label: `${M[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, start: s, end: e < to ? e : to });
    }
  }
  return out;
}

export const fmtDate = (secs: number | null) => {
  if (secs == null) return "—";
  const d = new Date(secs * 1000);
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getDate()).padStart(2, "0")} ${M[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * When each fault was FIRST found. A fault carried forward is copied onto the next report,
 * so its own found_at is the later report; follow the chain back to the first report.
 * Returns result_id -> Unix seconds.
 */
export function firstFoundMap(all: MriDashboardFault[]): Map<number, number | null> {
  const key = (f: MriDashboardFault) => `${f.asset_id}|${f.item ?? ""}|${f.component ?? ""}`;
  const carried = new Map<string, MriDashboardFault[]>();
  for (const g of all) if (g.state === "Carried forward") carried.set(key(g), [...(carried.get(key(g)) ?? []), g]);
  const memo = new Map<number, number | null>();
  const first = (f: MriDashboardFault, depth = 0): number | null => {
    if (memo.has(f.result_id)) return memo.get(f.result_id)!;
    const prev = (carried.get(key(f)) ?? []).find((g) => g.report_id < f.report_id && g.ended_at === f.found_at && g.result_id !== f.result_id);
    const v = prev && depth < 50 ? first(prev, depth + 1) : f.found_at;
    memo.set(f.result_id, v);
    return v;
  };
  for (const f of all) first(f);
  return memo;
}

/** Ageing limits from the most recent reference, the MMS Dashboard Visualization deck (08.10.2026), same as the Faults Severity Classification: Major/Critical > 7 days, Moderate/Minor > 30 days. */
export const AGING_LIMIT_DAYS: Record<"Critical" | "Moderate" | "Minor", number> = { Critical: 7, Moderate: 30, Minor: 30 };

// ---------- waiting decisions (Dashboard 5) ----------

export interface MriDashboardWaiting {
  /** "fault" = a fault decision; "report" = the Supervisor's review or close of a report */
  kind: "fault" | "report";
  report_id: number;
  asset_id: number;
  approval_id: number | null;
  severity: string | null;
  component: string | null;
  item: string | null;
  issue_details: string | null;
  step: string;
  /** Unix seconds */
  waiting_since: number | null;
  assigned_to_user_id: number | null;
  assigned_to_name: string | null;
  required_authority: string;
  reminders: number;
  last_reminder_by: string | null;
  last_reminder_at: number | null;
  submitted_by: string | null;
}

/** Everything waiting for a reviewer now, for the units the signed-in user may see. */
export function useMriDashboardWaiting() {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: ["mri-dashboard-waiting", user?.id ?? 0],
    queryFn: () => invoke<MriDashboardWaiting[]>("get_mri_dashboard_waiting", { viewerUserId: user?.id ?? null }),
  });
}

// ---------- Dashboards 6-13: reports, decisions, repairs, tag changes, exemptions, triggers ----------

export interface MriDashReport {
  id: number;
  asset_id: number;
  status: string;
  component: string | null;
  compliance_stage: string | null;
  created_at: number | null;
  submitted_at: number | null;
  submitted_by: string | null;
  /** Endorsed date while open; the close date once Approved */
  approved_at: number | null;
  approved_by: string | null;
  fault_count: number;
}
export interface MriDashDecision {
  approval_id: number;
  report_id: number;
  asset_id: number;
  item: string | null;
  original_severity: string | null;
  decision: string;
  new_severity: string | null;
  reviewer: string | null;
  review_method: string | null;
  recorded_by: string | null;
  provisional_status: string | null;
  report_submitted_at: number | null;
  sent_at: number | null;
  decided_at: number | null;
  confirmed_by: string | null;
  confirmed_at: number | null;
  ack_needed: boolean;
  acknowledged_by: string | null;
  acknowledged_at: number | null;
  ack_assigned_to: string | null;
}
export interface MriDashRepair {
  rectification_id: number;
  approval_id: number;
  report_id: number;
  asset_id: number;
  item: string | null;
  severity: string | null;
  technician: string | null;
  parts_status: string;
  tag_status: string;
  queued_at: number | null;
  repair_at: number | null;
  verified_by: string | null;
  verified_at: number | null;
  limitations_note: string | null;
}
export interface MriDashTagChange {
  asset_id: number;
  tag_status: string;
  previous_tag_status: string | null;
  reason: string | null;
  report_id: number | null;
  changed_by: string | null;
  changed_at: number | null;
}
export interface MriDashExemption {
  id: number;
  asset_id: number;
  moc_reference: string;
  approved_by: string;
  limitations: string;
  required_controls: string;
  return_conditions: string;
  valid_from: number | null;
  valid_until: number | null;
  status: string;
  revoked_at: number | null;
  revoke_reason: string | null;
}
export interface MriDashTrigger {
  asset_id: number;
  mr_level: string;
  trigger_type: string;
  interval_value: number;
  warning_value: number;
  running_value: number;
  last_reset_at: number | null;
}
export interface MriDashboardMore {
  reports: MriDashReport[];
  decisions: MriDashDecision[];
  repairs: MriDashRepair[];
  tag_changes: MriDashTagChange[];
  exemptions: MriDashExemption[];
  triggers: MriDashTrigger[];
}

export function useMriDashboardMore() {
  const { user } = useCurrentUser();
  return useQuery({
    queryKey: ["mri-dashboard-more", user?.id ?? 0],
    queryFn: () => invoke<MriDashboardMore>("get_mri_dashboard_more", { viewerUserId: user?.id ?? null }),
  });
}
