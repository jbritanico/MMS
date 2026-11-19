// Support and debugging helpers (features 3, 4, 6, 7, 8, 9 of the beta support tools).
//
// - App log file: one file per day in %LOCALAPPDATA%\com.sprintogs.mms\logs, kept for 14 days,
//   at most 5 MB per day (the day's file is rolled over to .log.1 when it grows past that).
//   The front end sends its log lines here; Rust panics are written here too.
// - System information for the About MMS screen and the diagnostics file.
// - "Check my data": read-only consistency checks.
// - "Export this report for support": one report and its rows as JSON (photos left out).
// - Crash detection: a session marker is written at start and removed on a clean exit.
//   If it is still there at the next start, the previous session did not close properly.
// - Session history (support bundle, checklist item 8): sessions.log next to the logs folder,
//   one JSON object per line: {"event":"start"|"end"|"unclean_end", "at", "version", ...}.
//   Kept to the newest 500 lines. This is the crash history the Support viewer shows.
// - Performance (checklist item 7): the database size is logged at every start as
//   "<time> INFO [rust] PERF {"kind":"db_size","bytes":...,"wal_bytes":...}".
//
// Log line format (both sides):  <time> <LEVEL> [<screen or rust>] <message>
//   Rust lines use UTC time ("2026-11-19 08:00:00 UTC"); screen lines use the laptop's local
//   time with milliseconds ("2026-11-19 12:00:00.123"). Messages that start with CALL or PERF
//   carry one JSON object after the word, so the Support viewer can read them reliably.
//
// - Support bundle ("Send to IT", checklist items 9 to 13): diag_build_bundle, at the end.
//
// Nothing here changes business data. Every command is read-only except the log, the session
// marker and the session history files, and the support bundle file it writes.

use rusqlite::Connection;
use serde::Serialize;
use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

static DIAG_DIR: OnceLock<PathBuf> = OnceLock::new();
static SESSION: OnceLock<SessionStart> = OnceLock::new();
static SESSION_VERSION: OnceLock<String> = OnceLock::new();

const LOG_KEEP_DAYS: usize = 14;
const LOG_MAX_BYTES: u64 = 5 * 1024 * 1024;

/// Called once from setup(): decides the folder, prunes old logs, installs the panic hook.
pub fn init(app: &tauri::AppHandle) {
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(dir.join("logs"));
    let _ = DIAG_DIR.set(dir);
    prune_logs();

    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let msg = format!("{info}");
        write_lines(&[format!("{} PANIC [rust] {}", stamp(), msg)]);
        let _ = std::fs::write(base_dir().join("last-crash.txt"), format!("{}\n{}", stamp(), msg));
        previous(info);
    }));
}

fn base_dir() -> PathBuf {
    DIAG_DIR.get().cloned().unwrap_or_else(|| PathBuf::from("."))
}
fn logs_dir() -> PathBuf {
    base_dir().join("logs")
}
fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// UTC civil date and time from Unix seconds (no date crate needed).
fn civil(secs: i64) -> (i64, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d, (rem / 3600) as u32, ((rem % 3600) / 60) as u32, (rem % 60) as u32)
}
fn stamp() -> String {
    let (y, m, d, hh, mm, ss) = civil(now_secs());
    format!("{y:04}-{m:02}-{d:02} {hh:02}:{mm:02}:{ss:02} UTC")
}
fn today_log() -> PathBuf {
    let (y, m, d, ..) = civil(now_secs());
    logs_dir().join(format!("mms-{y:04}-{m:02}-{d:02}.log"))
}

/// Appends lines to today's log file. Never fails the caller.
pub fn write_lines(lines: &[String]) {
    let path = today_log();
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > LOG_MAX_BYTES {
            let _ = std::fs::rename(&path, path.with_extension("log.1"));
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        for l in lines {
            let _ = writeln!(f, "{}", l.replace(['\r', '\n'], " ¶ "));
        }
    }
}

fn log_files() -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(logs_dir())
        .map(|rd| rd.filter_map(|e| e.ok().map(|e| e.path())).collect())
        .unwrap_or_default();
    files.retain(|p| p.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with("mms-") && n.ends_with(".log")).unwrap_or(false));
    files.sort();
    files
}

/// Keeps the newest LOG_KEEP_DAYS daily files (and their .log.1 roll-overs).
fn prune_logs() {
    let files = log_files();
    if files.len() > LOG_KEEP_DAYS {
        for p in &files[..files.len() - LOG_KEEP_DAYS] {
            let _ = std::fs::remove_file(p);
            let _ = std::fs::remove_file(p.with_extension("log.1"));
        }
    }
}

// ---------------------------------------------------------------- log commands

#[tauri::command]
pub fn diag_write_log(lines: Vec<String>) -> Result<(), String> {
    let lines: Vec<String> = lines.into_iter().take(500).map(|l| l.chars().take(4000).collect()).collect();
    write_lines(&lines);
    Ok(())
}

#[tauri::command]
pub fn diag_log_folder() -> String {
    logs_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub fn diag_open_log_folder() -> Result<(), String> {
    let dir = logs_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let cmd = "explorer";
    #[cfg(target_os = "macos")]
    let cmd = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let cmd = "xdg-open";
    std::process::Command::new(cmd)
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("Could not open the log folder: {e}"))?;
    Ok(())
}

/// The last `max_lines` lines of the log (today's file, plus the previous file when today's is short).
#[tauri::command]
pub fn diag_read_log_tail(max_lines: usize) -> Result<String, String> {
    let max_lines = max_lines.clamp(10, 5000);
    let files = log_files();
    let mut lines: Vec<String> = Vec::new();
    for p in files.iter().rev().take(2) {
        let text = std::fs::read_to_string(p).unwrap_or_default();
        let mut these: Vec<String> = text.lines().map(|s| s.to_string()).collect();
        these.append(&mut lines);
        lines = these;
        if lines.len() >= max_lines {
            break;
        }
    }
    let start = lines.len().saturating_sub(max_lines);
    Ok(lines[start..].join("\n"))
}

// ---------------------------------------------------------------- system information

fn windows_version() -> String {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        if let Ok(out) = std::process::Command::new("cmd").args(["/C", "ver"]).creation_flags(CREATE_NO_WINDOW).output() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return s;
            }
        }
    }
    format!("{} {}", std::env::consts::OS, std::env::consts::ARCH)
}

fn table_counts(conn: &Connection) -> Value {
    let mut map = serde_json::Map::new();
    if let Ok(tables) = crate::backup_local_tables(conn) {
        for t in tables {
            let n: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM \"{}\"", t.replace('"', "\"\"")), [], |r| r.get(0))
                .unwrap_or(-1);
            map.insert(t, json!(n));
        }
    }
    Value::Object(map)
}

