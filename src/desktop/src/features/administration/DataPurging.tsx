import { useState, useEffect } from "react";
import {
  usePurgeAssetTypes,
  usePurgeChecklistSections,
  usePurgeChecklistDatabank,
  usePurgeLookups,
  usePreviewMriReportPurge,
  usePurgeMriReports,
  type MriReportPurgeFilter,
} from "./hooks/usePurging";
import { useLookupCriteria, useLookups } from "./hooks/useLookups";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useAssetTypes } from "./hooks/useAssetTypes";

type PendingPurge = {
  label: string;
  description: string;
  run: () => Promise<string>;
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

  const [filterAsset, setFilterAsset] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterServiceLine, setFilterServiceLine] = useState("");
  const [filterAssetType, setFilterAssetType] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);

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
    try {
      const result = await pendingPurge.run();
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
      run: () => runPurge.mutateAsync(currentFilter),
    });
  }

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Data Purging</h2>
      <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>
        Permanently remove reference data or MR-I reports. All actions require confirmation and cannot be undone.
      </p>
      <p style={{ fontSize: 11.5, color: "var(--warn)", marginBottom: 20 }}>
        ⚠ Reference purges skip any row still referenced elsewhere (e.g. an asset type used by a template).
      </p>

      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 600, marginBottom: 16 }}>{status.msg}</div>}

      <div className="mri-preview-section-label">Reference Data</div>
      <div className="cards" style={{ marginBottom: 24 }}>
        <div className="card" style={{ cursor: "default" }}>
          <div className="card-main">
            <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>Asset Types</div>
            <div className="desc">Removes all asset types not currently in use</div>
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
            <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>Checklist Sections</div>
            <div className="desc">Removes all sections not currently in use</div>
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
            <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>Checklist Databank</div>
            <div className="desc">Removes all checklist items not currently in use</div>
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
            <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>Lookups (All Criteria)</div>
            <div className="desc">Removes every value under every lookup criteria (Country, Client, Service Line, etc.)</div>
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
              <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>Lookups: {c}</div>
              <div className="desc">Removes only values under this criteria</div>
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

      <div className="mri-preview-section-label">MR-I Reports</div>
      <p style={{ fontSize: 12.5, color: "var(--text-soft)", marginBottom: 14 }}>
        Select any combination of filters below. Reports matching <strong>all</strong> selected filters will be purged, including their full header/checklist/mid/footer data.
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
          <label>Asset Type</label>
          <select className="neu-select" value={filterAssetType} onChange={(e) => setFilterAssetType(e.target.value)}>
            <option value="">— Any —</option>
            {assetTypes.map((a) => <option key={a.id} value={a.id}>{a.description}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span className="count">
          {hasAnyFilter
            ? (previewCount !== null ? `${previewCount} report(s) match` : "Calculating...")
            : "No filters selected"}
        </span>
        <button className="danger" disabled={!hasAnyFilter} onClick={requestReportsPurge}>
          Purge Matching Reports
        </button>
        <button
          className="ghost"
          onClick={() =>
            setPendingPurge({
              label: "ALL MR-I Reports",
              description: "This will permanently delete every MR-I report in the system, regardless of asset, country, service line, or asset type — including all their header, checklist, mid-section, and footer data. This cannot be undone.",
              run: () => runPurge.mutateAsync({ asset_id: null, country: null, service_line: null, asset_type_id: null }),
            })
          }
        >
          Purge ALL Reports (no filter)
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
            <h3>Purge {pendingPurge.label}?</h3>
            <p>{pendingPurge.description}</p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setPendingPurge(null)}>Cancel</button>
              <button className="danger" onClick={confirmPurge}>Purge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataPurging;