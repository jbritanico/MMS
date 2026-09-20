use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const BROWSABLE_TABLES: [&str; 24] = [
    "assets",
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

fn get_connection() -> Result<Connection, String> {
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
    }

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
            FOREIGN KEY (asset_id) REFERENCES assets(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

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

    Ok(conn)
}

fn seed_permissions(conn: &Connection) -> Result<(), String> {
    let perms: [(&str, &str, &str); 24] = [
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
            "Acknowledge critical defects",
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
        return Ok(());
    }

    let role_defaults: [(&str, &[&str]); 6] = [
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
                "mri.record_provisional",
                "mri.endorse_report",
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
                "mri.confirm_provisional",
                "mri.endorse_report",
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
                "mri.edit_after_submit",
                "mri.close_defect",
                "mri.approve",
                "mri.acknowledge_critical",
                "mri.rectify",
                "mri.confirm_provisional",
                "mri.record_provisional",
                "mri.endorse_report",
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
            conn.execute(
                "INSERT INTO maintenance_triggers (asset_id, mr_level, trigger_type) VALUES (?1, ?2, ?3)",
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
    let mut stmt = conn.prepare("SELECT id, asset_code, asset_description, country, service_line, active, service_asset, vehicle, mr_last_action, last_action_by, last_action_dt, asset_type_id, client, tag_status FROM assets")
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

#[tauri::command]
fn delete_asset(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM maintenance_triggers WHERE asset_id=?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM assets WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Asset deleted".to_string())
}

#[tauri::command]
fn get_asset_triggers(asset_id: i64) -> Result<Vec<Trigger>, String> {
    let conn = get_connection()?;
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

    delete_template_drawing(id)?;

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
}

#[tauri::command]
fn get_mri_reports() -> Result<Vec<MriReport>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, template_id, asset_id, status, submitted_by, submitted_date, approved_by, approved_date, created_date
         FROM mri_reports ORDER BY created_date DESC"
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
        "SELECT id, template_id, asset_id, status, submitted_by, submitted_date, approved_by, approved_date, created_date
         FROM mri_reports WHERE id = ?1",
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
        }),
    ).map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize)]
struct NewMriReport {
    template_id: i64,
    asset_id: i64,
}

