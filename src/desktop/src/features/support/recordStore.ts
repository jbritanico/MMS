// Record inspector data (checklist item 28): reads report.json and/or backup.json from a support
// bundle into one read-only set of tables, and puts together a report, unit or fault for the
// Support viewer. Pure functions, no React.
//
//  report.json  { tables: { name: [ {col: value} ] } }           one report and what belongs to it
//  backup.json  { tables: { name: { columns: [], rows: [[]] } } } every table (photos left out)
// When both are present the backup wins for a table, and report-only extras (labels, carried-in
// faults) are added. Dates in MMS are Unix seconds stored as text.

export type Row = Record<string, unknown>;

export class RecordStore {
  tables = new Map<string, Row[]>();
  hasReport = false;
  hasBackup = false;
  reportId: number | null = null;
  exportVersion = 0;

  static from(report: unknown, backup: unknown): RecordStore {
    const s = new RecordStore();
    const b = backup as { tables?: Record<string, { columns?: string[]; rows?: unknown[][] }> } | null;
    if (b?.tables) {
      s.hasBackup = true;
      for (const [name, t] of Object.entries(b.tables)) {
        const cols = t.columns ?? [];
        s.tables.set(name, (t.rows ?? []).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]]))));
      }
    }
    const r = report as { report_id?: number; export_version?: number; tables?: Record<string, Row[]> } | null;
    if (r?.tables) {
      s.hasReport = true;
      s.reportId = typeof r.report_id === "number" ? r.report_id : null;
      s.exportVersion = r.export_version ?? 1;
      for (const [name, rows] of Object.entries(r.tables)) {
        if (!Array.isArray(rows)) continue;
        const have = s.tables.get(name);
        if (!have) { s.tables.set(name, rows); continue; }
        const ids = new Set(have.map((x) => x.id));
        s.tables.set(name, [...have, ...rows.filter((x) => !ids.has(x.id))]);
      }
    }
    return s;
  }

  rows(table: string): Row[] { return this.tables.get(table) ?? []; }
  byId(table: string, id: unknown): Row | undefined { return id == null ? undefined : this.rows(table).find((r) => r.id == id); }
  where(table: string, col: string, val: unknown): Row[] { return val == null ? [] : this.rows(table).filter((r) => r[col] == val); }
  tableNames(): string[] { return [...this.tables.keys()].sort(); }
}

// ---------------------------------------------------------------- formatting

