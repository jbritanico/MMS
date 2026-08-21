import { useState } from "react";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useAssetTypes } from "../administration/hooks/useAssetTypes";
import { useMriTemplates } from "../administration/hooks/useMriTemplates";
import { useCreateMriReport } from "./hooks/useMriReports";

interface SelectAssetForReportProps {
  onReportCreated: (reportId: number) => void;
}

function SelectAssetForReport({ onReportCreated }: SelectAssetForReportProps) {
  const { data: assets = [] } = useAssets();
  const { data: assetTypes = [] } = useAssetTypes();
  const { data: templates = [] } = useMriTemplates();
  const createReport = useCreateMriReport();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [creatingFor, setCreatingFor] = useState<number | null>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 4000);
  }

  function findActiveTemplate(assetTypeId: number | null) {
    if (!assetTypeId) return null;
    return templates.find((t) => t.asset_type_id === assetTypeId && t.status === "Active") ?? null;
  }

  function assetTypeName(id: number | null) {
    return assetTypes.find((a) => a.id === id)?.description ?? "No type assigned";
  }

  const filtered = assets.filter(
    (a) => a.active && `${a.asset_code} ${a.asset_description}`.toLowerCase().includes(query.toLowerCase())
  );

  async function handleSelect(assetId: number, assetTypeId: number | null) {
    const template = findActiveTemplate(assetTypeId);
    if (!template) {
      flash("No active MR-I template exists for this asset's type yet", "err");
      return;
    }
    setCreatingFor(assetId);
    try {
      const reportId = await createReport.mutateAsync({ template_id: template.id, asset_id: assetId });
      onReportCreated(reportId);
    } catch (err) {
      flash(String(err), "err");
    } finally {
      setCreatingFor(null);
    }
  }

  return (
    <div>
      <div className="header">
        <h1>Select asset</h1>
        <span className="sub">Choose which equipment this report is for</span>
      </div>

      <input
        type="text"
        className="search"
        placeholder="Search by asset code or description..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", maxWidth: 400, marginBottom: 16 }}
      />

      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}
      {filtered.length === 0 ? (
        <div className="empty">No active assets match your search</div>
      ) : (
        <div className="asset-select-grid">
          {filtered.map((a) => {
            const template = findActiveTemplate(a.asset_type_id);
            const disabled = !template || creatingFor === a.id;
            return (
              <div
                key={a.id}
                className={`asset-select-card ${disabled ? "asset-select-card-disabled" : ""}`}
                onClick={() => !disabled && a.id !== null && handleSelect(a.id, a.asset_type_id)}
              >
                <div className="asset-select-code">{a.asset_code}</div>
                <div className="asset-select-desc">{a.asset_description || "—"}</div>
                <div className="asset-select-meta">
                  <span className="pill neutral">{assetTypeName(a.asset_type_id)}</span>
                  {!template && <span className="pill inactive">No template</span>}
                  {creatingFor === a.id && <span className="pill neutral">Starting...</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SelectAssetForReport;