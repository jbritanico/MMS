import { useState, useEffect } from "react";
import {
  usePurgeAssetTypes,
  usePurgeChecklistSections,
  usePurgeChecklistDatabank,
  usePurgeLookups,
  usePreviewMriReportPurge,
  usePurgeMriReports,
  useResetTriggerRunningValues,
  useCleanSlateMri,
  useMriReportDeletionLog,
  type MriReportPurgeFilter,
} from "./hooks/usePurging";
import { useCurrentUser } from "../../lib/currentUser";
import { useLookupCriteria, useLookups } from "./hooks/useLookups";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useAssetTypes } from "./hooks/useAssetTypes";
import { IsoSteps, backupHint, fmtDay, readBackups, useReportAdminHints, useReportAdminKpis } from "./AdminIsoGuide";

// FB-026: deleting MR-I reports needs the approved MOC (reference and Country Manager).
type MocInfo = { reference: string; approvedBy: string };
type PendingPurge = {
  label: string;
  description: string;
  run: (moc: MocInfo) => Promise<string>;
  title?: string;
  confirmLabel?: string;
  /** True when the action deletes MR-I reports, so the MOC must be given. */
  moc?: boolean;
};

const fmtWhen = (raw: string | null | undefined) => {
  if (!raw) return "—";
  const n = Number(raw);
  const d = !isNaN(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function DataPurging() {
  const purgeAssetTypes = usePurgeAssetTypes();
  const purgeSections = usePurgeChecklistSections();
  const purgeDatabank = usePurgeChecklistDatabank();
  const purgeLookups = usePurgeLookups();
  const { data: criteriaList = [] } = useLookupCriteria();

  const { data: assets = [] } = useAssets();
  const { data: assetTypes = [] } = useAssetTypes();
  const { data: countryOptions = [] } = useLookups("COUNTRY");
  const { data: serviceLineOptions = [] } = useLookups("SERVICE LINE");

  const previewPurge = usePreviewMriReportPurge();
  const runPurge = usePurgeMriReports();
  const resetTriggerRunningValues = useResetTriggerRunningValues();
  const cleanSlate = useCleanSlateMri();
  const { user: currentUser } = useCurrentUser();
  const { data: deletions = [] } = useMriReportDeletionLog();
  // FB-026: only the Administrator may delete MR-I reports.
  const isAdmin = currentUser?.role === "Administrator";
  const adminOnlyTip = isAdmin ? undefined : "Only the Administrator can delete MR-I reports, against an approved MOC.";
  const [mocRef, setMocRef] = useState("");
  const [mocBy, setMocBy] = useState("");

  const [filterAsset, setFilterAsset] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterServiceLine, setFilterServiceLine] = useState("");
  const [filterAssetType, setFilterAssetType] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [resetTriggerAsset, setResetTriggerAsset] = useState("");

  const [pendingPurge, setPendingPurge] = useState<PendingPurge | null>(null);
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 6000);
  }

  const currentFilter: MriReportPurgeFilter = {
    asset_id: filterAsset ? Number(filterAsset) : null,
    country: filterCountry || null,
    service_line: filterServiceLine || null,
    asset_type_id: filterAssetType ? Number(filterAssetType) : null,
  };

  const hasAnyFilter = !!(filterAsset || filterCountry || filterServiceLine || filterAssetType);

  useEffect(() => {
    if (!hasAnyFilter) {
      setPreviewCount(null);
      return;
    }
    previewPurge.mutateAsync(currentFilter).then(setPreviewCount).catch(() => setPreviewCount(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAsset, filterCountry, filterServiceLine, filterAssetType]);

  async function confirmPurge() {
    if (!pendingPurge) return;
    if (pendingPurge.moc && (!mocRef.trim() || !mocBy.trim())) {
      flash("Enter the approved MOC reference and the Country Manager who approved it.", "err");
      return;
    }
    try {
      const result = await pendingPurge.run({ reference: mocRef.trim(), approvedBy: mocBy.trim() });
      if (pendingPurge.moc) { setMocRef(""); setMocBy(""); }
      flash(result, "ok");
    } catch (err) {
      flash(String(err), "err");
    } finally {
      setPendingPurge(null);
    }
  }

  function requestReferencePurge(label: string, description: string, run: () => Promise<string>) {
    setPendingPurge({ label, description, run });
  }

  function requestReportsPurge() {
    if (!hasAnyFilter) {
      flash("Select at least one filter before purging MR-I reports", "err");
      return;
    }
    setPendingPurge({
      label: "MR-I Reports",
      description: `This will permanently delete ${previewCount ?? "?"} MR-I report(s) matching your filters, along with all their header, checklist, mid-section, and footer data. This cannot be undone.`,
      moc: true,
      run: (m) => runPurge.mutateAsync({ filter: currentFilter, userId: currentUser?.id ?? 0, mocReference: m.reference, mocApprovedBy: m.approvedBy }),
    });
  }

  const bh = backupHint();
  useReportAdminHints("data-purge", bh ? [`${bh} — save one before clearing anything`] : []);
  const lastBackup = readBackups()[0];
  const backupDays = lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null;
  useReportAdminKpis("data-purge", [
    { label: "last backup from this PC", value: lastBackup ? fmtDay(lastBackup) : "none yet", tone: backupDays === null || backupDays > 7 ? "look" : "ok" },
    { label: "units", value: assets.length, tone: "blue" },
    { label: "kinds of unit", value: assetTypes.length, tone: "blue" },
    { label: "drop-down lists", value: criteriaList.length, tone: "blue" },
  ]);

  return (
    <div>
      <div className="tig-hint" role="note" style={{ marginBottom: 16, maxWidth: 820 }}>
        Everything on this screen deletes data for good and can't be undone. Save a backup first (Data tools › Back up &amp; restore).
        List clean-ups skip anything still in use (for example a kind of unit used by a template).
      </div>

      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 600, marginBottom: 16 }}>{status.msg}</div>}

      <div className="mri-preview-section-label">Start MR-I again from empty (testing only)</div>
      <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 14 }}>
        Starts MR-I from scratch: deletes every MR-I report with its faults, decisions, repairs and photos, clears MOC exemptions and tag history,
        resets every trigger running total to zero and sets every asset to <strong>Green</strong>. Assets, templates, trigger thresholds, users and
        reference data are kept. Take a backup first.
      </p>
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <button
          className="danger"
          disabled={!currentUser || !isAdmin || cleanSlate.isPending}
          title={adminOnlyTip}
          onClick={() =>
            setPendingPurge({
              moc: true,
              label: "Clean slate",
              title: "Start MR-I from a clean slate?",
              confirmLabel: "Clean slate",
              description:
                "This permanently deletes every MR-I report and all linked fault, repair, decision, exemption and tag history records, resets all trigger running totals to zero and sets every asset to Green. This cannot be undone.",
              run: (m) => cleanSlate.mutateAsync({ changedBy: currentUser?.name ?? "", userId: currentUser?.id ?? 0, mocReference: m.reference, mocApprovedBy: m.approvedBy }),
            })
          }
        >
          Clean Slate: Clear All MR-I Data
        </button>
      </div>

      <div className="mri-preview-section-label">Lists &amp; libraries — remove what isn't used</div>
      <div className="cards" style={{ marginBottom: 24 }}>
        <div className="card" style={{ cursor: "default" }}>
          <div className="card-main">
            <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>Kinds of units <span style={{ fontWeight: 400, color: "var(--text-soft)" }}>· Asset Types</span></div>
            <div className="desc">Removes every kind of unit that nothing uses</div>
          </div>
          <div className="card-actions">
            <button
              className="danger"
              onClick={() => requestReferencePurge(
                "Asset Types",
                "This will permanently delete all asset types that aren't currently referenced by an asset or template.",
                () => purgeAssetTypes.mutateAsync()
              )}
            >
              Purge
            </button>
          </div>
        </div>

        <div className="card" style={{ cursor: "default" }}>
          <div className="card-main">
            <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>Check groups <span style={{ fontWeight: 400, color: "var(--text-soft)" }}>· Checklist Sections</span></div>
            <div className="desc">Removes every group no template uses</div>
          </div>
          <div className="card-actions">
            <button
              className="danger"
              onClick={() => requestReferencePurge(
                "Checklist Sections",
                "This will permanently delete all checklist sections that aren't currently referenced by a template.",
                () => purgeSections.mutateAsync()
              )}
            >
              Purge
            </button>
          </div>
        </div>

        <div className="card" style={{ cursor: "default" }}>
          <div className="card-main">
            <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>Checklist Bank <span style={{ fontWeight: 400, color: "var(--text-soft)" }}>· Checklist Databank</span></div>
            <div className="desc">Removes every check no template uses</div>
          </div>
          <div className="card-actions">
            <button
              className="danger"
              onClick={() => requestReferencePurge(
                "Checklist Databank",
                "This will permanently delete all checklist items that aren't currently referenced by a template.",
                () => purgeDatabank.mutateAsync()
              )}
            >
              Purge
            </button>
          </div>
        </div>

        <div className="card" style={{ cursor: "default" }}>
          <div className="card-main">
            <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>All drop-down lists <span style={{ fontWeight: 400, color: "var(--text-soft)" }}>· Lookups</span></div>
            <div className="desc">Removes every choice in every list (Country, Client, Service Line and the rest)</div>
          </div>
          <div className="card-actions">
            <button
              className="danger"
              onClick={() => requestReferencePurge(
                "All Lookups",
                "This will permanently delete every lookup value across all criteria — Country, Client, Service Line, and any others.",
                () => purgeLookups.mutateAsync(null)
              )}
            >
              Purge All
            </button>
          </div>
        </div>

        {criteriaList.map((c) => (
          <div className="card" key={c} style={{ cursor: "default" }}>
            <div className="card-main">
              <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>Drop-down list: {c}</div>
              <div className="desc">Removes only the choices in this list</div>
            </div>
            <div className="card-actions">
              <button
                className="ghost"
                onClick={() => requestReferencePurge(
                  `Lookups: ${c}`,
                  `This will permanently delete all lookup values under "${c}".`,
                  () => purgeLookups.mutateAsync(c)
                )}
              >
                Purge
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mri-preview-section-label">MR-I reports</div>
      <IsoSteps steps={["Choose what to clear", "Check how many match", "Confirm"]} current={pendingPurge ? 2 : hasAnyFilter ? 1 : 0} />
      <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 14 }}>
        Pick any of the filters below. Only reports that match <strong>all</strong> of them are removed, with everything on them.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Asset</label>
          <select className="neu-select" value={filterAsset} onChange={(e) => setFilterAsset(e.target.value)}>
            <option value="">— Any —</option>
            {assets.map((a) => <option key={a.id} value={a.id ?? ""}>{a.asset_code}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Country</label>
          <select className="neu-select" value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
            <option value="">— Any —</option>
            {countryOptions.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Service Line</label>
          <select className="neu-select" value={filterServiceLine} onChange={(e) => setFilterServiceLine(e.target.value)}>
            <option value="">— Any —</option>
            {serviceLineOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Kind of unit</label>
          <select className="neu-select" value={filterAssetType} onChange={(e) => setFilterAssetType(e.target.value)}>
            <option value="">— Any —</option>
            {assetTypes.map((a) => <option key={a.id} value={a.id}>{a.description}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span className="count">
          {hasAnyFilter
            ? (previewCount !== null ? `${previewCount} ${previewCount === 1 ? "report matches" : "reports match"}` : "Counting…")
            : "Choose at least one filter"}
        </span>
        <button className="danger" disabled={!hasAnyFilter || !isAdmin} title={adminOnlyTip} onClick={requestReportsPurge}>
          Purge Matching Reports
        </button>
        <button
          className="ghost"
          disabled={!isAdmin}
          title={adminOnlyTip}
          onClick={() =>
            setPendingPurge({
              label: "ALL MR-I Reports",
              description: "This will permanently delete every MR-I report in the system, regardless of asset, country, service line, or asset type — including all their header, checklist, mid-section, and footer data. This cannot be undone.",
              moc: true,
              run: (m) => runPurge.mutateAsync({ filter: { asset_id: null, country: null, service_line: null, asset_type_id: null }, userId: currentUser?.id ?? 0, mocReference: m.reference, mocApprovedBy: m.approvedBy }),
            })
          }
        >
          Purge ALL Reports (no filter)
        </button>
      </div>

      <div className="tig-hint" role="note" style={{ marginTop: 16, maxWidth: 820 }}>
        MR-I reports can be deleted only by the Administrator, and only against an approved MOC authorised by the Country Manager.
        Every deleted report is recorded below.{!isAdmin && " You are not the Administrator, so the report buttons are off."}
      </div>

      <div className="mri-preview-section-label" style={{ marginTop: 24 }}>MR-I reports deleted ({deletions.length})</div>
      {deletions.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--text-soft)" }}>No MR-I report has been deleted.</p>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: 320, marginBottom: 8 }}>
          <table className="dp-del">
            <thead><tr><th>Deleted</th><th>Report</th><th>Unit</th><th>Status</th><th>Sent by</th><th>Deleted by</th><th>MOC</th><th>Approved by</th><th>How</th></tr></thead>
            <tbody>{deletions.map((d) => (
              <tr key={d.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtWhen(d.deleted_at)}</td><td>#{d.report_id}</td><td>{d.asset_code ?? "—"}</td><td>{d.report_status ?? "—"}</td>
                <td>{d.submitted_by ?? "—"}</td><td>{d.deleted_by}</td><td><b>{d.moc_reference}</b></td><td>{d.moc_approved_by}</td><td>{d.method}</td>
              </tr>
            ))}</tbody>
          </table>
          <style>{`.dp-del { width: 100%; border-collapse: collapse; font-size: 12.5px; } .dp-del th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-soft); padding: 6px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; } .dp-del td { padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }`}</style>
        </div>
      )}

      <div className="mri-preview-section-label" style={{ marginTop: 24 }}>Maintenance counters (running totals)</div>
      <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 14 }}>
        Zeroes out the running total (e.g. Engine Hours, Distance Travelled) on maintenance triggers, for one asset or all of them. Thresholds and the enabled toggle are left untouched — only the running count resets.
      </p>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
          <label>Asset</label>
          <select className="neu-select" value={resetTriggerAsset} onChange={(e) => setResetTriggerAsset(e.target.value)}>
            <option value="">— All assets —</option>
            {assets.map((a) => <option key={a.id} value={a.id ?? ""}>{a.asset_code}</option>)}
          </select>
        </div>
        <button
          className="danger"
          onClick={() => {
            const assetId = resetTriggerAsset ? Number(resetTriggerAsset) : null;
            const assetLabel = assetId
              ? assets.find((a) => a.id === assetId)?.asset_code ?? `asset #${assetId}`
              : "every asset";
            setPendingPurge({
              label: "Trigger Running Totals",
              description: `This will reset the running total on every enabled maintenance trigger for ${assetLabel} back to zero. This cannot be undone.`,
              run: () => resetTriggerRunningValues.mutateAsync(assetId),
            });
          }}
        >
          Reset Running Totals to Zero
        </button>
      </div>

      {pendingPurge && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18A2 2 0 0 0 3.54 21H20.46A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3>{pendingPurge.title ?? `Purge ${pendingPurge.label}?`}</h3>
            <p>{pendingPurge.description}</p>
            {pendingPurge.moc && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left", margin: "4px 0 8px" }}>
                <p style={{ fontSize: 12.5, color: "var(--text-soft)", margin: 0 }}>Deleting MR-I reports needs an approved MOC authorised by the Country Manager. It is recorded with each deleted report.</p>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="dp-moc-ref">Approved MOC reference</label>
                  <input id="dp-moc-ref" type="text" value={mocRef} onChange={(e) => setMocRef(e.target.value)} placeholder="For example MOC-2026-031" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="dp-moc-by">Approved by (Country Manager)</label>
                  <input id="dp-moc-by" type="text" value={mocBy} onChange={(e) => setMocBy(e.target.value)} placeholder="Name of the Country Manager" />
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setPendingPurge(null)}>Cancel</button>
              <button className="danger" disabled={!!pendingPurge.moc && (!mocRef.trim() || !mocBy.trim())} onClick={confirmPurge}>{pendingPurge.confirmLabel ?? "Purge"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataPurging;