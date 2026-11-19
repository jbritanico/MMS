// Support bundle file format (.mmsbundle), checklist items 4 and 5.
//
// A support bundle is one ZIP file. Every part inside is a plain JSON or text file, so a bundle
// can also be opened with Windows Explorer (rename it to .zip) when MMS is not at hand:
//
//   manifest.json   what the bundle is: format and version, MMS version, computer, who made it,
//                   when, the screen they were on, their note, and the list of parts below
//   logs/...        the app log files, copied as they are (last 14 days)
//   system.json     laptop and MMS details (same as About MMS)
//   checks.json     "Check my data" results
//   sessions.log    start / end history of MMS on that laptop (crash history)
//   screen.json     steps, recent errors, recent calls and timings from the screen side
//   report.json     optional: the report the user was on
//   backup.json     optional, off by default: the full backup
//
// Each part belongs to one section. Later MMS versions add new sections (for example sync.json
// for SharePoint sync) without touching the existing ones. The viewer reads manifest.json first
// and refuses a bundle whose format or version it does not know. ZIP keeps a checksum of every
// part, so a damaged or altered part is reported when it is read.
//
// Nothing in this file touches the MMS database.

use serde::{Deserialize, Serialize};
use std::io::{Read, Seek, Write};
use zip::write::SimpleFileOptions;

pub const BUNDLE_FORMAT: &str = "mms-support-bundle";
pub const BUNDLE_FORMAT_VERSION: u32 = 1;
pub const BUNDLE_EXTENSION: &str = "mmsbundle";
pub const MANIFEST_NAME: &str = "manifest.json";

/// Largest single part the viewer will unpack (protects against damaged or hostile files).
const MAX_PART_BYTES: u64 = 512 * 1024 * 1024;

/// Section names. A part's section is decided by its path (see `section_of`).
pub mod section {
    pub const MANIFEST: &str = "manifest";
    pub const LOGS: &str = "logs";
    pub const SYSTEM: &str = "system";
    pub const CHECKS: &str = "checks";
    pub const SESSIONS: &str = "sessions";
    pub const SCREEN: &str = "screen";
    pub const REPORT: &str = "report";
    pub const BACKUP: &str = "backup";
    pub const OTHER: &str = "other";
}

/// Fixed file names for the single-file sections.
pub mod part {
    pub const SYSTEM: &str = "system.json";
    pub const CHECKS: &str = "checks.json";
    pub const SESSIONS: &str = "sessions.log";
    pub const SCREEN: &str = "screen.json";
    pub const REPORT: &str = "report.json";
    pub const BACKUP: &str = "backup.json";
    pub const LOGS_DIR: &str = "logs/";
}