/** MMS dates: Unix seconds as text (most), or "YYYY-MM-DD[ HH:MM:SS]" (a few). Returns ms or null. */
export function toMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^\d{9,11}$/.test(s)) return Number(s) * 1000;
  if (/^\d{12,14}$/.test(s)) return Number(s);
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d.getTime();
}
export function fmtDate(v: unknown, withTime = true): string {
  const ms = toMs(v);
  if (ms == null) return v == null || v === "" ? "—" : String(v);
  return new Date(ms).toLocaleString(undefined, withTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" });
}
export const txt = (v: unknown, none = "—") => (v == null || v === "" ? none : String(v));

// ---------------------------------------------------------------- report

export interface FieldValue { label: string; value: string; by?: string; at?: unknown }
export interface ChecklistLine { id: unknown; item: string; section: string; status: string; severity: string; details: string; action: string; closure: string; repairedOnSite: boolean; component?: string }
export interface FaultView { id: unknown; item: string; fault: Row; decisions: Row[]; repair?: Row; reminders: Row[] }
export interface TimelineEvent { at: number; title: string; who?: string; detail?: string; tone: "info" | "ok" | "warn" | "bad" | "muted" }

export interface ReportView {
  report: Row;
  asset?: Row;
  assetType?: Row;
  template?: Row;
  component?: string;
  header: FieldValue[];
  mid: FieldValue[];
  footer: FieldValue[];
  checklist: ChecklistLine[];
  faults: FaultView[];
  carriedIn: FaultView[];
  sameUnit: Row[];
  timeline: TimelineEvent[];
  labelsMissing: boolean;
}

function fieldValues(st: RecordStore, reportId: unknown, valuesTable: string, valueCol: string, tplTable: string, tplCol: string, catalog: string): { list: FieldValue[]; missing: boolean } {
  let missing = false;
  const list = st.where(valuesTable, "report_id", reportId).map((v) => {
    const tf = st.byId(tplTable, v[valueCol]);
    const cat = tf ? st.byId(catalog, tf[tplCol]) : undefined;
    const label = txt(tf?.label_override, "") || txt(cat?.label, "");
    if (!label) missing = true;
    let value = txt(v.value, "");
    if (v.route_points) {
      try { const pts = JSON.parse(String(v.route_points)); if (Array.isArray(pts)) value += `${value ? " · " : ""}route with ${pts.length} points`; } catch { /* not a list */ }
    }
    return { label: label || `Field ${v[valueCol]}`, value: value || "—", by: txt(v.updated_by, ""), at: v.updated_at, order: Number(tf?.display_order ?? 999) };
  });
  list.sort((a, b) => a.order - b.order);
  return { list: list.map(({ order: _o, ...r }) => r), missing };
}

function itemName(st: RecordStore, tciId: unknown): { item: string; section: string } {
  const tci = st.byId("template_checklist_items", tciId);
  const item = tci ? st.byId("checklist_databank", tci.checklist_item_id) : undefined;
  const sec = tci ? st.byId("checklist_sections", tci.section_id) : undefined;
  return { item: txt(item?.description, "") || `Checklist item ${txt(tciId)}`, section: txt(sec?.name, "") };
}

function faultView(st: RecordStore, f: Row): FaultView {
  return {
    id: f.id,
    item: itemName(st, f.template_checklist_item_id).item,
    fault: f,
    decisions: st.where("mri_fault_decision_log", "fault_approval_id", f.id).sort((a, b) => (toMs(a.logged_at) ?? 0) - (toMs(b.logged_at) ?? 0)),
    repair: st.where("mri_fault_rectifications", "fault_approval_id", f.id)[0],
    reminders: st.where("mri_fault_reminders", "fault_approval_id", f.id),
  };
}

const SEV_ORDER: Record<string, number> = { Critical: 0, Major: 0, Moderate: 1, Minor: 2 };

export function reportView(st: RecordStore, id: number): ReportView | null {
  const report = st.byId("mri_reports", id);
  if (!report) return null;
  const asset = st.byId("assets", report.asset_id);
  const template = st.byId("mri_templates", report.template_id);
  const assetType = asset ? st.byId("asset_types", asset.asset_type_id) : undefined;
  const comp = st.byId("template_components", report.component_id);
  const h = fieldValues(st, id, "mri_report_header_values", "template_header_field_id", "template_header_fields", "header_field_id", "header_field_catalog");
  const m = fieldValues(st, id, "mri_report_mid_values", "template_mid_field_id", "template_mid_fields", "mid_field_id", "mid_field_catalog");
  const f = fieldValues(st, id, "mri_report_footer_values", "template_footer_field_id", "template_footer_fields", "footer_field_id", "footer_field_catalog");
  const checklist: ChecklistLine[] = st.where("mri_report_checklist_results", "report_id", id).map((r) => {
    const n = itemName(st, r.template_checklist_item_id);
    return {
      id: r.id, item: n.item, section: n.section, status: txt(r.status, "Not answered"), severity: txt(r.severity, ""),
      details: txt(r.issue_details, ""), action: txt(r.action_taken, ""), closure: txt(r.closure_status, ""), repairedOnSite: !!Number(r.repaired_on_site ?? 0),
    };
  }).sort((a, b) => (a.status === "Fail" ? 0 : 1) - (b.status === "Fail" ? 0 : 1) || (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3) || a.section.localeCompare(b.section));
  const faults = st.where("mri_fault_approvals", "report_id", id).map((x) => faultView(st, x));
  const carriedIn = [...st.rows("mri_fault_approvals_carried_in"), ...st.where("mri_fault_approvals", "carried_to_report_id", id)]
    .filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i && x.report_id != id)
    .map((x) => faultView(st, x));
  const sameUnit = (st.hasBackup ? st.where("mri_reports", "asset_id", report.asset_id) : st.rows("mri_reports_same_unit"))
    .filter((r) => r.id != id).sort((a, b) => Number(b.id) - Number(a.id));
  return {
    report, asset, assetType, template, component: comp ? txt(comp.label) : undefined,
    header: h.list, mid: m.list, footer: f.list, checklist, faults, carriedIn, sameUnit,
    timeline: reportTimeline(st, report, faults, checklist),
    labelsMissing: h.missing || m.missing || f.missing || checklist.some((c) => c.item.startsWith("Checklist item ")),
  };
}

