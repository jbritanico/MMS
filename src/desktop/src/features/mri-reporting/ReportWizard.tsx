import { useState, useEffect } from "react";
import { useMriReport, useSubmitMriReport, usePreviousEngineHours } from "./hooks/useMriReports";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useMriTemplates } from "../administration/hooks/useMriTemplates";
import { useTemplateHeaderFields, useHeaderFieldCatalog } from "../mri-template-builder/hooks/useTemplateHeaderFields";
import {
    useMriReportHeaderValues,
    useSetMriReportHeaderValue,
} from "./hooks/useMriReportValues";
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
                )}        {step === "checklist" && <div className="empty">Checklist entry goes here</div>}
                {step === "mid" && <div className="empty">Mid-section entry goes here</div>}
                {step === "footer" && <div className="empty">Footer entry goes here</div>}
                {step === "review" && (
                    <div>
                        <h2>Review</h2>
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
                            Review each section using the steps above, then submit when ready.
                        </p>
                    </div>
                )}
            </div>

            <div className="actions" style={{ marginTop: 16 }}>
                <button className="ghost" onClick={goBack} disabled={currentIndex === 0}>← Previous</button>
                {step !== "review" ? (
                    <button className="primary" onClick={goNext}>Next →</button>
                ) : (
                    <button className="primary" onClick={handleSubmit} disabled={isLocked}>
                        {isLocked ? "Already submitted" : "Submit Report"}
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
const MR_II_DUE_DATE = "mr ii due date";
const MR_INITIATION_DATE = "mr initization date";

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

    // Persist inherited values in the background once, per field, without blocking display
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

    // Persist auto-computed date fields (MR Initiation Date, MR II Due Date) once per field
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
                    return (
                        <div key={tf.id} className="mri-preview-table-row">
                            <label>
                                {fieldLabel(tf.header_field_id)}
                                {tf.required && <span style={{ color: "var(--danger)" }}> *</span>}
                                {isInherited && <span style={{ color: "var(--text-soft)", fontStyle: "italic" }}> (from asset)</span>}
                            </label>
                            <input
                                type="text"
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

export default ReportWizard;