pub fn section_of(path: &str) -> &'static str {
    match path {
        MANIFEST_NAME => section::MANIFEST,
        part::SYSTEM => section::SYSTEM,
        part::CHECKS => section::CHECKS,
        part::SESSIONS => section::SESSIONS,
        part::SCREEN => section::SCREEN,
        part::REPORT => section::REPORT,
        part::BACKUP => section::BACKUP,
        p if p.starts_with(part::LOGS_DIR) => section::LOGS,
        _ => section::OTHER,
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BundlePart {
    pub path: String,
    pub section: String,
    /// Size before compression.
    pub bytes: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct BundleUser {
    pub name: String,
    pub role: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BundleManifest {
    pub format: String,
    pub format_version: u32,
    /// UTC, "YYYY-MM-DD HH:MM:SS UTC"
    pub created_at: String,
    pub mms_version: String,
    /// "Installed" or "Developer run"
    pub build: String,
    pub computer: String,
    pub user: Option<BundleUser>,
    /// Screen the user was on when they pressed Send to IT.
    pub screen: String,
    /// The user's own words about the problem.
    pub note: String,
    #[serde(default)]
    pub includes_backup: bool,
    /// Report number included as report.json, if any.
    #[serde(default)]
    pub includes_report: Option<i64>,
    /// Filled in by `BundleWriter::finish`.
    #[serde(default)]
    pub parts: Vec<BundlePart>,
}

impl BundleManifest {
    /// A manifest with the format fields set; the caller fills in the rest.
    pub fn new(created_at: String, mms_version: String) -> Self {
        BundleManifest {
            format: BUNDLE_FORMAT.into(),
            format_version: BUNDLE_FORMAT_VERSION,
            created_at,
            mms_version,
            build: String::new(),
            computer: String::new(),
            user: None,
            screen: String::new(),
            note: String::new(),
            includes_backup: false,
            includes_report: None,
            parts: Vec::new(),
        }
    }
}

fn check_part_path(path: &str) -> Result<(), String> {
    let bad = path.is_empty()
        || path == MANIFEST_NAME
        || path.starts_with('/')
        || path.contains('\\')
        || path.contains(':')
        || path.split('/').any(|seg| seg.is_empty() || seg == "." || seg == "..");
    if bad {
        Err(format!("Not a valid name for a part of the support bundle: {path}"))
    } else {
        Ok(())
    }
}

// ---------------------------------------------------------------- writing

/// Builds a bundle part by part, then writes manifest.json with the list of parts.
pub struct BundleWriter<W: Write + Seek> {
    zip: zip::ZipWriter<W>,
    parts: Vec<BundlePart>,
}

impl<W: Write + Seek> BundleWriter<W> {
    pub fn new(out: W) -> Self {
        BundleWriter { zip: zip::ZipWriter::new(out), parts: Vec::new() }
    }

    fn options() -> SimpleFileOptions {
        SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .large_file(true)
    }

    fn start(&mut self, path: &str) -> Result<(), String> {
        check_part_path(path)?;
        if self.parts.iter().any(|p| p.path == path) {
            return Err(format!("The support bundle already has a part named {path}"));
        }
        self.zip.start_file(path, Self::options()).map_err(|e| e.to_string())
    }

    pub fn add_bytes(&mut self, path: &str, data: &[u8]) -> Result<(), String> {
        self.start(path)?;
        self.zip.write_all(data).map_err(|e| e.to_string())?;
        self.parts.push(BundlePart { path: path.into(), section: section_of(path).into(), bytes: data.len() as u64 });
        Ok(())
    }

    pub fn add_text(&mut self, path: &str, text: &str) -> Result<(), String> {
        self.add_bytes(path, text.as_bytes())
    }

    pub fn add_json<T: Serialize>(&mut self, path: &str, value: &T) -> Result<(), String> {
        let data = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
        self.add_bytes(path, &data)
    }

    /// Copies a file from disk without loading it all into memory (log files can be large).
    pub fn add_file(&mut self, path: &str, source: &std::path::Path) -> Result<(), String> {
        let mut f = std::fs::File::open(source).map_err(|e| format!("Could not read {}: {e}", source.display()))?;
        self.start(path)?;
        let bytes = std::io::copy(&mut f, &mut self.zip).map_err(|e| e.to_string())?;
        self.parts.push(BundlePart { path: path.into(), section: section_of(path).into(), bytes });
        Ok(())
    }

    pub fn parts(&self) -> &[BundlePart] {
        &self.parts
    }

    /// Writes manifest.json (with the list of parts) and closes the ZIP.
    pub fn finish(mut self, mut manifest: BundleManifest) -> Result<(W, BundleManifest), String> {
        manifest.format = BUNDLE_FORMAT.into();
        manifest.format_version = BUNDLE_FORMAT_VERSION;
        manifest.parts = self.parts.clone();
        let data = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
        self.zip.start_file(MANIFEST_NAME, Self::options()).map_err(|e| e.to_string())?;
        self.zip.write_all(&data).map_err(|e| e.to_string())?;
        let out = self.zip.finish().map_err(|e| e.to_string())?;
        Ok((out, manifest))
    }
}

// ---------------------------------------------------------------- reading

/// Opens a bundle for reading. Only reads into memory; nothing is unpacked to disk.
pub struct BundleReader<R: Read + Seek> {
    zip: zip::ZipArchive<R>,
    pub manifest: BundleManifest,
}

impl<R: Read + Seek> BundleReader<R> {
    pub fn open(input: R) -> Result<Self, String> {
        let mut zip = zip::ZipArchive::new(input)
            .map_err(|_| "This file is not an MMS support bundle (it is not a ZIP file, or it is damaged).".to_string())?;
        let raw = read_entry(&mut zip, MANIFEST_NAME)
            .map_err(|_| "This file is not an MMS support bundle (manifest.json is missing).".to_string())?;
        let value: serde_json::Value = serde_json::from_slice(&raw)
            .map_err(|_| "This support bundle is damaged: manifest.json cannot be read.".to_string())?;
        if value.get("format").and_then(|v| v.as_str()) != Some(BUNDLE_FORMAT) {
            return Err("This file is not an MMS support bundle.".into());
        }
        let version = value.get("format_version").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        if version == 0 || version > BUNDLE_FORMAT_VERSION {
            return Err(format!(
                "This support bundle was made by a newer MMS (bundle format {version}). Update MMS on this laptop to open it."
            ));
        }
        let manifest: BundleManifest = serde_json::from_value(value)
            .map_err(|e| format!("This support bundle is damaged: manifest.json is incomplete ({e})."))?;
        Ok(BundleReader { zip, manifest })
    }

    /// Names of every part actually in the ZIP (manifest.json included).
    pub fn names(&self) -> Vec<String> {
        self.zip.file_names().map(|s| s.to_string()).collect()
    }

    pub fn has(&self, path: &str) -> bool {
        self.zip.index_for_name(path).is_some()
    }

    pub fn read_bytes(&mut self, path: &str) -> Result<Vec<u8>, String> {
        read_entry(&mut self.zip, path)
    }

    pub fn read_text(&mut self, path: &str) -> Result<String, String> {
        let bytes = self.read_bytes(path)?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }

    pub fn read_json(&mut self, path: &str) -> Result<serde_json::Value, String> {
        let bytes = self.read_bytes(path)?;
        serde_json::from_slice(&bytes).map_err(|e| format!("{path} in the support bundle cannot be read: {e}"))
    }

    /// The log file parts, oldest first.
    pub fn log_parts(&self) -> Vec<String> {
        let mut v: Vec<String> = self.names().into_iter().filter(|n| section_of(n) == section::LOGS).collect();
        v.sort();
        v
    }
}

fn read_entry<R: Read + Seek>(zip: &mut zip::ZipArchive<R>, path: &str) -> Result<Vec<u8>, String> {
    let entry = zip.by_name(path).map_err(|_| format!("{path} is not in the support bundle."))?;
    let size = entry.size();
    if size > MAX_PART_BYTES {
        return Err(format!("{path} in the support bundle is too large to open ({} MB).", size / 1_048_576));
    }
    let mut buf = Vec::with_capacity(size as usize);
    // take() also guards against a part that unpacks to more than it claims.
    entry
        .take(MAX_PART_BYTES + 1)
        .read_to_end(&mut buf)
        .map_err(|e| format!("{path} in the support bundle is damaged: {e}"))?;
    if buf.len() as u64 > MAX_PART_BYTES {
        return Err(format!("{path} in the support bundle is too large to open."));
    }
    Ok(buf)
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn sample() -> Vec<u8> {
        let mut w = BundleWriter::new(Cursor::new(Vec::new()));
        w.add_text("logs/mms-2026-11-18.log", &"2026-11-18 08:00:00.000 INFO [Main menu] STEP Opened Main menu\n".repeat(2000)).unwrap();
        w.add_text("logs/mms-2026-11-19.log", "2026-11-19 08:00:00.000 INFO [Main menu] STEP Opened Main menu\n").unwrap();
        w.add_json(part::SYSTEM, &serde_json::json!({ "version": "0.9.0" })).unwrap();
        w.add_text(part::SESSIONS, "{\"event\":\"start\"}\n").unwrap();
        let mut m = BundleManifest::new("2026-11-19 08:00:00 UTC".into(), "0.9.0".into());
        m.user = Some(BundleUser { name: "Faizan".into(), role: "Job Supervisor".into() });
        m.note = "Save failed on MR-I for unit 12".into();
        let (out, manifest) = w.finish(m).unwrap();
        assert_eq!(manifest.parts.len(), 4);
        out.into_inner()
    }

    #[test]
    fn round_trip() {
        let bytes = sample();
        let mut r = BundleReader::open(Cursor::new(bytes)).unwrap();
        assert_eq!(r.manifest.format, BUNDLE_FORMAT);
        assert_eq!(r.manifest.note, "Save failed on MR-I for unit 12");
        assert_eq!(r.manifest.parts.iter().filter(|p| p.section == section::LOGS).count(), 2);
        assert_eq!(r.log_parts(), vec!["logs/mms-2026-11-18.log", "logs/mms-2026-11-19.log"]);
        assert_eq!(r.read_json(part::SYSTEM).unwrap()["version"], "0.9.0");
        assert!(r.read_text("logs/mms-2026-11-18.log").unwrap().starts_with("2026-11-18"));
        assert!(r.read_bytes(part::BACKUP).is_err());
        assert!(r.has(MANIFEST_NAME));
    }

    #[test]
    fn logs_compress_well() {
        let bytes = sample();
        // About 130 KB of repeated log text should shrink to a small fraction.
        assert!(bytes.len() < 20_000, "bundle is {} bytes", bytes.len());
    }

    #[test]
    fn rejects_bad_names_and_duplicates() {
        let mut w = BundleWriter::new(Cursor::new(Vec::new()));
        for bad in ["", "manifest.json", "/abs", "a/../b", "c:\\x", "logs//x", "a\\b"] {
            assert!(w.add_text(bad, "x").is_err(), "{bad} was accepted");
        }
        w.add_text("system.json", "{}").unwrap();
        assert!(w.add_text("system.json", "{}").is_err());
    }

    #[test]
    fn rejects_other_files() {
        assert!(BundleReader::open(Cursor::new(b"not a zip".to_vec())).is_err());
        // A ZIP without a manifest
        let mut z = zip::ZipWriter::new(Cursor::new(Vec::new()));
        z.start_file("hello.txt", SimpleFileOptions::default()).unwrap();
        z.write_all(b"hi").unwrap();
        let bytes = z.finish().unwrap().into_inner();
        let err = BundleReader::open(Cursor::new(bytes)).err().unwrap();
        assert!(err.contains("manifest.json is missing"), "{err}");
    }

    #[test]
    fn rejects_newer_format() {
        let mut z = zip::ZipWriter::new(Cursor::new(Vec::new()));
        z.start_file(MANIFEST_NAME, SimpleFileOptions::default()).unwrap();
        z.write_all(br#"{"format":"mms-support-bundle","format_version":99}"#).unwrap();
        let bytes = z.finish().unwrap().into_inner();
        let err = BundleReader::open(Cursor::new(bytes)).err().unwrap();
        assert!(err.contains("newer MMS"), "{err}");
    }

    #[test]
    fn sections() {
        assert_eq!(section_of("logs/mms-2026-11-19.log.1"), section::LOGS);
        assert_eq!(section_of("backup.json"), section::BACKUP);
        assert_eq!(section_of("sync.json"), section::OTHER);
    }

    #[test]
    fn add_file_streams_from_disk() {
        let dir = std::env::temp_dir().join(format!("mmsbundle-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("mms-2026-11-19.log");
        std::fs::write(&src, "line one\nline two\n").unwrap();
        let mut w = BundleWriter::new(Cursor::new(Vec::new()));
        w.add_file("logs/mms-2026-11-19.log", &src).unwrap();
        let (out, m) = w.finish(BundleManifest::new("t".into(), "v".into())).unwrap();
        assert_eq!(m.parts[0].bytes, 18);
        let mut r = BundleReader::open(Cursor::new(out.into_inner())).unwrap();
        assert_eq!(r.read_text("logs/mms-2026-11-19.log").unwrap(), "line one\nline two\n");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