#[tauri::command]
fn create_mri_report(report: NewMriReport) -> Result<i64, String> {
    let conn = get_connection()?;

    // Reuse an existing Draft for this asset+template if one already exists
    let existing_draft: Option<i64> = conn.query_row(
        "SELECT id FROM mri_reports WHERE asset_id = ?1 AND template_id = ?2 AND status = 'Draft'",
        rusqlite::params![report.asset_id, report.template_id],
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
                 WHERE asset_id = ?1 AND status NOT IN ('Draft', 'Approved')
                 LIMIT 1",
                [report.asset_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        if let Some((pending_id, pending_status)) = blocking {
            return Err(format!(
                "Report #{} for this asset is still {} — it must be endorsed and closed before a new MR-I report can be started for this asset.",
                pending_id, pending_status
            ));
        }

        let now = chrono_now();
        conn.execute(
            "INSERT INTO mri_reports (template_id, asset_id, status, created_date) VALUES (?1, ?2, 'Draft', ?3)",
            rusqlite::params![report.template_id, report.asset_id, now],
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
               WHERE asset_id = ?2 AND template_id = ?3 AND id != ?1
           )",
        rusqlite::params![report_id, report.asset_id, report.template_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(report_id)
}

#[tauri::command]
fn delete_mri_report(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM mri_reports WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Report deleted".to_string())
}

#[tauri::command]
fn submit_mri_report(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    let now = chrono_now();
    conn.execute(
        "UPDATE mri_reports SET status = 'Submitted', submitted_by = 'local user', submitted_date = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    ).map_err(|e| e.to_string())?;
    Ok("Report submitted".to_string())
}

#[tauri::command]
fn set_mri_report_status(id: i64, status: String) -> Result<String, String> {
    let conn = get_connection()?;
    let status = status.trim();
    if !valid_report_status(status) {
        return Err(format!("Invalid status '{}'", status));
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
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO mri_report_header_values (report_id, template_header_field_id, value)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(report_id, template_header_field_id) DO UPDATE SET value = excluded.value",
        rusqlite::params![report_id, template_header_field_id, value],
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
}

#[tauri::command]
fn get_mri_report_checklist_results(
    report_id: i64,
) -> Result<Vec<MriReportChecklistResult>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, report_id, template_checklist_item_id, status, severity, issue_details, action_taken, date_observed, closure_status
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
                "Invalid severity '{}' — must be Minor, Moderate, Major, or Critical",
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

    conn.execute(
        "INSERT INTO mri_report_checklist_results (report_id, template_checklist_item_id, status, severity, issue_details, action_taken, date_observed, closure_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(report_id, template_checklist_item_id) DO UPDATE SET
            status = excluded.status,
            severity = excluded.severity,
            issue_details = excluded.issue_details,
            action_taken = excluded.action_taken,
            date_observed = excluded.date_observed,
            closure_status = excluded.closure_status",
        rusqlite::params![
            result.report_id, result.template_checklist_item_id, result.status, result.severity,
            result.issue_details, result.action_taken, result.date_observed, result.closure_status
        ],
    ).map_err(|e| e.to_string())?;
    Ok("Checklist result saved".to_string())
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
fn endorse_mri_report(report_id: i64, endorsed_by: String) -> Result<String, String> {
    let conn = get_connection()?;
    let endorsed_by = endorsed_by.trim();
    if endorsed_by.is_empty() {
        return Err("Endorsed-by name is required".to_string());
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
             WHERE report_id = ?1 AND status = 'Fail' AND severity IN ('Moderate', 'Critical')",
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
                    "INSERT INTO mri_fault_approvals (report_id, template_checklist_item_id, original_severity, decision, created_date, updated_date)
                     VALUES (?1, ?2, ?3, 'Pending', ?4, ?4)",
                    rusqlite::params![report_id, template_checklist_item_id, severity, now],
                ).map_err(|e| e.to_string())?;
            }
            Some(decision) if decision == "Pending" => {
                conn.execute(
                    "UPDATE mri_fault_approvals SET original_severity = ?1, updated_date = ?2 WHERE report_id = ?3 AND template_checklist_item_id = ?4",
                    rusqlite::params![severity, now, report_id, template_checklist_item_id],
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
            "SELECT COUNT(*) FROM mri_report_checklist_results WHERE report_id = ?1 AND status = 'Fail' AND severity IN ('Moderate', 'Critical')",
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
    Ok("Report reviewed and closed".to_string())
}

// Explicit closure step — deliberately separate from endorse_mri_report so nothing
// closes automatically. Valid from 'Endorsed' (Minor-only, already reviewed) directly,
// or from 'Escalated' once every fault on the report has been resolved: reviewed
// (decision no longer 'Pending') and, for any that stayed Critical, rectified and
// verified (tag_status no longer 'Red').
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
                 LEFT JOIN mri_fault_rectifications rec ON rec.fault_approval_id = fa.id
                 WHERE fa.report_id = ?1
                   AND (fa.decision = 'Pending' OR rec.tag_status = 'Red')",
                [report_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if still_open > 0 {
            return Err(format!(
                "{} escalated fault(s) on this report are still unresolved — they must be reviewed (and, if Critical, rectified and verified) before the report can be closed.",
                still_open
            ));
        }
    } else if status != "Endorsed" {
        return Err(format!(
            "Report must be Endorsed, or Escalated with everything resolved, before it can be closed (current status: {})",
            status
        ));
    }

    let now = chrono_now();
    conn.execute(
        "UPDATE mri_reports SET status = 'Approved', approved_by = ?1, approved_date = ?2 WHERE id = ?3",
        rusqlite::params![closed_by, now, report_id],
    )
    .map_err(|e| e.to_string())?;

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
    submitted_by: Option<String>,
    submitted_date: Option<String>,
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
            "SELECT r.id, r.status, a.asset_code, r.submitted_by, r.submitted_date, a.country
             FROM mri_reports r
             JOIN assets a ON a.id = r.asset_id
             WHERE r.status = 'Submitted'
                OR r.status = 'Endorsed'
                OR (r.status = 'Escalated' AND NOT EXISTS (
                    SELECT 1 FROM mri_fault_approvals fa
                    LEFT JOIN mri_fault_rectifications rec ON rec.fault_approval_id = fa.id
                    WHERE fa.report_id = r.id
                      AND (fa.decision = 'Pending' OR rec.tag_status = 'Red')
                ))
             ORDER BY r.submitted_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<ReportNeedingActionRow> = stmt
        .query_map([], |row| {
            let country: Option<String> = row.get(5)?;
            Ok((
                ReportNeedingActionRow {
                    id: row.get(0)?,
                    status: row.get(1)?,
                    asset_code: row.get(2)?,
                    submitted_by: row.get(3)?,
                    submitted_date: row.get(4)?,
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
// theirs to see the status of.
#[tauri::command]
fn get_my_open_mri_reports(submitted_by: String) -> Result<Vec<ReportNeedingActionRow>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT r.id, r.status, a.asset_code, r.submitted_by, r.submitted_date
             FROM mri_reports r
             JOIN assets a ON a.id = r.asset_id
             WHERE r.submitted_by = ?1 AND r.status != 'Approved'
             ORDER BY r.submitted_date DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<ReportNeedingActionRow> = stmt
        .query_map([submitted_by], |row| {
            Ok(ReportNeedingActionRow {
                id: row.get(0)?,
                status: row.get(1)?,
                asset_code: row.get(2)?,
                submitted_by: row.get(3)?,
                submitted_date: row.get(4)?,
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
}

#[tauri::command]
fn get_pending_mri_fault_approvals(viewer_user_id: i64) -> Result<Vec<PendingFaultApprovalRow>, String> {
    let conn = get_connection()?;
    let restriction = user_country_restriction(&conn, viewer_user_id)?;
    let mut stmt = conn.prepare(
        "SELECT fa.id, fa.report_id, fa.template_checklist_item_id, fa.original_severity, fa.created_date,
                a.asset_code, cd.description, r.issue_details, r.action_taken, a.country
         FROM mri_fault_approvals fa
         JOIN mri_reports rep ON fa.report_id = rep.id
         LEFT JOIN assets a ON rep.asset_id = a.id
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
                },
                country,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|(_, country): &(PendingFaultApprovalRow, Option<String>)| match &restriction {
            None => true,
            Some(allowed) => country.as_deref().map_or(false, |c| allowed.iter().any(|a| a == c)),
        })
        .map(|(row, _)| row)
        .collect();
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

    // Reflect the tag directly on the asset record too. The subquery naturally no-ops if
    // this report isn't linked to an asset, so no special-casing is needed.
    let asset_tag_value = if stays_critical { "Red" } else { "Green" };
    conn.execute(
        "UPDATE assets SET tag_status = ?1
         WHERE id = (SELECT asset_id FROM mri_reports WHERE id = ?2)",
        rusqlite::params![asset_tag_value, report_id],
    )
    .map_err(|e| e.to_string())?;

    Ok("Fault approval decision saved".to_string())
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
}

const MRI_FAULT_RECTIFICATION_SELECT: &str =
    "SELECT fr.id, fr.fault_approval_id, fa.report_id, fa.template_checklist_item_id,
                a.asset_code, cd.description,
                fr.assigned_technician, fr.parts_status, fr.repair_date,
                fr.verified_by, fr.verified_date, fr.tag_status, fr.created_date, fr.updated_date
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

// Cross-report queue of faults still Red-Tagged and awaiting rectification, for the
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
                fr.verified_by, fr.verified_date, fr.tag_status, fr.created_date, fr.updated_date, a.country
         FROM mri_fault_rectifications fr
         JOIN mri_fault_approvals fa ON fr.fault_approval_id = fa.id
         JOIN mri_reports rep ON fa.report_id = rep.id
         LEFT JOIN assets a ON rep.asset_id = a.id
         LEFT JOIN template_checklist_items tci ON fa.template_checklist_item_id = tci.id
         LEFT JOIN checklist_databank cd ON tci.checklist_item_id = cd.id
         WHERE fr.tag_status = 'Red' ORDER BY fr.created_date DESC";
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let country: Option<String> = row.get(14)?;
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
        "UPDATE mri_fault_rectifications SET assigned_technician = ?1, parts_status = ?2, repair_date = ?3, updated_date = ?4 WHERE id = ?5 AND tag_status = 'Red'",
        rusqlite::params![update.assigned_technician, update.parts_status, update.repair_date, now, update.id],
    ).map_err(|e| e.to_string())?;
    if rows_affected == 0 {
        return Err("Rectification not found or already Green-Tagged".to_string());
    }
    Ok("Rectification updated".to_string())
}

// Terminal step of the repair loop: records who verified the repair, flips tag_status
// Red -> Green, and reflects that on the report's "Green Tagged" footer checkbox
// (mirrors the same best-effort footer logic in set_mri_fault_approval_decision).
#[tauri::command]
fn verify_mri_fault_rectification(id: i64, verified_by: String) -> Result<String, String> {
    let conn = get_connection()?;
    let verified_by = verified_by.trim();
    if verified_by.is_empty() {
        return Err("Verified-by name is required".to_string());
    }

    let report_id: Option<i64> = conn
        .query_row(
            "SELECT fa.report_id FROM mri_fault_rectifications fr
             JOIN mri_fault_approvals fa ON fr.fault_approval_id = fa.id
             WHERE fr.id = ?1 AND fr.tag_status = 'Red'",
            [id],
            |row| row.get(0),
        )
        .ok();
    let report_id = match report_id {
        Some(rid) => rid,
        None => return Err("Rectification not found or already Green-Tagged".to_string()),
    };

    let now = chrono_now();
    conn.execute(
        "UPDATE mri_fault_rectifications SET verified_by = ?1, verified_date = ?2, tag_status = 'Green', updated_date = ?2 WHERE id = ?3",
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
    if let Some(field_id) = green_tagged_field {
        conn.execute(
            "INSERT INTO mri_report_footer_values (report_id, template_footer_field_id, value)
             VALUES (?1, ?2, 'true')
             ON CONFLICT(report_id, template_footer_field_id) DO UPDATE SET value = excluded.value",
            rusqlite::params![report_id, field_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Flip the asset's own tag back to Green now that the repair is verified.
    conn.execute(
        "UPDATE assets SET tag_status = 'Green'
         WHERE id = (SELECT asset_id FROM mri_reports WHERE id = ?1)",
        [report_id],
    )
    .map_err(|e| e.to_string())?;

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
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO mri_report_mid_values (report_id, template_mid_field_id, value, route_points)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(report_id, template_mid_field_id) DO UPDATE SET value = excluded.value, route_points = excluded.route_points",
        rusqlite::params![report_id, template_mid_field_id, value, route_points],
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
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO mri_report_footer_values (report_id, template_footer_field_id, value)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(report_id, template_footer_field_id) DO UPDATE SET value = excluded.value",
        rusqlite::params![report_id, template_footer_field_id, value],
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
}

#[tauri::command]
fn get_mri_report_attachments(report_id: i64) -> Result<Vec<MriReportAttachment>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, report_id, template_checklist_item_id, file_name, file_type, data, uploaded_date
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
) -> Result<i64, String> {
    let conn = get_connection()?;
    if data.trim().is_empty() {
        return Err("File data cannot be empty".to_string());
    }
    let now = chrono_now();
    conn.execute(
        "INSERT INTO mri_report_attachments (report_id, template_checklist_item_id, file_name, file_type, data, uploaded_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![report_id, template_checklist_item_id, file_name, file_type, data, now],
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
            "SELECT id FROM mri_reports WHERE asset_id = ?1 AND id != ?2 ORDER BY id DESC LIMIT 1",
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
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT tci.checklist_item_id
         FROM mri_report_checklist_results r
         JOIN mri_reports rep ON r.report_id = rep.id
         JOIN template_checklist_items tci ON r.template_checklist_item_id = tci.id
         WHERE rep.asset_id = ?1 AND rep.id != ?2 AND r.closure_status = 'Pending'",
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

// Read-only history: any checklist item still closure_status = 'Pending' on an EARLIER
// report for this asset, regardless of severity (Minor included) or whether it ever went
// through the mri_fault_approvals escalation table. This is intentionally query-derived
// rather than a stored link column -- it's always correct off of closure_status directly,
// with no separate state to keep in sync or go stale (see the purge/orphaned-drawer-data
// bug from a few days ago for why a stored pointer would be the wrong call here).
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
         WHERE rep.asset_id = ?1 AND rep.id != ?2 AND r.closure_status = 'Pending'
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
            create_mri_report,
            delete_mri_report,
            submit_mri_report,
            set_mri_report_status,
            get_mri_report_header_values,
            set_mri_report_header_value,
            get_mri_report_checklist_results,
            set_mri_report_checklist_result,
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
            export_assets_backup,
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
            get_app_users,
            create_app_user,
            update_app_user,
            delete_app_user,
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
            get_my_open_mri_reports,
            set_mri_fault_approval_decision,
            get_pending_mri_fault_approvals,
            confirm_provisional_approval,
            get_provisional_mri_fault_approvals,
            get_mri_fault_rectifications,
            get_pending_mri_fault_rectifications,
            update_mri_fault_rectification,
            verify_mri_fault_rectification,
            get_carried_forward_faults
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
