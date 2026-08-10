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
    ).map_err(|e| e.to_string())?;
    Ok(conn)
}

#[tauri::command]
fn create_asset(asset: Asset) -> Result<String, String> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO assets (asset_code, asset_description, country, service_line, active, service_asset, vehicle, mr_last_action, last_action_by, last_action_dt)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            asset.asset_code, asset.asset_description, asset.country, asset.service_line,
            asset.active as i32, asset.service_asset as i32, asset.vehicle as i32,
            asset.mr_last_action, asset.last_action_by, asset.last_action_dt
        ],
    ).map_err(|e| e.to_string())?;
    Ok("Asset created".to_string())
}

#[tauri::command]
fn get_assets() -> Result<Vec<Asset>, String> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare("SELECT id, asset_code, asset_description, country, service_line, active, service_asset, vehicle, mr_last_action, last_action_by, last_action_dt FROM assets")
        .map_err(|e| e.to_string())?;
    let assets = stmt.query_map([], |row| {
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
    }).map_err(|e| e.to_string())?
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
    conn.execute("DELETE FROM assets WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    Ok("Asset deleted".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![create_asset, get_assets, update_asset, delete_asset])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}