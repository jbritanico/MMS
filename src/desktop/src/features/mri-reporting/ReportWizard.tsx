import { useState, useEffect, useRef } from "react";
import { useMriReport, useSubmitMriReport, usePreviousEngineHours, usePendingChecklistItemIds } from "./hooks/useMriReports";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useMriTemplates } from "../administration/hooks/useMriTemplates";
import { useTemplateHeaderFields, useHeaderFieldCatalog } from "../mri-template-builder/hooks/useTemplateHeaderFields";
import { useTemplateMidFields, useMidFieldCatalog } from "../mri-template-builder/hooks/useTemplateMidFields";
import { useTemplateFooterFields, useFooterFieldCatalog } from "../mri-template-builder/hooks/useTemplateFooterFields";
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
    type MriReportChecklistResult,
    type MriReportAttachment,
} from "./hooks/useMriReportValues";
import { useTemplateChecklistItems } from "../mri-template-builder/hooks/useTemplateChecklistItems";
import { useChecklistItems } from "../administration/hooks/useChecklistDatabank";
import { useTemplateDrawing, useTemplateDrawingHotspots } from "../mri-template-builder/hooks/useTemplateDrawing";
import { useChecklistSections } from "../administration/hooks/useChecklistSections";
import { useLookups } from "../administration/hooks/useLookups";
import { useAssetTriggers } from "../asset-registry/hooks/useTriggers";

type Step = "header" | "checklist" | "mid" | "footer" | "review";

const STEPS: { id: Step; label: string }[] = [
    { id: "header", label: "Header" },
    { id: "checklist", label: "Checklist" },
    { id: "mid", label: "Mid-Section" },
    { id: "footer", label: "Footer" },
    { id: "review", label: "Review & Submit" },
];

interface ReportWizardProps {
    reportId: number;
    onBack: () => void;
}

function ReportWizard({ reportId, onBack }: ReportWizardProps) {
    const { data: report } = useMriReport(reportId);
    const { data: assets = [] } = useAssets();
    const { data: templates = [] } = useMriTemplates();
    const submitReport = useSubmitMriReport();

    const [step, setStep] = useState<Step>("header");
    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
    const [reviewIssues, setReviewIssues] = useState<string[]>([]);
    const currentIndex = STEPS.findIndex((s) => s.id === step);

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
            await submitReport.mutateAsync(reportId);
            flash("Report submitted — now locked from further editing", "ok");
        } catch (err) {
            flash(String(err), "err");
        }
    }

    if (!report) {
        return <div className="empty">Loading report...</div>;
    }

    const asset = assets.find((a) => a.id === report.asset_id);
    const template = templates.find((t) => t.id === report.template_id);
    const isLocked = report.status !== "Draft";

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>
                    ← Back
                </button>
            </div>

            <div className="header">
                <h1>{asset?.asset_code ?? "Report"} — MR-I</h1>
                <span className="sub">{template?.template_name ?? ""} · {report.status}</span>
            </div>

            {isLocked && (
                <div className="toast err" style={{ maxWidth: 500, marginBottom: 16 }}>
                    This report is {report.status.toLowerCase()} and can no longer be edited.
                </div>
            )}

            <div className="wizard-steps">
                {STEPS.map((s, i) => (
                    <div key={s.id} className={`wizard-step ${i === currentIndex ? "active" : ""} ${i < currentIndex ? "done" : ""}`}>
                        <span className="wizard-step-dot">{i < currentIndex ? "✓" : i + 1}</span>
                        <span className="wizard-step-label">{s.label}</span>
                    </div>
                ))}
            </div>

            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 500, marginBottom: 16 }}>{status.msg}</div>}

            <div className="panel" style={{ minHeight: 320 }}>
                {step === "header" && (
                    <HeaderEntryStep templateId={report.template_id} reportId={reportId} locked={isLocked} asset={asset} />
                )}
                {step === "checklist" && (
                    <ChecklistEntryStep templateId={report.template_id} reportId={reportId} locked={isLocked} assetId={report.asset_id} />
                )}
                {step === "mid" && <div className="empty">Mid-section entry goes here</div>}
                {step === "footer" && <div className="empty">Footer entry goes here</div>}
                {step === "review" && (
                    <ReviewStep
                        templateId={report.template_id}
                        reportId={reportId}
                        locked={isLocked}
                        onValidate={setReviewIssues}
                    />
                )}
            </div>

            <div className="actions" style={{ marginTop: 16 }}>
                <button className="ghost" onClick={goBack} disabled={currentIndex === 0}>← Previous</button>
                {step !== "review" ? (
                    <button className="primary" onClick={goNext}>Next →</button>
                ) : (
                    <button
                        className="primary"
                        onClick={handleSubmit}
                        disabled={isLocked || reviewIssues.length > 0}
                        title={reviewIssues.length > 0 ? "Resolve the issues listed above first" : undefined}
                    >
                        {isLocked ? "Already submitted" : `Submit Report${reviewIssues.length > 0 ? ` (${reviewIssues.length} issue${reviewIssues.length === 1 ? "" : "s"})` : ""}`}
                    </button>
                )}
            </div>
        </div>
    );
}

