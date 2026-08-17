use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const BROWSABLE_TABLES: [&str; 20] = [
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
    "mri_reports",
    "mri_report_header_values",
    "mri_report_checklist_results",
    "mri_report_mid_values",
    "mri_report_footer_values",
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

fn get_connection() -> Result<Connection, String> {
    let conn = Connection::open("assets.db").map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS asset_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL UNIQUE,
            active INTEGER NOT NULL DEFAULT 1,
            created_by TEXT NOT NULL DEFAULT 'local user',
            created_date TEXT NOT NULL,
            updated_by TEXT NOT NULL DEFAULT 'local user',
            updated_date TEXT NOT NULL
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

    Ok(conn)
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
    let mut stmt = conn.prepare("SELECT id, asset_code, asset_description, country, service_line, active, service_asset, vehicle, mr_last_action, last_action_by, last_action_dt, asset_type_id, client FROM assets")
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
}

#[tauri::command]
fn get_asset_types() -> Result<Vec<AssetType>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, description, active, created_by, created_date, updated_by, updated_date FROM asset_types ORDER BY description"
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
fn update_asset_type(id: i64, description: String, active: bool) -> Result<String, String> {
    let conn = get_connection()?;
    let trimmed = description.trim();
    if trimmed.is_empty() {
        return Err("Asset type description cannot be empty".to_string());
    }
    let now = chrono_now();
    conn.execute(
        "UPDATE asset_types SET description = ?1, active = ?2, updated_by = 'local user', updated_date = ?3 WHERE id = ?4",
        rusqlite::params![trimmed, active as i32, now, id],
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

    conn.execute("DELETE FROM template_header_fields WHERE template_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM template_checklist_items WHERE template_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM template_mid_fields WHERE template_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM template_footer_fields WHERE template_id = ?1", [id])
        .map_err(|e| e.to_string())?;

    let report_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM mri_reports WHERE template_id = ?1", [id], |row| row.get(0)
    ).map_err(|e| e.to_string())?;
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
    matches!(s, "Minor" | "Moderate" | "Major" | "Critical")
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
                "Invalid severity '{}' — must be Minor, Moderate, Major, or Critical",
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
    let now = chrono_now();
    conn.execute(
        "INSERT INTO mri_reports (template_id, asset_id, status, created_date) VALUES (?1, ?2, 'Draft', ?3)",
        rusqlite::params![report.template_id, report.asset_id, now],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
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
        "SELECT id, report_id, template_checklist_item_id, status, issue_details, action_taken, date_observed, closure_status
         FROM mri_report_checklist_results WHERE report_id = ?1"
    ).map_err(|e| e.to_string())?;
    let results = stmt
        .query_map([report_id], |row| {
            Ok(MriReportChecklistResult {
                id: row.get(0)?,
                report_id: row.get(1)?,
                template_checklist_item_id: row.get(2)?,
                status: row.get(3)?,
                issue_details: row.get(4)?,
                action_taken: row.get(5)?,
                date_observed: row.get(6)?,
                closure_status: row.get(7)?,
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
        if s == "Fail" {
            if result
                .issue_details
                .as_deref()
                .unwrap_or("")
                .trim()
                .is_empty()
            {
                return Err("Issue details are required when status is Fail".to_string());
            }
            if result
                .action_taken
                .as_deref()
                .unwrap_or("")
                .trim()
                .is_empty()
            {
                return Err("Action taken is required when status is Fail".to_string());
            }
        }
    }
    if !valid_closure_status(&result.closure_status) {
        return Err(format!(
            "Invalid closure status '{}' — must be Pending or Closed",
            result.closure_status
        ));
    }

    conn.execute(
        "INSERT INTO mri_report_checklist_results (report_id, template_checklist_item_id, status, issue_details, action_taken, date_observed, closure_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(report_id, template_checklist_item_id) DO UPDATE SET
            status = excluded.status,
            issue_details = excluded.issue_details,
            action_taken = excluded.action_taken,
            date_observed = excluded.date_observed,
            closure_status = excluded.closure_status",
        rusqlite::params![
            result.report_id, result.template_checklist_item_id, result.status,
            result.issue_details, result.action_taken, result.date_observed, result.closure_status
        ],
    ).map_err(|e| e.to_string())?;
    Ok("Checklist result saved".to_string())
}

#[derive(Serialize, Deserialize)]
struct MriReportMidValue {
    id: i64,
    report_id: i64,
    template_mid_field_id: i64,
    value: Option<String>,
}

#[tauri::command]
fn get_mri_report_mid_values(report_id: i64) -> Result<Vec<MriReportMidValue>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, report_id, template_mid_field_id, value FROM mri_report_mid_values WHERE report_id = ?1"
    ).map_err(|e| e.to_string())?;
    let values = stmt
        .query_map([report_id], |row| {
            Ok(MriReportMidValue {
                id: row.get(0)?,
                report_id: row.get(1)?,
                template_mid_field_id: row.get(2)?,
                value: row.get(3)?,
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
) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO mri_report_mid_values (report_id, template_mid_field_id, value)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(report_id, template_mid_field_id) DO UPDATE SET value = excluded.value",
        rusqlite::params![report_id, template_mid_field_id, value],
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
            get_lookup_criteria,
            get_lookups,
            create_lookup,
            update_lookup,
            delete_lookup,
            bulk_create_lookups,
            get_previous_engine_hours,
            export_assets_backup,
            import_assets_backup,
            export_mri_templates_backup,
            import_mri_templates_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
