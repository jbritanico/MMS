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
//
// Nothing here changes business data. Every command is read-only except the log and the
// session marker files.

use rusqlite::Connection;
use serde::Serialize;
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

static DIAG_DIR: OnceLock<PathBuf> = OnceLock::new();
static SESSION: OnceLock<SessionStart> = OnceLock::new();

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
    let total: usize = tables.values().map(|v| v.as_array().map(|a| a.len()).unwrap_or(0)).sum();
    write_lines(&[format!("{} INFO [rust] Exported report #{report_id} for support ({total} rows)", stamp())]);
    serde_json::to_string_pretty(&json!({
        "kind": "MMS report export for support",
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
            let _ = std::fs::write(&marker, format!("{}|{}", stamp(), version));
            // Developer runs are stopped by killing the process, so they never count as a crash.
            let unclean = !cfg!(debug_assertions) && (previous.is_some() || crash_note.is_some());
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
    let _ = std::fs::remove_file(base_dir().join("session.lock"));
}
