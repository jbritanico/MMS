use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const BROWSABLE_TABLES: [&str; 25] = [
    "assets",
    "template_components",
    "maintenance_triggers",
    "checklist_databank",
    "checklist_sections",
    "asset_types",
    "header_field_catalog",
    "mid_field_catalog",
    "footer_field_catalog",
    "mri_templates",
    "template_header_fields",
    "template_checklist_items",
    "template_mid_fields",
    "template_footer_fields",
    "template_drawings",
    "template_drawing_hotspots",
    "template_drawing_hotspot_items",
    "mri_reports",
    "mri_report_header_values",
    "mri_report_checklist_results",
    "mri_report_mid_values",
    "mri_report_footer_values",
    "mri_report_attachments",
    "lookups",
    "sqlite_sequence",
];

fn sqlite_value_to_json(v: rusqlite::types::ValueRef) -> serde_json::Value {
    match v {
        rusqlite::types::ValueRef::Null => serde_json::Value::Null,
        rusqlite::types::ValueRef::Integer(i) => serde_json::Value::from(i),
        rusqlite::types::ValueRef::Real(f) => serde_json::Value::from(f),
        rusqlite::types::ValueRef::Text(t) => {
            serde_json::Value::from(String::from_utf8_lossy(t).to_string())
        }
        rusqlite::types::ValueRef::Blob(_) => serde_json::Value::from("<binary>"),
    }
}

fn chrono_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    secs.to_string()
}

