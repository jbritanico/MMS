import { useState, useEffect, useRef, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  useMriReport,
  useSubmitMriReport,
  useEndorseMriReport,
  useCloseMriReport,
  useReviewAndCloseMriReport,
  usePreviousEngineHours,
  usePreviousComplianceStage,
  usePendingChecklistItemIds,
} from "./hooks/useMriReports";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useMriTemplates } from "../administration/hooks/useMriTemplates";
import {
  useTemplateHeaderFields,
  useHeaderFieldCatalog,
} from "../mri-template-builder/hooks/useTemplateHeaderFields";
import {
  useTemplateMidFields,
  useMidFieldCatalog,
} from "../mri-template-builder/hooks/useTemplateMidFields";
import DistanceMapField from "./DistanceMapField";
import {
  useTemplateFooterFields,
  useFooterFieldCatalog,
} from "../mri-template-builder/hooks/useTemplateFooterFields";
import {
  useMriReportHeaderValues,
  useSetMriReportHeaderValue,
  useMriReportChecklistResults,
  useSetMriReportChecklistResult,
  useMriReportMidValues,
  useSetMriReportMidValue,
  useMriReportFooterValues,
  useSetMriReportFooterValue,
  useMriReportAttachments,
  useAddMriReportAttachment,
  useDeleteMriReportAttachment,
  useMriChecklistHistory,
  type MriReportChecklistResult,
  type MriReportAttachment,
  type MriChecklistHistoryEntry,
} from "./hooks/useMriReportValues";
import {
  useCarriedForwardFaults,
  useOpenPriorIssues,
} from "./hooks/useMriFaultApprovals";
import { useCurrentUser } from "../../lib/currentUser";
import {
  useAppUsers,
  useEffectivePermissions,
} from "../administration/hooks/useUserAdmin";
import { useTemplateChecklistItems } from "../mri-template-builder/hooks/useTemplateChecklistItems";
import { useChecklistItems } from "../administration/hooks/useChecklistDataBank";
import {
  useTemplateDrawing,
  useTemplateDrawingHotspots,
} from "../mri-template-builder/hooks/useTemplateDrawing";
import { useChecklistSections } from "../administration/hooks/useChecklistSections";
import { useLookups } from "../administration/hooks/useLookups";
import { useAssetTriggers } from "../asset-registry/hooks/useTriggers";

type Step = "header" | "checklist" | "mid" | "footer" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "header", label: "Header" },
  { id: "checklist", label: "Checklist" },
  { id: "mid", label: "Distance Travelled" },
  { id: "footer", label: "Footer" },
  { id: "review", label: "Review & Submit" },
];

interface ReportWizardProps {
  reportId: number;
  onBack: () => void;
  viewOnly?: boolean;
}

