import { useMemo, useState, type ReactNode } from "react";
import {
  fmtDate, reportView, triggerState, txt, unitView,
  type FaultView, type FieldValue, type RecordStore, type Row, type TimelineEvent,
} from "./recordStore";

// Record inspector tab of the Support viewer (checklist item 28). Read only.
// Shows one MR-I report, unit or fault from the bundle's report.json and/or backup.json, with
// readable labels, a timeline of what happened, and links between records. "All records" lists
// any table, so new tables (MR-II, MR-III) can be read before they get their own view.
// Uses the Support viewer's styles (sv-*), so it matches the other tabs in every theme.

type Kind = "report" | "unit" | "fault" | "table";

function Fact({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={`sv-fact${tone ? ` is-${tone}` : ""}`}>
      <span className="sv-label">{label}</span>
      <b>{value}</b>
      {sub != null && sub !== "" && <span className="sv-soft">{sub}</span>}
    </div>
  );
}
function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="ri-section">
      <div className="sv-label">{title}{count != null ? ` · ${count}` : ""}</div>
      {children}
    </section>
  );
}
const tagTone = (t: unknown) => (t === "Red" ? "bad" : t === "Yellow" ? "warn" : t === "Green" ? "ok" : undefined);
const statusTone = (s: unknown) => (s === "Closed" ? "ok" : s === "Draft" ? "muted" : s === "Escalated" || s === "Rejected" ? "bad" : "info");
const decisionTone = (d: unknown) => (/approved|confirmed/i.test(String(d)) ? "ok" : /reject/i.test(String(d)) ? "bad" : /pending/i.test(String(d)) ? "warn" : "muted");

