// Test-only: prints the state of a TEST COPY of the database (never the real assets.db).
// Run: cargo test --test db_inspect -- --nocapture --ignored
// Env MMS_TEST_DB_DIR selects the folder holding the copy (default <repo>/e2e/run).
#![allow(dead_code, unused_imports, unused_variables, unused_mut)]
include!("../src/lib.rs");

mod inspect {
    use rusqlite::types::ValueRef;
    use std::path::PathBuf;

    pub fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("..").canonicalize().unwrap()
    }

    pub fn dump(conn: &rusqlite::Connection, sql: &str) {
        println!("--- {}", sql);
        let mut stmt = conn.prepare(sql).unwrap();
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        println!("{}", names.join(" | "));
        let mut rows = stmt.query([]).unwrap();
        while let Some(row) = rows.next().unwrap() {
            let vals: Vec<String> = (0..names.len())
                .map(|i| match row.get_ref(i).unwrap() {
                    ValueRef::Null => "NULL".into(),
                    ValueRef::Integer(v) => v.to_string(),
                    ValueRef::Real(v) => v.to_string(),
                    ValueRef::Text(t) => String::from_utf8_lossy(t).chars().take(80).collect(),
                    ValueRef::Blob(b) => format!("<blob {}>", b.len()),
                })
                .collect();
            println!("{}", vals.join(" | "));
        }
    }
}

#[test]
#[ignore]
fn inspect_test_copy() {
    let dir = std::env::var("MMS_TEST_DB_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| inspect::repo_root().join("e2e").join("run"));
    let real = inspect::repo_root().join("src/desktop/src-tauri/assets.db").canonicalize().unwrap();
    let target = dir.join("assets.db").canonicalize().expect("e2e/run/assets.db must exist");
    assert_ne!(real, target, "refusing to run against the real database");
    std::env::set_current_dir(&dir).unwrap();
    println!("DB: {}", target.display());

    let conn = get_connection().unwrap();
    let tables: Vec<String> = {
        let mut s = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").unwrap();
        let v = s.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect();
        v
    };
    for t in &tables {
        let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM \"{}\"", t), [], |r| r.get(0)).unwrap();
        println!("{:40} {}", t, n);
    }
    for sql in std::env::var("MMS_INSPECT_SQL").unwrap_or_default().split(";;") {
        if !sql.trim().is_empty() {
            inspect::dump(&conn, sql.trim());
        }
    }
}