#[tauri::command]
pub fn diag_system_info(app: tauri::AppHandle) -> Result<Value, String> {
    let db = crate::db_path();
    let db_abs = std::fs::canonicalize(&db).unwrap_or(db.clone());
    let db_size = std::fs::metadata(&db).map(|m| m.len()).unwrap_or(0);
    let trial = crate::get_trial_status(app.clone()).ok().and_then(|t| serde_json::to_value(t).ok()).unwrap_or(Value::Null);
    let conn = crate::get_connection()?;
    let sqlite_version: String = conn.query_row("SELECT sqlite_version()", [], |r| r.get(0)).unwrap_or_default();
    let migrations: i64 = conn.query_row("SELECT COUNT(*) FROM app_migrations", [], |r| r.get(0)).unwrap_or(0);
    let last_migration: Option<String> = conn
        .query_row("SELECT name FROM app_migrations ORDER BY rowid DESC LIMIT 1", [], |r| r.get(0))
        .ok();
    let counts = table_counts(&conn);
    drop(conn);
    let pkg = app.package_info();
    Ok(json!({
        "app_name": pkg.name.clone(),
        "version": pkg.version.to_string(),
        "build": if cfg!(debug_assertions) { "Developer run" } else { "Installed" },
        "trial": trial,
        "windows_version": windows_version(),
        "computer": std::env::var("COMPUTERNAME").unwrap_or_default(),
        "data_folder": base_dir().to_string_lossy(),
        "database_file": db_abs.to_string_lossy(),
        "database_bytes": db_size,
        "sqlite_version": sqlite_version,
        "schema_migrations": migrations,
        "last_migration": last_migration,
        "log_folder": logs_dir().to_string_lossy(),
        "table_rows": counts,
        "generated_at": stamp(),
    }))
}

// ---------------------------------------------------------------- check my data

#[derive(Serialize)]
pub struct DataCheck {
    key: String,
    name: String,
    /// "ok", "warn", "error" or "skip" (the check could not run)
    status: String,
    count: i64,
    detail: String,
    /// Up to 5 example record numbers
    examples: Vec<i64>,
}

fn run_count_check(conn: &Connection, key: &str, name: &str, bad: &str, count_sql: &str, ids_sql: &str, explain: &str) -> DataCheck {
    match conn.query_row(count_sql, [], |r| r.get::<_, i64>(0)) {
        Ok(0) => DataCheck { key: key.into(), name: name.into(), status: "ok".into(), count: 0, detail: "Nothing found.".into(), examples: vec![] },
        Ok(n) => {
            let examples = conn
                .prepare(ids_sql)
                .and_then(|mut s| {
                    let v = s.query_map([], |r| r.get::<_, i64>(0))?.collect::<Result<Vec<_>, _>>();
                    v
                })
                .unwrap_or_default();
            DataCheck { key: key.into(), name: name.into(), status: bad.into(), count: n, detail: explain.into(), examples }
        }
        Err(e) => DataCheck { key: key.into(), name: name.into(), status: "skip".into(), count: 0, detail: format!("Could not run this check: {e}"), examples: vec![] },
    }
}

