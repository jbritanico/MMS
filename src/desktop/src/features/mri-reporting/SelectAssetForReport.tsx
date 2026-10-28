import { useState, type ReactElement } from "react";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useAssetTypes } from "../administration/hooks/useAssetTypes";
import { useMriTemplates } from "../administration/hooks/useMriTemplates";
import { useAssetTriggers } from "../asset-registry/hooks/useTriggers";
import { useAllTemplateComponents } from "../mri-template-builder/hooks/useTemplateComponents";
import type { Asset } from "../asset-registry/types";
import {
  useCreateMriReport,
  useCreateMriReportFromLastPostJob,
  useMriReports,
  useAssetsWithPendingIssues,
  useStandbyPrejobReminders,
  type LastPostJobInfo,
} from "./hooks/useMriReports";
import { invoke } from "../../lib/ipc";
import { useCurrentUser } from "../../lib/currentUser";
import { useUserCountryAccess } from "../administration/hooks/useUserAdmin";

// Same mapping used on the Maintenance Triggers admin screen.
const TRIGGER_TYPE_LABELS: Record<string, string> = {
  OH: "Operating hours",
  CA: "Calendar days",
  KM: "Distance (KM)",
  RIF: "Running-in-foot",
  EH: "Engine hours",
};

// Distinct accent colors per trigger type, using the app's existing theme-aware
// color tokens so they adapt correctly across light/dark/other themes.
const TRIGGER_TYPE_COLORS: Record<string, string> = {
  OH: "var(--accent-blue)",
  CA: "var(--warn)",
  KM: "var(--success)",
  RIF: "var(--accent)",
  EH: "var(--danger)",
};

const TRIGGER_TYPE_ICONS: Record<string, ReactElement> = {
  OH: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  CA: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 9h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  KM: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  RIF: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="9" width="18" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9v3M11 9v3M15 9v3M19 9v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  EH: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 15a8 8 0 1 1 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 15l4-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" />
    </svg>
  ),
};

const DEFAULT_TRIGGER_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </svg>
);
interface AssetSelectCardProps {
  asset: Asset;
  icon: string | undefined;
  assetTypeLabel: string;
  disabled: boolean;
  hasPendingIssue: boolean;
  noTemplate: boolean;
  blockingReportId: number | null;
  blockingStatus: string | null;
  isCreating: boolean;
  standbyDay: number | null;
  componentLabels: string[];
  onSelect: () => void;
}