#[derive(Serialize, Deserialize)]
struct Asset {
    id: Option<i64>,
    asset_code: String,
    asset_description: String,
    country: String,
    service_line: String,
    active: bool,
    service_asset: bool,
    vehicle: bool,
    mr_last_action: String,
    last_action_by: String,
    last_action_dt: String,
    asset_type_id: Option<i64>,
    client: String,
    #[serde(default)]
    tag_status: Option<String>,
    // Why the unit currently carries its Red/Yellow/Green tag (Manual 8.1: the status and
    // applicable reason shall be documented). Written only by set_asset_tag.
    #[serde(default)]
    tag_reason: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct Trigger {
    id: i64,
    asset_id: i64,
    mr_level: String,
    trigger_type: String,
    enabled: bool,
    interval_value: i64,
    warning_value: i64,
    running_value: i64,
    tally_value: i64,
}

const MR_LEVELS: [&str; 2] = ["MR-II", "MR-III"];
const TRIGGER_TYPES: [&str; 5] = ["OH", "CA", "KM", "RIF", "EH"];

// TEMPORARY: hardcoded encryption key. Once Entra ID auth exists, this should
// be replaced with a key derived from the signed-in user's session, or at minimum
// moved to OS-level secure storage (Windows Credential Manager) instead of source code.
const DB_ENCRYPTION_KEY: &str = "sprint-mms-dev-key-change-before-production-834792F1=3#";

// Renamed from the original get_connection() -- opens a brand-new SQLite connection,
// derives the SQLCipher encryption key (deliberately slow, by design), and runs the
// full schema migration below. This now only runs ONCE per app run; see the cached
// get_connection() wrapper right after this function's closing brace.
fn open_and_migrate_connection() -> Result<Connection, String> {
    let conn = Connection::open("assets.db").map_err(|e| e.to_string())?;
    conn.pragma_update(None, "key", DB_ENCRYPTION_KEY)
        .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS asset_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL UNIQUE,
            active INTEGER NOT NULL DEFAULT 1,
            created_by TEXT NOT NULL DEFAULT 'local user',
            created_date TEXT NOT NULL,
            updated_by TEXT NOT NULL DEFAULT 'local user',
            updated_date TEXT NOT NULL,
            icon TEXT NOT NULL DEFAULT 'equipment'
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_code TEXT NOT NULL,
            asset_description TEXT,
            country TEXT,
            service_line TEXT,
            active INTEGER,
            service_asset INTEGER,
            vehicle INTEGER,
            mr_last_action TEXT,
            last_action_by TEXT,
            last_action_dt TEXT,
            asset_type_id INTEGER,
            client TEXT,
            FOREIGN KEY (asset_type_id) REFERENCES asset_types(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_code ON assets(asset_code)",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migration: add tag_status to assets for databases created before the Red/Green
    // Tag workflow existed. NULL = not yet tagged by any MR-I fault outcome. This column
    // is only ever written by the fault-approval/rectification workflow (Critical closure
    // -> 'Red', rectification verified -> 'Green') -- never editable from the Asset
    // Registry edit form.
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(assets)")
            .map_err(|e| e.to_string())?;
        let cols = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        if !cols.iter().any(|c| c == "tag_status") {
            conn.execute("ALTER TABLE assets ADD COLUMN tag_status TEXT", [])
                .map_err(|e| e.to_string())?;
        }
        if !cols.iter().any(|c| c == "tag_reason") {
            conn.execute("ALTER TABLE assets ADD COLUMN tag_reason TEXT", [])
                .map_err(|e| e.to_string())?;
        }
    }

    // Approved exemptions that allow a Red-tagged unit to be deployed (Manual 6.1.5): the
    // exemption goes through the MOC process and defines the equipment limitations, the
    // required controls, the validity period and the conditions for return to service.
    // Status: Active until revoked, or Closed automatically when the unit returns to Green.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS asset_moc_exemptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER NOT NULL,
            moc_reference TEXT NOT NULL,
            approved_by TEXT NOT NULL,
            limitations TEXT NOT NULL,
            required_controls TEXT NOT NULL,
            valid_from TEXT NOT NULL,
            valid_until TEXT NOT NULL,
            return_conditions TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Active',
            created_by TEXT,
            created_at TEXT NOT NULL,
            revoked_by TEXT,
            revoked_at TEXT,
            revoke_reason TEXT
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Positional components defined by an MR-I TEMPLATE (e.g. Left / Right pump, Front / Rear).
    // A template that lists components applies to every asset using it: the asset keeps one
    // Asset Code, tag and triggers, but each MR-I report is raised for one component
    // (mri_reports.component_id), so findings, faults, attachments and history stay separate
    // per component while remaining linked to the parent asset. Labels are free text chosen
    // by an administrator (suggestions come from the lookup criteria COMPONENT POSITION).
    // A template with no active component behaves exactly as before.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS template_components (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            label TEXT NOT NULL,
            display_order INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            created_by TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(template_id, label),
            FOREIGN KEY (template_id) REFERENCES mri_templates(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Figure 4: a fault the field team repairs on site and function-tests is closed by them
    // without review. These columns are added to databases created before this existed
    // (the error from an already-present column is deliberately ignored).
    let _ = conn.execute(
        "ALTER TABLE mri_report_checklist_results ADD COLUMN repaired_on_site INTEGER NOT NULL DEFAULT 0",
        [],
    );
    // Figure 3: the Job Number is typed in offline and checked against the Job Service
    // Report once the app is online.
    let _ = conn.execute("ALTER TABLE mri_reports ADD COLUMN job_number_status TEXT", []);
    let _ = conn.execute("ALTER TABLE mri_reports ADD COLUMN job_number_checked_at TEXT", []);
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_onsite_repair_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            template_checklist_item_id INTEGER NOT NULL,
            severity TEXT,
            action_taken TEXT,
            repaired_by TEXT,
            repaired_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    // Open job numbers / checklist IDs downloaded from the Job Service Report the last time
    // the device was online; hand-typed numbers offline are compared against this list.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS open_job_numbers (
            job_number TEXT PRIMARY KEY,
            downloaded_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Reminders a manager sends to the reviewer a fault is waiting on.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_fault_reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fault_approval_id INTEGER NOT NULL,
            sent_by_user_id INTEGER NOT NULL,
            sent_by_name TEXT NOT NULL,
            sent_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Append-only audit trail of every reviewer action on a fault.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_fault_decision_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fault_approval_id INTEGER NOT NULL,
            report_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            from_severity TEXT NOT NULL,
            to_severity TEXT,
            reviewer TEXT NOT NULL,
            review_method TEXT NOT NULL,
            notes TEXT,
            recorded_by TEXT NOT NULL,
            is_provisional INTEGER NOT NULL DEFAULT 0,
            next_user_id INTEGER,
            logged_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Every change of an asset's Red/Yellow/Green tag, with who, when, why and which report
    // caused it (Manual 8.1 and 8.2: status and reason documented, records keep the user
    // name and timestamp). Rows are only ever added, never edited.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS asset_tag_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER NOT NULL,
            tag_status TEXT NOT NULL,
            previous_tag_status TEXT,
            reason TEXT,
            report_id INTEGER,
            changed_by TEXT,
            changed_at TEXT NOT NULL,
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS maintenance_triggers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER NOT NULL,
            mr_level TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 0,
            interval_value INTEGER NOT NULL DEFAULT 0,
            warning_value INTEGER NOT NULL DEFAULT 0,
            running_value INTEGER NOT NULL DEFAULT 0,
            tally_value INTEGER NOT NULL DEFAULT 0,
            last_reset_date TEXT,
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migration: add last_reset_date to maintenance_triggers for databases created before
    // the CA (Calendar days) trigger existed. Unlike the other trigger types, CA accrues
    // from elapsed real time rather than from report deltas, so it needs a reference date
    // to measure "days since" against -- this is that reference. Backfilled to today for
    // existing rows/databases since there's no historical reset date to recover; every
    // asset's CA clock effectively (re)starts counting from the moment of this upgrade.
    // Mirrors the mri_fault_approvals migration pattern above (PRAGMA table_info check +
    // ALTER TABLE), and is kept current via sync_ca_triggers / reset_trigger_running_values.
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(maintenance_triggers)")
            .map_err(|e| e.to_string())?;
        let cols = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        if !cols.iter().any(|c| c == "last_reset_date") {
            conn.execute(
                "ALTER TABLE maintenance_triggers ADD COLUMN last_reset_date TEXT",
                [],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE maintenance_triggers SET last_reset_date = date('now') WHERE last_reset_date IS NULL",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS checklist_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_date TEXT NOT NULL,
            updated_date TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            category TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS role_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            permission_code TEXT NOT NULL,
            UNIQUE(role, permission_code)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_permission_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            permission_code TEXT NOT NULL,
            granted INTEGER NOT NULL,
            UNIQUE(user_id, permission_code),
            FOREIGN KEY (user_id) REFERENCES app_users(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Per-user country scoping. Zero rows for a user = unrestricted (sees every country) --
    // this is deliberate so shipping this feature never locks anyone out until an admin
    // actually assigns countries to them. Operator/Job Supervisor are limited to exactly one
    // row by set_user_country_access; Maintenance Supervisor/Maintenance Manager-FSM may have
    // several; Administrator is always unrestricted regardless of any rows here.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_country_access (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            country TEXT NOT NULL,
            UNIQUE(user_id, country),
            FOREIGN KEY (user_id) REFERENCES app_users(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    seed_permissions(&conn)?;

    // One-time rename migration: existing installs still have app_users/role_permissions
    // rows keyed to the old tier names. These three are unambiguous 1-to-1 renames and can
    // be applied automatically; "Tier 1" is deliberately left alone here since it now maps
    // to two different new roles (Operator / Job Supervisor) and needs a human decision per
    // user, made through the Administration screen once it offers the new role names.
    for (old_role, new_role) in [
        ("View Only", "Data Miner View"),
        ("Tier 2", "Maintenance Supervisor"),
        ("Tier 3", "Maintenance Manager / FSM"),
    ] {
        conn.execute(
            "UPDATE app_users SET role = ?1 WHERE role = ?2",
            rusqlite::params![new_role, old_role],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE role_permissions SET role = ?1 WHERE role = ?2",
            rusqlite::params![new_role, old_role],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS lookups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            criteria TEXT NOT NULL,
            name TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            UNIQUE(criteria, name)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS checklist_databank (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT 'MR-I',
            active INTEGER NOT NULL DEFAULT 1
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS header_field_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL UNIQUE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS mid_field_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL UNIQUE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS footer_field_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL UNIQUE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    seed_field_catalogs(&conn)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_name TEXT NOT NULL,
            asset_type_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Draft',
            created_by TEXT NOT NULL DEFAULT 'local user',
            created_date TEXT NOT NULL,
            updated_by TEXT NOT NULL DEFAULT 'local user',
            updated_date TEXT NOT NULL,
            FOREIGN KEY (asset_type_id) REFERENCES asset_types(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS template_header_fields (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            header_field_id INTEGER NOT NULL,
            label_override TEXT,
            data_type TEXT NOT NULL DEFAULT 'text',
            required INTEGER NOT NULL DEFAULT 0,
            display_order INTEGER NOT NULL DEFAULT 0,
            default_value TEXT,
            FOREIGN KEY (template_id) REFERENCES mri_templates(id),
            FOREIGN KEY (header_field_id) REFERENCES header_field_catalog(id),
            UNIQUE(template_id, header_field_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS template_checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id INTEGER NOT NULL,
        checklist_item_id INTEGER NOT NULL,
        section_id INTEGER,
        severity TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        required INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (template_id) REFERENCES mri_templates(id),
        FOREIGN KEY (checklist_item_id) REFERENCES checklist_databank(id),
        FOREIGN KEY (section_id) REFERENCES checklist_sections(id),
        UNIQUE(template_id, checklist_item_id)
    )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS template_mid_fields (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            mid_field_id INTEGER NOT NULL,
            display_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (template_id) REFERENCES mri_templates(id),
            FOREIGN KEY (mid_field_id) REFERENCES mid_field_catalog(id),
            UNIQUE(template_id, mid_field_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS template_footer_fields (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            footer_field_id INTEGER NOT NULL,
            display_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (template_id) REFERENCES mri_templates(id),
            FOREIGN KEY (footer_field_id) REFERENCES footer_field_catalog(id),
            UNIQUE(template_id, footer_field_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // One equipment drawing per template. image_data holds the uploaded picture as a
    // data: URL (same base64-in-SQLite approach already used for asset type icons), which
    // keeps everything inside the single encrypted SQLite file with no separate file storage
    // to manage offline.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS template_drawings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL UNIQUE,
            image_data TEXT NOT NULL,
            updated_date TEXT NOT NULL,
            FOREIGN KEY (template_id) REFERENCES mri_templates(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // A clickable point on the drawing. x/y are stored as fractions (0.0-1.0) of the
    // image's width/height rather than pixels, so the same hotspot still lines up correctly
    // no matter what size the image is rendered at.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS template_drawing_hotspots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            label TEXT,
            display_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (template_id) REFERENCES mri_templates(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Many-to-many: a hotspot can represent more than one checklist item (e.g. a cluster of
    // bolts), and the same checklist item can be pinned at more than one spot on the drawing.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS template_drawing_hotspot_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hotspot_id INTEGER NOT NULL,
            template_checklist_item_id INTEGER NOT NULL,
            FOREIGN KEY (hotspot_id) REFERENCES template_drawing_hotspots(id),
            FOREIGN KEY (template_checklist_item_id) REFERENCES template_checklist_items(id),
            UNIQUE(hotspot_id, template_checklist_item_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            asset_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Draft',
            submitted_by TEXT,
            submitted_date TEXT,
            approved_by TEXT,
            approved_date TEXT,
            created_date TEXT NOT NULL,
            FOREIGN KEY (template_id) REFERENCES mri_templates(id),
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_report_header_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            template_header_field_id INTEGER NOT NULL,
            value TEXT,
            FOREIGN KEY (report_id) REFERENCES mri_reports(id),
            FOREIGN KEY (template_header_field_id) REFERENCES template_header_fields(id),
            UNIQUE(report_id, template_header_field_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_report_checklist_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            template_checklist_item_id INTEGER NOT NULL,
            status TEXT,
            severity TEXT,
            issue_details TEXT,
            action_taken TEXT,
            date_observed TEXT,
            closure_status TEXT NOT NULL DEFAULT 'Pending',
            FOREIGN KEY (report_id) REFERENCES mri_reports(id),
            FOREIGN KEY (template_checklist_item_id) REFERENCES template_checklist_items(id),
            UNIQUE(report_id, template_checklist_item_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migration: add reported_by/reported_at to mri_report_checklist_results for databases
    // created before this existed. These capture WHO first flagged an issue and WHEN --
    // separate from date_observed (a plain text field the operator types in) and separate
    // from mri_fault_approvals' reviewer/created_date (that's the supervisor's review
    // action, not the original entry). Stamped once, the first time an item is saved as
    // Fail, and never overwritten by a later edit to action_taken/closure_status -- see
    // set_mri_report_checklist_result. This is what lets the PDF show a recurring finding's
    // full history (one stamped entry per MR-I cycle it reappeared on) instead of only the
    // current report's text. Mirrors the mri_fault_approvals migration pattern above
    // (PRAGMA table_info check + ALTER TABLE).
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(mri_report_checklist_results)")
            .map_err(|e| e.to_string())?;
        let cols = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        if !cols.iter().any(|c| c == "reported_by") {
            conn.execute(
                "ALTER TABLE mri_report_checklist_results ADD COLUMN reported_by TEXT",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !cols.iter().any(|c| c == "reported_at") {
            conn.execute(
                "ALTER TABLE mri_report_checklist_results ADD COLUMN reported_at TEXT",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Append-only log of follow-up actions on a checklist item, layered on top of the
    // original issue_details/action_taken/reported_by/reported_at captured in
    // mri_report_checklist_results (which stays exactly as-is -- this table never
    // touches it). Each row is a permanent, stamped entry: who wrote it and exactly
    // when. Rows are never edited or deleted, only added -- e.g. a Job/Maintenance
    // Supervisor closing a pending Minor item writes one entry here with their note;
    // if the same issue reappears on a later report, that report gets its own rows.
    // Combined with the cross-report matching in get_mri_checklist_history (via
    // template_checklist_items.checklist_item_id), this lets the PDF's recurring-
    // finding thread show the full chain of actions from when an issue was first
    // raised to when it was finally closed, across every MR-I cycle it carried
    // through, without anyone needing to open the older reports.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_checklist_action_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            template_checklist_item_id INTEGER NOT NULL,
            action_text TEXT NOT NULL,
            recorded_by TEXT,
            recorded_at TEXT NOT NULL,
            FOREIGN KEY (report_id) REFERENCES mri_reports(id),
            FOREIGN KEY (template_checklist_item_id) REFERENCES template_checklist_items(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_report_mid_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            template_mid_field_id INTEGER NOT NULL,
            value TEXT,
            FOREIGN KEY (report_id) REFERENCES mri_reports(id),
            FOREIGN KEY (template_mid_field_id) REFERENCES template_mid_fields(id),
            UNIQUE(report_id, template_mid_field_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    {
        let mut has_route_points = false;
        let mut stmt = conn
            .prepare("PRAGMA table_info(mri_report_mid_values)")
            .map_err(|e| e.to_string())?;
        let cols = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        if cols.iter().any(|c| c == "route_points") {
            has_route_points = true;
        }
        if !has_route_points {
            conn.execute(
                "ALTER TABLE mri_report_mid_values ADD COLUMN route_points TEXT",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_report_footer_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            template_footer_field_id INTEGER NOT NULL,
            value TEXT,
            FOREIGN KEY (report_id) REFERENCES mri_reports(id),
            FOREIGN KEY (template_footer_field_id) REFERENCES template_footer_fields(id),
            UNIQUE(report_id, template_footer_field_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Supporting photos/files attached to one checklist item's result on one report.
    // Several can be attached to the same item (a gallery), so this is not UNIQUE per item.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_report_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            template_checklist_item_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            data TEXT NOT NULL,
            uploaded_date TEXT NOT NULL,
            FOREIGN KEY (report_id) REFERENCES mri_reports(id),
            FOREIGN KEY (template_checklist_item_id) REFERENCES template_checklist_items(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Tracks the reviewer approval/reclassification workflow for a single Fail'd
    // checklist result on a report — one row per (report_id, template_checklist_item_id).
    // Created automatically (Pending) the first time a Moderate or Critical severity is
    // set on a Fail. decision moves Pending -> Approved | Reclassified | Rejected.
    // review_method distinguishes an in-person approval from one taken over the phone
    // while offline, per the Faults Severity Classification doc's offline approval flow.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_fault_approvals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            template_checklist_item_id INTEGER NOT NULL,
            original_severity TEXT NOT NULL,
            decision TEXT NOT NULL DEFAULT 'Pending',
            new_severity TEXT,
            reviewer TEXT,
            review_method TEXT,
            notes TEXT,
            created_date TEXT NOT NULL,
            updated_date TEXT NOT NULL,
            FOREIGN KEY (report_id) REFERENCES mri_reports(id),
            FOREIGN KEY (template_checklist_item_id) REFERENCES template_checklist_items(id),
            UNIQUE(report_id, template_checklist_item_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migration: add the offline/provisional-approval and carryforward columns to
    // mri_fault_approvals for databases created before this feature existed. Mirrors
    // the route_points migration pattern above (PRAGMA table_info check + ALTER TABLE).
    // recorded_by: who actually entered the decision (may be a Job Supervisor phoning
    //   it in on the real authority's behalf, distinct from `reviewer`).
    // provisional_status: 'Provisional' | 'Confirmed' | NULL (NULL = decision was made
    //   directly by the authority themselves, so confirmation doesn't apply).
    // confirmed_by / confirmed_date: set when the real authority later confirms a
    //   Provisional entry. Per the offline design, the decision takes effect
    //   immediately when recorded — confirmation only formalizes the paper trail.
    // carried_to_report_id: links a Carryforward decision to the MR-I report it
    //   reappears on in a later cycle.
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(mri_fault_approvals)")
            .map_err(|e| e.to_string())?;
        let cols = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        if !cols.iter().any(|c| c == "recorded_by") {
            conn.execute(
                "ALTER TABLE mri_fault_approvals ADD COLUMN recorded_by TEXT",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !cols.iter().any(|c| c == "provisional_status") {
            conn.execute(
                "ALTER TABLE mri_fault_approvals ADD COLUMN provisional_status TEXT",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !cols.iter().any(|c| c == "confirmed_by") {
            conn.execute(
                "ALTER TABLE mri_fault_approvals ADD COLUMN confirmed_by TEXT",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !cols.iter().any(|c| c == "confirmed_date") {
            conn.execute(
                "ALTER TABLE mri_fault_approvals ADD COLUMN confirmed_date TEXT",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !cols.iter().any(|c| c == "carried_to_report_id") {
            conn.execute(
                "ALTER TABLE mri_fault_approvals ADD COLUMN carried_to_report_id INTEGER",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        // acknowledged_by / acknowledged_date: per the Faults Severity Classification doc,
        // a Moderate fault's reviewed outcome (Approved/Reclassified/Rejected) requires the
        // respective Maintenance Manager or FSM to be informed. These stay NULL until an
        // mri.acknowledge_critical holder explicitly acknowledges it -- see
        // get_mri_fault_decisions_pending_acknowledgment / acknowledge_mri_fault_decision.
        if !cols.iter().any(|c| c == "acknowledged_by") {
            conn.execute(
                "ALTER TABLE mri_fault_approvals ADD COLUMN acknowledged_by TEXT",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !cols.iter().any(|c| c == "acknowledged_date") {
            conn.execute(
                "ALTER TABLE mri_fault_approvals ADD COLUMN acknowledged_date TEXT",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        // Named routing: per the user's requirement, a "needs your attention" item should
        // only light up for the specific person it was escalated to, not broadcast to
        // everyone holding the role. assigned_to_user_id carries the current reviewer
        // target (set at endorsement, and re-set if a Moderate fault is escalated up to
        // Critical). acknowledgment_assigned_to_user_id is the separate named target for
        // the "Maintenance Manager/FSM shall be informed" step, chosen when the Moderate
        // decision is finalized. Both nullable -- NULL means not yet assigned.
        if !cols.iter().any(|c| c == "assigned_to_user_id") {
            conn.execute(
                "ALTER TABLE mri_fault_approvals ADD COLUMN assigned_to_user_id INTEGER",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !cols.iter().any(|c| c == "acknowledgment_assigned_to_user_id") {
            conn.execute(
                "ALTER TABLE mri_fault_approvals ADD COLUMN acknowledgment_assigned_to_user_id INTEGER",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Tracks the repair/rectification loop for a fault that closed Red-Tagged (i.e. a
    // Critical fault that was NOT reclassified down). One row per fault_approval_id —
    // created once the review decision leaves the equipment Red-Tagged. tag_status starts
    // 'Red' and flips to 'Green' once repair is verified, per Diagram A's Sr. Technician/
    // Supervisor rectification loop (technician assigned -> parts availability -> repair
    // -> verification -> tag removed).
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mri_fault_rectifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fault_approval_id INTEGER NOT NULL UNIQUE,
            assigned_technician TEXT,
            parts_status TEXT NOT NULL DEFAULT 'Awaiting',
            repair_date TEXT,
            verified_by TEXT,
            verified_date TEXT,
            tag_status TEXT NOT NULL DEFAULT 'Red',
            created_date TEXT NOT NULL,
            updated_date TEXT NOT NULL,
            FOREIGN KEY (fault_approval_id) REFERENCES mri_fault_approvals(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    // Figure 4: a repair is verified only after a function test; kept on the rectification.
    let _ = conn.execute("ALTER TABLE mri_fault_rectifications ADD COLUMN function_test_passed INTEGER", []);
    // Figure 4: the field team is told about equipment limitations while a fault is open.
    let _ = conn.execute("ALTER TABLE mri_fault_rectifications ADD COLUMN limitations_note TEXT", []);
    let _ = conn.execute("ALTER TABLE mri_fault_rectifications ADD COLUMN limitations_informed_by TEXT", []);
    let _ = conn.execute("ALTER TABLE mri_fault_rectifications ADD COLUMN limitations_informed_date TEXT", []);

    // One-time (but safe to run every startup) cleanup: earlier versions of
    // purge_mri_reports deleted reports without also clearing their Fault Review data,
    // leaving orphaned rows that kept showing up in the Pending Approvals / Awaiting
    // Confirmation / Rectification Queue drawer after a purge. This removes any fault
    // approval (and its rectification, if any) whose report no longer exists. Naturally
    // idempotent -- a no-op once there's nothing orphaned left to clean.
    conn.execute(
        "DELETE FROM mri_fault_rectifications
         WHERE fault_approval_id IN (
             SELECT id FROM mri_fault_approvals
             WHERE report_id NOT IN (SELECT id FROM mri_reports)
         )",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM mri_fault_approvals WHERE report_id NOT IN (SELECT id FROM mri_reports)",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Figure 3: the operations supervisor inserts the cost to perform the MR on the report.
    // Manual 8.2: every record keeps the name of the responsible user and a timestamp, so
    // attachments and the header/mid/footer answers are stamped too. The error from an
    // already-present column is deliberately ignored (same pattern as the migrations above).
    for stmt in [
        "ALTER TABLE mri_reports ADD COLUMN mr_cost REAL",
        "ALTER TABLE mri_reports ADD COLUMN component_id INTEGER",
        "ALTER TABLE mri_reports ADD COLUMN mr_cost_by TEXT",
        "ALTER TABLE mri_reports ADD COLUMN mr_cost_date TEXT",
        "ALTER TABLE mri_report_attachments ADD COLUMN uploaded_by TEXT",
        "ALTER TABLE mri_report_header_values ADD COLUMN updated_by TEXT",
        "ALTER TABLE mri_report_header_values ADD COLUMN updated_at TEXT",
        "ALTER TABLE mri_report_mid_values ADD COLUMN updated_by TEXT",
        "ALTER TABLE mri_report_mid_values ADD COLUMN updated_at TEXT",
        "ALTER TABLE mri_report_footer_values ADD COLUMN updated_by TEXT",
        "ALTER TABLE mri_report_footer_values ADD COLUMN updated_at TEXT",
    ] {
        let _ = conn.execute(stmt, []);
    }

    Ok(conn)
}

// Every command handler calls get_connection() -- previously that meant opening a brand
// new SQLite connection, re-deriving the SQLCipher key (a deliberately slow operation),
// and re-running the entire schema migration above on EVERY single call. That overhead
// piling up across several commands firing at once (e.g. the Footer step's four queries
// on mount) was almost certainly what caused reported app hangs. Now the connection is
// opened and migrated once, cached here, and reused (behind a Mutex, since rusqlite's
// Connection isn't safely shared across threads without one) for the rest of the app's
// run. Every existing `let conn = get_connection()?;` call site keeps working unchanged,
// since MutexGuard<Connection> transparently derefs to Connection.
//
// IMPORTANT: because std::sync::Mutex is not reentrant, no function holding a `conn` from
// this may call another function that itself calls get_connection() again -- that would
// deadlock. Always pass the existing `&conn` down to helpers instead (as the codebase
// already does almost everywhere -- see the delete_mri_template fix that removed the one
// exception to this).
static DB_CONNECTION: OnceLock<Mutex<Connection>> = OnceLock::new();

fn get_connection() -> Result<MutexGuard<'static, Connection>, String> {
    if DB_CONNECTION.get().is_none() {
        let conn = open_and_migrate_connection()?;
        // If another thread's call raced us here and won, just drop our extra connection --
        // whichever one gets stored is the one every future call will share.
        let _ = DB_CONNECTION.set(Mutex::new(conn));
    }
    DB_CONNECTION
        .get()
        .expect("DB connection was just initialized above")
        .lock()
        .map_err(|_| "Database connection lock was poisoned by an earlier error".to_string())
}

fn seed_permissions(conn: &Connection) -> Result<(), String> {
    let perms: [(&str, &str, &str); 25] = [
        ("assets.view", "View assets", "Asset Registry"),
        ("assets.create", "Create assets", "Asset Registry"),
        ("assets.edit", "Edit assets", "Asset Registry"),
        ("assets.delete", "Delete assets", "Asset Registry"),
        (
            "triggers.edit",
            "Edit maintenance triggers",
            "Asset Registry",
        ),
        ("mri.submit", "Submit MR-I reports", "MR-I Reporting"),
        (
            "mri.edit_after_submit",
            "Edit MR-I after submission",
            "MR-I Reporting",
        ),
        ("mri.close_defect", "Close MR-I defects", "MR-I Reporting"),
        ("mri.approve", "Approve MR-I reports", "MR-I Reporting"),
        (
            "mri.endorse_report",
            "Endorse a submitted MR-I report -- closes it if Minor-only, or escalates its Moderate/Critical faults for review",
            "MR-I Reporting",
        ),
        (
            "mri.acknowledge_critical",
            "Acknowledge Moderate fault reviews (FSM/Maintenance Manager informed, per the severity doc)",
            "MR-I Reporting",
        ),
        (
            "mri.rectify",
            "Perform fault rectification (technician assignment, repair, tag removal)",
            "MR-I Reporting",
        ),
        (
            "mri.confirm_provisional",
            "Confirm a phoned-in provisional approval decision",
            "MR-I Reporting",
        ),
        (
            "mri.record_provisional",
            "Relay and record a phoned-in decision on another authority's behalf",
            "MR-I Reporting",
        ),
        (
            "mri.enter_cost",
            "Enter the cost to perform the MR on a report (Figure 3, operations supervisor)",
            "MR-I Reporting",
        ),
        (
            "mri_templates.view",
            "View MR-I templates",
            "Administration",
        ),
        (
            "mri_templates.edit",
            "Create/edit MR-I templates",
            "Administration",
        ),
        (
            "mri_templates.delete",
            "Delete MR-I templates",
            "Administration",
        ),
        (
            "references.edit",
            "Edit reference data (asset types, checklist bank, lookups)",
            "Administration",
        ),
        ("data_browser.view", "View Data Browser", "Administration"),
        (
            "data_browser.edit",
            "Edit rows in Data Browser",
            "Administration",
        ),
        (
            "data_purging.execute",
            "Execute data purging",
            "Administration",
        ),
        ("backups.export", "Export backups", "Administration"),
        ("backups.import", "Import backups", "Administration"),
        (
            "admin.users.manage",
            "Manage users and permissions",
            "Administration",
        ),
    ];
    // Detect the very first run that adds the cost permission, so the new defaults below are
    // granted to existing installs exactly once (and never re-granted after an admin turns
    // them off).
    let cost_perm_was_missing: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM permissions WHERE code = 'mri.enter_cost'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        == 0;
    for (code, label, category) in perms.iter() {
        conn.execute(
            "INSERT OR IGNORE INTO permissions (code, label, category) VALUES (?1, ?2, ?3)",
            rusqlite::params![code, label, category],
        )
        .map_err(|e| e.to_string())?;
    }

    // Only seed the baseline role -> permission defaults ONCE, the first time this
    // database is created. get_connection() calls seed_permissions() on every single
    // command invocation, so if we always re-inserted these defaults, any permission
    // an admin turned OFF in the Roles screen (e.g. "View assets" for View Only) would
    // silently come back the very next time any command ran. Checking that no role
    // has any permission recorded yet limits this to a true fresh install.
    let existing_role_perm_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM role_permissions", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;

    if existing_role_perm_count > 0 {
        // One-time (flagged) alignment with the clarified tiers: the Administrator is an IT
        // role without review/approval authority, and the FSM can run the rectification step.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)",
            [],
        )
        .map_err(|e| e.to_string())?;
        let already: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM app_migrations WHERE name = 'mri1_audit_permissions'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if already == 0 {
            conn.execute(
                "DELETE FROM role_permissions WHERE role = 'Administrator' AND permission_code IN
                 ('mri.edit_after_submit','mri.close_defect','mri.approve','mri.acknowledge_critical','mri.rectify',
                  'mri.confirm_provisional','mri.record_provisional','mri.endorse_report','mri.enter_cost')",
                [],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES ('Maintenance Manager / FSM', 'mri.rectify')",
                [],
            )
            .map_err(|e| e.to_string())?;
            conn.execute("INSERT OR IGNORE INTO app_migrations (name) VALUES ('mri1_audit_permissions')", [])
                .map_err(|e| e.to_string())?;
        }
        if cost_perm_was_missing {
            // Existing install picking up this release: (1) the Operations Coordinator role
            // (Table 3 / Figure 1 review authority, alongside Maintenance Supervisor) starts
            // with the same permissions as Maintenance Supervisor; (2) the cost permission
            // goes to the operations/maintenance supervising roles (not Job Supervisor, whose
            // Manual 4.5 duties do not include costing); (3) Job Supervisor gets edit-after-submit, which
            // it already had in practice through the endorse right before that permission
            // was wired to the report lock.
            conn.execute(
                "INSERT OR IGNORE INTO role_permissions (role, permission_code)
                 SELECT 'Operations Coordinator', permission_code FROM role_permissions
                 WHERE role = 'Maintenance Supervisor'",
                [],
            )
            .map_err(|e| e.to_string())?;
            for role in [
                "Operations Coordinator",
                "Maintenance Supervisor",
                "Maintenance Manager / FSM",
            ] {
                conn.execute(
                    "INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES (?1, 'mri.enter_cost')",
                    [role],
                )
                .map_err(|e| e.to_string())?;
            }
            conn.execute(
                "INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES ('Job Supervisor', 'mri.edit_after_submit')",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    let role_defaults: [(&str, &[&str]); 7] = [
        (
            "Data Miner View",
            &["assets.view", "mri_templates.view", "data_browser.view"],
        ),
        (
            "Operator",
            &[
                "assets.view",
                "mri.submit",
                "mri_templates.view",
                "data_browser.view",
            ],
        ),
        (
            "Job Supervisor",
            &[
                "assets.view",
                "mri.submit",
                "mri.edit_after_submit",
                "mri.record_provisional",
                "mri.endorse_report",
                "mri_templates.view",
                "data_browser.view",
            ],
        ),
        (
            "Operations Coordinator",
            &[
                "assets.view",
                "mri.submit",
                "mri.edit_after_submit",
                "mri.close_defect",
                "mri.confirm_provisional",
                "mri.rectify",
                "mri.endorse_report",
                "mri.enter_cost",
                "mri_templates.view",
                "data_browser.view",
            ],
        ),
        (
            "Maintenance Supervisor",
            &[
                "assets.view",
                "mri.submit",
                "mri.edit_after_submit",
                "mri.close_defect",
                "mri.confirm_provisional",
                "mri.rectify",
                "mri.endorse_report",
                "mri.enter_cost",
                "mri_templates.view",
                "data_browser.view",
            ],
        ),
        (
            "Maintenance Manager / FSM",
            &[
                "assets.view",
                "assets.create",
                "assets.edit",
                "assets.delete",
                "triggers.edit",
                "mri.submit",
                "mri.edit_after_submit",
                "mri.close_defect",
                "mri.approve",
                "mri.acknowledge_critical",
                "mri.rectify",
                "mri.confirm_provisional",
                "mri.endorse_report",
                "mri.enter_cost",
                "mri_templates.view",
                "mri_templates.edit",
                "data_browser.view",
            ],
        ),
        (
            "Administrator",
            &[
                "assets.view",
                "assets.create",
                "assets.edit",
                "assets.delete",
                "triggers.edit",
                "mri.submit",
                "mri_templates.view",
                "mri_templates.edit",
                "mri_templates.delete",
                "references.edit",
                "data_browser.view",
                "data_browser.edit",
                "data_purging.execute",
                "backups.export",
                "backups.import",
                "admin.users.manage",
            ],
        ),
    ];
    for (role, codes) in role_defaults.iter() {
        for code in codes.iter() {
            conn.execute(
                "INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES (?1, ?2)",
                rusqlite::params![role, code],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn seed_field_catalogs(conn: &Connection) -> Result<(), String> {
    let header_fields = [
        "Country",
        "Service Line",
        "Asset No",
        "Client",
        "Location",
        "String No",
        "String OD",
        "Wall Thickness",
        "Reel Swivel Operating Hours",
        "Job Operating Hours",
        "Unit Model Capacity",
        "Previous Engine Hours",
        "Current Engine Hours",
        "Engine Hours (This Report)",
        "Type",
        "BOP Bore Size",
        "BOP Redressed for CT Size",
        "BOP Redressed for Slickline Wire Size",
        "IH Redress for CT Size",
        "Stuffing Box Redressed for Wire",
        "Stripper Redressed for CT Size",
        "Storage Capacity",
        "Tank Capacity",
        "MR II Due Date",
        "MR Initization Date",
        "Compliance Stage",
        "Maintenance Type",
        "Job Number",
        "Pre-Mobilization Checklist ID",
        "OEM Serial",
        "Max OD",
        "Top Connection",
        "Bottom Connection",
        "Previous RIF",
        "Current RIF",
    ];
    for label in header_fields.iter() {
        conn.execute(
            "INSERT OR IGNORE INTO header_field_catalog (label) VALUES (?1)",
            [label],
        )
        .map_err(|e| e.to_string())?;
    }

    let mid_fields = [
        "Distance Travelled Pre-Job (KM)",
        "Distance Travelled Post-Job (KM)",
    ];
    for label in mid_fields.iter() {
        conn.execute(
            "INSERT OR IGNORE INTO mid_field_catalog (label) VALUES (?1)",
            [label],
        )
        .map_err(|e| e.to_string())?;
    }

    let footer_fields = [
        "Remarks",
        "Cleaned",
        "Green Tagged",
        "Job Ready",
        "Pressure Tested",
        "Function Tested",
        "Operator",
        "Operator Date",
        "Supervisor",
        "Supervisor Date",
    ];
    for label in footer_fields.iter() {
        conn.execute(
            "INSERT OR IGNORE INTO footer_field_catalog (label) VALUES (?1)",
            [label],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn seed_triggers(conn: &Connection, asset_id: i64) -> Result<(), String> {
    for level in MR_LEVELS.iter() {
        for ttype in TRIGGER_TYPES.iter() {
            // last_reset_date seeds to today so a newly seeded CA trigger starts its
            // elapsed-days clock from creation time rather than from NULL (which
            // sync_ca_triggers treats as "never started" and skips).
            conn.execute(
                "INSERT INTO maintenance_triggers (asset_id, mr_level, trigger_type, last_reset_date) VALUES (?1, ?2, ?3, date('now'))",
                rusqlite::params![asset_id, level, ttype],
            ).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn create_asset(asset: Asset) -> Result<String, String> {
    let conn = get_connection()?;

    let existing: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM assets WHERE asset_code = ?1",
            [&asset.asset_code],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if existing > 0 {
        return Err(format!("Asset code '{}' already exists", asset.asset_code));
    }

    conn.execute(
        "INSERT INTO assets (asset_code, asset_description, country, service_line, active, service_asset, vehicle, mr_last_action, last_action_by, last_action_dt, asset_type_id, client)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            asset.asset_code, asset.asset_description, asset.country, asset.service_line,
            asset.active as i32, asset.service_asset as i32, asset.vehicle as i32,
            asset.mr_last_action, asset.last_action_by, asset.last_action_dt, asset.asset_type_id, asset.client
        ],
    ).map_err(|e| e.to_string())?;

    let asset_id = conn.last_insert_rowid();
    seed_triggers(&conn, asset_id)?;

    Ok("Asset created".to_string())
}

#[tauri::command]
fn get_assets() -> Result<Vec<Asset>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare("SELECT id, asset_code, asset_description, country, service_line, active, service_asset, vehicle, mr_last_action, last_action_by, last_action_dt, asset_type_id, client, tag_status, tag_reason FROM assets")
        .map_err(|e| e.to_string())?;
    let assets = stmt
        .query_map([], |row| {
            Ok(Asset {
                id: row.get(0)?,
                asset_code: row.get(1)?,
                asset_description: row.get(2)?,
                country: row.get(3)?,
                service_line: row.get(4)?,
                active: row.get::<_, i32>(5)? != 0,
                service_asset: row.get::<_, i32>(6)? != 0,
                vehicle: row.get::<_, i32>(7)? != 0,
                mr_last_action: row.get(8)?,
                last_action_by: row.get(9)?,
                last_action_dt: row.get(10)?,
                asset_type_id: row.get(11)?,
                client: row.get(12)?,
                tag_status: row.get(13)?,
                tag_reason: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(assets)
}

#[tauri::command]
fn update_asset(asset: Asset) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE assets SET asset_code=?1, asset_description=?2, country=?3, service_line=?4, active=?5, service_asset=?6, vehicle=?7, mr_last_action=?8, last_action_by=?9, last_action_dt=?10, asset_type_id=?11, client=?12 WHERE id=?13",
        rusqlite::params![
            asset.asset_code, asset.asset_description, asset.country, asset.service_line,
            asset.active as i32, asset.service_asset as i32, asset.vehicle as i32,
            asset.mr_last_action, asset.last_action_by, asset.last_action_dt, asset.asset_type_id, asset.client, asset.id
        ],
    ).map_err(|e| e.to_string())?;
    Ok("Asset updated".to_string())
}

// ---- Template components (positional sub-parts an MR-I template defines, e.g. Left / Right pump) ----

#[derive(Serialize, Deserialize)]
struct TemplateComponent {
    id: i64,
    template_id: i64,
    label: String,
    display_order: i64,
    active: bool,
}

fn read_template_components(conn: &rusqlite::Connection, template_id: Option<i64>) -> Result<Vec<TemplateComponent>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, template_id, label, display_order, active FROM template_components
             WHERE (?1 IS NULL OR template_id = ?1) ORDER BY template_id, display_order, id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([template_id], |row| {
            Ok(TemplateComponent {
                id: row.get(0)?,
                template_id: row.get(1)?,
                label: row.get(2)?,
                display_order: row.get(3)?,
                active: row.get::<_, i32>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
fn get_template_components(template_id: i64) -> Result<Vec<TemplateComponent>, String> {
    let conn = get_connection()?;
    read_template_components(&conn, Some(template_id))
}

// Every component of every template, so list screens can show them without one query per template.
#[tauri::command]
fn get_all_template_components() -> Result<Vec<TemplateComponent>, String> {
    let conn = get_connection()?;
    read_template_components(&conn, None)
}

fn clean_component_label(label: &str) -> Result<String, String> {
    let trimmed = label.trim();
    if trimmed.is_empty() {
        return Err("Component name is required".to_string());
    }
    if trimmed.chars().count() > 40 {
        return Err("Component name must be 40 characters or fewer".to_string());
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
fn create_template_component(template_id: i64, label: String, created_by: String) -> Result<String, String> {
    let conn = get_connection()?;
    let label = clean_component_label(&label)?;
    let duplicate: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM template_components WHERE template_id = ?1 AND LOWER(label) = LOWER(?2)",
            rusqlite::params![template_id, &label],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if duplicate > 0 {
        return Err(format!("This template already has a component named \"{}\"", label));
    }
    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(display_order), 0) + 1 FROM template_components WHERE template_id = ?1",
            [template_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO template_components (template_id, label, display_order, active, created_by, created_at) VALUES (?1, ?2, ?3, 1, ?4, ?5)",
        rusqlite::params![template_id, label, next_order, created_by.trim(), chrono_now()],
    )
    .map_err(|e| e.to_string())?;
    Ok("Component added".to_string())
}

#[tauri::command]
fn rename_template_component(id: i64, label: String) -> Result<String, String> {
    let conn = get_connection()?;
    let label = clean_component_label(&label)?;
    let template_id: i64 = conn
        .query_row("SELECT template_id FROM template_components WHERE id = ?1", [id], |row| row.get(0))
        .map_err(|_| "Component not found".to_string())?;
    let duplicate: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM template_components WHERE template_id = ?1 AND id != ?2 AND LOWER(label) = LOWER(?3)",
            rusqlite::params![template_id, id, &label],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if duplicate > 0 {
        return Err(format!("This template already has a component named \"{}\"", label));
    }
    conn.execute("UPDATE template_components SET label = ?1 WHERE id = ?2", rusqlite::params![label, id])
        .map_err(|e| e.to_string())?;
    Ok("Component renamed".to_string())
}

#[tauri::command]
fn set_template_component_active(id: i64, active: bool) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE template_components SET active = ?1 WHERE id = ?2",
        rusqlite::params![active as i32, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(if active { "Component activated".to_string() } else { "Component deactivated".to_string() })
}

// A component that already has reports can only be deactivated, never deleted, so its
// inspection history stays attached to it.
#[tauri::command]
fn delete_template_component(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    let used: i64 = conn
        .query_row("SELECT COUNT(*) FROM mri_reports WHERE component_id = ?1", [id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if used > 0 {
        return Err("This component already has reports, so it cannot be deleted. Deactivate it instead.".to_string());
    }
    conn.execute("DELETE FROM template_components WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Component deleted".to_string())
}

#[tauri::command]
fn delete_asset(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM maintenance_triggers WHERE asset_id=?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM asset_tag_history WHERE asset_id=?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM asset_moc_exemptions WHERE asset_id=?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM assets WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Asset deleted".to_string())
}

#[tauri::command]
fn get_asset_triggers(asset_id: i64) -> Result<Vec<Trigger>, String> {
    let conn = get_connection()?;
    // Refresh CA's elapsed-days count before reading -- it accrues from real time, not
    // from report events, so it can't rely on being synced anywhere else. Cheap no-op for
    // assets with no enabled CA trigger.
    sync_ca_triggers(&conn, asset_id);
    let mut stmt = conn.prepare(
        "SELECT id, asset_id, mr_level, trigger_type, enabled, interval_value, warning_value, running_value, tally_value
         FROM maintenance_triggers WHERE asset_id = ?1 ORDER BY mr_level, trigger_type"
    ).map_err(|e| e.to_string())?;

    let triggers = stmt
        .query_map([asset_id], |row| {
            Ok(Trigger {
                id: row.get(0)?,
                asset_id: row.get(1)?,
                mr_level: row.get(2)?,
                trigger_type: row.get(3)?,
                enabled: row.get::<_, i32>(4)? != 0,
                interval_value: row.get(5)?,
                warning_value: row.get(6)?,
                running_value: row.get(7)?,
                tally_value: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(triggers)
}

#[derive(Serialize, Deserialize)]
struct TriggerUpdate {
    id: i64,
    enabled: bool,
    interval_value: i64,
    warning_value: i64,
    running_value: i64,
}

#[tauri::command]
fn update_trigger(update: TriggerUpdate) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE maintenance_triggers SET enabled=?1, interval_value=?2, warning_value=?3, running_value=?4 WHERE id=?5",
        rusqlite::params![update.enabled as i32, update.interval_value, update.warning_value, update.running_value, update.id],
    ).map_err(|e| e.to_string())?;
    Ok("Trigger updated".to_string())
}

// Zeroes out the running total on maintenance triggers -- the counters that the asset
// cards read (e.g. Engine Hours, Distance Travelled) -- either for one asset or across
// every asset. Deliberately only touches running_value: interval/warning thresholds and
// the enabled flag are configuration, not accumulated totals, so a reset shouldn't disturb
// them. Used from the Data Purge screen when starting fresh data collection.
#[tauri::command]
fn reset_trigger_running_values(asset_id: Option<i64>) -> Result<String, String> {
    let conn = get_connection()?;
    let count = if let Some(id) = asset_id {
        conn.execute(
            "UPDATE maintenance_triggers SET running_value = 0 WHERE asset_id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.execute("UPDATE maintenance_triggers SET running_value = 0", [])
            .map_err(|e| e.to_string())?
    };
    // CA doesn't just reset to 0 like the others -- it's recomputed from last_reset_date on
    // every read (see sync_ca_triggers), so without also moving last_reset_date to today it
    // would snap right back to the old elapsed-day count on the next get_asset_triggers call.
    if let Some(id) = asset_id {
        let _ = conn.execute(
            "UPDATE maintenance_triggers SET last_reset_date = date('now') WHERE asset_id = ?1 AND trigger_type = 'CA'",
            [id],
        );
    } else {
        let _ = conn.execute(
            "UPDATE maintenance_triggers SET last_reset_date = date('now') WHERE trigger_type = 'CA'",
            [],
        );
    }
    Ok(format!("{} trigger running total(s) reset to zero", count))
}

#[derive(Serialize, Deserialize)]
struct ChecklistItem {
    id: i64,
    code: String,
    description: String,
    level: String,
    active: bool,
}

#[tauri::command]
fn get_checklist_items() -> Result<Vec<ChecklistItem>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, code, description, level, active FROM checklist_databank ORDER BY level, code"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |row| {
            Ok(ChecklistItem {
                id: row.get(0)?,
                code: row.get(1)?,
                description: row.get(2)?,
                level: row.get(3)?,
                active: row.get::<_, i32>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

fn valid_level(level: &str) -> bool {
    matches!(level, "MR-I" | "MR-II" | "MR-III")
}

#[derive(Serialize, Deserialize)]
struct NewChecklistItem {
    code: String,
    description: String,
    level: String,
}

#[tauri::command]
fn create_checklist_item(item: NewChecklistItem) -> Result<String, String> {
    let conn = get_connection()?;
    let code = item.code.trim();
    let description = item.description.trim();
    let level = item.level.trim();
    if code.is_empty() || description.is_empty() {
        return Err("Checklist code and description cannot be empty".to_string());
    }
    if !valid_level(level) {
        return Err(format!(
            "Invalid level '{}' — must be MR-I, MR-II, or MR-III",
            level
        ));
    }
    let existing: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM checklist_databank WHERE code = ?1",
            [code],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err(format!("Checklist code '{}' already exists", code));
    }
    conn.execute(
        "INSERT INTO checklist_databank (code, description, level, active) VALUES (?1, ?2, ?3, 1)",
        rusqlite::params![code, description, level],
    )
    .map_err(|e| e.to_string())?;
    Ok("Checklist item created".to_string())
}

#[tauri::command]
fn update_checklist_item(item: ChecklistItem) -> Result<String, String> {
    let conn = get_connection()?;
    let code = item.code.trim();
    let description = item.description.trim();
    let level = item.level.trim();
    if code.is_empty() || description.is_empty() {
        return Err("Checklist code and description cannot be empty".to_string());
    }
    if !valid_level(level) {
        return Err(format!(
            "Invalid level '{}' — must be MR-I, MR-II, or MR-III",
            level
        ));
    }
    conn.execute(
        "UPDATE checklist_databank SET code = ?1, description = ?2, level = ?3, active = ?4 WHERE id = ?5",
        rusqlite::params![code, description, level, item.active as i32, item.id],
    ).map_err(|e| e.to_string())?;
    Ok("Checklist item updated".to_string())
}

#[tauri::command]
fn bulk_create_checklist_items(items: Vec<NewChecklistItem>) -> Result<String, String> {
    let conn = get_connection()?;
    let mut added = 0;
    let mut skipped = 0;

    for item in items {
        let code = item.code.trim().to_string();
        let description = item.description.trim().to_string();
        let level = item.level.trim().to_string();
        if code.is_empty() || description.is_empty() || !valid_level(&level) {
            skipped += 1;
            continue;
        }
        let existing: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM checklist_databank WHERE code = ?1",
                [&code],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if existing > 0 {
            skipped += 1;
            continue;
        }
        conn.execute(
            "INSERT INTO checklist_databank (code, description, level, active) VALUES (?1, ?2, ?3, 1)",
            rusqlite::params![code, description, level],
        ).map_err(|e| e.to_string())?;
        added += 1;
    }

    Ok(format!(
        "{} added, {} skipped (duplicates, empty, or invalid level)",
        added, skipped
    ))
}

#[tauri::command]
fn delete_checklist_item(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM checklist_databank WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Checklist item deleted".to_string())
}

#[derive(Serialize, Deserialize)]
struct ChecklistSection {
    id: i64,
    name: String,
}

#[tauri::command]
fn get_checklist_sections() -> Result<Vec<ChecklistSection>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT id, name FROM checklist_sections ORDER BY name")
        .map_err(|e| e.to_string())?;
    let sections = stmt
        .query_map([], |row| {
            Ok(ChecklistSection {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(sections)
}

#[tauri::command]
fn create_checklist_section(name: String) -> Result<String, String> {
    let conn = get_connection()?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Section name cannot be empty".to_string());
    }
    let existing: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM checklist_sections WHERE name = ?1",
            [trimmed],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err(format!("Section '{}' already exists", trimmed));
    }
    conn.execute(
        "INSERT INTO checklist_sections (name) VALUES (?1)",
        [trimmed],
    )
    .map_err(|e| e.to_string())?;
    Ok("Section created".to_string())
}

#[tauri::command]
fn update_checklist_section(id: i64, name: String) -> Result<String, String> {
    let conn = get_connection()?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Section name cannot be empty".to_string());
    }
    conn.execute(
        "UPDATE checklist_sections SET name = ?1 WHERE id = ?2",
        rusqlite::params![trimmed, id],
    )
    .map_err(|e| e.to_string())?;
    Ok("Section updated".to_string())
}

#[tauri::command]
fn delete_checklist_section(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM checklist_sections WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Section deleted".to_string())
}

#[tauri::command]
fn bulk_create_checklist_sections(names: Vec<String>) -> Result<String, String> {
    let conn = get_connection()?;
    let mut added = 0;
    let mut skipped = 0;

    for name in names {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            skipped += 1;
            continue;
        }
        let existing: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM checklist_sections WHERE name = ?1",
                [&trimmed],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if existing > 0 {
            skipped += 1;
            continue;
        }
        conn.execute(
            "INSERT INTO checklist_sections (name) VALUES (?1)",
            [&trimmed],
        )
        .map_err(|e| e.to_string())?;
        added += 1;
    }

    Ok(format!(
        "{} added, {} skipped (duplicates or empty)",
        added, skipped
    ))
}

#[derive(Serialize, Deserialize)]
struct AssetType {
    id: i64,
    description: String,
    active: bool,
    created_by: String,
    created_date: String,
    updated_by: String,
    updated_date: String,
    icon: String,
}

#[tauri::command]
fn get_asset_types() -> Result<Vec<AssetType>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, description, active, created_by, created_date, updated_by, updated_date, icon FROM asset_types ORDER BY description"
    ).map_err(|e| e.to_string())?;
    let types = stmt
        .query_map([], |row| {
            Ok(AssetType {
                id: row.get(0)?,
                description: row.get(1)?,
                active: row.get::<_, i32>(2)? != 0,
                created_by: row.get(3)?,
                created_date: row.get(4)?,
                updated_by: row.get(5)?,
                updated_date: row.get(6)?,
                icon: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(types)
}

#[tauri::command]
fn create_asset_type(description: String) -> Result<String, String> {
    let conn = get_connection()?;
    let trimmed = description.trim();
    if trimmed.is_empty() {
        return Err("Asset type description cannot be empty".to_string());
    }
    let existing: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM asset_types WHERE description = ?1",
            [trimmed],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err(format!("Asset type '{}' already exists", trimmed));
    }
    let now = chrono_now();
    conn.execute(
        "INSERT INTO asset_types (description, active, created_by, created_date, updated_by, updated_date)
         VALUES (?1, 1, 'local user', ?2, 'local user', ?2)",
        rusqlite::params![trimmed, now],
    ).map_err(|e| e.to_string())?;
    Ok("Asset type created".to_string())
}

#[tauri::command]
fn update_asset_type(
    id: i64,
    description: String,
    active: bool,
    icon: String,
) -> Result<String, String> {
    let conn = get_connection()?;
    let trimmed = description.trim();
    if trimmed.is_empty() {
        return Err("Asset type description cannot be empty".to_string());
    }
    let now = chrono_now();
    conn.execute(
        "UPDATE asset_types SET description = ?1, active = ?2, updated_by = 'local user', updated_date = ?3, icon = ?4 WHERE id = ?5",
        rusqlite::params![trimmed, active as i32, now, icon, id],
    ).map_err(|e| e.to_string())?;
    Ok("Asset type updated".to_string())
}

#[tauri::command]
fn bulk_create_asset_types(descriptions: Vec<String>) -> Result<String, String> {
    let conn = get_connection()?;
    let mut added = 0;
    let mut skipped = 0;

    for description in descriptions {
        let trimmed = description.trim().to_string();
        if trimmed.is_empty() {
            skipped += 1;
            continue;
        }
        let existing: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM asset_types WHERE description = ?1",
                [&trimmed],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if existing > 0 {
            skipped += 1;
            continue;
        }
        let now = chrono_now();
        conn.execute(
            "INSERT INTO asset_types (description, active, created_by, created_date, updated_by, updated_date)
             VALUES (?1, 1, 'local user', ?2, 'local user', ?2)",
            rusqlite::params![trimmed, now],
        ).map_err(|e| e.to_string())?;
        added += 1;
    }

    Ok(format!(
        "{} added, {} skipped (duplicates or empty)",
        added, skipped
    ))
}

#[tauri::command]
fn delete_asset_type(id: i64) -> Result<String, String> {
    let conn = get_connection()?;

    let asset_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM assets WHERE asset_type_id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let template_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM mri_templates WHERE asset_type_id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if asset_count > 0 || template_count > 0 {
        let mut parts = Vec::new();
        if asset_count > 0 {
            parts.push(format!("{} asset(s)", asset_count));
        }
        if template_count > 0 {
            parts.push(format!("{} MR-I template(s)", template_count));
        }
        return Err(format!(
            "Cannot delete — still used by {}. Reassign or remove those first.",
            parts.join(" and ")
        ));
    }

    conn.execute("DELETE FROM asset_types WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Asset type deleted".to_string())
}

#[derive(Serialize, Deserialize)]
struct FieldCatalogItem {
    id: i64,
    label: String,
}

#[tauri::command]
fn get_header_fields() -> Result<Vec<FieldCatalogItem>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT id, label FROM header_field_catalog ORDER BY id")
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |row| {
            Ok(FieldCatalogItem {
                id: row.get(0)?,
                label: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
fn add_header_field(label: String) -> Result<String, String> {
    let conn = get_connection()?;
    let trimmed = label.trim();
    if trimmed.is_empty() {
        return Err("Field label cannot be empty".to_string());
    }
    conn.execute(
        "INSERT OR IGNORE INTO header_field_catalog (label) VALUES (?1)",
        [trimmed],
    )
    .map_err(|e| e.to_string())?;
    Ok("Header field added".to_string())
}

#[tauri::command]
fn get_mid_fields() -> Result<Vec<FieldCatalogItem>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT id, label FROM mid_field_catalog ORDER BY id")
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |row| {
            Ok(FieldCatalogItem {
                id: row.get(0)?,
                label: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
fn add_mid_field(label: String) -> Result<String, String> {
    let conn = get_connection()?;
    let trimmed = label.trim();
    if trimmed.is_empty() {
        return Err("Field label cannot be empty".to_string());
    }
    conn.execute(
        "INSERT OR IGNORE INTO mid_field_catalog (label) VALUES (?1)",
        [trimmed],
    )
    .map_err(|e| e.to_string())?;
    Ok("Mid field added".to_string())
}

#[tauri::command]
fn get_footer_fields() -> Result<Vec<FieldCatalogItem>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT id, label FROM footer_field_catalog ORDER BY id")
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |row| {
            Ok(FieldCatalogItem {
                id: row.get(0)?,
                label: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
fn add_footer_field(label: String) -> Result<String, String> {
    let conn = get_connection()?;
    let trimmed = label.trim();
    if trimmed.is_empty() {
        return Err("Field label cannot be empty".to_string());
    }
    conn.execute(
        "INSERT OR IGNORE INTO footer_field_catalog (label) VALUES (?1)",
        [trimmed],
    )
    .map_err(|e| e.to_string())?;
    Ok("Footer field added".to_string())
}

fn valid_template_status(status: &str) -> bool {
    matches!(status, "Draft" | "Active" | "Inactive")
}

#[derive(Serialize, Deserialize)]
struct MriTemplate {
    id: i64,
    template_name: String,
    asset_type_id: i64,
    status: String,
    created_by: String,
    created_date: String,
    updated_by: String,
    updated_date: String,
}

#[tauri::command]
fn get_mri_templates() -> Result<Vec<MriTemplate>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, template_name, asset_type_id, status, created_by, created_date, updated_by, updated_date
         FROM mri_templates ORDER BY template_name"
    ).map_err(|e| e.to_string())?;
    let templates = stmt
        .query_map([], |row| {
            Ok(MriTemplate {
                id: row.get(0)?,
                template_name: row.get(1)?,
                asset_type_id: row.get(2)?,
                status: row.get(3)?,
                created_by: row.get(4)?,
                created_date: row.get(5)?,
                updated_by: row.get(6)?,
                updated_date: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(templates)
}

#[derive(Serialize, Deserialize)]
struct NewMriTemplate {
    template_name: String,
    asset_type_id: i64,
}

#[tauri::command]
fn create_mri_template(template: NewMriTemplate) -> Result<i64, String> {
    let conn = get_connection()?;
    let name = template.template_name.trim();
    if name.is_empty() {
        return Err("Template name cannot be empty".to_string());
    }
    let now = chrono_now();
    conn.execute(
        "INSERT INTO mri_templates (template_name, asset_type_id, status, created_by, created_date, updated_by, updated_date)
         VALUES (?1, ?2, 'Draft', 'local user', ?3, 'local user', ?3)",
        rusqlite::params![name, template.asset_type_id, now],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn update_mri_template_status(id: i64, status: String) -> Result<String, String> {
    let conn = get_connection()?;
    let status = status.trim();
    if !valid_template_status(status) {
        return Err(format!(
            "Invalid status '{}' — must be Draft, Active, or Inactive",
            status
        ));
    }
    let now = chrono_now();
    conn.execute(
        "UPDATE mri_templates SET status = ?1, updated_by = 'local user', updated_date = ?2 WHERE id = ?3",
        rusqlite::params![status, now, id],
    ).map_err(|e| e.to_string())?;
    Ok("Template status updated".to_string())
}

#[tauri::command]
fn rename_mri_template(id: i64, template_name: String) -> Result<String, String> {
    let conn = get_connection()?;
    let name = template_name.trim();
    if name.is_empty() {
        return Err("Template name cannot be empty".to_string());
    }
    let now = chrono_now();
    conn.execute(
        "UPDATE mri_templates SET template_name = ?1, updated_by = 'local user', updated_date = ?2 WHERE id = ?3",
        rusqlite::params![name, now, id],
    ).map_err(|e| e.to_string())?;
    Ok("Template renamed".to_string())
}

#[tauri::command]
fn delete_mri_template(id: i64) -> Result<String, String> {
    let conn = get_connection()?;

    conn.execute(
        "DELETE FROM template_header_fields WHERE template_id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM template_checklist_items WHERE template_id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM template_mid_fields WHERE template_id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM template_footer_fields WHERE template_id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM template_components WHERE template_id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;

    // Inlined from delete_template_drawing() rather than calling it directly -- that
    // function opens its own connection via get_connection(), which would try to
    // re-lock the shared connection this function is already holding and deadlock.
    let mut drawing_stmt = conn
        .prepare("SELECT id FROM template_drawing_hotspots WHERE template_id = ?1")
        .map_err(|e| e.to_string())?;
    let hotspot_ids: Vec<i64> = drawing_stmt
        .query_map([id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(drawing_stmt);
    for hid in hotspot_ids {
        conn.execute(
            "DELETE FROM template_drawing_hotspot_items WHERE hotspot_id = ?1",
            [hid],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "DELETE FROM template_drawing_hotspots WHERE template_id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM template_drawings WHERE template_id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;

    let report_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM mri_reports WHERE template_id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if report_count > 0 {
        return Err(format!(
            "Cannot delete — {} MR-I report(s) were filed using this template. Set it to Inactive instead to preserve report history.",
            report_count
        ));
    }

    conn.execute("DELETE FROM mri_templates WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Template deleted".to_string())
}

#[derive(Serialize, Deserialize)]
struct TemplateHeaderField {
    id: i64,
    template_id: i64,
    header_field_id: i64,
    label_override: Option<String>,
    data_type: String,
    required: bool,
    display_order: i64,
    default_value: Option<String>,
}

#[tauri::command]
fn get_template_header_fields(template_id: i64) -> Result<Vec<TemplateHeaderField>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, template_id, header_field_id, label_override, data_type, required, display_order, default_value
         FROM template_header_fields WHERE template_id = ?1 ORDER BY display_order"
    ).map_err(|e| e.to_string())?;
    let fields = stmt
        .query_map([template_id], |row| {
            Ok(TemplateHeaderField {
                id: row.get(0)?,
                template_id: row.get(1)?,
                header_field_id: row.get(2)?,
                label_override: row.get(3)?,
                data_type: row.get(4)?,
                required: row.get::<_, i32>(5)? != 0,
                display_order: row.get(6)?,
                default_value: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(fields)
}

#[tauri::command]
fn add_template_header_field(
    template_id: i64,
    header_field_id: i64,
    display_order: i64,
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT OR IGNORE INTO template_header_fields (template_id, header_field_id, data_type, required, display_order)
         VALUES (?1, ?2, 'text', 0, ?3)",
        rusqlite::params![template_id, header_field_id, display_order],
    ).map_err(|e| e.to_string())?;
    Ok("Header field added to template".to_string())
}

#[tauri::command]
fn remove_template_header_field(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM template_header_fields WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Header field removed from template".to_string())
}

#[tauri::command]
fn update_template_header_field(field: TemplateHeaderField) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE template_header_fields SET label_override = ?1, data_type = ?2, required = ?3, display_order = ?4, default_value = ?5 WHERE id = ?6",
        rusqlite::params![field.label_override, field.data_type, field.required as i32, field.display_order, field.default_value, field.id],
    ).map_err(|e| e.to_string())?;
    Ok("Header field updated".to_string())
}

#[derive(Serialize, Deserialize)]
struct TemplateChecklistItem {
    id: i64,
    template_id: i64,
    checklist_item_id: i64,
    section_id: Option<i64>,
    severity: Option<String>,
    display_order: i64,
    required: bool,
}

fn valid_severity(s: &str) -> bool {
    matches!(s, "Minor" | "Moderate" | "Critical")
}

#[tauri::command]
fn get_template_checklist_items(template_id: i64) -> Result<Vec<TemplateChecklistItem>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, template_id, checklist_item_id, section_id, severity, display_order, required
         FROM template_checklist_items WHERE template_id = ?1 ORDER BY display_order",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([template_id], |row| {
            Ok(TemplateChecklistItem {
                id: row.get(0)?,
                template_id: row.get(1)?,
                checklist_item_id: row.get(2)?,
                section_id: row.get(3)?,
                severity: row.get(4)?,
                display_order: row.get(5)?,
                required: row.get::<_, i32>(6)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
fn add_template_checklist_item(
    template_id: i64,
    checklist_item_id: i64,
    display_order: i64,
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT OR IGNORE INTO template_checklist_items (template_id, checklist_item_id, required, display_order)
         VALUES (?1, ?2, 0, ?3)",
        rusqlite::params![template_id, checklist_item_id, display_order],
    ).map_err(|e| e.to_string())?;
    Ok("Checklist item added to template".to_string())
}

#[tauri::command]
fn remove_template_checklist_item(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    // A hotspot can point at this checklist item — drop those links first so no
    // hotspot is left referencing a checklist item that no longer exists.
    conn.execute(
        "DELETE FROM template_drawing_hotspot_items WHERE template_checklist_item_id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM template_checklist_items WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Checklist item removed from template".to_string())
}

#[tauri::command]
fn update_template_checklist_item(item: TemplateChecklistItem) -> Result<String, String> {
    let conn = get_connection()?;
    if let Some(sev) = &item.severity {
        if !sev.is_empty() && !valid_severity(sev) {
            return Err(format!(
                "Invalid severity '{}' — must be Minor, Moderate, or Critical",
                sev
            ));
        }
    }
    conn.execute(
        "UPDATE template_checklist_items SET section_id = ?1, severity = ?2, display_order = ?3, required = ?4 WHERE id = ?5",
        rusqlite::params![item.section_id, item.severity, item.display_order, item.required as i32, item.id],
    ).map_err(|e| e.to_string())?;
    Ok("Checklist item updated".to_string())
}

// --- Template equipment drawing + hotspots ---

#[derive(Serialize, Deserialize)]
struct TemplateDrawing {
    id: i64,
    template_id: i64,
    image_data: String,
    updated_date: String,
}

#[tauri::command]
fn get_template_drawing(template_id: i64) -> Result<Option<TemplateDrawing>, String> {
    let conn = get_connection()?;
    conn.query_row(
        "SELECT id, template_id, image_data, updated_date FROM template_drawings WHERE template_id = ?1",
        [template_id],
        |row| {
            Ok(TemplateDrawing {
                id: row.get(0)?,
                template_id: row.get(1)?,
                image_data: row.get(2)?,
                updated_date: row.get(3)?,
            })
        },
    )
    .ok()
    .map_or(Ok(None), |d| Ok(Some(d)))
}

#[tauri::command]
fn set_template_drawing(template_id: i64, image_data: String) -> Result<String, String> {
    let conn = get_connection()?;
    if image_data.trim().is_empty() {
        return Err("Image data cannot be empty".to_string());
    }
    let now = chrono_now();
    conn.execute(
        "INSERT INTO template_drawings (template_id, image_data, updated_date) VALUES (?1, ?2, ?3)
         ON CONFLICT(template_id) DO UPDATE SET image_data = excluded.image_data, updated_date = excluded.updated_date",
        rusqlite::params![template_id, image_data, now],
    )
    .map_err(|e| e.to_string())?;
    Ok("Drawing saved".to_string())
}

#[tauri::command]
fn delete_template_drawing(template_id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT id FROM template_drawing_hotspots WHERE template_id = ?1")
        .map_err(|e| e.to_string())?;
    let hotspot_ids: Vec<i64> = stmt
        .query_map([template_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);
    for hid in hotspot_ids {
        conn.execute(
            "DELETE FROM template_drawing_hotspot_items WHERE hotspot_id = ?1",
            [hid],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "DELETE FROM template_drawing_hotspots WHERE template_id = ?1",
        [template_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM template_drawings WHERE template_id = ?1",
        [template_id],
    )
    .map_err(|e| e.to_string())?;
    Ok("Drawing removed".to_string())
}

#[derive(Serialize, Deserialize)]
struct Hotspot {
    id: i64,
    template_id: i64,
    x: f64,
    y: f64,
    label: Option<String>,
    display_order: i64,
    checklist_item_ids: Vec<i64>,
}

#[tauri::command]
fn get_template_drawing_hotspots(template_id: i64) -> Result<Vec<Hotspot>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, template_id, x, y, label, display_order
             FROM template_drawing_hotspots WHERE template_id = ?1 ORDER BY display_order",
        )
        .map_err(|e| e.to_string())?;
    let mut hotspots = stmt
        .query_map([template_id], |row| {
            Ok(Hotspot {
                id: row.get(0)?,
                template_id: row.get(1)?,
                x: row.get(2)?,
                y: row.get(3)?,
                label: row.get(4)?,
                display_order: row.get(5)?,
                checklist_item_ids: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut item_stmt = conn
        .prepare("SELECT template_checklist_item_id FROM template_drawing_hotspot_items WHERE hotspot_id = ?1")
        .map_err(|e| e.to_string())?;
    for h in hotspots.iter_mut() {
        h.checklist_item_ids = item_stmt
            .query_map([h.id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
    }
    Ok(hotspots)
}

#[derive(Serialize, Deserialize)]
struct NewHotspot {
    template_id: i64,
    x: f64,
    y: f64,
    label: Option<String>,
    display_order: i64,
}

#[tauri::command]
fn create_hotspot(hotspot: NewHotspot) -> Result<i64, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO template_drawing_hotspots (template_id, x, y, label, display_order) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![hotspot.template_id, hotspot.x, hotspot.y, hotspot.label, hotspot.display_order],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn update_hotspot(id: i64, x: f64, y: f64, label: Option<String>) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE template_drawing_hotspots SET x = ?1, y = ?2, label = ?3 WHERE id = ?4",
        rusqlite::params![x, y, label, id],
    )
    .map_err(|e| e.to_string())?;
    Ok("Hotspot updated".to_string())
}

#[tauri::command]
fn delete_hotspot(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "DELETE FROM template_drawing_hotspot_items WHERE hotspot_id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM template_drawing_hotspots WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Hotspot deleted".to_string())
}

#[tauri::command]
fn set_hotspot_checklist_items(
    hotspot_id: i64,
    checklist_item_ids: Vec<i64>,
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "DELETE FROM template_drawing_hotspot_items WHERE hotspot_id = ?1",
        [hotspot_id],
    )
    .map_err(|e| e.to_string())?;
    for item_id in checklist_item_ids {
        conn.execute(
            "INSERT OR IGNORE INTO template_drawing_hotspot_items (hotspot_id, template_checklist_item_id) VALUES (?1, ?2)",
            rusqlite::params![hotspot_id, item_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok("Hotspot links updated".to_string())
}

#[derive(Serialize, Deserialize)]
struct TemplateMidField {
    id: i64,
    template_id: i64,
    mid_field_id: i64,
    display_order: i64,
}

#[tauri::command]
fn get_template_mid_fields(template_id: i64) -> Result<Vec<TemplateMidField>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, template_id, mid_field_id, display_order FROM template_mid_fields WHERE template_id = ?1 ORDER BY display_order"
    ).map_err(|e| e.to_string())?;
    let fields = stmt
        .query_map([template_id], |row| {
            Ok(TemplateMidField {
                id: row.get(0)?,
                template_id: row.get(1)?,
                mid_field_id: row.get(2)?,
                display_order: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(fields)
}

#[tauri::command]
fn add_template_mid_field(
    template_id: i64,
    mid_field_id: i64,
    display_order: i64,
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT OR IGNORE INTO template_mid_fields (template_id, mid_field_id, display_order) VALUES (?1, ?2, ?3)",
        rusqlite::params![template_id, mid_field_id, display_order],
    ).map_err(|e| e.to_string())?;
    Ok("Mid field added to template".to_string())
}

#[tauri::command]
fn remove_template_mid_field(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM template_mid_fields WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Mid field removed from template".to_string())
}

#[derive(Serialize, Deserialize)]
struct TemplateFooterField {
    id: i64,
    template_id: i64,
    footer_field_id: i64,
    display_order: i64,
}

#[tauri::command]
fn get_template_footer_fields(template_id: i64) -> Result<Vec<TemplateFooterField>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, template_id, footer_field_id, display_order FROM template_footer_fields WHERE template_id = ?1 ORDER BY display_order"
    ).map_err(|e| e.to_string())?;
    let fields = stmt
        .query_map([template_id], |row| {
            Ok(TemplateFooterField {
                id: row.get(0)?,
                template_id: row.get(1)?,
                footer_field_id: row.get(2)?,
                display_order: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(fields)
}

#[tauri::command]
fn add_template_footer_field(
    template_id: i64,
    footer_field_id: i64,
    display_order: i64,
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT OR IGNORE INTO template_footer_fields (template_id, footer_field_id, display_order) VALUES (?1, ?2, ?3)",
        rusqlite::params![template_id, footer_field_id, display_order],
    ).map_err(|e| e.to_string())?;
    Ok("Footer field added to template".to_string())
}

#[tauri::command]
fn remove_template_footer_field(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM template_footer_fields WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Footer field removed from template".to_string())
}

fn valid_report_status(status: &str) -> bool {
    matches!(status, "Draft" | "Submitted" | "Approved" | "Rejected")
}

#[derive(Serialize, Deserialize)]
struct MriReport {
    id: i64,
    template_id: i64,
    asset_id: i64,
    status: String,
    submitted_by: Option<String>,
    submitted_date: Option<String>,
    approved_by: Option<String>,
    approved_date: Option<String>,
    created_date: String,
    // Figure 3: cost to perform the MR, entered by the operations supervisor.
    mr_cost: Option<f64>,
    mr_cost_by: Option<String>,
    mr_cost_date: Option<String>,
    // Which positional component of the asset this report is for (None = whole asset).
    component_id: Option<i64>,
    component_label: Option<String>,
}

#[tauri::command]
fn get_mri_reports() -> Result<Vec<MriReport>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.template_id, r.asset_id, r.status, r.submitted_by, r.submitted_date, r.approved_by, r.approved_date, r.created_date,
                r.mr_cost, r.mr_cost_by, r.mr_cost_date, r.component_id, c.label
         FROM mri_reports r LEFT JOIN template_components c ON c.id = r.component_id
         ORDER BY r.created_date DESC"
    ).map_err(|e| e.to_string())?;
    let reports = stmt
        .query_map([], |row| {
            Ok(MriReport {
                id: row.get(0)?,
                template_id: row.get(1)?,
                asset_id: row.get(2)?,
                status: row.get(3)?,
                submitted_by: row.get(4)?,
                submitted_date: row.get(5)?,
                approved_by: row.get(6)?,
                approved_date: row.get(7)?,
                created_date: row.get(8)?,
                mr_cost: row.get(9)?,
                mr_cost_by: row.get(10)?,
                mr_cost_date: row.get(11)?,
                component_id: row.get(12)?,
                component_label: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(reports)
}

#[tauri::command]
fn get_mri_report(id: i64) -> Result<MriReport, String> {
    let conn = get_connection()?;
    conn.query_row(
        "SELECT r.id, r.template_id, r.asset_id, r.status, r.submitted_by, r.submitted_date, r.approved_by, r.approved_date, r.created_date,
                r.mr_cost, r.mr_cost_by, r.mr_cost_date, r.component_id, c.label
         FROM mri_reports r LEFT JOIN template_components c ON c.id = r.component_id
         WHERE r.id = ?1",
        [id],
        |row| Ok(MriReport {
            id: row.get(0)?,
            template_id: row.get(1)?,
            asset_id: row.get(2)?,
            status: row.get(3)?,
            submitted_by: row.get(4)?,
            submitted_date: row.get(5)?,
            approved_by: row.get(6)?,
            approved_date: row.get(7)?,
            created_date: row.get(8)?,
            mr_cost: row.get(9)?,
            mr_cost_by: row.get(10)?,
            mr_cost_date: row.get(11)?,
            component_id: row.get(12)?,
            component_label: row.get(13)?,
        }),
    ).map_err(|e| e.to_string())
}

// ---- Document flow (read-only) -------------------------------------------------------
// One report and everything that hangs off it: asset and tag, faults with their decision
// and repair, on-site repairs, tag changes caused by it, carried-forward faults and the
// asset's MOC exemptions. Pure SELECTs; nothing here writes.
#[derive(Serialize)]
struct FlowRepair {
    assigned_technician: Option<String>,
    parts_status: Option<String>,
    repair_date: Option<String>,
    verified_by: Option<String>,
    verified_date: Option<String>,
    tag_status: Option<String>,
    function_test_passed: Option<bool>,
}

#[derive(Serialize)]
struct FlowLogEntry {
    action: String,
    from_severity: String,
    to_severity: Option<String>,
    reviewer: String,
    review_method: String,
    notes: Option<String>,
    recorded_by: String,
    is_provisional: bool,
    logged_at: String,
}

#[derive(Serialize)]
struct FlowFault {
    approval_id: i64,
    item_name: String,
    original_severity: String,
    decision: String,
    new_severity: Option<String>,
    reviewer: Option<String>,
    assigned_to: Option<String>,
    provisional_status: Option<String>,
    acknowledged_by: Option<String>,
    carried_to_report_id: Option<i64>,
    log_entries: i64,
    reminders: i64,
    log: Vec<FlowLogEntry>,
    repair: Option<FlowRepair>,
}

#[derive(Serialize)]
struct FlowOnsiteRepair {
    item_name: String,
    severity: Option<String>,
    action_taken: Option<String>,
    repaired_by: Option<String>,
    repaired_at: Option<String>,
}

#[derive(Serialize)]
struct FlowTagChange {
    tag_status: String,
    previous_tag_status: Option<String>,
    reason: Option<String>,
    changed_by: Option<String>,
    changed_at: Option<String>,
}

#[derive(Serialize)]
struct FlowCarried {
    approval_id: i64,
    from_report_id: i64,
    item_name: String,
}

#[derive(Serialize)]
struct FlowExemption {
    moc_reference: String,
    status: String,
    valid_from: Option<String>,
    valid_until: Option<String>,
    approved_by: Option<String>,
}

#[derive(Serialize)]
struct ReportFlow {
    report_id: i64,
    status: String,
    template_name: Option<String>,
    submitted_by: Option<String>,
    submitted_date: Option<String>,
    approved_by: Option<String>,
    approved_date: Option<String>,
    mr_cost: Option<f64>,
    mr_cost_by: Option<String>,
    mr_cost_date: Option<String>,
    asset_id: i64,
    asset_code: Option<String>,
    asset_description: Option<String>,
    asset_tag_status: Option<String>,
    country: Option<String>,
    faults: Vec<FlowFault>,
    onsite_repairs: Vec<FlowOnsiteRepair>,
    tag_changes: Vec<FlowTagChange>,
    carried_in: Vec<FlowCarried>,
    exemptions: Vec<FlowExemption>,
}

#[tauri::command]
fn get_report_flow(report_id: i64, viewer_user_id: i64) -> Result<ReportFlow, String> {
    let conn = get_connection()?;
    let mut flow = conn
        .query_row(
            "SELECT r.id, r.status, t.template_name, r.submitted_by, r.submitted_date, r.approved_by, r.approved_date,
                    r.mr_cost, r.mr_cost_by, r.mr_cost_date, r.asset_id, a.asset_code, a.asset_description, a.tag_status, a.country
             FROM mri_reports r
             LEFT JOIN mri_templates t ON t.id = r.template_id
             LEFT JOIN assets a ON a.id = r.asset_id
             WHERE r.id = ?1",
            [report_id],
            |row| {
                Ok(ReportFlow {
                    report_id: row.get(0)?,
                    status: row.get(1)?,
                    template_name: row.get(2)?,
                    submitted_by: row.get(3)?,
                    submitted_date: row.get(4)?,
                    approved_by: row.get(5)?,
                    approved_date: row.get(6)?,
                    mr_cost: row.get(7)?,
                    mr_cost_by: row.get(8)?,
                    mr_cost_date: row.get(9)?,
                    asset_id: row.get(10)?,
                    asset_code: row.get(11)?,
                    asset_description: row.get(12)?,
                    asset_tag_status: row.get(13)?,
                    country: row.get(14)?,
                    faults: Vec::new(),
                    onsite_repairs: Vec::new(),
                    tag_changes: Vec::new(),
                    carried_in: Vec::new(),
                    exemptions: Vec::new(),
                })
            },
        )
        .map_err(|e| e.to_string())?;

    // Country scoping, same rule as the review queues: a user restricted to some countries
    // cannot open the flow of a report on an asset outside them.
    if let Some(allowed) = user_country_restriction(&conn, viewer_user_id)? {
        let ok = flow.country.as_deref().map_or(false, |c| allowed.iter().any(|a| a == c));
        if !ok {
            return Err("This report is on an asset outside your country access.".to_string());
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT fa.id, COALESCE(cd.description, 'Checklist item'), COALESCE(fa.original_severity, ''), COALESCE(fa.decision, 'Pending'), fa.new_severity,
                        fa.reviewer, au.name, fa.provisional_status, fa.acknowledged_by, fa.carried_to_report_id,
                        (SELECT COUNT(*) FROM mri_fault_decision_log dl WHERE dl.fault_approval_id = fa.id),
                        fr.id, fr.assigned_technician, fr.parts_status, fr.repair_date, fr.verified_by, fr.verified_date,
                        fr.tag_status, fr.function_test_passed
                 FROM mri_fault_approvals fa
                 LEFT JOIN template_checklist_items tci ON tci.id = fa.template_checklist_item_id
                 LEFT JOIN checklist_databank cd ON cd.id = tci.checklist_item_id
                 LEFT JOIN app_users au ON au.id = fa.assigned_to_user_id
                 LEFT JOIN mri_fault_rectifications fr ON fr.fault_approval_id = fa.id
                 WHERE fa.report_id = ?1
                 ORDER BY fa.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([report_id], |row| {
                let repair_id: Option<i64> = row.get(11)?;
                let repair = if repair_id.is_some() {
                    Some(FlowRepair {
                        assigned_technician: row.get(12)?,
                        parts_status: row.get(13)?,
                        repair_date: row.get(14)?,
                        verified_by: row.get(15)?,
                        verified_date: row.get(16)?,
                        tag_status: row.get(17)?,
                        function_test_passed: row.get::<_, Option<i64>>(18)?.map(|v| v != 0),
                    })
                } else {
                    None
                };
                Ok(FlowFault {
                    approval_id: row.get(0)?,
                    item_name: row.get(1)?,
                    original_severity: row.get(2)?,
                    decision: row.get(3)?,
                    new_severity: row.get(4)?,
                    reviewer: row.get(5)?,
                    assigned_to: row.get(6)?,
                    provisional_status: row.get(7)?,
                    acknowledged_by: row.get(8)?,
                    carried_to_report_id: row.get(9)?,
                    log_entries: row.get(10)?,
                    reminders: 0,
                    log: Vec::new(),
                    repair,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            flow.faults.push(r.map_err(|e| e.to_string())?);
        }
    }

    // Audit trail per fault: every decision logged, plus how many reminders were sent.
    for f in flow.faults.iter_mut() {
        let mut stmt = conn
            .prepare(
                "SELECT action, COALESCE(from_severity, ''), to_severity, COALESCE(reviewer, ''), COALESCE(review_method, ''),
                        notes, COALESCE(recorded_by, ''), is_provisional, COALESCE(logged_at, '')
                 FROM mri_fault_decision_log WHERE fault_approval_id = ?1 ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([f.approval_id], |row| {
                Ok(FlowLogEntry {
                    action: row.get(0)?,
                    from_severity: row.get(1)?,
                    to_severity: row.get(2)?,
                    reviewer: row.get(3)?,
                    review_method: row.get(4)?,
                    notes: row.get(5)?,
                    recorded_by: row.get(6)?,
                    is_provisional: row.get::<_, i64>(7)? != 0,
                    logged_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            f.log.push(r.map_err(|e| e.to_string())?);
        }
        f.reminders = conn
            .query_row("SELECT COUNT(*) FROM mri_fault_reminders WHERE fault_approval_id = ?1", [f.approval_id], |row| row.get(0))
            .unwrap_or(0);
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(cd.description, 'Checklist item'), o.severity, o.action_taken, o.repaired_by, o.repaired_at
                 FROM mri_onsite_repair_log o
                 LEFT JOIN template_checklist_items tci ON tci.id = o.template_checklist_item_id
                 LEFT JOIN checklist_databank cd ON cd.id = tci.checklist_item_id
                 WHERE o.report_id = ?1 ORDER BY o.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([report_id], |row| {
                Ok(FlowOnsiteRepair {
                    item_name: row.get(0)?,
                    severity: row.get(1)?,
                    action_taken: row.get(2)?,
                    repaired_by: row.get(3)?,
                    repaired_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            flow.onsite_repairs.push(r.map_err(|e| e.to_string())?);
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(tag_status, ''), previous_tag_status, reason, changed_by, changed_at
                 FROM asset_tag_history WHERE report_id = ?1 ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([report_id], |row| {
                Ok(FlowTagChange {
                    tag_status: row.get(0)?,
                    previous_tag_status: row.get(1)?,
                    reason: row.get(2)?,
                    changed_by: row.get(3)?,
                    changed_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            flow.tag_changes.push(r.map_err(|e| e.to_string())?);
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT fa.id, fa.report_id, COALESCE(cd.description, 'Checklist item')
                 FROM mri_fault_approvals fa
                 LEFT JOIN template_checklist_items tci ON tci.id = fa.template_checklist_item_id
                 LEFT JOIN checklist_databank cd ON cd.id = tci.checklist_item_id
                 WHERE fa.carried_to_report_id = ?1 ORDER BY fa.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([report_id], |row| {
                Ok(FlowCarried {
                    approval_id: row.get(0)?,
                    from_report_id: row.get(1)?,
                    item_name: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            flow.carried_in.push(r.map_err(|e| e.to_string())?);
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(moc_reference, ''), COALESCE(status, ''), valid_from, valid_until, approved_by
                 FROM asset_moc_exemptions WHERE asset_id = ?1 ORDER BY id DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([flow.asset_id], |row| {
                Ok(FlowExemption {
                    moc_reference: row.get(0)?,
                    status: row.get(1)?,
                    valid_from: row.get(2)?,
                    valid_until: row.get(3)?,
                    approved_by: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            flow.exemptions.push(r.map_err(|e| e.to_string())?);
        }
    }

    Ok(flow)
}

// ---- Asset flow (read-only) ----------------------------------------------------------
// The same idea one level up: one asset and everything that happened to it over time --
// its reports in order, how faults were carried from one report to the next, every tag
// change, its maintenance triggers and MOC exemptions. Pure SELECTs, country-scoped.
#[derive(Serialize)]
struct AssetFlowReport {
    id: i64,
    status: String,
    template_name: Option<String>,
    submitted_by: Option<String>,
    submitted_date: Option<String>,
    approved_date: Option<String>,
    mr_cost: Option<f64>,
    fault_count: i64,
    open_fault_count: i64,
}

#[derive(Serialize)]
struct AssetFlowTagChange {
    tag_status: String,
    previous_tag_status: Option<String>,
    reason: Option<String>,
    report_id: Option<i64>,
    changed_by: Option<String>,
    changed_at: Option<String>,
}

#[derive(Serialize)]
struct AssetFlowCarry {
    item_name: String,
    from_report_id: i64,
    to_report_id: i64,
}

#[derive(Serialize)]
struct AssetFlowTrigger {
    mr_level: String,
    trigger_type: String,
    enabled: bool,
    interval_value: i64,
    warning_value: i64,
    running_value: i64,
    last_reset_date: Option<String>,
}

#[derive(Serialize)]
struct AssetFlow {
    asset_id: i64,
    asset_code: Option<String>,
    asset_description: Option<String>,
    asset_type: Option<String>,
    country: Option<String>,
    service_line: Option<String>,
    tag_status: Option<String>,
    tag_reason: Option<String>,
    reports: Vec<AssetFlowReport>,
    tag_changes: Vec<AssetFlowTagChange>,
    carries: Vec<AssetFlowCarry>,
    triggers: Vec<AssetFlowTrigger>,
    exemptions: Vec<FlowExemption>,
}

#[tauri::command]
fn get_asset_flow(asset_id: i64, viewer_user_id: i64) -> Result<AssetFlow, String> {
    let conn = get_connection()?;
    let mut flow = conn
        .query_row(
            "SELECT a.id, a.asset_code, a.asset_description, t.description, a.country, a.service_line, a.tag_status, a.tag_reason
             FROM assets a LEFT JOIN asset_types t ON t.id = a.asset_type_id
             WHERE a.id = ?1",
            [asset_id],
            |row| {
                Ok(AssetFlow {
                    asset_id: row.get(0)?,
                    asset_code: row.get(1)?,
                    asset_description: row.get(2)?,
                    asset_type: row.get(3)?,
                    country: row.get(4)?,
                    service_line: row.get(5)?,
                    tag_status: row.get(6)?,
                    tag_reason: row.get(7)?,
                    reports: Vec::new(),
                    tag_changes: Vec::new(),
                    carries: Vec::new(),
                    triggers: Vec::new(),
                    exemptions: Vec::new(),
                })
            },
        )
        .map_err(|e| e.to_string())?;

    if let Some(allowed) = user_country_restriction(&conn, viewer_user_id)? {
        let ok = flow.country.as_deref().map_or(false, |c| allowed.iter().any(|a| a == c));
        if !ok {
            return Err("This asset is outside your country access.".to_string());
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT r.id, r.status, t.template_name, r.submitted_by, r.submitted_date, r.approved_date, r.mr_cost,
                        (SELECT COUNT(*) FROM mri_fault_approvals fa WHERE fa.report_id = r.id),
                        (SELECT COUNT(*) FROM mri_fault_approvals fa
                           LEFT JOIN mri_fault_rectifications fr ON fr.fault_approval_id = fa.id
                           WHERE fa.report_id = r.id
                             AND (COALESCE(fa.decision, 'Pending') = 'Pending' OR (fr.id IS NOT NULL AND fr.verified_by IS NULL)))
                 FROM mri_reports r
                 LEFT JOIN mri_templates t ON t.id = r.template_id
                 WHERE r.asset_id = ?1
                 ORDER BY COALESCE(r.submitted_date, r.created_date), r.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([asset_id], |row| {
                Ok(AssetFlowReport {
                    id: row.get(0)?,
                    status: row.get(1)?,
                    template_name: row.get(2)?,
                    submitted_by: row.get(3)?,
                    submitted_date: row.get(4)?,
                    approved_date: row.get(5)?,
                    mr_cost: row.get(6)?,
                    fault_count: row.get(7)?,
                    open_fault_count: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            flow.reports.push(r.map_err(|e| e.to_string())?);
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(tag_status, ''), previous_tag_status, reason, report_id, changed_by, changed_at
                 FROM asset_tag_history WHERE asset_id = ?1 ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([asset_id], |row| {
                Ok(AssetFlowTagChange {
                    tag_status: row.get(0)?,
                    previous_tag_status: row.get(1)?,
                    reason: row.get(2)?,
                    report_id: row.get(3)?,
                    changed_by: row.get(4)?,
                    changed_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            flow.tag_changes.push(r.map_err(|e| e.to_string())?);
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(cd.description, 'Checklist item'), fa.report_id, fa.carried_to_report_id
                 FROM mri_fault_approvals fa
                 JOIN mri_reports r ON r.id = fa.report_id
                 LEFT JOIN template_checklist_items tci ON tci.id = fa.template_checklist_item_id
                 LEFT JOIN checklist_databank cd ON cd.id = tci.checklist_item_id
                 WHERE r.asset_id = ?1 AND fa.carried_to_report_id IS NOT NULL
                 ORDER BY fa.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([asset_id], |row| {
                Ok(AssetFlowCarry {
                    item_name: row.get(0)?,
                    from_report_id: row.get(1)?,
                    to_report_id: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            flow.carries.push(r.map_err(|e| e.to_string())?);
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT mr_level, trigger_type, enabled, interval_value, warning_value, running_value, last_reset_date
                 FROM maintenance_triggers WHERE asset_id = ?1 ORDER BY mr_level, trigger_type",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([asset_id], |row| {
                Ok(AssetFlowTrigger {
                    mr_level: row.get(0)?,
                    trigger_type: row.get(1)?,
                    enabled: row.get::<_, i64>(2)? != 0,
                    interval_value: row.get(3)?,
                    warning_value: row.get(4)?,
                    running_value: row.get(5)?,
                    last_reset_date: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            flow.triggers.push(r.map_err(|e| e.to_string())?);
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(moc_reference, ''), COALESCE(status, ''), valid_from, valid_until, approved_by
                 FROM asset_moc_exemptions WHERE asset_id = ?1 ORDER BY id DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([asset_id], |row| {
                Ok(FlowExemption {
                    moc_reference: row.get(0)?,
                    status: row.get(1)?,
                    valid_from: row.get(2)?,
                    valid_until: row.get(3)?,
                    approved_by: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            flow.exemptions.push(r.map_err(|e| e.to_string())?);
        }
    }

    Ok(flow)
}


// Figure 3: after the maintenance is done, the MR report is directed to the operations
// supervisor to insert the cost to perform the MR. Allowed on any submitted report (also
// after it is closed, since the cost often arrives later). Needs mri.enter_cost in the UI.
#[tauri::command]
fn set_mri_report_cost(report_id: i64, cost: f64, entered_by: String) -> Result<String, String> {
    let conn = get_connection()?;
    let entered_by = entered_by.trim();
    if entered_by.is_empty() {
        return Err("Entered-by name is required".to_string());
    }
    if !cost.is_finite() || cost < 0.0 {
        return Err("Cost must be zero or a positive number".to_string());
    }
    let status: String = conn
        .query_row("SELECT status FROM mri_reports WHERE id = ?1", [report_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if status == "Draft" {
        return Err("The cost can be entered once the report has been submitted.".to_string());
    }
    conn.execute(
        "UPDATE mri_reports SET mr_cost = ?1, mr_cost_by = ?2, mr_cost_date = ?3 WHERE id = ?4",
        rusqlite::params![cost, entered_by, chrono_now(), report_id],
    )
    .map_err(|e| e.to_string())?;
    Ok("Cost saved".to_string())
}

// Open reports (Submitted, Endorsed or Escalated) still waiting for their MR cost, for the
// operations supervisor's list. Country-scoped like the other review queues.
#[tauri::command]
fn get_reports_awaiting_cost(viewer_user_id: i64) -> Result<Vec<ReportNeedingActionRow>, String> {
    let conn = get_connection()?;
    let restriction = user_country_restriction(&conn, viewer_user_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT r.id, r.status, a.asset_code, a.asset_description, r.submitted_by, r.submitted_date,
                    (SELECT COUNT(*) FROM mri_report_checklist_results WHERE report_id = r.id AND status = 'Fail') AS issue_count,
                    a.country
             FROM mri_reports r
             JOIN assets a ON a.id = r.asset_id
             WHERE r.status IN ('Submitted', 'Endorsed', 'Escalated') AND r.mr_cost IS NULL
             ORDER BY r.submitted_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<ReportNeedingActionRow> = stmt
        .query_map([], |row| {
            let country: Option<String> = row.get(7)?;
            Ok((
                ReportNeedingActionRow {
                    id: row.get(0)?,
                    status: row.get(1)?,
                    asset_code: row.get(2)?,
                    asset_description: row.get(3)?,
                    submitted_by: row.get(4)?,
                    submitted_date: row.get(5)?,
                    issue_count: row.get(6)?,
                },
                country,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|(_, country)| match &restriction {
            None => true,
            Some(allowed) => country.as_deref().map_or(false, |c| allowed.iter().any(|a| a == c)),
        })
        .map(|(row, _)| row)
        .collect();
    Ok(rows)
}

#[derive(Serialize, Deserialize)]
struct NewMriReport {
    template_id: i64,
    asset_id: i64,
    #[serde(default)]
    component_id: Option<i64>,
}

#[tauri::command]
fn create_mri_report(report: NewMriReport) -> Result<i64, String> {
    let conn = get_connection()?;

    // A template that defines components (e.g. Left / Right pump) needs the report tied to
    // one of them; a template without components takes none. Findings, faults and history
    // are then tracked per component while the asset code, template and tag stay shared.
    let component_id = report.component_id;
    let active_components: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM template_components WHERE template_id = ?1 AND active = 1",
            [report.template_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    match component_id {
        Some(cid) => {
            let valid: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM template_components WHERE id = ?1 AND template_id = ?2 AND active = 1",
                    rusqlite::params![cid, report.template_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            if valid == 0 {
                return Err("The selected component does not belong to this template or is inactive.".to_string());
            }
        }
        None => {
            if active_components > 0 {
                return Err("This template has components — choose which component (for example Left or Right) this report is for.".to_string());
            }
        }
    }

    // Reuse an existing Draft for this asset+template+component if one already exists
    let existing_draft: Option<i64> = conn.query_row(
        "SELECT id FROM mri_reports WHERE asset_id = ?1 AND template_id = ?2 AND status = 'Draft' AND component_id IS ?3",
        rusqlite::params![report.asset_id, report.template_id, component_id],
        |row| row.get(0),
    ).ok();

    let report_id = if let Some(id) = existing_draft {
        id
    } else {
        // Block starting a brand new report while an earlier one on this asset is still
        // pending -- Submitted, Endorsed, or Escalated all mean the Supervisor hasn't
        // signed off and closed it yet. Draft and Approved don't block.
        let blocking: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, status FROM mri_reports
                 WHERE asset_id = ?1 AND status NOT IN ('Draft', 'Approved') AND component_id IS ?2
                 LIMIT 1",
                rusqlite::params![report.asset_id, component_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        if let Some((pending_id, pending_status)) = blocking {
            return Err(format!(
                "Report #{} for this asset (or component) is still {} — it must be endorsed and closed before a new MR-I report can be started for it.",
                pending_id, pending_status
            ));
        }

        let now = chrono_now();
        conn.execute(
            "INSERT INTO mri_reports (template_id, asset_id, status, created_date, component_id) VALUES (?1, ?2, 'Draft', ?3, ?4)",
            rusqlite::params![report.template_id, report.asset_id, now, component_id],
        ).map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    // Link any not-yet-linked Carryforward faults from an earlier cycle on this same
    // asset+template to this report, so there's a traceable path from the original
    // Carryforward decision to the report it reappears on. Idempotent — the
    // carried_to_report_id IS NULL guard means re-running this is a no-op once linked.
    conn.execute(
        "UPDATE mri_fault_approvals
         SET carried_to_report_id = ?1
         WHERE decision = 'Carryforward'
           AND carried_to_report_id IS NULL
           AND report_id IN (
               SELECT id FROM mri_reports
               WHERE asset_id = ?2 AND template_id = ?3 AND id != ?1 AND component_id IS ?4
           )",
        rusqlite::params![report_id, report.asset_id, report.template_id, component_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(report_id)
}

// Figure 2: the most recent non-draft report on an asset, when it was a Post-Job report.
// Returns (report_id, hours since it was submitted).
fn last_post_job_report(conn: &rusqlite::Connection, asset_id: i64, component_id: Option<i64>) -> Option<(i64, i64)> {
    let (id, submitted, created): (i64, Option<String>, String) = conn
        .query_row(
            "SELECT id, submitted_date, created_date FROM mri_reports
             WHERE asset_id = ?1 AND component_id IS ?2 AND status IN ('Submitted', 'Endorsed', 'Escalated', 'Approved')
             ORDER BY id DESC LIMIT 1",
            rusqlite::params![asset_id, component_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok()?;
    let stage = get_compliance_stage(conn, id)?.trim().to_uppercase();
    if stage != "POST JOB" {
        return None;
    }
    let ts: i64 = submitted.or(Some(created)).and_then(|s| s.trim().parse::<i64>().ok())?;
    let now: i64 = chrono_now().parse().ok()?;
    Some((id, ((now - ts).max(0)) / 3600))
}

#[derive(Serialize, Deserialize)]
struct LastPostJobInfo {
    report_id: i64,
    hours_since: i64,
    within_72h: bool,
}

#[tauri::command]
fn get_last_post_job_info(asset_id: i64, component_id: Option<i64>) -> Result<Option<LastPostJobInfo>, String> {
    let conn = get_connection()?;
    Ok(last_post_job_report(&conn, asset_id, component_id).map(|(report_id, hours)| LastPostJobInfo {
        report_id,
        hours_since: hours,
        within_72h: hours <= 72,
    }))
}

// Figure 2, time gap <= 72 hours: start the next Pre-Mob by duplicating the last Post-Job
// report, so only minimal additional entries are needed. Per-job readings (engine hours,
// RIF, job number, distance) and any open faults are NOT copied; faults still come across
// through the normal carry-forward. Over 72 hours there is no duplication at all.
#[tauri::command]
fn create_mri_report_from_last_post_job(asset_id: i64, template_id: i64, component_id: Option<i64>) -> Result<i64, String> {
    let (source_id, hours) = {
        let conn = get_connection()?;
        last_post_job_report(&conn, asset_id, component_id)
            .ok_or("There is no previous Post-Job report on this asset to copy.".to_string())?
    };
    if hours > 72 {
        return Err(format!(
            "The last Post-Job report is {} hours old. Over 72 hours no duplication is permitted — a new Pre-Mob MR-I must be completed.",
            hours
        ));
    }

    let report_id = create_mri_report(NewMriReport { template_id, asset_id, component_id })?;

    let conn = get_connection()?;
    let already_filled: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM mri_report_header_values WHERE report_id = ?1",
            [report_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if already_filled > 0 {
        return Ok(report_id);
    }

    conn.execute(
        "INSERT OR IGNORE INTO mri_report_header_values (report_id, template_header_field_id, value)
         SELECT ?1, nthf.id, v.value
         FROM mri_report_header_values v
         JOIN template_header_fields othf ON othf.id = v.template_header_field_id
         JOIN header_field_catalog hfc ON hfc.id = othf.header_field_id
         JOIN template_header_fields nthf ON nthf.template_id = ?2 AND nthf.header_field_id = hfc.id
         WHERE v.report_id = ?3
           AND LOWER(TRIM(hfc.label)) NOT IN (
               'compliance stage', 'job number', 'mr initization date', 'job operating hours',
               'previous engine hours', 'current engine hours', 'engine hours (this report)',
               'previous rif', 'current rif')",
        rusqlite::params![report_id, template_id, source_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO mri_report_header_values (report_id, template_header_field_id, value)
         SELECT ?1, thf.id, 'PREMOB'
         FROM template_header_fields thf
         JOIN header_field_catalog hfc ON hfc.id = thf.header_field_id
         WHERE thf.template_id = ?2 AND LOWER(TRIM(hfc.label)) = 'compliance stage'",
        rusqlite::params![report_id, template_id],
    )
    .map_err(|e| e.to_string())?;

    // Only the items that passed come across; the new report is still checked by hand.
    conn.execute(
        "INSERT OR IGNORE INTO mri_report_checklist_results
            (report_id, template_checklist_item_id, status, severity, issue_details, action_taken, date_observed, closure_status)
         SELECT ?1, ntci.id, 'Pass', ntci.severity, NULL, NULL, date('now', 'localtime'), 'Pending'
         FROM mri_report_checklist_results res
         JOIN template_checklist_items otci ON otci.id = res.template_checklist_item_id
         JOIN template_checklist_items ntci ON ntci.template_id = ?2 AND ntci.checklist_item_id = otci.checklist_item_id
         WHERE res.report_id = ?3 AND res.status = 'Pass'",
        rusqlite::params![report_id, template_id, source_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(report_id)
}

#[derive(Serialize, Deserialize)]
struct StandbyReminderRow {
    asset_id: i64,
    component_id: Option<i64>,
    component_label: Option<String>,
    asset_code: String,
    report_id: i64,
    days_since: i64,
}

// Figure 2: equipment kept on stand-by after a Post-Job report needs a new Pre-Job MR-I on
// day 8. Lists active assets whose latest report is a Post-Job one that has reached day 8
// (7 full days old) with no draft already started.
#[tauri::command]
fn get_standby_prejob_reminders() -> Result<Vec<StandbyReminderRow>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT id, asset_code FROM assets WHERE active = 1")
        .map_err(|e| e.to_string())?;
    let assets: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut out = Vec::new();
    for (asset_id, asset_code) in assets {
        // Check each component that has reports on this asset (or the whole asset when its
        // reports carry no component).
        let mut targets: Vec<(Option<i64>, Option<String>)> = Vec::new();
        {
            let mut cstmt = conn
                .prepare(
                    "SELECT DISTINCT r.component_id, c.label FROM mri_reports r
                     LEFT JOIN template_components c ON c.id = r.component_id
                     WHERE r.asset_id = ?1",
                )
                .map_err(|e| e.to_string())?;
            let found: Vec<(Option<i64>, Option<String>)> = cstmt
                .query_map([asset_id], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            targets.extend(found);
        }
        for (component_id, component_label) in targets {
            let Some((report_id, hours)) = last_post_job_report(&conn, asset_id, component_id) else { continue };
            if hours < 7 * 24 {
                continue;
            }
            let has_draft: bool = conn
                .query_row(
                    "SELECT 1 FROM mri_reports WHERE asset_id = ?1 AND status = 'Draft' AND component_id IS ?2 LIMIT 1",
                    rusqlite::params![asset_id, component_id],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            if has_draft {
                continue;
            }
            out.push(StandbyReminderRow {
                asset_id,
                component_id,
                component_label,
                asset_code: asset_code.clone(),
                report_id,
                days_since: hours / 24 + 1,
            });
        }
    }
    Ok(out)
}

#[tauri::command]
fn delete_mri_report(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM mri_reports WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Report deleted".to_string())
}

// True when the report's template includes the given header field (case-insensitive label).
fn template_has_header_field(conn: &rusqlite::Connection, report_id: i64, label: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM mri_reports r
         JOIN template_header_fields thf ON thf.template_id = r.template_id
         JOIN header_field_catalog hfc ON hfc.id = thf.header_field_id
         WHERE r.id = ?1 AND LOWER(TRIM(hfc.label)) = LOWER(TRIM(?2))",
        rusqlite::params![report_id, label],
        |_| Ok(true),
    )
    .unwrap_or(false)
}

#[tauri::command]
fn submit_mri_report(id: i64, submitted_by: String) -> Result<String, String> {
    let conn = get_connection()?;

    // Manual 6.1.5: a Red-tagged unit shall not be deployed without an approved MOC
    // exemption. A Pre-Mobilization or Pre-Job inspection is the deployment gate, so those
    // two occasions cannot be submitted for a Red unit that has no valid exemption.
    // Post-Job and Yard inspections stay allowed so the unit can still be inspected and
    // repaired.
    let stage = get_compliance_stage(&conn, id)
        .map(|s| s.trim().to_uppercase())
        .unwrap_or_default();

    // Compliance Stage drives the Red-tag/MOC gate and the Job Number rule below, so a
    // report whose template has that field cannot be submitted with it left empty.
    if template_has_header_field(&conn, id, "Compliance Stage") && stage.is_empty() {
        return Err("Compliance Stage is required (Pre-Mob, Pre-Job, Post Job or Yard Inspection) before a report can be submitted.".to_string());
    }

    // The Footer section (Operator, Operator Date, Supervisor, Supervisor Date) must be filled
    // in before a report can be submitted. Checkbox fields, Remarks, Green Tagged and Job
    // Ready stay optional.
    {
        let mut missing: Vec<String> = Vec::new();
        let mut stmt = conn
            .prepare(
                "SELECT c.label, COALESCE(v.value, '')
                 FROM template_footer_fields tf
                 JOIN footer_field_catalog c ON c.id = tf.footer_field_id
                 JOIN mri_reports r ON r.template_id = tf.template_id
                 LEFT JOIN mri_report_footer_values v
                        ON v.template_footer_field_id = tf.id AND v.report_id = r.id
                 WHERE r.id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (label, value) = row.map_err(|e| e.to_string())?;
            let key = label.trim().to_lowercase();
            if ["operator", "operator date", "supervisor", "supervisor date"].contains(&key.as_str())
                && value.trim().is_empty()
            {
                missing.push(label);
            }
        }
        if !missing.is_empty() {
            return Err(format!(
                "The Footer section must be completed before submitting. Missing: {}",
                missing.join(", ")
            ));
        }
    }

    // Figure 3 (Clarification 1): Pre-Mob / Pre-Job carry the Pre-Mobilization Checklist ID
    // from the Job Service Report (the job code does not exist before the job starts);
    // Post-Job carries the job code. Offline both are typed by hand and flagged for
    // checking against the JSR later. Templates without a Checklist ID field keep the
    // earlier rule (Job Number on Pre-Job).
    let mut job_number_present = false;
    if stage == "PREMOB" || stage == "PRE-JOB" {
        if template_has_header_field(&conn, id, "Pre-Mobilization Checklist ID") {
            let value = get_header_field_value(&conn, id, "Pre-Mobilization Checklist ID");
            if value.is_none() {
                return Err("Pre-Mobilization Checklist ID is required for a Pre-Mob or Pre-Job report (take it from the Job Service Report).".to_string());
            }
            job_number_present = true;
        } else if stage == "PRE-JOB" && template_has_header_field(&conn, id, "Job Number") {
            if get_header_field_value(&conn, id, "Job Number").is_none() {
                return Err("Job Number is required for a Pre-Job report (take it from the Job Service Report).".to_string());
            }
            job_number_present = true;
        }
    } else if stage == "POST JOB" && template_has_header_field(&conn, id, "Job Number") {
        if get_header_field_value(&conn, id, "Job Number").is_none() {
            return Err("Job Number is required for a Post-Job report (take it from the Job Service Report).".to_string());
        }
        job_number_present = true;
    }

    // Backend mirror of the wizard's checks: every Fail needs issue details and a severity.
    let bad_fail: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM mri_report_checklist_results
             WHERE report_id = ?1 AND status = 'Fail'
               AND (COALESCE(TRIM(issue_details), '') = '' OR COALESCE(TRIM(severity), '') = '')",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if bad_fail > 0 {
        return Err(format!("{} failed checklist item(s) are missing issue details or a severity.", bad_fail));
    }
    let unassessed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM template_checklist_items tci
             JOIN mri_reports r ON r.template_id = tci.template_id
             WHERE r.id = ?1 AND tci.required = 1
               AND NOT EXISTS (SELECT 1 FROM mri_report_checklist_results cr
                               WHERE cr.report_id = r.id AND cr.template_checklist_item_id = tci.id
                                 AND COALESCE(cr.status, '') <> '')",
            [id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if unassessed > 0 {
        return Err(format!("{} required checklist item(s) have not been assessed yet.", unassessed));
    }

    if stage == "PREMOB" || stage == "PRE-JOB" {
        let asset: Option<(i64, Option<String>)> = conn
            .query_row(
                "SELECT a.id, a.tag_status FROM mri_reports r JOIN assets a ON a.id = r.asset_id WHERE r.id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        if let Some((asset_id, tag)) = asset {
            if matches!(tag.as_deref(), Some("Red") | Some("Yellow")) {
                let valid: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM asset_moc_exemptions
                         WHERE asset_id = ?1 AND status = 'Active'
                           AND date('now', 'localtime') BETWEEN valid_from AND valid_until",
                        [asset_id],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                if valid == 0 {
                    return Err("This unit is Red/Yellow-tagged (not ready) and has no valid MOC exemption, so a Pre-Mob or Pre-Job inspection cannot be submitted (Manual 6.1.5). Record the approved exemption in the Asset Registry first.".to_string());
                }
            }
        }
    }

    let now = chrono_now();
    conn.execute(
        "UPDATE mri_reports SET status = 'Submitted', submitted_by = ?1, submitted_date = ?2 WHERE id = ?3",
        rusqlite::params![submitted_by, now, id],
    ).map_err(|e| e.to_string())?;
    if job_number_present {
        let label = if stage == "POST JOB" || !template_has_header_field(&conn, id, "Pre-Mobilization Checklist ID") {
            "Job Number"
        } else {
            "Pre-Mobilization Checklist ID"
        };
        let typed = get_header_field_value(&conn, id, label).unwrap_or_default();
        let cache_size: i64 = conn
            .query_row("SELECT COUNT(*) FROM open_job_numbers", [], |r| r.get(0))
            .unwrap_or(0);
        let known: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM open_job_numbers WHERE UPPER(job_number) = UPPER(?1)",
                [typed.trim()],
                |r| r.get(0),
            )
            .unwrap_or(0);
        // A number that is not on the downloaded list of open jobs is flagged for the
        // supervisor straight away; a listed one still awaits the online check.
        let status = if cache_size > 0 && known == 0 {
            "Not on open-job list - supervisor to check"
        } else {
            "Pending verification"
        };
        conn.execute(
            "UPDATE mri_reports SET job_number_status = ?1 WHERE id = ?2",
            rusqlite::params![status, id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Manual Rev 02: a Critical fault Red-tags the unit (stop-use) as soon as the
    // report is submitted, not only after the review decision.
    let critical_fails: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM mri_report_checklist_results
             WHERE report_id = ?1 AND status = 'Fail' AND severity = 'Critical' AND repaired_on_site = 0",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if critical_fails > 0 {
        let asset_id: Option<i64> = conn
            .query_row("SELECT asset_id FROM mri_reports WHERE id = ?1", [id], |row| row.get(0))
            .ok()
            .flatten();
        if let Some(asset_id) = asset_id {
            set_asset_tag(
                &conn,
                asset_id,
                "Red",
                &format!("Critical fault reported (report #{})", id),
                Some(id),
                &submitted_by,
            )?;
        }
    }
    Ok("Report submitted".to_string())
}

// Replaces the cached list of open job numbers / checklist IDs (call after each online
// download of the Job Service Report).
#[tauri::command]
fn set_open_job_numbers(job_numbers: Vec<String>) -> Result<String, String> {
    let conn = get_connection()?;
    let now = chrono_now();
    conn.execute("DELETE FROM open_job_numbers", []).map_err(|e| e.to_string())?;
    let mut n = 0;
    for j in job_numbers.iter().map(|j| j.trim()).filter(|j| !j.is_empty()) {
        conn.execute(
            "INSERT OR REPLACE INTO open_job_numbers (job_number, downloaded_at) VALUES (?1, ?2)",
            rusqlite::params![j, now],
        )
        .map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(format!("{} open job numbers cached", n))
}

#[derive(Serialize, Deserialize)]
struct JobNumberCheck {
    cached: i64,
    known: bool,
}

// Used by the wizard to warn the user while typing: is this number on the cached list?
#[tauri::command]
fn check_job_number(job_number: String) -> Result<JobNumberCheck, String> {
    let conn = get_connection()?;
    let cached: i64 = conn
        .query_row("SELECT COUNT(*) FROM open_job_numbers", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let known: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM open_job_numbers WHERE UPPER(job_number) = UPPER(?1)",
            [job_number.trim()],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(JobNumberCheck { cached, known: known > 0 })
}

// Records the result of the online check against the Job Service Report. A mismatch stays
// visible to the supervisor through get_job_number_flags.
#[tauri::command]
fn set_job_number_verification(report_id: i64, verified: bool) -> Result<String, String> {
    let conn = get_connection()?;
    let status = if verified { "Verified" } else { "Mismatch - supervisor to review" };
    conn.execute(
        "UPDATE mri_reports SET job_number_status = ?1, job_number_checked_at = ?2 WHERE id = ?3",
        rusqlite::params![status, chrono_now(), report_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(status.to_string())
}

#[derive(Serialize, Deserialize)]
struct JobNumberFlag {
    report_id: i64,
    asset_id: Option<i64>,
    job_number_status: String,
}

#[tauri::command]
fn get_job_number_flags() -> Result<Vec<JobNumberFlag>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, asset_id, job_number_status FROM mri_reports
             WHERE job_number_status LIKE 'Mismatch%' OR job_number_status LIKE 'Not on open-job list%'
             ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(JobNumberFlag { report_id: row.get(0)?, asset_id: row.get(1)?, job_number_status: row.get(2)? })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
fn set_mri_report_status(id: i64, status: String) -> Result<String, String> {
    let conn = get_connection()?;
    let status = status.trim();
    if !valid_report_status(status) {
        return Err(format!("Invalid status '{}'", status));
    }
    // Submit, endorse, escalate and close each have their own checked command; this generic
    // setter must not be a way around them.
    if status != "Draft" {
        return Err("Use the Submit, Endorse and Close actions to move a report forward; a status cannot be set directly.".to_string());
    }
    let now = chrono_now();
    if status == "Approved" || status == "Rejected" {
        conn.execute(
            "UPDATE mri_reports SET status = ?1, approved_by = 'local user', approved_date = ?2 WHERE id = ?3",
            rusqlite::params![status, now, id],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE mri_reports SET status = ?1 WHERE id = ?2",
            rusqlite::params![status, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok("Report status updated".to_string())
}

#[derive(Serialize, Deserialize)]
struct MriReportHeaderValue {
    id: i64,
    report_id: i64,
    template_header_field_id: i64,
    value: Option<String>,
}

#[tauri::command]
fn get_mri_report_header_values(report_id: i64) -> Result<Vec<MriReportHeaderValue>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, report_id, template_header_field_id, value FROM mri_report_header_values WHERE report_id = ?1"
    ).map_err(|e| e.to_string())?;
    let values = stmt
        .query_map([report_id], |row| {
            Ok(MriReportHeaderValue {
                id: row.get(0)?,
                report_id: row.get(1)?,
                template_header_field_id: row.get(2)?,
                value: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(values)
}

#[tauri::command]
fn set_mri_report_header_value(
    report_id: i64,
    template_header_field_id: i64,
    value: String,
    updated_by: Option<String>,
) -> Result<String, String> {
    let conn = get_connection()?;
    // Manual 8.2: records keep the name of the responsible user and a timestamp.
    conn.execute(
        "INSERT INTO mri_report_header_values (report_id, template_header_field_id, value, updated_by, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(report_id, template_header_field_id) DO UPDATE SET
            value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
        rusqlite::params![report_id, template_header_field_id, value, updated_by, chrono_now()],
    )
    .map_err(|e| e.to_string())?;
    Ok("Header value saved".to_string())
}

fn valid_checklist_status(s: &str) -> bool {
    matches!(s, "Pass" | "Fail")
}

fn valid_closure_status(s: &str) -> bool {
    matches!(s, "Pending" | "Closed")
}

#[derive(Serialize, Deserialize)]
struct MriReportChecklistResult {
    id: i64,
    report_id: i64,
    template_checklist_item_id: i64,
    status: Option<String>,
    severity: Option<String>,
    issue_details: Option<String>,
    action_taken: Option<String>,
    date_observed: Option<String>,
    closure_status: String,
    // Who/when this item was first saved as Fail -- see the migration comment above and
    // set_mri_report_checklist_result below. reported_by is sent by the frontend on every
    // save (the current user's name) but only actually stamped server-side the first time;
    // reported_at is a server-side timestamp, never client-supplied.
    reported_by: Option<String>,
    reported_at: Option<String>,
    // Figure 4: repaired by the field team and function-tested on site, so closed without
    // reviewer escalation and without a Red tag.
    #[serde(default)]
    repaired_on_site: bool,
}

#[tauri::command]
fn get_mri_report_checklist_results(
    report_id: i64,
) -> Result<Vec<MriReportChecklistResult>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, report_id, template_checklist_item_id, status, severity, issue_details, action_taken, date_observed, closure_status, reported_by, reported_at, repaired_on_site
         FROM mri_report_checklist_results WHERE report_id = ?1"
    ).map_err(|e| e.to_string())?;
    let results = stmt
        .query_map([report_id], |row| {
            Ok(MriReportChecklistResult {
                id: row.get(0)?,
                report_id: row.get(1)?,
                template_checklist_item_id: row.get(2)?,
                status: row.get(3)?,
                severity: row.get(4)?,
                issue_details: row.get(5)?,
                action_taken: row.get(6)?,
                date_observed: row.get(7)?,
                closure_status: row.get(8)?,
                reported_by: row.get(9)?,
                reported_at: row.get(10)?,
                repaired_on_site: row.get::<_, i32>(11)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(results)
}

#[tauri::command]
fn set_mri_report_checklist_result(result: MriReportChecklistResult) -> Result<String, String> {
    let conn = get_connection()?;

    if let Some(s) = &result.status {
        if !s.is_empty() && !valid_checklist_status(s) {
            return Err(format!("Invalid status '{}' — must be Pass or Fail", s));
        }
        // Issue details / action taken are no longer required here — a Fail mark
        // now saves immediately so it's never silently lost, and the Review step
        // validates completeness (issue details, action taken, severity) before
        // the report can be submitted.
    }
    if let Some(sev) = &result.severity {
        if !sev.is_empty() && !valid_severity(sev) {
            return Err(format!(
                "Invalid severity '{}' — must be Minor, Moderate, or Critical (Major / Critical)",
                sev
            ));
        }
    }
    if !valid_closure_status(&result.closure_status) {
        return Err(format!(
            "Invalid closure status '{}' — must be Pending or Closed",
            result.closure_status
        ));
    }

    // Figure 4: only a Fail can be "repaired on site", it needs the action taken written
    // down, and it is closed by the field team right away.
    let mut result = result;
    if result.repaired_on_site {
        if result.status.as_deref() != Some("Fail") {
            result.repaired_on_site = false;
        } else if result.action_taken.as_deref().map_or(true, |a| a.trim().is_empty()) {
            return Err("Describe the repair in Action Taken before marking this fault as repaired on site (function test performed).".to_string());
        } else {
            result.closure_status = "Closed".to_string();
        }
    }

    conn.execute(
        "INSERT INTO mri_report_checklist_results (report_id, template_checklist_item_id, status, severity, issue_details, action_taken, date_observed, closure_status, reported_by, reported_at, repaired_on_site)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
            CASE WHEN ?3 = 'Fail' THEN ?9 ELSE NULL END,
            CASE WHEN ?3 = 'Fail' THEN datetime('now', 'localtime') ELSE NULL END,
            ?10)
         ON CONFLICT(report_id, template_checklist_item_id) DO UPDATE SET
            status = excluded.status,
            severity = excluded.severity,
            issue_details = excluded.issue_details,
            action_taken = excluded.action_taken,
            date_observed = excluded.date_observed,
            closure_status = excluded.closure_status,
            repaired_on_site = excluded.repaired_on_site,
            reported_by = CASE WHEN reported_by IS NULL AND excluded.status = 'Fail' THEN excluded.reported_by ELSE reported_by END,
            reported_at = CASE WHEN reported_at IS NULL AND excluded.status = 'Fail' THEN excluded.reported_at ELSE reported_at END",
        rusqlite::params![
            result.report_id, result.template_checklist_item_id, result.status, result.severity,
            result.issue_details, result.action_taken, result.date_observed, result.closure_status,
            result.reported_by, result.repaired_on_site as i32
        ],
    ).map_err(|e| e.to_string())?;
    // Audit trail for faults closed on site (who, when, what was done), so a Critical fault
    // closed without review is always traceable.
    if result.repaired_on_site {
        // One row per fault: re-saving the same repair updates it instead of adding another.
        let updated = conn
            .execute(
                "UPDATE mri_onsite_repair_log SET severity = ?3, action_taken = ?4
                 WHERE report_id = ?1 AND template_checklist_item_id = ?2",
                rusqlite::params![
                    result.report_id, result.template_checklist_item_id, result.severity,
                    result.action_taken
                ],
            )
            .map_err(|e| e.to_string())?;
        if updated == 0 {
            conn.execute(
                "INSERT INTO mri_onsite_repair_log (report_id, template_checklist_item_id, severity, action_taken, repaired_by, repaired_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, datetime('now', 'localtime'))",
                rusqlite::params![
                    result.report_id, result.template_checklist_item_id, result.severity,
                    result.action_taken, result.reported_by
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    // A fault repaired on site never goes to a reviewer, so drop any review row that was
    // opened for it before the field team marked it repaired.
    if result.repaired_on_site {
        conn.execute(
            "DELETE FROM mri_fault_approvals
             WHERE report_id = ?1 AND template_checklist_item_id = ?2 AND decision = 'Pending'",
            rusqlite::params![result.report_id, result.template_checklist_item_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok("Checklist result saved".to_string())
}

// Cross-report history of Fail entries for a checklist item on one asset, used by the
// MR-I report PDF's page 2 to show a "recurring finding" thread: every past occurrence of
// the same checklist_databank item (matched via template_checklist_items.checklist_item_id,
// which stays stable even if different templates/report cycles use different
// template_checklist_item_id rows) across every previous report on the asset, each stamped
// with who reported it and when. exclude_report_id is normally the report currently being
// reviewed, so its own (not-yet-historical) entry isn't double-counted.
#[derive(Serialize, Deserialize)]
struct MriChecklistHistoryEntry {
    report_id: i64,
    checklist_item_id: i64,
    report_date: String,
    issue_details: Option<String>,
    action_taken: Option<String>,
    severity: Option<String>,
    closure_status: String,
    reported_by: Option<String>,
    reported_at: Option<String>,
}

#[tauri::command]
fn get_mri_checklist_history(
    asset_id: i64,
    exclude_report_id: i64,
) -> Result<Vec<MriChecklistHistoryEntry>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT res.report_id, tci.checklist_item_id, r.created_date, res.issue_details, res.action_taken, res.severity, res.closure_status, res.reported_by, res.reported_at
         FROM mri_report_checklist_results res
         JOIN mri_reports r ON r.id = res.report_id
         JOIN template_checklist_items tci ON tci.id = res.template_checklist_item_id
         WHERE r.asset_id = ?1 AND res.status = 'Fail' AND res.report_id != ?2
         ORDER BY r.created_date ASC, r.id ASC"
    ).map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map(rusqlite::params![asset_id, exclude_report_id], |row| {
            Ok(MriChecklistHistoryEntry {
                report_id: row.get(0)?,
                checklist_item_id: row.get(1)?,
                report_date: row.get(2)?,
                issue_details: row.get(3)?,
                action_taken: row.get(4)?,
                severity: row.get(5)?,
                closure_status: row.get(6)?,
                reported_by: row.get(7)?,
                reported_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(entries)
}

// Append-only follow-up actions on a checklist item -- see the mri_checklist_action_log
// migration comment above. Rows are only ever inserted, never updated or deleted, so the
// full chain of who-did-what-and-when survives forever, independent of and in addition to
// the original issue_details/action_taken/reported_by/reported_at on the checklist result
// itself.
#[derive(Serialize, Deserialize)]
struct MriChecklistActionEntry {
    id: i64,
    report_id: i64,
    checklist_item_id: i64,
    report_date: String,
    action_text: String,
    recorded_by: Option<String>,
    recorded_at: String,
}

#[tauri::command]
fn add_mri_checklist_action(
    report_id: i64,
    template_checklist_item_id: i64,
    action_text: String,
    recorded_by: Option<String>,
) -> Result<i64, String> {
    if action_text.trim().is_empty() {
        return Err("Action text cannot be empty".to_string());
    }
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO mri_checklist_action_log (report_id, template_checklist_item_id, action_text, recorded_by, recorded_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now', 'localtime'))",
        rusqlite::params![report_id, template_checklist_item_id, action_text.trim(), recorded_by],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

// Every action-log entry recorded so far on this whole report, across every checklist
// item -- used to render each item's live, read-only "already added" list plus its blank
// box to append a new one. Fetched once per report (not once per item) and grouped by
// checklist_item_id on the frontend, same pattern as get_mri_checklist_history.
#[tauri::command]
fn get_mri_checklist_actions(report_id: i64) -> Result<Vec<MriChecklistActionEntry>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT log.id, log.report_id, tci.checklist_item_id, r.created_date, log.action_text, log.recorded_by, log.recorded_at
         FROM mri_checklist_action_log log
         JOIN mri_reports r ON r.id = log.report_id
         JOIN template_checklist_items tci ON tci.id = log.template_checklist_item_id
         WHERE log.report_id = ?1
         ORDER BY log.id ASC"
    ).map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map(rusqlite::params![report_id], |row| {
            Ok(MriChecklistActionEntry {
                id: row.get(0)?,
                report_id: row.get(1)?,
                checklist_item_id: row.get(2)?,
                report_date: row.get(3)?,
                action_text: row.get(4)?,
                recorded_by: row.get(5)?,
                recorded_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(entries)
}

// Every action-log entry across every PRIOR report on the asset, for the PDF's
// recurring-finding thread -- mirrors get_mri_checklist_history's own join pattern
// (matched via template_checklist_items.checklist_item_id, the stable id across cycles).
// exclude_report_id is normally the report currently being reviewed, so its own
// (not-yet-historical) entries -- already available via get_mri_checklist_actions --
// aren't double-counted.
#[tauri::command]
fn get_mri_checklist_action_history(
    asset_id: i64,
    exclude_report_id: i64,
) -> Result<Vec<MriChecklistActionEntry>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT log.id, log.report_id, tci.checklist_item_id, r.created_date, log.action_text, log.recorded_by, log.recorded_at
         FROM mri_checklist_action_log log
         JOIN mri_reports r ON r.id = log.report_id
         JOIN template_checklist_items tci ON tci.id = log.template_checklist_item_id
         WHERE r.asset_id = ?1 AND log.report_id != ?2
         ORDER BY log.id ASC"
    ).map_err(|e| e.to_string())?;
    let entries = stmt
        .query_map(rusqlite::params![asset_id, exclude_report_id], |row| {
            Ok(MriChecklistActionEntry {
                id: row.get(0)?,
                report_id: row.get(1)?,
                checklist_item_id: row.get(2)?,
                report_date: row.get(3)?,
                action_text: row.get(4)?,
                recorded_by: row.get(5)?,
                recorded_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(entries)
}

fn valid_approval_decision(s: &str) -> bool {
    matches!(
        s,
        "Pending" | "Approved" | "Reclassified" | "Rejected" | "Carryforward"
    )
}

fn valid_review_method(s: &str) -> bool {
    matches!(s, "In-Person" | "Phone")
}

#[derive(Serialize, Deserialize)]
struct MriFaultApproval {
    id: i64,
    report_id: i64,
    template_checklist_item_id: i64,
    original_severity: String,
    decision: String,
    new_severity: Option<String>,
    reviewer: Option<String>,
    review_method: Option<String>,
    notes: Option<String>,
    created_date: String,
    updated_date: String,
}

#[tauri::command]
fn get_mri_fault_approvals(report_id: i64) -> Result<Vec<MriFaultApproval>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, report_id, template_checklist_item_id, original_severity, decision, new_severity, reviewer, review_method, notes, created_date, updated_date
         FROM mri_fault_approvals WHERE report_id = ?1"
    ).map_err(|e| e.to_string())?;
    let approvals = stmt
        .query_map([report_id], |row| {
            Ok(MriFaultApproval {
                id: row.get(0)?,
                report_id: row.get(1)?,
                template_checklist_item_id: row.get(2)?,
                original_severity: row.get(3)?,
                decision: row.get(4)?,
                new_severity: row.get(5)?,
                reviewer: row.get(6)?,
                review_method: row.get(7)?,
                notes: row.get(8)?,
                created_date: row.get(9)?,
                updated_date: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(approvals)
}

#[tauri::command]
fn ensure_mri_fault_approval(
    report_id: i64,
    template_checklist_item_id: i64,
    original_severity: String,
) -> Result<String, String> {
    let conn = get_connection()?;
    let sev = original_severity.trim();
    if !matches!(sev, "Moderate" | "Critical") {
        // Minor faults don't require approval — nothing to create.
        return Ok("No approval required for this severity".to_string());
    }
    let now = chrono_now();

    let existing_decision: Option<String> = conn
        .query_row(
            "SELECT decision FROM mri_fault_approvals WHERE report_id = ?1 AND template_checklist_item_id = ?2",
            rusqlite::params![report_id, template_checklist_item_id],
            |row| row.get(0),
        )
        .ok();

    match existing_decision {
        None => {
            conn.execute(
                "INSERT INTO mri_fault_approvals (report_id, template_checklist_item_id, original_severity, decision, created_date, updated_date)
                 VALUES (?1, ?2, ?3, 'Pending', ?4, ?4)",
                rusqlite::params![report_id, template_checklist_item_id, sev, now],
            ).map_err(|e| e.to_string())?;
        }
        Some(decision) if decision == "Pending" => {
            // Still awaiting review — keep the recorded original_severity in sync with
            // whatever severity is currently set on the checklist result.
            conn.execute(
                "UPDATE mri_fault_approvals SET original_severity = ?1, updated_date = ?2 WHERE report_id = ?3 AND template_checklist_item_id = ?4",
                rusqlite::params![sev, now, report_id, template_checklist_item_id],
            ).map_err(|e| e.to_string())?;
        }
        _ => {
            // Already reviewed (Approved/Reclassified/Rejected) — leave the historical record alone.
        }
    }
    Ok("Fault approval ensured".to_string())
}

// The Job Supervisor's endorsement of a Submitted report. This is the ONE action that
// closes a Minor-only report AND escalates any Moderate/Critical faults on it -- fault
// approval records are no longer created immediately at data-entry time (see the removed
// call in ChecklistEntryStep's autoSave); they're created here, at endorsement, so nothing
// reaches the higher-level Pending Approvals queue until the Supervisor has reviewed and
// endorsed the report it came from.
#[tauri::command]
fn endorse_mri_report(
    report_id: i64,
    endorsed_by: String,
    assigned_to_user_id: i64,
) -> Result<String, String> {
    let conn = get_connection()?;
    let endorsed_by = endorsed_by.trim();
    if endorsed_by.is_empty() {
        return Err("Endorsed-by name is required".to_string());
    }
    if assigned_to_user_id <= 0 {
        return Err(
            "Select which Maintenance Supervisor/FSM this is being escalated to.".to_string(),
        );
    }

    let status: String = conn
        .query_row(
            "SELECT status FROM mri_reports WHERE id = ?1",
            [report_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if status != "Submitted" {
        return Err(format!(
            "Report must be Submitted before it can be endorsed (current status: {})",
            status
        ));
    }

    let mut stmt = conn
        .prepare(
            "SELECT template_checklist_item_id, severity FROM mri_report_checklist_results
             WHERE report_id = ?1 AND status = 'Fail' AND severity IN ('Moderate', 'Critical') AND repaired_on_site = 0",
        )
        .map_err(|e| e.to_string())?;
    let items: Vec<(i64, String)> = stmt
        .query_map([report_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let now = chrono_now();
    let escalated_count = items.len();
    if escalated_count == 0 {
        return Err(
            "This report has no Moderate/Critical faults to escalate -- use Close & Approve Report instead."
                .to_string(),
        );
    }
    // Table 3 / Figure 1: a Major/Critical fault goes to the FSM / Maintenance Manager,
    // so a report with a Critical fault can only be escalated to someone holding approval
    // authority (never a supervisor who only holds the Moderate review).
    if items.iter().any(|(_, sev)| sev == "Critical")
        && !user_has_permission(&conn, assigned_to_user_id, "mri.approve")
    {
        return Err("This report has a Critical fault: it must be escalated to the FSM / Maintenance Manager.".to_string());
    }
    for (template_checklist_item_id, severity) in &items {
        let existing_decision: Option<String> = conn
            .query_row(
                "SELECT decision FROM mri_fault_approvals WHERE report_id = ?1 AND template_checklist_item_id = ?2",
                rusqlite::params![report_id, template_checklist_item_id],
                |row| row.get(0),
            )
            .ok();
        match existing_decision {
            None => {
                conn.execute(
                    "INSERT INTO mri_fault_approvals (report_id, template_checklist_item_id, original_severity, decision, assigned_to_user_id, created_date, updated_date)
                     VALUES (?1, ?2, ?3, 'Pending', ?4, ?5, ?5)",
                    rusqlite::params![report_id, template_checklist_item_id, severity, assigned_to_user_id, now],
                ).map_err(|e| e.to_string())?;
            }
            Some(decision) if decision == "Pending" => {
                conn.execute(
                    "UPDATE mri_fault_approvals SET original_severity = ?1, assigned_to_user_id = ?2, updated_date = ?3 WHERE report_id = ?4 AND template_checklist_item_id = ?5",
                    rusqlite::params![severity, assigned_to_user_id, now, report_id, template_checklist_item_id],
                ).map_err(|e| e.to_string())?;
            }
            _ => {}
        }
    }

    // Endorsing never closes the report by itself -- it only records the Supervisor's
    // review. A Moderate/Critical report moves to Escalated and stays open until every
    // escalated fault is resolved; a Minor-only (or no-issue) report moves to Endorsed
    // and still needs an explicit Close Report action (see close_mri_report).
    let new_status = if escalated_count > 0 { "Escalated" } else { "Endorsed" };
    conn.execute(
        "UPDATE mri_reports SET status = ?1, approved_by = ?2, approved_date = ?3 WHERE id = ?4",
        rusqlite::params![new_status, endorsed_by, now, report_id],
    )
    .map_err(|e| e.to_string())?;

    if escalated_count > 0 {
        Ok(format!(
            "Report endorsed — {} fault(s) escalated for review. The report stays open until every escalated fault is resolved and someone closes it.",
            escalated_count
        ))
    } else {
        Ok("Report endorsed — no faults required escalation. It still needs to be explicitly closed.".to_string())
    }
}

// When an MR-I report closes, copy its "Distance Travelled Post-Job (KM)" mid-field
// value (if the template includes that field and it was filled in) into the asset's
// KM maintenance triggers, so the running distance shown on the asset-select screen
// stays current. Both the MR-II and MR-III KM triggers are updated -- it's the same
// physical odometer reading regardless of maintenance level. This never blocks report
// closure: any missing field, unfilled value, or unparsable number is silently skipped.
// Looks up one mid-field's value on a report by its catalog label. Returns None if the
// template doesn't include that field, or the field was never filled in (row missing, or
// present but null/blank) -- callers use this to fall through to another field.
fn get_mid_field_value(conn: &Connection, report_id: i64, label: &str) -> Option<String> {
    let result: Result<Option<String>, rusqlite::Error> = conn.query_row(
        "SELECT v.value
         FROM mri_reports r
         JOIN template_mid_fields tmf ON tmf.template_id = r.template_id
         JOIN mid_field_catalog mfc ON mfc.id = tmf.mid_field_id
         JOIN mri_report_mid_values v ON v.report_id = r.id AND v.template_mid_field_id = tmf.id
         WHERE r.id = ?1 AND mfc.label = ?2",
        rusqlite::params![report_id, label],
        |row| row.get(0),
    );
    match result {
        Ok(Some(v)) if !v.trim().is_empty() => Some(v),
        _ => None,
    }
}

// Same lookup as get_mid_field_value, but for a HEADER field (e.g. "Job Operating Hours",
// "Engine Hours (This Report)") instead of a mid field.
fn get_header_field_value(conn: &Connection, report_id: i64, label: &str) -> Option<String> {
    let result: Result<Option<String>, rusqlite::Error> = conn.query_row(
        "SELECT v.value
         FROM mri_reports r
         JOIN template_header_fields thf ON thf.template_id = r.template_id
         JOIN header_field_catalog hfc ON hfc.id = thf.header_field_id
         JOIN mri_report_header_values v ON v.report_id = r.id AND v.template_header_field_id = thf.id
         WHERE r.id = ?1 AND hfc.label = ?2",
        rusqlite::params![report_id, label],
        |row| row.get(0),
    );
    match result {
        Ok(Some(v)) if !v.trim().is_empty() => Some(v),
        _ => None,
    }
}

// Parses a raw stored field value into a finite f64 reading, or None if missing/unparsable --
// used to feed the MR-I history trend chart without blocking on bad/blank data.
fn parse_numeric_reading(raw: Option<String>) -> Option<f64> {
    raw.and_then(|v| v.trim().parse::<f64>().ok()).filter(|n| n.is_finite())
}

// Case-insensitive header-field lookup used only for "Compliance Stage" -- the frontend
// (ReportWizard) matches this field by trimmed/lowercased label rather than an exact string,
// since its catalog casing isn't guaranteed, so this mirrors that instead of reusing the
// exact-match get_header_field_value.
fn get_compliance_stage(conn: &Connection, report_id: i64) -> Option<String> {
    let result: Result<Option<String>, rusqlite::Error> = conn.query_row(
        "SELECT v.value
         FROM mri_reports r
         JOIN template_header_fields thf ON thf.template_id = r.template_id
         JOIN header_field_catalog hfc ON hfc.id = thf.header_field_id
         JOIN mri_report_header_values v ON v.report_id = r.id AND v.template_header_field_id = thf.id
         WHERE r.id = ?1 AND LOWER(TRIM(hfc.label)) = 'compliance stage'",
        [report_id],
        |row| row.get(0),
    );
    match result {
        Ok(Some(v)) if !v.trim().is_empty() => Some(v),
        _ => None,
    }
}

// The human-readable checklist item descriptions for every FAILED item on one report --
// same join used by get_open_prior_issues, but scoped to a single report rather than every
// still-open issue across an asset's history. Returns an empty list (never an error) on any
// lookup problem, since this only feeds a "key issues" readout on the MR-I history timeline.
fn get_key_issues_for_report(conn: &Connection, report_id: i64) -> Vec<String> {
    let mut stmt = match conn.prepare(
        "SELECT cd.description
         FROM mri_report_checklist_results r
         JOIN template_checklist_items tci ON r.template_checklist_item_id = tci.id
         LEFT JOIN checklist_databank cd ON tci.checklist_item_id = cd.id
         WHERE r.report_id = ?1 AND r.status = 'Fail'
         ORDER BY r.severity DESC",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let result = stmt.query_map([report_id], |row| row.get::<_, Option<String>>(0));
    match result {
        Ok(iter) => iter.filter_map(|r| r.ok().flatten()).collect(),
        Err(_) => Vec::new(),
    }
}

fn sync_km_trigger_from_report(conn: &Connection, report_id: i64) {
    let asset_id: Option<i64> = conn
        .query_row(
            "SELECT asset_id FROM mri_reports WHERE id = ?1",
            [report_id],
            |row| row.get(0),
        )
        .ok();
    let Some(asset_id) = asset_id else { return };

    // Prefer Post-Job (the final odometer reading for the job); fall back to Pre-Job so a
    // dedicated Pre-Job-only report (no Post-Job leg recorded yet) still updates the
    // trigger instead of silently doing nothing.
    let raw_value = get_mid_field_value(conn, report_id, "Distance Travelled Post-Job (KM)")
        .or_else(|| get_mid_field_value(conn, report_id, "Distance Travelled Pre-Job (KM)"));
    let Some(raw_value) = raw_value else { return };

    let km: i64 = match raw_value.trim().parse::<f64>() {
        Ok(n) if n.is_finite() => n.round() as i64,
        _ => return,
    };

    // Cumulative since the last MR-II/MR-III service (or since Reset Running Totals),
    // per the Manual's trigger model (e.g. "250 operating hours") -- each newly approved
    // report ADDS its own leg's distance rather than replacing the running total. A bare
    // SET here was the bug: it made running_value snap to whichever single report was
    // most recently approved instead of accumulating, so totals never added up correctly.
    // Gated on enabled=1 so a disabled trigger's running_value never silently drifts.
    let _ = conn.execute(
        "UPDATE maintenance_triggers SET running_value = running_value + ?1 WHERE asset_id = ?2 AND trigger_type = 'KM' AND enabled = 1",
        rusqlite::params![km, asset_id],
    );
}

// Same idea as sync_km_trigger_from_report, but for triggers sourced from a HEADER field
// (Operating Hours, Engine Hours) instead of a mid field -- Job Operating Hours -> the OH
// trigger, Engine Hours (This Report) -> the EH trigger. Also updates both MR-II and
// MR-III trigger rows for the asset, and is likewise non-blocking on any lookup/parse miss.
fn sync_header_trigger_from_report(conn: &Connection, report_id: i64, header_label: &str, trigger_type: &str) {
    let row: Result<(i64, String), rusqlite::Error> = conn.query_row(
        "SELECT r.asset_id, v.value
         FROM mri_reports r
         JOIN template_header_fields thf ON thf.template_id = r.template_id
         JOIN header_field_catalog hfc ON hfc.id = thf.header_field_id
         JOIN mri_report_header_values v ON v.report_id = r.id AND v.template_header_field_id = thf.id
         WHERE r.id = ?1 AND hfc.label = ?2",
        rusqlite::params![report_id, header_label],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );

    let (asset_id, raw_value) = match row {
        Ok(v) => v,
        Err(_) => return,
    };

    let reading: i64 = match raw_value.trim().parse::<f64>() {
        Ok(n) if n.is_finite() => n.round() as i64,
        _ => return,
    };

    // Same accumulate-not-overwrite fix as sync_km_trigger_from_report -- Job Operating
    // Hours and Engine Hours (This Report) are both per-job deltas (the latter is
    // literally computed as Current - Previous in the frontend), so they must ADD to the
    // running cumulative total, not replace it. Gated on enabled=1 for the same reason.
    let _ = conn.execute(
        "UPDATE maintenance_triggers SET running_value = running_value + ?1 WHERE asset_id = ?2 AND trigger_type = ?3 AND enabled = 1",
        rusqlite::params![reading, asset_id, trigger_type],
    );
}

// RIF (Running-in-foot) has no frontend-computed "delta" field the way Engine Hours does --
// the catalog only has plain "Previous RIF" / "Current RIF" header fields (see
// ReportWizard.tsx: zero RIF-specific logic exists there). So this reads both header values
// for the report directly and computes the delta itself before accumulating, mirroring the
// same accumulate-not-overwrite, enabled=1-gated pattern as the KM/OH/EH syncs above. A
// non-finite or non-positive delta (missing field, bad data, or a report where RIF didn't
// change) is skipped rather than corrupting the running total.
fn sync_rif_trigger_from_report(conn: &Connection, report_id: i64) {
    let get_header_value = |label: &str| -> Option<(i64, String)> {
        conn.query_row(
            "SELECT r.asset_id, v.value
             FROM mri_reports r
             JOIN template_header_fields thf ON thf.template_id = r.template_id
             JOIN header_field_catalog hfc ON hfc.id = thf.header_field_id
             JOIN mri_report_header_values v ON v.report_id = r.id AND v.template_header_field_id = thf.id
             WHERE r.id = ?1 AND hfc.label = ?2",
            rusqlite::params![report_id, label],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok()
    };

    let Some((asset_id, current_raw)) = get_header_value("Current RIF") else { return };
    let Some((_, previous_raw)) = get_header_value("Previous RIF") else { return };

    let current: f64 = match current_raw.trim().parse() {
        Ok(n) => n,
        _ => return,
    };
    let previous: f64 = match previous_raw.trim().parse() {
        Ok(n) => n,
        _ => return,
    };

    let delta = current - previous;
    if !delta.is_finite() || delta <= 0.0 {
        return;
    }
    let rif: i64 = delta.round() as i64;

    let _ = conn.execute(
        "UPDATE maintenance_triggers SET running_value = running_value + ?1 WHERE asset_id = ?2 AND trigger_type = 'RIF' AND enabled = 1",
        rusqlite::params![rif, asset_id],
    );
}

// CA (Calendar days) is structurally different from every other trigger type -- it accrues
// from elapsed real time, not from a report's data, so it isn't synced at report-approval
// time at all. Instead this recomputes running_value as whole days elapsed since
// last_reset_date, using SQLite's julianday() directly in the UPDATE so the "now" and the
// write happen atomically. Rows with last_reset_date IS NULL (shouldn't normally happen
// post-migration/seed, but defensively) are left alone rather than producing garbage.
// Gated on enabled=1 for the same reason as the other trigger syncs. Call this whenever CA
// freshness matters -- currently: every get_asset_triggers read.
fn sync_ca_triggers(conn: &Connection, asset_id: i64) {
    let _ = conn.execute(
        "UPDATE maintenance_triggers
         SET running_value = CAST(julianday('now') - julianday(last_reset_date) AS INTEGER)
         WHERE asset_id = ?1 AND trigger_type = 'CA' AND enabled = 1 AND last_reset_date IS NOT NULL",
        [asset_id],
    );
}

// KM/OH/EH/RIF running_value is now a cumulative SUM across every Approved report (see
// sync_km_trigger_from_report / sync_header_trigger_from_report / sync_rif_trigger_from_report
// above), not a snapshot of the latest one -- so after a report is deleted, the only correct
// way to keep the total right is to reset it to zero and replay every remaining Approved
// report for the asset, oldest first, through the same sync_* functions used at approval
// time. Re-syncing only the latest remaining report (the old approach) would silently drop
// every earlier report's contribution.
fn recompute_triggers_after_delete(conn: &Connection, asset_id: i64) {
    let _ = conn.execute(
        "UPDATE maintenance_triggers SET running_value = 0 WHERE asset_id = ?1 AND trigger_type IN ('KM', 'OH', 'EH', 'RIF')",
        [asset_id],
    );

    let mut stmt = match conn.prepare(
        "SELECT id FROM mri_reports WHERE asset_id = ?1 AND status = 'Approved' ORDER BY id ASC",
    ) {
        Ok(s) => s,
        Err(_) => return,
    };
    let ids: Vec<i64> = match stmt.query_map([asset_id], |row| row.get(0)) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(_) => return,
    };

    for id in ids {
        sync_km_trigger_from_report(conn, id);
        sync_header_trigger_from_report(conn, id, "Job Operating Hours", "OH");
        sync_header_trigger_from_report(conn, id, "Engine Hours (This Report)", "EH");
        sync_rif_trigger_from_report(conn, id);
    }
}

// Admin-only deletion of the MOST RECENT MR-I report for an asset, from the Dashboard's
// Asset MR-I History screen. Deliberately distinct from the older, unused delete_mri_report
// (which only deletes the mri_reports row and would orphan child data -- the exact bug the
// purge_mri_reports cleanup above exists to mop up). This mirrors purge_mri_reports' full
// cascading delete for a single report, then recomputes triggers so an Approved report's
// KM/OH/EH contribution is correctly reverted. Restricted server-side to the latest report
// for the asset (mirroring the UI, which only ever shows the button on that entry) so
// deleting an arbitrary historical report -- which would leave a gap in the middle of the
// timeline -- is never possible even if the frontend check were bypassed.
#[tauri::command]
fn delete_last_mri_report(report_id: i64) -> Result<String, String> {
    let conn = get_connection()?;

    let asset_id: i64 = conn
        .query_row(
            "SELECT asset_id FROM mri_reports WHERE id = ?1",
            [report_id],
            |row| row.get(0),
        )
        .map_err(|_| "Report not found".to_string())?;

    let latest_id: i64 = conn
        .query_row(
            "SELECT MAX(id) FROM mri_reports WHERE asset_id = ?1",
            [asset_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if latest_id != report_id {
        return Err("Only the most recent report for this asset can be deleted.".to_string());
    }

    conn.execute(
        "UPDATE mri_fault_approvals SET carried_to_report_id = NULL WHERE carried_to_report_id = ?1",
        [report_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM mri_fault_rectifications WHERE fault_approval_id IN (SELECT id FROM mri_fault_approvals WHERE report_id = ?1)",
        [report_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM mri_fault_approvals WHERE report_id = ?1", [report_id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM mri_report_header_values WHERE report_id = ?1",
        [report_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM mri_report_checklist_results WHERE report_id = ?1",
        [report_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM mri_checklist_action_log WHERE report_id = ?1",
        [report_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM mri_report_mid_values WHERE report_id = ?1",
        [report_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM mri_report_footer_values WHERE report_id = ?1",
        [report_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM mri_report_attachments WHERE report_id = ?1",
        [report_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM mri_reports WHERE id = ?1", [report_id])
        .map_err(|e| e.to_string())?;

    recompute_triggers_after_delete(&conn, asset_id);

    Ok("Report deleted".to_string())
}

// One-click path for a Submitted report with no Moderate/Critical faults: the Supervisor
// reviews it (and may unlock/close any pending Minor checklist items in the UI first),
// then this closes and approves it directly -- no separate Endorsed status needed. If the
// report actually has escalatable faults, this errors and tells the caller to use Endorse
// Report instead, since escalation must go through the Pending Approvals workflow.
#[tauri::command]
fn review_and_close_mri_report(report_id: i64, closed_by: String) -> Result<String, String> {
    let conn = get_connection()?;
    let closed_by = closed_by.trim();
    if closed_by.is_empty() {
        return Err("Closed-by name is required".to_string());
    }

    let status: String = conn
        .query_row(
            "SELECT status FROM mri_reports WHERE id = ?1",
            [report_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if status != "Submitted" {
        return Err(format!(
            "Report must be Submitted before it can be reviewed and closed (current status: {})",
            status
        ));
    }

    let escalation_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM mri_report_checklist_results WHERE report_id = ?1 AND status = 'Fail' AND severity IN ('Moderate', 'Critical') AND repaired_on_site = 0",
            [report_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if escalation_count > 0 {
        return Err(format!(
            "This report has {} Moderate/Critical fault(s) -- use Endorse Report to escalate them instead.",
            escalation_count
        ));
    }

    let now = chrono_now();
    conn.execute(
        "UPDATE mri_reports SET status = 'Approved', approved_by = ?1, approved_date = ?2 WHERE id = ?3",
        rusqlite::params![closed_by, now, report_id],
    )
    .map_err(|e| e.to_string())?;
    sync_km_trigger_from_report(&conn, report_id);
    sync_header_trigger_from_report(&conn, report_id, "Job Operating Hours", "OH");
    sync_header_trigger_from_report(&conn, report_id, "Engine Hours (This Report)", "EH");
    sync_rif_trigger_from_report(&conn, report_id);
    Ok("Report reviewed and closed".to_string())
}

// Explicit closure step — deliberately separate from endorse_mri_report so nothing
// closes automatically. Valid from 'Endorsed' (Minor-only, already reviewed) directly,
// or from 'Escalated' once every fault on the report has been reviewed (decision no
// longer 'Pending') and any phoned-in decision has been confirmed. Manual Figure 1: when a
// Major/Critical fault stays Critical "the report shall be closed and the equipment shall be
// Red-Tagged" -- so the report does NOT wait for the repair; the unit stays Red and the
// repair continues in the Rectification Queue until it is verified.
#[tauri::command]
fn close_mri_report(report_id: i64, closed_by: String) -> Result<String, String> {
    let conn = get_connection()?;
    let closed_by = closed_by.trim();
    if closed_by.is_empty() {
        return Err("Closed-by name is required".to_string());
    }

    let status: String = conn
        .query_row(
            "SELECT status FROM mri_reports WHERE id = ?1",
            [report_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if status == "Escalated" {
        let still_open: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM mri_fault_approvals fa
                 WHERE fa.report_id = ?1
                   AND (fa.decision = 'Pending' OR fa.provisional_status = 'Provisional')",
                [report_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if still_open > 0 {
            return Err(format!(
                "{} escalated fault(s) on this report are still awaiting a review decision or confirmation — a phoned-in decision must be confirmed by the real authority before the report can be closed.",
                still_open
            ));
        }
    } else if status != "Endorsed" {
        return Err(format!(
            "Report must be Endorsed, or Escalated with everything resolved, before it can be closed (current status: {})",
            status
        ));
    }

    // Table 3: the FSM / Maintenance Manager "shall be informed" of every Moderate
    // decision. The notice is raised when the decision is saved (it appears in the named
    // person's acknowledgment queue); closing the report does not wait for it, so an
    // unavailable manager can never hold a report open.

    let now = chrono_now();
    conn.execute(
        "UPDATE mri_reports SET status = 'Approved', approved_by = ?1, approved_date = ?2 WHERE id = ?3",
        rusqlite::params![closed_by, now, report_id],
    )
    .map_err(|e| e.to_string())?;
    sync_km_trigger_from_report(&conn, report_id);
    sync_header_trigger_from_report(&conn, report_id, "Job Operating Hours", "OH");
    sync_header_trigger_from_report(&conn, report_id, "Engine Hours (This Report)", "EH");
    sync_rif_trigger_from_report(&conn, report_id);

    Ok("Report closed".to_string())
}

// None = unrestricted (Administrator, or the user has zero country rows assigned).
// Some(list) = restricted to exactly those countries.
fn user_country_restriction(conn: &Connection, user_id: i64) -> Result<Option<Vec<String>>, String> {
    let role: String = conn
        .query_row("SELECT role FROM app_users WHERE id = ?1", [user_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if role == "Administrator" {
        return Ok(None);
    }
    let mut stmt = conn
        .prepare("SELECT country FROM user_country_access WHERE user_id = ?1")
        .map_err(|e| e.to_string())?;
    let countries: Vec<String> = stmt
        .query_map([user_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if countries.is_empty() {
        Ok(None)
    } else {
        Ok(Some(countries))
    }
}

#[derive(Serialize, Deserialize)]
struct ReportNeedingActionRow {
    id: i64,
    status: String,
    asset_code: Option<String>,
    asset_description: Option<String>,
    submitted_by: Option<String>,
    submitted_date: Option<String>,
    issue_count: i64,
}

// Everything currently needing a Supervisor's attention: Submitted (awaiting endorsement),
// Endorsed (Minor-only, reviewed but not yet closed), and Escalated reports whose faults
// have all been resolved (ready to close). Still-open Escalated reports are deliberately
// excluded -- they're tracked in the Pending Approvals / Rectification queues instead.
#[tauri::command]
fn get_reports_needing_supervisor_action(viewer_user_id: i64) -> Result<Vec<ReportNeedingActionRow>, String> {
    let conn = get_connection()?;
    let restriction = user_country_restriction(&conn, viewer_user_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT r.id, r.status, a.asset_code, a.asset_description, r.submitted_by, r.submitted_date,
                    (SELECT COUNT(*) FROM mri_report_checklist_results WHERE report_id = r.id AND status = 'Fail') AS issue_count,
                    a.country
             FROM mri_reports r
             JOIN assets a ON a.id = r.asset_id
             WHERE r.status = 'Submitted'
                OR r.status = 'Endorsed'
                OR (r.status = 'Escalated' AND NOT EXISTS (
                    SELECT 1 FROM mri_fault_approvals fa
                    WHERE fa.report_id = r.id
                      AND fa.decision = 'Pending'
                ))
             ORDER BY r.submitted_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<ReportNeedingActionRow> = stmt
        .query_map([], |row| {
            let country: Option<String> = row.get(7)?;
            Ok((
                ReportNeedingActionRow {
                    id: row.get(0)?,
                    status: row.get(1)?,
                    asset_code: row.get(2)?,
                    asset_description: row.get(3)?,
                    submitted_by: row.get(4)?,
                    submitted_date: row.get(5)?,
                    issue_count: row.get(6)?,
                },
                country,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|(_, country)| match &restriction {
            None => true,
            Some(allowed) => country.as_deref().map_or(false, |c| allowed.iter().any(|a| a == c)),
        })
        .map(|(row, _)| row)
        .collect();
    Ok(rows)
}

// An Operator's (or anyone's) own submitted reports that aren't finished yet -- lets them
// track "did my report get reviewed/escalated/closed" without needing any review permission
// themselves. No country filtering here: whatever they were able to submit is already
// theirs to see the status of. Deliberately excludes Draft: a report that hasn't been
// submitted yet hasn't been handed to anyone, so it isn't "open" in the sense this tracks
// and must not trip the Attention Required badge.
#[tauri::command]
fn get_my_open_mri_reports(submitted_by: String) -> Result<Vec<ReportNeedingActionRow>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT r.id, r.status, a.asset_code, a.asset_description, r.submitted_by, r.submitted_date,
                    (SELECT COUNT(*) FROM mri_report_checklist_results WHERE report_id = r.id AND status = 'Fail') AS issue_count
             FROM mri_reports r
             JOIN assets a ON a.id = r.asset_id
             WHERE r.submitted_by = ?1 AND r.status NOT IN ('Approved', 'Draft')
             ORDER BY r.submitted_date DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<ReportNeedingActionRow> = stmt
        .query_map([submitted_by], |row| {
            Ok(ReportNeedingActionRow {
                id: row.get(0)?,
                status: row.get(1)?,
                asset_code: row.get(2)?,
                asset_description: row.get(3)?,
                submitted_by: row.get(4)?,
                submitted_date: row.get(5)?,
                issue_count: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(Serialize, Deserialize)]
struct PendingFaultApprovalRow {
    id: i64,
    report_id: i64,
    template_checklist_item_id: i64,
    original_severity: String,
    created_date: String,
    asset_code: Option<String>,
    checklist_description: Option<String>,
    issue_details: Option<String>,
    action_taken: Option<String>,
    country: Option<String>,
    // Named reviewer for this stage (None = open to everyone holding the role).
    assigned_to_user_id: Option<i64>,
    assigned_to_name: Option<String>,
    // True when the viewer may record a decision on this fault; false = read-only view.
    can_act: bool,
    last_reminder_by: Option<String>,
    last_reminder_at: Option<String>,
}

// Role permissions plus per-user overrides, for use where a connection is already held.
fn user_has_permission(conn: &rusqlite::Connection, user_id: i64, code: &str) -> bool {
    let role: Option<String> = conn
        .query_row("SELECT role FROM app_users WHERE id = ?1", [user_id], |row| row.get(0))
        .ok();
    let Some(role) = role else { return false };
    let override_granted: Option<bool> = conn
        .query_row(
            "SELECT granted FROM user_permission_overrides WHERE user_id = ?1 AND permission_code = ?2",
            rusqlite::params![user_id, code],
            |row| Ok(row.get::<_, i32>(0)? != 0),
        )
        .ok();
    if let Some(g) = override_granted {
        return g;
    }
    conn.query_row(
        "SELECT 1 FROM role_permissions WHERE role = ?1 AND permission_code = ?2",
        rusqlite::params![role, code],
        |_| Ok(true),
    )
    .unwrap_or(false)
}

// Append-only audit trail of every reviewer action on a fault (Manual 8.2: records keep
// the user name and timestamp).
fn log_fault_decision(
    conn: &rusqlite::Connection,
    fault_approval_id: i64,
    report_id: i64,
    action: &str,
    from_severity: &str,
    to_severity: Option<&str>,
    reviewer: &str,
    review_method: &str,
    notes: Option<&str>,
    recorded_by: &str,
    is_provisional: bool,
    next_user_id: Option<i64>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO mri_fault_decision_log
            (fault_approval_id, report_id, action, from_severity, to_severity, reviewer, review_method, notes, recorded_by, is_provisional, next_user_id, logged_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            fault_approval_id,
            report_id,
            action,
            from_severity,
            to_severity,
            reviewer,
            review_method,
            notes,
            recorded_by,
            if is_provisional { 1 } else { 0 },
            next_user_id,
            chrono_now()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_pending_mri_fault_approvals(viewer_user_id: i64) -> Result<Vec<PendingFaultApprovalRow>, String> {
    let conn = get_connection()?;
    let restriction = user_country_restriction(&conn, viewer_user_id)?;
    let has_approve = user_has_permission(&conn, viewer_user_id, "mri.approve");
    let has_provisional = user_has_permission(&conn, viewer_user_id, "mri.record_provisional");
    let mut stmt = conn.prepare(
        "SELECT fa.id, fa.report_id, fa.template_checklist_item_id, fa.original_severity, fa.created_date,
                a.asset_code, cd.description, r.issue_details, r.action_taken, a.country,
                fa.assigned_to_user_id, au.name,
                (SELECT rem.sent_by_name FROM mri_fault_reminders rem WHERE rem.fault_approval_id = fa.id ORDER BY rem.id DESC LIMIT 1),
                (SELECT rem.sent_at FROM mri_fault_reminders rem WHERE rem.fault_approval_id = fa.id ORDER BY rem.id DESC LIMIT 1)
         FROM mri_fault_approvals fa
         JOIN mri_reports rep ON fa.report_id = rep.id
         LEFT JOIN assets a ON rep.asset_id = a.id
         LEFT JOIN app_users au ON au.id = fa.assigned_to_user_id
         LEFT JOIN template_checklist_items tci ON fa.template_checklist_item_id = tci.id
         LEFT JOIN checklist_databank cd ON tci.checklist_item_id = cd.id
         LEFT JOIN mri_report_checklist_results r ON r.report_id = fa.report_id AND r.template_checklist_item_id = fa.template_checklist_item_id
         WHERE fa.decision = 'Pending'
         ORDER BY fa.created_date DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let country: Option<String> = row.get(9)?;
            Ok((
                PendingFaultApprovalRow {
                    id: row.get(0)?,
                    report_id: row.get(1)?,
                    template_checklist_item_id: row.get(2)?,
                    original_severity: row.get(3)?,
                    created_date: row.get(4)?,
                    asset_code: row.get(5)?,
                    checklist_description: row.get(6)?,
                    issue_details: row.get(7)?,
                    action_taken: row.get(8)?,
                    country: country.clone(),
                    assigned_to_user_id: row.get(10)?,
                    assigned_to_name: row.get(11)?,
                    can_act: false,
                    last_reminder_by: row.get(12)?,
                    last_reminder_at: row.get(13)?,
                },
                country,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for (mut row, country) in rows {
        let allowed = match &restriction {
            None => true,
            Some(a) => country.as_deref().map_or(false, |c| a.iter().any(|x| x == c)),
        };
        if !allowed {
            continue;
        }
        let unassigned = row.assigned_to_user_id.is_none();
        let mine = row.assigned_to_user_id == Some(viewer_user_id);
        // Managers/administrators (mri.approve) and the phone-relay recorder see every
        // fault; everyone else only sees open faults and the ones named to them.
        if !(has_approve || has_provisional || unassigned || mine) {
            continue;
        }
        row.can_act = unassigned || mine || (has_provisional && !has_approve);
        out.push(row);
    }
    Ok(out)
}

// A manager or administrator nudges the named reviewer about a fault still waiting.
#[tauri::command]
fn send_fault_reminder(approval_id: i64, sent_by_user_id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    if !user_has_permission(&conn, sent_by_user_id, "mri.approve") {
        return Err("Only a manager or administrator can send a reminder".to_string());
    }
    let sender_name: String = conn
        .query_row("SELECT name FROM app_users WHERE id = ?1", [sent_by_user_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let pending: bool = conn
        .query_row(
            "SELECT 1 FROM mri_fault_approvals WHERE id = ?1 AND decision = 'Pending'",
            [approval_id],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if !pending {
        return Err("This fault is no longer pending".to_string());
    }
    conn.execute(
        "INSERT INTO mri_fault_reminders (fault_approval_id, sent_by_user_id, sent_by_name, sent_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![approval_id, sent_by_user_id, sender_name, chrono_now()],
    )
    .map_err(|e| e.to_string())?;
    Ok("Reminder sent".to_string())
}

#[derive(Serialize, Deserialize)]
struct FaultDecisionLogRow {
    id: i64,
    fault_approval_id: i64,
    action: String,
    from_severity: String,
    to_severity: Option<String>,
    reviewer: String,
    review_method: String,
    notes: Option<String>,
    recorded_by: String,
    is_provisional: bool,
    logged_at: String,
}

#[tauri::command]
fn get_mri_fault_decision_log(report_id: i64) -> Result<Vec<FaultDecisionLogRow>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, fault_approval_id, action, from_severity, to_severity, reviewer, review_method, notes, recorded_by, is_provisional, logged_at
             FROM mri_fault_decision_log WHERE report_id = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([report_id], |row| {
            Ok(FaultDecisionLogRow {
                id: row.get(0)?,
                fault_approval_id: row.get(1)?,
                action: row.get(2)?,
                from_severity: row.get(3)?,
                to_severity: row.get(4)?,
                reviewer: row.get(5)?,
                review_method: row.get(6)?,
                notes: row.get(7)?,
                recorded_by: row.get(8)?,
                is_provisional: row.get::<_, i32>(9)? != 0,
                logged_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(Serialize, Deserialize)]
struct CarriedForwardFaultRow {
    id: i64,
    original_report_id: i64,
    checklist_description: Option<String>,
    original_severity: String,
    notes: Option<String>,
    created_date: String,
}

// Faults inherited INTO this report from an earlier cycle on the same asset (see the
// carried_to_report_id link set by create_mri_report). Surfaced as a banner so whoever
// is doing this inspection knows they're picking up an open issue, not starting fresh.
#[tauri::command]
fn get_carried_forward_faults(report_id: i64) -> Result<Vec<CarriedForwardFaultRow>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT fa.id, fa.report_id, cd.description, fa.original_severity, fa.notes, fa.created_date
         FROM mri_fault_approvals fa
         LEFT JOIN template_checklist_items tci ON fa.template_checklist_item_id = tci.id
         LEFT JOIN checklist_databank cd ON tci.checklist_item_id = cd.id
         WHERE fa.carried_to_report_id = ?1
         ORDER BY fa.created_date DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([report_id], |row| {
            Ok(CarriedForwardFaultRow {
                id: row.get(0)?,
                original_report_id: row.get(1)?,
                checklist_description: row.get(2)?,
                original_severity: row.get(3)?,
                notes: row.get(4)?,
                created_date: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(Serialize, Deserialize)]
struct ProvisionalFaultApprovalRow {
    id: i64,
    report_id: i64,
    template_checklist_item_id: i64,
    original_severity: String,
    decision: String,
    new_severity: Option<String>,
    reviewer: Option<String>,
    review_method: Option<String>,
    recorded_by: Option<String>,
    created_date: String,
    asset_code: Option<String>,
    checklist_description: Option<String>,
}

// Cross-report queue of phoned-in decisions still awaiting the real authority's
// confirmation. Deliberately not filtered by fa.decision — a Provisional entry keeps
// that status regardless of what the decision ended up being (Approved/Reclassified/
// Rejected/Carryforward), since confirmation is about the paper trail, not the outcome.
#[tauri::command]
fn get_provisional_mri_fault_approvals(viewer_user_id: i64) -> Result<Vec<ProvisionalFaultApprovalRow>, String> {
    let conn = get_connection()?;
    let restriction = user_country_restriction(&conn, viewer_user_id)?;
    let mut stmt = conn.prepare(
        "SELECT fa.id, fa.report_id, fa.template_checklist_item_id, fa.original_severity, fa.decision, fa.new_severity,
                fa.reviewer, fa.review_method, fa.recorded_by, fa.created_date,
                a.asset_code, cd.description, a.country
         FROM mri_fault_approvals fa
         JOIN mri_reports rep ON fa.report_id = rep.id
         LEFT JOIN assets a ON rep.asset_id = a.id
         LEFT JOIN template_checklist_items tci ON fa.template_checklist_item_id = tci.id
         LEFT JOIN checklist_databank cd ON tci.checklist_item_id = cd.id
         WHERE fa.provisional_status = 'Provisional'
         ORDER BY fa.created_date DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let country: Option<String> = row.get(12)?;
            Ok((
                ProvisionalFaultApprovalRow {
                    id: row.get(0)?,
                    report_id: row.get(1)?,
                    template_checklist_item_id: row.get(2)?,
                    original_severity: row.get(3)?,
                    decision: row.get(4)?,
                    new_severity: row.get(5)?,
                    reviewer: row.get(6)?,
                    review_method: row.get(7)?,
                    recorded_by: row.get(8)?,
                    created_date: row.get(9)?,
                    asset_code: row.get(10)?,
                    checklist_description: row.get(11)?,
                },
                country,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|(_, country): &(ProvisionalFaultApprovalRow, Option<String>)| match &restriction {
            None => true,
            Some(allowed) => country.as_deref().map_or(false, |c| allowed.iter().any(|a| a == c)),
        })
        .map(|(row, _)| row)
        .collect();
    Ok(rows)
}

#[derive(Serialize, Deserialize)]
struct PendingFaultAcknowledgmentRow {
    id: i64,
    report_id: i64,
    template_checklist_item_id: i64,
    original_severity: String,
    decision: String,
    new_severity: Option<String>,
    reviewer: Option<String>,
    review_method: Option<String>,
    notes: Option<String>,
    updated_date: String,
    asset_code: Option<String>,
    checklist_description: Option<String>,
}

// Per the Faults Severity Classification doc's Moderate row: "the respective Maintenance
// Manager or Field Service Manager (FSM) shall be informed" whenever a Moderate fault is
// reviewed. Surfaces every reviewed-but-not-yet-acknowledged Moderate decision. Country-
// scoped like the other review queues. Gated client-side on mri.acknowledge_critical
// (Maintenance Manager/FSM + Administrator).
#[derive(Serialize, Deserialize)]
struct AssignableUserRow {
    id: i64,
    name: String,
    role: String,
}

// Lists active users eligible to be the NAMED recipient of an escalation: holds at least
// one of the given permission codes (role grant or an explicit user override), and --
// unless they're an Administrator or simply unrestricted -- is allowed to see the given
// country. Used to populate the "assign to" / "inform" pickers at every escalation point,
// so the preparer/reviewer always names a real person rather than broadcasting to a role.
#[tauri::command]
fn get_assignable_mri_reviewers(
    permission_codes: Vec<String>,
    country: Option<String>,
) -> Result<Vec<AssignableUserRow>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT id, name, role FROM app_users WHERE active = 1 ORDER BY name")
        .map_err(|e| e.to_string())?;
    let users: Vec<(i64, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut result = Vec::new();
    for (id, name, role) in users {
        // The Administrator is an IT role, not a review authority (Table 4): never listed.
        if role == "Administrator" {
            continue;
        }
        let mut has_perm = false;
        for code in &permission_codes {
            let has_role_perm: bool = conn
                .query_row(
                    "SELECT 1 FROM role_permissions WHERE role = ?1 AND permission_code = ?2",
                    rusqlite::params![role, code],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            let override_granted: Option<bool> = conn
                .query_row(
                    "SELECT granted FROM user_permission_overrides WHERE user_id = ?1 AND permission_code = ?2",
                    rusqlite::params![id, code],
                    |row| Ok(row.get::<_, i32>(0)? != 0),
                )
                .ok();
            let grants_this_code = match override_granted {
                Some(granted) => granted,
                None => has_role_perm,
            };
            if grants_this_code {
                has_perm = true;
                break;
            }
        }
        if !has_perm {
            continue;
        }

        if role != "Administrator" {
            if let Some(ref c) = country {
                if let Some(allowed) = user_country_restriction(&conn, id)? {
                    if !allowed.iter().any(|a| a == c) {
                        continue;
                    }
                }
            }
        }

        result.push(AssignableUserRow { id, name, role });
    }
    Ok(result)
}

#[tauri::command]
fn get_mri_fault_decisions_pending_acknowledgment(viewer_user_id: i64) -> Result<Vec<PendingFaultAcknowledgmentRow>, String> {
    let conn = get_connection()?;
    let restriction = user_country_restriction(&conn, viewer_user_id)?;
    let mut stmt = conn.prepare(
        "SELECT fa.id, fa.report_id, fa.template_checklist_item_id, fa.original_severity, fa.decision, fa.new_severity,
                fa.reviewer, fa.review_method, fa.notes, fa.updated_date,
                a.asset_code, cd.description, a.country
         FROM mri_fault_approvals fa
         JOIN mri_reports rep ON fa.report_id = rep.id
         LEFT JOIN assets a ON rep.asset_id = a.id
         LEFT JOIN template_checklist_items tci ON fa.template_checklist_item_id = tci.id
         LEFT JOIN checklist_databank cd ON tci.checklist_item_id = cd.id
         WHERE fa.original_severity = 'Moderate'
           AND fa.decision IN ('Approved', 'Reclassified', 'Rejected')
           AND fa.acknowledged_by IS NULL
           AND (fa.acknowledgment_assigned_to_user_id IS NULL OR fa.acknowledgment_assigned_to_user_id = ?1)
         ORDER BY fa.updated_date DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([viewer_user_id], |row| {
            let country: Option<String> = row.get(12)?;
            Ok((
                PendingFaultAcknowledgmentRow {
                    id: row.get(0)?,
                    report_id: row.get(1)?,
                    template_checklist_item_id: row.get(2)?,
                    original_severity: row.get(3)?,
                    decision: row.get(4)?,
                    new_severity: row.get(5)?,
                    reviewer: row.get(6)?,
                    review_method: row.get(7)?,
                    notes: row.get(8)?,
                    updated_date: row.get(9)?,
                    asset_code: row.get(10)?,
                    checklist_description: row.get(11)?,
                },
                country,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|(_, country): &(PendingFaultAcknowledgmentRow, Option<String>)| match &restriction {
            None => true,
            Some(allowed) => country.as_deref().map_or(false, |c| allowed.iter().any(|a| a == c)),
        })
        .map(|(row, _)| row)
        .collect();
    Ok(rows)
}

// Marks a reviewed Moderate decision as informed. Deliberately separate from the decision
// itself (set_mri_fault_approval_decision) so "who reviewed it" and "who was informed" are
// always two distinct, independently-timestamped facts, same pattern as confirm_provisional.
#[tauri::command]
fn acknowledge_mri_fault_decision(id: i64, acknowledged_by: String) -> Result<String, String> {
    let conn = get_connection()?;
    let acknowledged_by = acknowledged_by.trim();
    if acknowledged_by.is_empty() {
        return Err("Acknowledged-by name is required".to_string());
    }
    let now = chrono_now();
    let rows_affected = conn.execute(
        "UPDATE mri_fault_approvals SET acknowledged_by = ?1, acknowledged_date = ?2
         WHERE id = ?3 AND original_severity = 'Moderate' AND decision IN ('Approved','Reclassified','Rejected') AND acknowledged_by IS NULL",
        rusqlite::params![acknowledged_by, now, id],
    ).map_err(|e| e.to_string())?;
    if rows_affected == 0 {
        return Err("Entry not found or already acknowledged".to_string());
    }
    Ok("Decision acknowledged".to_string())
}

#[tauri::command]
fn set_mri_fault_approval_decision(
    id: i64,
    decision: String,
    new_severity: Option<String>,
    reviewer: String,
    review_method: String,
    notes: Option<String>,
    recorded_by: String,
    is_provisional: bool,
    next_reviewer_user_id: Option<i64>,
    acknowledgment_assigned_to_user_id: Option<i64>,
) -> Result<String, String> {
    let conn = get_connection()?;
    let decision = decision.trim();
    if !valid_approval_decision(decision) {
        return Err(format!(
            "Invalid decision '{}' — must be Pending, Approved, Reclassified, Rejected, or Carryforward",
            decision
        ));
    }
    let review_method = review_method.trim();
    if !valid_review_method(review_method) {
        return Err(format!(
            "Invalid review method '{}' — must be In-Person or Phone",
            review_method
        ));
    }
    let reviewer = reviewer.trim();
    if reviewer.is_empty() {
        return Err("Reviewer name is required".to_string());
    }
    let recorded_by = recorded_by.trim();
    if recorded_by.is_empty() {
        return Err("Recorded-by name is required".to_string());
    }
    if decision == "Reclassified" {
        match &new_severity {
            Some(sev) if valid_severity(sev) => {}
            _ => return Err("A valid new severity is required when reclassifying".to_string()),
        }
    }

    let (report_id, template_checklist_item_id, original_severity): (i64, i64, String) = conn
        .query_row(
            "SELECT report_id, template_checklist_item_id, original_severity FROM mri_fault_approvals WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    // Figure 4 carries forward Minor/Moderate faults only; a Critical fault is never
    // deferred, and Table 3 only lets the FSM lower it to Moderate (not straight to Minor).
    // Raising a Moderate fault to Critical hands it to Critical review authority.
    if decision == "Reclassified"
        && original_severity == "Moderate"
        && new_severity.as_deref() == Some("Critical")
    {
        if let Some(next) = next_reviewer_user_id {
            if !user_has_permission(&conn, next, "mri.approve") {
                return Err("A fault raised to Critical must be passed to the FSM / Maintenance Manager.".to_string());
            }
        }
    }
    if decision == "Carryforward" && original_severity == "Critical" {
        return Err("A Critical fault cannot be carried forward; approve it (stays Red until repaired) or lower it to Moderate.".to_string());
    }
    if decision == "Reclassified" && original_severity == "Critical" && new_severity.as_deref() == Some("Minor") {
        return Err("A Critical fault can only be lowered to Moderate, not straight to Minor (Table 3).".to_string());
    }

    let now = chrono_now();
    let provisional_status: Option<&str> = if is_provisional {
        Some("Provisional")
    } else {
        None
    };

    // Escalation: a Moderate fault reclassified UP to Critical doesn't close anything — it
    // re-opens this same row as Pending under Critical review authority instead.
    if decision == "Reclassified"
        && original_severity == "Moderate"
        && new_severity.as_deref() == Some("Critical")
    {
        conn.execute(
            "UPDATE mri_fault_approvals SET
                original_severity = 'Critical',
                decision = 'Pending',
                new_severity = NULL,
                reviewer = ?1,
                review_method = ?2,
                notes = ?3,
                recorded_by = ?4,
                provisional_status = ?5,
                confirmed_by = NULL,
                confirmed_date = NULL,
                updated_date = ?6
             WHERE id = ?7",
            rusqlite::params![
                reviewer,
                review_method,
                notes,
                recorded_by,
                provisional_status,
                now,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        // The Critical stage goes to the named next reviewer (or back to anyone holding the
        // role when none is named).
        conn.execute(
            "UPDATE mri_fault_approvals SET assigned_to_user_id = ?1 WHERE id = ?2",
            rusqlite::params![next_reviewer_user_id, id],
        )
        .map_err(|e| e.to_string())?;
        log_fault_decision(
            &conn, id, report_id, "Escalated", &original_severity, Some("Critical"),
            reviewer, review_method, notes.as_deref(), &recorded_by, is_provisional, next_reviewer_user_id,
        )?;
        // Table 3: a Critical fault means use stops and the unit is Red-Tagged, so the unit
        // turns Red as soon as the reviewer raises the fault to Critical.
        refresh_asset_tag_for_report(&conn, report_id, &recorded_by)?;
        return Ok("Fault escalated to Critical review".to_string());
    }

    if decision == "Carryforward" {
        conn.execute(
            "UPDATE mri_fault_approvals SET
                decision = 'Carryforward',
                reviewer = ?1,
                review_method = ?2,
                notes = ?3,
                recorded_by = ?4,
                provisional_status = ?5,
                updated_date = ?6
             WHERE id = ?7",
            rusqlite::params![
                reviewer,
                review_method,
                notes,
                recorded_by,
                provisional_status,
                now,
                id
            ],
        )
        .map_err(|e| e.to_string())?;

        // Per the severity doc, a Critical fault requires the equipment to immediately
        // stop use and be Red-Tagged regardless of outcome. Carryforward defers the
        // review to the next cycle but must not leave a Critical fault untagged in the
        // meantime, so it still enters the rectification loop and Red-Tags the asset,
        // the same as a reviewed decision that stays Critical.
        if original_severity == "Critical" {
            conn.execute(
                "INSERT INTO mri_fault_rectifications (fault_approval_id, parts_status, tag_status, created_date, updated_date)
                 VALUES (?1, 'Awaiting', 'Red', ?2, ?2)
                 ON CONFLICT(fault_approval_id) DO NOTHING",
                rusqlite::params![id, now],
            )
            .map_err(|e| e.to_string())?;

            let asset_id: Option<i64> = conn
                .query_row("SELECT asset_id FROM mri_reports WHERE id = ?1", [report_id], |row| row.get(0))
                .ok()
                .flatten();
            if let Some(asset_id) = asset_id {
                set_asset_tag(
                    &conn,
                    asset_id,
                    "Red",
                    &format!("Critical fault carried forward (report #{})", report_id),
                    Some(report_id),
                    &recorded_by,
                )?;
            }
        }

        log_fault_decision(
            &conn, id, report_id, "Carryforward", &original_severity, None,
            reviewer, review_method, notes.as_deref(), &recorded_by, is_provisional, None,
        )?;
        return Ok("Fault carried forward to next cycle".to_string());
    }

    // Terminal decisions: Approved, Reclassified (down or same), Rejected.
    // Rejected means the fault wasn't real, so it always resolves Green regardless of
    // the originally reported severity.
    let final_severity: String = if decision == "Rejected" {
        "Minor".to_string()
    } else {
        new_severity.clone().unwrap_or(original_severity.clone())
    };
    let stays_critical = final_severity == "Critical";

    conn.execute(
        "UPDATE mri_fault_approvals SET
            decision = ?1,
            new_severity = ?2,
            reviewer = ?3,
            review_method = ?4,
            notes = ?5,
            recorded_by = ?6,
            provisional_status = ?7,
            updated_date = ?8
         WHERE id = ?9",
        rusqlite::params![
            decision,
            new_severity,
            reviewer,
            review_method,
            notes,
            recorded_by,
            provisional_status,
            now,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    // Close the checklist item — every reviewed outcome closes it, Green or Red.
    conn.execute(
        "UPDATE mri_report_checklist_results SET closure_status = 'Closed' WHERE report_id = ?1 AND template_checklist_item_id = ?2",
        rusqlite::params![report_id, template_checklist_item_id],
    )
    .map_err(|e| e.to_string())?;

    // Reflect the tag on the report's "Green Tagged" footer checkbox, when the template
    // includes that field (best-effort — a template without it just skips silently).
    let green_tagged_field: Option<i64> = conn
        .query_row(
            "SELECT tff.id FROM template_footer_fields tff
             JOIN footer_field_catalog ffc ON tff.footer_field_id = ffc.id
             JOIN mri_reports r ON r.template_id = tff.template_id
             WHERE r.id = ?1 AND ffc.label = 'Green Tagged'",
            [report_id],
            |row| row.get(0),
        )
        .ok();
    if let Some(field_id) = green_tagged_field {
        let value = if stays_critical { "false" } else { "true" };
        conn.execute(
            "INSERT INTO mri_report_footer_values (report_id, template_footer_field_id, value)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(report_id, template_footer_field_id) DO UPDATE SET value = excluded.value",
            rusqlite::params![report_id, field_id, value],
        )
        .map_err(|e| e.to_string())?;
    }

    // A fault that stays Critical routes into the rectification loop — Red-Tagged until
    // repaired and verified (Diagram A).
    if stays_critical {
        conn.execute(
            "INSERT INTO mri_fault_rectifications (fault_approval_id, parts_status, tag_status, created_date, updated_date)
             VALUES (?1, 'Awaiting', 'Red', ?2, ?2)
             ON CONFLICT(fault_approval_id) DO NOTHING",
            rusqlite::params![id, now],
        )
        .map_err(|e| e.to_string())?;
    }

    // Table 3 / Figure 1: a fault that ends Moderate is closed and the unit is Green, but the
    // Operations Coordinator / Maintenance Supervisor still plans the rectification and
    // monitors the condition until it is repaired. That follow-up is a rectification row
    // with tag_status 'Planned'. It never touches the unit tag (only 'Red' rows do) and never
    // blocks report closure.
    if final_severity == "Moderate" {
        conn.execute(
            "INSERT INTO mri_fault_rectifications (fault_approval_id, parts_status, tag_status, created_date, updated_date)
             VALUES (?1, 'Awaiting', 'Planned', ?2, ?2)
             ON CONFLICT(fault_approval_id) DO NOTHING",
            rusqlite::params![id, now],
        )
        .map_err(|e| e.to_string())?;
    }

    // Stage 4: the Moderate decision can name who must be informed of it.
    if original_severity == "Moderate" {
        conn.execute(
            "UPDATE mri_fault_approvals SET acknowledgment_assigned_to_user_id = ?1 WHERE id = ?2",
            rusqlite::params![acknowledgment_assigned_to_user_id, id],
        )
        .map_err(|e| e.to_string())?;
    }
    log_fault_decision(
        &conn, id, report_id, decision, &original_severity, Some(final_severity.as_str()),
        reviewer, review_method, notes.as_deref(), &recorded_by, is_provisional, acknowledgment_assigned_to_user_id,
    )?;

    // Reflect the tag directly on the asset record too. The subquery naturally no-ops if
    // this report isn't linked to an asset, so no special-casing is needed.
    refresh_asset_tag_for_report(&conn, report_id, &recorded_by)?;

    Ok("Fault approval decision saved".to_string())
}

// Sets the unit's tag from the whole picture, not from one fault: Red while ANY Critical
// fault on the same asset is still open (Red rectification, or a submitted Critical Fail
// with no terminal decision yet, incl. Carryforward); Green only when none remain.
fn refresh_asset_tag_for_report(conn: &rusqlite::Connection, report_id: i64, changed_by: &str) -> Result<(), String> {
    let asset_id: Option<i64> = conn
        .query_row(
            "SELECT asset_id FROM mri_reports WHERE id = ?1",
            [report_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    let asset_id = match asset_id {
        Some(a) => a,
        None => return Ok(()),
    };

    let red_rectifications: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM mri_fault_rectifications fr
             JOIN mri_fault_approvals fa ON fr.fault_approval_id = fa.id
             JOIN mri_reports r ON fa.report_id = r.id
             WHERE r.asset_id = ?1 AND fr.tag_status = 'Red'",
            [asset_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let undecided_criticals: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM mri_report_checklist_results res
             JOIN mri_reports r ON res.report_id = r.id
             WHERE r.asset_id = ?1
               AND r.status NOT IN ('Draft', 'Rejected')
               AND res.status = 'Fail' AND res.severity = 'Critical' AND res.repaired_on_site = 0
               AND NOT EXISTS (
                   SELECT 1 FROM mri_fault_approvals fa
                   WHERE fa.report_id = res.report_id
                     AND fa.template_checklist_item_id = res.template_checklist_item_id
                     AND fa.decision IN ('Approved', 'Reclassified', 'Rejected'))",
            [asset_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // A Moderate fault a reviewer has raised to Critical is Pending under Critical review;
    // its result row still says Moderate, so count it from the approval row instead.
    let pending_criticals: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM mri_fault_approvals fa
             JOIN mri_reports r ON fa.report_id = r.id
             WHERE r.asset_id = ?1
               AND r.status NOT IN ('Draft', 'Rejected')
               AND fa.original_severity = 'Critical' AND fa.decision = 'Pending'",
            [asset_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Manual 8.1 Yellow: the unit is being repaired / serviced. It is Yellow only while every
    // open Red rectification already has a technician assigned (repair underway) and no
    // Critical fault is still waiting for a decision; otherwise it stays Red. Still not
    // ready for service -- Green only comes from verification.
    let underway: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM mri_fault_rectifications fr
             JOIN mri_fault_approvals fa ON fr.fault_approval_id = fa.id
             JOIN mri_reports r ON fa.report_id = r.id
             WHERE r.asset_id = ?1 AND fr.tag_status = 'Red'
               AND TRIM(COALESCE(fr.assigned_technician, '')) <> ''",
            [asset_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let technician: Option<String> = conn
        .query_row(
            "SELECT fr.assigned_technician FROM mri_fault_rectifications fr
             JOIN mri_fault_approvals fa ON fr.fault_approval_id = fa.id
             JOIN mri_reports r ON fa.report_id = r.id
             WHERE r.asset_id = ?1 AND fr.tag_status = 'Red'
               AND TRIM(COALESCE(fr.assigned_technician, '')) <> ''
             ORDER BY fr.updated_date DESC LIMIT 1",
            [asset_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    let (tag, reason) = if undecided_criticals + pending_criticals == 0
        && red_rectifications > 0
        && underway == red_rectifications
    {
        (
            "Yellow",
            format!(
                "Repair in progress (technician: {}) -- unit not ready until verified (report #{})",
                technician.unwrap_or_default().trim(),
                report_id
            ),
        )
    } else if red_rectifications + undecided_criticals + pending_criticals > 0 {
        ("Red", format!("Critical fault still open on this unit (report #{})", report_id))
    } else {
        ("Green", format!("No open Critical faults remain (report #{})", report_id))
    };
    set_asset_tag(conn, asset_id, tag, &reason, Some(report_id), changed_by)
}

// The single place that changes an asset's tag. Writes the new tag and its reason on the
// asset and, only when the tag actually changes, adds a row to asset_tag_history.
fn set_asset_tag(
    conn: &rusqlite::Connection,
    asset_id: i64,
    tag: &str,
    reason: &str,
    report_id: Option<i64>,
    changed_by: &str,
) -> Result<(), String> {
    let previous: Option<String> = conn
        .query_row("SELECT tag_status FROM assets WHERE id = ?1", [asset_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE assets SET tag_status = ?1, tag_reason = ?2 WHERE id = ?3",
        rusqlite::params![tag, reason, asset_id],
    )
    .map_err(|e| e.to_string())?;
    // A unit that returns to Green no longer needs its Red-tag exemption.
    if tag == "Green" {
        conn.execute(
            "UPDATE asset_moc_exemptions SET status = 'Closed' WHERE asset_id = ?1 AND status = 'Active'",
            [asset_id],
        )
        .map_err(|e| e.to_string())?;
    }
    if previous.as_deref() != Some(tag) {
        conn.execute(
            "INSERT INTO asset_tag_history (asset_id, tag_status, previous_tag_status, reason, report_id, changed_by, changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![asset_id, tag, previous, reason, report_id, changed_by, chrono_now()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize, Deserialize)]
struct MocExemptionInput {
    asset_id: i64,
    moc_reference: String,
    approved_by: String,
    limitations: String,
    required_controls: String,
    valid_from: String,
    valid_until: String,
    return_conditions: String,
}

#[derive(Serialize, Deserialize)]
struct MocExemption {
    id: i64,
    asset_id: i64,
    moc_reference: String,
    approved_by: String,
    limitations: String,
    required_controls: String,
    valid_from: String,
    valid_until: String,
    return_conditions: String,
    status: String,
    created_by: Option<String>,
    created_at: String,
    revoked_by: Option<String>,
    revoked_at: Option<String>,
    revoke_reason: Option<String>,
    // True only while status is Active and today falls inside the validity period.
    is_valid: bool,
}

#[tauri::command]
fn create_moc_exemption(exemption: MocExemptionInput, created_by: String) -> Result<String, String> {
    let conn = get_connection()?;
    let required = [
        ("MOC reference", &exemption.moc_reference),
        ("Approved by", &exemption.approved_by),
        ("Equipment limitations", &exemption.limitations),
        ("Required controls", &exemption.required_controls),
        ("Conditions for return to service", &exemption.return_conditions),
        ("Valid from", &exemption.valid_from),
        ("Valid until", &exemption.valid_until),
    ];
    for (label, value) in required.iter() {
        if value.trim().is_empty() {
            return Err(format!("{} is required", label));
        }
    }
    if exemption.valid_until.trim() < exemption.valid_from.trim() {
        return Err("Valid until cannot be earlier than valid from".to_string());
    }
    let tag: Option<String> = conn
        .query_row("SELECT tag_status FROM assets WHERE id = ?1", [exemption.asset_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if !matches!(tag.as_deref(), Some("Red") | Some("Yellow")) {
        return Err("An exemption can only be recorded for a Red- or Yellow-tagged unit".to_string());
    }
    conn.execute(
        "INSERT INTO asset_moc_exemptions (asset_id, moc_reference, approved_by, limitations, required_controls, valid_from, valid_until, return_conditions, status, created_by, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'Active', ?9, ?10)",
        rusqlite::params![
            exemption.asset_id,
            exemption.moc_reference.trim(),
            exemption.approved_by.trim(),
            exemption.limitations.trim(),
            exemption.required_controls.trim(),
            exemption.valid_from.trim(),
            exemption.valid_until.trim(),
            exemption.return_conditions.trim(),
            created_by,
            chrono_now()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok("Exemption recorded".to_string())
}

#[tauri::command]
fn revoke_moc_exemption(id: i64, revoked_by: String, reason: String) -> Result<String, String> {
    let conn = get_connection()?;
    if reason.trim().is_empty() {
        return Err("A reason is required to revoke an exemption".to_string());
    }
    let rows = conn
        .execute(
            "UPDATE asset_moc_exemptions SET status = 'Revoked', revoked_by = ?1, revoked_at = ?2, revoke_reason = ?3
             WHERE id = ?4 AND status = 'Active'",
            rusqlite::params![revoked_by, chrono_now(), reason.trim(), id],
        )
        .map_err(|e| e.to_string())?;
    if rows == 0 {
        return Err("Exemption not found or no longer active".to_string());
    }
    Ok("Exemption revoked".to_string())
}

#[tauri::command]
fn get_moc_exemptions(asset_id: i64) -> Result<Vec<MocExemption>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, asset_id, moc_reference, approved_by, limitations, required_controls, valid_from, valid_until,
                    return_conditions, status, created_by, created_at, revoked_by, revoked_at, revoke_reason,
                    CASE WHEN status = 'Active' AND date('now', 'localtime') BETWEEN valid_from AND valid_until THEN 1 ELSE 0 END
             FROM asset_moc_exemptions WHERE asset_id = ?1 ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([asset_id], |row| {
            Ok(MocExemption {
                id: row.get(0)?,
                asset_id: row.get(1)?,
                moc_reference: row.get(2)?,
                approved_by: row.get(3)?,
                limitations: row.get(4)?,
                required_controls: row.get(5)?,
                valid_from: row.get(6)?,
                valid_until: row.get(7)?,
                return_conditions: row.get(8)?,
                status: row.get(9)?,
                created_by: row.get(10)?,
                created_at: row.get(11)?,
                revoked_by: row.get(12)?,
                revoked_at: row.get(13)?,
                revoke_reason: row.get(14)?,
                is_valid: row.get::<_, i32>(15)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(Serialize, Deserialize)]
struct AssetTagHistoryEntry {
    id: i64,
    asset_id: i64,
    tag_status: String,
    previous_tag_status: Option<String>,
    reason: Option<String>,
    report_id: Option<i64>,
    changed_by: Option<String>,
    changed_at: String,
}

#[tauri::command]
fn get_asset_tag_history(asset_id: i64) -> Result<Vec<AssetTagHistoryEntry>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, asset_id, tag_status, previous_tag_status, reason, report_id, changed_by, changed_at
             FROM asset_tag_history WHERE asset_id = ?1 ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([asset_id], |row| {
            Ok(AssetTagHistoryEntry {
                id: row.get(0)?,
                asset_id: row.get(1)?,
                tag_status: row.get(2)?,
                previous_tag_status: row.get(3)?,
                reason: row.get(4)?,
                report_id: row.get(5)?,
                changed_by: row.get(6)?,
                changed_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
fn confirm_provisional_approval(id: i64, confirmed_by: String) -> Result<String, String> {
    let conn = get_connection()?;
    let confirmed_by = confirmed_by.trim();
    if confirmed_by.is_empty() {
        return Err("Confirmed-by name is required".to_string());
    }

    let provisional_status: Option<String> = conn
        .query_row(
            "SELECT provisional_status FROM mri_fault_approvals WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if provisional_status.as_deref() != Some("Provisional") {
        return Err("This entry is not awaiting confirmation".to_string());
    }

    let now = chrono_now();
    conn.execute(
        "UPDATE mri_fault_approvals SET provisional_status = 'Confirmed', confirmed_by = ?1, confirmed_date = ?2, updated_date = ?2 WHERE id = ?3",
        rusqlite::params![confirmed_by, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok("Provisional entry confirmed".to_string())
}

#[derive(Serialize, Deserialize)]
struct MriFaultRectification {
    id: i64,
    fault_approval_id: i64,
    report_id: i64,
    template_checklist_item_id: i64,
    asset_code: Option<String>,
    checklist_description: Option<String>,
    assigned_technician: Option<String>,
    parts_status: String,
    repair_date: Option<String>,
    verified_by: Option<String>,
    verified_date: Option<String>,
    tag_status: String,
    created_date: String,
    updated_date: String,
    limitations_note: Option<String>,
    limitations_informed_by: Option<String>,
    limitations_informed_date: Option<String>,
}

const MRI_FAULT_RECTIFICATION_SELECT: &str =
    "SELECT fr.id, fr.fault_approval_id, fa.report_id, fa.template_checklist_item_id,
                a.asset_code, cd.description,
                fr.assigned_technician, fr.parts_status, fr.repair_date,
                fr.verified_by, fr.verified_date, fr.tag_status, fr.created_date, fr.updated_date,
                fr.limitations_note, fr.limitations_informed_by, fr.limitations_informed_date
         FROM mri_fault_rectifications fr
         JOIN mri_fault_approvals fa ON fr.fault_approval_id = fa.id
         JOIN mri_reports rep ON fa.report_id = rep.id
         LEFT JOIN assets a ON rep.asset_id = a.id
         LEFT JOIN template_checklist_items tci ON fa.template_checklist_item_id = tci.id
         LEFT JOIN checklist_databank cd ON tci.checklist_item_id = cd.id";

fn map_mri_fault_rectification_row(row: &rusqlite::Row) -> rusqlite::Result<MriFaultRectification> {
    Ok(MriFaultRectification {
        id: row.get(0)?,
        fault_approval_id: row.get(1)?,
        report_id: row.get(2)?,
        template_checklist_item_id: row.get(3)?,
        asset_code: row.get(4)?,
        checklist_description: row.get(5)?,
        assigned_technician: row.get(6)?,
        parts_status: row.get(7)?,
        repair_date: row.get(8)?,
        verified_by: row.get(9)?,
        verified_date: row.get(10)?,
        tag_status: row.get(11)?,
        created_date: row.get(12)?,
        updated_date: row.get(13)?,
        limitations_note: row.get(14)?,
        limitations_informed_by: row.get(15)?,
        limitations_informed_date: row.get(16)?,
    })
}

#[tauri::command]
fn get_mri_fault_rectifications(report_id: i64) -> Result<Vec<MriFaultRectification>, String> {
    let conn = get_connection()?;
    let sql = format!(
        "{} WHERE fa.report_id = ?1 ORDER BY fr.created_date DESC",
        MRI_FAULT_RECTIFICATION_SELECT
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([report_id], map_mri_fault_rectification_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// Cross-report queue of faults awaiting rectification (Red-Tagged Critical faults, plus
// Moderate faults still being planned and monitored), for the
// Rectification Queue screen (Diagram A's repair loop). Country-scoped: uses its own query
// (rather than MRI_FAULT_RECTIFICATION_SELECT) so it can pull in the asset's country without
// changing the shared per-report query or struct.
#[tauri::command]
fn get_pending_mri_fault_rectifications(viewer_user_id: i64) -> Result<Vec<MriFaultRectification>, String> {
    let conn = get_connection()?;
    let restriction = user_country_restriction(&conn, viewer_user_id)?;
    let sql = "SELECT fr.id, fr.fault_approval_id, fa.report_id, fa.template_checklist_item_id,
                a.asset_code, cd.description,
                fr.assigned_technician, fr.parts_status, fr.repair_date,
                fr.verified_by, fr.verified_date, fr.tag_status, fr.created_date, fr.updated_date,
                fr.limitations_note, fr.limitations_informed_by, fr.limitations_informed_date, a.country
         FROM mri_fault_rectifications fr
         JOIN mri_fault_approvals fa ON fr.fault_approval_id = fa.id
         JOIN mri_reports rep ON fa.report_id = rep.id
         LEFT JOIN assets a ON rep.asset_id = a.id
         LEFT JOIN template_checklist_items tci ON fa.template_checklist_item_id = tci.id
         LEFT JOIN checklist_databank cd ON tci.checklist_item_id = cd.id
         WHERE fr.tag_status IN ('Red', 'Planned') ORDER BY fr.created_date DESC";
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let country: Option<String> = row.get(17)?;
            Ok((map_mri_fault_rectification_row(row)?, country))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|(_, country): &(MriFaultRectification, Option<String>)| match &restriction {
            None => true,
            Some(allowed) => country.as_deref().map_or(false, |c| allowed.iter().any(|a| a == c)),
        })
        .map(|(row, _)| row)
        .collect();
    Ok(rows)
}

fn valid_parts_status(s: &str) -> bool {
    matches!(s, "Awaiting" | "Ordered" | "Available")
}

#[derive(Serialize, Deserialize)]
struct MriFaultRectificationUpdate {
    id: i64,
    assigned_technician: Option<String>,
    parts_status: String,
    repair_date: Option<String>,
    #[serde(default)]
    updated_by: Option<String>,
}

// Updates the in-progress repair plan (technician, parts, repair date). Does not touch
// verification/tag_status -- that is the separate, terminal verify_mri_fault_rectification
// action, so "who signed off on removing the Red Tag" always has its own explicit step.
#[tauri::command]
fn update_mri_fault_rectification(update: MriFaultRectificationUpdate) -> Result<String, String> {
    let conn = get_connection()?;
    if !valid_parts_status(&update.parts_status) {
        return Err("Invalid parts status".to_string());
    }
    let now = chrono_now();
    let rows_affected = conn.execute(
        "UPDATE mri_fault_rectifications SET assigned_technician = ?1, parts_status = ?2, repair_date = ?3, updated_date = ?4 WHERE id = ?5 AND tag_status IN ('Red', 'Planned')",
        rusqlite::params![update.assigned_technician, update.parts_status, update.repair_date, now, update.id],
    ).map_err(|e| e.to_string())?;
    if rows_affected == 0 {
        return Err("Rectification not found or already verified".to_string());
    }
    // Assigning (or removing) the technician moves the unit Red <-> Yellow (repair underway).
    let report_id: Option<i64> = conn
        .query_row(
            "SELECT fa.report_id FROM mri_fault_rectifications fr
             JOIN mri_fault_approvals fa ON fr.fault_approval_id = fa.id WHERE fr.id = ?1",
            [update.id],
            |row| row.get(0),
        )
        .ok();
    if let Some(rid) = report_id {
        let who = update
            .updated_by
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("System")
            .to_string();
        refresh_asset_tag_for_report(&conn, rid, &who)?;
    }
    Ok("Rectification updated".to_string())
}

// Figure 4: while a fault is open the field team is informed of the equipment's
// limitations (what the unit must not be used for). Recorded on the rectification with who
// informed them and when.
#[tauri::command]
fn record_equipment_limitations(id: i64, note: String, informed_by: String) -> Result<String, String> {
    let conn = get_connection()?;
    if note.trim().is_empty() {
        return Err("Describe the equipment limitations communicated to the field team.".to_string());
    }
    if informed_by.trim().is_empty() {
        return Err("Informed-by name is required".to_string());
    }
    let n = conn
        .execute(
            "UPDATE mri_fault_rectifications SET limitations_note = ?1, limitations_informed_by = ?2, limitations_informed_date = ?3
             WHERE id = ?4 AND tag_status IN ('Red', 'Planned')",
            rusqlite::params![note.trim(), informed_by.trim(), chrono_now(), id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Rectification not found or already verified".to_string());
    }
    Ok("Limitations recorded".to_string())
}

// Terminal step of the repair loop: records who verified the repair, flips tag_status
// Red -> Green, and reflects that on the report's "Green Tagged" footer checkbox
// (mirrors the same best-effort footer logic in set_mri_fault_approval_decision).
#[tauri::command]
fn verify_mri_fault_rectification(
    id: i64,
    verified_by: String,
    function_test_passed: bool,
) -> Result<String, String> {
    let conn = get_connection()?;
    let verified_by = verified_by.trim();
    if verified_by.is_empty() {
        return Err("Verified-by name is required".to_string());
    }
    // Figure 4: a repair is only verified after the technician did the work, the repair
    // date is on record and the unit passed a function test.
    if !function_test_passed {
        return Err("Confirm that the function test was performed and passed before verifying the repair.".to_string());
    }
    let (tech, repair_date, current_tag): (Option<String>, Option<String>, String) = conn
        .query_row(
            "SELECT assigned_technician, repair_date, tag_status FROM mri_fault_rectifications WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Rectification not found or already verified".to_string())?;
    if current_tag == "Red" {
        if tech.as_deref().map_or(true, |t| t.trim().is_empty()) {
            return Err("Assign the technician who did the repair before verifying it.".to_string());
        }
        if repair_date.as_deref().map_or(true, |d| d.trim().is_empty()) {
            return Err("Record the repair date before verifying the repair.".to_string());
        }
    }

    let found: Option<(i64, String)> = conn
        .query_row(
            "SELECT fa.report_id, fr.tag_status FROM mri_fault_rectifications fr
             JOIN mri_fault_approvals fa ON fr.fault_approval_id = fa.id
             WHERE fr.id = ?1 AND fr.tag_status IN ('Red', 'Planned')",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();
    let (report_id, was_status) = match found {
        Some(f) => f,
        None => return Err("Rectification not found or already verified".to_string()),
    };
    // A Moderate follow-up ('Planned') was already Green-Tagged when it was reviewed, so
    // verifying it must not touch the report's Green Tagged footer; only a Red repair does.
    let was_red = was_status == "Red";

    let now = chrono_now();
    conn.execute(
        "UPDATE mri_fault_rectifications SET verified_by = ?1, verified_date = ?2, tag_status = 'Green', function_test_passed = 1, updated_date = ?2 WHERE id = ?3",
        rusqlite::params![verified_by, now, id],
    )
    .map_err(|e| e.to_string())?;

    let green_tagged_field: Option<i64> = conn
        .query_row(
            "SELECT tff.id FROM template_footer_fields tff
             JOIN footer_field_catalog ffc ON tff.footer_field_id = ffc.id
             JOIN mri_reports r ON r.template_id = tff.template_id
             WHERE r.id = ?1 AND ffc.label = 'Green Tagged'",
            [report_id],
            |row| row.get(0),
        )
        .ok();
    if let (Some(field_id), true) = (green_tagged_field, was_red) {
        conn.execute(
            "INSERT INTO mri_report_footer_values (report_id, template_footer_field_id, value)
             VALUES (?1, ?2, 'true')
             ON CONFLICT(report_id, template_footer_field_id) DO UPDATE SET value = excluded.value",
            rusqlite::params![report_id, field_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Flip the asset's own tag back to Green now that the repair is verified.
    // Green only if no other Critical fault on this unit is still open.
    refresh_asset_tag_for_report(&conn, report_id, verified_by)?;

    Ok("Rectification verified -- tag removed".to_string())
}

#[derive(Serialize, Deserialize)]
struct MriReportMidValue {
    id: i64,
    report_id: i64,
    template_mid_field_id: i64,
    value: Option<String>,
    route_points: Option<String>,
}

#[tauri::command]
fn get_mri_report_mid_values(report_id: i64) -> Result<Vec<MriReportMidValue>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, report_id, template_mid_field_id, value, route_points FROM mri_report_mid_values WHERE report_id = ?1"
    ).map_err(|e| e.to_string())?;
    let values = stmt
        .query_map([report_id], |row| {
            Ok(MriReportMidValue {
                id: row.get(0)?,
                report_id: row.get(1)?,
                template_mid_field_id: row.get(2)?,
                value: row.get(3)?,
                route_points: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(values)
}

#[tauri::command]
fn set_mri_report_mid_value(
    report_id: i64,
    template_mid_field_id: i64,
    value: String,
    route_points: Option<String>,
    updated_by: Option<String>,
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO mri_report_mid_values (report_id, template_mid_field_id, value, route_points, updated_by, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(report_id, template_mid_field_id) DO UPDATE SET
            value = excluded.value, route_points = excluded.route_points,
            updated_by = excluded.updated_by, updated_at = excluded.updated_at",
        rusqlite::params![report_id, template_mid_field_id, value, route_points, updated_by, chrono_now()],
    )
    .map_err(|e| e.to_string())?;
    Ok("Mid value saved".to_string())
}

#[derive(Serialize, Deserialize)]
struct MriReportFooterValue {
    id: i64,
    report_id: i64,
    template_footer_field_id: i64,
    value: Option<String>,
}

#[tauri::command]
fn get_mri_report_footer_values(report_id: i64) -> Result<Vec<MriReportFooterValue>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, report_id, template_footer_field_id, value FROM mri_report_footer_values WHERE report_id = ?1"
    ).map_err(|e| e.to_string())?;
    let values = stmt
        .query_map([report_id], |row| {
            Ok(MriReportFooterValue {
                id: row.get(0)?,
                report_id: row.get(1)?,
                template_footer_field_id: row.get(2)?,
                value: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(values)
}

#[tauri::command]
fn set_mri_report_footer_value(
    report_id: i64,
    template_footer_field_id: i64,
    value: String,
    updated_by: Option<String>,
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO mri_report_footer_values (report_id, template_footer_field_id, value, updated_by, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(report_id, template_footer_field_id) DO UPDATE SET
            value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
        rusqlite::params![report_id, template_footer_field_id, value, updated_by, chrono_now()],
    )
    .map_err(|e| e.to_string())?;
    Ok("Footer value saved".to_string())
}

// --- Supporting photos/files attached to a checklist item's result on a report ---

#[derive(Serialize, Deserialize)]
struct MriReportAttachment {
    id: i64,
    report_id: i64,
    template_checklist_item_id: i64,
    file_name: String,
    file_type: String,
    data: String,
    uploaded_date: String,
    uploaded_by: Option<String>,
}

#[tauri::command]
fn get_mri_report_attachments(report_id: i64) -> Result<Vec<MriReportAttachment>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, report_id, template_checklist_item_id, file_name, file_type, data, uploaded_date, uploaded_by
             FROM mri_report_attachments WHERE report_id = ?1 ORDER BY uploaded_date",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([report_id], |row| {
            Ok(MriReportAttachment {
                id: row.get(0)?,
                report_id: row.get(1)?,
                template_checklist_item_id: row.get(2)?,
                file_name: row.get(3)?,
                file_type: row.get(4)?,
                data: row.get(5)?,
                uploaded_date: row.get(6)?,
                uploaded_by: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
fn add_mri_report_attachment(
    report_id: i64,
    template_checklist_item_id: i64,
    file_name: String,
    file_type: String,
    data: String,
    uploaded_by: Option<String>,
) -> Result<i64, String> {
    let conn = get_connection()?;
    if data.trim().is_empty() {
        return Err("File data cannot be empty".to_string());
    }
    let now = chrono_now();
    conn.execute(
        "INSERT INTO mri_report_attachments (report_id, template_checklist_item_id, file_name, file_type, data, uploaded_date, uploaded_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![report_id, template_checklist_item_id, file_name, file_type, data, now, uploaded_by],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn delete_mri_report_attachment(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM mri_report_attachments WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Attachment deleted".to_string())
}

#[derive(Serialize, Deserialize)]
struct LookupValue {
    id: i64,
    criteria: String,
    name: String,
    active: bool,
}

#[tauri::command]
fn get_lookup_criteria() -> Result<Vec<String>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT DISTINCT criteria FROM lookups ORDER BY criteria")
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
fn get_lookups(criteria: String) -> Result<Vec<LookupValue>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT id, criteria, name, active FROM lookups WHERE criteria = ?1 ORDER BY name")
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([criteria], |row| {
            Ok(LookupValue {
                id: row.get(0)?,
                criteria: row.get(1)?,
                name: row.get(2)?,
                active: row.get::<_, i32>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
fn create_lookup(criteria: String, name: String) -> Result<String, String> {
    let conn = get_connection()?;
    let criteria = criteria.trim();
    let name = name.trim();
    if criteria.is_empty() || name.is_empty() {
        return Err("Criteria and name cannot be empty".to_string());
    }
    let existing: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM lookups WHERE criteria = ?1 AND name = ?2",
            rusqlite::params![criteria, name],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err(format!("'{}' already exists under {}", name, criteria));
    }
    conn.execute(
        "INSERT INTO lookups (criteria, name, active) VALUES (?1, ?2, 1)",
        rusqlite::params![criteria, name],
    )
    .map_err(|e| e.to_string())?;
    Ok("Lookup value added".to_string())
}

#[tauri::command]
fn update_lookup(item: LookupValue) -> Result<String, String> {
    let conn = get_connection()?;
    let name = item.name.trim();
    if name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    conn.execute(
        "UPDATE lookups SET name = ?1, active = ?2 WHERE id = ?3",
        rusqlite::params![name, item.active as i32, item.id],
    )
    .map_err(|e| e.to_string())?;
    Ok("Lookup value updated".to_string())
}

#[tauri::command]
fn delete_lookup(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM lookups WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Lookup value deleted".to_string())
}

#[tauri::command]
fn bulk_create_lookups(criteria: String, names: Vec<String>) -> Result<String, String> {
    let conn = get_connection()?;
    let criteria = criteria.trim();
    let mut added = 0;
    let mut skipped = 0;
    for name in names {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            skipped += 1;
            continue;
        }
        let existing: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM lookups WHERE criteria = ?1 AND name = ?2",
                rusqlite::params![criteria, &trimmed],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if existing > 0 {
            skipped += 1;
            continue;
        }
        conn.execute(
            "INSERT INTO lookups (criteria, name, active) VALUES (?1, ?2, 1)",
            rusqlite::params![criteria, trimmed],
        )
        .map_err(|e| e.to_string())?;
        added += 1;
    }
    Ok(format!(
        "{} added, {} skipped (duplicates or empty)",
        added, skipped
    ))
}

// A "criteria" isn't its own table — it's just the distinct `criteria` column value shared
// by a group of lookup rows — so renaming/deleting one means renaming/deleting every row
// that carries that value.
#[tauri::command]
fn rename_lookup_criteria(old_criteria: String, new_criteria: String) -> Result<String, String> {
    let conn = get_connection()?;
    let old_criteria = old_criteria.trim();
    let new_criteria = new_criteria.trim().to_uppercase();
    if old_criteria.is_empty() || new_criteria.is_empty() {
        return Err("Criteria name cannot be empty".to_string());
    }
    if old_criteria == new_criteria {
        return Ok("No change".to_string());
    }
    let clash: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM lookups WHERE criteria = ?1",
            [&new_criteria],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if clash > 0 {
        return Err(format!(
            "A criteria named '{}' already exists",
            new_criteria
        ));
    }
    conn.execute(
        "UPDATE lookups SET criteria = ?1 WHERE criteria = ?2",
        rusqlite::params![new_criteria, old_criteria],
    )
    .map_err(|e| e.to_string())?;
    Ok("Criteria renamed".to_string())
}

#[tauri::command]
fn delete_lookup_criteria(criteria: String) -> Result<String, String> {
    let conn = get_connection()?;
    let criteria = criteria.trim();
    if criteria.is_empty() {
        return Err("Criteria cannot be empty".to_string());
    }
    let count = conn
        .execute("DELETE FROM lookups WHERE criteria = ?1", [criteria])
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "Criteria '{}' deleted ({} value{} removed)",
        criteria,
        count,
        if count == 1 { "" } else { "s" }
    ))
}

#[tauri::command]
fn get_previous_engine_hours(
    asset_id: i64,
    current_report_id: i64,
) -> Result<Option<String>, String> {
    let conn = get_connection()?;

    let prev_report_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM mri_reports WHERE asset_id = ?1 AND id < ?2 AND status = 'Approved' ORDER BY id DESC LIMIT 1",
            rusqlite::params![asset_id, current_report_id],
            |row| row.get(0),
        )
        .ok();

    let Some(prev_id) = prev_report_id else {
        return Ok(None);
    };

    let field_catalog_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM header_field_catalog WHERE label = 'Current Engine Hours'",
            [],
            |row| row.get(0),
        )
        .ok();

    let Some(catalog_id) = field_catalog_id else {
        return Ok(None);
    };

    let value: Option<String> = conn
        .query_row(
            "SELECT v.value FROM mri_report_header_values v
         JOIN template_header_fields thf ON v.template_header_field_id = thf.id
         WHERE v.report_id = ?1 AND thf.header_field_id = ?2",
            rusqlite::params![prev_id, catalog_id],
            |row| row.get(0),
        )
        .ok();

    Ok(value)
}

#[tauri::command]
fn get_previous_compliance_stage(
    asset_id: i64,
    current_report_id: i64,
) -> Result<Option<String>, String> {
    let conn = get_connection()?;

    let prev_report_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM mri_reports WHERE asset_id = ?1 AND id < ?2 AND status = 'Approved' ORDER BY id DESC LIMIT 1",
            rusqlite::params![asset_id, current_report_id],
            |row| row.get(0),
        )
        .ok();

    let Some(prev_id) = prev_report_id else {
        return Ok(None);
    };

    Ok(get_compliance_stage(&conn, prev_id))
}

#[tauri::command]
fn export_mri_templates_backup() -> Result<String, String> {
    let conn = get_connection()?;

    let mut tmpl_stmt = conn
        .prepare(
            "SELECT t.id, t.template_name, t.status, at.description
         FROM mri_templates t JOIN asset_types at ON t.asset_type_id = at.id",
        )
        .map_err(|e| e.to_string())?;

    let templates_meta: Vec<(i64, String, String, String)> = tmpl_stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut templates_json = Vec::new();

    for (tmpl_id, template_name, status, asset_type) in templates_meta {
        let mut hf_stmt = conn.prepare(
            "SELECT hfc.label, thf.label_override, thf.data_type, thf.required, thf.display_order, thf.default_value
             FROM template_header_fields thf JOIN header_field_catalog hfc ON thf.header_field_id = hfc.id
             WHERE thf.template_id = ?1"
        ).map_err(|e| e.to_string())?;
        let header_fields: Vec<serde_json::Value> = hf_stmt
            .query_map([tmpl_id], |row| {
                Ok(serde_json::json!({
                    "label": row.get::<_, String>(0)?,
                    "label_override": row.get::<_, Option<String>>(1)?,
                    "data_type": row.get::<_, String>(2)?,
                    "required": row.get::<_, i32>(3)? != 0,
                    "display_order": row.get::<_, i64>(4)?,
                    "default_value": row.get::<_, Option<String>>(5)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let mut ci_stmt = conn
            .prepare(
                "SELECT cd.code, cs.name, tci.severity, tci.display_order, tci.required
             FROM template_checklist_items tci
             JOIN checklist_databank cd ON tci.checklist_item_id = cd.id
             LEFT JOIN checklist_sections cs ON tci.section_id = cs.id
             WHERE tci.template_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let checklist_items: Vec<serde_json::Value> = ci_stmt
            .query_map([tmpl_id], |row| {
                Ok(serde_json::json!({
                    "code": row.get::<_, String>(0)?,
                    "section": row.get::<_, Option<String>>(1)?,
                    "severity": row.get::<_, Option<String>>(2)?,
                    "display_order": row.get::<_, i64>(3)?,
                    "required": row.get::<_, i32>(4)? != 0,
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let mut mf_stmt = conn
            .prepare(
                "SELECT mfc.label, tmf.display_order
             FROM template_mid_fields tmf JOIN mid_field_catalog mfc ON tmf.mid_field_id = mfc.id
             WHERE tmf.template_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let mid_fields: Vec<serde_json::Value> = mf_stmt
            .query_map([tmpl_id], |row| {
                Ok(serde_json::json!({
                    "label": row.get::<_, String>(0)?,
                    "display_order": row.get::<_, i64>(1)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let mut ff_stmt = conn.prepare(
            "SELECT ffc.label, tff.display_order
             FROM template_footer_fields tff JOIN footer_field_catalog ffc ON tff.footer_field_id = ffc.id
             WHERE tff.template_id = ?1"
        ).map_err(|e| e.to_string())?;
        let footer_fields: Vec<serde_json::Value> = ff_stmt
            .query_map([tmpl_id], |row| {
                Ok(serde_json::json!({
                    "label": row.get::<_, String>(0)?,
                    "display_order": row.get::<_, i64>(1)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        templates_json.push(serde_json::json!({
            "template_name": template_name,
            "asset_type": asset_type,
            "status": status,
            "header_fields": header_fields,
            "checklist_items": checklist_items,
            "mid_fields": mid_fields,
            "footer_fields": footer_fields,
        }));
    }

    let backup = serde_json::json!({
        "backup_type": "mri_templates",
        "version": 1,
        "templates": templates_json,
    });

    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_mri_templates_backup(backup_json: String) -> Result<String, String> {
    let conn = get_connection()?;
    let backup: serde_json::Value =
        serde_json::from_str(&backup_json).map_err(|e| e.to_string())?;
    let templates = backup["templates"]
        .as_array()
        .ok_or("Missing 'templates' array in backup file")?;

    let mut added = 0;
    let mut skipped = 0;
    let mut warnings: Vec<String> = Vec::new();

    for t in templates {
        let template_name = t["template_name"].as_str().unwrap_or("").to_string();
        let asset_type_desc = t["asset_type"].as_str().unwrap_or("");
        if template_name.is_empty() {
            skipped += 1;
            continue;
        }

        let existing: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM mri_templates WHERE template_name = ?1",
                [&template_name],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if existing > 0 {
            skipped += 1;
            warnings.push(format!("'{}' already exists, skipped", template_name));
            continue;
        }

        let asset_type_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM asset_types WHERE description = ?1",
                [asset_type_desc],
                |row| row.get(0),
            )
            .ok();
        let Some(asset_type_id) = asset_type_id else {
            skipped += 1;
            warnings.push(format!(
                "'{}' skipped — asset type '{}' not found, create it first",
                template_name, asset_type_desc
            ));
            continue;
        };

        let status = t["status"].as_str().unwrap_or("Draft");
        let now = chrono_now();
        conn.execute(
            "INSERT INTO mri_templates (template_name, asset_type_id, status, created_by, created_date, updated_by, updated_date)
             VALUES (?1, ?2, ?3, 'local user', ?4, 'local user', ?4)",
            rusqlite::params![template_name, asset_type_id, status, now],
        ).map_err(|e| e.to_string())?;
        let tmpl_id = conn.last_insert_rowid();

        if let Some(header_fields) = t["header_fields"].as_array() {
            for hf in header_fields {
                let label = hf["label"].as_str().unwrap_or("");
                let field_id: Option<i64> = conn
                    .query_row(
                        "SELECT id FROM header_field_catalog WHERE label = ?1",
                        [label],
                        |row| row.get(0),
                    )
                    .ok();
                if let Some(field_id) = field_id {
                    conn.execute(
                        "INSERT INTO template_header_fields (template_id, header_field_id, label_override, data_type, required, display_order, default_value)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        rusqlite::params![
                            tmpl_id, field_id, hf["label_override"].as_str(), hf["data_type"].as_str().unwrap_or("text"),
                            hf["required"].as_bool().unwrap_or(false) as i32, hf["display_order"].as_i64().unwrap_or(0), hf["default_value"].as_str()
                        ],
                    ).map_err(|e| e.to_string())?;
                } else {
                    warnings.push(format!(
                        "Header field '{}' not found, skipped for '{}'",
                        label, template_name
                    ));
                }
            }
        }

        if let Some(checklist_items) = t["checklist_items"].as_array() {
            for ci in checklist_items {
                let code = ci["code"].as_str().unwrap_or("");
                let item_id: Option<i64> = conn
                    .query_row(
                        "SELECT id FROM checklist_databank WHERE code = ?1",
                        [code],
                        |row| row.get(0),
                    )
                    .ok();
                if let Some(item_id) = item_id {
                    let section_id: Option<i64> = ci["section"].as_str().and_then(|name| {
                        conn.query_row(
                            "SELECT id FROM checklist_sections WHERE name = ?1",
                            [name],
                            |row| row.get(0),
                        )
                        .ok()
                    });
                    conn.execute(
                        "INSERT INTO template_checklist_items (template_id, checklist_item_id, section_id, severity, display_order, required)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        rusqlite::params![
                            tmpl_id, item_id, section_id, ci["severity"].as_str(),
                            ci["display_order"].as_i64().unwrap_or(0), ci["required"].as_bool().unwrap_or(false) as i32
                        ],
                    ).map_err(|e| e.to_string())?;
                } else {
                    warnings.push(format!(
                        "Checklist item '{}' not found, skipped for '{}'",
                        code, template_name
                    ));
                }
            }
        }

        if let Some(mid_fields) = t["mid_fields"].as_array() {
            for mf in mid_fields {
                let label = mf["label"].as_str().unwrap_or("");
                let field_id: Option<i64> = conn
                    .query_row(
                        "SELECT id FROM mid_field_catalog WHERE label = ?1",
                        [label],
                        |row| row.get(0),
                    )
                    .ok();
                if let Some(field_id) = field_id {
                    conn.execute(
                        "INSERT INTO template_mid_fields (template_id, mid_field_id, display_order) VALUES (?1, ?2, ?3)",
                        rusqlite::params![tmpl_id, field_id, mf["display_order"].as_i64().unwrap_or(0)],
                    ).map_err(|e| e.to_string())?;
                }
            }
        }

        if let Some(footer_fields) = t["footer_fields"].as_array() {
            for ff in footer_fields {
                let label = ff["label"].as_str().unwrap_or("");
                let field_id: Option<i64> = conn
                    .query_row(
                        "SELECT id FROM footer_field_catalog WHERE label = ?1",
                        [label],
                        |row| row.get(0),
                    )
                    .ok();
                if let Some(field_id) = field_id {
                    conn.execute(
                        "INSERT INTO template_footer_fields (template_id, footer_field_id, display_order) VALUES (?1, ?2, ?3)",
                        rusqlite::params![tmpl_id, field_id, ff["display_order"].as_i64().unwrap_or(0)],
                    ).map_err(|e| e.to_string())?;
                }
            }
        }

        added += 1;
    }

    let mut result = format!("{} templates restored, {} skipped", added, skipped);
    if !warnings.is_empty() {
        result.push_str(&format!(" ({} warnings)", warnings.len()));
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Full data backup: every table in the database (users, roles and permissions, asset types,
// lookups, catalogs, checklist databank, assets, templates, reports, faults, exemptions,
// tag history and so on) exported as one JSON file with the ORIGINAL row ids, so every
// relationship survives the round trip. Import is a merge: each backup row is written with
// INSERT OR REPLACE, so a row in the backup wins over a row with the same id/unique key
// already in the database. Columns are matched by name, so a backup from an older build
// still imports into a newer one. Files contain everything in the clear: keep them safe.
// ---------------------------------------------------------------------------
fn backup_value_to_json(v: rusqlite::types::Value) -> serde_json::Value {
    use rusqlite::types::Value as V;
    match v {
        V::Null => serde_json::Value::Null,
        V::Integer(i) => serde_json::json!(i),
        V::Real(f) => serde_json::Number::from_f64(f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        V::Text(s) => serde_json::Value::String(s),
        V::Blob(b) => {
            let hex: String = b.iter().map(|x| format!("{:02x}", x)).collect();
            serde_json::json!({ "$blob": hex })
        }
    }
}

fn backup_json_to_value(v: &serde_json::Value) -> rusqlite::types::Value {
    use rusqlite::types::Value as V;
    match v {
        serde_json::Value::Null => V::Null,
        serde_json::Value::Bool(b) => V::Integer(*b as i64),
        serde_json::Value::Number(n) => match n.as_i64() {
            Some(i) => V::Integer(i),
            None => V::Real(n.as_f64().unwrap_or(0.0)),
        },
        serde_json::Value::String(s) => V::Text(s.clone()),
        serde_json::Value::Object(o) => match o.get("$blob").and_then(|h| h.as_str()) {
            Some(hex) => {
                let bytes: Vec<u8> = (0..hex.len() / 2)
                    .filter_map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok())
                    .collect();
                V::Blob(bytes)
            }
            None => V::Text(v.to_string()),
        },
        serde_json::Value::Array(_) => V::Text(v.to_string()),
    }
}

fn backup_local_tables(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|e| e.to_string())?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(names)
}

#[tauri::command]
fn export_full_backup() -> Result<String, String> {
    let conn = get_connection()?;
    let mut tables = serde_json::Map::new();
    let mut total_rows: usize = 0;
    for table in backup_local_tables(&conn)? {
        let mut stmt = conn
            .prepare(&format!("SELECT * FROM \"{}\"", table))
            .map_err(|e| e.to_string())?;
        let columns: Vec<String> = stmt.column_names().iter().map(|c| c.to_string()).collect();
        let col_count = columns.len();
        let rows: Vec<serde_json::Value> = stmt
            .query_map([], |row| {
                let mut out = Vec::with_capacity(col_count);
                for i in 0..col_count {
                    out.push(backup_value_to_json(row.get::<_, rusqlite::types::Value>(i)?));
                }
                Ok(serde_json::Value::Array(out))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        total_rows += rows.len();
        tables.insert(
            table,
            serde_json::json!({ "columns": columns, "rows": rows }),
        );
    }
    let backup = serde_json::json!({
        "backup_type": "full_data",
        "version": 1,
        "exported_at": chrono_now(),
        "row_count": total_rows,
        "tables": tables,
    });
    serde_json::to_string(&backup).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_full_backup(backup_json: String) -> Result<String, String> {
    let backup: serde_json::Value =
        serde_json::from_str(&backup_json).map_err(|e| format!("Not a valid backup file: {}", e))?;
    if backup["backup_type"].as_str() != Some("full_data") {
        return Err("This is not a full data backup file (backup_type must be full_data)".to_string());
    }
    let tables = backup["tables"]
        .as_object()
        .ok_or("Missing 'tables' in backup file")?;

    let conn = get_connection()?;
    let local_tables = backup_local_tables(&conn)?;

    // Rows are written with their original ids in arbitrary table order, so foreign key
    // enforcement is switched off for the import and restored afterwards.
    let fk_was_on: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .unwrap_or(0);
    conn.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(usize, usize, Vec<String>), String> {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let mut rows_written = 0usize;
        let mut tables_done = 0usize;
        let mut notes: Vec<String> = Vec::new();
        for (table, data) in tables {
            if !local_tables.contains(table) {
                notes.push(format!("table '{}' not in this build, skipped", table));
                continue;
            }
            let backup_cols: Vec<String> = data["columns"]
                .as_array()
                .ok_or(format!("Table '{}' has no columns list", table))?
                .iter()
                .filter_map(|c| c.as_str().map(|s| s.to_string()))
                .collect();
            let rows = data["rows"]
                .as_array()
                .ok_or(format!("Table '{}' has no rows list", table))?;

            let mut local_cols: Vec<String> = Vec::new();
            {
                let mut info = tx
                    .prepare(&format!("PRAGMA table_info(\"{}\")", table))
                    .map_err(|e| e.to_string())?;
                let iter = info
                    .query_map([], |row| row.get::<_, String>(1))
                    .map_err(|e| e.to_string())?;
                for c in iter {
                    local_cols.push(c.map_err(|e| e.to_string())?);
                }
            }
            // (index in backup row, column name) for columns that exist on both sides
            let usable: Vec<(usize, &String)> = backup_cols
                .iter()
                .enumerate()
                .filter(|(_, c)| local_cols.contains(c))
                .collect();
            if usable.is_empty() || rows.is_empty() {
                continue;
            }
            let col_list = usable
                .iter()
                .map(|(_, c)| format!("\"{}\"", c))
                .collect::<Vec<_>>()
                .join(", ");
            let placeholders = (1..=usable.len())
                .map(|i| format!("?{}", i))
                .collect::<Vec<_>>()
                .join(", ");
            let sql = format!(
                "INSERT OR REPLACE INTO \"{}\" ({}) VALUES ({})",
                table, col_list, placeholders
            );
            let mut stmt = tx.prepare(&sql).map_err(|e| e.to_string())?;
            for row in rows {
                let arr = row
                    .as_array()
                    .ok_or(format!("Bad row in table '{}'", table))?;
                let params: Vec<rusqlite::types::Value> = usable
                    .iter()
                    .map(|(i, _)| backup_json_to_value(arr.get(*i).unwrap_or(&serde_json::Value::Null)))
                    .collect();
                stmt.execute(rusqlite::params_from_iter(params.iter()))
                    .map_err(|e| format!("Table '{}': {}", table, e))?;
                rows_written += 1;
            }
            tables_done += 1;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok((tables_done, rows_written, notes))
    })();

    if fk_was_on != 0 {
        let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
    }

    let (tables_done, rows_written, notes) = result?;
    let mut msg = format!("{} rows restored across {} tables", rows_written, tables_done);
    if !notes.is_empty() {
        msg.push_str(&format!(". Notes: {}", notes.join("; ")));
    }
    Ok(msg)
}

#[tauri::command]
fn export_assets_backup() -> Result<String, String> {
    let conn = get_connection()?;

    let mut asset_stmt = conn.prepare(
        "SELECT id, asset_code, asset_description, country, service_line, active, service_asset, vehicle, mr_last_action, last_action_by, last_action_dt, asset_type_id, client FROM assets"
    ).map_err(|e| e.to_string())?;
    let assets: Vec<serde_json::Value> = asset_stmt
        .query_map([], |row| {
            let asset_type_id: Option<i64> = row.get(11)?;
            Ok(serde_json::json!({
                "asset_code": row.get::<_, String>(1)?,
                "asset_description": row.get::<_, String>(2)?,
                "country": row.get::<_, String>(3)?,
                "service_line": row.get::<_, String>(4)?,
                "active": row.get::<_, i32>(5)? != 0,
                "service_asset": row.get::<_, i32>(6)? != 0,
                "vehicle": row.get::<_, i32>(7)? != 0,
                "mr_last_action": row.get::<_, String>(8)?,
                "last_action_by": row.get::<_, String>(9)?,
                "last_action_dt": row.get::<_, String>(10)?,
                "asset_type_id": asset_type_id,
                "client": row.get::<_, String>(12)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut trigger_stmt = conn.prepare(
        "SELECT a.asset_code, t.mr_level, t.trigger_type, t.enabled, t.interval_value, t.warning_value, t.running_value, t.tally_value
         FROM maintenance_triggers t JOIN assets a ON t.asset_id = a.id"
    ).map_err(|e| e.to_string())?;
    let triggers: Vec<serde_json::Value> = trigger_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "asset_code": row.get::<_, String>(0)?,
                "mr_level": row.get::<_, String>(1)?,
                "trigger_type": row.get::<_, String>(2)?,
                "enabled": row.get::<_, i32>(3)? != 0,
                "interval_value": row.get::<_, i64>(4)?,
                "warning_value": row.get::<_, i64>(5)?,
                "running_value": row.get::<_, i64>(6)?,
                "tally_value": row.get::<_, i64>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let backup = serde_json::json!({
        "backup_type": "assets",
        "version": 1,
        "assets": assets,
        "triggers": triggers,
    });

    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_assets_backup(backup_json: String) -> Result<String, String> {
    let conn = get_connection()?;
    let backup: serde_json::Value =
        serde_json::from_str(&backup_json).map_err(|e| e.to_string())?;

    let assets = backup["assets"]
        .as_array()
        .ok_or("Missing 'assets' array in backup file")?;
    let triggers = backup["triggers"]
        .as_array()
        .ok_or("Missing 'triggers' array in backup file")?;

    let mut added = 0;
    let mut skipped = 0;

    for a in assets {
        let asset_code = a["asset_code"].as_str().unwrap_or("").to_string();
        if asset_code.is_empty() {
            skipped += 1;
            continue;
        }

        let existing: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM assets WHERE asset_code = ?1",
                [&asset_code],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if existing > 0 {
            skipped += 1;
            continue;
        }

        conn.execute(
            "INSERT INTO assets (asset_code, asset_description, country, service_line, active, service_asset, vehicle, mr_last_action, last_action_by, last_action_dt, asset_type_id, client)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                asset_code,
                a["asset_description"].as_str().unwrap_or(""),
                a["country"].as_str().unwrap_or(""),
                a["service_line"].as_str().unwrap_or(""),
                a["active"].as_bool().unwrap_or(true) as i32,
                a["service_asset"].as_bool().unwrap_or(true) as i32,
                a["vehicle"].as_bool().unwrap_or(false) as i32,
                a["mr_last_action"].as_str().unwrap_or("ENROLLMENT"),
                a["last_action_by"].as_str().unwrap_or(""),
                a["last_action_dt"].as_str().unwrap_or(""),
                a["asset_type_id"].as_i64(),
                a["client"].as_str().unwrap_or(""),
            ],
        ).map_err(|e| e.to_string())?;

        let new_asset_id = conn.last_insert_rowid();
        seed_triggers(&conn, new_asset_id)?;

        for t in triggers
            .iter()
            .filter(|t| t["asset_code"].as_str() == Some(asset_code.as_str()))
        {
            conn.execute(
                "UPDATE maintenance_triggers SET enabled = ?1, interval_value = ?2, warning_value = ?3, running_value = ?4, tally_value = ?5
                 WHERE asset_id = ?6 AND mr_level = ?7 AND trigger_type = ?8",
                rusqlite::params![
                    t["enabled"].as_bool().unwrap_or(false) as i32,
                    t["interval_value"].as_i64().unwrap_or(0),
                    t["warning_value"].as_i64().unwrap_or(0),
                    t["running_value"].as_i64().unwrap_or(0),
                    t["tally_value"].as_i64().unwrap_or(0),
                    new_asset_id,
                    t["mr_level"].as_str().unwrap_or(""),
                    t["trigger_type"].as_str().unwrap_or(""),
                ],
            ).map_err(|e| e.to_string())?;
        }

        added += 1;
    }

    Ok(format!(
        "{} assets restored, {} skipped (already existed)",
        added, skipped
    ))
}

// --- Reference data purging (skip rows still in use, report what happened) ---

#[tauri::command]
fn purge_asset_types() -> Result<String, String> {
    let conn = get_connection()?;
    let mut purged = 0;
    let mut skipped = 0;
    let mut stmt = conn
        .prepare("SELECT id FROM asset_types")
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for id in ids {
        match conn.execute("DELETE FROM asset_types WHERE id = ?1", [id]) {
            Ok(_) => purged += 1,
            Err(_) => skipped += 1,
        }
    }
    Ok(format!(
        "{} asset types purged, {} skipped (still in use by assets or templates)",
        purged, skipped
    ))
}

#[tauri::command]
fn purge_checklist_sections() -> Result<String, String> {
    let conn = get_connection()?;
    let mut purged = 0;
    let mut skipped = 0;
    let mut stmt = conn
        .prepare("SELECT id FROM checklist_sections")
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for id in ids {
        match conn.execute("DELETE FROM checklist_sections WHERE id = ?1", [id]) {
            Ok(_) => purged += 1,
            Err(_) => skipped += 1,
        }
    }
    Ok(format!(
        "{} sections purged, {} skipped (still in use by templates)",
        purged, skipped
    ))
}

#[tauri::command]
fn purge_checklist_databank() -> Result<String, String> {
    let conn = get_connection()?;
    let mut purged = 0;
    let mut skipped = 0;
    let mut stmt = conn
        .prepare("SELECT id FROM checklist_databank")
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for id in ids {
        match conn.execute("DELETE FROM checklist_databank WHERE id = ?1", [id]) {
            Ok(_) => purged += 1,
            Err(_) => skipped += 1,
        }
    }
    Ok(format!(
        "{} checklist items purged, {} skipped (still in use by templates)",
        purged, skipped
    ))
}

#[tauri::command]
fn purge_lookups(criteria: Option<String>) -> Result<String, String> {
    let conn = get_connection()?;
    let count: i64 = match &criteria {
        Some(c) => conn
            .execute("DELETE FROM lookups WHERE criteria = ?1", [c])
            .map_err(|e| e.to_string())? as i64,
        None => conn
            .execute("DELETE FROM lookups", [])
            .map_err(|e| e.to_string())? as i64,
    };
    Ok(format!("{} lookup values purged", count))
}

// --- MR-I report purging (filtered by asset attributes, with preview) ---

fn build_report_filter_sql(
    asset_id: Option<i64>,
    country: &Option<String>,
    service_line: &Option<String>,
    asset_type_id: Option<i64>,
) -> (String, Vec<Box<dyn rusqlite::ToSql>>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(id) = asset_id {
        clauses.push(format!("a.id = ?{}", params.len() + 1));
        params.push(Box::new(id));
    }
    if let Some(c) = country {
        clauses.push(format!("a.country = ?{}", params.len() + 1));
        params.push(Box::new(c.clone()));
    }
    if let Some(sl) = service_line {
        clauses.push(format!("a.service_line = ?{}", params.len() + 1));
        params.push(Box::new(sl.clone()));
    }
    if let Some(atid) = asset_type_id {
        clauses.push(format!("a.asset_type_id = ?{}", params.len() + 1));
        params.push(Box::new(atid));
    }

    let where_sql = if clauses.is_empty() {
        "1=1".to_string()
    } else {
        clauses.join(" AND ")
    };
    (where_sql, params)
}

#[derive(Serialize, Deserialize)]
struct MriReportPurgeFilter {
    asset_id: Option<i64>,
    country: Option<String>,
    service_line: Option<String>,
    asset_type_id: Option<i64>,
}

#[tauri::command]
fn preview_mri_report_purge(filter: MriReportPurgeFilter) -> Result<i64, String> {
    let conn = get_connection()?;
    let (where_sql, params) = build_report_filter_sql(
        filter.asset_id,
        &filter.country,
        &filter.service_line,
        filter.asset_type_id,
    );
    // LEFT JOIN so reports whose asset no longer exists (or has a null asset_id)
    // are still counted/purgeable when no asset-specific filter is applied,
    // instead of silently surviving every purge forever.
    let sql = format!(
        "SELECT COUNT(*) FROM mri_reports r LEFT JOIN assets a ON r.asset_id = a.id WHERE {}",
        where_sql
    );
    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let count: i64 = conn
        .query_row(&sql, params_refs.as_slice(), |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
fn purge_mri_reports(filter: MriReportPurgeFilter) -> Result<String, String> {
    let conn = get_connection()?;
    let (where_sql, params) = build_report_filter_sql(
        filter.asset_id,
        &filter.country,
        &filter.service_line,
        filter.asset_type_id,
    );
    // LEFT JOIN so reports whose asset no longer exists (or has a null asset_id)
    // are still selected for deletion when no asset-specific filter is applied.
    let select_sql = format!(
        "SELECT r.id FROM mri_reports r LEFT JOIN assets a ON r.asset_id = a.id WHERE {}",
        where_sql
    );
    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&select_sql).map_err(|e| e.to_string())?;
    let report_ids: Vec<i64> = stmt
        .query_map(params_refs.as_slice(), |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let count = report_ids.len();
    for id in &report_ids {
        // Clear any dangling carryforward links pointing INTO a report we're about to
        // delete, so a surviving fault approval never references a purged report.
        conn.execute(
            "UPDATE mri_fault_approvals SET carried_to_report_id = NULL WHERE carried_to_report_id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
        // Fault Review data (Pending Approvals / Awaiting Confirmation / Rectification
        // Queue) is keyed off report_id and must be purged alongside the report itself,
        // or the drawer keeps showing counts for reports that no longer exist.
        conn.execute(
            "DELETE FROM mri_fault_rectifications WHERE fault_approval_id IN (SELECT id FROM mri_fault_approvals WHERE report_id = ?1)",
            [id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM mri_fault_approvals WHERE report_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM mri_report_header_values WHERE report_id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM mri_report_checklist_results WHERE report_id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM mri_checklist_action_log WHERE report_id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM mri_report_mid_values WHERE report_id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM mri_report_footer_values WHERE report_id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM mri_report_attachments WHERE report_id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM mri_reports WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
    }

    Ok(format!(
        "{} MR-I report(s) purged, including all associated header/checklist/mid/footer/attachment data",
        count
    ))
}

#[tauri::command]
fn get_pending_checklist_item_ids(
    asset_id: i64,
    current_report_id: i64,
) -> Result<Vec<i64>, String> {
    let conn = get_connection()?;
    // Only the MOST RECENT other report's result for a checklist item decides whether
    // it carries forward -- an older Fail+Pending row must not "leak" through and
    // re-carry an item that a later report already Closed (or Passed). Without the
    // inner subquery pinning rep.id to that latest occurrence, this used to match ANY
    // historical Fail+Pending row regardless of what happened to the item since.
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT tci.checklist_item_id
         FROM mri_report_checklist_results r
         JOIN mri_reports rep ON r.report_id = rep.id
         JOIN template_checklist_items tci ON r.template_checklist_item_id = tci.id
         WHERE rep.asset_id = ?1 AND rep.id != ?2 AND r.status = 'Fail' AND r.closure_status = 'Pending'
           AND rep.id = (
               SELECT rep2.id
               FROM mri_report_checklist_results r2
               JOIN mri_reports rep2 ON r2.report_id = rep2.id
               JOIN template_checklist_items tci2 ON r2.template_checklist_item_id = tci2.id
               WHERE rep2.asset_id = ?1 AND rep2.id != ?2
                 AND tci2.checklist_item_id = tci.checklist_item_id
               ORDER BY rep2.created_date DESC, rep2.id DESC
               LIMIT 1
           )",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map(rusqlite::params![asset_id, current_report_id], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(ids)
}

// Read-only history: the MOST RECENT other report's result for a checklist item, if
// that latest occurrence is Fail and hasn't been BOTH closed AND signed off (i.e. it
// keeps surfacing here unless closure_status = 'Closed' AND the source report itself
// has reached 'Approved'). A closed item on a report still in Draft/Submitted/Escalated
// is not final yet, so it still forwards. The inner subquery pins each checklist item
// to its single latest occurrence -- without it, an old Fail+Pending row would keep
// matching even after a later report Closed and Approved that same item, since it's a
// separate row that the plain WHERE clause alone can't tell is stale. This is
// intentionally query-derived rather than a stored link column -- it's always correct
// off of closure_status/report status directly, with no separate state to keep in sync
// or go stale (see the purge/orphaned-drawer-data bug from a few days ago for why a
// stored pointer would be the wrong call here).
#[derive(Serialize, Deserialize)]
struct OpenPriorIssueRow {
    id: i64,
    report_id: i64,
    checklist_description: Option<String>,
    severity: Option<String>,
    issue_details: Option<String>,
    action_taken: Option<String>,
    date_observed: Option<String>,
}

#[tauri::command]
fn get_open_prior_issues(
    asset_id: i64,
    current_report_id: i64,
) -> Result<Vec<OpenPriorIssueRow>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT r.id, r.report_id, cd.description, r.severity, r.issue_details, r.action_taken, r.date_observed
         FROM mri_report_checklist_results r
         JOIN mri_reports rep ON r.report_id = rep.id
         JOIN template_checklist_items tci ON r.template_checklist_item_id = tci.id
         LEFT JOIN checklist_databank cd ON tci.checklist_item_id = cd.id
         WHERE rep.asset_id = ?1 AND rep.id != ?2 AND r.status = 'Fail'
           AND NOT (r.closure_status = 'Closed' AND rep.status = 'Approved')
           AND rep.id = (
               SELECT rep2.id
               FROM mri_report_checklist_results r2
               JOIN mri_reports rep2 ON r2.report_id = rep2.id
               JOIN template_checklist_items tci2 ON r2.template_checklist_item_id = tci2.id
               WHERE rep2.asset_id = ?1 AND rep2.id != ?2
                 AND tci2.checklist_item_id = tci.checklist_item_id
               ORDER BY rep2.created_date DESC, rep2.id DESC
               LIMIT 1
           )
         ORDER BY r.date_observed DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![asset_id, current_report_id], |row| {
            Ok(OpenPriorIssueRow {
                id: row.get(0)?,
                report_id: row.get(1)?,
                checklist_description: row.get(2)?,
                severity: row.get(3)?,
                issue_details: row.get(4)?,
                action_taken: row.get(5)?,
                date_observed: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(Serialize, Deserialize)]
struct IconSearchResult {
    icons: Vec<String>,
}

#[tauri::command]
async fn search_icons(query: String) -> Result<Vec<String>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    let url = format!(
        "https://api.iconify.design/search?query={}&limit=48",
        urlencoding::encode(trimmed)
    );
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let result: IconSearchResult = resp.json().await.map_err(|e| e.to_string())?;
    Ok(result.icons)
}

#[tauri::command]
async fn fetch_icon_svg(icon_id: String) -> Result<String, String> {
    // icon_id comes as "prefix:name" from the search results
    let parts: Vec<&str> = icon_id.splitn(2, ':').collect();
    if parts.len() != 2 {
        return Err("Invalid icon id".to_string());
    }
    let url = format!("https://api.iconify.design/{}/{}.svg", parts[0], parts[1]);
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let svg = resp.text().await.map_err(|e| e.to_string())?;
    Ok(svg)
}

#[tauri::command]
fn get_assets_with_pending_issues() -> Result<Vec<i64>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT rep.asset_id
         FROM mri_report_checklist_results r
         JOIN mri_reports rep ON r.report_id = rep.id
         WHERE r.closure_status = 'Pending' AND r.status = 'Fail'",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(ids)
}

// Powers the Dashboard's MR-I equipment history view: one card per asset with how many
// MR-I reports it has and its most recent report's status/date, regardless of status --
// unlike get_reports_needing_supervisor_action this deliberately includes every asset,
// even ones with zero reports, so users can see what's never been inspected too.
#[derive(Serialize, Deserialize)]
struct AssetMriHistorySummaryRow {
    asset_id: i64,
    asset_code: String,
    asset_description: Option<String>,
    report_count: i64,
    latest_status: Option<String>,
    latest_report_id: Option<i64>,
    latest_date: Option<String>,
}

#[tauri::command]
fn get_assets_with_mri_history_summary() -> Result<Vec<AssetMriHistorySummaryRow>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.asset_code, a.asset_description,
                (SELECT COUNT(*) FROM mri_reports r WHERE r.asset_id = a.id) AS report_count,
                lr.status, lr.id, lr.created_date
         FROM assets a
         LEFT JOIN mri_reports lr ON lr.id = (
             SELECT id FROM mri_reports WHERE asset_id = a.id ORDER BY id DESC LIMIT 1
         )
         ORDER BY a.asset_code",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(AssetMriHistorySummaryRow {
                asset_id: row.get(0)?,
                asset_code: row.get(1)?,
                asset_description: row.get(2)?,
                report_count: row.get(3)?,
                latest_status: row.get(4)?,
                latest_report_id: row.get(5)?,
                latest_date: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// The full MR-I report history for one asset, across every status (Draft through
// Approved) -- unlike the Reports to Review / My Reports queues, which only surface
// reports still needing action. Newest first.
#[derive(Serialize, Deserialize)]
struct MriHistoryRow {
    id: i64,
    status: String,
    submitted_by: Option<String>,
    submitted_date: Option<String>,
    approved_by: Option<String>,
    approved_date: Option<String>,
    created_date: String,
    issue_count: i64,
    km_reading: Option<f64>,
    oh_reading: Option<f64>,
    eh_reading: Option<f64>,
    key_issues: Vec<String>,
    compliance_stage: Option<String>,
    component_label: Option<String>,
}

#[tauri::command]
fn get_asset_mri_history(asset_id: i64) -> Result<Vec<MriHistoryRow>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT r.id, r.status, r.submitted_by, r.submitted_date, r.approved_by, r.approved_date, r.created_date,
                (SELECT COUNT(*) FROM mri_report_checklist_results WHERE report_id = r.id AND status = 'Fail') AS issue_count,
                c.label
         FROM mri_reports r
         LEFT JOIN template_components c ON c.id = r.component_id
         WHERE r.asset_id = ?1
         ORDER BY r.id DESC",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map([asset_id], |row| {
            Ok(MriHistoryRow {
                id: row.get(0)?,
                status: row.get(1)?,
                submitted_by: row.get(2)?,
                submitted_date: row.get(3)?,
                approved_by: row.get(4)?,
                approved_date: row.get(5)?,
                created_date: row.get(6)?,
                issue_count: row.get(7)?,
                km_reading: None,
                oh_reading: None,
                eh_reading: None,
                key_issues: Vec::new(),
                compliance_stage: None,
                component_label: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    // Non-blocking: fill in whichever readings each report actually recorded, same
    // Post-Job-preferred/Pre-Job-fallback rule used for the KM trigger sync.
    for row in rows.iter_mut() {
        row.km_reading = parse_numeric_reading(
            get_mid_field_value(&conn, row.id, "Distance Travelled Post-Job (KM)")
                .or_else(|| get_mid_field_value(&conn, row.id, "Distance Travelled Pre-Job (KM)")),
        );
        row.oh_reading = parse_numeric_reading(get_header_field_value(&conn, row.id, "Job Operating Hours"));
        row.eh_reading = parse_numeric_reading(get_header_field_value(&conn, row.id, "Engine Hours (This Report)"));
        row.key_issues = get_key_issues_for_report(&conn, row.id);
        row.compliance_stage = get_compliance_stage(&conn, row.id);
    }

    Ok(rows)
}

#[derive(Serialize, Deserialize)]
struct AppUser {
    id: i64,
    name: String,
    email: String,
    role: String,
    active: bool,
    created_date: String,
    updated_date: String,
}

#[tauri::command]
fn get_app_users() -> Result<Vec<AppUser>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, email, role, active, created_date, updated_date FROM app_users ORDER BY name"
    ).map_err(|e| e.to_string())?;
    let users = stmt
        .query_map([], |row| {
            Ok(AppUser {
                id: row.get(0)?,
                name: row.get(1)?,
                email: row.get(2)?,
                role: row.get(3)?,
                active: row.get::<_, i32>(4)? != 0,
                created_date: row.get(5)?,
                updated_date: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(users)
}

// Empties the user table only: users, their permission overrides and their country scoping.
// Role defaults, assets, templates, reports and faults are left alone (names stored on
// reports stay as text; fault assignees that pointed at a deleted user simply become unset
// in the UI). The app then shows the create-first-Administrator screen.
#[tauri::command]
fn clear_all_users() -> Result<String, String> {
    let conn = get_connection()?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let overrides = tx
        .execute("DELETE FROM user_permission_overrides", [])
        .map_err(|e| e.to_string())?;
    let countries = tx
        .execute("DELETE FROM user_country_access", [])
        .map_err(|e| e.to_string())?;
    let users = tx
        .execute("DELETE FROM app_users", [])
        .map_err(|e| e.to_string())?;
    let _ = tx.execute("DELETE FROM sqlite_sequence WHERE name = 'app_users'", []);
    tx.commit().map_err(|e| e.to_string())?;
    Ok(format!(
        "{} users cleared ({} permission overrides, {} country rows)",
        users, overrides, countries
    ))
}

#[derive(Serialize, Deserialize)]
struct NewAppUser {
    name: String,
    email: String,
    role: String,
}

#[tauri::command]
fn create_app_user(user: NewAppUser) -> Result<String, String> {
    let conn = get_connection()?;
    let name = user.name.trim();
    let email = user.email.trim();
    if name.is_empty() || email.is_empty() {
        return Err("Name and email cannot be empty".to_string());
    }
    let existing: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM app_users WHERE email = ?1",
            [email],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err(format!("A user with email '{}' already exists", email));
    }
    let now = chrono_now();
    conn.execute(
        "INSERT INTO app_users (name, email, role, active, created_date, updated_date) VALUES (?1, ?2, ?3, 1, ?4, ?4)",
        rusqlite::params![name, email, user.role, now],
    ).map_err(|e| e.to_string())?;
    Ok("User created".to_string())
}

#[tauri::command]
fn update_app_user(
    id: i64,
    name: String,
    email: String,
    role: String,
    active: bool,
) -> Result<String, String> {
    let conn = get_connection()?;
    let name = name.trim();
    let email = email.trim();
    if name.is_empty() || email.is_empty() {
        return Err("Name and email cannot be empty".to_string());
    }
    let now = chrono_now();
    conn.execute(
        "UPDATE app_users SET name = ?1, email = ?2, role = ?3, active = ?4, updated_date = ?5 WHERE id = ?6",
        rusqlite::params![name, email, role, active as i32, now, id],
    ).map_err(|e| e.to_string())?;
    Ok("User updated".to_string())
}

#[tauri::command]
fn delete_app_user(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "DELETE FROM user_permission_overrides WHERE user_id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM app_users WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("User deleted".to_string())
}

#[derive(Serialize, Deserialize)]
struct Permission {
    id: i64,
    code: String,
    label: String,
    category: String,
}

#[tauri::command]
fn get_permissions() -> Result<Vec<Permission>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT id, code, label, category FROM permissions ORDER BY category, label")
        .map_err(|e| e.to_string())?;
    let perms = stmt
        .query_map([], |row| {
            Ok(Permission {
                id: row.get(0)?,
                code: row.get(1)?,
                label: row.get(2)?,
                category: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(perms)
}

#[tauri::command]
fn get_role_permissions(role: String) -> Result<Vec<String>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT permission_code FROM role_permissions WHERE role = ?1")
        .map_err(|e| e.to_string())?;
    let codes = stmt
        .query_map([role], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(codes)
}

#[tauri::command]
fn set_role_permission(
    role: String,
    permission_code: String,
    granted: bool,
) -> Result<String, String> {
    let conn = get_connection()?;
    if granted {
        conn.execute(
            "INSERT OR IGNORE INTO role_permissions (role, permission_code) VALUES (?1, ?2)",
            rusqlite::params![role, permission_code],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "DELETE FROM role_permissions WHERE role = ?1 AND permission_code = ?2",
            rusqlite::params![role, permission_code],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok("Role permission updated".to_string())
}

#[derive(Serialize, Deserialize)]
struct UserOverride {
    permission_code: String,
    granted: bool,
}

#[tauri::command]
fn get_user_overrides(user_id: i64) -> Result<Vec<UserOverride>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT permission_code, granted FROM user_permission_overrides WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let overrides = stmt
        .query_map([user_id], |row| {
            Ok(UserOverride {
                permission_code: row.get(0)?,
                granted: row.get::<_, i32>(1)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(overrides)
}

#[tauri::command]
fn set_user_override(
    user_id: i64,
    permission_code: String,
    granted: Option<bool>,
) -> Result<String, String> {
    let conn = get_connection()?;
    match granted {
        Some(g) => {
            conn.execute(
                "INSERT INTO user_permission_overrides (user_id, permission_code, granted) VALUES (?1, ?2, ?3)
                 ON CONFLICT(user_id, permission_code) DO UPDATE SET granted = excluded.granted",
                rusqlite::params![user_id, permission_code, g as i32],
            ).map_err(|e| e.to_string())?;
        }
        None => {
            // Clearing the override means "revert to role default"
            conn.execute(
                "DELETE FROM user_permission_overrides WHERE user_id = ?1 AND permission_code = ?2",
                rusqlite::params![user_id, permission_code],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok("User override updated".to_string())
}

// Countries this user is restricted to. An empty result means unrestricted (sees every
// country) -- callers should treat "no rows" and "role is Administrator" identically.
#[tauri::command]
fn get_user_country_access(user_id: i64) -> Result<Vec<String>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT country FROM user_country_access WHERE user_id = ?1 ORDER BY country")
        .map_err(|e| e.to_string())?;
    let countries = stmt
        .query_map([user_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(countries)
}

// Replaces the full set of countries a user is restricted to. Administrator can't be scoped
// at all (always unrestricted); Operator and Job Supervisor may have at most one country at
// a time; Maintenance Supervisor and Maintenance Manager / FSM may have any number.
#[tauri::command]
fn set_user_country_access(user_id: i64, countries: Vec<String>) -> Result<String, String> {
    let conn = get_connection()?;
    let role: String = conn
        .query_row(
            "SELECT role FROM app_users WHERE id = ?1",
            [user_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if role == "Administrator" {
        return Err("Administrator is always unrestricted and cannot be scoped by country".to_string());
    }
    if (role == "Operator" || role == "Job Supervisor") && countries.len() > 1 {
        return Err(format!("{} can only be assigned a single country at a time", role));
    }
    conn.execute("DELETE FROM user_country_access WHERE user_id = ?1", [user_id])
        .map_err(|e| e.to_string())?;
    for country in &countries {
        conn.execute(
            "INSERT INTO user_country_access (user_id, country) VALUES (?1, ?2)",
            rusqlite::params![user_id, country],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok("Country access updated".to_string())
}

#[tauri::command]
fn get_effective_permissions(user_id: i64) -> Result<Vec<String>, String> {
    let conn = get_connection()?;
    let role: String = conn
        .query_row(
            "SELECT role FROM app_users WHERE id = ?1",
            [user_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT permission_code FROM role_permissions WHERE role = ?1")
        .map_err(|e| e.to_string())?;
    let mut effective: std::collections::HashSet<String> = stmt
        .query_map([&role], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<std::collections::HashSet<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut override_stmt = conn
        .prepare(
            "SELECT permission_code, granted FROM user_permission_overrides WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let overrides: Vec<(String, bool)> = override_stmt
        .query_map([user_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)? != 0))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (code, granted) in overrides {
        if granted {
            effective.insert(code);
        } else {
            effective.remove(&code);
        }
    }

    Ok(effective.into_iter().collect())
}

#[tauri::command]
fn get_browsable_tables() -> Vec<String> {
    BROWSABLE_TABLES.iter().map(|s| s.to_string()).collect()
}

#[tauri::command]
fn get_table_columns(table_name: String) -> Result<Vec<String>, String> {
    if !BROWSABLE_TABLES.contains(&table_name.as_str()) {
        return Err("Unknown table".to_string());
    }
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", table_name))
        .map_err(|e| e.to_string())?;
    let cols = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(cols)
}

#[tauri::command]
fn get_table_rows(table_name: String) -> Result<Vec<serde_json::Value>, String> {
    if !BROWSABLE_TABLES.contains(&table_name.as_str()) {
        return Err("Unknown table".to_string());
    }
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM {}", table_name))
        .map_err(|e| e.to_string())?;
    let col_count = stmt.column_count();
    let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let rows = stmt
        .query_map([], |row| {
            let mut map = serde_json::Map::new();
            for i in 0..col_count {
                let val = row.get_ref(i)?;
                map.insert(col_names[i].clone(), sqlite_value_to_json(val));
            }
            Ok(serde_json::Value::Object(map))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
fn update_table_row(
    table_name: String,
    id: i64,
    values: serde_json::Map<String, serde_json::Value>,
) -> Result<String, String> {
    if !BROWSABLE_TABLES.contains(&table_name.as_str()) {
        return Err("Unknown table".to_string());
    }
    let conn = get_connection()?;

    let set_clause: Vec<String> = values
        .keys()
        .filter(|k| k.as_str() != "id")
        .enumerate()
        .map(|(i, k)| format!("{} = ?{}", k, i + 1))
        .collect();
    if set_clause.is_empty() {
        return Err("No fields to update".to_string());
    }

    let sql = format!(
        "UPDATE {} SET {} WHERE id = ?{}",
        table_name,
        set_clause.join(", "),
        set_clause.len() + 1
    );

    let mut params: Vec<Box<dyn rusqlite::ToSql>> = values
        .iter()
        .filter(|(k, _)| k.as_str() != "id")
        .map(|(_, v)| -> Box<dyn rusqlite::ToSql> {
            match v {
                serde_json::Value::Null => Box::new(None::<String>),
                serde_json::Value::Bool(b) => Box::new(*b as i32),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        Box::new(i)
                    } else {
                        Box::new(n.as_f64().unwrap_or(0.0))
                    }
                }
                serde_json::Value::String(s) => Box::new(s.clone()),
                _ => Box::new(None::<String>),
            }
        })
        .collect();
    params.push(Box::new(id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;
    Ok("Row updated".to_string())
}

#[tauri::command]
fn delete_table_row(table_name: String, id: i64) -> Result<String, String> {
    if !BROWSABLE_TABLES.contains(&table_name.as_str()) {
        return Err("Unknown table".to_string());
    }
    let conn = get_connection()?;
    conn.execute(&format!("DELETE FROM {} WHERE id = ?1", table_name), [id])
        .map_err(|e| e.to_string())?;
    Ok("Row deleted".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            create_asset,
            get_assets,
            update_asset,
            delete_asset,
            get_asset_triggers,
            update_trigger,
            reset_trigger_running_values,
            get_checklist_items,
            create_checklist_item,
            update_checklist_item,
            delete_checklist_item,
            bulk_create_checklist_items,
            get_asset_types,
            create_asset_type,
            update_asset_type,
            delete_asset_type,
            bulk_create_asset_types,
            get_checklist_sections,
            create_checklist_section,
            update_checklist_section,
            delete_checklist_section,
            bulk_create_checklist_sections,
            get_header_fields,
            add_header_field,
            get_mid_fields,
            add_mid_field,
            get_footer_fields,
            add_footer_field,
            get_mri_templates,
            create_mri_template,
            update_mri_template_status,
            rename_mri_template,
            delete_mri_template,
            get_template_header_fields,
            add_template_header_field,
            remove_template_header_field,
            update_template_header_field,
            get_template_checklist_items,
            add_template_checklist_item,
            remove_template_checklist_item,
            update_template_checklist_item,
            get_template_drawing,
            set_template_drawing,
            delete_template_drawing,
            get_template_drawing_hotspots,
            create_hotspot,
            update_hotspot,
            delete_hotspot,
            set_hotspot_checklist_items,
            get_template_mid_fields,
            add_template_mid_field,
            remove_template_mid_field,
            get_template_footer_fields,
            add_template_footer_field,
            remove_template_footer_field,
            get_browsable_tables,
            get_table_columns,
            get_table_rows,
            update_table_row,
            delete_table_row,
            get_mri_reports,
            get_mri_report,
            get_report_flow,
            get_asset_flow,
            create_mri_report,
            delete_mri_report,
            submit_mri_report,
            set_mri_report_status,
            get_mri_report_header_values,
            set_mri_report_header_value,
            get_mri_report_checklist_results,
            set_mri_report_checklist_result,
            get_mri_checklist_history,
            add_mri_checklist_action,
            get_mri_checklist_actions,
            get_mri_checklist_action_history,
            get_mri_report_mid_values,
            set_mri_report_mid_value,
            get_mri_report_footer_values,
            set_mri_report_footer_value,
            get_mri_report_attachments,
            add_mri_report_attachment,
            delete_mri_report_attachment,
            get_lookup_criteria,
            get_lookups,
            create_lookup,
            update_lookup,
            delete_lookup,
            bulk_create_lookups,
            rename_lookup_criteria,
            delete_lookup_criteria,
            get_previous_engine_hours,
            get_previous_compliance_stage,
            delete_last_mri_report,
            export_assets_backup,
            export_full_backup,
            import_full_backup,
            import_assets_backup,
            export_mri_templates_backup,
            import_mri_templates_backup,
            purge_asset_types,
            purge_checklist_sections,
            purge_checklist_databank,
            purge_lookups,
            preview_mri_report_purge,
            purge_mri_reports,
            get_pending_checklist_item_ids,
            get_open_prior_issues,
            search_icons,
            fetch_icon_svg,
            get_assets_with_pending_issues,
            get_assets_with_mri_history_summary,
            get_asset_mri_history,
            get_app_users,
            create_app_user,
            update_app_user,
            delete_app_user,
            clear_all_users,
            get_permissions,
            get_role_permissions,
            set_role_permission,
            get_user_overrides,
            set_user_override,
            get_user_country_access,
            set_user_country_access,
            get_effective_permissions,
            get_mri_fault_approvals,
            ensure_mri_fault_approval,
            endorse_mri_report,
            close_mri_report,
            review_and_close_mri_report,
            get_reports_needing_supervisor_action,
            get_reports_awaiting_cost,
            set_mri_report_cost,
            get_my_open_mri_reports,
            set_mri_fault_approval_decision,
            get_pending_mri_fault_approvals,
            confirm_provisional_approval,
            get_provisional_mri_fault_approvals,
            get_mri_fault_rectifications,
            get_pending_mri_fault_rectifications,
            get_asset_tag_history,
            create_moc_exemption,
            revoke_moc_exemption,
            get_moc_exemptions,
            get_template_components,
            get_all_template_components,
            create_template_component,
            rename_template_component,
            set_template_component_active,
            delete_template_component,
            update_mri_fault_rectification,
            verify_mri_fault_rectification,
            get_carried_forward_faults,
            get_assignable_mri_reviewers,
            send_fault_reminder,
            get_mri_fault_decision_log,
            get_last_post_job_info,
            create_mri_report_from_last_post_job,
            get_standby_prejob_reminders,
            record_equipment_limitations,
            set_open_job_numbers,
            check_job_number,
            set_job_number_verification,
            get_job_number_flags,
            get_mri_fault_decisions_pending_acknowledgment,
            acknowledge_mri_fault_decision
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
