// MR-I Test Matrix Rev 6.8 -- Phase 1 backend rule tests (test-only file).
//
// Replays the matrix cases S2..J9 IN ORDER through the app's own #[tauri::command]
// functions (lib.rs is compiled into this test with include!, so no app code is changed),
// on a private copy of the clean starting database:
//     <repo>/e2e/run/assets.start.db  ->  <repo>/e2e/run/rust/assets.db
// The real src-tauri/assets.db is never opened; its size and modified time are checked
// before and after.
//
// Each case is one function named after its matrix id. Checks are soft: a failed check is
// recorded and the run continues, so one problem does not hide the rest. Calls that would
// change state if the backend wrongly accepted them ("probes") run inside a SAVEPOINT that
// is always rolled back.
//
// Results: <repo>/e2e/results/phase1_backend.json and phase1_backend.md
// Run:     cargo test --test mri_matrix_backend -- --ignored --nocapture
#![allow(dead_code, unused_imports, unused_variables, unused_mut, unused_must_use)]
include!("../src/lib.rs");

use std::collections::BTreeMap;
use std::panic::AssertUnwindSafe;
use std::path::PathBuf;

// ---------------------------------------------------------------- recording

#[derive(Serialize)]
struct MxCheck {
    label: String,
    outcome: String, // "ok" | "FAIL" | "info"
    detail: String,
}

#[derive(Serialize)]
struct MxCase {
    id: String,
    title: String,
    status: String,
    checks: Vec<MxCheck>,
    error: Option<String>,
}

struct T {
    cases: Vec<MxCase>,
    r: BTreeMap<&'static str, i64>,
    users: BTreeMap<String, i64>,
    today: String,
    yesterday: String,
    two_days_ago: String,
    plus7: String,
    asset1: i64,
    asset2: i64,
    ctu: i64,
    pump: i64,
    left: i64,
    right: i64,
}

impl T {
    fn cur(&mut self) -> &mut MxCase {
        self.cases.last_mut().unwrap()
    }
    fn push(&mut self, label: &str, outcome: &str, detail: String) {
        println!("    [{}] {} {}", outcome, label, if detail.is_empty() { String::new() } else { format!("-- {}", detail) });
        self.cur().checks.push(MxCheck { label: label.to_string(), outcome: outcome.to_string(), detail });
    }
    fn ok(&mut self, label: &str, cond: bool, detail: impl Into<String>) -> bool {
        self.push(label, if cond { "ok" } else { "FAIL" }, detail.into());
        cond
    }
    fn info(&mut self, label: &str, detail: impl Into<String>) {
        self.push(label, "info", detail.into());
    }
    /// The matrix step itself is wrong or unclear (not an app verdict).
    fn matrix(&mut self, label: &str, detail: impl Into<String>) {
        self.push(label, "MATRIX", detail.into());
    }
    fn eq<A: std::fmt::Debug + PartialEq>(&mut self, label: &str, got: A, want: A) -> bool {
        let d = format!("got {:?}, expected {:?}", got, want);
        self.ok(label, got == want, d)
    }
    fn refused<X: std::fmt::Debug>(&mut self, label: &str, res: Result<X, String>, needle: &str) -> bool {
        match res {
            Err(e) => {
                let hit = e.to_lowercase().contains(&needle.to_lowercase());
                let d = format!("refused: \"{}\"", e);
                self.ok(label, hit, d)
            }
            Ok(v) => self.ok(label, false, format!("NOT refused (returned {:?})", v)),
        }
    }
    fn accepted<X: std::fmt::Debug>(&mut self, label: &str, res: Result<X, String>) -> Option<X> {
        match res {
            Ok(v) => {
                self.ok(label, true, format!("{:?}", v));
                Some(v)
            }
            Err(e) => {
                self.ok(label, false, format!("refused: \"{}\"", e));
                None
            }
        }
    }
    fn rid(&self, k: &str) -> i64 {
        *self.r.get(k).unwrap_or_else(|| panic!("report '{}' was not created by an earlier case", k))
    }
    fn u(&self, name: &str) -> i64 {
        *self.users.get(name).unwrap_or_else(|| panic!("user '{}' not found", name))
    }
}

// ---------------------------------------------------------------- database helpers
// Each helper takes the shared connection only for the duration of one statement and never
// panics while holding it (a panic there would poison the app's connection mutex).

