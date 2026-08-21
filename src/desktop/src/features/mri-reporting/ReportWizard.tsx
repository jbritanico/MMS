import { useState, useEffect } from "react";
import { useMriReport, useSubmitMriReport, usePreviousEngineHours, usePendingChecklistItemIds } from "./hooks/useMriReports";
import { useAssets } from "../asset-registry/hooks/useAssets";
import { useMriTemplates } from "../administration/hooks/useMriTemplates";
import { useTemplateHeaderFields, useHeaderFieldCatalog } from "../mri-template-builder/hooks/useTemplateHeaderFields";
import {
    useMriReportHeaderValues,
    useSetMriReportHeaderValue,
    useMriReportChecklistResults,
    useSetMriReportChecklistResult,
    type MriReportChecklistResult,
} from "./hooks/useMriReportValues";
import { useTemplateChecklistItems } from "../mri-template-builder/hooks/useTemplateChecklistItems";
import { useChecklistItems } from "../administration/hooks/useChecklistDatabank";
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
                )}
                {step === "checklist" && (
                    <ChecklistEntryStep templateId={report.template_id} reportId={reportId} locked={isLocked} assetId={report.asset_id} />
                )}
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

function ChecklistEntryStep({ templateId, reportId, locked, assetId }: { templateId: number; reportId: number; locked: boolean; assetId: number }) {
    const { data: templateItems = [] } = useTemplateChecklistItems(templateId);
    const { data: databank = [] } = useChecklistItems();
    const { data: sections = [] } = useChecklistSections();
    const { data: savedResults = [] } = useMriReportChecklistResults(reportId);
    const setResult = useSetMriReportChecklistResult(reportId);
    const { data: pendingItemIds = [] } = usePendingChecklistItemIds(assetId, reportId);

    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
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
        Minor: "#3d9463",
        Moderate: "#c9a227",
        Major: "#d97706",
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
            case "Major":
                return (
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 17, height: 17 }}>
                        <path d="M12 3.5l9.5 16.5H2.5L12 3.5z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
                        <path d="M12 10v4.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
                        <circle cx="12" cy="17" r="1" fill={color} />
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

    const COLS = "1.8fr 0.9fr 1.3fr 1.3fr 0.9fr 0.8fr 0.7fr";

    if (sortedItems.length === 0) {
        return <div className="empty">This template has no checklist items configured</div>;
    }

    return (
        <div>
            <h2>Checklist</h2>
            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 500, marginBottom: 12 }}>{status.msg}</div>}

            {grouped.map((group) => (
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

                                <div style={{ display: "flex", justifyContent: "center" }}>
                                    {ti.severity ? (
                                        <div
                                            title={`Severity: ${ti.severity}`}
                                            style={{
                                                width: 32, height: 32, borderRadius: "50%", cursor: "help",
                                                background: "var(--neu-bg)",
                                                boxShadow: "3px 3px 6px var(--neu-shadow-dark), -3px -3px 6px var(--neu-shadow-light)",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                            }}
                                        >
                                            {severityIcon(ti.severity, severityColor[ti.severity] ?? "var(--text-soft)")}
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: 11, color: "var(--text-soft)" }}>—</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

export default ReportWizard;