function ReportWizard({
  reportId,
  onBack,
  viewOnly = false,
}: ReportWizardProps) {
  const { data: report } = useMriReport(reportId);
  const { data: assets = [] } = useAssets();
  const { data: templates = [] } = useMriTemplates();
  const { data: carriedForward = [] } = useCarriedForwardFaults(reportId);
  const { data: openPriorIssues = [] } = useOpenPriorIssues(
    report?.asset_id ?? null,
    reportId,
  );
  const submitReport = useSubmitMriReport();
  const endorseReport = useEndorseMriReport();
  const closeReport = useCloseMriReport();
  const reviewAndCloseReport = useReviewAndCloseMriReport();
  const { user: currentUser } = useCurrentUser();
  const { data: permissions = [] } = useEffectivePermissions(
    currentUser?.id ?? 0,
  );
  const canEndorse = permissions.includes("mri.endorse_report");
  const { data: checklistResultsForReview = [] } =
    useMriReportChecklistResults(reportId);
  const hasEscalatableFault = checklistResultsForReview.some(
    (r) =>
      r.status === "Fail" &&
      (r.severity === "Moderate" || r.severity === "Critical"),
  );
  // While the report is Submitted and awaiting review, the Supervisor may unlock and
  // close pending Minor checklist items before using Close & Approve Report -- but only
  // on the no-issue/Minor path (a report with escalatable faults must go through Endorse
  // Report and the Pending Approvals queue instead).
  const canReviewClosure =
    report?.status === "Submitted" && canEndorse && !hasEscalatableFault;

  const [step, setStep] = useState<Step>("header");
  const [status, setStatus] = useState<{
    msg: string;
    kind: "ok" | "err";
  } | null>(null);
  const [reviewIssues, setReviewIssues] = useState<string[]>([]);
  const [showSubmittedDialog, setShowSubmittedDialog] = useState(false);
  const [showEndorsedDialog, setShowEndorsedDialog] = useState<string | null>(
    null,
  );
  const [showClosedDialog, setShowClosedDialog] = useState(false);
  const currentIndex = STEPS.findIndex((s) => s.id === step);

  // Opening a report from Asset MR-I History (or any other already-submitted report)
  // should land straight on the Review & Submit step, so it shows the same 2-page
  // dashboard/checklist report layout used everywhere else -- instead of starting back
  // at Header the way a brand-new Draft report does.
  useEffect(() => {
    if (report && report.status !== "Draft") {
      setStep("review");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id]);
  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 4000);
  }

  function goNext() {
    if (currentIndex < STEPS.length - 1) setStep(STEPS[currentIndex + 1].id);
  }
  function goBack() {
    if (currentIndex > 0) setStep(STEPS[currentIndex - 1].id);
  }

  async function handleSubmit() {
    if (reviewIssues.length > 0) {
      flash("Resolve the issues listed in Review before submitting", "err");
      return;
    }
    try {
      await submitReport.mutateAsync({
        id: reportId,
        submittedBy: currentUser?.name ?? "Unknown",
      });
      setShowSubmittedDialog(true);
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function handleEndorse() {
    if (!currentUser) return;
    try {
      const message = await endorseReport.mutateAsync({
        reportId,
        endorsedBy: currentUser.name,
      });
      setShowEndorsedDialog(message);
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function handleClose() {
    if (!currentUser) return;
    try {
      await closeReport.mutateAsync({ reportId, closedBy: currentUser.name });
      setShowClosedDialog(true);
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function handleReviewAndClose() {
    if (!currentUser) return;
    try {
      await reviewAndCloseReport.mutateAsync({
        reportId,
        closedBy: currentUser.name,
      });
      setShowClosedDialog(true);
    } catch (err) {
      flash(String(err), "err");
    }
  }

  if (!report) {
    return <div className="empty">Loading report...</div>;
  }

  const asset = assets.find((a) => a.id === report.asset_id);
  const template = templates.find((t) => t.id === report.template_id);
  const alreadySubmitted = report.status !== "Draft";
  // Once submitted, only the reviewing Supervisor (canEndorse) may keep editing -- and
  // only until the report is actually closed (Approved). Everyone else, and the
  // Supervisor too once it's Approved, sees it fully read-only. A report opened from
  // Asset MR-I History (viewOnly) is always read-only regardless of role or status --
  // that screen exists purely to look at past reports, not to act on them.
  const fieldsLocked =
    viewOnly ||
    report.status === "Approved" ||
    (alreadySubmitted && !canEndorse);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <button
          className="ghost"
          onClick={onBack}
          style={{ padding: "6px 12px", fontSize: 12 }}
        >
          ← Back
        </button>
      </div>

      <div className="header">
        <h1>{asset?.asset_code ?? "Report"} — MR-I</h1>
        <span className="sub">
          {template?.template_name ?? ""} · {report.status}
        </span>
      </div>

      {carriedForward.length > 0 && (
        <div className="toast err" style={{ maxWidth: 600, marginBottom: 16 }}>
          <strong>
            Inheriting {carriedForward.length} carried-forward issue
            {carriedForward.length === 1 ? "" : "s"} from a previous report:
          </strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {carriedForward.map((f) => (
              <li key={f.id}>
                {f.checklist_description ?? "Checklist item"} —{" "}
                {f.original_severity}
                {f.notes ? ` (${f.notes})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {openPriorIssues.length > 0 && (
        <div
          className="panel"
          style={{
            maxWidth: 600,
            marginBottom: 16,
            padding: 14,
            background: "var(--neu-bg)",
          }}
        >
          <strong style={{ fontSize: 13 }}>
            {openPriorIssues.length} open issue
            {openPriorIssues.length === 1 ? "" : "s"} still pending from earlier
            reports on this asset (read-only history):
          </strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {openPriorIssues.map((issue) => (
              <li key={issue.id} style={{ fontSize: 12.5, marginBottom: 6 }}>
                <strong>
                  {issue.checklist_description ?? "Checklist item"}
                </strong>
                {issue.severity ? ` — ${issue.severity}` : ""}
                {issue.issue_details ? (
                  <div style={{ color: "var(--text-soft)" }}>
                    Issue: {issue.issue_details}
                  </div>
                ) : null}
                {issue.action_taken ? (
                  <div style={{ color: "var(--text-soft)" }}>
                    Action Taken: {issue.action_taken}
                  </div>
                ) : null}
                {issue.date_observed ? (
                  <div style={{ color: "var(--text-soft)" }}>
                    Observed: {issue.date_observed} (Report #{issue.report_id})
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fieldsLocked && (
        <div className="toast err" style={{ maxWidth: 500, marginBottom: 16 }}>
          This report is {report.status.toLowerCase()} and can no longer be
          edited.
        </div>
      )}

      {alreadySubmitted && !fieldsLocked && (
        <div className="toast ok" style={{ maxWidth: 500, marginBottom: 16 }}>
          This report is {report.status.toLowerCase()}. As the reviewing
          Supervisor you can still edit it until it's closed.
        </div>
      )}
      {!viewOnly &&
        report.status === "Submitted" &&
        canEndorse &&
        hasEscalatableFault && (
          <div
            className="panel"
            style={{ maxWidth: 500, marginBottom: 16, padding: 14 }}
          >
            <p style={{ fontSize: 13, marginBottom: 10 }}>
              This report has Moderate/Critical faults requiring escalation.
              Endorsing it will move it to Escalated and send those faults to
              the Pending Approvals queue. It still needs to be closed
              afterward, once every escalated fault is resolved.
            </p>
            <button className="primary" onClick={handleEndorse}>
              Endorse Report
            </button>
          </div>
        )}

      {!viewOnly &&
        report.status === "Submitted" &&
        canEndorse &&
        !hasEscalatableFault && (
          <div
            className="panel"
            style={{ maxWidth: 500, marginBottom: 16, padding: 14 }}
          >
            <p style={{ fontSize: 13, marginBottom: 10 }}>
              This report has no Moderate/Critical faults. Review the checklist
              below — you can mark any pending Minor issue as Closed — then
              close and approve the report directly.
            </p>
            <button className="primary" onClick={handleReviewAndClose}>
              Close &amp; Approve Report
            </button>
          </div>
        )}

      {!viewOnly && report.status === "Escalated" && canEndorse && (
        <div
          className="panel"
          style={{ maxWidth: 500, marginBottom: 16, padding: 14 }}
        >
          <p style={{ fontSize: 13, marginBottom: 10 }}>
            This report is Escalated. It can be closed once every escalated
            fault has been reviewed (and, if Critical, rectified and verified).
          </p>
          <button className="primary" onClick={handleClose}>
            Close Report
          </button>
        </div>
      )}

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`wizard-step ${i === currentIndex ? "active" : ""} ${i < currentIndex ? "done" : ""}`}
          >
            <span className="wizard-step-dot">
              {i < currentIndex ? "✓" : i + 1}
            </span>
            <span className="wizard-step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {status && (
        <div
          className={`toast ${status.kind}`}
          style={{ maxWidth: 500, marginBottom: 16 }}
        >
          {status.msg}
        </div>
      )}

      <div className="panel" style={{ minHeight: 320 }}>
        {step === "header" && (
          <HeaderEntryStep
            templateId={report.template_id}
            reportId={reportId}
            locked={fieldsLocked}
            asset={asset}
          />
        )}
        {step === "checklist" && (
          <ChecklistEntryStep
            templateId={report.template_id}
            reportId={reportId}
            locked={fieldsLocked}
            assetId={report.asset_id}
            canReviewClosure={canReviewClosure}
          />
        )}
        {step === "mid" && (
          <MidEntryStep
            templateId={report.template_id}
            reportId={reportId}
            locked={fieldsLocked}
            assetId={report.asset_id}
          />
        )}
        {step === "footer" && (
          <FooterEntryStep
            templateId={report.template_id}
            reportId={reportId}
            locked={fieldsLocked}
          />
        )}
        {step === "review" && (
          <ReviewStep
            templateId={report.template_id}
            reportId={reportId}
            locked={fieldsLocked}
            onValidate={setReviewIssues}
            report={report}
            asset={asset}
          />
        )}
      </div>

      {!viewOnly && (
      <div className="actions" style={{ marginTop: 16 }}>
        <button
          className="ghost"
          onClick={goBack}
          disabled={currentIndex === 0}
        >
          ← Previous
        </button>
        {step !== "review" ? (
          <button className="primary" onClick={goNext}>
            Next →
          </button>
        ) : (
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={alreadySubmitted || reviewIssues.length > 0}
            title={
              reviewIssues.length > 0
                ? "Resolve the issues listed above first"
                : undefined
            }
          >
            {alreadySubmitted
              ? "Already submitted"
              : `Submit Report${reviewIssues.length > 0 ? ` (${reviewIssues.length} issue${reviewIssues.length === 1 ? "" : "s"})` : ""}`}
          </button>
        )}
      </div>
      )}

      {showSubmittedDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M20 6L9 17L4 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3>Report submitted</h3>
            <p>
              The report has been submitted and is now locked from further
              editing.
            </p>
            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => {
                  setShowSubmittedDialog(false);
                  onBack();
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showEndorsedDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M20 6L9 17L4 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3>Report endorsed</h3>
            <p>{showEndorsedDialog}</p>
            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => {
                  setShowEndorsedDialog(null);
                  onBack();
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showClosedDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M20 6L9 17L4 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3>Report closed</h3>
            <p>
              This MR-I report is now closed. A new report can be started for
              this asset.
            </p>
            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => {
                  setShowClosedDialog(false);
                  onBack();
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const INHERITED_FIELDS: Record<string, (asset: any) => string> = {
  country: (asset) => asset?.country ?? "",
  "service line": (asset) => asset?.service_line ?? "",
  "asset no": (asset) => asset?.asset_code ?? "",
};

const ENGINE_HOURS_PREVIOUS = "previous engine hours";
const ENGINE_HOURS_CURRENT = "current engine hours";
const ENGINE_HOURS_COMPUTED = "engine hours (this report)";
const CLIENT_FIELD = "client";
const JOB_OPERATING_HOURS = "job operating hours";
const MR_II_DUE_DATE = "mr ii due date";
const MR_INITIATION_DATE = "mr initization date";
const COMPLIANCE_STAGE_FIELD = "compliance stage";

const COMPLIANCE_STAGE_OPTIONS = [
  "PREMOB",
  "PRE-JOB",
  "POST JOB",
  "YARD INSPECTION",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function HeaderEntryStep({
  templateId,
  reportId,
  locked,
  asset,
}: {
  templateId: number;
  reportId: number;
  locked: boolean;
  asset: any;
}) {
  const { data: templateFields = [] } = useTemplateHeaderFields(templateId);
  const { data: catalog = [] } = useHeaderFieldCatalog();
  const { data: savedValues = [] } = useMriReportHeaderValues(reportId);
  const setValue = useSetMriReportHeaderValue(reportId);
  const { data: previousEngineHours } = usePreviousEngineHours(
    asset?.id ?? 0,
    reportId,
  );
  const { data: clientOptions = [] } = useLookups("CLIENT");
  const { data: triggers = [] } = useAssetTriggers(asset?.id ?? 0);

  const [localValues, setLocalValues] = useState<Record<number, string>>({});
  const persistedInherited = useState(() => new Set<number>())[0];
  const autoSavedDates = useState(() => new Set<number>())[0];
  const engineHoursPrefilled = useState(() => new Set<number>())[0];

  function fieldLabel(headerFieldId: number) {
    return catalog.find((c) => c.id === headerFieldId)?.label ?? "—";
  }

  function inheritedGetter(headerFieldId: number) {
    const label = fieldLabel(headerFieldId).trim().toLowerCase();
    return INHERITED_FIELDS[label];
  }

  const mr2CaTrigger = triggers.find(
    (t) => t.mr_level === "MR-II" && t.trigger_type === "CA",
  );
  let mr2DueDate = "";
  if (mr2CaTrigger) {
    const daysRemaining =
      mr2CaTrigger.interval_value - mr2CaTrigger.running_value;
    const due = new Date();
    due.setDate(due.getDate() + daysRemaining);
    mr2DueDate = due.toISOString().slice(0, 10);
  }

  useEffect(() => {
    const initial: Record<number, string> = {};
    savedValues.forEach((v) => {
      initial[v.template_header_field_id] = v.value ?? "";
    });
    setLocalValues(initial);
  }, [savedValues]);

  useEffect(() => {
    if (!asset || locked || templateFields.length === 0) return;
    templateFields.forEach((tf) => {
      const getter = inheritedGetter(tf.header_field_id);
      if (!getter) return;
      if (persistedInherited.has(tf.id)) return;
      const inheritedValue = getter(asset);
      const alreadySaved = savedValues.find(
        (v) => v.template_header_field_id === tf.id,
      );
      if (alreadySaved && alreadySaved.value === inheritedValue) {
        persistedInherited.add(tf.id);
        return;
      }
      persistedInherited.add(tf.id);
      setValue.mutate({ templateHeaderFieldId: tf.id, value: inheritedValue });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, templateFields.length, savedValues.length]);

  useEffect(() => {
    if (locked || templateFields.length === 0) return;
    templateFields.forEach((tf) => {
      const label = fieldLabel(tf.header_field_id).trim().toLowerCase();
      if (autoSavedDates.has(tf.id)) return;
      if (label === MR_INITIATION_DATE) {
        autoSavedDates.add(tf.id);
        setValue.mutate({ templateHeaderFieldId: tf.id, value: todayIso() });
      }
      if (label === MR_II_DUE_DATE && mr2DueDate) {
        autoSavedDates.add(tf.id);
        setValue.mutate({ templateHeaderFieldId: tf.id, value: mr2DueDate });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateFields.length, mr2DueDate, locked]);

  // "Current Engine Hours" is a cumulative meter reading, same as "Previous Engine
  // Hours" -- default it to last time's reading so an idle machine naturally computes
  // to a 0 delta instead of requiring the operator to know to leave it blank/zero.
  // Stays fully editable; only fills in once, and never overwrites a value the
  // operator (or a prior save) already put there.
  useEffect(() => {
    if (locked || templateFields.length === 0) return;
    if (previousEngineHours === undefined) return;
    templateFields.forEach((tf) => {
      const label = fieldLabel(tf.header_field_id).trim().toLowerCase();
      if (label !== ENGINE_HOURS_CURRENT) return;
      if (engineHoursPrefilled.has(tf.id)) return;
      const alreadySaved = savedValues.find(
        (v) => v.template_header_field_id === tf.id,
      );
      if (alreadySaved && alreadySaved.value) {
        engineHoursPrefilled.add(tf.id);
        return;
      }
      engineHoursPrefilled.add(tf.id);
      const defaultValue = previousEngineHours ?? "0";
      setLocalValues((prev) => ({ ...prev, [tf.id]: defaultValue }));
      setValue.mutate({ templateHeaderFieldId: tf.id, value: defaultValue });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateFields.length, previousEngineHours, locked, savedValues.length]);

  const sortedFields = [...templateFields].sort(
    (a, b) => a.display_order - b.display_order,
  );

  function handleChange(fieldId: number, value: string) {
    setLocalValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleBlur(fieldId: number) {
    if (locked) return;
    await setValue.mutateAsync({
      templateHeaderFieldId: fieldId,
      value: localValues[fieldId] ?? "",
    });

    const changedLabel = fieldLabel(
      templateFields.find((f) => f.id === fieldId)?.header_field_id ?? -1,
    )
      .trim()
      .toLowerCase();
    if (changedLabel === ENGINE_HOURS_CURRENT) {
      const computedField = templateFields.find(
        (f) =>
          fieldLabel(f.header_field_id).trim().toLowerCase() ===
          ENGINE_HOURS_COMPUTED,
      );
      if (computedField) {
        const currentVal = parseFloat(localValues[fieldId] ?? "0") || 0;
        const prevVal = parseFloat(previousEngineHours ?? "0") || 0;
        const computed = (currentVal - prevVal).toFixed(1);
        await setValue.mutateAsync({
          templateHeaderFieldId: computedField.id,
          value: computed,
        });
      }
    }
  }

  if (sortedFields.length === 0) {
    return (
      <div className="empty">This template has no header fields configured</div>
    );
  }

  return (
    <div>
      <h2>Header</h2>
      <div className="mri-preview-table">
        {sortedFields.map((tf) => {
          const label = fieldLabel(tf.header_field_id).trim().toLowerCase();
          const getter = inheritedGetter(tf.header_field_id);
          const isInherited = !!getter;

          if (label === ENGINE_HOURS_PREVIOUS) {
            const prevValue = previousEngineHours ?? "0";
            return (
              <div key={tf.id} className="mri-preview-table-row">
                <label>
                  {fieldLabel(tf.header_field_id)}
                  <span
                    style={{ color: "var(--text-soft)", fontStyle: "italic" }}
                  >
                    {" "}
                    (auto)
                  </span>
                </label>
                <input
                  type="text"
                  className="trigger-input"
                  value={prevValue}
                  disabled
                />
              </div>
            );
          }

          if (label === ENGINE_HOURS_CURRENT) {
            return (
              <div key={tf.id} className="mri-preview-table-row">
                <label>
                  {fieldLabel(tf.header_field_id)}
                  {tf.required && (
                    <span style={{ color: "var(--danger)" }}> *</span>
                  )}
                </label>
                <input
                  type="number"
                  className="trigger-input"
                  value={localValues[tf.id] ?? ""}
                  onChange={(e) => handleChange(tf.id, e.target.value)}
                  onBlur={() => handleBlur(tf.id)}
                  disabled={locked}
                />
              </div>
            );
          }

          if (label === CLIENT_FIELD) {
            return (
              <div key={tf.id} className="mri-preview-table-row">
                <label>
                  {fieldLabel(tf.header_field_id)}
                  {tf.required && (
                    <span style={{ color: "var(--danger)" }}> *</span>
                  )}
                </label>
                <select
                  className="neu-select"
                  value={localValues[tf.id] ?? ""}
                  onChange={(e) => handleChange(tf.id, e.target.value)}
                  onBlur={() => handleBlur(tf.id)}
                  disabled={locked}
                >
                  <option value="">— Select —</option>
                  {clientOptions
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            );
          }

          if (label === COMPLIANCE_STAGE_FIELD) {
            return (
              <div key={tf.id} className="mri-preview-table-row">
                <label>
                  {fieldLabel(tf.header_field_id)}
                  {tf.required && (
                    <span style={{ color: "var(--danger)" }}> *</span>
                  )}
                </label>
                <select
                  className="neu-select"
                  value={localValues[tf.id] ?? ""}
                  onChange={(e) => handleChange(tf.id, e.target.value)}
                  onBlur={() => handleBlur(tf.id)}
                  disabled={locked}
                >
                  <option value="">— Select —</option>
                  {COMPLIANCE_STAGE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (label === MR_II_DUE_DATE) {
            return (
              <div key={tf.id} className="mri-preview-table-row">
                <label>
                  {fieldLabel(tf.header_field_id)}
                  <span
                    style={{ color: "var(--text-soft)", fontStyle: "italic" }}
                  >
                    {" "}
                    (computed)
                  </span>
                </label>
                <input
                  type="text"
                  className="trigger-input"
                  value={mr2DueDate || "—"}
                  disabled
                />
              </div>
            );
          }

          if (label === MR_INITIATION_DATE) {
            return (
              <div key={tf.id} className="mri-preview-table-row">
                <label>
                  {fieldLabel(tf.header_field_id)}
                  <span
                    style={{ color: "var(--text-soft)", fontStyle: "italic" }}
                  >
                    {" "}
                    (auto)
                  </span>
                </label>
                <input
                  type="text"
                  className="trigger-input"
                  value={todayIso()}
                  disabled
                />
              </div>
            );
          }

          if (label === ENGINE_HOURS_COMPUTED) {
            const currentField = sortedFields.find(
              (f) =>
                fieldLabel(f.header_field_id).trim().toLowerCase() ===
                ENGINE_HOURS_CURRENT,
            );
            const currentVal =
              parseFloat(
                currentField ? (localValues[currentField.id] ?? "0") : "0",
              ) || 0;
            const prevVal = parseFloat(previousEngineHours ?? "0") || 0;
            const computed = (currentVal - prevVal).toFixed(1);
            return (
              <div key={tf.id} className="mri-preview-table-row">
                <label>
                  {fieldLabel(tf.header_field_id)}
                  <span
                    style={{ color: "var(--text-soft)", fontStyle: "italic" }}
                  >
                    {" "}
                    (computed)
                  </span>
                </label>
                <input
                  type="text"
                  className="trigger-input"
                  value={computed}
                  disabled
                />
              </div>
            );
          }

          const displayValue = isInherited
            ? getter!(asset)
            : (localValues[tf.id] ?? "");
          const isNumeric = label === JOB_OPERATING_HOURS;
          return (
            <div key={tf.id} className="mri-preview-table-row">
              <label>
                {fieldLabel(tf.header_field_id)}
                {tf.required && (
                  <span style={{ color: "var(--danger)" }}> *</span>
                )}
                {isInherited && (
                  <span
                    style={{ color: "var(--text-soft)", fontStyle: "italic" }}
                  >
                    {" "}
                    (from asset)
                  </span>
                )}
              </label>
              <input
                type={isNumeric ? "number" : "text"}
                className="trigger-input"
                value={displayValue}
                onChange={(e) => handleChange(tf.id, e.target.value)}
                onBlur={() => handleBlur(tf.id)}
                disabled={locked || isInherited}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DISTANCE_PRE_JOB_LABEL = "Distance Travelled Pre-Job (KM)";
const DISTANCE_POST_JOB_LABEL = "Distance Travelled Post-Job (KM)";

function MidEntryStep({
  templateId,
  reportId,
  locked,
  assetId,
}: {
  templateId: number;
  reportId: number;
  locked: boolean;
  assetId: number;
}) {
  const { data: templateFields = [] } = useTemplateMidFields(templateId);
  const { data: catalog = [] } = useMidFieldCatalog();
  const { data: savedValues = [] } = useMriReportMidValues(reportId);
  const setValue = useSetMriReportMidValue(reportId);
  const { data: previousComplianceStage } = usePreviousComplianceStage(
    assetId,
    reportId,
  );

  const { data: headerTemplateFields = [] } =
    useTemplateHeaderFields(templateId);
  const { data: headerCatalog = [] } = useHeaderFieldCatalog();
  const { data: headerValues = [] } = useMriReportHeaderValues(reportId);

  const [localValues, setLocalValues] = useState<Record<number, string>>({});
  const [mode, setMode] = useState<"odometer" | "map">("odometer");

  function fieldLabel(midFieldId: number) {
    return catalog.find((c) => c.id === midFieldId)?.label ?? "—";
  }

  function headerFieldLabel(headerFieldId: number) {
    return headerCatalog.find((c) => c.id === headerFieldId)?.label ?? "";
  }

  useEffect(() => {
    const initial: Record<number, string> = {};
    savedValues.forEach((v) => {
      initial[v.template_mid_field_id] = v.value ?? "";
    });
    setLocalValues(initial);
  }, [savedValues]);

  function handleChange(fieldId: number, value: string) {
    setLocalValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleBlur(fieldId: number) {
    if (locked) return;
    await setValue.mutateAsync({
      templateMidFieldId: fieldId,
      value: localValues[fieldId] ?? "",
      routePoints: null,
    });
  }

  async function handlePointsChange(
    fieldId: number,
    points: { lng: number; lat: number }[],
    km: number,
  ) {
    if (locked) return;
    setLocalValues((prev) => ({ ...prev, [fieldId]: String(km) }));
    await setValue.mutateAsync({
      templateMidFieldId: fieldId,
      value: String(km),
      routePoints: JSON.stringify(points),
    });
  }

  const complianceStageField = headerTemplateFields.find(
    (tf) =>
      headerFieldLabel(tf.header_field_id).trim().toLowerCase() ===
      COMPLIANCE_STAGE_FIELD,
  );
  const complianceStageValue = complianceStageField
    ? (headerValues.find(
        (v) => v.template_header_field_id === complianceStageField.id,
      )?.value ?? "")
    : "";
  const stage = complianceStageValue.trim().toUpperCase();
  const previousStage = (previousComplianceStage ?? "").trim().toUpperCase();
  const isYardFollowingPostJob =
    stage === "YARD INSPECTION" && previousStage === "POST JOB";

  const targetLabel =
    stage === "PRE-JOB"
      ? DISTANCE_PRE_JOB_LABEL
      : stage === "POST JOB"
        ? DISTANCE_POST_JOB_LABEL
        : isYardFollowingPostJob
          ? DISTANCE_POST_JOB_LABEL
          : null;

  if (!targetLabel) {
    return (
      <div>
        <h2>Distance Travelled</h2>
        <div className="empty">
          Distance Travelled is recorded once Compliance Stage is set to Pre-Job
          or Post Job in the Header section — or Yard Inspection, when the
          previous entry for this asset was Post Job.
        </div>
      </div>
    );
  }

  const targetField = templateFields.find(
    (tf) => fieldLabel(tf.mid_field_id) === targetLabel,
  );

  if (!targetField) {
    return (
      <div>
        <h2>Distance Travelled</h2>
        <div className="empty">
          This template has no "{targetLabel}" field configured
        </div>
      </div>
    );
  }

  const currentValue = localValues[targetField.id] ?? "";
  const savedRoutePointsRaw =
    savedValues.find((v) => v.template_mid_field_id === targetField.id)
      ?.route_points ?? null;
  let initialPoints: { lng: number; lat: number }[] | undefined;
  if (savedRoutePointsRaw) {
    try {
      const parsed = JSON.parse(savedRoutePointsRaw);
      if (Array.isArray(parsed)) initialPoints = parsed;
    } catch {
      initialPoints = undefined;
    }
  }

  return (
    <div>
      <h2>
        Distance Travelled
        <span
          style={{ color: "var(--text-soft)", fontWeight: 400, fontSize: 14 }}
        >
          {" "}
          (
          {stage === "PRE-JOB"
            ? "Pre-Job"
            : isYardFollowingPostJob
              ? "Post-Job — Yard Inspection"
              : "Post-Job"}
          )
        </span>
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          className={mode === "odometer" ? "primary" : "ghost"}
          style={{ padding: "6px 14px", fontSize: 12 }}
          onClick={() => setMode("odometer")}
        >
          Odometer
        </button>
        <button
          className={mode === "map" ? "primary" : "ghost"}
          style={{ padding: "6px 14px", fontSize: 12 }}
          onClick={() => setMode("map")}
        >
          Plot on Map
        </button>
      </div>

      {mode === "odometer" ? (
        <div className="mri-preview-table">
          <div className="mri-preview-table-row">
            <label>{targetLabel}</label>
            <input
              type="number"
              className="trigger-input"
              value={currentValue}
              onChange={(e) => handleChange(targetField.id, e.target.value)}
              onBlur={() => handleBlur(targetField.id)}
              disabled={locked}
            />
          </div>
        </div>
      ) : (
        <DistanceMapField
          initialPoints={initialPoints}
          locked={locked}
          onChange={(points, km) =>
            handlePointsChange(targetField.id, points, km)
          }
        />
      )}
    </div>
  );
}

const FOOTER_CHECKBOX_FIELDS = [
  "cleaned",
  "green tagged",
  "job ready",
  "pressure tested",
  "function tested",
];
const FOOTER_REMARKS_FIELD = "remarks";
const FOOTER_DATE_FIELDS = ["operator date", "supervisor date"];

function FooterEntryStep({
  templateId,
  reportId,
  locked,
}: {
  templateId: number;
  reportId: number;
  locked: boolean;
}) {
  const { data: templateFields = [] } = useTemplateFooterFields(templateId);
  const { data: catalog = [] } = useFooterFieldCatalog();
  const { data: savedValues = [] } = useMriReportFooterValues(reportId);
  const setValue = useSetMriReportFooterValue(reportId);
  const { user: currentUser } = useCurrentUser();
  const { data: allUsers = [] } = useAppUsers();

  const [localValues, setLocalValues] = useState<Record<number, string>>({});

  function fieldLabel(footerFieldId: number) {
    return catalog.find((c) => c.id === footerFieldId)?.label ?? "—";
  }

  useEffect(() => {
    const initial: Record<number, string> = {};
    savedValues.forEach((v) => {
      initial[v.template_footer_field_id] = v.value ?? "";
    });
    setLocalValues(initial);
  }, [savedValues]);

  const sortedFields = useMemo(
    () => [...templateFields].sort((a, b) => a.display_order - b.display_order),
    [templateFields],
  );

  // Operator/Job Supervisor footer fields identify each other: whichever of the two is
  // signed in gets their own field auto-filled and locked, and the OTHER field becomes a
  // dropdown of the matching role's users (see the render branches below).
  useEffect(() => {
    if (locked || !currentUser) return;
    const operatorField = sortedFields.find(
      (tf) =>
        fieldLabel(tf.footer_field_id).trim().toLowerCase() === "operator",
    );
    const supervisorField = sortedFields.find(
      (tf) =>
        fieldLabel(tf.footer_field_id).trim().toLowerCase() === "supervisor",
    );
    if (currentUser.role === "Operator" && operatorField) {
      const existing =
        savedValues.find((v) => v.template_footer_field_id === operatorField.id)
          ?.value ?? "";
      if (existing !== currentUser.name) {
        setValue.mutateAsync({
          templateFooterFieldId: operatorField.id,
          value: currentUser.name,
        });
      }
    }
    if (currentUser.role === "Job Supervisor" && supervisorField) {
      const existing =
        savedValues.find(
          (v) => v.template_footer_field_id === supervisorField.id,
        )?.value ?? "";
      if (existing !== currentUser.name) {
        setValue.mutateAsync({
          templateFooterFieldId: supervisorField.id,
          value: currentUser.name,
        });
      }
    }
  }, [currentUser, sortedFields, savedValues, locked]);

  function handleChange(fieldId: number, value: string) {
    setLocalValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleBlur(fieldId: number) {
    if (locked) return;
    await setValue.mutateAsync({
      templateFooterFieldId: fieldId,
      value: localValues[fieldId] ?? "",
    });
  }

  async function handleCheckboxChange(fieldId: number, checked: boolean) {
    const value = checked ? "Yes" : "No";
    setLocalValues((prev) => ({ ...prev, [fieldId]: value }));
    if (locked) return;
    await setValue.mutateAsync({ templateFooterFieldId: fieldId, value });
  }

  if (sortedFields.length === 0) {
    return (
      <div className="empty">This template has no footer fields configured</div>
    );
  }

  const checkboxFields = sortedFields.filter((tf) =>
    FOOTER_CHECKBOX_FIELDS.includes(
      fieldLabel(tf.footer_field_id).trim().toLowerCase(),
    ),
  );
  const otherFields = sortedFields.filter(
    (tf) =>
      !FOOTER_CHECKBOX_FIELDS.includes(
        fieldLabel(tf.footer_field_id).trim().toLowerCase(),
      ),
  );

  return (
    <div>
      <h2>Footer</h2>

      {checkboxFields.length > 0 && (
        <div className="checks">
          {checkboxFields.map((tf) => (
            <label key={tf.id} className="neu-check">
              <input
                type="checkbox"
                className="neu-check-input"
                checked={(localValues[tf.id] ?? "No") === "Yes"}
                onChange={(e) => handleCheckboxChange(tf.id, e.target.checked)}
                disabled={locked}
              />
              <span className="neu-check-box">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>{fieldLabel(tf.footer_field_id)}</span>
            </label>
          ))}
        </div>
      )}

      <div className="mri-preview-table">
        {otherFields.map((tf) => {
          const label = fieldLabel(tf.footer_field_id).trim().toLowerCase();

          if (label === FOOTER_REMARKS_FIELD) {
            return (
              <div key={tf.id} className="mri-preview-table-row">
                <label>{fieldLabel(tf.footer_field_id)}</label>
                <textarea
                  className="trigger-input"
                  rows={4}
                  style={{ resize: "vertical" }}
                  value={localValues[tf.id] ?? ""}
                  onChange={(e) => handleChange(tf.id, e.target.value)}
                  onBlur={() => handleBlur(tf.id)}
                  disabled={locked}
                />
              </div>
            );
          }

          if (FOOTER_DATE_FIELDS.includes(label)) {
            return (
              <div key={tf.id} className="mri-preview-table-row">
                <label>{fieldLabel(tf.footer_field_id)}</label>
                <input
                  type="date"
                  className="trigger-input"
                  value={localValues[tf.id] ?? ""}
                  onChange={(e) => handleChange(tf.id, e.target.value)}
                  onBlur={() => handleBlur(tf.id)}
                  disabled={locked}
                />
              </div>
            );
          }

          if (label === "operator") {
            if (currentUser?.role === "Operator") {
              return (
                <div key={tf.id} className="mri-preview-table-row">
                  <label>{fieldLabel(tf.footer_field_id)}</label>
                  <input
                    type="text"
                    className="trigger-input"
                    value={currentUser.name}
                    disabled
                    title="Automatically set to the signed-in Operator"
                  />
                </div>
              );
            }
            if (currentUser?.role === "Job Supervisor") {
              return (
                <div key={tf.id} className="mri-preview-table-row">
                  <label>{fieldLabel(tf.footer_field_id)}</label>
                  <select
                    className="neu-select"
                    value={localValues[tf.id] ?? ""}
                    onChange={(e) => handleChange(tf.id, e.target.value)}
                    onBlur={() => handleBlur(tf.id)}
                    disabled={locked}
                  >
                    <option value="">— Select Operator —</option>
                    {allUsers
                      .filter((u) => u.role === "Operator" && u.active)
                      .map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </div>
              );
            }
          }

          if (label === "supervisor") {
            if (currentUser?.role === "Job Supervisor") {
              return (
                <div key={tf.id} className="mri-preview-table-row">
                  <label>{fieldLabel(tf.footer_field_id)}</label>
                  <input
                    type="text"
                    className="trigger-input"
                    value={currentUser.name}
                    disabled
                    title="Automatically set to the signed-in Job Supervisor"
                  />
                </div>
              );
            }
            if (currentUser?.role === "Operator") {
              return (
                <div key={tf.id} className="mri-preview-table-row">
                  <label>{fieldLabel(tf.footer_field_id)}</label>
                  <select
                    className="neu-select"
                    value={localValues[tf.id] ?? ""}
                    onChange={(e) => handleChange(tf.id, e.target.value)}
                    onBlur={() => handleBlur(tf.id)}
                    disabled={locked}
                  >
                    <option value="">— Select Job Supervisor —</option>
                    {allUsers
                      .filter((u) => u.role === "Job Supervisor" && u.active)
                      .map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </div>
              );
            }
          }

          return (
            <div key={tf.id} className="mri-preview-table-row">
              <label>{fieldLabel(tf.footer_field_id)}</label>
              <input
                type="text"
                className="trigger-input"
                value={localValues[tf.id] ?? ""}
                onChange={(e) => handleChange(tf.id, e.target.value)}
                onBlur={() => handleBlur(tf.id)}
                disabled={locked}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CLOSURE_STATUSES = ["Pending", "Closed"] as const;
const SEVERITIES = ["Minor", "Moderate", "Critical"] as const;

function SeverityDistributionSummary({
  counts,
  colors,
}: {
  counts: {
    Healthy: number;
    Minor: number;
    Moderate: number;
    Critical: number;
  };
  colors: {
    Healthy: string;
    Minor: string;
    Moderate: string;
    Critical: string;
  };
}) {
  const data = [{ name: "distribution", ...counts }];

  return (
    <div style={{ height: 26 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          barCategoryGap={0}
        >
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            cursor={{ fill: "transparent" }}
            formatter={(value: any, name: any) => [`${value}`, `${name}`]}
            labelFormatter={() => ""}
            itemSorter={(item: any) => {
              const order: Record<string, number> = {
                Healthy: 0,
                Minor: 1,
                Moderate: 2,
                Critical: 3,
              };
              return order[item.dataKey as string] ?? 99;
            }}
          />
          <Bar
            dataKey="Critical"
            stackId="a"
            fill={colors.Critical}
            name="Critical"
            radius={[6, 0, 0, 6]}
          />
          <Bar
            dataKey="Moderate"
            stackId="a"
            fill={colors.Moderate}
            name="Moderate"
          />
          <Bar dataKey="Minor" stackId="a" fill={colors.Minor} name="Minor" />
          <Bar
            dataKey="Healthy"
            stackId="a"
            fill={colors.Healthy}
            name="Healthy"
            radius={[0, 6, 6, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChecklistEntryStep({
  templateId,
  reportId,
  locked,
  assetId,
  canReviewClosure,
}: {
  templateId: number;
  reportId: number;
  locked: boolean;
  assetId: number;
  canReviewClosure?: boolean;
}) {
  const { data: templateItems = [] } = useTemplateChecklistItems(templateId);
  const { data: databank = [] } = useChecklistItems();
  const { data: sections = [] } = useChecklistSections();
  const { data: savedResults = [], isSuccess: savedResultsLoaded } =
    useMriReportChecklistResults(reportId);
  const setResult = useSetMriReportChecklistResult(reportId);
  const { data: pendingItemIds = [] } = usePendingChecklistItemIds(
    assetId,
    reportId,
  );
  const { data: drawing } = useTemplateDrawing(templateId);
  const { data: hotspots = [] } = useTemplateDrawingHotspots(templateId);
  const { data: attachments = [] } = useMriReportAttachments(reportId);
  const addAttachment = useAddMriReportAttachment(reportId);
  const deleteAttachment = useDeleteMriReportAttachment(reportId);
  const { user: currentUser } = useCurrentUser();

  function attachmentsFor(templateChecklistItemId: number) {
    return attachments.filter(
      (a) => a.template_checklist_item_id === templateChecklistItemId,
    );
  }

  const [status, setStatus] = useState<{
    msg: string;
    kind: "ok" | "err";
  } | null>(null);
  const [view, setView] = useState<"list" | "drawing">("list");
  const [selectedHotspotId, setSelectedHotspotId] = useState<number | null>(
    null,
  );
  const [localEdits, setLocalEdits] = useState<
    Record<number, Partial<MriReportChecklistResult>>
  >({});
  const autoDefaulted = useState(() => new Set<number>())[0];

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 4000);
  }

  function itemInfo(checklistItemId: number) {
    return databank.find((d) => d.id === checklistItemId);
  }

  function defaultStatusFor(ti: (typeof templateItems)[number]) {
    const checklistItemId = ti.checklist_item_id;
    return pendingItemIds.includes(checklistItemId) ? "Fail" : "Pass";
  }

  function getResult(
    ti: (typeof templateItems)[number],
  ): Partial<MriReportChecklistResult> {
    const saved = savedResults.find(
      (r) => r.template_checklist_item_id === ti.id,
    );
    const edited = localEdits[ti.id];
    return {
      status: defaultStatusFor(ti),
      // Default severity comes from the template's checklist item, but a saved or
      // in-progress edit on this report always wins — the user can override it per report.
      severity: ti.severity ?? null,
      issue_details: "",
      action_taken: "",
      date_observed: todayIso(),
      closure_status: "Pending",
      ...saved,
      ...edited,
    };
  }

  function updateLocal(
    ti: (typeof templateItems)[number],
    patch: Partial<MriReportChecklistResult>,
  ) {
    setLocalEdits((prev) => ({
      ...prev,
      [ti.id]: { ...getResult(ti), ...prev[ti.id], ...patch },
    }));
  }

  async function autoSave(
    ti: (typeof templateItems)[number],
    patch: Partial<MriReportChecklistResult>,
  ) {
    if (locked) return;
    const current = { ...getResult(ti), ...patch };

    try {
      await setResult.mutateAsync({
        id: 0,
        report_id: reportId,
        template_checklist_item_id: ti.id,
        status: current.status ?? null,
        severity: current.severity ?? null,
        issue_details: current.issue_details || null,
        action_taken: current.action_taken || null,
        date_observed: current.date_observed || todayIso(),
        closure_status: current.closure_status ?? "Pending",
        // The backend only actually stamps this on a Fail save where reported_by
        // isn't already set -- see set_mri_report_checklist_result in lib.rs -- so
        // it's safe to send the current user on every save, Pass included.
        reported_by: currentUser?.name ?? "Unknown",
        reported_at: current.reported_at ?? null,
      });

      // Escalation to the higher-level Pending Approvals queue no longer happens
      // here at data-entry time -- it happens when the Job Supervisor endorses the
      // submitted report (see endorse_mri_report), so nothing reaches the review
      // queue until someone has actually looked at the completed report.
    } catch (err) {
      flash(String(err), "err");
    }
  }

  const sortedItems = [...templateItems].sort(
    (a, b) => a.display_order - b.display_order,
  );

  const severityCounts = useMemo(() => {
    const counts: {
      Healthy: number;
      Minor: number;
      Moderate: number;
      Critical: number;
    } = {
      Healthy: 0,
      Minor: 0,
      Moderate: 0,
      Critical: 0,
    };
    for (const ti of sortedItems) {
      const result = getResult(ti);
      if (result.status === "Pass") {
        counts.Healthy += 1;
      } else if (
        result.status === "Fail" &&
        result.severity &&
        result.severity in counts
      ) {
        counts[result.severity as "Minor" | "Moderate" | "Critical"] += 1;
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedItems, localEdits, savedResults, pendingItemIds]);

  useEffect(() => {
    if (locked || templateItems.length === 0 || !savedResultsLoaded) return;
    templateItems.forEach((ti) => {
      if (autoDefaulted.has(ti.id)) return;
      const alreadySaved = savedResults.find(
        (r) => r.template_checklist_item_id === ti.id,
      );
      if (alreadySaved) {
        autoDefaulted.add(ti.id);
        return;
      }
      autoDefaulted.add(ti.id);
      autoSave(ti, { status: defaultStatusFor(ti) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateItems.length, pendingItemIds.length, locked, savedResultsLoaded]);

  const grouped = (() => {
    const groups = new Map<number | null, typeof sortedItems>();
    for (const ti of sortedItems) {
      const key = ti.section_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ti);
    }
    const ordered = sections
      .filter((s) => groups.has(s.id))
      .map((s) => ({ label: s.name, items: groups.get(s.id)! }));
    if (groups.has(null))
      ordered.push({ label: "Unassigned", items: groups.get(null)! });
    return ordered;
  })();

  const severityColor: Record<string, string> = {
    Minor: "#d4ac0d",
    Moderate: "#d97706",
    Critical: "#c0392b",
  };

  const SEVERITY_GUIDANCE: Record<
    string,
    { action: string; reviewer: string }
  > = {
    Minor: {
      action:
        "No functional impact. Monitor and rectify during planned maintenance — no approval required.",
      reviewer: "No approval required.",
    },
    Moderate: {
      action:
        "Early-stage abnormality. Plan rectification and monitor closely.",
      reviewer:
        "Reviewed by Operations Coordinator / Maintenance Supervisor — may reclassify. Maintenance Manager/FSM informed.",
    },
    Critical: {
      action:
        "Currently affecting reliability, performance, or safety. Stop use immediately and Red-Tag the equipment.",
      reviewer:
        "Reviewed by FSM / Maintenance Manager. Return to service requires rectification and verification.",
    },
  };

  function severityIcon(severity: string, color: string) {
    switch (severity) {
      case "Minor":
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: 16, height: 16 }}
          >
            <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
            <path
              d="M8 12.5l2.5 2.5L16 9.5"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case "Moderate":
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: 16, height: 16 }}
          >
            <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
            <path
              d="M12 11v5"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="12" cy="8" r="1" fill={color} />
          </svg>
        );
      case "Critical":
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: 17, height: 17 }}
          >
            <path
              d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3L8.3 3z"
              stroke={color}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M12 8v5"
              stroke={color}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16" r="1" fill={color} />
          </svg>
        );
      default:
        return null;
    }
  }

  const COLS = "1.5fr 0.9fr 1.1fr 1.1fr 0.9fr 0.8fr 0.7fr 1.1fr";

  if (sortedItems.length === 0) {
    return (
      <div className="empty">
        This template has no checklist items configured
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0 }}>Checklist</h2>
        <div style={{ width: 220 }}>
          <SeverityDistributionSummary
            counts={severityCounts}
            colors={{
              Healthy: PASS_COLOR,
              Minor: severityColor.Minor,
              Moderate: severityColor.Moderate,
              Critical: severityColor.Critical,
            }}
          />
        </div>
      </div>

      {status && (
        <div
          className={`toast ${status.kind}`}
          style={{ maxWidth: 500, marginTop: 12, marginBottom: 12 }}
        >
          {status.msg}
        </div>
      )}

      {drawing && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            className={view === "list" ? "primary" : "ghost"}
            style={{ padding: "6px 14px", fontSize: 12 }}
            onClick={() => setView("list")}
          >
            List View
          </button>
          <button
            className={view === "drawing" ? "primary" : "ghost"}
            style={{ padding: "6px 14px", fontSize: 12 }}
            onClick={() => setView("drawing")}
          >
            Drawing View
          </button>
        </div>
      )}

      {view === "drawing" && drawing && (
        <DrawingChecklistView
          drawing={drawing}
          hotspots={hotspots}
          templateItems={templateItems}
          itemInfo={itemInfo}
          getResult={getResult}
          updateLocal={updateLocal}
          autoSave={autoSave}
          locked={locked}
          canReviewClosure={canReviewClosure}
          severityColor={severityColor}
          severityIcon={severityIcon}
          severityGuidance={SEVERITY_GUIDANCE}
          selectedHotspotId={selectedHotspotId}
          setSelectedHotspotId={setSelectedHotspotId}
          attachmentsFor={attachmentsFor}
          onAddAttachment={(templateChecklistItemId, file) =>
            addAttachment.mutate({ templateChecklistItemId, ...file })
          }
          onDeleteAttachment={(id) => deleteAttachment.mutate(id)}
        />
      )}

      {view === "list" &&
        grouped.map((group) => (
          <div key={group.label} style={{ marginBottom: 24 }}>
            <div className="mri-preview-section-label">{group.label}</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: COLS,
                gap: 10,
                alignItems: "center",
                padding: "6px 4px",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                color: "var(--text-soft)",
              }}
            >
              <span>Checklist Item</span>
              <span>Pass / Fail</span>
              <span>Issue Details</span>
              <span>Action Taken</span>
              <span>Date Observed</span>
              <span>Closure Status</span>
              <span>Severity</span>
              <span>Attachments</span>
            </div>

            {group.items.map((ti) => {
              const info = itemInfo(ti.checklist_item_id);
              const result = getResult(ti);
              const isFail = result.status === "Fail";

              const guidance =
                isFail && result.severity
                  ? SEVERITY_GUIDANCE[result.severity]
                  : null;

              return (
                <div key={ti.id}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: COLS,
                      gap: 10,
                      alignItems: "center",
                      padding: "10px 4px",
                      borderTop: "1px solid var(--border)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ whiteSpace: "normal" }}>
                      {info?.description}
                      {ti.required && (
                        <span style={{ color: "var(--danger)" }}> *</span>
                      )}
                    </span>

                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="ghost"
                        disabled={locked}
                        style={{
                          padding: "6px 10px",
                          fontSize: 12,
                          ...(result.status === "Pass"
                            ? { background: "var(--accent)", color: "#fff" }
                            : {}),
                        }}
                        onClick={() => {
                          const patch = {
                            status: "Pass" as const,
                            issue_details: "",
                            action_taken: "",
                          };
                          updateLocal(ti, patch);
                          autoSave(ti, patch);
                        }}
                      >
                        Pass
                      </button>
                      <button
                        className={
                          result.status === "Fail" ? "danger" : "ghost"
                        }
                        disabled={locked}
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        onClick={() => {
                          updateLocal(ti, { status: "Fail" });
                          autoSave(ti, { status: "Fail" });
                        }}
                      >
                        Fail
                      </button>
                    </div>

                    <input
                      type="text"
                      className="trigger-input"
                      value={result.issue_details ?? ""}
                      onChange={(e) =>
                        updateLocal(ti, { issue_details: e.target.value })
                      }
                      onBlur={() => autoSave(ti, {})}
                      disabled={locked || !isFail}
                      placeholder={isFail ? "Required" : "—"}
                    />

                    <input
                      type="text"
                      className="trigger-input"
                      value={result.action_taken ?? ""}
                      onChange={(e) =>
                        updateLocal(ti, { action_taken: e.target.value })
                      }
                      onBlur={() => autoSave(ti, {})}
                      disabled={locked || !isFail}
                      placeholder={isFail ? "Required" : "—"}
                    />

                    <input
                      type="date"
                      className="trigger-input"
                      value={result.date_observed ?? todayIso()}
                      onChange={(e) => {
                        updateLocal(ti, { date_observed: e.target.value });
                        autoSave(ti, { date_observed: e.target.value });
                      }}
                      disabled={locked}
                    />

                    <select
                      className="neu-select"
                      value={result.closure_status ?? "Pending"}
                      onChange={(e) => {
                        const val = e.target.value as "Pending" | "Closed";
                        updateLocal(ti, { closure_status: val });
                        autoSave(ti, { closure_status: val });
                      }}
                      disabled={locked && !canReviewClosure}
                    >
                      {CLOSURE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        justifyContent: "center",
                      }}
                    >
                      {result.severity && (
                        <span
                          title={`Severity: ${result.severity}`}
                          style={{ display: "flex" }}
                        >
                          {severityIcon(
                            result.severity,
                            severityColor[result.severity] ??
                              "var(--text-soft)",
                          )}
                        </span>
                      )}
                      <select
                        className="neu-select"
                        style={{ fontSize: 12, padding: "4px 6px" }}
                        value={result.severity ?? ""}
                        onChange={(e) => {
                          const val = (e.target.value ||
                            null) as typeof result.severity;
                          updateLocal(ti, { severity: val });
                          autoSave(ti, { severity: val });
                        }}
                        disabled={locked}
                      >
                        <option value="">—</option>
                        {SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <AttachmentGallery
                      attachments={attachmentsFor(ti.id)}
                      locked={locked}
                      onAdd={(file) =>
                        addAttachment.mutate({
                          templateChecklistItemId: ti.id,
                          ...file,
                        })
                      }
                      onDelete={(id) => deleteAttachment.mutate(id)}
                      variant="compact"
                    />
                  </div>

                  {guidance && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        padding: "8px 10px",
                        borderRadius: 8,
                        marginBottom: 4,
                        fontSize: 11.5,
                        lineHeight: 1.4,
                        background: `${severityColor[result.severity!]}14`,
                        borderLeft: `3px solid ${severityColor[result.severity!]}`,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: severityColor[result.severity!],
                        }}
                      >
                        {result.severity} — Required Action
                      </span>
                      <span style={{ color: "var(--text-soft)" }}>
                        {guidance.action}
                      </span>
                      <span style={{ color: "var(--text-soft)" }}>
                        {guidance.reviewer}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function DistanceRouteThumbnail({
  routePointsRaw,
}: {
  routePointsRaw: string | null | undefined;
}) {
  let points: { lng: number; lat: number }[] = [];
  if (routePointsRaw) {
    try {
      const parsed = JSON.parse(routePointsRaw);
      if (Array.isArray(parsed)) points = parsed;
    } catch {
      points = [];
    }
  }

  const boxStyle: React.CSSProperties = {
    width: 90,
    height: 90,
    flexShrink: 0,
    borderRadius: 10,
    background: "var(--neu-bg)",
    boxShadow:
      "inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };

  if (points.length < 2) {
    return (
      <div style={boxStyle}>
        <span
          style={{
            fontSize: 9.5,
            color: "var(--text-soft)",
            textAlign: "center",
            padding: "0 8px",
            lineHeight: 1.3,
          }}
        >
          No route plotted
        </span>
      </div>
    );
  }

  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const spanLng = maxLng - minLng || 1;
  const spanLat = maxLat - minLat || 1;
  const pad = 12;
  const size = 100;

  function project(p: { lng: number; lat: number }) {
    const x = pad + ((p.lng - minLng) / spanLng) * (size - pad * 2);
    const y = pad + (1 - (p.lat - minLat) / spanLat) * (size - pad * 2);
    return { x, y };
  }

  const projected = points.map(project);
  const pathD = projected
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <div style={boxStyle}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: "100%", height: "100%" }}
      >
        <path
          d={pathD}
          fill="none"
          stroke="#2f6fed"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={projected[0].x}
          cy={projected[0].y}
          r="3.4"
          fill="#2f9e44"
        />
        <circle
          cx={projected[projected.length - 1].x}
          cy={projected[projected.length - 1].y}
          r="3.4"
          fill="#c0392b"
        />
      </svg>
    </div>
  );
}

interface ReviewStepProps {
  templateId: number;
  reportId: number;
  locked: boolean;
  onValidate: (issues: string[]) => void;
  report: any;
  asset: any;
}

function ReviewStep({
  templateId,
  reportId,
  locked,
  onValidate,
  report,
  asset,
}: ReviewStepProps) {
  const { data: headerFields = [] } = useTemplateHeaderFields(templateId);
  const { data: headerCatalog = [] } = useHeaderFieldCatalog();
  const { data: headerValues = [] } = useMriReportHeaderValues(reportId);

  const { data: templateItems = [] } = useTemplateChecklistItems(templateId);
  const { data: databank = [] } = useChecklistItems();
  const { data: sections = [] } = useChecklistSections();
  const { data: checklistResults = [] } =
    useMriReportChecklistResults(reportId);

  const { data: midFields = [] } = useTemplateMidFields(templateId);
  const { data: midCatalog = [] } = useMidFieldCatalog();
  const { data: midValues = [] } = useMriReportMidValues(reportId);

  const { data: footerFields = [] } = useTemplateFooterFields(templateId);
  const { data: footerCatalog = [] } = useFooterFieldCatalog();
  const { data: footerValues = [] } = useMriReportFooterValues(reportId);

  const { data: drawing } = useTemplateDrawing(templateId);
  const { data: hotspots = [] } = useTemplateDrawingHotspots(templateId);
  const { data: checklistHistory = [] } = useMriChecklistHistory(
    report.asset_id,
    reportId,
  );

  function itemInfo(checklistItemId: number) {
    return databank.find((d) => d.id === checklistItemId);
  }
  function sectionName(sectionId: number | null) {
    return sections.find((s) => s.id === sectionId)?.name ?? "Unassigned";
  }

  function hotspotNumberForItem(
    templateChecklistItemId: number,
  ): number | null {
    const idx = hotspots.findIndex((h) =>
      h.checklist_item_ids.includes(templateChecklistItemId),
    );
    return idx >= 0 ? idx + 1 : null;
  }

  function hotspotSeverityColor(h: { checklist_item_ids: number[] }): string {
    const linkedResults = h.checklist_item_ids
      .map((tid) =>
        checklistResults.find((r) => r.template_checklist_item_id === tid),
      )
      .filter((r): r is MriReportChecklistResult => !!r);

    if (linkedResults.length === 0) return "var(--text-soft)";

    let worst: string | null = null;
    for (const r of linkedResults) {
      if (r.status === "Fail" && r.severity) {
        if (!worst || SEVERITY_RANK[r.severity] > SEVERITY_RANK[worst])
          worst = r.severity;
      }
    }
    if (worst) return REVIEW_SEVERITY_COLOR[worst] ?? "var(--danger)";
    const anyFail = linkedResults.some((r) => r.status === "Fail");
    if (anyFail) return "var(--danger)";
    const anyAssessed = linkedResults.some((r) => r.status);
    return anyAssessed ? PASS_COLOR : "var(--text-soft)";
  }

  const headerRows = [...headerFields]
    .sort((a, b) => a.display_order - b.display_order)
    .map((tf) => ({
      id: tf.id,
      label:
        headerCatalog.find((c) => c.id === tf.header_field_id)?.label ?? "—",
      required: tf.required,
      value:
        headerValues.find((v) => v.template_header_field_id === tf.id)?.value ??
        "",
    }));

  const midRows = [...midFields]
    .sort((a, b) => a.display_order - b.display_order)
    .map((tf) => ({
      id: tf.id,
      label: midCatalog.find((c) => c.id === tf.mid_field_id)?.label ?? "—",
      value:
        midValues.find((v) => v.template_mid_field_id === tf.id)?.value ?? "",
      routePoints:
        midValues.find((v) => v.template_mid_field_id === tf.id)
          ?.route_points ?? null,
    }));

  const footerRows = [...footerFields]
    .sort((a, b) => a.display_order - b.display_order)
    .map((tf) => ({
      id: tf.id,
      label:
        footerCatalog.find((c) => c.id === tf.footer_field_id)?.label ?? "—",
      value:
        footerValues.find((v) => v.template_footer_field_id === tf.id)?.value ??
        "",
    }));
  const footerCheckboxRows = footerRows.filter((r) =>
    FOOTER_CHECKBOX_FIELDS.includes(r.label.trim().toLowerCase()),
  );
  const footerOtherRows = footerRows.filter(
    (r) => !FOOTER_CHECKBOX_FIELDS.includes(r.label.trim().toLowerCase()),
  );
  const footerRemarksRow =
    footerOtherRows.find(
      (r) => r.label.trim().toLowerCase() === FOOTER_REMARKS_FIELD,
    ) ?? null;
  const checklistRows = [...templateItems]
    .sort((a, b) => a.display_order - b.display_order)
    .map((ti) => {
      const result =
        checklistResults.find((r) => r.template_checklist_item_id === ti.id) ??
        null;
      return { ti, info: itemInfo(ti.checklist_item_id), result };
    });

  const passCount = checklistRows.filter(
    (r) => r.result?.status === "Pass",
  ).length;
  const failCount = checklistRows.filter(
    (r) => r.result?.status === "Fail",
  ).length;
  const openCount = checklistRows.filter(
    (r) => r.result?.status === "Fail" && r.result.closure_status !== "Closed",
  ).length;

  const issues: string[] = [];
  headerRows.forEach((r) => {
    if (r.required && !r.value.trim())
      issues.push(`Header — "${r.label}" is required`);
  });
  checklistRows.forEach(({ ti, info, result }) => {
    const name = info?.description ?? `Item #${ti.id}`;
    if (!result || !result.status) {
      if (ti.required)
        issues.push(`Checklist — "${name}" has not been assessed yet`);
      return;
    }
    if (result.status === "Fail") {
      if (!result.issue_details?.trim())
        issues.push(
          `Checklist — "${name}" is marked Fail but has no issue details`,
        );
      if (!result.action_taken?.trim())
        issues.push(
          `Checklist — "${name}" is marked Fail but has no action taken`,
        );
      if (!result.severity)
        issues.push(`Checklist — "${name}" is marked Fail but has no severity`);
    }
  });

  useEffect(() => {
    onValidate(issues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues.join("|")]);

  // ---- MR-I report PDF (2-page print layout) ----
  function findHeaderValue(label: string): string {
    return (
      headerRows
        .find((r) => r.label.trim().toLowerCase() === label.toLowerCase())
        ?.value?.trim() || ""
    );
  }
  function findFooterValue(label: string): string {
    return (
      footerRows
        .find((r) => r.label.trim().toLowerCase() === label.toLowerCase())
        ?.value?.trim() || ""
    );
  }
  function findMidRow(label: string) {
    return midRows.find(
      (r) => r.label.trim().toLowerCase() === label.toLowerCase(),
    );
  }
  function fmtDate(raw: string): string {
    if (!raw) return "—";
    const d = new Date(
      raw.includes("T") || raw.includes(" ") ? raw : `${raw}T00:00:00`,
    );
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  function fmtDateTime(d: Date): string {
    return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  const reportDateIso: string = report.submitted_date ?? report.created_date;
  const complianceStage = findHeaderValue("Compliance Stage");
  const statusPill =
    report.status === "Approved"
      ? { label: "Approved", bg: "#e9f5ee", dot: "#1f8a4d", text: "#1f7a45" }
      : report.status === "Escalated"
        ? {
            label: "Escalated — pending fault review",
            bg: "#fbe4e1",
            dot: "#c0392b",
            text: "#96271e",
          }
        : report.status === "Submitted"
          ? {
              label: "Awaiting supervisor sign-off",
              bg: "#fbead0",
              dot: "#c9861a",
              text: "#7a5410",
            }
          : {
              label: "Draft — not yet submitted",
              bg: "#eef0f2",
              dot: "#9aa2a8",
              text: "#5b6570",
            };

  const checklistTotal = checklistRows.length;
  const checklistPct =
    checklistTotal > 0 ? Math.round((passCount / checklistTotal) * 100) : 0;
  const faultSeverityCounts: Record<string, number> = {
    Minor: 0,
    Moderate: 0,
    Critical: 0,
  };
  checklistRows.forEach(({ result }) => {
    if (result?.status === "Fail" && result.severity)
      faultSeverityCounts[result.severity] += 1;
  });
  const closedFaultCount = failCount - openCount;
  const faultSummary =
    failCount === 0
      ? "None"
      : (["Critical", "Moderate", "Minor"] as const)
          .filter((s) => faultSeverityCounts[s] > 0)
          .map((s) => `${faultSeverityCounts[s]} ${s.toLowerCase()}`)
          .join(", ");

  const equipmentStatus =
    asset?.tag_status === "Green"
      ? {
          label: "Green tagged",
          sub: "Job ready",
          bg: "#e9f5ee",
          border: "#bfe0cc",
          labelColor: "#1f7a45",
          subColor: "#4d6b5b",
        }
      : asset?.tag_status === "Red"
        ? {
            label: "Red tagged",
            sub: "Rectification required",
            bg: "#fbe4e1",
            border: "#f0b3a8",
            labelColor: "#96271e",
            subColor: "#8a5850",
          }
        : {
            label: "Not yet tagged",
            sub: "Pending outcome",
            bg: undefined as string | undefined,
            border: undefined as string | undefined,
            labelColor: undefined as string | undefined,
            subColor: undefined as string | undefined,
          };

  const assetDetailFields: { label: string; value: string }[] = [
    {
      label: "Country",
      value: findHeaderValue("Country") || asset?.country || "—",
    },
    {
      label: "Service line",
      value: findHeaderValue("Service Line") || asset?.service_line || "—",
    },
    {
      label: "Client",
      value: findHeaderValue("Client") || asset?.client || "—",
    },
    { label: "Location", value: findHeaderValue("Location") || "—" },
    {
      label: "Asset no",
      value: findHeaderValue("Asset No") || asset?.asset_code || "—",
    },
    {
      label: "Unit model capacity",
      value: findHeaderValue("Unit Model Capacity") || "—",
    },
    { label: "Compliance stage", value: complianceStage || "—" },
    {
      label: "MR initialization date",
      value: fmtDate(findHeaderValue("MR Initization Date")),
    },
    {
      label: "Previous engine hours",
      value: findHeaderValue("Previous Engine Hours") || "—",
    },
    {
      label: "Current engine hours",
      value: findHeaderValue("Current Engine Hours") || "—",
    },
    {
      label: "Job operating hours",
      value: findHeaderValue("Job Operating Hours") || "—",
    },
    {
      label: "MR-II due date",
      value: fmtDate(findHeaderValue("MR II Due Date")),
    },
  ];

  const faultRows = checklistRows.filter(
    ({ result }) => result?.status === "Fail",
  );
  const preJobRow = findMidRow("Distance Travelled Pre-Job (KM)");
  const postJobRow = findMidRow("Distance Travelled Post-Job (KM)");
  const operatorName = findFooterValue("Operator");
  const supervisorName = findFooterValue("Supervisor");

  // Group checklist rows by section in order-of-first-appearance, each with its own
  // pass tally, for Page 2's grouped table.
  const sectionOrder: number[] = [];
  checklistRows.forEach(({ ti }) => {
    const sid = ti.section_id ?? -1;
    if (!sectionOrder.includes(sid)) sectionOrder.push(sid);
  });
  const checklistBySection = sectionOrder.map((sid) => {
    const rows = checklistRows.filter(
      ({ ti }) => (ti.section_id ?? -1) === sid,
    );
    const sectionPass = rows.filter((r) => r.result?.status === "Pass").length;
    return {
      sectionId: sid,
      name: sid === -1 ? "Unassigned" : sectionName(sid),
      rows,
      sectionPass,
      sectionTotal: rows.length,
    };
  });

  // Full stamped history thread for one Fail item: every prior occurrence (from
  // get_mri_checklist_history, keyed by the stable checklist_databank id) plus this
  // report's own entry, oldest first.
  function historyThreadFor(
    ti: any,
    result: MriReportChecklistResult | null,
  ): MriChecklistHistoryEntry[] {
    const past = checklistHistory
      .filter((h) => h.checklist_item_id === ti.checklist_item_id)
      .sort((a, b) => a.report_date.localeCompare(b.report_date));
    const current: MriChecklistHistoryEntry[] =
      result?.status === "Fail"
        ? [
            {
              report_id: reportId,
              checklist_item_id: ti.checklist_item_id,
              report_date: reportDateIso ?? report.created_date,
              issue_details: result.issue_details,
              action_taken: result.action_taken,
              severity: result.severity,
              closure_status: result.closure_status,
              reported_by: result.reported_by,
              reported_at: result.reported_at,
            },
          ]
        : [];
    return [...past, ...current];
  }

  const generatedStamp = fmtDateTime(new Date());

  return (
    <div>
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0 }}>Review</h2>
        <button
          className="ghost"
          style={{ padding: "6px 14px", fontSize: 12 }}
          onClick={() => window.print()}
        >
          Print / Export PDF
        </button>
      </div>
      <p
        className="no-print"
        style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}
      >
        Review every section below before submitting.{" "}
        {locked
          ? "This report is locked and read-only."
          : "Fix any issues listed to enable submission."}
      </p>

      {!locked && issues.length > 0 && (
        <div className="toast err no-print" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {issues.length} issue{issues.length === 1 ? "" : "s"} to resolve
            before submitting:
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {issues.map((msg, i) => (
              <li key={i} style={{ fontSize: 12.5 }}>
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="print-area">
        <div
          className="mri-report-page"
          style={{
            width: "100%",
            minHeight: 1123,
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* MASTHEAD */}
          <div
            style={{
              flex: "0 0 96px",
              background: "#123c47",
              padding: "16px 40px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#a9c3ca",
                    letterSpacing: "0.02em",
                  }}
                >
                  Sprint Oil and Gas Services · Maintenance Management System
                </div>
                <div
                  style={{
                    fontSize: 25,
                    fontWeight: 800,
                    color: "#ffffff",
                    marginTop: 2,
                  }}
                >
                  MR-I routine inspection
                </div>
                <div style={{ fontSize: 13, color: "#cfe2e6", marginTop: 3 }}>
                  {asset?.service_line || "—"} · Asset{" "}
                  {asset?.asset_code ?? "—"} · {complianceStage || "—"} ·{" "}
                  {fmtDate(reportDateIso)}
                </div>
              </div>
              <div
                style={{
                  background: statusPill.bg,
                  borderRadius: 20,
                  padding: "8px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  whiteSpace: "nowrap",
                  marginTop: 4,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: statusPill.dot,
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: statusPill.text,
                  }}
                >
                  {statusPill.label}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 18,
              padding: "20px 40px 40px",
              minHeight: 0,
            }}
          >
            {/* STAT ROW */}
            <div
              style={{
                flex: "0 0 108px",
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 14,
              }}
            >
              <div
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "#fff",
                  border: "1px solid #e2e5e8",
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: 56,
                    height: 56,
                    flex: "0 0 56px",
                    borderRadius: "50%",
                    background: `conic-gradient(#1f8a4d 0% ${checklistPct}%, #e5e7e8 ${checklistPct}% 100%)`,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 6,
                      background: "#fff",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#1c2b33",
                    }}
                  >
                    {checklistPct}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: "#6b7680" }}>
                    Checklist result
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2 }}>
                    {passCount} / {checklistTotal}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#6b7680" }}>
                    items passed
                  </div>
                </div>
              </div>
              <div
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  background: "#fff",
                  border: "1px solid #e2e5e8",
                  borderRadius: 10,
                }}
              >
                <div style={{ fontSize: 10.5, color: "#6b7680" }}>Faults</div>
                <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>
                  {failCount === 0 ? "None" : faultSummary}
                </div>
                <div style={{ fontSize: 10.5, color: "#6b7680", marginTop: 2 }}>
                  {failCount > 0
                    ? `${openCount} open · ${closedFaultCount} closed`
                    : "No faults recorded"}
                </div>
              </div>
              <div
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  background: equipmentStatus.bg ?? "#fff",
                  border: `1px solid ${equipmentStatus.border ?? "#e2e5e8"}`,
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    color: equipmentStatus.subColor ?? "#6b7680",
                  }}
                >
                  Equipment status
                </div>
                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    marginTop: 4,
                    color: equipmentStatus.labelColor ?? "#1c2b33",
                  }}
                >
                  {equipmentStatus.label}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    marginTop: 2,
                    color: equipmentStatus.subColor ?? "#6b7680",
                  }}
                >
                  {equipmentStatus.sub}
                </div>
              </div>
              <div
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  background: "#fff",
                  border: "1px solid #e2e5e8",
                  borderRadius: 10,
                }}
              >
                <div style={{ fontSize: 10.5, color: "#6b7680" }}>
                  Engine hours
                </div>
                <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>
                  {findHeaderValue("Current Engine Hours") || "—"}
                </div>
                <div style={{ fontSize: 10.5, color: "#6b7680", marginTop: 2 }}>
                  Job operating hours{" "}
                  {findHeaderValue("Job Operating Hours") || "—"}
                </div>
              </div>
            </div>

            {/* ASSET DETAILS */}
            <div style={{ flex: "0 0 auto" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 15,
                  fontWeight: 800,
                  color: "#12232b",
                  margin: "0 0 10px",
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 15,
                    borderRadius: 2,
                    background: "#123c47",
                    display: "inline-block",
                  }}
                />
                Asset and job details
              </div>
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e2e5e8",
                  borderRadius: 10,
                  display: "grid",
                  gridTemplateColumns: "repeat(6, 1fr)",
                }}
              >
                {assetDetailFields.map((f, i) => (
                  <div
                    key={f.label}
                    style={{
                      padding: "10px 14px",
                      borderRight:
                        (i + 1) % 6 === 0 ? "none" : "1px solid #eef0f2",
                      borderBottom: "1px solid #eef0f2",
                    }}
                  >
                    <div style={{ fontSize: 10.5, color: "#6b7680" }}>
                      {f.label}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#1c2b33",
                        marginTop: 2,
                      }}
                    >
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MAIN ROW: drawing + faults/distance */}
            <div
              style={{
                flex: "1 1 auto",
                display: "flex",
                gap: 18,
                minHeight: 0,
              }}
            >
              <div
                style={{
                  flex: "1 1 62%",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#12232b",
                    margin: "0 0 10px",
                  }}
                >
                  <span
                    style={{
                      width: 4,
                      height: 15,
                      borderRadius: 2,
                      background: "#123c47",
                      display: "inline-block",
                    }}
                  />
                  Inspection drawing
                </div>
                <div
                  style={{
                    flex: 1,
                    background: "#eef1f2",
                    border: "1px solid #e2e5e8",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {drawing ? (
                    <>
                      <img
                        src={drawing.image_data}
                        alt="Equipment drawing"
                        style={{
                          display: "block",
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                      />
                      {hotspots.map((h, i) => (
                        <span
                          key={h.id}
                          title={h.label ?? `Hotspot ${i + 1}`}
                          style={{
                            position: "absolute",
                            left: `${h.x * 100}%`,
                            top: `${h.y * 100}%`,
                            transform: "translate(-50%, -50%)",
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#fff",
                            background: hotspotSeverityColor(h),
                            border: "2px solid #fff",
                            boxShadow: "0 0 0 2px rgba(0,0,0,0.2)",
                          }}
                        >
                          {i + 1}
                        </span>
                      ))}
                    </>
                  ) : (
                    <div
                      style={{
                        textAlign: "center",
                        color: "#7c868d",
                        fontSize: 12.5,
                        padding: 24,
                      }}
                    >
                      No drawing configured for this template
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    marginTop: 8,
                    fontSize: 10.5,
                    color: "#6b7680",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: PASS_COLOR,
                        display: "inline-block",
                      }}
                    />
                    Pass
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: "#c0392b",
                        display: "inline-block",
                      }}
                    />
                    Fault recorded
                  </span>
                  <span>Numbers match the checklist on page 2</span>
                </div>
              </div>

              <div
                style={{
                  flex: "1 1 38%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  minHeight: 0,
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#12232b",
                      margin: "0 0 10px",
                    }}
                  >
                    <span
                      style={{
                        width: 4,
                        height: 15,
                        borderRadius: 2,
                        background: "#123c47",
                        display: "inline-block",
                      }}
                    />
                    Faults recorded
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {faultRows.length === 0 && (
                      <div style={{ fontSize: 12, color: "#9aa2a8" }}>
                        No faults recorded on this report
                      </div>
                    )}
                    {faultRows.map(({ ti, info, result }) => {
                      const hotspotNumber = hotspotNumberForItem(ti.id);
                      const isOpen = result?.closure_status !== "Closed";
                      return (
                        <div
                          key={ti.id}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 10,
                            background: isOpen ? "#fdf1d3" : "#fff",
                            border: `1px solid ${isOpen ? "#f0c869" : "#e2e5e8"}`,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                background: isOpen ? "#c9861a" : "#9aa2a8",
                                color: "#fff",
                                fontSize: 10.5,
                                fontWeight: 800,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {hotspotNumber ?? "—"}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>
                              {info?.description ?? `Item #${ti.id}`}
                            </span>
                          </div>
                          <div
                            style={{ marginTop: 8, display: "flex", gap: 6 }}
                          >
                            {result?.severity && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "2px 9px",
                                  borderRadius: 20,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  background: `${REVIEW_SEVERITY_COLOR[result.severity]}22`,
                                  color: REVIEW_SEVERITY_COLOR[result.severity],
                                }}
                              >
                                {result.severity}
                              </span>
                            )}
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "2px 9px",
                                borderRadius: 20,
                                fontSize: 10,
                                fontWeight: 700,
                                background: isOpen ? "#fdf6e6" : "#e2e5e8",
                                color: isOpen ? "#8a6512" : "#5b6570",
                                border: isOpen ? "1px solid #d9b354" : "none",
                              }}
                            >
                              {result?.closure_status ?? "Pending"}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 10.5,
                              color: "#6b7680",
                              marginTop: 6,
                            }}
                          >
                            {sectionName(ti.section_id)} · Finding:{" "}
                            {result?.issue_details || "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#12232b",
                      margin: "0 0 10px",
                    }}
                  >
                    <span
                      style={{
                        width: 4,
                        height: 15,
                        borderRadius: 2,
                        background: "#123c47",
                        display: "inline-block",
                      }}
                    />
                    Distance travelled
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#fff",
                        border: "1px solid #e2e5e8",
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ fontSize: 10.5, color: "#6b7680" }}>
                        Pre-job
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          marginTop: 2,
                          color: preJobRow?.value ? "#1c2b33" : "#9aa2a8",
                        }}
                      >
                        {preJobRow?.value || "Not recorded"}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#fff",
                        border: "1px solid #e2e5e8",
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ fontSize: 10.5, color: "#6b7680" }}>
                        Post-job
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          marginTop: 2,
                          color: postJobRow?.value ? "#1c2b33" : "#9aa2a8",
                        }}
                      >
                        {postJobRow?.value || "Not recorded"}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "#fff",
                      border: "1px solid #e2e5e8",
                      borderRadius: 10,
                      marginTop: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 10.5, color: "#6b7680" }}>
                        Route
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          marginTop: 2,
                          color: postJobRow?.routePoints
                            ? "#1c2b33"
                            : "#9aa2a8",
                        }}
                      >
                        {postJobRow?.routePoints
                          ? "Route plotted"
                          : "No route plotted"}
                      </div>
                    </div>
                    {postJobRow?.routePoints && (
                      <DistanceRouteThumbnail
                        routePointsRaw={postJobRow.routePoints}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* FINAL STATUS */}
            <div style={{ flex: "0 0 auto" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 15,
                  fontWeight: 800,
                  color: "#12232b",
                  margin: "0 0 10px",
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 15,
                    borderRadius: 2,
                    background: "#123c47",
                    display: "inline-block",
                  }}
                />
                Final status and sign-off
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.1fr 1fr 1fr 1.2fr",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    justifyContent: "center",
                    background: "#fff",
                    border: "1px solid #e2e5e8",
                    borderRadius: 10,
                  }}
                >
                  {footerCheckboxRows.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          background: r.value === "Yes" ? "#1f8a4d" : "#e2e5e8",
                          color: "#fff",
                          fontSize: 10,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {r.value === "Yes" ? "✓" : ""}
                      </span>
                      {r.label}
                    </div>
                  ))}
                  {footerCheckboxRows.length === 0 && (
                    <div style={{ fontSize: 12, color: "#9aa2a8" }}>
                      No status fields configured
                    </div>
                  )}
                </div>
                <div
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    background: "#fff",
                    border: "1px solid #e2e5e8",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: 10.5, color: "#6b7680" }}>
                    Operator
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      marginTop: 4,
                      color: operatorName ? "#1c2b33" : "#9aa2a8",
                    }}
                  >
                    {operatorName || "Not recorded"}
                  </div>
                  <div
                    style={{
                      borderTop: "1px solid #e2e5e8",
                      marginTop: 16,
                      paddingTop: 6,
                      fontSize: 10.5,
                      color: "#9aa2a8",
                    }}
                  >
                    Date:{" "}
                    {findFooterValue("Operator Date")
                      ? fmtDate(findFooterValue("Operator Date"))
                      : "—"}
                  </div>
                </div>
                <div
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    background: "#fff",
                    border: `1px ${supervisorName ? "solid" : "dashed"} #e2e5e8`,
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: 10.5, color: "#6b7680" }}>
                    Supervisor
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      marginTop: 4,
                      color: supervisorName ? "#1c2b33" : "#9aa2a8",
                    }}
                  >
                    {supervisorName || "Pending endorsement"}
                  </div>
                  <div
                    style={{
                      borderTop: "1px solid #e2e5e8",
                      marginTop: 16,
                      paddingTop: 6,
                      fontSize: 10.5,
                      color: "#9aa2a8",
                    }}
                  >
                    Date:{" "}
                    {findFooterValue("Supervisor Date")
                      ? fmtDate(findFooterValue("Supervisor Date"))
                      : "—"}
                  </div>
                </div>
                <div
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    background: "#fff",
                    border: "1px solid #e2e5e8",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: 10.5, color: "#6b7680" }}>
                    Remarks
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      marginTop: 4,
                      color: "#4b5560",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {footerRemarksRow?.value || "No remarks recorded"}
                  </div>
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div
              style={{
                flex: "0 0 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid #eef0f2",
                paddingTop: 10,
                fontSize: 10.5,
                color: "#9aa2a8",
              }}
            >
              <span>
                Sprint MMS · MR-I report · {asset?.asset_code ?? "—"} ·
                generated offline {generatedStamp}
              </span>
              <span>Page 1 of 2</span>
            </div>
          </div>
        </div>

        {/* PAGE 2 -- CHECKLIST */}
        <div
          className="mri-report-page"
          style={{
            width: "100%",
            minHeight: 1123,
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              flex: "0 0 64px",
              background: "#123c47",
              padding: "0 40px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#ffffff" }}>
                MR-I routine inspection
              </div>
              <div style={{ fontSize: 11, color: "#cfe2e6" }}>
                {asset?.service_line || "—"} · Asset {asset?.asset_code ?? "—"}{" "}
                · {fmtDate(reportDateIso)}
              </div>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#ffffff" }}>
              Page 2 of 2 · Inspection checklist
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "16px 40px 40px",
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 14,
                alignItems: "center",
                fontSize: 9.5,
                color: "#6b7680",
              }}
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <span
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: "50%",
                    background: "#1f8a4d",
                    color: "#fff",
                    fontSize: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✓
                </span>
                Pass
              </span>
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <span
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: "50%",
                    background: "#c0392b",
                    color: "#fff",
                    fontSize: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </span>
                Fault recorded
              </span>
              <span>Numbers match the inspection drawing on page 1</span>
              <span
                style={{
                  marginLeft: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                ↻ recurring finding — each entry stamped with its report date
                and the user who recorded it
              </span>
            </div>

            <div
              style={{
                border: "1px solid #e2e5e8",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "22px 1.15fr 40px 1.15fr 1.05fr 88px",
                  padding: "4px 8px",
                  background: "#f3f5f6",
                  fontSize: 8,
                  fontWeight: 700,
                  color: "#6b7680",
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                }}
              >
                <span>#</span>
                <span>Item</span>
                <span>Result</span>
                <span>Issue details</span>
                <span>Action taken</span>
                <span>Status</span>
              </div>

              {checklistBySection.map((section) => (
                <div key={section.sectionId}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      padding: "3px 8px",
                      background: "#eef3f4",
                      borderTop: "1px solid #dde5e7",
                      borderBottom: "1px solid #dde5e7",
                      fontSize: 9.5,
                      fontWeight: 800,
                      color: "#123c47",
                    }}
                  >
                    <span>{section.name}</span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#6b7680",
                        fontSize: 8.5,
                      }}
                    >
                      {section.sectionPass} of {section.sectionTotal} pass
                    </span>
                  </div>
                  {section.rows.map(({ ti, info, result }) => {
                    const isFail = result?.status === "Fail";
                    const thread = isFail ? historyThreadFor(ti, result) : [];
                    const occurrence = thread.length;
                    const occurrenceLabel =
                      occurrence === 2
                        ? "2nd"
                        : occurrence === 3
                          ? "3rd"
                          : `${occurrence}th`;
                    return (
                      <div
                        key={ti.id}
                        className="mri-checklist-row"
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "22px 1.15fr 40px 1.15fr 1.05fr 88px",
                          padding: "3px 8px",
                          gap: 5,
                          alignItems: isFail ? "flex-start" : "center",
                          borderBottom: "1px solid #eef0f2",
                          fontSize: 9.5,
                          lineHeight: 1.25,
                          background: isFail ? "#fdf8ea" : "transparent",
                          paddingTop: isFail ? 5 : 3,
                          paddingBottom: isFail ? 5 : 3,
                        }}
                      >
                        <span
                          style={{
                            color: "#9aa2a8",
                            fontWeight: 600,
                            fontSize: 9.5,
                          }}
                        >
                          {hotspotNumberForItem(ti.id) ?? ""}
                        </span>
                        <span>
                          {info?.description}
                          {isFail && occurrence > 1 && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                fontSize: 7.5,
                                fontWeight: 700,
                                color: "#8a6512",
                                marginTop: 2,
                                marginLeft: 6,
                              }}
                            >
                              ↻ {occurrenceLabel} occurrence
                            </span>
                          )}
                        </span>
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: 9,
                            fontWeight: 800,
                            marginTop: isFail ? 1 : 0,
                            background: isFail ? "#c0392b" : "#1f8a4d",
                          }}
                        >
                          {isFail ? "✕" : "✓"}
                        </span>
                        {isFail && occurrence > 1 ? (
                          <span
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }}
                          >
                            {thread.map((h, i) => (
                              <span
                                key={i}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 7.5,
                                    fontWeight: 700,
                                    color: "#9aa2a8",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.02em",
                                  }}
                                >
                                  {fmtDate(h.report_date)}
                                  {h.reported_by ? ` · ${h.reported_by}` : ""}
                                </span>
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    color: "#4b5560",
                                    marginTop: 1,
                                  }}
                                >
                                  {h.issue_details || "—"}
                                </span>
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span
                            style={{ color: isFail ? "#4b5560" : "#c3c8cc" }}
                          >
                            {isFail ? result?.issue_details || "—" : "—"}
                          </span>
                        )}
                        {isFail && occurrence > 1 ? (
                          <span
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }}
                          >
                            {thread.map((h, i) => (
                              <span
                                key={i}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 7.5,
                                    fontWeight: 700,
                                    color: "#9aa2a8",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.02em",
                                  }}
                                >
                                  {fmtDate(h.report_date)}
                                </span>
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    color: h.action_taken
                                      ? "#4b5560"
                                      : "#c3c8cc",
                                    marginTop: 1,
                                  }}
                                >
                                  {h.action_taken ||
                                    (h.closure_status === "Closed"
                                      ? "—"
                                      : "— (pending)")}
                                </span>
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span
                            style={{ color: isFail ? "#4b5560" : "#c3c8cc" }}
                          >
                            {isFail ? result?.action_taken || "—" : "—"}
                          </span>
                        )}
                        <span
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            alignItems: "flex-start",
                          }}
                        >
                          {isFail ? (
                            <>
                              {result?.severity && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "1px 6px",
                                    borderRadius: 20,
                                    fontSize: 8,
                                    fontWeight: 700,
                                    lineHeight: 1.5,
                                    background: `${REVIEW_SEVERITY_COLOR[result.severity]}22`,
                                    color:
                                      REVIEW_SEVERITY_COLOR[result.severity],
                                  }}
                                >
                                  {result.severity}
                                </span>
                              )}
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "1px 6px",
                                  borderRadius: 20,
                                  fontSize: 8,
                                  fontWeight: 700,
                                  lineHeight: 1.5,
                                  background:
                                    result?.closure_status === "Closed"
                                      ? "#e2e5e8"
                                      : "#fdf6e6",
                                  color:
                                    result?.closure_status === "Closed"
                                      ? "#5b6570"
                                      : "#8a6512",
                                  border:
                                    result?.closure_status === "Closed"
                                      ? "none"
                                      : "1px solid #d9b354",
                                }}
                              >
                                {result?.closure_status ?? "Pending"}
                              </span>
                            </>
                          ) : (
                            <span style={{ color: "#c3c8cc" }}>—</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {checklistBySection.length === 0 && (
                <div className="empty" style={{ padding: 14 }}>
                  No checklist items configured
                </div>
              )}
            </div>

            <div style={{ flex: 1 }} />

            <div
              style={{
                flex: "0 0 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid #eef0f2",
                paddingTop: 10,
                fontSize: 10.5,
                color: "#9aa2a8",
              }}
            >
              <span>
                Sprint MMS · MR-I report · {asset?.asset_code ?? "—"} ·
                generated offline {generatedStamp}
              </span>
              <span>Page 2 of 2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SEVERITY_RANK: Record<string, number> = {
  Critical: 3,
  Moderate: 2,
  Minor: 1,
};
const PASS_COLOR = "#2f9e44";
const REVIEW_SEVERITY_COLOR: Record<string, string> = {
  Minor: "#d4ac0d",
  Moderate: "#d97706",
  Critical: "#c0392b",
};
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const DRAWING_VIEW_HEIGHT = 640;

interface DrawingChecklistViewProps {
  drawing: { image_data: string };
  hotspots: any[];
  templateItems: any[];
  itemInfo: (checklistItemId: number) => any;
  getResult: (ti: any) => Partial<MriReportChecklistResult>;
  updateLocal: (ti: any, patch: Partial<MriReportChecklistResult>) => void;
  autoSave: (ti: any, patch: Partial<MriReportChecklistResult>) => void;
  locked: boolean;
  canReviewClosure?: boolean;
  severityColor: Record<string, string>;
  severityIcon: (severity: string, color: string) => any;
  severityGuidance: Record<string, { action: string; reviewer: string }>;
  selectedHotspotId: number | null;
  setSelectedHotspotId: (id: number | null) => void;
  attachmentsFor: (templateChecklistItemId: number) => MriReportAttachment[];
  onAddAttachment: (
    templateChecklistItemId: number,
    file: { fileName: string; fileType: string; data: string },
  ) => void;
  onDeleteAttachment: (id: number) => void;
}

function DrawingChecklistView({
  drawing,
  hotspots,
  templateItems,
  itemInfo,
  getResult,
  updateLocal,
  autoSave,
  locked,
  canReviewClosure,
  severityColor,
  severityIcon,
  severityGuidance,
  selectedHotspotId,
  setSelectedHotspotId,
  attachmentsFor,
  onAddAttachment,
  onDeleteAttachment,
}: DrawingChecklistViewProps) {
  const { data: sections = [] } = useChecklistSections();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panDrag = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  function zoomIn() {
    setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  }
  function zoomOut() {
    setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  }
  function zoomReset() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function startPan(e: React.PointerEvent) {
    if (e.button !== 0) return;
    panDrag.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    setIsPanning(true);

    function onMove(ev: PointerEvent) {
      if (!panDrag.current) return;
      setPan({
        x: panDrag.current.startPanX + (ev.clientX - panDrag.current.startX),
        y: panDrag.current.startPanY + (ev.clientY - panDrag.current.startY),
      });
    }
    function onUp() {
      panDrag.current = null;
      setIsPanning(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function itemsForHotspot(h: any) {
    return templateItems.filter((ti) => h.checklist_item_ids.includes(ti.id));
  }

  function sectionNamesForHotspot(h: any) {
    const items = itemsForHotspot(h);
    const names = Array.from(
      new Set(
        items.map(
          (ti: any) =>
            sections.find((s) => s.id === ti.section_id)?.name ?? "Unassigned",
        ),
      ),
    );
    return names;
  }

  function hotspotWorstSeverity(h: any): string | null {
    const items = itemsForHotspot(h);
    let worst: string | null = null;
    for (const ti of items) {
      const result = getResult(ti);
      if (result.status === "Fail" && result.severity) {
        if (!worst || SEVERITY_RANK[result.severity] > SEVERITY_RANK[worst])
          worst = result.severity;
      }
    }
    return worst;
  }

  function hotspotColor(h: any) {
    const items = itemsForHotspot(h);
    if (items.length === 0) return "var(--text-soft)";

    const worst = hotspotWorstSeverity(h);
    if (worst) return severityColor[worst] ?? "var(--danger)";
    const anyFail = items.some((ti) => getResult(ti).status === "Fail");
    if (anyFail) return "var(--danger)";
    return PASS_COLOR;
  }
  const selectedHotspot =
    hotspots.find((h) => h.id === selectedHotspotId) ?? null;
  const selectedItems = selectedHotspot ? itemsForHotspot(selectedHotspot) : [];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: selectedHotspot ? "1fr 360px" : "1fr",
        gap: 16,
      }}
    >
      <div
        style={{
          position: "relative",
          borderRadius: 16,
          overflow: "hidden",
          background: "#000",
          height: DRAWING_VIEW_HEIGHT,
          boxShadow:
            "inset 3px 3px 8px var(--neu-shadow-dark), inset -3px -3px 8px var(--neu-shadow-light)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 2,
            display: "flex",
            gap: 4,
          }}
        >
          <button
            className="icon-btn"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 12h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className="icon-btn"
            aria-label="Reset zoom"
            title={`Reset zoom (${Math.round(zoom * 100)}%)`}
            onClick={zoomReset}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="12"
                cy="12"
                r="8"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          </button>
          <button
            className="icon-btn"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div
          onPointerDown={startPan}
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isPanning ? "grabbing" : "grab",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          <div
            style={{
              position: "relative",
              width: `${zoom * 100}%`,
              flexShrink: 0,
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              transition: isPanning ? "none" : "width 0.15s ease",
            }}
          >
            <img
              src={drawing.image_data}
              alt="Equipment drawing"
              draggable={false}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                pointerEvents: "none",
              }}
            />
            {hotspots.map((h, i) => {
              const worstSeverity = hotspotWorstSeverity(h);
              const alertColor = worstSeverity
                ? (severityColor[worstSeverity] ?? "var(--danger)")
                : undefined;
              return (
                <button
                  key={h.id}
                  onClick={() => setSelectedHotspotId(h.id)}
                  title={h.label ?? `Hotspot ${i + 1}`}
                  className={worstSeverity ? "hotspot-alert" : undefined}
                  style={{
                    position: "absolute",
                    left: `${h.x * 100}%`,
                    top: `${h.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fff",
                    background: hotspotColor(h),
                    border: alertColor
                      ? `2px solid ${alertColor}`
                      : selectedHotspotId === h.id
                        ? "2px solid var(--accent)"
                        : "2px solid var(--surface)",
                    boxShadow:
                      selectedHotspotId === h.id
                        ? "0 0 0 2px var(--accent), 0 0 0 4px rgba(0,0,0,0.25)"
                        : "0 0 0 2px rgba(0,0,0,0.25)",
                    cursor: "pointer",
                    ...(alertColor
                      ? ({ "--pulse-color": alertColor } as React.CSSProperties)
                      : {}),
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
                @keyframes hotspot-throb {
                    0%, 100% { transform: translate(-50%, -50%) scale(1); }
                    50% { transform: translate(-50%, -50%) scale(1.3); }
                }
                @keyframes hotspot-ring {
                    0% { opacity: 0.95; transform: scale(0.8); }
                    80% { opacity: 0; transform: scale(3); }
                    100% { opacity: 0; transform: scale(3); }
                }
                .hotspot-alert {
                    animation: hotspot-throb 1.3s ease-in-out infinite;
                }
                .hotspot-alert::after {
                    content: "";
                    position: absolute;
                    inset: -20px;
                    border-radius: 50%;
                    background: radial-gradient(circle, var(--pulse-color, var(--danger)) 0%, color-mix(in srgb, var(--pulse-color, var(--danger)) 70%, transparent) 55%, transparent 85%);
                    animation: hotspot-ring 1.3s ease-out infinite;
                    pointer-events: none;
                }
            `}</style>

      {selectedHotspot && (
        <div
          className="panel"
          style={{
            padding: 16,
            height: DRAWING_VIEW_HEIGHT,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <h3 style={{ margin: 0 }}>
              {(() => {
                const names = sectionNamesForHotspot(selectedHotspot);
                if (names.length > 0) return names.join(" / ");
                return (
                  selectedHotspot.label ??
                  `Hotspot #${hotspots.findIndex((h) => h.id === selectedHotspot.id) + 1}`
                );
              })()}
            </h3>
            <button
              className="icon-btn"
              aria-label="Close"
              onClick={() => setSelectedHotspotId(null)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {selectedItems.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--text-soft)" }}>
              No checklist items are linked to this hotspot.
            </p>
          ) : (
            selectedItems.map((ti) => {
              const info = itemInfo(ti.checklist_item_id);
              const result = getResult(ti);
              const isFail = result.status === "Fail";
              const cardColor = isFail
                ? result.severity
                  ? (severityColor[result.severity] ?? "var(--danger)")
                  : "var(--danger)"
                : PASS_COLOR;
              return (
                <div
                  key={ti.id}
                  style={{
                    marginBottom: 12,
                    borderRadius: 10,
                    borderLeft: `4px solid ${cardColor}`,
                    background: `color-mix(in srgb, ${cardColor} 10%, transparent)`,
                    padding: "12px 14px 16px",
                  }}
                >
                  <div
                    style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}
                  >
                    {info?.description}
                    {ti.required && (
                      <span style={{ color: "var(--danger)" }}> *</span>
                    )}
                  </div>

                  <div className="field">
                    <label>Pass / Fail</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="ghost"
                        disabled={locked}
                        style={{
                          padding: "6px 10px",
                          fontSize: 12,
                          flex: 1,
                          ...(result.status === "Pass"
                            ? { background: "var(--accent)", color: "#fff" }
                            : {}),
                        }}
                        onClick={() => {
                          const patch = {
                            status: "Pass" as const,
                            issue_details: "",
                            action_taken: "",
                          };
                          updateLocal(ti, patch);
                          autoSave(ti, patch);
                        }}
                      >
                        Pass
                      </button>
                      <button
                        className={
                          result.status === "Fail" ? "danger" : "ghost"
                        }
                        disabled={locked}
                        style={{ padding: "6px 10px", fontSize: 12, flex: 1 }}
                        onClick={() => {
                          updateLocal(ti, { status: "Fail" });
                          autoSave(ti, { status: "Fail" });
                        }}
                      >
                        Fail
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <label>Issue Details</label>
                    <input
                      type="text"
                      className="trigger-input"
                      value={result.issue_details ?? ""}
                      onChange={(e) =>
                        updateLocal(ti, { issue_details: e.target.value })
                      }
                      onBlur={() => autoSave(ti, {})}
                      disabled={locked || !isFail}
                      placeholder={isFail ? "Required" : "—"}
                    />
                  </div>

                  <div className="field">
                    <label>Action Taken</label>
                    <input
                      type="text"
                      className="trigger-input"
                      value={result.action_taken ?? ""}
                      onChange={(e) =>
                        updateLocal(ti, { action_taken: e.target.value })
                      }
                      onBlur={() => autoSave(ti, {})}
                      disabled={locked || !isFail}
                      placeholder={isFail ? "Required" : "—"}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div className="field">
                      <label>Date Observed</label>
                      <input
                        type="date"
                        className="trigger-input"
                        value={result.date_observed ?? ""}
                        onChange={(e) => {
                          updateLocal(ti, { date_observed: e.target.value });
                          autoSave(ti, { date_observed: e.target.value });
                        }}
                        disabled={locked}
                      />
                    </div>
                    <div className="field">
                      <label>Closure Status</label>
                      <select
                        className="neu-select"
                        value={result.closure_status ?? "Pending"}
                        onChange={(e) => {
                          const val = e.target.value as "Pending" | "Closed";
                          updateLocal(ti, { closure_status: val });
                          autoSave(ti, { closure_status: val });
                        }}
                        disabled={locked && !canReviewClosure}
                      >
                        {CLOSURE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label>Severity</label>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      {result.severity && (
                        <span
                          title={`Severity: ${result.severity}`}
                          style={{ display: "flex" }}
                        >
                          {severityIcon(
                            result.severity,
                            severityColor[result.severity] ??
                              "var(--text-soft)",
                          )}
                        </span>
                      )}
                      <select
                        className="neu-select"
                        style={{ fontSize: 12, padding: "4px 6px" }}
                        value={result.severity ?? ""}
                        onChange={(e) => {
                          const val = (e.target.value ||
                            null) as typeof result.severity;
                          updateLocal(ti, { severity: val });
                          autoSave(ti, { severity: val });
                        }}
                        disabled={locked}
                      >
                        <option value="">—</option>
                        {SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {isFail &&
                    result.severity &&
                    severityGuidance[result.severity] && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          padding: "8px 10px",
                          borderRadius: 8,
                          marginBottom: 10,
                          fontSize: 11.5,
                          lineHeight: 1.4,
                          background: `${severityColor[result.severity]}14`,
                          borderLeft: `3px solid ${severityColor[result.severity]}`,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            color: severityColor[result.severity],
                          }}
                        >
                          {result.severity} — Required Action
                        </span>
                        <span style={{ color: "var(--text-soft)" }}>
                          {severityGuidance[result.severity].action}
                        </span>
                        <span style={{ color: "var(--text-soft)" }}>
                          {severityGuidance[result.severity].reviewer}
                        </span>
                      </div>
                    )}

                  <div className="field">
                    <label>Attachments</label>
                    <AttachmentGallery
                      attachments={attachmentsFor(ti.id)}
                      locked={locked}
                      onAdd={(file) => onAddAttachment(ti.id, file)}
                      onDelete={(id) => onDeleteAttachment(id)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

interface AttachmentGalleryProps {
  attachments: MriReportAttachment[];
  locked: boolean;
  onAdd: (file: { fileName: string; fileType: string; data: string }) => void;
  onDelete: (id: number) => void;
  variant?: "compact" | "full";
}

const VIEWER_ZOOM_MIN = 1;
const VIEWER_ZOOM_MAX = 4;
const VIEWER_ZOOM_STEP = 0.25;

function AttachmentViewerModal({
  attachment,
  onClose,
}: {
  attachment: MriReportAttachment;
  onClose: () => void;
}) {
  const isPdf = attachment.file_type === "application/pdf";
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panDrag = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  function zoomIn() {
    setZoom((z) =>
      Math.min(VIEWER_ZOOM_MAX, +(z + VIEWER_ZOOM_STEP).toFixed(2)),
    );
  }
  function zoomOut() {
    setZoom((z) =>
      Math.max(VIEWER_ZOOM_MIN, +(z - VIEWER_ZOOM_STEP).toFixed(2)),
    );
  }
  function zoomReset() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function startPan(e: React.PointerEvent) {
    if (zoom <= 1) return;
    setIsPanning(true);
    panDrag.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    function onMove(ev: PointerEvent) {
      if (!panDrag.current) return;
      setPan({
        x: panDrag.current.startPanX + (ev.clientX - panDrag.current.startX),
        y: panDrag.current.startPanY + (ev.clientY - panDrag.current.startY),
      });
    }
    function onUp() {
      setIsPanning(false);
      panDrag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={
          isPdf
            ? {
                display: "flex",
                flexDirection: "column",
                width: "min(1100px, 92vw)",
                height: "min(800px, 88vh)",
              }
            : {
                position: "relative",
                width: "min(1100px, 92vw)",
                height: "min(800px, 88vh)",
              }
        }
      >
        {isPdf ? (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 6,
              marginBottom: 8,
              flexShrink: 0,
            }}
          >
            <button
              className="ghost"
              style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              display: "flex",
              gap: 6,
              zIndex: 2,
            }}
          >
            <button
              className="ghost"
              style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={zoomOut}
            >
              −
            </button>
            <button
              className="ghost"
              style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={zoomReset}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              className="ghost"
              style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={zoomIn}
            >
              +
            </button>
            <button
              className="ghost"
              style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={() => {
                const link = document.createElement("a");
                link.href = attachment.data;
                link.download = attachment.file_name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              Download
            </button>
            <button
              className="ghost"
              style={{ padding: "6px 10px", fontSize: 12 }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}

        {isPdf ? (
          <embed
            src={attachment.data}
            type="application/pdf"
            style={{
              width: "100%",
              flex: 1,
              borderRadius: 12,
              border: "none",
              background: "#525659",
            }}
          />
        ) : (
          <div
            onPointerDown={startPan}
            style={{
              width: "100%",
              height: "100%",
              overflow: "hidden",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#000",
              cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <div
              style={{
                width: `${zoom * 100}%`,
                flexShrink: 0,
                transform: `translate(${pan.x}px, ${pan.y}px)`,
                transition: isPanning ? "none" : "width 0.15s ease",
              }}
            >
              <img
                src={attachment.data}
                alt={attachment.file_name}
                draggable={false}
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentGallery({
  attachments,
  locked,
  onAdd,
  onDelete,
  variant = "full",
}: AttachmentGalleryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<MriReportAttachment | null>(null);
  const compact = variant === "compact";

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("File is too large (max 5MB)");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      onAdd({
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        data: dataUrl,
      });
    };
    reader.readAsDataURL(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      style={
        compact
          ? { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }
          : { display: "flex", flexDirection: "column", gap: 8, width: "100%" }
      }
    >
      {attachments.map((a) => {
        const isImage = a.file_type.startsWith("image/");
        const isPdf = a.file_type === "application/pdf";
        return (
          <div
            key={a.id}
            style={
              compact
                ? { position: "relative", width: 30, height: 30 }
                : { position: "relative", width: "100%" }
            }
          >
            {isImage ? (
              <img
                src={a.data}
                alt={a.file_name}
                title={a.file_name}
                style={
                  compact
                    ? {
                        width: 30,
                        height: 30,
                        objectFit: "cover",
                        borderRadius: 6,
                        cursor: "pointer",
                      }
                    : {
                        width: "100%",
                        height: 140,
                        objectFit: "cover",
                        borderRadius: 10,
                        cursor: "pointer",
                        display: "block",
                      }
                }
                onClick={() => setExpanded(a)}
              />
            ) : isPdf ? (
              <div
                title={a.file_name}
                onClick={() => setExpanded(a)}
                style={
                  compact
                    ? {
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        overflow: "hidden",
                        cursor: "pointer",
                        position: "relative",
                      }
                    : {
                        width: "100%",
                        height: 140,
                        borderRadius: 10,
                        overflow: "hidden",
                        cursor: "pointer",
                        position: "relative",
                        background: "#525659",
                      }
                }
              >
                <embed
                  src={a.data}
                  type="application/pdf"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: compact ? 300 : 800,
                    height: compact ? 300 : 1000,
                    transform: compact
                      ? "translate(-50%, -50%) scale(0.1)"
                      : "translate(-50%, -50%) scale(0.28)",
                    transformOrigin: "center center",
                    pointerEvents: "none",
                    border: "none",
                  }}
                />
                <div style={{ position: "absolute", inset: 0 }} />
                <div style={{ position: "absolute", inset: 0 }} />
              </div>
            ) : (
              <div
                title={a.file_name}
                onClick={() => window.open(a.data, "_blank")}
                style={
                  compact
                    ? {
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--neu-bg)",
                        boxShadow:
                          "inset 2px 2px 5px var(--neu-shadow-dark), inset -2px -2px 5px var(--neu-shadow-light)",
                        fontSize: 9,
                        fontWeight: 700,
                        color: "var(--text-soft)",
                        cursor: "pointer",
                      }
                    : {
                        width: "100%",
                        height: 60,
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--neu-bg)",
                        boxShadow:
                          "inset 2px 2px 5px var(--neu-shadow-dark), inset -2px -2px 5px var(--neu-shadow-light)",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--text-soft)",
                        cursor: "pointer",
                        flexDirection: "column",
                        gap: 4,
                      }
                }
              >
                {a.file_name.split(".").pop()?.slice(0, 4).toUpperCase() ??
                  "FILE"}
              </div>
            )}
            {!locked && (
              <button
                aria-label="Remove attachment"
                onClick={() => onDelete(a.id)}
                style={
                  compact
                    ? {
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        border: "none",
                        background: "var(--danger)",
                        color: "#fff",
                        fontSize: 10,
                        lineHeight: "16px",
                        cursor: "pointer",
                        padding: 0,
                      }
                    : {
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: "none",
                        background: "var(--danger)",
                        color: "#fff",
                        fontSize: 13,
                        lineHeight: "22px",
                        cursor: "pointer",
                        padding: 0,
                      }
                }
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {!locked && (
        <>
          <input
            ref={inputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleFile}
          />
          <button
            className="icon-btn"
            aria-label="Add attachment"
            onClick={() => inputRef.current?.click()}
            style={
              compact
                ? { width: 30, height: 30 }
                : { width: "100%", height: 36 }
            }
            title="Add photo or file"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: 16, height: 16 }}
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </>
      )}
      {error && (
        <span style={{ fontSize: 10, color: "var(--danger)" }}>{error}</span>
      )}

      {expanded && (
        <AttachmentViewerModal
          attachment={expanded}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  );
}

export default ReportWizard;
