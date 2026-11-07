// Test-only "IT runs the SQL" helper for the MR-I Test Matrix UI run (E1, E11, E12, E13,
// G7, H8 and read-only checks). Runs the statements in MMS_IT_SQL (separated by ";;") on the
// TEST database copy in MMS_TEST_DB_DIR (default <repo>/e2e/run) through the app's own
// connection code, so the encryption key is never handled here. Refuses the real database.
// Prints one JSON line per statement: {"sql":..,"ok":..,"rows":[..]|"changed":n|"error":..}
//   cargo test --test it_sql -- --ignored --nocapture      (or run the built test exe directly)
#![allow(dead_code, unused_imports, unused_variables, unused_mut)]
include!("../src/lib.rs");

#[test]
#[ignore]
fn it_runs_sql_on_test_db() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..").canonicalize().unwrap();
    let dir = std::env::var("MMS_TEST_DB_DIR").map(std::path::PathBuf::from).unwrap_or_else(|_| root.join("e2e/run"));
    let real = root.join("src/desktop/src-tauri/assets.db").canonicalize().unwrap();
    let target = dir.join("assets.db").canonicalize().expect("test assets.db must exist");
    assert_ne!(real, target, "refusing to run against the real database");
    std::env::set_current_dir(&dir).unwrap();
    let sql_all = std::env::var("MMS_IT_SQL").unwrap_or_default();
    let conn = get_connection().unwrap();
    let _ = conn.busy_timeout(std::time::Duration::from_secs(10));
    for sql in sql_all.split(";;").map(str::trim).filter(|s| !s.is_empty()) {
        let is_query = sql.trim_start().to_uppercase().starts_with("SELECT");
        let out = if is_query {
            match conn.prepare(sql) {
                Ok(mut st) => {
                    let n = st.column_count();
                    let names: Vec<String> = st.column_names().iter().map(|s| s.to_string()).collect();
                    let rows: Result<Vec<serde_json::Value>, _> = st
                        .query_map([], |r| {
                            let mut m = serde_json::Map::new();
                            for i in 0..n {
                                let v = match r.get_ref(i)? {
                                    rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                                    rusqlite::types::ValueRef::Integer(x) => serde_json::json!(x),
                                    rusqlite::types::ValueRef::Real(x) => serde_json::json!(x),
                                    rusqlite::types::ValueRef::Text(t) => serde_json::json!(String::from_utf8_lossy(t)),
                                    rusqlite::types::ValueRef::Blob(b) => serde_json::json!(format!("<blob {}>", b.len())),
                                };
                                m.insert(names[i].clone(), v);
                            }
                            Ok(serde_json::Value::Object(m))
                        })
                        .and_then(|it| it.collect());
                    match rows {
                        Ok(r) => serde_json::json!({"sql": sql, "ok": true, "rows": r}),
                        Err(e) => serde_json::json!({"sql": sql, "ok": false, "error": e.to_string()}),
                    }
                }
                Err(e) => serde_json::json!({"sql": sql, "ok": false, "error": e.to_string()}),
            }
        } else {
            match conn.execute(sql, []) {
                Ok(n) => serde_json::json!({"sql": sql, "ok": true, "changed": n}),
                Err(e) => serde_json::json!({"sql": sql, "ok": false, "error": e.to_string()}),
            }
        };
        println!("IT_SQL {}", out);
    }
}
