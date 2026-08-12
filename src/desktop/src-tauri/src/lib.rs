use rusqlite::Connection;
use serde::{Deserialize, Serialize};

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
            last_action_dt TEXT
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
        "CREATE TABLE IF NOT EXISTS checklist_databank (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn)
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
        "INSERT INTO assets (asset_code, asset_description, country, service_line, active, service_asset, vehicle, mr_last_action, last_action_by, last_action_dt)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            asset.asset_code, asset.asset_description, asset.country, asset.service_line,
            asset.active as i32, asset.service_asset as i32, asset.vehicle as i32,
            asset.mr_last_action, asset.last_action_by, asset.last_action_dt
        ],
    ).map_err(|e| e.to_string())?;

    let asset_id = conn.last_insert_rowid();
    seed_triggers(&conn, asset_id)?;

    Ok("Asset created".to_string())
}

#[tauri::command]
fn get_assets() -> Result<Vec<Asset>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare("SELECT id, asset_code, asset_description, country, service_line, active, service_asset, vehicle, mr_last_action, last_action_by, last_action_dt FROM assets")
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
        "UPDATE assets SET asset_code=?1, asset_description=?2, country=?3, service_line=?4, active=?5, service_asset=?6, vehicle=?7, mr_last_action=?8, last_action_by=?9, last_action_dt=?10 WHERE id=?11",
        rusqlite::params![
            asset.asset_code, asset.asset_description, asset.country, asset.service_line,
            asset.active as i32, asset.service_asset as i32, asset.vehicle as i32,
            asset.mr_last_action, asset.last_action_by, asset.last_action_dt, asset.id
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
}

#[tauri::command]
fn get_checklist_items() -> Result<Vec<ChecklistItem>, String> {
    let conn = get_connection()?;
    let mut stmt = conn
        .prepare("SELECT id, code, description FROM checklist_databank ORDER BY code")
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |row| {
            Ok(ChecklistItem {
                id: row.get(0)?,
                code: row.get(1)?,
                description: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

#[derive(Serialize, Deserialize)]
struct NewChecklistItem {
    code: String,
    description: String,
}

#[tauri::command]
fn create_checklist_item(item: NewChecklistItem) -> Result<String, String> {
    let conn = get_connection()?;
    let code = item.code.trim();
    let description = item.description.trim();
    if code.is_empty() || description.is_empty() {
        return Err("Checklist code and description cannot be empty".to_string());
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
        "INSERT INTO checklist_databank (code, description) VALUES (?1, ?2)",
        rusqlite::params![code, description],
    )
    .map_err(|e| e.to_string())?;
    Ok("Checklist item created".to_string())
}

#[tauri::command]
fn update_checklist_item(item: ChecklistItem) -> Result<String, String> {
    let conn = get_connection()?;
    let code = item.code.trim();
    let description = item.description.trim();
    if code.is_empty() || description.is_empty() {
        return Err("Checklist code and description cannot be empty".to_string());
    }
    conn.execute(
        "UPDATE checklist_databank SET code = ?1, description = ?2 WHERE id = ?3",
        rusqlite::params![code, description, item.id],
    )
    .map_err(|e| e.to_string())?;
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
        if code.is_empty() || description.is_empty() {
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
            "INSERT INTO checklist_databank (code, description) VALUES (?1, ?2)",
            rusqlite::params![code, description],
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
fn delete_checklist_item(id: i64) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM checklist_databank WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok("Checklist item deleted".to_string())
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
            bulk_create_checklist_items
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