type P<'a> = &'a [&'a dyn rusqlite::ToSql];

fn qi(sql: &str, p: P) -> Option<i64> {
    let c = get_connection().ok()?;
    c.query_row(sql, p, |r| r.get::<_, Option<i64>>(0)).ok().flatten()
}
fn qs(sql: &str, p: P) -> Option<String> {
    let c = get_connection().ok()?;
    c.query_row(sql, p, |r| r.get::<_, Option<String>>(0)).ok().flatten()
}
fn qrows(sql: &str, p: P) -> Vec<Vec<String>> {
    let Ok(c) = get_connection() else { return vec![] };
    let Ok(mut st) = c.prepare(sql) else { return vec![] };
    let n = st.column_count();
    let rows = st.query_map(p, |r| {
        Ok((0..n)
            .map(|i| match r.get_ref(i) {
                Ok(rusqlite::types::ValueRef::Null) => "NULL".to_string(),
                Ok(rusqlite::types::ValueRef::Integer(v)) => v.to_string(),
                Ok(rusqlite::types::ValueRef::Real(v)) => v.to_string(),
                Ok(rusqlite::types::ValueRef::Text(t)) => String::from_utf8_lossy(t).to_string(),
                _ => "?".to_string(),
            })
            .collect::<Vec<_>>())
    });
    match rows {
        Ok(it) => it.filter_map(|x| x.ok()).collect(),
        Err(_) => vec![],
    }
}
fn ex(sql: &str, p: P) -> Result<usize, String> {
    let c = get_connection()?;
    c.execute(sql, p).map_err(|e| e.to_string())
}
/// Runs `f` inside a savepoint that is always rolled back, so a wrongly accepted call
/// cannot change the state later cases depend on.
fn probe<R>(f: impl FnOnce() -> R) -> R {
    {
        let c = get_connection().unwrap();
        let _ = c.execute_batch("SAVEPOINT mx_probe");
    }
    let out = f();
    {
        let c = get_connection().unwrap();
        let _ = c.execute_batch("ROLLBACK TO mx_probe; RELEASE mx_probe");
    }
    out
}

fn status_of(rid: i64) -> String {
    qs("SELECT status FROM mri_reports WHERE id = ?1", &[&rid]).unwrap_or_default()
}
fn tag(asset: i64) -> Option<String> {
    qs("SELECT tag_status FROM assets WHERE id = ?1", &[&asset])
}
fn tag_reason(asset: i64) -> String {
    qs("SELECT tag_reason FROM assets WHERE id = ?1", &[&asset]).unwrap_or_default()
}
fn tag_hist_count(asset: i64) -> i64 {
    qi("SELECT COUNT(*) FROM asset_tag_history WHERE asset_id = ?1", &[&asset]).unwrap_or(-1)
}
fn trig(asset: i64, level: &str, ty: &str) -> i64 {
    qi(
        "SELECT running_value FROM maintenance_triggers WHERE asset_id = ?1 AND mr_level = ?2 AND trigger_type = ?3",
        &[&asset, &level, &ty],
    )
    .unwrap_or(-1)
}
fn hf(tpl: i64, label: &str) -> i64 {
    qi(
        "SELECT thf.id FROM template_header_fields thf JOIN header_field_catalog c ON c.id = thf.header_field_id
         WHERE thf.template_id = ?1 AND LOWER(TRIM(c.label)) = LOWER(TRIM(?2))",
        &[&tpl, &label],
    )
    .unwrap_or_else(|| panic!("header field '{}' not on template {}", label, tpl))
}
fn has_hf(tpl: i64, label: &str) -> bool {
    qi(
        "SELECT COUNT(*) FROM template_header_fields thf JOIN header_field_catalog c ON c.id = thf.header_field_id
         WHERE thf.template_id = ?1 AND LOWER(TRIM(c.label)) = LOWER(TRIM(?2))",
        &[&tpl, &label],
    )
    .unwrap_or(0)
        > 0
}
fn ff(tpl: i64, label: &str) -> i64 {
    qi(
        "SELECT tf.id FROM template_footer_fields tf JOIN footer_field_catalog c ON c.id = tf.footer_field_id
         WHERE tf.template_id = ?1 AND c.label = ?2",
        &[&tpl, &label],
    )
    .unwrap_or_else(|| panic!("footer field '{}' not on template {}", label, tpl))
}
fn mf(tpl: i64, label: &str) -> i64 {
    qi(
        "SELECT tm.id FROM template_mid_fields tm JOIN mid_field_catalog c ON c.id = tm.mid_field_id
         WHERE tm.template_id = ?1 AND c.label = ?2",
        &[&tpl, &label],
    )
    .unwrap_or_else(|| panic!("mid field '{}' not on template {}", label, tpl))
}
/// (template_checklist_item id, checklist_databank id, default severity)
fn item(tpl: i64, name: &str) -> (i64, i64, String) {
    let rows = qrows(
        "SELECT tci.id, tci.checklist_item_id, COALESCE(tci.severity, '') FROM template_checklist_items tci
         JOIN checklist_databank cd ON cd.id = tci.checklist_item_id
         WHERE tci.template_id = ?1 AND LOWER(TRIM(cd.description)) = LOWER(TRIM(?2))",
        &[&tpl, &name],
    );
    let r = rows.first().unwrap_or_else(|| panic!("checklist item '{}' not on template {}", name, tpl));
    (r[0].parse().unwrap(), r[1].parse().unwrap(), r[2].clone())
}
fn hval(rid: i64, tpl: i64, label: &str) -> Option<String> {
    let f = hf(tpl, label);
    qs(
        "SELECT value FROM mri_report_header_values WHERE report_id = ?1 AND template_header_field_id = ?2",
        &[&rid, &f],
    )
}
fn fval(rid: i64, tpl: i64, label: &str) -> Option<String> {
    let f = ff(tpl, label);
    qs(
        "SELECT value FROM mri_report_footer_values WHERE report_id = ?1 AND template_footer_field_id = ?2",
        &[&rid, &f],
    )
}
fn result_row(rid: i64, tci: i64) -> Option<MriReportChecklistResult> {
    get_mri_report_checklist_results(rid).ok()?.into_iter().find(|r| r.template_checklist_item_id == tci)
}
fn approval(rid: i64, tci: i64) -> Option<(i64, String, String, Option<i64>, Option<String>)> {
    let rows = qrows(
        "SELECT id, decision, original_severity, assigned_to_user_id, provisional_status FROM mri_fault_approvals
         WHERE report_id = ?1 AND template_checklist_item_id = ?2",
        &[&rid, &tci],
    );
    rows.first().map(|r| {
        (
            r[0].parse().unwrap(),
            r[1].clone(),
            r[2].clone(),
            r[3].parse().ok(),
            if r[4] == "NULL" { None } else { Some(r[4].clone()) },
        )
    })
}
fn rect(approval_id: i64) -> Option<(i64, String, String, Option<String>)> {
    let rows = qrows(
        "SELECT id, tag_status, parts_status, assigned_technician FROM mri_fault_rectifications WHERE fault_approval_id = ?1",
        &[&approval_id],
    );
    rows.first().map(|r| {
        (r[0].parse().unwrap(), r[1].clone(), r[2].clone(), if r[3] == "NULL" { None } else { Some(r[3].clone()) })
    })
}

// ---------------------------------------------------------------- report helpers (what the wizard does)

fn set_h(rid: i64, tpl: i64, label: &str, value: &str, by: &str) -> Result<String, String> {
    set_mri_report_header_value(rid, hf(tpl, label), value.to_string(), Some(by.to_string()))
}

/// What ReportWizard saves by itself when a report is opened (HeaderEntryStep effects):
/// inherited Country / Service Line / Asset No, MR Initization Date, MR II Due Date,
/// Current Engine Hours defaulted to the previous reading, Maintenance Type = Preventive.
fn open_wizard(t: &T, rid: i64, tpl: i64, asset: i64, by: &str) {
    let a = qrows("SELECT country, service_line, asset_code FROM assets WHERE id = ?1", &[&asset]);
    let a = &a[0];
    for (label, v) in [("Country", &a[0]), ("Service Line", &a[1]), ("Asset No", &a[2])] {
        if has_hf(tpl, label) {
            let _ = set_h(rid, tpl, label, v, by);
        }
    }
    if has_hf(tpl, "MR Initization Date") && hval(rid, tpl, "MR Initization Date").is_none() {
        let _ = set_h(rid, tpl, "MR Initization Date", &t.today, by);
    }
    if has_hf(tpl, "Current Engine Hours") && hval(rid, tpl, "Current Engine Hours").map_or(true, |v| v.is_empty()) {
        let prev = get_previous_engine_hours(asset, rid).ok().flatten().unwrap_or_else(|| "0".to_string());
        let _ = set_h(rid, tpl, "Current Engine Hours", &prev, by);
    }
    if has_hf(tpl, "Maintenance Type") && hval(rid, tpl, "Maintenance Type").is_none() {
        let _ = set_h(rid, tpl, "Maintenance Type", "Preventive", by);
    }
}

/// Operator types Current Engine Hours; the wizard then saves Engine Hours (This Report).
fn type_engine_hours(rid: i64, tpl: i64, asset: i64, current: f64, by: &str) {
    let _ = set_h(rid, tpl, "Current Engine Hours", &format!("{}", current), by);
    let prev: f64 = get_previous_engine_hours(asset, rid).ok().flatten().and_then(|s| s.trim().parse().ok()).unwrap_or(0.0);
    let _ = set_h(rid, tpl, "Engine Hours (This Report)", &format!("{:.1}", current - prev), by);
}

fn cl(rid: i64, tci: i64, status: &str, sev: &str, issue: Option<&str>, action: Option<&str>, date: &str, closure: &str, by: &str, onsite: bool) -> Result<String, String> {
    set_mri_report_checklist_result(MriReportChecklistResult {
        id: 0,
        report_id: rid,
        template_checklist_item_id: tci,
        status: Some(status.to_string()),
        severity: if sev.is_empty() { None } else { Some(sev.to_string()) },
        issue_details: issue.map(|s| s.to_string()),
        action_taken: action.map(|s| s.to_string()),
        date_observed: Some(date.to_string()),
        closure_status: closure.to_string(),
        reported_by: Some(by.to_string()),
        reported_at: None,
        repaired_on_site: onsite,
    })
}

/// Wizard default for every item without a saved row: Pass, or Fail when it is carried
/// forward (get_pending_checklist_item_ids), with the template's default severity.
fn default_items(t: &T, rid: i64, tpl: i64, asset: i64, by: &str) {
    let pending = get_pending_checklist_item_ids(asset, rid).unwrap_or_default();
    let items = qrows(
        "SELECT id, checklist_item_id, COALESCE(severity,'') FROM template_checklist_items WHERE template_id = ?1",
        &[&tpl],
    );
    for it in items {
        let tci: i64 = it[0].parse().unwrap();
        let cid: i64 = it[1].parse().unwrap();
        if result_row(rid, tci).is_some() {
            continue;
        }
        let st = if pending.contains(&cid) { "Fail" } else { "Pass" };
        // Carried-forward Fail keeps the earlier issue text (read-only in the wizard).
        let issue = if st == "Fail" {
            qs(
                "SELECT r.issue_details FROM mri_report_checklist_results r JOIN mri_reports rep ON rep.id = r.report_id
                 JOIN template_checklist_items x ON x.id = r.template_checklist_item_id
                 WHERE rep.asset_id = ?1 AND rep.id != ?2 AND x.checklist_item_id = ?3 AND r.status = 'Fail'
                   AND rep.component_id IS (SELECT component_id FROM mri_reports WHERE id = ?2)
                 ORDER BY rep.id DESC LIMIT 1",
                &[&asset, &rid, &cid],
            )
        } else {
            None
        };
        let _ = cl(rid, tci, st, &it[2], issue.as_deref(), None, &t.today, "Pending", by, false);
    }
}

fn footer(t: &T, rid: i64, tpl: i64, operator: &str, supervisor: &str) {
    for (label, v) in [
        ("Operator", operator.to_string()),
        ("Operator Date", t.today.clone()),
        ("Supervisor", supervisor.to_string()),
        ("Supervisor Date", t.today.clone()),
    ] {
        let _ = set_mri_report_footer_value(rid, ff(tpl, label), v, Some(operator.to_string()));
    }
}

fn new_report(tpl: i64, asset: i64, comp: Option<i64>) -> Result<i64, String> {
    create_mri_report(NewMriReport { template_id: tpl, asset_id: asset, component_id: comp })
}

fn decide(id: i64, decision: &str, new_sev: Option<&str>, reviewer: &str, method: &str, notes: &str, recorded_by: &str, provisional: bool, next: Option<i64>, ack: Option<i64>) -> Result<String, String> {
    set_mri_fault_approval_decision(
        id,
        decision.to_string(),
        new_sev.map(|s| s.to_string()),
        reviewer.to_string(),
        method.to_string(),
        Some(notes.to_string()),
        recorded_by.to_string(),
        provisional,
        next,
        ack,
    )
}

fn rect_update(id: i64, tech: Option<&str>, parts: &str, date: Option<&str>, by: &str) -> Result<String, String> {
    update_mri_fault_rectification(MriFaultRectificationUpdate {
        id,
        assigned_technician: tech.map(|s| s.to_string()),
        parts_status: parts.to_string(),
        repair_date: date.map(|s| s.to_string()),
        updated_by: Some(by.to_string()),
    })
}

fn perms(uid: i64) -> Vec<String> {
    get_effective_permissions(uid).unwrap_or_default()
}

const PNG_1PX: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PDF_TINY: &str = "data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK";

const SUG: &str = "Suganya Rajendran";
const ABD: &str = "Abdulla Qais";
const JAN: &str = "Jan-Albert Victorino";
const DIS: &str = "Disantha Perera";
const KAM: &str = "Kamil Shahzad";
const MAR: &str = "Marilyn Tabay";
const JESS: &str = "Jess Britanico";

// ================================================================ S: setup checks

fn s2_users_and_roles(t: &mut T) {
    let want = [
        (JESS, "Administrator"),
        (MAR, "Data Miner View"),
        (SUG, "Operator"),
        (ABD, "Job Supervisor"),
        (JAN, "Operations Coordinator"),
        (DIS, "Maintenance Supervisor"),
        (KAM, "Maintenance Manager / FSM"),
    ];
    let users = get_app_users().unwrap();
    t.eq("seven users registered", users.len(), 7);
    for (name, role) in want {
        let u = users.iter().find(|u| u.name == name);
        let d = u.map(|u| format!("role {}, active {}", u.role, u.active)).unwrap_or("missing".into());
        t.ok(&format!("{} is an active {}", name, role), u.map_or(false, |u| u.role == role && u.active), d);
    }
    let ov = qi("SELECT COUNT(*) FROM user_permission_overrides", &[]).unwrap_or(-1);
    let ca = qi("SELECT COUNT(*) FROM user_country_access", &[]).unwrap_or(-1);
    t.eq("no permission overrides", ov, 0);
    t.eq("no country restrictions", ca, 0);
}

fn s3_template_fields(t: &mut T) {
    let both = ["Country", "Service Line", "Asset No", "Client", "Location", "Compliance Stage", "Maintenance Type", "Job Number", "Pre-Mobilization Checklist ID"];
    let ctu_extra = ["Job Operating Hours", "Unit Model Capacity"];
    let pump_extra = ["Previous Engine Hours", "Current Engine Hours", "Engine Hours (This Report)", "Job Operating Hours", "MR II Due Date", "MR Initization Date"];
    for (tpl, name, extra) in [(t.ctu, "COILED TUBING UNIT", &ctu_extra[..]), (t.pump, "PUMP UNIT", &pump_extra[..])] {
        let missing: Vec<&str> = both.iter().chain(extra.iter()).copied().filter(|l| !has_hf(tpl, l)).collect();
        t.ok(&format!("{} header fields present", name), missing.is_empty(), format!("missing: {:?}", missing));
        let mids: Vec<String> = qrows("SELECT c.label FROM template_mid_fields tm JOIN mid_field_catalog c ON c.id = tm.mid_field_id WHERE tm.template_id = ?1", &[&tpl]).into_iter().map(|r| r[0].clone()).collect();
        let mid_ok = ["Distance Travelled Pre-Job (KM)", "Distance Travelled Post-Job (KM)"].iter().all(|l| mids.iter().any(|m| m == l));
        t.ok(&format!("{} mid fields present", name), mid_ok, format!("{:?}", mids));
        let foots: Vec<String> = qrows("SELECT c.label FROM template_footer_fields tf JOIN footer_field_catalog c ON c.id = tf.footer_field_id WHERE tf.template_id = ?1", &[&tpl]).into_iter().map(|r| r[0].clone()).collect();
        let want_f = ["Remarks", "Cleaned", "Green Tagged", "Job Ready", "Pressure Tested", "Function Tested", "Operator", "Operator Date", "Supervisor", "Supervisor Date"];
        let miss_f: Vec<&str> = want_f.iter().copied().filter(|l| !foots.iter().any(|f| f == l)).collect();
        t.ok(&format!("{} footer fields present", name), miss_f.is_empty(), format!("missing: {:?}", miss_f));
        let st = qs("SELECT status FROM mri_templates WHERE id = ?1", &[&tpl]).unwrap_or_default();
        t.eq(&format!("{} is Active", name), st.as_str(), "Active");
    }
    let n_ctu = qi("SELECT COUNT(*) FROM template_checklist_items WHERE template_id = ?1", &[&t.ctu]).unwrap_or(-1);
    let n_pump = qi("SELECT COUNT(*) FROM template_checklist_items WHERE template_id = ?1", &[&t.pump]).unwrap_or(-1);
    t.eq("COILED TUBING UNIT has 19 checklist items", n_ctu, 19);
    t.eq("PUMP UNIT has 24 checklist items", n_pump, 24);
    let ctu_type = qs("SELECT at.description FROM mri_templates m JOIN asset_types at ON at.id = m.asset_type_id WHERE m.id = ?1", &[&t.ctu]).unwrap_or_default();
    let pump_type = qs("SELECT at.description FROM mri_templates m JOIN asset_types at ON at.id = m.asset_type_id WHERE m.id = ?1", &[&t.pump]).unwrap_or_default();
    t.eq("COILED TUBING UNIT template asset type", ctu_type.as_str(), "COILED TUBING UNIT");
    t.eq("PUMP UNIT template asset type", pump_type.as_str(), "PUMPING UNIT");
}

fn s4_admin_and_fsm_permissions(t: &mut T) {
    let admin = perms(t.u(JESS));
    let fsm = perms(t.u(KAM));
    t.ok("Administrator holds mri.submit", admin.contains(&"mri.submit".to_string()), "");
    let admin_extra = ["admin.users.manage", "mri_templates.edit", "backups.export", "references.edit", "triggers.edit"];
    let miss: Vec<&str> = admin_extra.iter().copied().filter(|p| !admin.contains(&p.to_string())).collect();
    t.ok("Administrator holds admin / template / backup / reference / trigger functions", miss.is_empty(), format!("missing: {:?}", miss));
    let forbidden = ["mri.endorse_report", "mri.approve", "mri.close_defect", "mri.acknowledge_critical", "mri.rectify", "mri.confirm_provisional", "mri.record_provisional", "mri.enter_cost", "mri.edit_after_submit"];
    let held: Vec<&str> = forbidden.iter().copied().filter(|p| admin.contains(&p.to_string())).collect();
    t.ok("Administrator has no review / approval / closure / rectification permission", held.is_empty(), format!("holds: {:?}", held));
    let fsm_want = ["mri.submit", "mri.endorse_report", "mri.approve", "mri.close_defect", "mri.acknowledge_critical", "mri.rectify", "mri.confirm_provisional", "mri.enter_cost", "mri.edit_after_submit", "mri_templates.edit", "triggers.edit"];
    let miss: Vec<&str> = fsm_want.iter().copied().filter(|p| !fsm.contains(&p.to_string())).collect();
    t.ok("FSM holds the listed permissions (incl. Rectify and Approve)", miss.is_empty(), format!("missing: {:?}", miss));
    t.ok("FSM does not hold Record provisional", !fsm.contains(&"mri.record_provisional".to_string()), "");
}

fn s5_asset_start_state(t: &mut T) {
    for (code, desc, ty, sl) in [("ASSET1", "CTU", "COILED TUBING UNIT", "COILED TUBING"), ("ASSET2", "PUMPING UNIT", "PUMPING UNIT", "STIMULATION")] {
        let r = qrows(
            "SELECT a.asset_description, at.description, a.service_line, a.country, a.active, a.tag_status FROM assets a
             LEFT JOIN asset_types at ON at.id = a.asset_type_id WHERE a.asset_code = ?1",
            &[&code],
        );
        let got = r.first().cloned().unwrap_or_default();
        let want = vec![desc.to_string(), ty.to_string(), sl.to_string(), "PAKISTAN".into(), "1".into(), "NULL".into()];
        t.eq(&format!("{} description / type / service line / country / active / no tag", code), got, want);
    }
    let want: [(i64, &str, i64, i64, i64, bool); 9] = [
        (t.asset1, "CA", 700, 650, 0, true), (t.asset1, "KM", 1000, 950, 0, true), (t.asset1, "OH", 300, 260, 0, true),
        (t.asset2, "CA", 500, 450, 0, true), (t.asset2, "EH", 400, 350, 0, true), (t.asset2, "KM", 1000, 950, 0, true), (t.asset2, "OH", 600, 550, 0, true),
        (t.asset1, "EH", 0, 0, 0, false), (t.asset2, "RIF", 0, 0, 0, false),
    ];
    for (asset, ty, iv, wv, rv, en) in want {
        let trg = get_asset_triggers(asset).unwrap_or_default();
        let tr = trg.iter().find(|x| x.mr_level == "MR-II" && x.trigger_type == ty);
        let got = tr.map(|x| (x.enabled, x.interval_value, x.warning_value, x.running_value));
        let code = if asset == t.asset1 { "ASSET1" } else { "ASSET2" };
        if en {
            t.eq(&format!("{} MR-II {} enabled {}/{} running 0", code, ty, iv, wv), got, Some((true, iv, wv, rv)));
        } else {
            t.ok(&format!("{} MR-II {} disabled", code, ty), got.map_or(false, |g| !g.0), format!("{:?}", got));
        }
    }
    t.eq("no MR-I reports", qi("SELECT COUNT(*) FROM mri_reports", &[]).unwrap_or(-1), 0);
    t.eq("no MOC exemptions", qi("SELECT COUNT(*) FROM asset_moc_exemptions", &[]).unwrap_or(-1), 0);
    t.eq("no tag history", qi("SELECT COUNT(*) FROM asset_tag_history", &[]).unwrap_or(-1), 0);
    let q = get_pending_mri_fault_rectifications(t.u(DIS)).unwrap_or_default();
    t.eq("Open Defects source (Rectification Queue) is empty for Disantha", q.len(), 0);
    t.info("Main-menu tiles (Fleet Availability 100.0 %, no Attention Required tab)", "screen check, Phase 2");
}

fn s6_permission_seed(t: &mut T) {
    let roles = [(ABD, "Job Supervisor"), (JAN, "Operations Coordinator"), (DIS, "Maintenance Supervisor"), (KAM, "FSM")];
    let table: [(&str, [bool; 4]); 7] = [
        ("mri.approve", [false, false, false, true]),
        ("mri.close_defect", [false, true, true, true]),
        ("mri.enter_cost", [false, true, true, true]),
        ("mri.record_provisional", [true, false, false, false]),
        ("mri.confirm_provisional", [false, true, true, true]),
        ("mri.endorse_report", [true, true, true, true]),
        ("mri.edit_after_submit", [true, true, true, true]),
    ];
    for (code, want) in table {
        for (i, (user, role)) in roles.iter().enumerate() {
            let has = perms(t.u(user)).contains(&code.to_string());
            t.ok(&format!("{} {} {}", role, if want[i] { "holds" } else { "lacks" }, code), has == want[i], format!("holds = {}", has));
        }
    }
    let op = perms(t.u(SUG)).contains(&"mri.edit_after_submit".to_string());
    t.ok("Operator lacks mri.edit_after_submit", !op, format!("holds = {}", op));
}

// ================================================================ A: Report 1 (ASSET2 Left)

fn a1_start_first_report(t: &mut T) {
    let rid = new_report(t.pump, t.asset2, Some(t.left));
    if let Some(rid) = t.accepted("Draft created for ASSET2 / PUMP UNIT / Left", rid) {
        t.r.insert("r1", rid);
        open_wizard(t, rid, t.pump, t.asset2, SUG);
        default_items(t, rid, t.pump, t.asset2, SUG);
        t.eq("status Draft", status_of(rid), "Draft".to_string());
    }
    t.refused("PUMP UNIT report without a component is refused", new_report(t.pump, t.asset2, None), "component");
}

fn a2_reopen_same_draft(t: &mut T) {
    let r1 = t.rid("r1");
    let again = new_report(t.pump, t.asset2, Some(t.left));
    t.eq("starting again returns the same Draft", again, Ok(r1));
    let n = qi("SELECT COUNT(*) FROM mri_reports WHERE asset_id = ?1 AND status = 'Draft' AND component_id = ?2", &[&t.asset2, &t.left]).unwrap_or(-1);
    t.eq("only one Left Draft on ASSET2", n, 1);
}

fn a3_fill_report_1(t: &mut T) {
    let (r1, tpl) = (t.rid("r1"), t.pump);
    t.eq("Previous Engine Hours lookup is empty (shown as 0)", get_previous_engine_hours(t.asset2, r1), Ok(None));
    for (l, v) in [("Client", "Test Client"), ("Location", "Test Well TW-21"), ("Compliance Stage", "PRE-JOB"), ("Pre-Mobilization Checklist ID", "PMC-2026-0101")] {
        let _ = set_h(r1, tpl, l, v, SUG);
    }
    type_engine_hours(r1, tpl, t.asset2, 150.0, SUG);
    let _ = set_mri_report_mid_value(r1, mf(tpl, "Distance Travelled Post-Job (KM)"), "300".into(), None, Some(SUG.into()));
    let (lad, _, sev) = item(tpl, "Access Ladders & Handrails");
    t.eq("Access Ladders & Handrails default severity", sev.as_str(), "Minor");
    t.accepted("Fail saved", cl(r1, lad, "Fail", "Minor", Some("Ladder rung paint worn, needs touch-up."), Some("Rungs sanded and repainted, touch-up coat to be re-checked at the next yard visit."), &t.today.clone(), "Pending", SUG, false));
    t.accepted("photo attached", add_mri_report_attachment(r1, lad, "ladder.png".into(), "image/png".into(), PNG_1PX.into(), Some(SUG.into())));
    // "re-open": read everything back
    t.eq("Engine Hours (This Report)", hval(r1, tpl, "Engine Hours (This Report)"), Some("150.0".into()));
    t.eq("Compliance Stage kept", hval(r1, tpl, "Compliance Stage"), Some("PRE-JOB".into()));
    t.eq("Maintenance Type kept (default)", hval(r1, tpl, "Maintenance Type"), Some("Preventive".into()));
    t.eq("Checklist ID kept", hval(r1, tpl, "Pre-Mobilization Checklist ID"), Some("PMC-2026-0101".into()));
    t.eq("Client kept", hval(r1, tpl, "Client"), Some("Test Client".into()));
    t.eq("Location kept", hval(r1, tpl, "Location"), Some("Test Well TW-21".into()));
    let r = result_row(r1, lad);
    let got = r.as_ref().map(|r| (r.status.clone(), r.severity.clone(), r.date_observed.clone(), r.closure_status.clone(), r.issue_details.is_some(), r.action_taken.is_some()));
    t.eq("Fail / Minor / today / Pending / issue / action kept", got, Some((Some("Fail".into()), Some("Minor".into()), Some(t.today.clone()), "Pending".into(), true, true)));
    let att = get_mri_report_attachments(r1).unwrap_or_default().len();
    t.eq("one attachment kept", att, 1);
}

fn a3a_maintenance_type(t: &mut T) {
    let rid = new_report(t.pump, t.asset2, Some(t.right));
    let Some(rid) = t.accepted("Right Draft created", rid) else { return };
    t.r.insert("rRight", rid);
    open_wizard(t, rid, t.pump, t.asset2, SUG);
    t.eq("new Right draft starts on Preventive (wizard default saved)", hval(rid, t.pump, "Maintenance Type"), Some("Preventive".into()));
    for v in ["Breakdown", "Preventive", ""] {
        let _ = set_h(rid, t.pump, "Maintenance Type", v, SUG);
        open_wizard(t, rid, t.pump, t.asset2, SUG); // reopening must not bring the default back
        t.eq(&format!("'{}' kept after reopening", v), hval(rid, t.pump, "Maintenance Type"), Some(v.to_string()));
    }
    let _ = set_h(rid, t.pump, "Maintenance Type", "Preventive", SUG);
    t.info("Choices / no red * / no Corrective / PDF preview", "screen check, Phase 2 (claude-code+review)");
}

fn a4_compliance_stage_required(t: &mut T) {
    let r1 = t.rid("r1");
    let _ = set_h(r1, t.pump, "Compliance Stage", "", SUG);
    t.refused("Submit refused with Compliance Stage empty", submit_mri_report(r1, SUG.into()), "Compliance Stage is required");
    let _ = set_h(r1, t.pump, "Compliance Stage", "PRE-JOB", SUG);
    let res = probe(|| submit_mri_report(r1, SUG.into()));
    t.ok("after restoring PRE-JOB the Compliance Stage refusal no longer applies", !matches!(&res, Err(e) if e.contains("Compliance Stage")), format!("{:?}", res));
}

fn a5_checklist_id_required(t: &mut T) {
    let r1 = t.rid("r1");
    // The footer check comes first in the backend, so fill the footer now (A7 re-tests an empty footer).
    footer(t, r1, t.pump, SUG, ABD);
    let _ = set_h(r1, t.pump, "Pre-Mobilization Checklist ID", "", SUG);
    t.refused("Submit refused with the Checklist ID empty on PRE-JOB", submit_mri_report(r1, SUG.into()), "Pre-Mobilization Checklist ID is required for a Pre-Mob or Pre-Job report");
    let _ = set_h(r1, t.pump, "Pre-Mobilization Checklist ID", "PMC-2026-0101", SUG);
}

fn a6_fail_needs_issue(t: &mut T) {
    let r1 = t.rid("r1");
    let (lad, _, _) = item(t.pump, "Access Ladders & Handrails");
    let act = "Rungs sanded and repainted, touch-up coat to be re-checked at the next yard visit.";
    let _ = cl(r1, lad, "Fail", "Minor", Some(""), Some(act), &t.today.clone(), "Pending", SUG, false);
    t.refused("Submit refused: Fail without issue details", submit_mri_report(r1, SUG.into()), "missing issue details");
    let _ = cl(r1, lad, "Fail", "Minor", Some("Ladder rung paint worn, needs touch-up."), Some(act), &t.today.clone(), "Pending", SUG, false);
    let res = probe(|| submit_mri_report(r1, SUG.into()));
    t.ok("after restoring the text the issue-details refusal no longer applies", !matches!(&res, Err(e) if e.contains("issue details")), format!("{:?}", res));
}

fn a6a_action_needed_to_close(t: &mut T) {
    let r1 = t.rid("r1");
    let (lad, _, _) = item(t.pump, "Access Ladders & Handrails");
    let iss = "Ladder rung paint worn, needs touch-up.";
    let _ = cl(r1, lad, "Fail", "Minor", Some(iss), Some(""), &t.today.clone(), "Pending", SUG, false);
    t.refused("Closed refused with Action Taken empty", cl(r1, lad, "Fail", "Minor", Some(iss), Some(""), &t.today.clone(), "Closed", SUG, false), "Add an action taken entry before closing this item");
    t.eq("Closure Status stays Pending", result_row(r1, lad).map(|r| r.closure_status), Some("Pending".into()));
    let _ = cl(r1, lad, "Fail", "Minor", Some(iss), Some("Rungs sanded and repainted, touch-up coat to be re-checked at the next yard visit."), &t.today.clone(), "Pending", SUG, false);
    let r = result_row(r1, lad);
    t.ok("action saved and item still Pending", r.as_ref().map_or(false, |r| r.closure_status == "Pending" && r.action_taken.as_deref().map_or(false, |a| !a.is_empty())), "");
}

fn a6d_action_needed_to_submit(t: &mut T) {
    let r1 = t.rid("r1");
    let (lad, _, _) = item(t.pump, "Access Ladders & Handrails");
    let iss = "Ladder rung paint worn, needs touch-up.";
    let _ = cl(r1, lad, "Fail", "Minor", Some(iss), Some(""), &t.today.clone(), "Pending", SUG, false);
    let res = probe(|| submit_mri_report(r1, SUG.into()));
    match &res {
        Err(e) => t.info("backend submit with a blank Action Taken", format!("refused: {}", e)),
        Ok(_) => t.info("backend submit with a blank Action Taken", "ACCEPTED by the backend (rolled back). Only the wizard's Review step enforces Action Taken (code comment in set_mri_report_checklist_result says so). Phase 2 checks the screen refusal."),
    }
    let _ = cl(r1, lad, "Fail", "Minor", Some(iss), Some("Rungs sanded and repainted, touch-up coat to be re-checked at the next yard visit."), &t.today.clone(), "Pending", SUG, false);
}

fn a6e_closed_needs_both(t: &mut T) {
    let r1 = t.rid("r1");
    let (lad, _, _) = item(t.pump, "Access Ladders & Handrails");
    let (iss, act) = ("Ladder rung paint worn, needs touch-up.", "Rungs sanded and repainted, touch-up coat to be re-checked at the next yard visit.");
    let d = t.today.clone();
    t.refused("Closed refused with both blank (issue details first)", cl(r1, lad, "Fail", "Minor", Some(""), Some(""), &d, "Closed", SUG, false), "issue details");
    t.refused("Closed refused with Action Taken only", cl(r1, lad, "Fail", "Minor", Some(""), Some(act), &d, "Closed", SUG, false), "issue details");
    t.refused("Closed refused with issue details only", cl(r1, lad, "Fail", "Minor", Some(iss), Some(""), &d, "Closed", SUG, false), "action taken");
    t.accepted("Closed accepted with both filled", cl(r1, lad, "Fail", "Minor", Some(iss), Some(act), &d, "Closed", SUG, false));
    t.refused("clearing Action Taken while Closed is refused by the backend", cl(r1, lad, "Fail", "Minor", Some(iss), Some(""), &d, "Closed", SUG, false), "action taken");
    t.info("popup text and dropdown snapping back to Pending", "screen check, Phase 2");
    let _ = cl(r1, lad, "Fail", "Minor", Some(iss), Some(act), &d, "Pending", SUG, false);
    t.eq("restored to Pending", result_row(r1, lad).map(|r| r.closure_status), Some("Pending".into()));
}

fn a6b_date_severity_closure(t: &mut T) {
    let r1 = t.rid("r1");
    let (lad, _, _) = item(t.pump, "Access Ladders & Handrails");
    let (iss, act) = ("Ladder rung paint worn, needs touch-up.", "Rungs sanded and repainted, touch-up coat to be re-checked at the next yard visit.");
    let (y, d) = (t.yesterday.clone(), t.today.clone());
    let _ = cl(r1, lad, "Fail", "Minor", Some(iss), Some(act), &y, "Pending", SUG, false);
    t.eq("Date Observed keeps yesterday", result_row(r1, lad).and_then(|r| r.date_observed), Some(y.clone()));
    let _ = cl(r1, lad, "Fail", "Minor", Some(iss), Some(act), &d, "Pending", SUG, false);
    t.eq("Date Observed back to today", result_row(r1, lad).and_then(|r| r.date_observed), Some(d.clone()));
    let _ = cl(r1, lad, "Fail", "Moderate", Some(iss), Some(act), &d, "Pending", SUG, false);
    t.eq("severity Moderate saved", result_row(r1, lad).and_then(|r| r.severity), Some("Moderate".into()));
    let res = probe(|| cl(r1, lad, "Fail", "Moderate", Some(iss), Some(act), &d, "Closed", SUG, false));
    t.info("backend Closed on a Moderate Fail", format!("{:?} (rolled back). The Operator block is in the wizard (disabled list); Phase 2 checks it.", res));
    let _ = cl(r1, lad, "Fail", "Minor", Some(iss), Some(act), &d, "Pending", SUG, false);
    let r = result_row(r1, lad);
    t.ok("nothing left changed from A3 (Fail, Minor, today, Pending)", r.as_ref().map_or(false, |r| r.severity.as_deref() == Some("Minor") && r.date_observed.as_deref() == Some(d.as_str()) && r.closure_status == "Pending"), "");
}

fn a6c_attachments(t: &mut T) {
    let r1 = t.rid("r1");
    let (lad, _, _) = item(t.pump, "Access Ladders & Handrails");
    let pdf = add_mri_report_attachment(r1, lad, "page.pdf".into(), "application/pdf".into(), PDF_TINY.into(), Some(SUG.into()));
    if let Some(pid) = t.accepted("PDF attached", pdf) {
        t.eq("two attachments", get_mri_report_attachments(r1).map(|v| v.len()), Ok(2));
        t.accepted("PDF removed", delete_mri_report_attachment(pid));
    }
    let left: Vec<String> = get_mri_report_attachments(r1).unwrap_or_default().into_iter().map(|a| a.file_name).collect();
    t.eq("only the photo remains", left, vec!["ladder.png".to_string()]);
    t.refused("empty file refused", add_mri_report_attachment(r1, lad, "x.png".into(), "image/png".into(), " ".into(), None), "empty");
    t.info("5 MB limit", "enforced only in the wizard (backend has no size check); Phase 2 checks the message");
}

fn a7_submit_report_1(t: &mut T) {
    let r1 = t.rid("r1");
    for l in ["Operator Date", "Supervisor", "Supervisor Date"] {
        let _ = set_mri_report_footer_value(r1, ff(t.pump, l), "".into(), Some(SUG.into()));
    }
    t.refused("Submit refused with empty footer", submit_mri_report(r1, SUG.into()), "Missing: Operator Date, Supervisor, Supervisor Date");
    footer(t, r1, t.pump, SUG, ABD);
    for l in ["Cleaned", "Pressure Tested", "Function Tested", "Green Tagged", "Job Ready"] {
        let _ = set_mri_report_footer_value(r1, ff(t.pump, l), "true".into(), Some(SUG.into()));
    }
    let _ = set_mri_report_footer_value(r1, ff(t.pump, "Remarks"), "Unit cleaned and pressure tested at Karachi Yard.".into(), Some(SUG.into()));
    let tag_before = tag(t.asset2);
    t.accepted("Submit accepted", submit_mri_report(r1, SUG.into()));
    t.eq("status Submitted", status_of(r1), "Submitted".into());
    t.eq("unit tag unchanged (Minor fault only)", tag(t.asset2), tag_before);
    t.eq("Maintenance Type Preventive on the submitted report", hval(r1, t.pump, "Maintenance Type"), Some("Preventive".into()));
    t.info("Review / PDF layout", "screen check, Phase 2 (claude-code+review)");
}

fn a8_no_new_report_while_submitted(t: &mut T) {
    t.refused("new report on ASSET2 Left refused", new_report(t.pump, t.asset2, Some(t.left)), "still Submitted");
}

fn a9_operator_cannot_edit(t: &mut T) {
    let r1 = t.rid("r1");
    let res = probe(|| set_h(r1, t.pump, "Location", "Sukkur Base", SUG));
    t.info("backend header write on a Submitted report", format!("{:?} (rolled back). There is no backend lock on edits after submit: the lock is in the wizard (mri.edit_after_submit). Phase 2 checks the screen.", res));
    t.ok("Operator lacks mri.edit_after_submit / endorse / close", {
        let p = perms(t.u(SUG));
        !p.iter().any(|x| x == "mri.edit_after_submit" || x == "mri.endorse_report" || x == "mri.close_defect")
    }, "");
}

fn a10_premob_needs_checklist_id(t: &mut T) {
    let rid = new_report(t.ctu, t.asset1, None);
    let Some(rid) = t.accepted("ASSET1 Draft created", rid) else { return };
    t.r.insert("rA10", rid);
    open_wizard(t, rid, t.ctu, t.asset1, SUG);
    default_items(t, rid, t.ctu, t.asset1, SUG);
    let _ = set_h(rid, t.ctu, "Compliance Stage", "PREMOB", SUG);
    footer(t, rid, t.ctu, SUG, ABD);
    t.refused("Submit refused without the Checklist ID", submit_mri_report(rid, SUG.into()), "Pre-Mobilization Checklist ID is required");
    let _ = set_h(rid, t.ctu, "Pre-Mobilization Checklist ID", "PMC-2026-0087", SUG);
    t.accepted("Submit accepted with PMC-2026-0087", submit_mri_report(rid, SUG.into()));
    t.eq("status Submitted", status_of(rid), "Submitted".into());
    t.eq("ASSET1 stays untagged", tag(t.asset1), None);
    t.eq("Job Number empty", hval(rid, t.ctu, "Job Number"), None);
}

// ================================================================ B

fn b1_who_sees_what(t: &mut T) {
    let (r1, ra10) = (t.rid("r1"), t.rid("rA10"));
    let rows = get_reports_needing_supervisor_action(t.u(ABD)).unwrap_or_default();
    let ids: Vec<(i64, String)> = rows.iter().map(|r| (r.id, r.status.clone())).collect();
    t.ok("Reports to Review (Abdulla) lists Report 1 and the ASSET1 Pre-Mob as Submitted", ids.contains(&(r1, "Submitted".into())) && ids.contains(&(ra10, "Submitted".into())), format!("{:?}", ids));
    t.ok("Operator has no Close or Endorse permission", !perms(t.u(SUG)).iter().any(|p| p == "mri.endorse_report" || p == "mri.close_defect"), "");
}

fn b2_no_endorse_on_minor_only(t: &mut T) {
    let r1 = t.rid("r1");
    let res = probe(|| endorse_mri_report(r1, ABD.into(), t.u(DIS)));
    t.refused("endorse refused on a Minor-only report (server rule; screen hides the button)", res, "no Moderate/Critical faults");
}

fn b3_close_report_1(t: &mut T) {
    let r1 = t.rid("r1");
    t.accepted("Close & Approve", review_and_close_mri_report(r1, ABD.into()));
    t.eq("status Approved", status_of(r1), "Approved".into());
    t.eq("ASSET2 stays untagged", tag(t.asset2), None);
    let (lad, _, _) = item(t.pump, "Access Ladders & Handrails");
    t.eq("Minor fault stays Pending", result_row(r1, lad).map(|r| r.closure_status), Some("Pending".into()));
}

fn b4_close_asset1_premob(t: &mut T) {
    let rid = t.rid("rA10");
    t.accepted("Close & Approve", review_and_close_mri_report(rid, ABD.into()));
    t.eq("status Approved", status_of(rid), "Approved".into());
    t.eq("ASSET1 stays untagged", tag(t.asset1), None);
}

fn b5_report_2_five_moderates(t: &mut T) {
    let rid = new_report(t.pump, t.asset2, Some(t.left));
    let Some(rid) = t.accepted("Report 2 Draft created (Left)", rid) else { return };
    t.r.insert("r2", rid);
    let tpl = t.pump;
    let (lad, lad_cid, _) = item(tpl, "Access Ladders & Handrails");
    let pending = get_pending_checklist_item_ids(t.asset2, rid).unwrap_or_default();
    t.ok("Access Ladders & Handrails is carried forward (defaults to Fail)", pending.contains(&lad_cid), format!("{:?}", pending));
    let prior = get_open_prior_issues(t.asset2, rid).unwrap_or_default();
    let p = prior.iter().find(|p| p.checklist_description.as_deref() == Some("Access Ladders & Handrails"));
    t.eq("carried issue text is Report 1's (not blank)", p.and_then(|p| p.issue_details.clone()), Some("Ladder rung paint worn, needs touch-up.".into()));
    t.eq("Previous Engine Hours = 150", get_previous_engine_hours(t.asset2, rid).ok().flatten().and_then(|v| v.parse::<f64>().ok()), Some(150.0));
    open_wizard(t, rid, tpl, t.asset2, SUG);
    t.eq("Current Engine Hours pre-filled with 150", hval(rid, tpl, "Current Engine Hours").and_then(|v| v.parse::<f64>().ok()), Some(150.0));
    default_items(t, rid, tpl, t.asset2, SUG);
    t.eq("carried item saved as Fail with Report 1 text", result_row(rid, lad).map(|r| (r.status, r.issue_details)), Some((Some("Fail".into()), Some("Ladder rung paint worn, needs touch-up.".into()))));
    for (l, v) in [("Client", "Test Client"), ("Location", "Test Well TW-21"), ("Compliance Stage", "PRE-JOB"), ("Pre-Mobilization Checklist ID", "PMC-2026-0102")] {
        let _ = set_h(rid, tpl, l, v, SUG);
    }
    type_engine_hours(rid, tpl, t.asset2, 220.0, SUG);
    t.eq("Engine Hours (This Report) = 70", hval(rid, tpl, "Engine Hours (This Report)"), Some("70.0".into()));
    let rows = [
        ("Air Filter", "Air filter element clogged, restriction indicator in the red.", "Filter element removed and cleaned, replacement element ordered.", t.today.clone(), true),
        ("Agitator", "Agitator paddle shaft stiff, cannot confirm it turns freely.", "Shaft lubricated, still stiff; bearing and seal inspection requested.", t.today.clone(), false),
        ("Actuators on Control Panel", "Control panel actuator sticks and responds slowly to the pump rate command.", "Linkage cleaned and greased, response still slow.", t.yesterday.clone(), false),
        ("Breather", "Breather cap missing, vent open to dust.", "Temporary cap fitted, correct breather cap ordered.", t.today.clone(), true),
        ("Brass Bushing Condition Within Tolerance Limits", "Light scoring on the brass bushing, still inside the wear limit.", "Measured and recorded as within the wear limit; to be monitored at the next report.", t.two_days_ago.clone(), false),
    ];
    for (name, iss, act, date, photo) in rows.iter() {
        let (tci, _, sev) = item(tpl, name);
        t.ok(&format!("{} template default is Moderate", name), sev == "Moderate", sev.clone());
        let _ = cl(rid, tci, "Fail", "Moderate", Some(iss), Some(act), date, "Pending", SUG, false);
        if *photo {
            let _ = add_mri_report_attachment(rid, tci, format!("{}.png", name), "image/png".into(), PNG_1PX.into(), Some(SUG.into()));
        }
    }
    t.accepted("Access Ladders & Handrails closed by the Operator with action", cl(rid, lad, "Fail", "Minor", Some("Ladder rung paint worn, needs touch-up."), Some("Touch-up paint applied to worn ladder rungs."), &t.today.clone(), "Closed", SUG, false));
    let (af, _, _) = item(tpl, "Air Filter");
    let res = probe(|| cl(rid, af, "Fail", "Moderate", Some(rows[0].1), Some(rows[0].2), &t.today.clone(), "Closed", SUG, false));
    t.info("backend Closed on the Moderate Air Filter", format!("{:?} (rolled back). Operator block is the wizard's disabled list; Phase 2 checks it.", res));
    footer(t, rid, tpl, SUG, ABD);
    for l in ["Cleaned", "Pressure Tested", "Function Tested"] {
        let _ = set_mri_report_footer_value(rid, ff(tpl, l), "true".into(), Some(SUG.into()));
    }
    t.accepted("Submit", submit_mri_report(rid, SUG.into()));
    t.eq("status Submitted", status_of(rid), "Submitted".into());
    t.eq("ASSET2 stays untagged (Moderate faults do not tag)", tag(t.asset2), None);
    let rr = get_mri_report_checklist_results(rid).unwrap_or_default();
    let fails: Vec<_> = rr.iter().filter(|r| r.status.as_deref() == Some("Fail") && r.severity.as_deref() == Some("Moderate")).collect();
    t.eq("five Moderate fails", fails.len(), 5);
    t.ok("each Fail stamped reported_by Suganya with a time", fails.iter().all(|r| r.reported_by.as_deref() == Some(SUG) && r.reported_at.is_some()), "");
    let photos: Vec<String> = get_mri_report_attachments(rid).unwrap_or_default().into_iter().map(|a| a.file_name).collect();
    t.ok("photos only on Air Filter and Breather", photos.len() == 2 && photos.iter().all(|p| p.starts_with("Air Filter") || p.starts_with("Breather")), format!("{:?}", photos));
    t.eq("Actuators date observed = yesterday", result_row(rid, item(tpl, "Actuators on Control Panel").0).and_then(|r| r.date_observed), Some(t.yesterday.clone()));
    t.eq("Brass Bushing date observed = two days ago", result_row(rid, item(tpl, "Brass Bushing Condition Within Tolerance Limits").0).and_then(|r| r.date_observed), Some(t.two_days_ago.clone()));
}

fn b6_moderate_cannot_close_directly(t: &mut T) {
    let r2 = t.rid("r2");
    t.refused("Close & Approve refused (Moderate faults)", review_and_close_mri_report(r2, ABD.into()), "use Endorse Report");
    t.eq("still Submitted", status_of(r2), "Submitted".into());
}

fn b7_endorse_needs_reviewer(t: &mut T) {
    let r2 = t.rid("r2");
    t.refused("endorse with no reviewer refused", endorse_mri_report(r2, ABD.into(), 0), "Select which");
    let list = get_assignable_mri_reviewers(vec!["mri.close_defect".into(), "mri.approve".into()], Some("PAKISTAN".into())).unwrap_or_default();
    let names: Vec<String> = list.iter().map(|u| u.name.clone()).collect();
    t.ok("reviewer list has Disantha, Jan-Albert, Kamil", [DIS, JAN, KAM].iter().all(|n| names.contains(&n.to_string())), format!("{:?}", names));
    t.ok("Administrator, Operator, Data Miner not listed", ![JESS, SUG, MAR].iter().any(|n| names.contains(&n.to_string())), format!("{:?}", names));
    t.accepted("endorse to Disantha", endorse_mri_report(r2, ABD.into(), t.u(DIS)));
    t.eq("status Escalated", status_of(r2), "Escalated".into());
    let ap = qrows("SELECT decision, assigned_to_user_id FROM mri_fault_approvals WHERE report_id = ?1", &[&r2]);
    let dis = t.u(DIS).to_string();
    t.ok("five Pending approvals assigned to Disantha", ap.len() == 5 && ap.iter().all(|r| r[0] == "Pending" && r[1] == dis), format!("{:?}", ap));
}

fn b8_no_close_while_pending(t: &mut T) {
    let r2 = t.rid("r2");
    let rows = get_reports_needing_supervisor_action(t.u(ABD)).unwrap_or_default();
    t.ok("Report 2 is not in Abdulla's Reports to Review", !rows.iter().any(|r| r.id == r2), format!("{:?}", rows.iter().map(|r| (r.id, r.status.clone())).collect::<Vec<_>>()));
    t.refused("new Left report refused (still Escalated)", new_report(t.pump, t.asset2, Some(t.left)), "still Escalated");
    t.refused("close refused while decisions pending (server rule)", close_mri_report(r2, ABD.into()), "awaiting a review decision");
}

// ================================================================ C

fn c1_approve_moderate(t: &mut T) {
    let r2 = t.rid("r2");
    let (af, _, _) = item(t.pump, "Air Filter");
    let Some((aid, ..)) = approval(r2, af) else { panic!("no Air Filter approval") };
    let pend = get_pending_mri_fault_approvals(t.u(DIS)).unwrap_or_default();
    let row = pend.iter().find(|p| p.id == aid);
    t.eq("card Issue and Action Taken from B5", row.map(|r| (r.issue_details.clone(), r.action_taken.clone(), r.can_act)), Some((Some("Air filter element clogged, restriction indicator in the red.".into()), Some("Filter element removed and cleaned, replacement element ordered.".into()), true)));
    t.accepted("Approve (In-Person)", decide(aid, "Approved", None, DIS, "In-Person", "Checked filter on site; cleaning and replacement order are adequate.", DIS, false, None, None));
    t.eq("decision Approved", approval(r2, af).map(|a| a.1), Some("Approved".into()));
    t.ok("card leaves Pending Approvals", !get_pending_mri_fault_approvals(t.u(DIS)).unwrap_or_default().iter().any(|p| p.id == aid), "");
    let log = get_mri_fault_decision_log(r2).unwrap_or_default();
    t.ok("decision log row with method In-Person", log.iter().any(|l| l.fault_approval_id == aid && l.action == "Approved" && l.review_method == "In-Person"), "");
    t.eq("Planned follow-up created", rect(aid).map(|r| r.1), Some("Planned".into()));
    // Manual Rev 02 §8.1: every item shows Green (Ready for Service), Yellow or Red. Table 3:
    // a Moderate fault "does not currently prevent operation" -> the unit is ready for service.
    t.eq("unit shows Green (Ready for Service, Manual 8.1)", tag(t.asset2), Some("Green".into()));
    t.matrix("C1 expects 'The unit tag does not change'", "After the Moderate decision the untagged unit becomes Green (one tag-history row). Manual Table 3's Moderate row says nothing about tags (its 'closed and Green-Tagged' wording is only for a Critical reclassified to Moderate), but Manual 8.1 requires every item to show Green / Yellow / Red, and a Moderate-only unit is ready for service = Green. The Clarification (Table 3 summary agreed with K. Shahzad) gives the same picture: Minor 'Unit stays Green', Moderate 'Plan the repair and keep an eye on it until fixed' (no Red/Yellow), Critical lowered to Moderate 'the unit goes Green'. The app is consistent with the manual; the matrix should expect Green.");
}

fn c2_reject_moderate(t: &mut T) {
    let r2 = t.rid("r2");
    let (it, _, _) = item(t.pump, "Actuators on Control Panel");
    let aid = approval(r2, it).unwrap().0;
    t.accepted("Reject", decide(aid, "Rejected", None, DIS, "In-Person", "Not a fault.", DIS, false, None, None));
    t.eq("decision Rejected", approval(r2, it).map(|a| a.1), Some("Rejected".into()));
    let log = get_mri_fault_decision_log(r2).unwrap_or_default();
    t.ok("final severity Minor", log.iter().any(|l| l.fault_approval_id == aid && l.to_severity.as_deref() == Some("Minor")), "");
    t.eq("item closed", result_row(r2, it).map(|r| r.closure_status), Some("Closed".into()));
    t.eq("no repair / follow-up row", rect(aid), None);
}

fn c3_reclassify_needs_severity(t: &mut T) {
    let r2 = t.rid("r2");
    let (it, _, _) = item(t.pump, "Breather");
    let aid = approval(r2, it).unwrap().0;
    t.refused("reclassify without a new severity refused (server rule)", decide(aid, "Reclassified", None, DIS, "In-Person", "x", DIS, false, None, None), "valid new severity");
    t.eq("Breather still Pending", approval(r2, it).map(|a| a.1), Some("Pending".into()));
}

fn c4_carry_forward_moderate(t: &mut T) {
    let r2 = t.rid("r2");
    let (it, _, _) = item(t.pump, "Brass Bushing Condition Within Tolerance Limits");
    let aid = approval(r2, it).unwrap().0;
    let before = tag(t.asset2);
    t.accepted("Carryforward", decide(aid, "Carryforward", None, DIS, "In-Person", "Monitor at next report.", DIS, false, None, None));
    t.eq("decision Carryforward", approval(r2, it).map(|a| a.1), Some("Carryforward".into()));
    t.eq("no repair created", rect(aid), None);
    t.eq("unit tag unchanged by this step", tag(t.asset2), before);
}

fn c5_raise_to_critical(t: &mut T) {
    let r2 = t.rid("r2");
    let list = get_assignable_mri_reviewers(vec!["mri.approve".into()], Some("PAKISTAN".into())).unwrap_or_default();
    let names: Vec<String> = list.iter().map(|u| u.name.clone()).collect();
    t.eq("Send Critical fault to offers only Kamil Shahzad", names, vec![KAM.to_string()]);
    let (it, _, _) = item(t.pump, "Agitator");
    let aid = approval(r2, it).unwrap().0;
    t.refused("raising to Critical for a non-FSM (Abdulla) is refused", decide(aid, "Reclassified", Some("Critical"), DIS, "In-Person", "x", DIS, false, Some(t.u(ABD)), None), "FSM");
    t.accepted("Reclassify to Critical, next reviewer Kamil", decide(aid, "Reclassified", Some("Critical"), DIS, "In-Person", "Shaft seized, bearing failure likely: raise to Critical for FSM review.", DIS, false, Some(t.u(KAM)), None));
    let a = approval(r2, it);
    t.eq("Pending, original Critical, assigned to Kamil", a.as_ref().map(|a| (a.1.clone(), a.2.clone(), a.3)), Some(("Pending".into(), "Critical".into(), Some(t.u(KAM)))));
    let dpend = get_pending_mri_fault_approvals(t.u(DIS)).unwrap_or_default();
    t.ok("Agitator not actionable for Disantha", !dpend.iter().any(|p| p.id == aid && p.can_act), "");
    let kpend = get_pending_mri_fault_approvals(t.u(KAM)).unwrap_or_default();
    t.ok("Agitator in Kamil's Pending Approvals", kpend.iter().any(|p| p.id == aid && p.can_act), "");
    t.eq("ASSET2 Red", tag(t.asset2), Some("Red".into()));
    let log = get_mri_fault_decision_log(r2).unwrap_or_default();
    t.ok("decision log shows Escalated Moderate -> Critical", log.iter().any(|l| l.fault_approval_id == aid && l.action == "Escalated" && l.from_severity == "Moderate" && l.to_severity.as_deref() == Some("Critical")), "");
}

fn c6_raise_second_to_critical(t: &mut T) {
    let r2 = t.rid("r2");
    let (it, _, _) = item(t.pump, "Breather");
    let aid = approval(r2, it).unwrap().0;
    t.accepted("Reclassify Breather to Critical, Kamil", decide(aid, "Reclassified", Some("Critical"), DIS, "In-Person", "Open vent: raise to Critical.", DIS, false, Some(t.u(KAM)), None));
    t.eq("Pending Critical for Kamil", approval(r2, it).map(|a| (a.1, a.2, a.3)), Some(("Pending".into(), "Critical".into(), Some(t.u(KAM)))));
    t.eq("unit stays Red", tag(t.asset2), Some("Red".into()));
}

fn c7_fsm_approves_both(t: &mut T) {
    let r2 = t.rid("r2");
    for (name, note) in [("Agitator", "Critical confirmed: shaft seized, unit not to run until repaired."), ("Breather", "Critical confirmed: open vent lets dust into the system, repair before use.")] {
        let (it, _, _) = item(t.pump, name);
        let aid = approval(r2, it).unwrap().0;
        t.accepted(&format!("Kamil approves {}", name), decide(aid, "Approved", None, KAM, "In-Person", note, KAM, false, None, None));
        t.eq(&format!("{} Red repair, parts Awaiting, no technician", name), rect(aid).map(|r| (r.1, r.2, r.3)), Some(("Red".into(), "Awaiting".into(), None)));
    }
    let q = get_pending_mri_fault_rectifications(t.u(DIS)).unwrap_or_default();
    let af = approval(r2, item(t.pump, "Air Filter").0).unwrap().0;
    t.ok("Air Filter also in the queue as Planned", q.iter().any(|r| r.fault_approval_id == af && r.tag_status == "Planned"), "");
    t.eq("ASSET2 stays Red", tag(t.asset2), Some("Red".into()));
    t.eq("Green Tagged footer false", fval(r2, t.pump, "Green Tagged"), Some("false".into()));
    t.eq("report still Escalated", status_of(r2), "Escalated".into());
    let log = get_mri_fault_decision_log(r2).unwrap_or_default();
    t.eq("two Approved by Kamil In-Person", log.iter().filter(|l| l.action == "Approved" && l.reviewer == KAM && l.review_method == "In-Person").count(), 2);
}

fn c8_close_with_repairs_open(t: &mut T) {
    let r2 = t.rid("r2");
    let rows = get_reports_needing_supervisor_action(t.u(ABD)).unwrap_or_default();
    t.ok("Report 2 back in Reports to Review (resolved, awaiting close)", rows.iter().any(|r| r.id == r2 && r.status == "Escalated"), "");
    t.accepted("Close Report", close_mri_report(r2, ABD.into()));
    t.eq("status Approved", status_of(r2), "Approved".into());
    let q = get_pending_mri_fault_rectifications(t.u(DIS)).unwrap_or_default();
    let names: Vec<(String, String)> = q.iter().map(|r| (r.checklist_description.clone().unwrap_or_default(), r.tag_status.clone())).collect();
    t.ok("queue still has Agitator Red, Breather Red, Air Filter Planned", [("Agitator", "Red"), ("Breather", "Red"), ("Air Filter", "Planned")].iter().all(|(n, s)| names.contains(&(n.to_string(), s.to_string()))), format!("{:?}", names));
    t.eq("ASSET2 stays Red", tag(t.asset2), Some("Red".into()));
}

fn c9_first_critical_on_asset1(t: &mut T) {
    let rid = new_report(t.ctu, t.asset1, None);
    let Some(rid) = t.accepted("ASSET1 Draft created", rid) else { return };
    t.r.insert("rC9", rid);
    let tpl = t.ctu;
    open_wizard(t, rid, tpl, t.asset1, SUG);
    default_items(t, rid, tpl, t.asset1, SUG);
    for (l, v) in [("Client", "Test Client"), ("Location", "Test Well TW-21"), ("Compliance Stage", "PRE-JOB")] {
        let _ = set_h(rid, tpl, l, v, SUG);
    }
    footer(t, rid, tpl, SUG, ABD);
    let (bv, _, bsev) = item(tpl, "Ball Valves");
    let (ag, _, asev) = item(tpl, "Agitator");
    t.eq("template defaults Ball Valves Critical / Agitator Moderate", (bsev.as_str(), asev.as_str()), ("Critical", "Moderate"));
    let d = t.today.clone();
    let _ = cl(rid, bv, "Fail", "Critical", Some("Ball valve seat leaking, pressure drops under load."), Some("Valve isolated and tagged out, seat replacement requested."), &d, "Pending", SUG, false);
    let _ = cl(rid, ag, "Fail", "Moderate", Some("Agitator shaft seal weeping."), Some("Seal wiped and monitored, replacement requested."), &d, "Pending", SUG, false);
    let _ = add_mri_report_attachment(rid, bv, "ball_valve_seat.png".into(), "image/png".into(), PNG_1PX.into(), Some(SUG.into()));
    t.refused("Submit refused without the Checklist ID", submit_mri_report(rid, SUG.into()), "Pre-Mobilization Checklist ID is required");
    let _ = set_h(rid, tpl, "Pre-Mobilization Checklist ID", "PMC-2026-0111", SUG);
    t.accepted("Submit", submit_mri_report(rid, SUG.into()));
    t.eq("status Submitted", status_of(rid), "Submitted".into());
    t.eq("ASSET1 Red at once", tag(t.asset1), Some("Red".into()));
    let h = get_asset_tag_history(t.asset1).unwrap_or_default();
    t.eq("tag history reason", h.first().and_then(|e| e.reason.clone()), Some(format!("Critical fault reported (report #{})", rid)));
}

fn c10_endorse_critical_picker(t: &mut T) {
    let rid = t.rid("rC9");
    let names: Vec<String> = get_assignable_mri_reviewers(vec!["mri.approve".into()], Some("PAKISTAN".into())).unwrap_or_default().into_iter().map(|u| u.name).collect();
    t.eq("only Kamil Shahzad listed", names, vec![KAM.to_string()]);
    t.refused("endorsing a Critical report to Disantha is refused", endorse_mri_report(rid, ABD.into(), t.u(DIS)), "FSM");
    t.accepted("endorse to Kamil", endorse_mri_report(rid, ABD.into(), t.u(KAM)));
    t.eq("status Escalated", status_of(rid), "Escalated".into());
    let ap = qrows("SELECT decision, assigned_to_user_id FROM mri_fault_approvals WHERE report_id = ?1", &[&rid]);
    let k = t.u(KAM).to_string();
    t.ok("two Pending approvals assigned to Kamil", ap.len() == 2 && ap.iter().all(|r| r[0] == "Pending" && r[1] == k), format!("{:?}", ap));
}

fn c10a_flow_before_decisions(t: &mut T) {
    let rid = t.rid("rC9");
    match get_report_flow(rid, t.u(KAM)) {
        Ok(f) => {
            let bv = f.faults.iter().find(|x| x.item_name == "Ball Valves");
            t.eq("flow: Ball Valves Critical, decision Pending", bv.map(|x| (x.original_severity.clone(), x.decision.clone())), Some(("Critical".into(), "Pending".into())));
        }
        Err(e) => {
            t.ok("report flow opens for Kamil", false, e);
        }
    }
    t.info("red border, Back button", "screen check, Phase 2");
}

fn c11_critical_cannot_carry_or_drop_to_minor(t: &mut T) {
    let rid = t.rid("rC9");
    let (bv, _, _) = item(t.ctu, "Ball Valves");
    let aid = approval(rid, bv).unwrap().0;
    t.refused("Carryforward refused", decide(aid, "Carryforward", None, KAM, "In-Person", "x", KAM, false, None, None), "cannot be carried forward");
    t.refused("Reclassify to Minor refused", decide(aid, "Reclassified", Some("Minor"), KAM, "In-Person", "x", KAM, false, None, None), "only be lowered to Moderate");
    t.eq("fault stays Pending", approval(rid, bv).map(|a| a.1), Some("Pending".into()));
}

fn c12_lower_critical_to_moderate(t: &mut T) {
    let rid = t.rid("rC9");
    let (bv, _, _) = item(t.ctu, "Ball Valves");
    let aid = approval(rid, bv).unwrap().0;
    t.accepted("Reclassify to Moderate", decide(aid, "Reclassified", Some("Moderate"), KAM, "In-Person", "Lowered to Moderate.", KAM, false, None, None));
    t.eq("Planned follow-up row", rect(aid).map(|r| r.1), Some("Planned".into()));
    t.eq("ASSET1 returns to Green", tag(t.asset1), Some("Green".into()));
}

fn c13_lower_moderate_to_minor(t: &mut T) {
    let rid = t.rid("rC9");
    let (ag, _, _) = item(t.ctu, "Agitator");
    let aid = approval(rid, ag).unwrap().0;
    let tag_before = tag(t.asset1);
    t.accepted("Reclassify Agitator to Minor", decide(aid, "Reclassified", Some("Minor"), KAM, "In-Person", "Minor.", KAM, false, None, None));
    t.eq("decision Reclassified", approval(rid, ag).map(|a| a.1), Some("Reclassified".into()));
    t.eq("item closed", result_row(rid, ag).map(|r| r.closure_status), Some("Closed".into()));
    t.eq("no follow-up row", rect(aid), None);
    t.eq("no tag change", tag(t.asset1), tag_before);
}

fn c14_close_c9(t: &mut T) {
    let rid = t.rid("rC9");
    t.accepted("Close", close_mri_report(rid, ABD.into()));
    t.eq("status Approved", status_of(rid), "Approved".into());
    t.eq("ASSET1 Green", tag(t.asset1), Some("Green".into()));
    let bv = approval(rid, item(t.ctu, "Ball Valves").0).unwrap().0;
    t.ok("Ball Valves Planned follow-up stays in the queue", get_pending_mri_fault_rectifications(t.u(DIS)).unwrap_or_default().iter().any(|r| r.fault_approval_id == bv && r.tag_status == "Planned"), "");
}

// ================================================================ D

fn rect_for(t: &T, key: &str, tpl: i64, name: &str) -> i64 {
    let aid = approval(t.rid(key), item(tpl, name).0).unwrap().0;
    rect(aid).unwrap().0
}

fn d1_rectification_queue(t: &mut T) {
    let q = get_pending_mri_fault_rectifications(t.u(DIS)).unwrap_or_default();
    let mut got: Vec<(String, String, String, bool)> = q.iter().map(|r| (r.asset_code.clone().unwrap_or_default(), r.checklist_description.clone().unwrap_or_default(), r.tag_status.clone(), r.assigned_technician.as_deref().map_or(false, |s| !s.trim().is_empty()))).collect();
    got.sort();
    let mut want = vec![
        ("ASSET1".to_string(), "Ball Valves".to_string(), "Planned".to_string(), false),
        ("ASSET2".into(), "Agitator".into(), "Red".into(), false),
        ("ASSET2".into(), "Air Filter".into(), "Planned".into(), false),
        ("ASSET2".into(), "Breather".into(), "Red".into(), false),
    ];
    want.sort();
    t.eq("four rows, Red ones without technician", got, want);
    t.info("Open Defects tile = 4 / red circle count", "screen check, Phase 2");
}

fn d2_one_technician_not_yellow(t: &mut T) {
    let id = rect_for(t, "r2", t.pump, "Breather");
    t.accepted("technician on Breather", rect_update(id, Some("Ahmed Khan"), "Awaiting", None, DIS));
    t.eq("ASSET2 stays Red", tag(t.asset2), Some("Red".into()));
}

fn d3_both_assigned_yellow(t: &mut T) {
    let id = rect_for(t, "r2", t.pump, "Agitator");
    t.accepted("technician on Agitator", rect_update(id, Some("Ahmed Khan"), "Awaiting", None, DIS));
    t.eq("ASSET2 Yellow", tag(t.asset2), Some("Yellow".into()));
    t.ok("tag reason names the technician", tag_reason(t.asset2).contains("Ahmed Khan"), tag_reason(t.asset2));
}

fn d3a_flow_from_queue(t: &mut T) {
    match get_report_flow(t.rid("r2"), t.u(DIS)) {
        Ok(f) => {
            let ag = f.faults.iter().find(|x| x.item_name == "Agitator").and_then(|x| x.repair.as_ref());
            let s = serde_json::to_value(ag).unwrap_or_default();
            t.ok("flow Repair box carries technician and parts status", s.to_string().contains("Ahmed Khan") && s.to_string().contains("Awaiting"), s.to_string());
        }
        Err(e) => {
            t.ok("report flow opens", false, e);
        }
    }
}

fn d4_clear_technician_red(t: &mut T) {
    let id = rect_for(t, "r2", t.pump, "Breather");
    let _ = rect_update(id, None, "Awaiting", None, DIS);
    t.eq("cleared -> ASSET2 Red", tag(t.asset2), Some("Red".into()));
    let _ = rect_update(id, Some("Ahmed Khan"), "Awaiting", None, DIS);
    t.eq("re-entered -> Yellow", tag(t.asset2), Some("Yellow".into()));
}

fn d5_report_3_carried_forward(t: &mut T) {
    let rid = new_report(t.pump, t.asset2, Some(t.left));
    let Some(rid) = t.accepted("Report 3 Draft created", rid) else { return };
    t.r.insert("r3", rid);
    let cf = get_carried_forward_faults(rid).unwrap_or_default();
    let r2 = t.rid("r2");
    t.ok("Brass Bushing listed as carried forward from Report 2", cf.iter().any(|c| c.checklist_description.as_deref() == Some("Brass Bushing Condition Within Tolerance Limits") && c.original_report_id == r2), format!("{:?}", cf.iter().map(|c| (c.original_report_id, c.checklist_description.clone())).collect::<Vec<_>>()));
    let hist = get_mri_checklist_history(t.asset2, rid).unwrap_or_default();
    let (bb, bb_cid, _) = item(t.pump, "Brass Bushing Condition Within Tolerance Limits");
    let h = hist.iter().find(|h| h.checklist_item_id == bb_cid && h.report_id == r2);
    t.eq("earlier Action Taken entry by Suganya", h.map(|h| (h.action_taken.clone(), h.reported_by.clone())), Some((Some("Measured and recorded as within the wear limit; to be monitored at the next report.".into()), Some(SUG.into()))));
    open_wizard(t, rid, t.pump, t.asset2, SUG);
    default_items(t, rid, t.pump, t.asset2, SUG);
    t.eq("carried item defaults to Fail / Moderate / Pending / today", result_row(rid, bb).map(|r| (r.status, r.severity, r.closure_status, r.date_observed)), Some((Some("Fail".into()), Some("Moderate".into()), "Pending".into(), Some(t.today.clone()))));
}

fn d6_yellow_prejob_refused(t: &mut T) {
    let rid = t.rid("r3");
    for (l, v) in [("Client", "Test Client"), ("Location", "Test Well TW-21"), ("Compliance Stage", "PRE-JOB"), ("Pre-Mobilization Checklist ID", "PMC-2026-0103")] {
        let _ = set_h(rid, t.pump, l, v, SUG);
    }
    let (bb, _, _) = item(t.pump, "Brass Bushing Condition Within Tolerance Limits");
    let _ = cl(rid, bb, "Fail", "Moderate", Some("Light scoring on the brass bushing, still inside the wear limit."), Some("Re-measured; still within wear limit, monitor at next report"), &t.today.clone(), "Pending", SUG, false);
    footer(t, rid, t.pump, SUG, ABD);
    t.refused("Submit refused (Yellow, no exemption)", submit_mri_report(rid, SUG.into()), "no valid MOC exemption");
    t.eq("left as Draft", status_of(rid), "Draft".into());
}

fn d7_equipment_limitations(t: &mut T) {
    let id = rect_for(t, "r2", t.pump, "Agitator");
    t.accepted("limitations recorded", record_equipment_limitations(id, "Do not run unit above 50% pump rate. Agitator isolated and locked out.".into(), ABD.into()));
    let r = qrows("SELECT limitations_note, limitations_informed_by, limitations_informed_date FROM mri_fault_rectifications WHERE id = ?1", &[&id]);
    t.ok("note, informed-by and date saved", r.first().map_or(false, |r| r[0].starts_with("Do not run") && r[1] == ABD && r[2] != "NULL"), format!("{:?}", r));
}

fn d8_verify_rules(t: &mut T) {
    let id = rect_for(t, "r2", t.pump, "Breather");
    t.info("matrix parts status 'Received'", "the app offers Awaiting / Ordered / Available; 'Available' is used");
    t.refused("verify without function test refused", verify_mri_fault_rectification(id, DIS.into(), false), "function test");
    let _ = rect_update(id, Some("Ahmed Khan"), "Available", None, DIS);
    t.refused("verify without repair date refused", verify_mri_fault_rectification(id, DIS.into(), true), "repair date");
    let _ = rect_update(id, Some("Ahmed Khan"), "Available", Some(&t.today.clone()), DIS);
    t.accepted("verify with repair date", verify_mri_fault_rectification(id, DIS.into(), true));
    let r = qrows("SELECT tag_status, verified_by, verified_date FROM mri_fault_rectifications WHERE id = ?1", &[&id]);
    t.ok("repair Green with verifier and date", r.first().map_or(false, |r| r[0] == "Green" && r[1] == DIS && r[2] != "NULL"), format!("{:?}", r));
    t.eq("unit stays Yellow", tag(t.asset2), Some("Yellow".into()));
}

fn d9_verify_second(t: &mut T) {
    let id = rect_for(t, "r2", t.pump, "Agitator");
    let _ = rect_update(id, Some("Ahmed Khan"), "Available", Some(&t.today.clone()), DIS);
    t.accepted("verify Agitator", verify_mri_fault_rectification(id, DIS.into(), true));
    t.eq("ASSET2 Green", tag(t.asset2), Some("Green".into()));
    t.eq("Green Tagged footer true", fval(t.rid("r2"), t.pump, "Green Tagged"), Some("true".into()));
}

fn d10_tag_history(t: &mut T) {
    let mut h = get_asset_tag_history(t.asset2).unwrap_or_default();
    h.reverse();
    let seq: Vec<String> = h.iter().map(|e| e.tag_status.clone()).collect();
    t.eq("Green (C1), Red, Yellow, Red, Yellow, Green", seq, vec!["Green", "Red", "Yellow", "Red", "Yellow", "Green"].into_iter().map(String::from).collect());
    t.matrix("D10 expects Red, Yellow, Red, Yellow, Green", "the history starts with the Green status set by the C1 Moderate decision (Manual 8.1: a serviceable unit is Green / Ready for Service), so the matrix list is missing that first Green entry.");
    t.ok("each entry has reason, report number and user", h.iter().all(|e| e.reason.as_deref().map_or(false, |r| !r.is_empty()) && e.report_id.is_some() && e.changed_by.as_deref().map_or(false, |c| !c.is_empty())), "");
}

fn d11_close_planned_followup(t: &mut T) {
    let id = rect_for(t, "r2", t.pump, "Air Filter");
    let n0 = tag_hist_count(t.asset2);
    t.accepted("Update Plan", rect_update(id, Some("Ahmed Khan"), "Available", Some(&t.today.clone()), DIS));
    t.eq("tag stays Green after plan", tag(t.asset2), Some("Green".into()));
    t.accepted("Verify & Close Follow-up", verify_mri_fault_rectification(id, DIS.into(), true));
    let r = qrows("SELECT tag_status, verified_by, verified_date FROM mri_fault_rectifications WHERE id = ?1", &[&id]);
    t.ok("verifier and date recorded", r.first().map_or(false, |r| r[0] == "Green" && r[1] == DIS && r[2] != "NULL"), format!("{:?}", r));
    t.ok("row leaves the queue", !get_pending_mri_fault_rectifications(t.u(DIS)).unwrap_or_default().iter().any(|x| x.id == id), "");
    t.eq("tag never changed (no history rows added)", tag_hist_count(t.asset2), n0);
}

fn d12_planned_never_changes_green(t: &mut T) {
    let id = rect_for(t, "rC9", t.ctu, "Ball Valves");
    t.eq("ASSET1 Green before", tag(t.asset1), Some("Green".into()));
    t.accepted("plan Ball Valves (Bilal Ahmed)", rect_update(id, Some("Bilal Ahmed"), "Awaiting", None, DIS));
    t.eq("ASSET1 stays Green", tag(t.asset1), Some("Green".into()));
}

fn d13_submit_close_report_3(t: &mut T) {
    let rid = t.rid("r3");
    t.accepted("Submit now that ASSET2 is Green", submit_mri_report(rid, SUG.into()));
    // Manual Rev 02 Table 3: a Moderate fault is reviewed by the Operations Coordinator /
    // Maintenance Supervisor, so a report carrying one cannot be closed directly.
    t.refused("Close & Approve refused: Report 3 carries a Moderate fault (Table 3 review)", review_and_close_mri_report(rid, ABD.into()), "use Endorse Report");
    t.matrix("D13 step 2 says press Close & Approve", "Report 3 carries the Brass Bushing Fail (Moderate), as D5/D6 require. Manual Table 3, Moderate row: 'Review Authority: Operations Coordinator / Maintenance Supervisor'; Clarification (K. Shahzad, tier table): reports with moderate/major/critical faults cannot be closed independently and Tier 2 'review Moderate faults and confirm their classification', so the report must be endorsed, reviewed and then closed. The run did that: endorse to Disantha, Approve Brass Bushing, Close.");
    t.accepted("endorse to Disantha", endorse_mri_report(rid, ABD.into(), t.u(DIS)));
    let bb = item(t.pump, "Brass Bushing Condition Within Tolerance Limits").0;
    if let Some((aid, ..)) = approval(rid, bb) {
        t.accepted("Disantha approves Brass Bushing", decide(aid, "Approved", None, DIS, "In-Person", "Still within wear limit; approved (added by the test run per Table 3).", DIS, false, None, None));
    }
    t.accepted("Close", close_mri_report(rid, ABD.into()));
    t.eq("Report 3 Approved", status_of(rid), "Approved".into());
    t.eq("ASSET2 stays Green", tag(t.asset2), Some("Green".into()));
}

// ================================================================ E

fn e1_open_job_list(t: &mut T) {
    let _ = ex("INSERT OR REPLACE INTO open_job_numbers (job_number, downloaded_at) VALUES ('JSR-2026-0900', datetime('now'))", &[]);
    let rows = qrows("SELECT job_number FROM open_job_numbers", &[]);
    t.eq("list holds JSR-2026-0900 only", rows, vec![vec!["JSR-2026-0900".to_string()]]);
}

fn e2_post_job_critical(t: &mut T) {
    let rid = new_report(t.pump, t.asset2, Some(t.left));
    let Some(rid) = t.accepted("Draft created", rid) else { return };
    t.r.insert("rE2", rid);
    let tpl = t.pump;
    let prev = get_previous_engine_hours(t.asset2, rid).ok().flatten();
    t.eq("Previous Engine Hours (auto) = 220", prev.as_deref().and_then(|v| v.parse::<f64>().ok()), Some(220.0));
    open_wizard(t, rid, tpl, t.asset2, SUG);
    default_items(t, rid, tpl, t.asset2, SUG);
    for (l, v) in [("Client", "Test Client"), ("Location", "Test Well TW-21"), ("Compliance Stage", "POST JOB"), ("Job Operating Hours", "12")] {
        let _ = set_h(rid, tpl, l, v, SUG);
    }
    type_engine_hours(rid, tpl, t.asset2, 370.0, SUG);
    t.eq("Engine Hours (This Report) = 150", hval(rid, tpl, "Engine Hours (This Report)"), Some("150.0".into()));
    let _ = set_mri_report_mid_value(rid, mf(tpl, "Distance Travelled Post-Job (KM)"), "300".into(), None, Some(SUG.into()));
    let (asl, _, sev) = item(tpl, "Air Supply Line");
    t.eq("Air Supply Line default Critical", sev.as_str(), "Critical");
    let _ = cl(rid, asl, "Fail", "Critical", Some("Air supply line fitting cracked, supply pressure dropping."), Some("Line isolated and depressurised, fitting replacement requested. Not repaired on site."), &t.today.clone(), "Pending", SUG, false);
    footer(t, rid, tpl, SUG, ABD);
    t.refused("Submit refused with Job Number empty", submit_mri_report(rid, SUG.into()), "Job Number is required for a Post-Job report");
    let _ = set_h(rid, tpl, "Job Number", "JSR-2026-0142", SUG);
    t.accepted("Submit", submit_mri_report(rid, SUG.into()));
    t.eq("ASSET2 Red at once", tag(t.asset2), Some("Red".into()));
    t.ok("reason Critical fault reported", tag_reason(t.asset2).starts_with("Critical fault reported"), tag_reason(t.asset2));
    t.eq("job_number_status", qs("SELECT job_number_status FROM mri_reports WHERE id = ?1", &[&rid]), Some("Not on open-job list - supervisor to check".into()));
}

fn e3_escalate_and_approve(t: &mut T) {
    let rid = t.rid("rE2");
    t.accepted("endorse to Kamil", endorse_mri_report(rid, ABD.into(), t.u(KAM)));
    let asl = item(t.pump, "Air Supply Line").0;
    let aid = approval(rid, asl).unwrap().0;
    t.accepted("Kamil approves", decide(aid, "Approved", None, KAM, "In-Person", "Critical confirmed.", KAM, false, None, None));
    t.eq("Red repair created", rect(aid).map(|r| r.1), Some("Red".into()));
    t.eq("ASSET2 stays Red", tag(t.asset2), Some("Red".into()));
}

fn e4_close_post_job_triggers(t: &mut T) {
    let rid = t.rid("rE2");
    let ca_before = trig(t.asset2, "MR-II", "CA");
    t.accepted("Close", close_mri_report(rid, ABD.into()));
    t.eq("status Approved", status_of(rid), "Approved".into());
    let _ = get_asset_triggers(t.asset2);
    t.eq("EH running 370", trig(t.asset2, "MR-II", "EH"), 370);
    t.eq("KM running 600", trig(t.asset2, "MR-II", "KM"), 600);
    t.eq("OH running 12", trig(t.asset2, "MR-II", "OH"), 12);
    t.ok("EH in warning (>= 350, < 400)", (350..400).contains(&trig(t.asset2, "MR-II", "EH")), "");
    t.eq("CA unchanged", trig(t.asset2, "MR-II", "CA"), ca_before);
    t.eq("ASSET2 stays Red", tag(t.asset2), Some("Red".into()));
}

fn e5_red_premob_refused(t: &mut T) {
    let rid = new_report(t.pump, t.asset2, Some(t.left));
    let Some(rid) = t.accepted("Draft created", rid) else { return };
    t.r.insert("rE5", rid);
    open_wizard(t, rid, t.pump, t.asset2, SUG);
    default_items(t, rid, t.pump, t.asset2, SUG);
    for (l, v) in [("Client", "Test Client"), ("Location", "Karachi Yard"), ("Compliance Stage", "PREMOB"), ("Pre-Mobilization Checklist ID", "PMC-2026-0090")] {
        let _ = set_h(rid, t.pump, l, v, SUG);
    }
    footer(t, rid, t.pump, SUG, ABD);
    t.refused("Pre-Mob refused (Red, no exemption)", submit_mri_report(rid, SUG.into()), "no valid MOC exemption");
}

fn e6_red_prejob_refused(t: &mut T) {
    let rid = t.rid("rE5");
    let _ = set_h(rid, t.pump, "Compliance Stage", "PRE-JOB", SUG);
    t.refused("Pre-Job refused too", submit_mri_report(rid, SUG.into()), "no valid MOC exemption");
}

fn e7_moc_exemption(t: &mut T) {
    let rid = t.rid("rE5");
    let (asset2, today, plus7) = (t.asset2, t.today.clone(), t.plus7.clone());
    let inp = move |rc: &str| MocExemptionInput {
        asset_id: asset2,
        moc_reference: "MOC-2026-014".into(),
        approved_by: KAM.into(),
        limitations: "Operate below 50% pump rate, air supply line monitored.".into(),
        required_controls: "Supervisor on location, daily valve check.".into(),
        valid_from: today.clone(),
        valid_until: plus7.clone(),
        return_conditions: rc.into(),
    };
    let blank = probe(|| create_moc_exemption(inp(""), KAM.into()));
    t.info("matrix gives no 'Conditions for return to service'", format!("the app requires it ({:?}); the run uses 'Air supply line repaired and verified.'", blank));
    t.accepted("exemption recorded", create_moc_exemption(inp("Air supply line repaired and verified."), KAM.into()));
    let ex = get_moc_exemptions(t.asset2).unwrap_or_default();
    t.ok("shown Active and valid", ex.first().map_or(false, |e| e.status == "Active" && e.is_valid), "");
    let _ = set_h(rid, t.pump, "Compliance Stage", "PREMOB", SUG);
    t.accepted("Pre-Mob submits", submit_mri_report(rid, SUG.into()));
}

fn e8_close_premob(t: &mut T) {
    let rid = t.rid("rE5");
    t.accepted("Close & Approve", review_and_close_mri_report(rid, ABD.into()));
    t.eq("status Approved", status_of(rid), "Approved".into());
}

fn e9_revoke_yard_postjob(t: &mut T) {
    let ex_id = get_moc_exemptions(t.asset2).unwrap_or_default().first().map(|e| e.id).unwrap();
    t.refused("revoke without a reason refused", revoke_moc_exemption(ex_id, KAM.into(), "".into()), "reason is required");
    t.info("matrix gives no revoke reason", "the app requires one; the run uses 'Test E9'");
    t.accepted("revoke", revoke_moc_exemption(ex_id, KAM.into(), "Test E9".into()));
    t.eq("registry shows Revoked", get_moc_exemptions(t.asset2).ok().and_then(|v| v.first().map(|e| e.status.clone())), Some("Revoked".into()));
    // Report A
    let ra = new_report(t.pump, t.asset2, Some(t.left));
    let Some(ra) = t.accepted("Report A Draft", ra) else { return };
    t.r.insert("rE9A", ra);
    open_wizard(t, ra, t.pump, t.asset2, SUG);
    default_items(t, ra, t.pump, t.asset2, SUG);
    for (l, v) in [("Client", "Test Client"), ("Location", "Karachi Yard"), ("Compliance Stage", "PREMOB"), ("Pre-Mobilization Checklist ID", "PMC-2026-0091")] {
        let _ = set_h(ra, t.pump, l, v, SUG);
    }
    footer(t, ra, t.pump, SUG, ABD);
    t.refused("Pre-Mob refused (no exemption)", submit_mri_report(ra, SUG.into()), "no valid MOC exemption");
    let _ = set_h(ra, t.pump, "Compliance Stage", "YARD INSPECTION", SUG);
    t.accepted("Yard Inspection submits", submit_mri_report(ra, SUG.into()));
    t.accepted("Abdulla closes Report A", review_and_close_mri_report(ra, ABD.into()));
    // Report B
    let rb = new_report(t.pump, t.asset2, Some(t.left));
    let Some(rb) = t.accepted("Report B Draft", rb) else { return };
    t.r.insert("rE9B", rb);
    t.eq("Report B Previous Engine Hours (auto) = 370", get_previous_engine_hours(t.asset2, rb).ok().flatten().and_then(|v| v.parse::<f64>().ok()), Some(370.0));
    open_wizard(t, rb, t.pump, t.asset2, SUG);
    default_items(t, rb, t.pump, t.asset2, SUG);
    for (l, v) in [("Client", "Test Client"), ("Location", "Test Well TW-21"), ("Compliance Stage", "POST JOB"), ("Job Number", "JSR-2026-0144"), ("Job Operating Hours", "8")] {
        let _ = set_h(rb, t.pump, l, v, SUG);
    }
    type_engine_hours(rb, t.pump, t.asset2, 380.0, SUG);
    let _ = set_mri_report_mid_value(rb, mf(t.pump, "Distance Travelled Post-Job (KM)"), "20".into(), None, Some(SUG.into()));
    footer(t, rb, t.pump, SUG, ABD);
    t.accepted("Post Job submits (Red, no exemption)", submit_mri_report(rb, SUG.into()));
    t.accepted("Abdulla closes Report B", review_and_close_mri_report(rb, ABD.into()));
    t.eq("EH 380", trig(t.asset2, "MR-II", "EH"), 380);
    t.eq("KM 620", trig(t.asset2, "MR-II", "KM"), 620);
    t.eq("OH 20", trig(t.asset2, "MR-II", "OH"), 20);
}

fn e10_repair_verify_asset2(t: &mut T) {
    let id = rect_for(t, "rE2", t.pump, "Air Supply Line");
    t.accepted("assign Bilal Ahmed", rect_update(id, Some("Bilal Ahmed"), "Awaiting", None, DIS));
    t.eq("ASSET2 Yellow", tag(t.asset2), Some("Yellow".into()));
    let _ = rect_update(id, Some("Bilal Ahmed"), "Available", Some(&t.today.clone()), DIS);
    t.accepted("verify", verify_mri_fault_rectification(id, DIS.into(), true));
    t.eq("ASSET2 Green", tag(t.asset2), Some("Green".into()));
}

fn e11_copy_last_post_job(t: &mut T) {
    let rb = t.rid("rE9B");
    let info = get_last_post_job_info(t.asset2, Some(t.left)).ok().flatten();
    t.eq("last Post-Job is Report B and within 72 h", info.as_ref().map(|i| (i.report_id, i.within_72h)), Some((rb, true)));
    let rid = create_mri_report_from_last_post_job(t.asset2, t.pump, Some(t.left));
    let Some(rid) = t.accepted("copy created", rid) else { return };
    let tpl = t.pump;
    t.eq("Client copied", hval(rid, tpl, "Client"), Some("Test Client".into()));
    t.eq("Location copied", hval(rid, tpl, "Location"), Some("Test Well TW-21".into()));
    t.eq("Maintenance Type same as Report B", hval(rid, tpl, "Maintenance Type"), hval(rb, tpl, "Maintenance Type"));
    t.eq("Compliance Stage set to PREMOB", hval(rid, tpl, "Compliance Stage"), Some("PREMOB".into()));
    for l in ["Job Number", "MR Initization Date", "Current Engine Hours", "Engine Hours (This Report)", "Pre-Mobilization Checklist ID"] {
        t.eq(&format!("{} not copied", l), hval(rid, tpl, l), None);
    }
    for n in ["Access Ladders & Handrails", "Air Hoses", "Alternator"] {
        t.eq(&format!("Pass on {}", n), result_row(rid, item(tpl, n).0).and_then(|r| r.status), Some("Pass".into()));
    }
    t.r.insert("rE11", rid);
    it_delete_asset2_drafts(t, "E11");
}

const MATRIX_DELETE_DRAFT: &str = "DELETE FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2')";

/// Runs the matrix's "IT deletes the Draft" SQL exactly as written. If it fails, records a
/// matrix issue and removes the Draft properly (child rows first) so the next case starts
/// from the state the matrix intends.
fn it_delete_asset2_drafts(t: &mut T, case: &str) {
    match ex(MATRIX_DELETE_DRAFT, &[]) {
        Ok(n) => t.info("IT deletes the Draft (matrix SQL)", format!("{} row(s) deleted", n)),
        Err(e) => {
            t.matrix(
                "IT delete SQL fails as written",
                format!("\"{}\" -> {}. The Draft has child rows (header values, checklist results...) and the app enables foreign keys, so the matrix SQL cannot delete it. The run deleted the child rows first, then the Draft.", MATRIX_DELETE_DRAFT, e),
            );
            let sub = "(SELECT id FROM mri_reports WHERE status='Draft' AND asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2'))";
            for tbl in ["mri_report_header_values", "mri_report_checklist_results", "mri_report_mid_values", "mri_report_footer_values", "mri_report_attachments", "mri_checklist_action_log", "mri_onsite_repair_log"] {
                let _ = ex(&format!("DELETE FROM {} WHERE report_id IN {}", tbl, sub), &[]);
            }
            let res = ex(MATRIX_DELETE_DRAFT, &[]);
            t.info(&format!("{}: corrected cleanup", case), format!("{:?} Draft(s) deleted", res));
        }
    }
}

fn e12_over_72h(t: &mut T) {
    let n = ex("UPDATE mri_reports SET submitted_date = CAST(CAST(strftime('%s','now') AS INTEGER) - 96*3600 AS TEXT) WHERE id = (SELECT MAX(id) FROM mri_reports WHERE asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2') AND status<>'Draft')", &[]);
    t.eq("IT SQL updated one row", n, Ok(1));
    let info = get_last_post_job_info(t.asset2, Some(t.left)).ok().flatten();
    t.eq("not within 72 h", info.map(|i| i.within_72h), Some(false));
    let r = probe(|| create_mri_report_from_last_post_job(t.asset2, t.pump, Some(t.left)));
    t.refused("copy refused over 72 h", r, "Over 72 hours");
    let fresh = new_report(t.pump, t.asset2, Some(t.left));
    if let Some(fid) = t.accepted("Start a new report", fresh) {
        let leftover = qi("SELECT COUNT(*) FROM mri_report_header_values WHERE report_id = ?1", &[&fid]).unwrap_or(0);
        t.ok("it is a fresh empty Draft (not the E11 copy)", leftover == 0, format!("report #{} (E11 copy was #{}), {} header row(s) present", fid, t.r.get("rE11").copied().unwrap_or(0), leftover));
    }
    it_delete_asset2_drafts(t, "E12");
}

fn e13_day8_standby(t: &mut T) {
    let n = ex("UPDATE mri_reports SET submitted_date = CAST(CAST(strftime('%s','now') AS INTEGER) - 170*3600 AS TEXT) WHERE id = (SELECT MAX(id) FROM mri_reports WHERE asset_id=(SELECT id FROM assets WHERE asset_code='ASSET2') AND status<>'Draft')", &[]);
    t.eq("IT SQL updated one row", n, Ok(1));
    let rem = get_standby_prejob_reminders().unwrap_or_default();
    let r = rem.iter().find(|r| r.asset_code == "ASSET2");
    t.eq("ASSET2 listed, day 8", r.map(|r| r.days_since), Some(8));
}

// ================================================================ F

fn f1_report_f1(t: &mut T) {
    let rid = new_report(t.ctu, t.asset1, None);
    let Some(rid) = t.accepted("ASSET1 Draft created", rid) else { return };
    t.r.insert("rF1", rid);
    let tpl = t.ctu;
    open_wizard(t, rid, tpl, t.asset1, SUG);
    default_items(t, rid, tpl, t.asset1, SUG);
    for (l, v) in [("Client", "Test Client"), ("Location", "Test Well TW-21"), ("Compliance Stage", "PRE-JOB"), ("Pre-Mobilization Checklist ID", "PMC-2026-0112")] {
        let _ = set_h(rid, tpl, l, v, SUG);
    }
    let _ = cl(rid, item(tpl, "Air Hose & Coupling Connection").0, "Fail", "Moderate", Some("Coupling connection leaking at the 3,000 psi test."), Some("Coupling retightened, leak persists at 3,000 psi; hose replacement requested."), &t.yesterday.clone(), "Pending", SUG, false);
    let _ = cl(rid, item(tpl, "Chain & Drive System").0, "Fail", "Moderate", Some("Chain link stretched, roller seized on drive side."), Some("Chain lubricated and adjusted, replacement requested."), &t.today.clone(), "Pending", SUG, false);
    footer(t, rid, tpl, SUG, ABD);
    t.accepted("Submit", submit_mri_report(rid, SUG.into()));
    t.accepted("endorse to Disantha", endorse_mri_report(rid, ABD.into(), t.u(DIS)));
    t.eq("Escalated", status_of(rid), "Escalated".into());
    let ap = qrows("SELECT decision, assigned_to_user_id FROM mri_fault_approvals WHERE report_id = ?1", &[&rid]);
    let d = t.u(DIS).to_string();
    t.ok("two Pending approvals for Disantha", ap.len() == 2 && ap.iter().all(|r| r[0] == "Pending" && r[1] == d), format!("{:?}", ap));
    t.eq("ASSET1 stays Green", tag(t.asset1), Some("Green".into()));
}

fn f2_reminder(t: &mut T) {
    let rid = t.rid("rF1");
    let aid = approval(rid, item(t.ctu, "Air Hose & Coupling Connection").0).unwrap().0;
    t.refused("reminder from a non-manager (Abdulla) refused", send_fault_reminder(aid, t.u(ABD)), "Only a manager");
    t.accepted("Kamil sends a reminder", send_fault_reminder(aid, t.u(KAM)));
    let row = get_pending_mri_fault_approvals(t.u(KAM)).unwrap_or_default().into_iter().find(|p| p.id == aid);
    t.ok("row shows reminder from Kamil with time", row.as_ref().map_or(false, |r| r.last_reminder_by.as_deref() == Some(KAM) && r.last_reminder_at.is_some()), "");
}

fn f3_approve_with_inform(t: &mut T) {
    let rid = t.rid("rF1");
    let aid = approval(rid, item(t.ctu, "Chain & Drive System").0).unwrap().0;
    let ack: Vec<String> = get_assignable_mri_reviewers(vec!["mri.acknowledge_critical".into()], Some("PAKISTAN".into())).unwrap_or_default().into_iter().map(|u| u.name).collect();
    t.ok("Kamil offered as person to be informed", ack.contains(&KAM.to_string()), format!("{:?}", ack));
    t.accepted("Approve, inform Kamil", decide(aid, "Approved", None, DIS, "In-Person", "Approved.", DIS, false, None, Some(t.u(KAM))));
    let q = get_mri_fault_decisions_pending_acknowledgment(t.u(KAM)).unwrap_or_default();
    t.ok("acknowledgement queued for Kamil", q.iter().any(|r| r.id == aid), "");
    let q2 = get_mri_fault_decisions_pending_acknowledgment(t.u(JAN)).unwrap_or_default();
    t.ok("not queued for someone else (Jan-Albert)", !q2.iter().any(|r| r.id == aid), "");
}

fn f4_phone_relay_provisional(t: &mut T) {
    let rid = t.rid("rF1");
    let aid = approval(rid, item(t.ctu, "Air Hose & Coupling Connection").0).unwrap().0;
    let p = perms(t.u(ABD));
    t.ok("Abdulla holds Record provisional and not Approve", p.contains(&"mri.record_provisional".to_string()) && !p.contains(&"mri.approve".to_string()), "");
    let row = get_pending_mri_fault_approvals(t.u(ABD)).unwrap_or_default().into_iter().find(|r| r.id == aid);
    t.ok("Abdulla sees the fault and can act (relay)", row.map_or(false, |r| r.can_act), "");
    t.accepted("phone relay recorded", decide(aid, "Approved", None, DIS, "Phone", "Relayed by phone from Disantha Perera.", ABD, true, None, None));
    t.eq("Provisional", approval(rid, item(t.ctu, "Air Hose & Coupling Connection").0).and_then(|a| a.4), Some("Provisional".into()));
    t.refused("close refused while Provisional", close_mri_report(rid, ABD.into()), "confirmed");
}

fn f5_confirm_provisional(t: &mut T) {
    let rid = t.rid("rF1");
    let aid = approval(rid, item(t.ctu, "Air Hose & Coupling Connection").0).unwrap().0;
    t.ok("listed in Awaiting Confirmation for Disantha", get_provisional_mri_fault_approvals(t.u(DIS)).unwrap_or_default().iter().any(|r| r.id == aid), "");
    t.accepted("confirm", confirm_provisional_approval(aid, DIS.into()));
    let r = qrows("SELECT provisional_status, confirmed_by, confirmed_date FROM mri_fault_approvals WHERE id = ?1", &[&aid]);
    t.ok("Confirmed with name and date", r.first().map_or(false, |r| r[0] == "Confirmed" && r[1] == DIS && r[2] != "NULL"), format!("{:?}", r));
}

fn f6_close_without_ack(t: &mut T) {
    let rid = t.rid("rF1");
    t.accepted("Close", close_mri_report(rid, ABD.into()));
    t.eq("Approved without the acknowledgement", status_of(rid), "Approved".into());
}

fn f7_acknowledge(t: &mut T) {
    let rid = t.rid("rF1");
    let aid = approval(rid, item(t.ctu, "Chain & Drive System").0).unwrap().0;
    t.accepted("acknowledge", acknowledge_mri_fault_decision(aid, KAM.into()));
    let r = qrows("SELECT acknowledged_by, acknowledged_date FROM mri_fault_approvals WHERE id = ?1", &[&aid]);
    t.ok("name and date recorded", r.first().map_or(false, |r| r[0] == KAM && r[1] != "NULL"), format!("{:?}", r));
    t.refused("second attempt refused", acknowledge_mri_fault_decision(aid, KAM.into()), "already acknowledged");
}

fn f8_decision_log(t: &mut T) {
    let r2 = t.rid("r2");
    let aid = approval(r2, item(t.pump, "Breather").0).unwrap().0;
    let log: Vec<FaultDecisionLogRow> = get_mri_fault_decision_log(r2).unwrap_or_default().into_iter().filter(|l| l.fault_approval_id == aid).collect();
    let acts: Vec<String> = log.iter().map(|l| l.action.clone()).collect();
    t.ok("Escalated then Approved, in order", acts.ends_with(&["Escalated".to_string(), "Approved".to_string()]), format!("{:?}", acts));
    t.ok("each row has reviewer, method, provisional flag and recorder", log.iter().all(|l| !l.reviewer.is_empty() && !l.review_method.is_empty() && !l.recorded_by.is_empty()), "");
    if !acts.first().map_or(false, |a| a == "Pending") {
        t.info("no 'Pending' row in mri_fault_decision_log", "the matrix lists Pending, Escalated, Approved; the stored log starts at Escalated (endorsing does not log). Phase 2 checks whether the screen shows a Pending entry.");
    }
    t.info("log cannot be edited", "no update/delete command exists for mri_fault_decision_log");
}

fn f9_repaired_on_site(t: &mut T) {
    let rid = new_report(t.ctu, t.asset1, None);
    let Some(rid) = t.accepted("ASSET1 Draft created", rid) else { return };
    t.r.insert("rF9", rid);
    let tpl = t.ctu;
    open_wizard(t, rid, tpl, t.asset1, SUG);
    default_items(t, rid, tpl, t.asset1, SUG);
    for (l, v) in [("Client", "Test Client"), ("Location", "Test Well TW-21"), ("Compliance Stage", "POST JOB"), ("Job Number", "JSR-2026-0163"), ("Job Operating Hours", "10")] {
        let _ = set_h(rid, tpl, l, v, SUG);
    }
    let bv = item(tpl, "Ball Valves").0;
    let d = t.today.clone();
    t.refused("tick refused with issue description empty", cl(rid, bv, "Fail", "Critical", None, None, &d, "Pending", SUG, true), "Add issue details before marking this fault as repaired on site");
    t.refused("tick refused with Action Taken empty", cl(rid, bv, "Fail", "Critical", Some("Ball valve seat replaced on site during job."), None, &d, "Pending", SUG, true), "Describe the repair in Action Taken");
    t.accepted("tick accepted", cl(rid, bv, "Fail", "Critical", Some("Ball valve seat replaced on site during job."), Some("Seat replaced and function test performed at 3,000 psi."), &d, "Pending", SUG, true));
    t.eq("item shows Closed", result_row(rid, bv).map(|r| r.closure_status), Some("Closed".into()));
    let _ = add_mri_report_attachment(rid, bv, "ball_valve_repair.png".into(), "image/png".into(), PNG_1PX.into(), Some(SUG.into()));
    footer(t, rid, tpl, SUG, ABD);
    t.accepted("Submit", submit_mri_report(rid, SUG.into()));
    t.eq("ASSET1 stays Green", tag(t.asset1), Some("Green".into()));
    t.eq("photo still attached", get_mri_report_attachments(rid).map(|v| v.len()), Ok(1));
    t.eq("Date Observed today", result_row(rid, bv).and_then(|r| r.date_observed), Some(d.clone()));
    let close = probe(|| review_and_close_mri_report(rid, ABD.into()));
    t.accepted("Close & Approve available without escalation (probe, rolled back)", close);
    t.eq("mri_onsite_repair_log has one row", qi("SELECT COUNT(*) FROM mri_onsite_repair_log WHERE report_id = ?1 AND template_checklist_item_id = ?2", &[&rid, &bv]), Some(1));
}

// ================================================================ G

fn g1_report_g1(t: &mut T) {
    let rid = new_report(t.pump, t.asset2, Some(t.left));
    let Some(rid) = t.accepted("Draft created", rid) else { return };
    t.r.insert("rG1", rid);
    open_wizard(t, rid, t.pump, t.asset2, SUG);
    default_items(t, rid, t.pump, t.asset2, SUG);
    let fails = get_mri_report_checklist_results(rid).unwrap_or_default().into_iter().filter(|r| r.status.as_deref() == Some("Fail")).count();
    t.eq("no carried Fails (all items Pass)", fails, 0);
    for (l, v) in [("Client", "Test Client"), ("Location", "Test Well TW-21"), ("Compliance Stage", "PRE-JOB"), ("Pre-Mobilization Checklist ID", "PMC-2026-0104")] {
        let _ = set_h(rid, t.pump, l, v, SUG);
    }
    footer(t, rid, t.pump, SUG, ABD);
    t.accepted("Submit", submit_mri_report(rid, SUG.into()));
    t.eq("Submitted", status_of(rid), "Submitted".into());
}

fn g2_view_only(t: &mut T) {
    let p = perms(t.u(MAR));
    let bad: Vec<&String> = p.iter().filter(|x| x.starts_with("mri.")).collect();
    t.ok("Data Miner holds no MR-I action permission", bad.is_empty(), format!("{:?}", bad));
}

fn g3_override_edit_after_submit(t: &mut T) {
    let (s, rid) = (t.u(SUG), t.rid("rG1"));
    t.accepted("override granted", set_user_override(s, "mri.edit_after_submit".into(), Some(true)));
    t.ok("Suganya now holds mri.edit_after_submit", perms(s).contains(&"mri.edit_after_submit".to_string()), "");
    t.accepted("Location edited", set_h(rid, t.pump, "Location", "Test Well TW-22", SUG));
    t.accepted("override removed", set_user_override(s, "mri.edit_after_submit".into(), None));
    t.ok("Suganya no longer holds it", !perms(s).contains(&"mri.edit_after_submit".to_string()), "");
    t.info("editable / locked on screen", "screen check, Phase 2");
}

fn g4_override_endorse(t: &mut T) {
    let s = t.u(SUG);
    let _ = set_user_override(s, "mri.endorse_report".into(), Some(true));
    t.ok("Endorse granted by override", perms(s).contains(&"mri.endorse_report".to_string()), "");
    let _ = set_user_override(s, "mri.endorse_report".into(), None);
    t.ok("Endorse gone after removal", !perms(s).contains(&"mri.endorse_report".to_string()), "");
}

fn g5_country_restriction(t: &mut T) {
    let a = t.u(ABD);
    let rid = t.rid("rG1");
    t.accepted("Abdulla limited to UAE", set_user_country_access(a, vec!["UAE".into()]));
    let rows = get_reports_needing_supervisor_action(a).unwrap_or_default();
    t.ok("no PAKISTAN reports in Reports to Review", !rows.iter().any(|r| r.id == rid), format!("{} row(s)", rows.len()));
    t.refused("report flow refused", get_report_flow(rid, a).map(|_| ()), "outside your country access");
    t.info("asset list", "get_assets has no viewer filter; the asset list filter is in the UI (Phase 2)");
    let _ = set_user_country_access(a, vec![]);
    let rows = get_reports_needing_supervisor_action(a).unwrap_or_default();
    t.ok("reports return after removal", rows.iter().any(|r| r.id == rid), "");
}

fn g6_admin_not_actor(t: &mut T) {
    let p = perms(t.u(JESS));
    let held: Vec<&String> = p.iter().filter(|x| ["mri.endorse_report", "mri.approve", "mri.close_defect", "mri.rectify", "mri.confirm_provisional", "mri.record_provisional", "mri.enter_cost"].contains(&x.as_str())).collect();
    t.ok("Administrator holds no review permission", held.is_empty(), format!("{:?}", held));
    let lists: Vec<String> = [vec!["mri.close_defect".to_string(), "mri.approve".to_string()], vec!["mri.approve".to_string()], vec!["mri.acknowledge_critical".to_string()], vec!["mri.submit".to_string()]]
        .into_iter()
        .flat_map(|c| get_assignable_mri_reviewers(c, Some("PAKISTAN".into())).unwrap_or_default().into_iter().map(|u| u.name))
        .collect();
    t.ok("Jess absent from every reviewer list", !lists.contains(&JESS.to_string()), "");
}

fn g7_who_when_stamps(t: &mut T) {
    let rid = t.rid("rG1");
    let f = hf(t.pump, "Location");
    let r = qrows("SELECT updated_by, updated_at FROM mri_report_header_values WHERE report_id = ?1 AND template_header_field_id = ?2", &[&rid, &f]);
    t.ok("last editor and time recorded", r.first().map_or(false, |r| r[0] == SUG && r[1] != "NULL"), format!("{:?}", r));
}

// ================================================================ H

fn h1_cost_read_only(t: &mut T) {
    t.ok("Operator lacks mri.enter_cost", !perms(t.u(SUG)).contains(&"mri.enter_cost".to_string()), "");
    t.ok("Job Supervisor lacks mri.enter_cost", !perms(t.u(ABD)).contains(&"mri.enter_cost".to_string()), "");
}

fn h2_awaiting_cost(t: &mut T) {
    let rows = get_reports_awaiting_cost(t.u(JAN)).unwrap_or_default();
    let ids: Vec<i64> = rows.iter().map(|r| r.id).collect();
    let (g1, f9) = (t.rid("rG1"), t.rid("rF9"));
    t.ok("Report G1 and Report F9 listed", ids.contains(&g1) && ids.contains(&f9), format!("{:?}", ids));
}

fn h3_enter_cost(t: &mut T) {
    let rid = t.rid("rG1");
    t.accepted("2500 saved", set_mri_report_cost(rid, 2500.0, JAN.into()));
    t.accepted("2650 saved", set_mri_report_cost(rid, 2650.0, JAN.into()));
    let r = qrows("SELECT mr_cost, mr_cost_by, mr_cost_date FROM mri_reports WHERE id = ?1", &[&rid]);
    let good = r.first().map_or(false, |r| r[0].parse::<f64>().ok() == Some(2650.0) && r[1] == JAN && r[2] != "NULL");
    t.ok("amount, name and date", good, format!("{:?}", r));
    t.ok("G1 leaves the awaiting list", !get_reports_awaiting_cost(t.u(JAN)).unwrap_or_default().iter().any(|x| x.id == rid), "");
}

fn h4_invalid_costs(t: &mut T) {
    let rid = t.rid("rG1");
    t.refused("-100 refused", set_mri_report_cost(rid, -100.0, JAN.into()), "zero or a positive");
    t.refused("blank (NaN) refused", set_mri_report_cost(rid, f64::NAN, JAN.into()), "zero or a positive");
    t.info("message wording", "backend says 'Cost must be zero or a positive number'; the matrix expects the screen text 'Enter a valid cost (0 or more)' (Phase 2)");
}

fn h5_close_never_depends_on_cost(t: &mut T) {
    let f9 = t.rid("rF9");
    let g1 = t.rid("rG1");
    t.accepted("close ASSET1 Post Job (no cost)", review_and_close_mri_report(f9, ABD.into()));
    t.accepted("close Report G1 (cost 2650)", review_and_close_mri_report(g1, ABD.into()));
    t.eq("both Approved", (status_of(f9), status_of(g1)), ("Approved".into(), "Approved".into()));
}

fn h6_no_cost_on_draft(t: &mut T) {
    let rid = new_report(t.ctu, t.asset1, None);
    let Some(rid) = t.accepted("ASSET1 Draft started", rid) else { return };
    t.r.insert("rH6", rid);
    t.refused("cost refused on a Draft", set_mri_report_cost(rid, 100.0, JAN.into()), "once the report has been submitted");
}

fn h8_migration_state(t: &mut T) {
    let m = qrows("SELECT name FROM app_migrations", &[]);
    t.ok("mri1_audit_permissions present", m.iter().any(|r| r[0] == "mri1_audit_permissions"), format!("{:?}", m));
    let snap = || qrows("SELECT role, permission_code FROM role_permissions ORDER BY role, permission_code", &[]);
    let before = snap();
    for _ in 0..2 {
        let c = open_and_migrate_connection();
        t.ok("relaunch migration runs", c.is_ok(), c.err().unwrap_or_default());
    }
    t.eq("roles unchanged after two relaunches", snap(), before);
}

// ================================================================ J

fn j2_asset_flow(t: &mut T) {
    match get_asset_flow(t.asset2, t.u(JESS)) {
        Ok(f) => {
            let r2 = t.rid("r2");
            let rep = f.reports.iter().find(|r| r.id == r2);
            t.eq("Report 2: 5 faults, 0 open", rep.map(|r| (r.fault_count, r.open_fault_count)), Some((5, 0)));
            let r3 = t.rid("r3");
            t.ok("carried arc Report 2 -> Report 3", f.carries.iter().any(|c| c.from_report_id == r2 && c.to_report_id == r3), format!("{:?}", f.carries.iter().map(|c| (c.from_report_id, c.to_report_id)).collect::<Vec<_>>()));
            t.eq("tag boxes = tag history rows", f.tag_changes.len() as i64, tag_hist_count(t.asset2));
            t.ok("exemption box present", f.exemptions.iter().any(|e| e.moc_reference == "MOC-2026-014"), "");
            let keys: Vec<i64> = f.reports.iter().map(|r| r.submitted_date.as_deref().and_then(|s| s.parse().ok()).unwrap_or(i64::MAX)).collect();
            let sorted = { let mut d = keys.clone(); d.sort(); d };
            t.ok("reports in date order (drafts last)", keys == sorted, format!("ids {:?}", f.reports.iter().map(|r| r.id).collect::<Vec<_>>()));
            let enabled = qi("SELECT COUNT(*) FROM maintenance_triggers WHERE asset_id = ?1 AND enabled = 1", &[&t.asset2]).unwrap_or(-1);
            t.eq("enabled triggers available for the trigger boxes (screen shows enabled only)", f.triggers.iter().filter(|x| x.enabled).count() as i64, enabled);
        }
        Err(e) => {
            t.ok("asset flow opens", false, e);
        }
    }
}

fn j6_audit_in_flow(t: &mut T) {
    match get_report_flow(t.rid("r2"), t.u(DIS)) {
        Ok(f) => {
            let af = f.faults.iter().find(|x| x.item_name == "Air Filter");
            t.ok("Air Filter decision box has one audit row per logged decision", af.map_or(false, |x| x.log.len() as i64 == x.log_entries && x.log_entries >= 1), format!("{:?}", af.map(|x| x.log_entries)));
            let ac = f.faults.iter().find(|x| x.item_name == "Actuators on Control Panel");
            t.ok("Actuators decision box has its Rejected row", ac.map_or(false, |x| x.log.iter().any(|l| l.action == "Rejected")), "");
        }
        Err(e) => {
            t.ok("report flow opens", false, e);
        }
    }
}

fn j7_carried_in_link(t: &mut T) {
    let (r2, r3) = (t.rid("r2"), t.rid("r3"));
    match get_report_flow(r3, t.u(DIS)) {
        Ok(f) => {
            t.ok("Report 3 Carried in box from report #2", f.carried_in.iter().any(|c| c.from_report_id == r2 && c.item_name.starts_with("Brass Bushing")), "");
        }
        Err(e) => {
            t.ok("report 3 flow opens", false, e);
        }
    }
    match get_report_flow(r2, t.u(DIS)) {
        Ok(f) => {
            t.ok("Report 2 Brass Bushing box: carried forward to report #3", f.faults.iter().any(|x| x.item_name.starts_with("Brass Bushing") && x.carried_to_report_id == Some(r3)), "");
        }
        Err(e) => {
            t.ok("report 2 flow opens", false, e);
        }
    }
}

fn j9_country_limits_flows(t: &mut T) {
    let d = t.u(DIS);
    let rid = t.rid("r2");
    let _ = set_user_country_access(d, vec!["UAE".into()]);
    t.refused("report flow blocked", get_report_flow(rid, d).map(|_| ()), "outside your country access");
    t.refused("asset flow blocked", get_asset_flow(t.asset2, d).map(|_| ()), "outside your country access");
    let _ = set_user_country_access(d, vec![]);
    t.ok("report flow opens after restore", get_report_flow(rid, d).is_ok(), "");
    t.ok("asset flow opens after restore", get_asset_flow(t.asset2, d).is_ok(), "");
    let _ = set_user_country_access(t.u(JESS), vec!["UAE".into()]);
    t.ok("Administrator never blocked", get_report_flow(rid, t.u(JESS)).is_ok(), "");
    let _ = set_user_country_access(t.u(JESS), vec![]);
}

fn ui_only(t: &mut T) {
    t.info("screen-only case", "no backend rule to test; covered in Phase 2");
}

// ================================================================ driver

fn repo_root_mx() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..").canonicalize().unwrap()
}

