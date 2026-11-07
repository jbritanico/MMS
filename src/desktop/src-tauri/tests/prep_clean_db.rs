// Test-only: builds the clean starting database for the MR-I Test Matrix run (brief option (a)).
// Works ONLY on <repo>/e2e/run/assets.db (copied fresh from e2e/run/assets.source.db), never on
// the real src-tauri/assets.db. Uses the app's own purge and trigger-reset commands, then resets
// asset tags to the S5 state, and finally copies the result to e2e/run/assets.start.db.
// Run: cargo test --test prep_clean_db -- --ignored --nocapture
#![allow(dead_code, unused_imports, unused_variables, unused_mut)]
include!("../src/lib.rs");

fn repo_root_prep() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..").canonicalize().unwrap()
}

#[test]
#[ignore]
fn prepare_clean_start_db() {
    let root = repo_root_prep();
    let run = root.join("e2e").join("run");
    let real = root.join("src/desktop/src-tauri/assets.db");
    let real_before = std::fs::metadata(&real).unwrap();

    std::fs::copy(run.join("assets.source.db"), run.join("assets.db")).unwrap();
    for ext in ["assets.db-wal", "assets.db-shm"] {
        let _ = std::fs::remove_file(run.join(ext));
    }
    assert_ne!(real.canonicalize().unwrap(), run.join("assets.db").canonicalize().unwrap());
    std::env::set_current_dir(&run).unwrap();

    println!("{}", purge_mri_reports(MriReportPurgeFilter { asset_id: None, country: None, service_line: None, asset_type_id: None }).unwrap());
    println!("{}", reset_trigger_running_values(None).unwrap());
    // The matrix picks Client "Test Client" from the dropdown, but the CLIENT lookup list has
    // no such value; add it (test database only) through the app's own command.
    println!("{:?}", create_lookup("CLIENT".to_string(), "Test Client".to_string()));

    {
        let conn = get_connection().unwrap();
        // With no reports left, these per-report/per-fault logs can only be leftovers.
        for sql in [
            "DELETE FROM mri_fault_rectifications",
            "DELETE FROM mri_fault_approvals",
            "DELETE FROM mri_fault_decision_log",
            "DELETE FROM mri_fault_reminders",
            "DELETE FROM mri_onsite_repair_log",
            "DELETE FROM mri_checklist_action_log",
            "DELETE FROM asset_tag_history",
            "DELETE FROM asset_moc_exemptions",
            "UPDATE assets SET tag_status = NULL, tag_reason = NULL",
            "UPDATE maintenance_triggers SET tally_value = 0",
        ] {
            let n = conn.execute(sql, []).unwrap();
            println!("{sql}: {n} row(s)");
        }
        // Fold the WAL (if any) into the main file so the plain file copy below is complete.
        let _ = conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()));
    }

    std::fs::copy(run.join("assets.db"), run.join("assets.start.db")).unwrap();
    let real_after = std::fs::metadata(&real).unwrap();
    assert_eq!(real_before.len(), real_after.len());
    assert_eq!(real_before.modified().unwrap(), real_after.modified().unwrap());
    println!("Real assets.db unchanged: {} bytes, modified {:?}", real_after.len(), real_after.modified().unwrap());
}
