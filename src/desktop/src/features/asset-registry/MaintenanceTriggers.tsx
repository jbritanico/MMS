import { useState, useEffect } from "react";
import { useAssetTriggers, useUpdateTrigger, type Trigger } from "./hooks/useTriggers";

const TYPE_LABELS: Record<string, string> = {
    OH: "Operating hours",
    CA: "Calendar days",
    KM: "Distance (KM)",
    RIF: "Running-in-foot",
    EH: "Engine hours",
};

interface MaintenanceTriggersProps {
    assetId: number;
    assetCode: string;
    onBack: () => void;
}

function MaintenanceTriggers({ assetId, assetCode, onBack }: MaintenanceTriggersProps) {
    const { data: triggers = [], isLoading } = useAssetTriggers(assetId);
    const updateTrigger = useUpdateTrigger(assetId);
    const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
    const [edits, setEdits] = useState<Record<number, Partial<Trigger>>>({});

    useEffect(() => {
        if (!status) return;
        const t = setTimeout(() => setStatus(null), 3000);
        return () => clearTimeout(t);
    }, [status]);

    function fieldValue(t: Trigger, field: keyof Trigger) {
        return edits[t.id]?.[field] ?? t[field];
    }

    function setField(t: Trigger, field: keyof Trigger, value: number | boolean) {
        setEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], [field]: value } }));
    }

    async function saveRow(t: Trigger) {
        const change = edits[t.id];
        if (!change) return;
        try {
            await updateTrigger.mutateAsync({
                id: t.id,
                enabled: (change.enabled ?? t.enabled) as boolean,
                interval_value: (change.interval_value ?? t.interval_value) as number,
                warning_value: (change.warning_value ?? t.warning_value) as number,
                running_value: (change.running_value ?? t.running_value) as number,
            });
            setEdits((prev) => {
                const next = { ...prev };
                delete next[t.id];
                return next;
            });
            setStatus({ msg: `${t.mr_level} ${t.trigger_type} saved`, kind: "ok" });
        } catch (err) {
            setStatus({ msg: String(err), kind: "err" });
        }
    }

    const mrII = triggers.filter((t) => t.mr_level === "MR-II");
    const mrIII = triggers.filter((t) => t.mr_level === "MR-III");

    function renderGroup(label: string, items: Trigger[]) {
        return (
            <div className="panel" style={{ marginBottom: 16 }}>
                <h2>{label}</h2>
                {items.length === 0 ? (
                    <div className="empty">No trigger data</div>
                ) : (
                    <div className="trigger-table">
                        <div className="trigger-row trigger-head">
                            <span>Type</span>
                            <span>Enabled</span>
                            <span>Interval</span>
                            <span>Warning</span>
                            <span>Running</span>
                            <span>Tally</span>
                            <span></span>
                        </div>
                        {items.map((t) => {
                            const dirty = !!edits[t.id];
                            return (
                                <div className="trigger-row" key={t.id}>
                                    <span>{TYPE_LABELS[t.trigger_type] ?? t.trigger_type}</span>
                                    <input type="checkbox" checked={fieldValue(t, "enabled") as boolean}
                                        onChange={(e) => setField(t, "enabled", e.target.checked)} />
                                    <input type="number" className="trigger-input" value={fieldValue(t, "interval_value") as number}
                                        onChange={(e) => setField(t, "interval_value", Number(e.target.value))} />
                                    <input type="number" className="trigger-input" value={fieldValue(t, "warning_value") as number}
                                        onChange={(e) => setField(t, "warning_value", Number(e.target.value))} />
                                    <input type="number" className="trigger-input" value={fieldValue(t, "running_value") as number}
                                        onChange={(e) => setField(t, "running_value", Number(e.target.value))} />
                                    <span className="trigger-readonly">{t.tally_value}</span>
                                    <button className="icon-btn" disabled={!dirty} aria-label="Save row" onClick={() => saveRow(t)}>
                                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    return (
        <>
            <div className="header">
                <h1>Maintenance triggers</h1>
                <span className="sub">{assetCode} · running &amp; tally update via Maintenance Report</span>
            </div>

            {isLoading ? (
                <div className="empty">Loading...</div>
            ) : (
                <>
                    {renderGroup("MR-II triggers", mrII)}
                    {renderGroup("MR-III triggers", mrIII)}
                </>
            )}

            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 320 }}>{status.msg}</div>}

            <div className="actions">
                <button className="ghost" onClick={onBack}>← Back to Asset Registry</button>
            </div>
        </>
    );
}

export default MaintenanceTriggers;