#[test]
#[ignore]
fn mri_test_matrix_backend() {
    let root = repo_root_mx();
    let real = root.join("src/desktop/src-tauri/assets.db");
    let real_before = std::fs::metadata(&real).unwrap();
    let dir = root.join("e2e/run/rust");
    std::fs::create_dir_all(&dir).unwrap();
    for f in ["assets.db", "assets.db-wal", "assets.db-shm"] {
        let _ = std::fs::remove_file(dir.join(f));
    }
    std::fs::copy(root.join("e2e/run/assets.start.db"), dir.join("assets.db")).expect("e2e/run/assets.start.db must exist (run prep_clean_db first)");
    assert_ne!(real.canonicalize().unwrap(), dir.join("assets.db").canonicalize().unwrap());
    std::env::set_current_dir(&dir).unwrap();

    let d = |m: &str| qs(&format!("SELECT date('now','localtime'{})", m), &[]).unwrap();
    let mut users = BTreeMap::new();
    for r in qrows("SELECT name, id FROM app_users", &[]) {
        users.insert(r[0].clone(), r[1].parse().unwrap());
    }
    let mut t = T {
        cases: vec![],
        r: BTreeMap::new(),
        users,
        today: d(""),
        yesterday: d(",'-1 day'"),
        two_days_ago: d(",'-2 day'"),
        plus7: d(",'+7 day'"),
        asset1: qi("SELECT id FROM assets WHERE asset_code='ASSET1'", &[]).unwrap(),
        asset2: qi("SELECT id FROM assets WHERE asset_code='ASSET2'", &[]).unwrap(),
        ctu: qi("SELECT id FROM mri_templates WHERE template_name='COILED TUBING UNIT'", &[]).unwrap(),
        pump: qi("SELECT id FROM mri_templates WHERE template_name='PUMP UNIT'", &[]).unwrap(),
        left: qi("SELECT c.id FROM template_components c JOIN mri_templates m ON m.id = c.template_id WHERE m.template_name='PUMP UNIT' AND c.label='Left'", &[]).unwrap(),
        right: qi("SELECT c.id FROM template_components c JOIN mri_templates m ON m.id = c.template_id WHERE m.template_name='PUMP UNIT' AND c.label='Right'", &[]).unwrap(),
    };

    let cases: Vec<(&str, &str, fn(&mut T))> = vec![
        ("S2", "Seven users and roles", s2_users_and_roles),
        ("S3", "Template header fields", s3_template_fields),
        ("S4", "Administrator and FSM permissions", s4_admin_and_fsm_permissions),
        ("S5", "Starting state of the two assets", s5_asset_start_state),
        ("S6", "Permission seed", s6_permission_seed),
        ("S7", "Title bar", ui_only),
        ("A1", "Start the first report", a1_start_first_report),
        ("A2", "Starting again reopens the same Draft", a2_reopen_same_draft),
        ("A3", "Fill in Report 1", a3_fill_report_1),
        ("A3a", "Maintenance Type", a3a_maintenance_type),
        ("A4", "Compliance Stage is required", a4_compliance_stage_required),
        ("A5", "Checklist ID required (Pre-Job)", a5_checklist_id_required),
        ("A6", "Fail must have an issue description", a6_fail_needs_issue),
        ("A6a", "Action Taken needed to close", a6a_action_needed_to_close),
        ("A6d", "Action Taken needed to submit", a6d_action_needed_to_submit),
        ("A6e", "Closed needs issue and action", a6e_closed_needs_both),
        ("A6b", "Date / severity / closure", a6b_date_severity_closure),
        ("A6c", "Attachments", a6c_attachments),
        ("A7", "Submit Report 1", a7_submit_report_1),
        ("A8", "No new report while Submitted", a8_no_new_report_while_submitted),
        ("A9", "Operator cannot edit after submit", a9_operator_cannot_edit),
        ("A10", "Pre-Mob needs the Checklist ID", a10_premob_needs_checklist_id),
        ("B1", "Who sees what", b1_who_sees_what),
        ("B2", "No Endorse on Minor-only", b2_no_endorse_on_minor_only),
        ("B3", "Close & Approve Report 1", b3_close_report_1),
        ("B4", "Close & Approve ASSET1 Pre-Mob", b4_close_asset1_premob),
        ("B5", "Report 2 with five Moderates", b5_report_2_five_moderates),
        ("B6", "Moderates cannot be closed directly", b6_moderate_cannot_close_directly),
        ("B7", "Endorse needs a named reviewer", b7_endorse_needs_reviewer),
        ("B8", "No close while pending", b8_no_close_while_pending),
        ("C1", "Approve a Moderate", c1_approve_moderate),
        ("C2", "Reject a Moderate", c2_reject_moderate),
        ("C3", "Reclassify needs a severity", c3_reclassify_needs_severity),
        ("C4", "Carry a Moderate forward", c4_carry_forward_moderate),
        ("C5", "Raise to Critical (FSM only)", c5_raise_to_critical),
        ("C6", "Raise a second to Critical", c6_raise_second_to_critical),
        ("C7", "FSM approves both Criticals", c7_fsm_approves_both),
        ("C8", "Close Report 2 with repairs open", c8_close_with_repairs_open),
        ("C9", "First Critical on ASSET1", c9_first_critical_on_asset1),
        ("C10", "Endorse picker for Critical", c10_endorse_critical_picker),
        ("C10a", "Flow from Pending Approvals", c10a_flow_before_decisions),
        ("C11", "Critical: no carry / no Minor", c11_critical_cannot_carry_or_drop_to_minor),
        ("C12", "Critical lowered to Moderate", c12_lower_critical_to_moderate),
        ("C13", "Moderate lowered to Minor", c13_lower_moderate_to_minor),
        ("C14", "Close Report C9", c14_close_c9),
        ("D1", "Rectification Queue contents", d1_rectification_queue),
        ("D2", "One technician: not Yellow", d2_one_technician_not_yellow),
        ("D3", "Both assigned: Yellow", d3_both_assigned_yellow),
        ("D3a", "Flow from the Rectification Queue", d3a_flow_from_queue),
        ("D4", "Clearing a technician: Red", d4_clear_technician_red),
        ("D5", "Report 3 carried-forward fault", d5_report_3_carried_forward),
        ("D6", "Yellow: Pre-Job refused", d6_yellow_prejob_refused),
        ("D7", "Equipment limitations", d7_equipment_limitations),
        ("D8", "Verify rules", d8_verify_rules),
        ("D9", "Second repair verified: Green", d9_verify_second),
        ("D10", "Tag history", d10_tag_history),
        ("D11", "Close a Planned follow-up", d11_close_planned_followup),
        ("D12", "Planned follow-up on Green unit", d12_planned_never_changes_green),
        ("D13", "Submit and close Report 3", d13_submit_close_report_3),
        ("E1", "Cached open-job list", e1_open_job_list),
        ("E2", "Post Job with a Critical", e2_post_job_critical),
        ("E3", "Escalate and approve", e3_escalate_and_approve),
        ("E4", "Close Post Job, MR-II triggers", e4_close_post_job_triggers),
        ("E5", "Red: Pre-Mob refused", e5_red_premob_refused),
        ("E6", "Red: Pre-Job refused", e6_red_prejob_refused),
        ("E7", "MOC exemption and submit", e7_moc_exemption),
        ("E8", "Close the Pre-Mob", e8_close_premob),
        ("E9", "Revoke: Yard and Post Job allowed", e9_revoke_yard_postjob),
        ("E10", "Repair and verify ASSET2", e10_repair_verify_asset2),
        ("E11", "Copy last Post-Job (72 h)", e11_copy_last_post_job),
        ("E12", "Over 72 h: no copy", e12_over_72h),
        ("E13", "Day-8 stand-by reminder", e13_day8_standby),
        ("F1", "Report F1 with two Moderates", f1_report_f1),
        ("F2", "Reminder on a Pending fault", f2_reminder),
        ("F3", "Approve and name who is informed", f3_approve_with_inform),
        ("F4", "Phone relay is Provisional", f4_phone_relay_provisional),
        ("F5", "Confirm the provisional", f5_confirm_provisional),
        ("F6", "Close without acknowledgement", f6_close_without_ack),
        ("F7", "Acknowledge", f7_acknowledge),
        ("F8", "Decision log", f8_decision_log),
        ("F9", "Critical repaired on site", f9_repaired_on_site),
        ("G1", "Report G1", g1_report_g1),
        ("G2", "View only", g2_view_only),
        ("G3", "Override: edit after submit", g3_override_edit_after_submit),
        ("G4", "Override: endorse", g4_override_endorse),
        ("G5", "Country restriction", g5_country_restriction),
        ("G6", "Administrator not a workflow actor", g6_admin_not_actor),
        ("G7", "Who and when stamps", g7_who_when_stamps),
        ("H1", "Cost read-only for Operator / JS", h1_cost_read_only),
        ("H2", "Awaiting MR cost list", h2_awaiting_cost),
        ("H3", "Enter the cost", h3_enter_cost),
        ("H4", "Invalid costs refused", h4_invalid_costs),
        ("H5", "Closing never depends on cost", h5_close_never_depends_on_cost),
        ("H6", "No cost on a Draft", h6_no_cost_on_draft),
        ("H7", "Login-screen tier labels", ui_only),
        ("H8", "Migration state", h8_migration_state),
        ("J1", "Show flow on Asset Registry cards", ui_only),
        ("J2", "Asset history flow of ASSET2", j2_asset_flow),
        ("J3", "Moving between flows", ui_only),
        ("J4", "Open report / triggers from the flow", ui_only),
        ("J6", "Audit trail in the document flow", j6_audit_in_flow),
        ("J7", "Carried-in box link", j7_carried_in_link),
        ("J8", "Show flow from the dashboard", ui_only),
        ("J9", "Country access limits the flows", j9_country_limits_flows),
    ];

    for (id, title, f) in cases {
        println!("== {} {}", id, title);
        t.cases.push(MxCase { id: id.into(), title: title.into(), status: String::new(), checks: vec![], error: None });
        let res = std::panic::catch_unwind(AssertUnwindSafe(|| f(&mut t)));
        if let Err(e) = res {
            let msg = e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or("panic".into());
            println!("    [BLOCKED] {}", msg);
            t.cur().error = Some(msg);
        }
        let c = t.cur();
        c.status = if c.error.is_some() {
            "Blocked".into()
        } else if c.checks.iter().any(|x| x.outcome == "FAIL") {
            "Fail".into()
        } else if c.checks.iter().any(|x| x.outcome == "ok") {
            "Pass".into()
        } else {
            "UI only".into()
        };
    }

    let real_after = std::fs::metadata(&real).unwrap();
    let unchanged = real_before.len() == real_after.len() && real_before.modified().unwrap() == real_after.modified().unwrap();

    let out = root.join("e2e/results");
    std::fs::create_dir_all(&out).unwrap();
    let summary = serde_json::json!({
        "run_at_local": qs("SELECT datetime('now','localtime')", &[]),
        "test_database": dir.join("assets.db").display().to_string(),
        "real_db_unchanged": unchanged,
        "real_db_size": real_after.len(),
        "report_ids": t.r,
        "cases": t.cases,
    });
    std::fs::write(out.join("phase1_backend.json"), serde_json::to_string_pretty(&summary).unwrap()).unwrap();

    let mut md = String::from("# Phase 1 backend results\r\n\r\n| id | status | failed / info checks |\r\n|---|---|---|\r\n");
    for c in &t.cases {
        let notes: Vec<String> = c.checks.iter().filter(|x| x.outcome != "ok" && x.outcome != "info").map(|x| format!("{}: {} {}", x.outcome, x.label, x.detail).replace('|', "/")).collect();
        md.push_str(&format!("| {} | {} | {}{} |\r\n", c.id, c.status, c.error.as_ref().map(|e| format!("BLOCKED: {} ", e)).unwrap_or_default(), notes.join("<br>")));
    }
    std::fs::write(out.join("phase1_backend.md"), md).unwrap();

    let count = |s: &str| t.cases.iter().filter(|c| c.status == s).count();
    println!("\nPass {}  Fail {}  Blocked {}  UI only {}", count("Pass"), count("Fail"), count("Blocked"), count("UI only"));
    println!("Real assets.db unchanged: {}", unchanged);
    assert!(unchanged, "the real assets.db changed during the run");
}