function push(list: TimelineEvent[], at: unknown, e: Omit<TimelineEvent, "at">) {
  const ms = toMs(at);
  if (ms != null) list.push({ at: ms, ...e });
}

export function reportTimeline(st: RecordStore, r: Row, faults: FaultView[], checklist: ChecklistLine[]): TimelineEvent[] {
  const t: TimelineEvent[] = [];
  const id = r.id;
  push(t, r.created_date, { title: "Report created", tone: "info" });
  push(t, r.submitted_date, { title: "Submitted", who: txt(r.submitted_by, ""), tone: "info" });
  push(t, r.approved_date, { title: r.status === "Closed" ? "Approved / closed" : "Endorsed / approved", who: txt(r.approved_by, ""), detail: `Report status now: ${txt(r.status)}`, tone: "ok" });
  push(t, r.mr_cost_date, { title: "MR cost entered", who: txt(r.mr_cost_by, ""), detail: r.mr_cost != null ? String(r.mr_cost) : undefined, tone: "muted" });
  push(t, r.job_number_checked_at, { title: "Job number checked", detail: txt(r.job_number_status, ""), tone: "muted" });
  for (const res of st.where("mri_report_checklist_results", "report_id", id)) {
    if (res.status === "Fail") {
      const n = itemName(st, res.template_checklist_item_id);
      push(t, res.reported_at, { title: `Fault reported: ${n.item}`, who: txt(res.reported_by, ""), detail: [txt(res.severity, ""), txt(res.issue_details, "")].filter(Boolean).join(" · "), tone: res.severity === "Critical" ? "bad" : "warn" });
    }
  }
  for (const o of st.where("mri_onsite_repair_log", "report_id", id)) {
    push(t, o.repaired_at, { title: `Repaired on site: ${itemName(st, o.template_checklist_item_id).item}`, who: txt(o.repaired_by, ""), detail: txt(o.action_taken, ""), tone: "ok" });
  }
  for (const a of st.where("mri_checklist_action_log", "report_id", id)) {
    push(t, a.recorded_at, { title: `Action recorded: ${itemName(st, a.template_checklist_item_id).item}`, who: txt(a.recorded_by, ""), detail: txt(a.action_text, ""), tone: "muted" });
  }
  for (const f of faults) {
    for (const d of f.decisions) {
      const sev = d.to_severity && d.to_severity !== d.from_severity ? `${d.from_severity} → ${d.to_severity}` : txt(d.from_severity, "");
      push(t, d.logged_at, {
        title: `${txt(d.action)}: ${f.item}`, who: txt(d.reviewer, ""),
        detail: [sev, txt(d.review_method, ""), Number(d.is_provisional) ? "provisional (phone)" : "", d.recorded_by && d.recorded_by !== d.reviewer ? `recorded by ${d.recorded_by}` : "", txt(d.notes, "")].filter(Boolean).join(" · "),
        tone: /reject/i.test(String(d.action)) ? "bad" : /reclass/i.test(String(d.action)) ? "warn" : "ok",
      });
    }
    push(t, f.fault.confirmed_date, { title: `Phone decision confirmed: ${f.item}`, who: txt(f.fault.confirmed_by, ""), tone: "ok" });
    push(t, f.fault.acknowledged_date, { title: `Acknowledged: ${f.item}`, who: txt(f.fault.acknowledged_by, ""), tone: "muted" });
    if (f.fault.carried_to_report_id) push(t, f.fault.updated_date, { title: `Carried forward to report #${f.fault.carried_to_report_id}: ${f.item}`, tone: "warn" });
    for (const rm of f.reminders) push(t, rm.sent_at, { title: `Reminder sent: ${f.item}`, who: txt(rm.sent_by_name, ""), tone: "muted" });
    const rp = f.repair;
    if (rp) {
      push(t, rp.created_date, { title: `Repair planned: ${f.item}`, detail: [rp.assigned_technician ? `technician ${rp.assigned_technician}` : "", `parts ${txt(rp.parts_status)}`].filter(Boolean).join(" · "), tone: "info" });
      push(t, rp.limitations_informed_date, { title: `Crew informed of limitations: ${f.item}`, who: txt(rp.limitations_informed_by, ""), detail: txt(rp.limitations_note, ""), tone: "muted" });
      push(t, rp.repair_date, { title: `Repaired: ${f.item}`, tone: "ok" });
      push(t, rp.verified_date, { title: `Repair verified: ${f.item}`, who: txt(rp.verified_by, ""), detail: `${rp.function_test_passed == null ? "" : Number(rp.function_test_passed) ? "function test passed · " : "function test failed · "}tag ${txt(rp.tag_status)}`, tone: Number(rp.function_test_passed) === 0 ? "bad" : "ok" });
    }
  }
  for (const h of st.where("asset_tag_history", "report_id", id)) {
    push(t, h.changed_at, { title: `Unit tag ${txt(h.previous_tag_status, "?")} → ${txt(h.tag_status)}`, who: txt(h.changed_by, ""), detail: txt(h.reason, ""), tone: h.tag_status === "Red" ? "bad" : h.tag_status === "Yellow" ? "warn" : "ok" });
  }
  void checklist;
  return t.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------- unit

export interface UnitView { asset: Row; assetType?: Row; triggers: Row[]; tags: Row[]; mocs: Row[]; reports: Row[]; timeline: TimelineEvent[] }

export function unitView(st: RecordStore, id: unknown): UnitView | null {
  const asset = st.byId("assets", id);
  if (!asset) return null;
  const tags = st.where("asset_tag_history", "asset_id", id).sort((a, b) => (toMs(b.changed_at) ?? 0) - (toMs(a.changed_at) ?? 0));
  const reports = st.where("mri_reports", "asset_id", id).sort((a, b) => Number(b.id) - Number(a.id));
  const timeline: TimelineEvent[] = [];
  for (const h of tags) push(timeline, h.changed_at, { title: `Tag ${txt(h.previous_tag_status, "?")} → ${txt(h.tag_status)}${h.report_id ? ` (report #${h.report_id})` : ""}`, who: txt(h.changed_by, ""), detail: txt(h.reason, ""), tone: h.tag_status === "Red" ? "bad" : h.tag_status === "Yellow" ? "warn" : "ok" });
  for (const r of reports) {
    push(timeline, r.created_date, { title: `Report #${r.id} created`, tone: "muted" });
    push(timeline, r.submitted_date, { title: `Report #${r.id} submitted`, who: txt(r.submitted_by, ""), tone: "info" });
    push(timeline, r.approved_date, { title: `Report #${r.id} ${r.status === "Closed" ? "closed" : "approved"}`, who: txt(r.approved_by, ""), tone: "ok" });
  }
  const mocs = st.where("asset_moc_exemptions", "asset_id", id);
  for (const m of mocs) {
    push(timeline, m.created_at, { title: `MOC exemption ${txt(m.moc_reference)} recorded`, who: txt(m.created_by, ""), detail: `valid ${fmtDate(m.valid_from, false)} to ${fmtDate(m.valid_until, false)}`, tone: "warn" });
    push(timeline, m.revoked_at, { title: `MOC exemption ${txt(m.moc_reference)} revoked`, who: txt(m.revoked_by, ""), detail: txt(m.revoke_reason, ""), tone: "muted" });
  }
  return {
    asset, assetType: st.byId("asset_types", asset.asset_type_id),
    triggers: st.where("maintenance_triggers", "asset_id", id).sort((a, b) => String(a.mr_level).localeCompare(String(b.mr_level)) || String(a.trigger_type).localeCompare(String(b.trigger_type))),
    tags, mocs, reports, timeline: timeline.sort((a, b) => b.at - a.at),
  };
}

/** A counter's state in plain words. */
export function triggerState(tr: Row): { text: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (!Number(tr.enabled)) return { text: "Off", tone: "muted" };
  const run = Number(tr.running_value ?? 0), int = Number(tr.interval_value ?? 0), warn = Number(tr.warning_value ?? 0);
  if (run < 0) return { text: "Below zero", tone: "bad" };
  if (int > 0 && run >= int) return { text: "Due now", tone: "bad" };
  // Same rule as the Dashboard: warning_value is the running value at which the counter turns amber.
  if (warn > 0 && run >= warn) return { text: "Due soon", tone: "warn" };
  return { text: "On track", tone: "ok" };
}