#[tauri::command]
pub fn diag_check_data() -> Result<Vec<DataCheck>, String> {
    let conn = crate::get_connection()?;
    let mut out: Vec<DataCheck> = Vec::new();

    // 1. The database file itself
    let quick: Vec<String> = conn
        .prepare("PRAGMA quick_check")
        .and_then(|mut s| {
            let v = s.query_map([], |r| r.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>();
            v
        })
        .unwrap_or_else(|e| vec![e.to_string()]);
    let ok = quick.len() == 1 && quick[0] == "ok";
    out.push(DataCheck {
        key: "integrity".into(),
        name: "Database file is readable and not damaged".into(),
        status: if ok { "ok" } else { "error" }.into(),
        count: if ok { 0 } else { quick.len() as i64 },
        detail: if ok { "SQLite quick check passed.".into() } else { quick.into_iter().take(5).collect::<Vec<_>>().join(" | ") },
        examples: vec![],
    });

    // 2. Links between tables (declared foreign keys)
    let fk: i64 = conn
        .prepare("PRAGMA foreign_key_check")
        .and_then(|mut s| {
            let n = s.query_map([], |_| Ok(()))?.count() as i64;
            Ok(n)
        })
        .unwrap_or(-1);
    out.push(DataCheck {
        key: "links".into(),
        name: "Records point to records that exist".into(),
        status: match fk { 0 => "ok", n if n < 0 => "skip", _ => "error" }.into(),
        count: fk.max(0),
        detail: if fk == 0 { "All declared links are complete.".into() } else { "Some records point to a record that no longer exists.".into() },
        examples: vec![],
    });

    let checks: [(&str, &str, &str, &str, &str, &str); 12] = [
        ("report-unit", "MR-I reports linked to a missing unit", "error",
         "SELECT COUNT(*) FROM mri_reports r LEFT JOIN assets a ON a.id = r.asset_id WHERE a.id IS NULL",
         "SELECT r.id FROM mri_reports r LEFT JOIN assets a ON a.id = r.asset_id WHERE a.id IS NULL LIMIT 5",
         "These reports belong to a unit that was deleted. Report numbers are listed."),
        ("report-template", "MR-I reports linked to a missing template", "error",
         "SELECT COUNT(*) FROM mri_reports r LEFT JOIN mri_templates t ON t.id = r.template_id WHERE t.id IS NULL",
         "SELECT r.id FROM mri_reports r LEFT JOIN mri_templates t ON t.id = r.template_id WHERE t.id IS NULL LIMIT 5",
         "These reports use a template that was deleted, so they may not open. Report numbers are listed."),
        ("results-report", "Checklist results without a report", "warn",
         "SELECT COUNT(*) FROM mri_report_checklist_results x WHERE x.report_id NOT IN (SELECT id FROM mri_reports)",
         "SELECT DISTINCT x.report_id FROM mri_report_checklist_results x WHERE x.report_id NOT IN (SELECT id FROM mri_reports) LIMIT 5",
         "Left-over checklist answers of deleted reports. Missing report numbers are listed."),
        ("faults-report", "Fault decisions without a report", "warn",
         "SELECT COUNT(*) FROM mri_fault_approvals f WHERE f.report_id NOT IN (SELECT id FROM mri_reports)",
         "SELECT f.id FROM mri_fault_approvals f WHERE f.report_id NOT IN (SELECT id FROM mri_reports) LIMIT 5",
         "Fault decisions whose report was deleted. Fault decision numbers are listed."),
        ("repairs-fault", "Repairs without a fault decision", "warn",
         "SELECT COUNT(*) FROM mri_fault_rectifications x WHERE x.fault_approval_id NOT IN (SELECT id FROM mri_fault_approvals)",
         "SELECT x.id FROM mri_fault_rectifications x WHERE x.fault_approval_id NOT IN (SELECT id FROM mri_fault_approvals) LIMIT 5",
         "Repair records whose fault decision is missing. Repair numbers are listed."),
        ("photos-report", "Photos without a report", "warn",
         "SELECT COUNT(*) FROM mri_report_attachments x WHERE x.report_id NOT IN (SELECT id FROM mri_reports)",
         "SELECT x.id FROM mri_report_attachments x WHERE x.report_id NOT IN (SELECT id FROM mri_reports) LIMIT 5",
         "Photos of deleted reports still take space. Photo numbers are listed."),
        ("counters-unit", "Maintenance counters for a missing unit", "warn",
         "SELECT COUNT(*) FROM maintenance_triggers x WHERE x.asset_id NOT IN (SELECT id FROM assets)",
         "SELECT x.id FROM maintenance_triggers x WHERE x.asset_id NOT IN (SELECT id FROM assets) LIMIT 5",
         "Counters left behind by a deleted unit. Counter numbers are listed."),
        ("counters-negative", "Maintenance counters below zero", "error",
         "SELECT COUNT(*) FROM maintenance_triggers WHERE running_value < 0 OR interval_value < 0",
         "SELECT asset_id FROM maintenance_triggers WHERE running_value < 0 OR interval_value < 0 LIMIT 5",
         "A counter can never be negative. Unit numbers are listed."),
        ("submitted-no-date", "Submitted reports without a submit date", "warn",
         "SELECT COUNT(*) FROM mri_reports WHERE status <> 'Draft' AND (submitted_date IS NULL OR submitted_date = '')",
         "SELECT id FROM mri_reports WHERE status <> 'Draft' AND (submitted_date IS NULL OR submitted_date = '') LIMIT 5",
         "Dashboards cannot place these reports in time. Report numbers are listed."),
        ("double-draft", "More than one draft for the same unit and component", "warn",
         "SELECT COUNT(*) FROM (SELECT asset_id, IFNULL(component_id, 0) AS c FROM mri_reports WHERE status = 'Draft' GROUP BY asset_id, c HAVING COUNT(*) > 1)",
         "SELECT MAX(id) FROM mri_reports WHERE status = 'Draft' GROUP BY asset_id, IFNULL(component_id, 0) HAVING COUNT(*) > 1 LIMIT 5",
         "MMS allows one draft per unit and component. The newest duplicate report numbers are listed."),
        ("red-no-reason", "Red units without a reason", "warn",
         "SELECT COUNT(*) FROM assets WHERE tag_status = 'Red' AND (tag_reason IS NULL OR TRIM(tag_reason) = '')",
         "SELECT id FROM assets WHERE tag_status = 'Red' AND (tag_reason IS NULL OR TRIM(tag_reason) = '') LIMIT 5",
         "Every Red tag should say why. Unit numbers are listed."),
        ("pending-on-closed", "Fault decisions still pending on a closed report", "error",
         "SELECT COUNT(*) FROM mri_fault_approvals f JOIN mri_reports r ON r.id = f.report_id WHERE f.decision = 'Pending' AND r.status = 'Approved'",
         "SELECT f.report_id FROM mri_fault_approvals f JOIN mri_reports r ON r.id = f.report_id WHERE f.decision = 'Pending' AND r.status = 'Approved' LIMIT 5",
         "A report should not close while a fault decision is pending. Report numbers are listed."),
    ];
    for (key, name, bad, count_sql, ids_sql, explain) in checks {
        out.push(run_count_check(&conn, key, name, bad, count_sql, ids_sql, explain));
    }
    write_lines(&[format!(
        "{} INFO [rust] Check my data: {} checks, {} problem(s)",
        stamp(),
        out.len(),
        out.iter().filter(|c| c.status == "error" || c.status == "warn").count()
    )]);
    Ok(out)
}

// ---------------------------------------------------------------- export one report

fn rows(conn: &Connection, sql: &str, params: &[&dyn rusqlite::ToSql]) -> Result<Vec<Value>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut q = stmt.query(params).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = q.next().map_err(|e| e.to_string())? {
        let mut obj = serde_json::Map::new();
        for (i, n) in names.iter().enumerate() {
            let v = row.get_ref(i).map(crate::sqlite_value_to_json).unwrap_or(Value::Null);
            obj.insert(n.clone(), v);
        }
        out.push(Value::Object(obj));
    }
    Ok(out)
}

fn has_column(conn: &Connection, table: &str, col: &str) -> bool {
    conn.prepare(&format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\"")))
        .and_then(|mut s| {
            let v = s.query_map([], |r| r.get::<_, String>(1))?.collect::<Result<Vec<_>, _>>();
            v
        })
        .map(|cols| cols.iter().any(|c| c == col))
        .unwrap_or(false)
}