const INHERITED_FIELDS: Record<string, (asset: any) => string> = {
    "country": (asset) => asset?.country ?? "",
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

const COMPLIANCE_STAGE_OPTIONS = ["PREMOB", "PRE-JOB", "POST JOB", "YARD INSPECTION"];

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function HeaderEntryStep({ templateId, reportId, locked, asset }: { templateId: number; reportId: number; locked: boolean; asset: any }) {
    const { data: templateFields = [] } = useTemplateHeaderFields(templateId);
    const { data: catalog = [] } = useHeaderFieldCatalog();
    const { data: savedValues = [] } = useMriReportHeaderValues(reportId);
    const setValue = useSetMriReportHeaderValue(reportId);
    const { data: previousEngineHours } = usePreviousEngineHours(asset?.id ?? 0, reportId);
    const { data: clientOptions = [] } = useLookups("CLIENT");
    const { data: triggers = [] } = useAssetTriggers(asset?.id ?? 0);

    const [localValues, setLocalValues] = useState<Record<number, string>>({});
    const persistedInherited = useState(() => new Set<number>())[0];
    const autoSavedDates = useState(() => new Set<number>())[0];

    function fieldLabel(headerFieldId: number) {
        return catalog.find((c) => c.id === headerFieldId)?.label ?? "—";
    }

    function inheritedGetter(headerFieldId: number) {
        const label = fieldLabel(headerFieldId).trim().toLowerCase();
        return INHERITED_FIELDS[label];
    }

    const mr2CaTrigger = triggers.find((t) => t.mr_level === "MR-II" && t.trigger_type === "CA");
    let mr2DueDate = "";
    if (mr2CaTrigger) {
        const daysRemaining = mr2CaTrigger.interval_value - mr2CaTrigger.running_value;
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
            const alreadySaved = savedValues.find((v) => v.template_header_field_id === tf.id);
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

    const sortedFields = [...templateFields].sort((a, b) => a.display_order - b.display_order);

    function handleChange(fieldId: number, value: string) {
        setLocalValues((prev) => ({ ...prev, [fieldId]: value }));
    }

    async function handleBlur(fieldId: number) {
        if (locked) return;
        await setValue.mutateAsync({ templateHeaderFieldId: fieldId, value: localValues[fieldId] ?? "" });

        const changedLabel = fieldLabel(templateFields.find((f) => f.id === fieldId)?.header_field_id ?? -1).trim().toLowerCase();
        if (changedLabel === ENGINE_HOURS_CURRENT) {
            const computedField = templateFields.find(
                (f) => fieldLabel(f.header_field_id).trim().toLowerCase() === ENGINE_HOURS_COMPUTED
            );
            if (computedField) {
                const currentVal = parseFloat(localValues[fieldId] ?? "0") || 0;
                const prevVal = parseFloat(previousEngineHours ?? "0") || 0;
                const computed = (currentVal - prevVal).toFixed(1);
                await setValue.mutateAsync({ templateHeaderFieldId: computedField.id, value: computed });
            }
        }
    }

    if (sortedFields.length === 0) {
        return <div className="empty">This template has no header fields configured</div>;
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
                                    <span style={{ color: "var(--text-soft)", fontStyle: "italic" }}> (auto)</span>
                                </label>
                                <input type="text" className="trigger-input" value={prevValue} disabled />
                            </div>
                        );
                    }

                    if (label === ENGINE_HOURS_CURRENT) {
                        return (
                            <div key={tf.id} className="mri-preview-table-row">
                                <label>
                                    {fieldLabel(tf.header_field_id)}
                                    {tf.required && <span style={{ color: "var(--danger)" }}> *</span>}
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
                                    {tf.required && <span style={{ color: "var(--danger)" }}> *</span>}
                                </label>
                                <select
                                    className="neu-select"
                                    value={localValues[tf.id] ?? ""}
                                    onChange={(e) => handleChange(tf.id, e.target.value)}
                                    onBlur={() => handleBlur(tf.id)}
                                    disabled={locked}
                                >
                                    <option value="">— Select —</option>
                                    {clientOptions.filter((c) => c.active).map((c) => (
                                        <option key={c.id} value={c.name}>{c.name}</option>
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
                                    {tf.required && <span style={{ color: "var(--danger)" }}> *</span>}
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
                                        <option key={opt} value={opt}>{opt}</option>
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
                                    <span style={{ color: "var(--text-soft)", fontStyle: "italic" }}> (computed)</span>
                                </label>
                                <input type="text" className="trigger-input" value={mr2DueDate || "—"} disabled />
                            </div>
                        );
                    }

                    if (label === MR_INITIATION_DATE) {
                        return (
                            <div key={tf.id} className="mri-preview-table-row">
                                <label>
                                    {fieldLabel(tf.header_field_id)}
                                    <span style={{ color: "var(--text-soft)", fontStyle: "italic" }}> (auto)</span>
                                </label>
                                <input type="text" className="trigger-input" value={todayIso()} disabled />
                            </div>
                        );
                    }

                    if (label === ENGINE_HOURS_COMPUTED) {
                        const currentField = sortedFields.find(
                            (f) => fieldLabel(f.header_field_id).trim().toLowerCase() === ENGINE_HOURS_CURRENT
                        );
                        const currentVal = parseFloat(currentField ? (localValues[currentField.id] ?? "0") : "0") || 0;
                        const prevVal = parseFloat(previousEngineHours ?? "0") || 0;
                        const computed = (currentVal - prevVal).toFixed(1);
                        return (
                            <div key={tf.id} className="mri-preview-table-row">
                                <label>
                                    {fieldLabel(tf.header_field_id)}
                                    <span style={{ color: "var(--text-soft)", fontStyle: "italic" }}> (computed)</span>
                                </label>
                                <input type="text" className="trigger-input" value={computed} disabled />
                            </div>
                        );
                    }

                    const displayValue = isInherited ? getter!(asset) : (localValues[tf.id] ?? "");
                    const isNumeric = label === JOB_OPERATING_HOURS;
                    return (
                        <div key={tf.id} className="mri-preview-table-row">
                            <label>
                                {fieldLabel(tf.header_field_id)}
                                {tf.required && <span style={{ color: "var(--danger)" }}> *</span>}
                                {isInherited && <span style={{ color: "var(--text-soft)", fontStyle: "italic" }}> (from asset)</span>}
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

const CLOSURE_STATUSES = ["Pending", "Closed"] as const;
const SEVERITIES = ["Minor", "Moderate", "Critical"] as const;

function ChecklistEntryStep({ templateId, reportId, locked, assetId }: { templateId: number; reportId: number; locked: boolean; assetId: number }) {
    const { data: templateItems = [] } = useTemplateChecklistItems(templateId);
    const { data: databank = [] } = useChecklistItems();
    const { data: sections = [] } = useChecklistSections();
    const { data: savedResults = [] } = useMriReportChecklistResults(reportId);
    const setResult = useSetMriReportChecklistResult(reportId);
    const { data: pendingItemIds = [] } = usePendingChecklistItemIds(assetId, reportId);
    const { data: drawing } = useTemplateDrawing(templateId);
    const { data: hotspots = [] } = useTemplateDrawingHotspots(templateId);
    const { data: attachments = [] } = useMriReportAttachments(reportId);
    const addAttachment = useAddMriReportAttachment(reportId);
    const deleteAttachment = useDeleteMriReportAttachment(reportId);

    function attachmentsFor(templateChecklistItemId: number) {
        return attachments.filter((a) => a.template_checklist_item_id === templateChecklistItemId);
    }

    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
    const [view, setView] = useState<"list" | "drawing">("list");
    const [selectedHotspotId, setSelectedHotspotId] = useState<number | null>(null);
    const [localEdits, setLocalEdits] = useState<Record<number, Partial<MriReportChecklistResult>>>({});
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

    function getResult(ti: (typeof templateItems)[number]): Partial<MriReportChecklistResult> {
        const saved = savedResults.find((r) => r.template_checklist_item_id === ti.id);
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

    function updateLocal(ti: (typeof templateItems)[number], patch: Partial<MriReportChecklistResult>) {
        setLocalEdits((prev) => ({
            ...prev,
            [ti.id]: { ...getResult(ti), ...prev[ti.id], ...patch },
        }));
    }

    async function autoSave(ti: (typeof templateItems)[number], patch: Partial<MriReportChecklistResult>) {
        if (locked) return;
        const current = { ...getResult(ti), ...patch };

        if (current.status === "Fail" && (!current.issue_details?.trim() || !current.action_taken?.trim())) {
            return;
        }

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
            });
        } catch (err) {
            flash(String(err), "err");
        }
    }

    const sortedItems = [...templateItems].sort((a, b) => a.display_order - b.display_order);

    useEffect(() => {
        if (locked || templateItems.length === 0) return;
        templateItems.forEach((ti) => {
            if (autoDefaulted.has(ti.id)) return;
            const alreadySaved = savedResults.find((r) => r.template_checklist_item_id === ti.id);
            if (alreadySaved) { autoDefaulted.add(ti.id); return; }
            autoDefaulted.add(ti.id);
            autoSave(ti, { status: defaultStatusFor(ti) });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateItems.length, pendingItemIds.length, locked]);

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
        if (groups.has(null)) ordered.push({ label: "Unassigned", items: groups.get(null)! });
        return ordered;
    })();

    const severityColor: Record<string, string> = {
        Minor: "#d4ac0d",
        Moderate: "#d97706",
        Critical: "#c0392b",
    };

    function severityIcon(severity: string, color: string) {
        switch (severity) {
            case "Minor":
                return (
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 16, height: 16 }}>
                        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
                        <path d="M8 12.5l2.5 2.5L16 9.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                );
            case "Moderate":
                return (
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 16, height: 16 }}>
                        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
                        <path d="M12 11v5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
                        <circle cx="12" cy="8" r="1" fill={color} />
                    </svg>
                );
            case "Critical":
                return (
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 17, height: 17 }}>
                        <path
                            d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3L8.3 3z"
                            stroke={color} strokeWidth="1.8" strokeLinejoin="round"
                        />
                        <path d="M12 8v5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
                        <circle cx="12" cy="16" r="1" fill={color} />
                    </svg>
                );
            default:
                return null;
        }
    }

    const COLS = "1.5fr 0.9fr 1.1fr 1.1fr 0.9fr 0.8fr 0.7fr 1.1fr";

    if (sortedItems.length === 0) {
        return <div className="empty">This template has no checklist items configured</div>;
    }

    return (
        <div>
            <h2>Checklist</h2>
            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 500, marginBottom: 12 }}>{status.msg}</div>}

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
                    severityColor={severityColor}
                    severityIcon={severityIcon}
                    selectedHotspotId={selectedHotspotId}
                    setSelectedHotspotId={setSelectedHotspotId}
                    attachmentsFor={attachmentsFor}
                    onAddAttachment={(templateChecklistItemId, file) =>
                        addAttachment.mutate({ templateChecklistItemId, ...file })
                    }
                    onDeleteAttachment={(id) => deleteAttachment.mutate(id)}
                />
            )}

            {view === "list" && grouped.map((group) => (
                <div key={group.label} style={{ marginBottom: 24 }}>
                    <div className="mri-preview-section-label">{group.label}</div>

                    <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 10, alignItems: "center", padding: "6px 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--text-soft)" }}>
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

                        return (
                            <div
                                key={ti.id}
                                style={{
                                    display: "grid", gridTemplateColumns: COLS, gap: 10, alignItems: "center",
                                    padding: "10px 4px", borderTop: "1px solid var(--border)", fontSize: 13,
                                }}
                            >
                                <span style={{ whiteSpace: "normal" }}>
                                    {info?.description}
                                    {ti.required && <span style={{ color: "var(--danger)" }}> *</span>}
                                </span>

                                <div style={{ display: "flex", gap: 4 }}>
                                    <button
                                        className="ghost"
                                        disabled={locked}
                                        style={{
                                            padding: "6px 10px", fontSize: 12,
                                            ...(result.status === "Pass" ? { background: "var(--accent)", color: "#fff" } : {}),
                                        }}
                                        onClick={() => {
                                            const patch = { status: "Pass" as const, issue_details: "", action_taken: "" };
                                            updateLocal(ti, patch);
                                            autoSave(ti, patch);
                                        }}
                                    >
                                        Pass
                                    </button>
                                    <button
                                        className={result.status === "Fail" ? "danger" : "ghost"}
                                        disabled={locked}
                                        style={{ padding: "6px 10px", fontSize: 12 }}
                                        onClick={() => updateLocal(ti, { status: "Fail" })}
                                    >
                                        Fail
                                    </button>
                                </div>

                                <input
                                    type="text"
                                    className="trigger-input"
                                    value={result.issue_details ?? ""}
                                    onChange={(e) => updateLocal(ti, { issue_details: e.target.value })}
                                    onBlur={() => autoSave(ti, {})}
                                    disabled={locked || !isFail}
                                    placeholder={isFail ? "Required" : "—"}
                                />

                                <input
                                    type="text"
                                    className="trigger-input"
                                    value={result.action_taken ?? ""}
                                    onChange={(e) => updateLocal(ti, { action_taken: e.target.value })}
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
                                    disabled={locked}
                                >
                                    {CLOSURE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>

                                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                                    {result.severity && (
                                        <span title={`Severity: ${result.severity}`} style={{ display: "flex" }}>
                                            {severityIcon(result.severity, severityColor[result.severity] ?? "var(--text-soft)")}
                                        </span>
                                    )}
                                    <select
                                        className="neu-select"
                                        style={{ fontSize: 12, padding: "4px 6px" }}
                                        value={result.severity ?? ""}
                                        onChange={(e) => {
                                            const val = (e.target.value || null) as typeof result.severity;
                                            updateLocal(ti, { severity: val });
                                            autoSave(ti, { severity: val });
                                        }}
                                        disabled={locked}
                                    >
                                        <option value="">—</option>
                                        {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>

                                <AttachmentGallery
                                    attachments={attachmentsFor(ti.id)}
                                    locked={locked}
                                    onAdd={(file) => addAttachment.mutate({ templateChecklistItemId: ti.id, ...file })}
                                    onDelete={(id) => deleteAttachment.mutate(id)}
                                />
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

interface ReviewStepProps {
    templateId: number;
    reportId: number;
    locked: boolean;
    onValidate: (issues: string[]) => void;
}

function ReviewStep({ templateId, reportId, locked, onValidate }: ReviewStepProps) {
    const { data: headerFields = [] } = useTemplateHeaderFields(templateId);
    const { data: headerCatalog = [] } = useHeaderFieldCatalog();
    const { data: headerValues = [] } = useMriReportHeaderValues(reportId);

    const { data: templateItems = [] } = useTemplateChecklistItems(templateId);
    const { data: databank = [] } = useChecklistItems();
    const { data: sections = [] } = useChecklistSections();
    const { data: checklistResults = [] } = useMriReportChecklistResults(reportId);

    const { data: midFields = [] } = useTemplateMidFields(templateId);
    const { data: midCatalog = [] } = useMidFieldCatalog();
    const { data: midValues = [] } = useMriReportMidValues(reportId);

    const { data: footerFields = [] } = useTemplateFooterFields(templateId);
    const { data: footerCatalog = [] } = useFooterFieldCatalog();
    const { data: footerValues = [] } = useMriReportFooterValues(reportId);

    function itemInfo(checklistItemId: number) {
        return databank.find((d) => d.id === checklistItemId);
    }
    function sectionName(sectionId: number | null) {
        return sections.find((s) => s.id === sectionId)?.name ?? "Unassigned";
    }

    const headerRows = [...headerFields]
        .sort((a, b) => a.display_order - b.display_order)
        .map((tf) => ({
            id: tf.id,
            label: headerCatalog.find((c) => c.id === tf.header_field_id)?.label ?? "—",
            required: tf.required,
            value: headerValues.find((v) => v.template_header_field_id === tf.id)?.value ?? "",
        }));

    const midRows = [...midFields]
        .sort((a, b) => a.display_order - b.display_order)
        .map((tf) => ({
            id: tf.id,
            label: midCatalog.find((c) => c.id === tf.mid_field_id)?.label ?? "—",
            value: midValues.find((v) => v.template_mid_field_id === tf.id)?.value ?? "",
        }));

    const footerRows = [...footerFields]
        .sort((a, b) => a.display_order - b.display_order)
        .map((tf) => ({
            id: tf.id,
            label: footerCatalog.find((c) => c.id === tf.footer_field_id)?.label ?? "—",
            value: footerValues.find((v) => v.template_footer_field_id === tf.id)?.value ?? "",
        }));

    const checklistRows = [...templateItems]
        .sort((a, b) => a.display_order - b.display_order)
        .map((ti) => {
            const result = checklistResults.find((r) => r.template_checklist_item_id === ti.id) ?? null;
            return { ti, info: itemInfo(ti.checklist_item_id), result };
        });

    const passCount = checklistRows.filter((r) => r.result?.status === "Pass").length;
    const failCount = checklistRows.filter((r) => r.result?.status === "Fail").length;
    const openCount = checklistRows.filter((r) => r.result?.status === "Fail" && r.result.closure_status !== "Closed").length;

    const issues: string[] = [];
    headerRows.forEach((r) => {
        if (r.required && !r.value.trim()) issues.push(`Header — "${r.label}" is required`);
    });
    checklistRows.forEach(({ ti, info, result }) => {
        const name = info?.description ?? `Item #${ti.id}`;
        if (!result || !result.status) {
            if (ti.required) issues.push(`Checklist — "${name}" has not been assessed yet`);
            return;
        }
        if (result.status === "Fail") {
            if (!result.issue_details?.trim()) issues.push(`Checklist — "${name}" is marked Fail but has no issue details`);
            if (!result.action_taken?.trim()) issues.push(`Checklist — "${name}" is marked Fail but has no action taken`);
            if (!result.severity) issues.push(`Checklist — "${name}" is marked Fail but has no severity`);
        }
    });

    useEffect(() => {
        onValidate(issues);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issues.join("|")]);

    return (
        <div>
            <h2>Review</h2>
            <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                Review every section below before submitting. {locked ? "This report is locked and read-only." : "Fix any issues listed to enable submission."}
            </p>

            {!locked && issues.length > 0 && (
                <div className="toast err" style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{issues.length} issue{issues.length === 1 ? "" : "s"} to resolve before submitting:</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {issues.map((msg, i) => <li key={i} style={{ fontSize: 12.5 }}>{msg}</li>)}
                    </ul>
                </div>
            )}

            <div className="mri-preview-section-label">Header</div>
            <div className="mri-preview-table" style={{ marginBottom: 20 }}>
                {headerRows.map((r) => (
                    <div key={r.id} className="mri-preview-table-row">
                        <label>{r.label}{r.required && <span style={{ color: "var(--danger)" }}> *</span>}</label>
                        <span>{r.value || "—"}</span>
                    </div>
                ))}
                {headerRows.length === 0 && <div className="empty">No header fields configured</div>}
            </div>

            <div className="mri-preview-section-label">
                Checklist — {passCount} Pass · {failCount} Fail{openCount > 0 ? ` (${openCount} open)` : ""}
            </div>
            <div style={{ marginBottom: 20 }}>
                {checklistRows.length === 0 && <div className="empty">No checklist items configured</div>}
                {checklistRows.map(({ ti, info, result }) => (
                    <div
                        key={ti.id}
                        style={{
                            display: "grid", gridTemplateColumns: "1.6fr 0.6fr 1fr 0.8fr", gap: 10, alignItems: "center",
                            padding: "8px 4px", borderTop: "1px solid var(--border)", fontSize: 13,
                        }}
                    >
                        <span>
                            <span style={{ color: "var(--text-soft)", fontSize: 11 }}>{sectionName(ti.section_id)}</span>
                            <br />
                            {info?.description}
                            {ti.required && <span style={{ color: "var(--danger)" }}> *</span>}
                        </span>
                        <span style={{ fontWeight: 700, color: result?.status === "Fail" ? "var(--danger)" : "var(--accent)" }}>
                            {result?.status ?? "—"}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-soft)" }}>
                            {result?.status === "Fail" ? (result.issue_details || "—") : "—"}
                        </span>
                        <span style={{ fontSize: 12 }}>
                            {result?.status === "Fail" ? `${result.severity ?? "—"} · ${result.closure_status ?? "Pending"}` : "—"}
                        </span>
                    </div>
                ))}
            </div>

            <div className="mri-preview-section-label">Mid-Section</div>
            <div className="mri-preview-table" style={{ marginBottom: 20 }}>
                {midRows.map((r) => (
                    <div key={r.id} className="mri-preview-table-row">
                        <label>{r.label}</label>
                        <span>{r.value || "—"}</span>
                    </div>
                ))}
                {midRows.length === 0 && <div className="empty">No mid-section fields configured</div>}
            </div>

            <div className="mri-preview-section-label">Footer</div>
            <div className="mri-preview-table">
                {footerRows.map((r) => (
                    <div key={r.id} className="mri-preview-table-row">
                        <label>{r.label}</label>
                        <span>{r.value || "—"}</span>
                    </div>
                ))}
                {footerRows.length === 0 && <div className="empty">No footer fields configured</div>}
            </div>
        </div>
    );
}

const SEVERITY_RANK: Record<string, number> = { Critical: 3, Moderate: 2, Minor: 1 };
const PASS_COLOR = "#2f9e44";
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
    severityColor: Record<string, string>;
    severityIcon: (severity: string, color: string) => any;
    selectedHotspotId: number | null;
    setSelectedHotspotId: (id: number | null) => void;
    attachmentsFor: (templateChecklistItemId: number) => MriReportAttachment[];
    onAddAttachment: (templateChecklistItemId: number, file: { fileName: string; fileType: string; data: string }) => void;
    onDeleteAttachment: (id: number) => void;
}

function DrawingChecklistView({
    drawing, hotspots, templateItems, itemInfo, getResult, updateLocal, autoSave,
    locked, severityColor, severityIcon, selectedHotspotId, setSelectedHotspotId,
    attachmentsFor, onAddAttachment, onDeleteAttachment,
}: DrawingChecklistViewProps) {
    const { data: sections = [] } = useChecklistSections();
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panDrag = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

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
        panDrag.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
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
            new Set(items.map((ti: any) => sections.find((s) => s.id === ti.section_id)?.name ?? "Unassigned"))
        );
        return names;
    }

    function hotspotWorstSeverity(h: any): string | null {
        const items = itemsForHotspot(h);
        let worst: string | null = null;
        for (const ti of items) {
            const result = getResult(ti);
            if (result.status === "Fail" && result.severity) {
                if (!worst || SEVERITY_RANK[result.severity] > SEVERITY_RANK[worst]) worst = result.severity;
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
    const selectedHotspot = hotspots.find((h) => h.id === selectedHotspotId) ?? null;
    const selectedItems = selectedHotspot ? itemsForHotspot(selectedHotspot) : [];

    return (
        <div style={{ display: "grid", gridTemplateColumns: selectedHotspot ? "1fr 360px" : "1fr", gap: 16 }}>
            <div
                style={{
                    position: "relative", borderRadius: 16, overflow: "hidden", background: "#000",
                    height: DRAWING_VIEW_HEIGHT,
                    boxShadow: "inset 3px 3px 8px var(--neu-shadow-dark), inset -3px -3px 8px var(--neu-shadow-light)",
                }}
            >
                <div style={{ position: "absolute", top: 10, right: 10, zIndex: 2, display: "flex", gap: 4 }}>
                    <button className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </button>
                    <button className="icon-btn" aria-label="Reset zoom" title={`Reset zoom (${Math.round(zoom * 100)}%)`} onClick={zoomReset}>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
                        </svg>
                    </button>
                    <button className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <div
                    onPointerDown={startPan}
                    style={{
                        position: "absolute", inset: 0, overflow: "hidden",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: isPanning ? "grabbing" : "grab", touchAction: "none", userSelect: "none",
                    }}
                >
                    <div
                        style={{
                            position: "relative", width: `${zoom * 100}%`, flexShrink: 0,
                            transform: `translate(${pan.x}px, ${pan.y}px)`,
                            transition: isPanning ? "none" : "width 0.15s ease",
                        }}
                    >
                        <img
                            src={drawing.image_data}
                            alt="Equipment drawing"
                            draggable={false}
                            style={{ display: "block", width: "100%", height: "auto", pointerEvents: "none" }}
                        />
                        {hotspots.map((h, i) => {
                            const worstSeverity = hotspotWorstSeverity(h);
                            const alertColor = worstSeverity ? (severityColor[worstSeverity] ?? "var(--danger)") : undefined;
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
                                        width: 28, height: 28, borderRadius: "50%",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 12, fontWeight: 700, color: "#fff",
                                        background: hotspotColor(h),
                                        border: alertColor
                                            ? `2px solid ${alertColor}`
                                            : selectedHotspotId === h.id
                                                ? "2px solid var(--accent)"
                                                : "2px solid var(--surface)",
                                        boxShadow: selectedHotspotId === h.id
                                            ? "0 0 0 2px var(--accent), 0 0 0 4px rgba(0,0,0,0.25)"
                                            : "0 0 0 2px rgba(0,0,0,0.25)",
                                        cursor: "pointer",
                                        ...(alertColor ? ({ "--pulse-color": alertColor } as React.CSSProperties) : {}),
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
                <div className="panel" style={{ padding: 16, height: DRAWING_VIEW_HEIGHT, overflowY: "auto" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <h3 style={{ margin: 0 }}>
                            {(() => {
                                const names = sectionNamesForHotspot(selectedHotspot);
                                if (names.length > 0) return names.join(" / ");
                                return selectedHotspot.label ?? `Hotspot #${hotspots.findIndex((h) => h.id === selectedHotspot.id) + 1}`;
                            })()}
                        </h3>
                        <button className="icon-btn" aria-label="Close" onClick={() => setSelectedHotspotId(null)}>
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                        </button>
                    </div>

                    {selectedItems.length === 0 ? (
                        <p style={{ fontSize: 12.5, color: "var(--text-soft)" }}>No checklist items are linked to this hotspot.</p>
                    ) : (
                        selectedItems.map((ti) => {
                            const info = itemInfo(ti.checklist_item_id);
                            const result = getResult(ti);
                            const isFail = result.status === "Fail";
                            const cardColor = isFail
                                ? (result.severity ? severityColor[result.severity] ?? "var(--danger)" : "var(--danger)")
                                : PASS_COLOR;
                            return (
                                <div
                                    key={ti.id}
                                    style={{
                                        marginBottom: 12, borderRadius: 10,
                                        borderLeft: `4px solid ${cardColor}`,
                                        background: `color-mix(in srgb, ${cardColor} 10%, transparent)`,
                                        padding: "12px 14px 16px",
                                    }}
                                >
                                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                                        {info?.description}
                                        {ti.required && <span style={{ color: "var(--danger)" }}> *</span>}
                                    </div>

                                    <div className="field">
                                        <label>Pass / Fail</label>
                                        <div style={{ display: "flex", gap: 6 }}>
                                            <button
                                                className="ghost"
                                                disabled={locked}
                                                style={{
                                                    padding: "6px 10px", fontSize: 12, flex: 1,
                                                    ...(result.status === "Pass" ? { background: "var(--accent)", color: "#fff" } : {}),
                                                }}
                                                onClick={() => {
                                                    const patch = { status: "Pass" as const, issue_details: "", action_taken: "" };
                                                    updateLocal(ti, patch);
                                                    autoSave(ti, patch);
                                                }}
                                            >
                                                Pass
                                            </button>
                                            <button
                                                className={result.status === "Fail" ? "danger" : "ghost"}
                                                disabled={locked}
                                                style={{ padding: "6px 10px", fontSize: 12, flex: 1 }}
                                                onClick={() => updateLocal(ti, { status: "Fail" })}
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
                                            onChange={(e) => updateLocal(ti, { issue_details: e.target.value })}
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
                                            onChange={(e) => updateLocal(ti, { action_taken: e.target.value })}
                                            onBlur={() => autoSave(ti, {})}
                                            disabled={locked || !isFail}
                                            placeholder={isFail ? "Required" : "—"}
                                        />
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                                                disabled={locked}
                                            >
                                                {CLOSURE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="field">
                                        <label>Severity</label>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            {result.severity && (
                                                <span title={`Severity: ${result.severity}`} style={{ display: "flex" }}>
                                                    {severityIcon(result.severity, severityColor[result.severity] ?? "var(--text-soft)")}
                                                </span>
                                            )}
                                            <select
                                                className="neu-select"
                                                style={{ fontSize: 12, padding: "4px 6px" }}
                                                value={result.severity ?? ""}
                                                onChange={(e) => {
                                                    const val = (e.target.value || null) as typeof result.severity;
                                                    updateLocal(ti, { severity: val });
                                                    autoSave(ti, { severity: val });
                                                }}
                                                disabled={locked}
                                            >
                                                <option value="">—</option>
                                                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>

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
}

function AttachmentGallery({ attachments, locked, onAdd, onDelete }: AttachmentGalleryProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);

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
            onAdd({ fileName: file.name, fileType: file.type || "application/octet-stream", data: dataUrl });
        };
        reader.readAsDataURL(file);
        if (inputRef.current) inputRef.current.value = "";
    }

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {attachments.map((a) => (
                <div key={a.id} style={{ position: "relative", width: 30, height: 30 }}>
                    {a.file_type.startsWith("image/") ? (
                        <img
                            src={a.data}
                            alt={a.file_name}
                            title={a.file_name}
                            style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 6, cursor: "pointer" }}
                            onClick={() => window.open(a.data, "_blank")}
                        />
                    ) : (
                        <div
                            title={a.file_name}
                            onClick={() => window.open(a.data, "_blank")}
                            style={{
                                width: 30, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                                background: "var(--neu-bg)",
                                boxShadow: "inset 2px 2px 5px var(--neu-shadow-dark), inset -2px -2px 5px var(--neu-shadow-light)",
                                fontSize: 9, fontWeight: 700, color: "var(--text-soft)", cursor: "pointer",
                            }}
                        >
                            {a.file_name.split(".").pop()?.slice(0, 4).toUpperCase() ?? "FILE"}
                        </div>
                    )}
                    {!locked && (
                        <button
                            aria-label="Remove attachment"
                            onClick={() => onDelete(a.id)}
                            style={{
                                position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%",
                                border: "none", background: "var(--danger)", color: "#fff", fontSize: 10, lineHeight: "16px",
                                cursor: "pointer", padding: 0,
                            }}
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
            {!locked && (
                <>
                    <input ref={inputRef} type="file" style={{ display: "none" }} onChange={handleFile} />
                    <button
                        className="icon-btn"
                        aria-label="Add attachment"
                        onClick={() => inputRef.current?.click()}
                        style={{ width: 30, height: 30 }}
                        title="Add photo or file"
                    >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </button>
                </>
            )}
            {error && <span style={{ fontSize: 10, color: "var(--danger)" }}>{error}</span>}
        </div>
    );
}

export default ReportWizard;