// A separate component (not inline in the map below) because it needs to call
// useAssetTriggers for its own asset -- hooks can't be called conditionally
// inside a .map() in the parent component.
function AssetSelectCard({
  asset,
  icon,
  assetTypeLabel,
  disabled,
  hasPendingIssue,
  noTemplate,
  blockingReportId,
  blockingStatus,
  isCreating,
  standbyDay,
  componentLabels,
  onSelect,
}: AssetSelectCardProps) {
  const { data: triggers = [] } = useAssetTriggers(asset.id);
  const activeTriggers = triggers.filter((t) => t.enabled);

  return (
    <div
      className={`asset-select-card ${disabled ? "asset-select-card-disabled" : ""}`}
      onClick={() => !disabled && onSelect()}
      style={{ position: "relative" }}
    >
      <span
        className="asset-status-dot"
        style={{ background: hasPendingIssue ? "var(--danger)" : "var(--accent)" }}
        title={hasPendingIssue ? "Has pending issue" : "No pending issues"}
      />
      <div className="asset-select-card-body">
        <div className="asset-select-icon">
          {icon ? <img src={icon} alt="" /> : <span className="asset-select-icon-placeholder">—</span>}
          <div className="asset-select-code">{asset.asset_code}</div>
        </div>
        <div className="asset-select-info">
          <div className="asset-select-desc">{asset.asset_description || "—"}</div>
          <div className="asset-select-meta">
            <span className="pill neutral">{assetTypeLabel}</span>
            <span className="pill neutral" title="Country of this asset">
              {asset.country || "No country"}
            </span>
            {componentLabels.length > 0 && (
              <span className="pill neutral" title="Choose the component when you start a report">
                Components: {componentLabels.join(" · ")}
              </span>
            )}
            {activeTriggers.map((t) => (
              <span
                key={t.id}
                className="trigger-icon-chip"
                title={TRIGGER_TYPE_LABELS[t.trigger_type] ?? t.trigger_type}
              >
                <span
                  style={{
                    color: TRIGGER_TYPE_COLORS[t.trigger_type] ?? "var(--text-soft)",
                    display: "inline-flex",
                  }}
                >
                  {TRIGGER_TYPE_ICONS[t.trigger_type] ?? DEFAULT_TRIGGER_ICON}
                </span>
                <span>{t.running_value}/{t.interval_value}</span>
              </span>
            ))}
            {noTemplate && <span className="pill inactive">No template</span>}
            {blockingReportId !== null && blockingStatus && (
              <span className="pill inactive" title={`Report #${blockingReportId} is ${blockingStatus}`}>
                {blockingStatus} — pending closure
              </span>
            )}
            {standbyDay !== null && (
              <span className="pill inactive" title="Equipment kept on stand-by after its Post-Job report needs a new Pre-Job MR-I on day 8">
                Pre-Job due — day {standbyDay}
              </span>
            )}
            {isCreating && <span className="pill neutral">Starting...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SelectAssetForReportProps {
  onReportCreated: (reportId: number) => void;
}
function SelectAssetForReport({ onReportCreated }: SelectAssetForReportProps) {
  const { data: assets = [] } = useAssets();
  const { data: assetTypes = [] } = useAssetTypes();
  const { data: templates = [] } = useMriTemplates();
  const { data: existingReports = [] } = useMriReports();
  const { data: pendingIssueAssetIds = [] } = useAssetsWithPendingIssues();
  const createReport = useCreateMriReport();
  const createFromPostJob = useCreateMriReportFromLastPostJob();
  const { data: standbyReminders = [] } = useStandbyPrejobReminders();
  const { data: allComponents = [] } = useAllTemplateComponents();
  // Template with components: the user picks which component the report is for.
  const [componentChoice, setComponentChoice] = useState<{ assetId: number; assetTypeId: number | null } | null>(null);
  // Figure 2: shown when the last report on the chosen asset was a Post-Job one, so the
  // user picks between duplicating it (<= 72 h) and starting a fresh Pre-Mob.
  const [postJobChoice, setPostJobChoice] = useState<{
    assetId: number;
    templateId: number;
    componentId: number | null;
    info: LastPostJobInfo;
  } | null>(null);
  const { user: currentUser } = useCurrentUser();
  // Empty array = unrestricted (sees every country) -- the same convention the backend uses.
  const { data: myCountries = [] } = useUserCountryAccess(currentUser?.id ?? 0);

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
    (a) =>
      a.active &&
      `${a.asset_code} ${a.asset_description}`.toLowerCase().includes(query.toLowerCase()) &&
      (myCountries.length === 0 || myCountries.includes(a.country))
  );

  // The components an MR-I template defines (e.g. Left / Right pump).
  function componentsFor(templateId: number | undefined) {
    return templateId === undefined ? [] : allComponents.filter((c) => c.template_id === templateId && c.active);
  }

  // Reports are tracked per component: a pending report on the Left pump does not block a
  // report on the Right pump. componentId null = the whole asset (assets with no components).
  function blockingReportFor(assetId: number, componentId: number | null = null) {
    // Mirrors the backend's create_mri_report guard: any report on this asset (or component)
    // that isn't Draft (still being filled out) or Approved (finished) blocks a new one.
    return existingReports.find(
      (r) =>
        r.asset_id === assetId &&
        (r.component_id ?? null) === componentId &&
        r.status !== "Draft" &&
        r.status !== "Approved"
    );
  }

  function draftFor(assetId: number, templateId: number, componentId: number | null) {
    return existingReports.find(
      (r) =>
        r.asset_id === assetId &&
        r.template_id === templateId &&
        (r.component_id ?? null) === componentId &&
        r.status === "Draft"
    );
  }

  async function handleSelect(assetId: number, assetTypeId: number | null, componentId: number | null = null) {
    const template = findActiveTemplate(assetTypeId);
    if (!template) {
      flash("No active MR-I template exists for this asset's type yet", "err");
      return;
    }

    // A template with components asks which component this report is for first.
    if (componentId === null && componentsFor(template.id).length > 0) {
      setComponentChoice({ assetId, assetTypeId });
      return;
    }

    const existingDraft = draftFor(assetId, template.id, componentId);
    if (existingDraft) {
      onReportCreated(existingDraft.id);
      return;
    }

    const blocking = blockingReportFor(assetId, componentId);
    if (blocking) {
      flash(
        `Report #${blocking.id} for this asset${componentId !== null ? " component" : ""} is still ${blocking.status} — it must be closed before a new MR-I report can be started.`,
        "err"
      );
      return;
    }

    let info: LastPostJobInfo | null = null;
    try {
      info = await invoke<LastPostJobInfo | null>("get_last_post_job_info", { assetId, componentId });
    } catch {
      info = null;
    }
    if (info) {
      setPostJobChoice({ assetId, templateId: template.id, componentId, info });
      return;
    }

    await startBlank(assetId, template.id, componentId);
  }

  async function startBlank(assetId: number, templateId: number, componentId: number | null = null) {
    setPostJobChoice(null);
    setCreatingFor(assetId);
    try {
      const reportId = await createReport.mutateAsync({ template_id: templateId, asset_id: assetId, component_id: componentId });
      onReportCreated(reportId);
    } catch (err) {
      flash(String(err), "err");
    } finally {
      setCreatingFor(null);
    }
  }

  async function startFromPostJob(assetId: number, templateId: number, componentId: number | null = null) {
    setPostJobChoice(null);
    setCreatingFor(assetId);
    try {
      const reportId = await createFromPostJob.mutateAsync({ assetId, templateId, componentId });
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
      {standbyReminders.length > 0 && (
        <div className="toast err" style={{ maxWidth: 600, marginBottom: 16 }}>
          <strong>Pre-Job MR-I due (stand-by equipment reached day 8):</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {standbyReminders.map((r) => (
              <li key={`${r.asset_id}-${r.component_id ?? "all"}`}>
                {r.asset_code}{r.component_label ? ` (${r.component_label})` : ""} — day {r.days_since} since its Post-Job report
              </li>
            ))}
          </ul>
        </div>
      )}
      {postJobChoice && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: "min(520px, 94vw)", textAlign: "left" }}>
            <h3 style={{ marginTop: 0 }}>Last report was a Post-Job report</h3>
            {postJobChoice.info.within_72h ? (
              <p>
                It was submitted {postJobChoice.info.hours_since} hours ago (72 hours or less). You can
                duplicate it as the new Pre-Mob report, so only minimal additional entries are needed.
              </p>
            ) : (
              <p>
                It was submitted {postJobChoice.info.hours_since} hours ago (more than 72 hours). No
                duplication is permitted — a new Pre-Mob MR-I must be completed.
              </p>
            )}
            <div className="modal-actions" style={{ justifyContent: "flex-start", gap: 10 }}>
              {postJobChoice.info.within_72h && (
                <button
                  className="primary"
                  onClick={() => startFromPostJob(postJobChoice.assetId, postJobChoice.templateId, postJobChoice.componentId)}
                >
                  Copy last Post-Job report
                </button>
              )}
              <button
                className={postJobChoice.info.within_72h ? "ghost" : "primary"}
                onClick={() => startBlank(postJobChoice.assetId, postJobChoice.templateId, postJobChoice.componentId)}
              >
                Start a new report
              </button>
              <button className="ghost" onClick={() => setPostJobChoice(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {componentChoice && (() => {
        const template = findActiveTemplate(componentChoice.assetTypeId);
        const asset = assets.find((a) => a.id === componentChoice.assetId);
        return (
          <div className="modal-overlay" onClick={() => setComponentChoice(null)}>
            <div className="modal" style={{ width: "min(480px, 94vw)", textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Which component?</h3>
              <p style={{ fontSize: 13 }}>
                <strong>{asset?.asset_code}</strong> is inspected per component. Each is inspected and reported
                separately, using the same template{template ? ` (${template.template_name})` : ""}.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "12px 0" }}>
                {componentsFor(template?.id).map((c) => {
                  const draft = template ? draftFor(componentChoice.assetId, template.id, c.id) : undefined;
                  const blocking = blockingReportFor(componentChoice.assetId, c.id);
                  const blocked = !!blocking && !draft;
                  return (
                    <button
                      key={c.id}
                      className={blocked ? "ghost" : "primary"}
                      disabled={blocked}
                      style={{ textAlign: "left" }}
                      onClick={() => {
                        const target = componentChoice;
                        setComponentChoice(null);
                        handleSelect(target.assetId, target.assetTypeId, c.id);
                      }}
                    >
                      {c.label}
                      <span style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                        {draft
                          ? `Continue draft (#${draft.id})`
                          : blocked
                            ? `Report #${blocking!.id} is ${blocking!.status} — close it first`
                            : "Start new report"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                <button className="ghost" onClick={() => setComponentChoice(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
      {filtered.length === 0 ? (
        <div className="empty">No active assets match your search</div>
      ) : (
        <div className="asset-select-grid">
          {filtered.map((a) => {
            const template = findActiveTemplate(a.asset_type_id);
            const comps = componentsFor(template?.id);
            const hasComponents = comps.length > 0;
            const hasDraftForTemplate =
              a.id !== null && !!template &&
              existingReports.some(
                (r) => r.asset_id === a.id && r.template_id === template.id && (r.component_id ?? null) === null && r.status === "Draft"
              );
            // With components, blocking is decided per component in the picker, not on the card.
            const blockingReport = a.id !== null && !hasComponents ? blockingReportFor(a.id, null) : undefined;
            const disabled = !template || creatingFor === a.id || (!!blockingReport && !hasDraftForTemplate);
            const icon = assetTypes.find((t) => t.id === a.asset_type_id)?.icon;
            const resolvedIcon = icon && icon.trim().startsWith("data:") ? icon : undefined;
            return (
              <AssetSelectCard
                key={a.id}
                asset={a}
                icon={resolvedIcon}
                assetTypeLabel={assetTypeName(a.asset_type_id)}
                disabled={disabled}
                hasPendingIssue={a.id !== null && pendingIssueAssetIds.includes(a.id)}
                noTemplate={!template}
                blockingReportId={blockingReport && !hasDraftForTemplate ? blockingReport.id : null}
                blockingStatus={blockingReport && !hasDraftForTemplate ? blockingReport.status : null}
                isCreating={creatingFor === a.id}
                standbyDay={standbyReminders.find((r) => r.asset_id === a.id)?.days_since ?? null}
                componentLabels={comps.map((c) => c.label)}
                onSelect={() => a.id !== null && handleSelect(a.id, a.asset_type_id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SelectAssetForReport;