/// One report with every row that belongs to it, for reproducing a problem.
/// Photo contents are left out (only their size is kept) to keep the file small.
#[tauri::command]
pub fn diag_export_report(report_id: i64) -> Result<String, String> {
    let conn = crate::get_connection()?;
    let report = rows(&conn, "SELECT * FROM mri_reports WHERE id = ?1", &[&report_id])?;
    let Some(rep) = report.first().cloned() else {
        return Err(format!("Report #{report_id} was not found on this computer."));
    };
    let mut tables = serde_json::Map::new();
    tables.insert("mri_reports".into(), json!(report));
    if let Some(aid) = rep.get("asset_id").and_then(|v| v.as_i64()) {
        tables.insert("assets".into(), json!(rows(&conn, "SELECT * FROM assets WHERE id = ?1", &[&aid])?));
        tables.insert("maintenance_triggers".into(), json!(rows(&conn, "SELECT * FROM maintenance_triggers WHERE asset_id = ?1", &[&aid]).unwrap_or_default()));
    }
    if let Some(tid) = rep.get("template_id").and_then(|v| v.as_i64()) {
        tables.insert("mri_templates".into(), json!(rows(&conn, "SELECT * FROM mri_templates WHERE id = ?1", &[&tid]).unwrap_or_default()));
    }
    for t in crate::backup_local_tables(&conn)? {
        if t == "mri_reports" || !has_column(&conn, &t, "report_id") {
            continue;
        }
        let q = format!("SELECT * FROM \"{}\" WHERE report_id = ?1", t.replace('"', "\"\""));
        let mut r = rows(&conn, &q, &[&report_id]).unwrap_or_default();
        if t == "mri_report_attachments" {
            for row in r.iter_mut() {
                if let Some(obj) = row.as_object_mut() {
                    let len = obj.get("data").and_then(|v| v.as_str()).map(|s| s.len()).unwrap_or(0);
                    obj.insert("data".into(), json!(format!("<photo left out, {len} characters>")));
                }
            }
        }
        if !r.is_empty() {
            tables.insert(t, json!(r));
        }
    }
    let fault_ids = "SELECT id FROM mri_fault_approvals WHERE report_id = ?1";
    for t in ["mri_fault_rectifications", "mri_fault_reminders"] {
        let q = format!("SELECT * FROM {t} WHERE fault_approval_id IN ({fault_ids})");
        let r = rows(&conn, &q, &[&report_id]).unwrap_or_default();
        if !r.is_empty() {
            tables.insert(t.into(), json!(r));
        }
    }
    // Labels and history for the Support viewer's Record inspector (checklist item 28), so it can
    // show "Client = PDO" instead of "field 104 = PDO", and why a unit is Red. Older exports
    // (export_version 1) have none of these; the inspector then shows numbers.
    let tid = rep.get("template_id").and_then(|v| v.as_i64());
    let aid = rep.get("asset_id").and_then(|v| v.as_i64());
    let mut extra = |name: &str, sql: &str, id: Option<i64>| {
        let r = match id {
            Some(id) => rows(&conn, sql, &[&id]),
            None if !sql.contains("?1") => rows(&conn, sql, &[]),
            None => return,
        }
        .unwrap_or_default();
        if !r.is_empty() {
            tables.insert(name.into(), json!(r));
        }
    };
    extra("template_header_fields", "SELECT * FROM template_header_fields WHERE template_id = ?1", tid);
    extra("template_mid_fields", "SELECT * FROM template_mid_fields WHERE template_id = ?1", tid);
    extra("template_footer_fields", "SELECT * FROM template_footer_fields WHERE template_id = ?1", tid);
    extra("template_checklist_items", "SELECT * FROM template_checklist_items WHERE template_id = ?1", tid);
    extra("template_components", "SELECT * FROM template_components WHERE template_id = ?1", tid);
    extra("checklist_databank", "SELECT * FROM checklist_databank WHERE id IN (SELECT checklist_item_id FROM template_checklist_items WHERE template_id = ?1)", tid);
    extra("header_field_catalog", "SELECT * FROM header_field_catalog", None);
    extra("mid_field_catalog", "SELECT * FROM mid_field_catalog", None);
    extra("footer_field_catalog", "SELECT * FROM footer_field_catalog", None);
    extra("checklist_sections", "SELECT * FROM checklist_sections", None);
    extra("asset_tag_history", "SELECT * FROM asset_tag_history WHERE asset_id = ?1", aid);
    extra("asset_moc_exemptions", "SELECT * FROM asset_moc_exemptions WHERE asset_id = ?1", aid);
    extra("asset_types", "SELECT * FROM asset_types WHERE id = (SELECT asset_type_id FROM assets WHERE id = ?1)", aid);
    // Other reports on the same unit (headline columns only), for links to earlier and later reports.
    extra("mri_reports_same_unit", "SELECT id, status, created_date, submitted_by, submitted_date, approved_by, approved_date FROM mri_reports WHERE asset_id = ?1", aid);
    // Faults from earlier reports that were carried forward into this one.
    extra("mri_fault_approvals_carried_in", "SELECT * FROM mri_fault_approvals WHERE carried_to_report_id = ?1", Some(report_id));
    drop(extra);

    let total: usize = tables.values().map(|v| v.as_array().map(|a| a.len()).unwrap_or(0)).sum();
    write_lines(&[format!("{} INFO [rust] Exported report #{report_id} for support ({total} rows)", stamp())]);
    serde_json::to_string_pretty(&json!({
        "kind": "MMS report export for support",
        "export_version": 2,
        "report_id": report_id,
        "exported_at": stamp(),
        "rows": total,
        "tables": tables,
    }))
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- crash detection

#[derive(Serialize, Clone)]
pub struct SessionStart {
    /// The previous session did not close properly (installed builds only).
    unclean: bool,
    previous_started: Option<String>,
    crash_note: Option<String>,
}

/// Called once by the front end at start-up. Repeated calls in the same run return the
/// first answer (React may run the start-up effect twice in development).
#[tauri::command]
pub fn diag_session_start(app: tauri::AppHandle) -> SessionStart {
    SESSION
        .get_or_init(|| {
            let marker = base_dir().join("session.lock");
            let previous = std::fs::read_to_string(&marker).ok();
            let crash_path = base_dir().join("last-crash.txt");
            let crash_note = std::fs::read_to_string(&crash_path).ok();
            let _ = std::fs::remove_file(&crash_path);
            let version = app.package_info().version.to_string();
            let _ = SESSION_VERSION.set(version.clone());
            let _ = std::fs::write(&marker, format!("{}|{}", stamp(), version));
            // Developer runs are stopped by killing the process, so they never count as a crash.
            let unclean = !cfg!(debug_assertions) && (previous.is_some() || crash_note.is_some());
            if unclean {
                let mut prev = previous.as_deref().unwrap_or("").splitn(2, '|');
                let prev_started = prev.next().unwrap_or("").trim().to_string();
                let prev_version = prev.next().unwrap_or("").trim().to_string();
                append_session_event(json!({
                    "event": "unclean_end",
                    "at": stamp(),
                    "previous_started": prev_started,
                    "previous_version": prev_version,
                    "crash_note": crash_note.as_deref().map(|n| n.lines().take(2).collect::<Vec<_>>().join(" ").chars().take(300).collect::<String>()),
                }));
            }
            let db = crate::db_path();
            let db_bytes = std::fs::metadata(&db).map(|m| m.len()).unwrap_or(0);
            let mut wal = db.clone().into_os_string();
            wal.push("-wal");
            let wal_bytes = std::fs::metadata(PathBuf::from(wal)).map(|m| m.len()).unwrap_or(0);
            append_session_event(json!({
                "event": "start",
                "at": stamp(),
                "version": version,
                "build": if cfg!(debug_assertions) { "Developer run" } else { "Installed" },
                "db_bytes": db_bytes,
            }));
            write_lines(&[format!(
                "{} INFO [rust] PERF {}",
                stamp(),
                json!({ "kind": "db_size", "bytes": db_bytes, "wal_bytes": wal_bytes })
            )]);
            write_lines(&[format!(
                "{} INFO [rust] Session start, MMS {}{}",
                stamp(),
                version,
                if unclean { " (the previous session did not close properly)" } else { "" }
            )]);
            SessionStart {
                unclean,
                previous_started: previous.map(|p| p.split('|').next().unwrap_or("").to_string()),
                crash_note,
            }
        })
        .clone()
}

/// Called on a clean exit.
pub fn session_end() {
    write_lines(&[format!("{} INFO [rust] Session end", stamp())]);
    append_session_event(json!({
        "event": "end",
        "at": stamp(),
        "version": SESSION_VERSION.get().cloned().unwrap_or_default(),
    }));
    let _ = std::fs::remove_file(base_dir().join("session.lock"));
}

// ---------------------------------------------------------------- session history

const SESSIONS_FILE: &str = "sessions.log";
const SESSIONS_KEEP: usize = 500;

/// sessions.log in the MMS data folder (next to the logs folder).
pub fn sessions_path() -> PathBuf {
    base_dir().join(SESSIONS_FILE)
}

/// Appends one event to sessions.log, keeping the newest SESSIONS_KEEP lines. Never fails the caller.
fn append_session_event(event: Value) {
    append_session_event_to(&sessions_path(), event, SESSIONS_KEEP);
}

fn append_session_event_to(path: &Path, event: Value, keep: usize) {
    if let Ok(text) = std::fs::read_to_string(path) {
        let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
        if keep > 0 && lines.len() >= keep {
            let newest = &lines[lines.len() + 1 - keep..];
            let mut out = newest.join("\n");
            out.push('\n');
            let _ = std::fs::write(path, out);
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{}", event);
    }
}

/// The session history, oldest first. Lines that cannot be read are skipped.
pub fn read_session_history(path: &Path) -> Vec<Value> {
    std::fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok())
        .filter(|v| v.get("event").is_some())
        .collect()
}

/// The newest `limit` session events (default 100), oldest first.
#[tauri::command]
pub fn diag_session_history(limit: Option<usize>) -> Vec<Value> {
    let all = read_session_history(&sessions_path());
    let n = limit.unwrap_or(100).clamp(1, SESSIONS_KEEP);
    all[all.len().saturating_sub(n)..].to_vec()
}

#[cfg(test)]
mod session_history_tests {
    use super::*;

    #[test]
    fn keeps_newest_lines_and_reads_back() {
        let dir = std::env::temp_dir().join(format!("mms-sessions-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sessions.log");
        let _ = std::fs::remove_file(&path);
        for i in 0..7 {
            append_session_event_to(&path, json!({ "event": "start", "n": i }), 5);
        }
        std::fs::OpenOptions::new().append(true).open(&path).unwrap().write_all(b"not json\n").unwrap();
        let events = read_session_history(&path);
        let ns: Vec<i64> = events.iter().map(|e| e["n"].as_i64().unwrap()).collect();
        assert_eq!(ns, vec![2, 3, 4, 5, 6]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

// ---------------------------------------------------------------- support bundle ("Send to IT")
//
// Checklist items 9 to 13. Builds one .mmsbundle file (see bundle.rs) with:
//   logs/...      the app log files, newest days first within the size budget
//   system.json   same details as About MMS
//   checks.json   "Check my data" results
//   sessions.log  start / end history (crash history)
//   screen.json   steps, recent errors, recent calls and timings, sent by the screen side
//   report.json   optional: the report the user was on (photo contents left out)
//   backup.json   optional, off by default: the full backup, with photo contents, drawings
//                 and anything that looks like a password or key left out
// The file is written to the user's Downloads folder (or the MMS data folder if that is not
// available). Nothing here changes business data, and the database key is never read.

use crate::bundle::{part, BundleManifest, BundlePart, BundleUser, BundleWriter, BUNDLE_EXTENSION};

/// Above this the user is warned that the file may be too big to email.
const BUNDLE_WARN_BYTES: u64 = 20 * 1024 * 1024;
/// Log text compresses to roughly an eighth; keep the logs' share of the bundle near 15 MB.
const LOG_RAW_BUDGET: u64 = 15 * 1024 * 1024 * 8;
/// Largest screen-side record accepted (it is normally well under 1 MB).
const SCREEN_PART_MAX: usize = 4 * 1024 * 1024;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleRequest {
    /// The user's own words about the problem.
    #[serde(default)]
    note: String,
    #[serde(default)]
    user_name: Option<String>,
    #[serde(default)]
    user_role: Option<String>,
    /// Screen the user was on.
    #[serde(default)]
    screen: String,
    /// Report number to include as report.json.
    #[serde(default)]
    include_report: Option<i64>,
    /// Off by default.
    #[serde(default)]
    include_backup: bool,
    /// Steps, errors, calls and timings from the screen side (lib/support/bundle.ts).
    #[serde(default)]
    screen_part: Value,
}

#[derive(Serialize)]
pub struct BundleResult {
    path: String,
    file_name: String,
    folder: String,
    bytes: u64,
    parts: Vec<BundlePart>,
    /// Plain-language notes for the user (size, left-out log days, parts that could not be added).
    warnings: Vec<String>,
    /// What the safety filter left out, e.g. "mri_report_attachments.data (photo contents, 3 rows)".
    removed: Vec<String>,
    log_days_included: usize,
    log_days_dropped: usize,
}

/// One day's log file and its roll-over (.log.1), newest day first.
fn log_days() -> Vec<(PathBuf, Option<PathBuf>)> {
    let mut days: Vec<(PathBuf, Option<PathBuf>)> = log_files()
        .into_iter()
        .map(|p| {
            let rolled = p.with_extension("log.1");
            let rolled = if rolled.exists() { Some(rolled) } else { None };
            (p, rolled)
        })
        .collect();
    days.reverse();
    days
}

fn file_len(p: &Path) -> u64 {
    std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)
}

/// Picks the newest log days that fit in `raw_budget` bytes; always keeps today's.
fn choose_log_days(days: &[(PathBuf, Option<PathBuf>)], raw_budget: u64) -> (usize, usize) {
    let mut used = 0u64;
    let mut keep = 0usize;
    for (i, (p, rolled)) in days.iter().enumerate() {
        let size = file_len(p) + rolled.as_deref().map(file_len).unwrap_or(0);
        if i > 0 && used + size > raw_budget {
            break;
        }
        used += size;
        keep += 1;
    }
    (keep, days.len() - keep)
}

/// Columns whose contents never go into a bundle, by name.
fn is_secret_column(col: &str) -> bool {
    let c = col.to_ascii_lowercase();
    ["password", "passcode", "pin_hash", "secret", "token", "api_key", "private_key", "credential", "db_key", "encryption_key"]
        .iter()
        .any(|w| c.contains(w))
        || c == "pin"
}

/// What to put in place of a left-out value, and why it was left out (None = keep the value).
fn filter_value(table: &str, col: &str, v: &Value) -> Option<(Value, &'static str)> {
    if is_secret_column(col) {
        return Some((Value::Null, "password or key"));
    }
    let text = v.as_str()?;
    if table == "mri_report_attachments" && col == "data" {
        return Some((json!(format!("<photo left out, {} characters>", text.len())), "photo contents"));
    }
    if table == "template_drawings" && col == "image_data" {
        return Some((json!(format!("<drawing left out, {} characters>", text.len())), "template drawing"));
    }
    // Any other embedded file or picture (for tables added later).
    if text.len() > 2000 && text.starts_with("data:") {
        return Some((json!(format!("<file left out, {} characters>", text.len())), "embedded file"));
    }
    None
}

/// Applies the safety filter to a full backup (the export_full_backup JSON) in place.
/// Returns a plain-language list of what was left out.
pub fn filter_backup(backup: &mut Value) -> Vec<String> {
    let mut counts: std::collections::BTreeMap<(String, String, &'static str), usize> = Default::default();
    if let Some(tables) = backup.get_mut("tables").and_then(|t| t.as_object_mut()) {
        for (table, t) in tables.iter_mut() {
            let columns: Vec<String> = t
                .get("columns")
                .and_then(|c| c.as_array())
                .map(|a| a.iter().map(|c| c.as_str().unwrap_or("").to_string()).collect())
                .unwrap_or_default();
            if let Some(rows) = t.get_mut("rows").and_then(|r| r.as_array_mut()) {
                for row in rows.iter_mut() {
                    if let Some(cells) = row.as_array_mut() {
                        for (i, cell) in cells.iter_mut().enumerate() {
                            let col = columns.get(i).map(|s| s.as_str()).unwrap_or("");
                            if let Some((replacement, why)) = filter_value(table, col, cell) {
                                *cell = replacement;
                                *counts.entry((table.clone(), col.to_string(), why)).or_default() += 1;
                            }
                        }
                    }
                }
            }
        }
    }
    if let Some(obj) = backup.as_object_mut() {
        obj.insert("filtered_for_support".into(), json!(true));
    }
    counts
        .into_iter()
        .map(|((t, c, why), n)| format!("{t}.{c} ({why}, {n} row{})", if n == 1 { "" } else { "s" }))
        .collect()
}

fn bundle_file_name(user: Option<&str>, stamp_utc: (i64, u32, u32, u32, u32, u32)) -> String {
    let (y, m, d, hh, mm, _) = stamp_utc;
    let who: String = user
        .unwrap_or("user")
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let who = if who.is_empty() { "user".to_string() } else { who.chars().take(40).collect() };
    format!("MMS-Support-{who}-{y:04}{m:02}{d:02}-{hh:02}{mm:02}.{BUNDLE_EXTENSION}")
}

fn unique_path(folder: &Path, name: &str) -> PathBuf {
    let first = folder.join(name);
    if !first.exists() {
        return first;
    }
    let stem = name.trim_end_matches(&format!(".{BUNDLE_EXTENSION}"));
    (2..1000)
        .map(|n| folder.join(format!("{stem}-{n}.{BUNDLE_EXTENSION}")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

fn bundle_folder(app: &tauri::AppHandle) -> PathBuf {
    use tauri::Manager;
    let downloads = app.path().download_dir().ok().filter(|d| d.is_dir());
    downloads.unwrap_or_else(|| {
        let d = base_dir().join("support-bundles");
        let _ = std::fs::create_dir_all(&d);
        d
    })
}

/// Builds the support bundle. Runs off the window's thread so MMS stays responsive.
#[tauri::command]
pub async fn diag_build_bundle(app: tauri::AppHandle, request: BundleRequest) -> Result<BundleResult, String> {
    let folder = bundle_folder(&app);
    let version = app.package_info().version.to_string();
    let system = diag_system_info(app.clone()).unwrap_or_else(|e| json!({ "error": e }));
    build_bundle_into(&folder, &version, system, request)
}

/// The bundle builder without the Tauri parts, so it can be tested on its own.
pub fn build_bundle_into(folder: &Path, version: &str, system: Value, req: BundleRequest) -> Result<BundleResult, String> {
    let mut warnings: Vec<String> = Vec::new();
    let mut removed: Vec<String> = Vec::new();
    let now = civil(now_secs());
    let name = bundle_file_name(req.user_name.as_deref(), now);
    let path = unique_path(folder, &name);
    let tmp = path.with_extension(format!("{BUNDLE_EXTENSION}.part"));
    let file = std::fs::File::create(&tmp).map_err(|e| format!("Could not create the support bundle in {}: {e}", folder.display()))?;
    let mut w = BundleWriter::new(std::io::BufWriter::new(file));

    let result = (|| -> Result<(BundleManifest, usize, usize), String> {
        // Logs: newest days that fit the budget.
        let days = log_days();
        let (keep, dropped) = choose_log_days(&days, LOG_RAW_BUDGET);
        for (p, rolled) in days.iter().take(keep) {
            for src in std::iter::once(p).chain(rolled.iter()) {
                let fname = src.file_name().and_then(|n| n.to_str()).unwrap_or("log");
                if let Err(e) = w.add_file(&format!("{}{fname}", part::LOGS_DIR), src) {
                    warnings.push(format!("Log file {fname} could not be added: {e}"));
                }
            }
        }
        if dropped > 0 {
            warnings.push(format!("The {dropped} oldest day(s) of logs were left out to keep the file small enough to email."));
        }

        w.add_json(part::SYSTEM, &system)?;

        match diag_check_data() {
            Ok(checks) => w.add_json(part::CHECKS, &checks)?,
            Err(e) => {
                warnings.push(format!("Check my data could not run: {e}"));
                w.add_json(part::CHECKS, &json!({ "error": e }))?;
            }
        }

        let sessions = sessions_path();
        if sessions.exists() {
            w.add_file(part::SESSIONS, &sessions)?;
        }

        let screen = serde_json::to_vec_pretty(&req.screen_part).unwrap_or_default();
        if screen.len() > SCREEN_PART_MAX {
            warnings.push("The screen record was too large and was left out.".into());
        } else if !req.screen_part.is_null() {
            w.add_bytes(part::SCREEN, &screen)?;
        }

        let mut report_included = None;
        if let Some(id) = req.include_report {
            match diag_export_report(id) {
                Ok(text) => {
                    w.add_text(part::REPORT, &text)?;
                    report_included = Some(id);
                    removed.push(format!("report #{id}: photo contents left out (sizes kept)"));
                }
                Err(e) => warnings.push(format!("Report #{id} could not be added: {e}")),
            }
        }

        let mut backup_included = false;
        if req.include_backup {
            match crate::export_full_backup().and_then(|s| serde_json::from_str::<Value>(&s).map_err(|e| e.to_string())) {
                Ok(mut backup) => {
                    removed.extend(filter_backup(&mut backup));
                    w.add_json(part::BACKUP, &backup)?;
                    backup_included = true;
                }
                Err(e) => warnings.push(format!("The full backup could not be added: {e}")),
            }
        }

        let mut m = BundleManifest::new(stamp(), version.to_string());
        m.build = if cfg!(debug_assertions) { "Developer run".into() } else { "Installed".into() };
        m.computer = std::env::var("COMPUTERNAME").unwrap_or_default();
        m.user = req.user_name.clone().map(|n| BundleUser { name: n, role: req.user_role.clone().unwrap_or_default() });
        m.screen = req.screen.clone();
        m.note = req.note.chars().take(4000).collect();
        m.includes_backup = backup_included;
        m.includes_report = report_included;
        Ok((m, keep, dropped))
    })();

    let (manifest, keep, dropped) = match result {
        Ok(v) => v,
        Err(e) => {
            drop(w);
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("The support bundle could not be made: {e}"));
        }
    };
    let (out, manifest) = match w.finish(manifest) {
        Ok(v) => v,
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("The support bundle could not be made: {e}"));
        }
    };
    drop(out.into_inner().map_err(|e| e.to_string())?);
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("The support bundle could not be saved: {e}")
    })?;

    let bytes = file_len(&path);
    if bytes > BUNDLE_WARN_BYTES {
        warnings.push(format!(
            "The file is {:.1} MB, which may be too big to email. Send it by Teams, or ask IT for another way.",
            bytes as f64 / 1_048_576.0
        ));
    }
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    write_lines(&[format!(
        "{} INFO [rust] Support bundle saved: {} ({} bytes, {} parts)",
        stamp(),
        file_name,
        bytes,
        manifest.parts.len()
    )]);
    Ok(BundleResult {
        path: path.to_string_lossy().to_string(),
        file_name,
        folder: folder.to_string_lossy().to_string(),
        bytes,
        parts: manifest.parts,
        warnings,
        removed,
        log_days_included: keep,
        log_days_dropped: dropped,
    })
}

/// What the Send to IT window lists before the file is made (sizes before packing).
#[derive(Serialize)]
pub struct BundlePreview {
    log_days: usize,
    log_bytes: u64,
    log_days_over_budget: usize,
    has_sessions: bool,
    database_bytes: u64,
    folder: String,
}

#[tauri::command]
pub fn diag_bundle_preview(app: tauri::AppHandle) -> BundlePreview {
    let days = log_days();
    let (keep, dropped) = choose_log_days(&days, LOG_RAW_BUDGET);
    let log_bytes = days
        .iter()
        .take(keep)
        .map(|(p, r)| file_len(p) + r.as_deref().map(file_len).unwrap_or(0))
        .sum();
    BundlePreview {
        log_days: keep,
        log_bytes,
        log_days_over_budget: dropped,
        has_sessions: sessions_path().exists(),
        database_bytes: file_len(&crate::db_path()),
        folder: bundle_folder(&app).to_string_lossy().to_string(),
    }
}

/// Opens the folder that holds a support bundle, with the file selected (Windows).
/// Only accepts an existing .mmsbundle file.
#[tauri::command]
pub fn diag_show_bundle(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let ok = p.is_file() && p.extension().and_then(|e| e.to_str()) == Some(BUNDLE_EXTENSION);
    if !ok {
        return Err("The support bundle file was not found. It may have been moved or deleted.".into());
    }
    #[cfg(windows)]
    let result = {
        // Explorer wants the quotes around the path only: /select,"C:\...\file.mmsbundle"
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer").raw_arg(format!("/select,\"{}\"", p.display())).spawn()
    };
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg("-R").arg(&p).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(p.parent().unwrap_or(&p)).spawn();
    result.map(|_| ()).map_err(|e| format!("Could not open the folder: {e}"))
}

// ---------------------------------------------------------------- Support viewer (Administration › Diagnostics)
//
// Checklist items 17 and 19. Opening and reading a support bundle is for the Administrator tier
// only: every command below checks that the user is an active Administrator. This is fixed to
// the tier, not a permission switch, so it cannot be given to other roles or users.
// The bundle is read into memory only. Nothing from it is written to this laptop's database or
// unpacked to disk; closing it (or opening another) forgets it.

use crate::bundle::BundleReader;

/// Largest bundle the viewer will open.
const OPEN_BUNDLE_MAX: usize = 300 * 1024 * 1024;

struct OpenBundle {
    file_name: String,
    bytes: Vec<u8>,
}
static OPEN_BUNDLE: std::sync::Mutex<Option<OpenBundle>> = std::sync::Mutex::new(None);

/// The Administrator-only check for the Support viewer. Refusals are logged.
fn require_administrator(user_id: i64, what: &str) -> Result<(), String> {
    let role: Option<(String, i64)> = crate::get_connection()?
        .query_row("SELECT role, active FROM app_users WHERE id = ?1", [user_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .ok();
    match role {
        Some((role, active)) if role == "Administrator" && active != 0 => Ok(()),
        other => {
            let who = other.map(|(r, _)| r).unwrap_or_else(|| "unknown user".into());
            write_lines(&[format!("{} WARN [rust] Refused: {what} (user {user_id}, {who}). Only an Administrator can do this.", stamp())]);
            Err("Only an Administrator can open support bundles.".into())
        }
    }
}

#[derive(Serialize)]
pub struct BundleOverview {
    file_name: String,
    bytes: u64,
    manifest: BundleManifest,
    /// Every part actually in the file.
    names: Vec<String>,
    /// Parts listed in manifest.json that are not in the file (damaged or edited bundle).
    missing: Vec<String>,
}

/// Checks the bytes are a support bundle MMS can read and keeps them in memory.
pub fn open_bundle_bytes(file_name: &str, bytes: Vec<u8>) -> Result<BundleOverview, String> {
    if bytes.len() > OPEN_BUNDLE_MAX {
        return Err(format!("This file is too large to open ({} MB).", bytes.len() / 1_048_576));
    }
    let reader = BundleReader::open(std::io::Cursor::new(bytes.as_slice()))?;
    let names = reader.names();
    let missing: Vec<String> = reader
        .manifest
        .parts
        .iter()
        .filter(|p| !names.contains(&p.path))
        .map(|p| p.path.clone())
        .collect();
    let overview = BundleOverview {
        file_name: file_name.to_string(),
        bytes: bytes.len() as u64,
        manifest: reader.manifest.clone(),
        names,
        missing,
    };
    drop(reader);
    *OPEN_BUNDLE.lock().map_err(|_| "The Support viewer is busy. Try again.".to_string())? =
        Some(OpenBundle { file_name: file_name.to_string(), bytes });
    Ok(overview)
}

/// Reads one part of the open bundle as text (JSON parts are returned as their JSON text).
pub fn open_bundle_part(path: &str) -> Result<String, String> {
    let guard = OPEN_BUNDLE.lock().map_err(|_| "The Support viewer is busy. Try again.".to_string())?;
    let open = guard.as_ref().ok_or_else(|| "No support bundle is open.".to_string())?;
    let mut reader = BundleReader::open(std::io::Cursor::new(open.bytes.as_slice()))?;
    reader.read_text(path)
}

fn header_text(request: &tauri::ipc::Request<'_>, name: &str) -> Option<String> {
    request.headers().get(name).and_then(|v| v.to_str().ok()).map(|s| s.to_string())
}

/// Opens a support bundle chosen in the Support viewer. The file's bytes come as the raw body;
/// headers: x-mms-user-id (signed-in user), x-mms-file-name (URL-encoded).
#[tauri::command]
pub fn diag_open_bundle(request: tauri::ipc::Request<'_>) -> Result<BundleOverview, String> {
    let user_id: i64 = header_text(&request, "x-mms-user-id").and_then(|v| v.parse().ok()).unwrap_or(0);
    require_administrator(user_id, "open a support bundle")?;
    let file_name = header_text(&request, "x-mms-file-name")
        .and_then(|v| urlencoding::decode(&v).ok().map(|c| c.into_owned()))
        .unwrap_or_else(|| "support bundle".into());
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("The support bundle did not arrive as a file. Try opening it again.".into());
    };
    let overview = open_bundle_bytes(&file_name, bytes.clone())?;
    write_lines(&[format!(
        "{} INFO [rust] Support viewer opened {} ({} bytes, made {} by {})",
        stamp(),
        overview.file_name,
        overview.bytes,
        overview.manifest.created_at,
        overview.manifest.user.as_ref().map(|u| u.name.as_str()).unwrap_or("unknown")
    )]);
    Ok(overview)
}

/// Reads one part of the open bundle, e.g. "system.json" or "logs/mms-2026-11-19.log".
#[tauri::command]
pub fn diag_bundle_part(user_id: i64, path: String) -> Result<String, String> {
    require_administrator(user_id, "read a support bundle")?;
    open_bundle_part(&path)
}

/// Forgets the open bundle.
#[tauri::command]
pub fn diag_close_bundle() {
    if let Ok(mut g) = OPEN_BUNDLE.lock() {
        if let Some(b) = g.take() {
            write_lines(&[format!("{} INFO [rust] Support viewer closed {}", stamp(), b.file_name)]);
        }
    }
}

#[cfg(test)]
mod support_viewer_tests {
    use super::*;
    use crate::bundle::{BundleWriter, BundleManifest as M};

    fn sample() -> Vec<u8> {
        let mut w = BundleWriter::new(std::io::Cursor::new(Vec::new()));
        w.add_text("logs/mms-2026-11-19.log", "line\n").unwrap();
        w.add_json(part::SYSTEM, &json!({ "version": "0.9.0" })).unwrap();
        let mut m = M::new("2026-11-19 09:45:00 UTC".into(), "0.9.0".into());
        m.note = "Save failed".into();
        w.finish(m).unwrap().0.into_inner()
    }

    #[test]
    fn opens_reads_and_closes() {
        let ov = open_bundle_bytes("x.mmsbundle", sample()).unwrap();
        assert_eq!(ov.manifest.note, "Save failed");
        assert!(ov.names.contains(&"system.json".to_string()) && ov.missing.is_empty());
        assert!(open_bundle_part("system.json").unwrap().contains("0.9.0"));
        assert_eq!(open_bundle_part("logs/mms-2026-11-19.log").unwrap(), "line\n");
        assert!(open_bundle_part("backup.json").is_err());
        diag_close_bundle();
        assert!(open_bundle_part("system.json").unwrap_err().contains("No support bundle is open"));
        assert!(open_bundle_bytes("y", b"not a zip".to_vec()).is_err());
    }

    #[test]
    fn only_active_administrators() {
        let conn = crate::get_connection().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS app_users (id INTEGER PRIMARY KEY, name TEXT, role TEXT, active INTEGER);
             DELETE FROM app_users;
             INSERT INTO app_users VALUES (1,'Jess','Administrator',1),(2,'Suganya','Operator',1),(3,'Old admin','Administrator',0);",
        )
        .unwrap();
        drop(conn);
        assert!(require_administrator(1, "test").is_ok());
        assert!(require_administrator(2, "test").is_err());
        assert!(require_administrator(3, "test").is_err());
        assert!(require_administrator(99, "test").is_err());
    }
}

#[cfg(test)]
mod bundle_builder_tests {
    use super::*;

    #[test]
    fn safety_filter_leaves_out_photos_drawings_and_secrets() {
        let mut b = json!({ "backup_type": "full_data", "tables": {
            "mri_report_attachments": { "columns": ["id", "file_name", "data"], "rows": [[1, "a.jpg", "data:image/jpeg;base64,AAAA"], [2, "b.jpg", "xyz"]] },
            "template_drawings": { "columns": ["id", "image_data"], "rows": [[1, "data:image/png;base64,BBBB"]] },
            "app_users": { "columns": ["id", "name", "password_hash", "pin"], "rows": [[1, "Jess", "h", "1234"]] },
            "notes": { "columns": ["id", "blob"], "rows": [[1, format!("data:application/pdf;base64,{}", "C".repeat(3000))], [2, "short text"]] },
            "assets": { "columns": ["id", "asset_code"], "rows": [[2, "ASSET2"]] }
        }});
        let removed = filter_backup(&mut b);
        let t = &b["tables"];
        assert_eq!(t["mri_report_attachments"]["rows"][0][2], "<photo left out, 27 characters>");
        assert_eq!(t["mri_report_attachments"]["rows"][0][1], "a.jpg");
        assert!(t["template_drawings"]["rows"][0][1].as_str().unwrap().starts_with("<drawing left out"));
        assert_eq!(t["app_users"]["rows"][0][2], Value::Null);
        assert_eq!(t["app_users"]["rows"][0][3], Value::Null);
        assert_eq!(t["app_users"]["rows"][0][1], "Jess");
        assert!(t["notes"]["rows"][0][1].as_str().unwrap().starts_with("<file left out"));
        assert_eq!(t["notes"]["rows"][1][1], "short text");
        assert_eq!(t["assets"]["rows"][0][1], "ASSET2");
        assert_eq!(b["filtered_for_support"], true);
        assert!(removed.iter().any(|r| r.starts_with("mri_report_attachments.data (photo contents, 2 rows)")), "{removed:?}");
        let text = serde_json::to_string(&b).unwrap();
        assert!(!text.contains("base64,AAAA") && !text.contains("1234"));
    }

    #[test]
    fn file_names_are_safe_and_unique() {
        let n = bundle_file_name(Some("Jan-Albert Victorino"), (2026, 11, 19, 8, 5, 0));
        assert_eq!(n, "MMS-Support-Jan-Albert-Victorino-20261119-0805.mmsbundle");
        assert_eq!(bundle_file_name(Some("../..\\x"), (2026, 1, 2, 3, 4, 5)), "MMS-Support-x-20260102-0304.mmsbundle");
        assert_eq!(bundle_file_name(None, (2026, 1, 2, 3, 4, 5)), "MMS-Support-user-20260102-0304.mmsbundle");
        let dir = std::env::temp_dir().join(format!("mms-unique-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.mmsbundle"), "x").unwrap();
        assert_eq!(unique_path(&dir, "a.mmsbundle").file_name().unwrap(), "a-2.mmsbundle");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn log_budget_keeps_newest_days_and_always_today() {
        let dir = std::env::temp_dir().join(format!("mms-logbudget-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mk = |n: &str, size: usize| {
            let p = dir.join(n);
            std::fs::write(&p, vec![b'x'; size]).unwrap();
            (p, None)
        };
        let days = vec![mk("mms-2026-11-19.log", 600), mk("mms-2026-11-18.log", 300), mk("mms-2026-11-17.log", 300)];
        assert_eq!(choose_log_days(&days, 1000), (2, 1));
        assert_eq!(choose_log_days(&days, 100), (1, 2)); // today is kept even when over budget
        assert_eq!(choose_log_days(&days, 10_000), (3, 0));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