function Timeline({ events, newestFirst = false }: { events: TimelineEvent[]; newestFirst?: boolean }) {
  if (!events.length) return <p className="sv-soft">Nothing with a date was recorded.</p>;
  const list = newestFirst ? events : events;
  return (
    <ul className="sv-events ri-timeline">
      {list.map((e, i) => (
        <li key={i} className={`is-${e.tone}`}>
          <i aria-hidden="true" />
          <div className="sv-ev-main">
            <b>{e.title}</b>
            {(e.who || e.detail) && <span className="sv-soft">{[e.who, e.detail].filter(Boolean).join(" · ")}</span>}
          </div>
          <span className="sv-ev-side">{fmtDate(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}

function Fields({ list }: { list: FieldValue[] }) {
  if (!list.length) return <p className="sv-soft">Nothing saved.</p>;
  return (
    <dl className="sv-rows">
      {list.map((f, i) => (
        <div key={i}><dt>{f.label}</dt><dd>{f.value}{f.by ? <small className="ri-by"> · {f.by}{f.at ? `, ${fmtDate(f.at)}` : ""}</small> : null}</dd></div>
      ))}
    </dl>
  );
}

function FaultCard({ f, highlight, onOpenReport }: { f: FaultView; highlight?: boolean; onOpenReport?: (id: number) => void }) {
  const x = f.fault;
  const rp = f.repair;
  return (
    <div className={`ri-fault${highlight ? " is-hl" : ""}`}>
      <div className="ri-fault-head">
        <div className="sv-ev-main">
          <b>{f.item}</b>
          <span className="sv-soft">Fault #{txt(x.id)} on report #{txt(x.report_id)} · reported {txt(x.original_severity)}{x.new_severity && x.new_severity !== x.original_severity ? ` → now ${x.new_severity}` : ""}</span>
        </div>
        <span className={`sv-chip is-${decisionTone(x.decision)}`}>{txt(x.decision)}</span>
      </div>
      <dl className="sv-rows">
        <div><dt>Decided by</dt><dd>{txt(x.reviewer)}{x.review_method ? ` · ${x.review_method}` : ""}{x.recorded_by && x.recorded_by !== x.reviewer ? ` · recorded by ${x.recorded_by}` : ""}</dd></div>
        {x.provisional_status ? <div><dt>Phone decision</dt><dd>{txt(x.provisional_status)}{x.confirmed_by ? ` · confirmed by ${x.confirmed_by}, ${fmtDate(x.confirmed_date)}` : ""}</dd></div> : null}
        {x.acknowledged_by ? <div><dt>Acknowledged</dt><dd>{txt(x.acknowledged_by)}, {fmtDate(x.acknowledged_date)}</dd></div> : null}
        {x.carried_to_report_id ? <div><dt>Carried forward</dt><dd>to report #{txt(x.carried_to_report_id)}{onOpenReport ? <button type="button" className="ri-link" onClick={() => onOpenReport(Number(x.carried_to_report_id))}>Open</button> : null}</dd></div> : null}
        {x.notes ? <div><dt>Notes</dt><dd>{txt(x.notes)}</dd></div> : null}
        {rp ? <div><dt>Repair</dt><dd>
          {txt(rp.parts_status)} parts{rp.assigned_technician ? ` · ${rp.assigned_technician}` : ""}{rp.repair_date ? ` · repaired ${fmtDate(rp.repair_date, false)}` : ""}
          {rp.verified_by ? ` · verified by ${rp.verified_by}${rp.function_test_passed != null ? (Number(rp.function_test_passed) ? " (function test passed)" : " (function test failed)") : ""}` : ""} · tag {txt(rp.tag_status)}
        </dd></div> : null}
        {f.reminders.length ? <div><dt>Reminders</dt><dd>{f.reminders.length} sent, last by {txt(f.reminders[f.reminders.length - 1].sent_by_name)}</dd></div> : null}
      </dl>
      {f.decisions.length > 0 && (
        <ol className="sv-steps">
          {f.decisions.map((d, i) => (
            <li key={i}><span>{fmtDate(d.logged_at)}</span>{txt(d.action)}{d.to_severity && d.to_severity !== d.from_severity ? ` (${d.from_severity} → ${d.to_severity})` : ""} by {txt(d.reviewer)}{Number(d.is_provisional) ? " · provisional" : ""}<small>{txt(d.review_method, "")}</small></li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- main

export default function RecordInspector({ store, loading, problem }: { store: RecordStore | null; loading: boolean; problem?: string }) {
  const [kind, setKind] = useState<Kind>("report");
  const [pick, setPick] = useState<Record<Kind, string>>({ report: "", unit: "", fault: "", table: "" });
  const setId = (k: Kind, v: string) => setPick((p) => ({ ...p, [k]: v }));
  const openReport = (id: number) => { setKind("report"); setId("report", String(id)); };
  const openUnit = (id: unknown) => { setKind("unit"); setId("unit", String(id)); };

  if (loading) return <p className="sv-soft sv-empty-line">Reading the report and data in the bundle…</p>;
  if (problem) return <div className="toast err sv-toast">{problem}</div>;
  if (!store || (!store.hasReport && !store.hasBackup)) {
    return <p className="sv-soft sv-empty-line">This bundle has no report and no full copy of data. Ask the user to send it again from the report screen with "Include the report I am on" ticked, or with "Include a full copy of my MMS data" if IT needs more.</p>;
  }

  const reports = store.rows("mri_reports").slice().sort((a, b) => Number(b.id) - Number(a.id));
  const units = store.rows("assets").slice().sort((a, b) => String(a.asset_code).localeCompare(String(b.asset_code)));
  const faults = [...store.rows("mri_fault_approvals"), ...store.rows("mri_fault_approvals_carried_in")]
    .filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i).sort((a, b) => Number(b.id) - Number(a.id));
  const tables = store.tableNames();
  const unitCode = (id: unknown) => txt(store.byId("assets", id)?.asset_code, `unit ${txt(id)}`);

  const reportId = pick.report || String(store.reportId ?? reports[0]?.id ?? "");
  const unitId = pick.unit || String(units[0]?.id ?? "");
  const faultId = pick.fault || String(faults[0]?.id ?? "");
  const tableName = pick.table || (tables.includes("mri_reports") ? "mri_reports" : tables[0] ?? "");

  const source = store.hasBackup && store.hasReport ? `the report the user was on (#${store.reportId}) and the full copy of their data`
    : store.hasBackup ? "the full copy of the user's data" : `the report the user was on (#${store.reportId})`;

  return (
    <div className="sv-tab">
      <div className="sv-tab-head">
        <div>
          <div className="sv-title">Record inspector</div>
          <div className="sv-soft">One report, unit or fault exactly as it is stored on the user's laptop, with what happened to it and when. From {source}.{!store.hasBackup ? " Other records need the full copy of data." : ""}</div>
        </div>
      </div>
      <div className="sv-filters">
        <label className="sv-field"><span className="sv-label">Show</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="report">MR-I report</option>
            <option value="unit" disabled={!units.length}>Unit</option>
            <option value="fault" disabled={!faults.length}>Fault</option>
            <option value="table" disabled={!store.hasBackup}>All records by table{store.hasBackup ? "" : " (needs the full copy)"}</option>
          </select></label>
        {kind === "report" && (
          <label className="sv-field"><span className="sv-label">Report</span>
            <select value={reportId} onChange={(e) => setId("report", e.target.value)}>
              {reports.map((r) => <option key={String(r.id)} value={String(r.id)}>#{txt(r.id)} · {unitCode(r.asset_id)} · {txt(r.status)}{r.id == store.reportId ? " · the report the user was on" : ""}</option>)}
            </select></label>
        )}
        {kind === "unit" && (
          <label className="sv-field"><span className="sv-label">Unit</span>
            <select value={unitId} onChange={(e) => setId("unit", e.target.value)}>
              {units.map((u) => <option key={String(u.id)} value={String(u.id)}>{txt(u.asset_code)} · {txt(u.asset_description, "")}</option>)}
            </select></label>
        )}
        {kind === "fault" && (
          <label className="sv-field"><span className="sv-label">Fault</span>
            <select value={faultId} onChange={(e) => setId("fault", e.target.value)}>
              {faults.map((f) => <option key={String(f.id)} value={String(f.id)}>#{txt(f.id)} · report #{txt(f.report_id)} · {txt(f.original_severity)} · {txt(f.decision)}</option>)}
            </select></label>
        )}
        {kind === "table" && (
          <label className="sv-field"><span className="sv-label">Table</span>
            <select value={tableName} onChange={(e) => setId("table", e.target.value)}>
              {tables.map((t) => <option key={t} value={t}>{t} ({store.rows(t).length})</option>)}
            </select></label>
        )}
      </div>

      {kind === "report" && <ReportPanel store={store} id={Number(reportId)} onOpenReport={openReport} onOpenUnit={openUnit} />}
      {kind === "unit" && <UnitPanel store={store} id={unitId} onOpenReport={openReport} />}
      {kind === "fault" && <FaultPanel store={store} id={faultId} onOpenReport={openReport} />}
      {kind === "table" && <TablePanel store={store} table={tableName} />}
    </div>
  );
}

// ---------------------------------------------------------------- report

function ReportPanel({ store, id, onOpenReport, onOpenUnit, highlightFault }: { store: RecordStore; id: number; onOpenReport: (id: number) => void; onOpenUnit: (id: unknown) => void; highlightFault?: unknown }) {
  const v = useMemo(() => reportView(store, id), [store, id]);
  const [allItems, setAllItems] = useState(false);
  if (!v) return <p className="sv-soft sv-empty-line">Report #{id} is not in this bundle.</p>;
  const r = v.report;
  const fails = v.checklist.filter((c) => c.status === "Fail");
  const shownItems = allItems ? v.checklist : fails;
  return (
    <div className="sv-tab">
      {v.labelsMissing && <p className="sv-soft ri-note">This bundle was made by an older MMS, so some fields and checklist items show numbers instead of names.</p>}
      <div className="sv-facts">
        <Fact label={`Report #${txt(r.id)}`} value={<span className={`sv-chip is-${statusTone(r.status)}`}>{txt(r.status)}</span>} sub={`Created ${fmtDate(r.created_date)}`} />
        <Fact label="Unit" value={v.asset ? <button type="button" className="ri-link ri-link-strong" onClick={() => onOpenUnit(r.asset_id)}>{txt(v.asset.asset_code)}</button> : `Unit ${txt(r.asset_id)}`}
          sub={[txt(v.asset?.asset_description, ""), v.asset?.tag_status ? `tag ${v.asset.tag_status}` : ""].filter(Boolean).join(" · ")} tone={tagTone(v.asset?.tag_status)} />
        <Fact label="Template" value={txt(v.template?.template_name, `Template ${txt(r.template_id)}`)} sub={[txt(v.assetType?.name ?? v.assetType?.type_name, ""), v.component ? `component ${v.component}` : ""].filter(Boolean).join(" · ")} />
        <Fact label="Faults" value={v.faults.length} sub={fails.length ? `${fails.length} failed checklist item${fails.length === 1 ? "" : "s"}` : "No failed items"} tone={v.faults.some((f) => /pending/i.test(String(f.fault.decision))) ? "warn" : undefined} />
      </div>
      <dl className="sv-rows">
        <div><dt>Submitted</dt><dd>{r.submitted_by ? `${r.submitted_by}, ${fmtDate(r.submitted_date)}` : "Not yet"}</dd></div>
        <div><dt>Endorsed / approved / closed</dt><dd>{r.approved_by ? `${r.approved_by}, ${fmtDate(r.approved_date)}` : "Not yet"}</dd></div>
        {r.mr_cost != null && <div><dt>MR cost</dt><dd>{txt(r.mr_cost)}{r.mr_cost_by ? ` · ${r.mr_cost_by}, ${fmtDate(r.mr_cost_date)}` : ""}</dd></div>}
        {r.job_number_status ? <div><dt>Job number check</dt><dd>{txt(r.job_number_status)}{r.job_number_checked_at ? `, ${fmtDate(r.job_number_checked_at)}` : ""}</dd></div> : null}
      </dl>

      <Section title="What happened, in order" count={v.timeline.length}><Timeline events={v.timeline} /></Section>

      {(v.faults.length > 0 || v.carriedIn.length > 0) && (
        <Section title="Faults and decisions" count={v.faults.length + v.carriedIn.length}>
          <div className="ri-faults">
            {v.faults.map((f) => <FaultCard key={String(f.id)} f={f} highlight={highlightFault != null && f.id == highlightFault} onOpenReport={onOpenReport} />)}
            {v.carriedIn.map((f) => (
              <div key={`c${String(f.id)}`} className="ri-carried">
                <span className="sv-soft">Carried forward into this report from report #{txt(f.fault.report_id)} <button type="button" className="ri-link" onClick={() => onOpenReport(Number(f.fault.report_id))}>Open</button></span>
                <FaultCard f={f} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={allItems ? "Checklist answers" : "Failed checklist items"} count={shownItems.length}>
        {shownItems.length === 0 ? <p className="sv-soft">{allItems ? "No answers saved." : "No item failed."}</p> : (
          <div className="ri-scroll">
            <table className="sv-table">
              <thead><tr><th>Item</th><th>Section</th><th>Answer</th><th>Severity</th><th>Details</th><th>Closure</th></tr></thead>
              <tbody>
                {shownItems.map((c, i) => (
                  <tr key={i} className={c.status === "Fail" && !c.repairedOnSite ? "is-bad" : ""}>
                    <td>{c.item}</td><td>{c.section || "—"}</td>
                    <td>{c.status}{c.repairedOnSite ? " · repaired on site" : ""}</td><td>{c.severity || "—"}</td>
                    <td>{[c.details, c.action ? `Action: ${c.action}` : ""].filter(Boolean).join(" · ") || "—"}</td><td>{c.closure || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {v.checklist.length > fails.length && (
          <button type="button" className="ri-link" onClick={() => setAllItems((x) => !x)}>{allItems ? "Show failed items only" : `Show all ${v.checklist.length} answers`}</button>
        )}
      </Section>

      <div className="ri-cols">
        <Section title="Header"><Fields list={v.header} /></Section>
        <div className="ri-col">
          <Section title="Distance Travelled"><Fields list={v.mid} /></Section>
          <Section title="Footer"><Fields list={v.footer} /></Section>
        </div>
      </div>

      {v.sameUnit.length > 0 && (
        <Section title={`Other reports on ${txt(v.asset?.asset_code, "this unit")}`} count={v.sameUnit.length}>
          <ul className="sv-events">
            {v.sameUnit.map((o) => (
              <li key={String(o.id)} className={`is-${statusTone(o.status) === "muted" ? "muted" : statusTone(o.status)}`}>
                <i aria-hidden="true" />
                <div className="sv-ev-main"><b>Report #{txt(o.id)} · {txt(o.status)}</b><span className="sv-soft">Created {fmtDate(o.created_date)}{o.submitted_by ? ` · submitted by ${o.submitted_by}` : ""}{o.approved_by ? ` · approved by ${o.approved_by}` : ""}</span></div>
                <span className="sv-ev-side">{store.byId("mri_reports", o.id) ? <button type="button" className="ri-link" onClick={() => onOpenReport(Number(o.id))}>Open</button> : <small>Not in this bundle</small>}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- unit

function UnitPanel({ store, id, onOpenReport }: { store: RecordStore; id: string; onOpenReport: (id: number) => void }) {
  const v = useMemo(() => unitView(store, id), [store, id]);
  if (!v) return <p className="sv-soft sv-empty-line">This unit is not in the bundle.</p>;
  const a = v.asset;
  const activeMoc = v.mocs.find((m) => m.status === "Active");
  return (
    <div className="sv-tab">
      {!store.hasBackup && <p className="sv-soft ri-note">Only what came with report #{store.reportId} is shown. Other reports and changes on this unit need the full copy of data.</p>}
      <div className="sv-facts">
        <Fact label="Unit" value={txt(a.asset_code)} sub={txt(a.asset_description, "")} />
        <Fact label="Tag" value={txt(a.tag_status, "Not set")} sub={txt(a.tag_reason, "")} tone={tagTone(a.tag_status)} />
        <Fact label="Type" value={txt(v.assetType?.name ?? v.assetType?.type_name, `Type ${txt(a.asset_type_id)}`)} sub={[txt(a.country, ""), txt(a.service_line, "")].filter(Boolean).join(" · ")} />
        <Fact label="MOC exemption" value={activeMoc ? txt(activeMoc.moc_reference) : "None active"} sub={activeMoc ? `until ${fmtDate(activeMoc.valid_until, false)}` : `${v.mocs.length} on record`} tone={activeMoc ? "warn" : undefined} />
      </div>
      <dl className="sv-rows">
        <div><dt>Client</dt><dd>{txt(a.client)}</dd></div>
        <div><dt>Last action</dt><dd>{txt(a.mr_last_action)}{a.last_action_by ? ` · ${a.last_action_by}` : ""}{a.last_action_dt ? `, ${fmtDate(a.last_action_dt)}` : ""}</dd></div>
        <div><dt>Active</dt><dd>{Number(a.active ?? 1) ? "Yes" : "No"}</dd></div>
      </dl>
      <Section title="Maintenance counters" count={v.triggers.length}>
        {!v.triggers.length ? <p className="sv-soft">No counters in the bundle.</p> : (
          <div className="ri-scroll">
            <table className="sv-table">
              <thead><tr><th>Level</th><th>Counter</th><th className="num">Running</th><th className="num">Interval</th><th className="num">Warning at</th><th>State</th><th>Last reset</th></tr></thead>
              <tbody>
                {v.triggers.map((t, i) => {
                  const s = triggerState(t);
                  return (
                    <tr key={i} className={s.tone === "bad" ? "is-bad" : ""}>
                      <td>{txt(t.mr_level)}</td><td>{txt(t.trigger_type)}</td>
                      <td className="num">{txt(t.running_value)}</td><td className="num">{txt(t.interval_value)}</td><td className="num">{Number(t.warning_value) ? txt(t.warning_value) : "—"}</td>
                      <td><span className={`sv-chip is-${s.tone}`}>{s.text}</span></td><td>{t.last_reset_date ? fmtDate(t.last_reset_date, false) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title="Tag changes, reports and exemptions" count={v.timeline.length}><Timeline events={v.timeline} newestFirst /></Section>
      <Section title="Reports on this unit" count={v.reports.length}>
        {!v.reports.length ? <p className="sv-soft">None in the bundle.</p> : (
          <ul className="sv-events">
            {v.reports.map((o) => (
              <li key={String(o.id)} className={`is-${statusTone(o.status)}`}>
                <i aria-hidden="true" />
                <div className="sv-ev-main"><b>Report #{txt(o.id)} · {txt(o.status)}</b><span className="sv-soft">Created {fmtDate(o.created_date)}{o.submitted_by ? ` · submitted by ${o.submitted_by}` : ""}</span></div>
                <span className="sv-ev-side"><button type="button" className="ri-link" onClick={() => onOpenReport(Number(o.id))}>Open</button></span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- fault

function FaultPanel({ store, id, onOpenReport }: { store: RecordStore; id: string; onOpenReport: (id: number) => void }) {
  const f = [...store.rows("mri_fault_approvals"), ...store.rows("mri_fault_approvals_carried_in")].find((x) => String(x.id) === id);
  const view = useMemo(() => (f ? reportView(store, Number(f.report_id)) : null), [store, f]);
  if (!f) return <p className="sv-soft sv-empty-line">This fault is not in the bundle.</p>;
  const fv = view?.faults.find((x) => x.id == f.id);
  const events = view ? view.timeline.filter((e) => fv && e.title.endsWith(fv.item)) : [];
  return (
    <div className="sv-tab">
      {fv ? <FaultCard f={fv} highlight onOpenReport={onOpenReport} /> : <p className="sv-soft">Report #{txt(f.report_id)} is not in this bundle, so only the fault record is shown.</p>}
      {events.length > 0 && <Section title="What happened to this fault" count={events.length}><Timeline events={events} /></Section>}
      {view && <button type="button" className="ri-link" onClick={() => onOpenReport(Number(f.report_id))}>Open report #{txt(f.report_id)}</button>}
      {!fv && (
        <dl className="sv-rows">{Object.entries(f).map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{txt(val)}</dd></div>)}</dl>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- all records

function TablePanel({ store, table }: { store: RecordStore; table: string }) {
  const [q, setQ] = useState("");
  const rows: Row[] = store.rows(table);
  const cols = useMemo(() => [...new Set(rows.flatMap((r) => Object.keys(r)))], [rows]);
  const filtered = q.trim() ? rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q.trim().toLowerCase()))) : rows;
  const shown = filtered.slice(0, 200);
  return (
    <div className="sv-tab">
      <div className="sv-filters">
        <label className="sv-field ri-search"><span className="sv-label">Search in {table}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Any value, e.g. a unit code or name" /></label>
        <span className="sv-soft">{filtered.length.toLocaleString()} of {rows.length.toLocaleString()} rows{filtered.length > shown.length ? ` · showing the first ${shown.length}` : ""}</span>
      </div>
      {!rows.length ? <p className="sv-soft">This table is empty.</p> : (
        <div className="ri-scroll ri-scroll-tall">
          <table className="sv-table ri-wide">
            <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>{cols.map((c) => {
                  const v = r[c];
                  const isDate = /(_date|_at|_dt)$/.test(c) && v != null && /^\d{9,11}$/.test(String(v));
                  return <td key={c} title={isDate ? String(v) : undefined}>{isDate ? fmtDate(v) : txt(v, "")}</td>;
                })}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const RI_CSS = `
.ri-section { display: grid; gap: 8px; }
.ri-note { padding: 8px 12px; border-radius: var(--radius, 10px); background: color-mix(in srgb, var(--warn) 10%, transparent); color: var(--text); }
.ri-timeline .sv-ev-side { font-size: 12px; white-space: nowrap; }
.ri-by { color: var(--text-soft); font-size: 12px; }
.ri-faults { display: grid; gap: 10px; }
.ri-fault { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius, 10px); background: color-mix(in srgb, var(--text) 2%, transparent); }
.ri-fault.is-hl { border-color: var(--accent-blue); box-shadow: 0 0 0 1px var(--accent-blue) inset; }
.ri-fault-head { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; }
.ri-fault .sv-rows > div { grid-template-columns: 140px minmax(0, 1fr); padding: 5px 2px; font-size: 13px; }
.ri-carried { display: grid; gap: 6px; }
.ri-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px 24px; align-items: start; }
.ri-col { display: grid; gap: 14px; }
.ri-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius, 10px); }
.ri-scroll .sv-table th, .ri-scroll .sv-table td { padding: 7px 10px; }
.ri-scroll .sv-table tr:last-child td { border-bottom: 0; }
.ri-scroll-tall { max-height: 560px; overflow: auto; }
.ri-wide td, .ri-wide th { white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
.ri-search { flex: 1 1 280px; }
.ri-search input { font-family: var(--sans); font-size: 13px; width: 100%; box-sizing: border-box; }
.sv button.ri-link { justify-self: start; display: inline; padding: 0 0 0 8px !important; margin: 0; border: 0 !important; box-shadow: none !important; background: transparent !important;
  font: 600 13px var(--sans) !important; color: var(--accent-blue) !important; cursor: pointer; min-height: 0 !important; }
.sv button.ri-link:hover { text-decoration: underline; }
.sv button.ri-link.ri-link-strong { padding: 0 !important; font-size: 14px !important; }
.sv-chip.is-info { color: var(--accent-blue); background: color-mix(in srgb, var(--accent-blue) 12%, transparent); }
`;
