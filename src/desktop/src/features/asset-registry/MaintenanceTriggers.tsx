import { useState, useEffect } from "react";
import { useAssetTriggers, useUpdateTrigger, type Trigger } from "./hooks/useTriggers";
import { TIG_CSS } from "../mri-template-builder/TemplateIsoGuide";
import { ADMIN_CSS, IsoBars, RowTile, ScreenIntro, type Tone } from "../administration/AdminIsoGuide";
import { triggerColor, triggerIcon } from "../../components/triggerIcons";

const TYPE_LABELS: Record<string, string> = {
    OH: "Operating hours",
    CA: "Calendar days",
    KM: "Distance (km)",
    RIF: "Running-in-foot",
    EH: "Engine hours",
};

// Display only: where each counter stands against its own warning and due values (saved values).
type CounterState = { tone: Tone; word: string; pct: number };
function counterState(t: Trigger): CounterState {
    const pct = t.interval_value > 0 ? (t.running_value / t.interval_value) * 100 : 0;
    if (!t.enabled) return { tone: "skip", word: "Switched off", pct: 0 };
    if (t.interval_value > 0 && t.running_value >= t.interval_value) return { tone: "bad", word: "Due now", pct };
    if (t.warning_value > 0 && t.running_value >= t.warning_value) return { tone: "look", word: "Due soon", pct };
    return { tone: "ok", word: "On track", pct };
}
const nameOf = (t: Trigger) => TYPE_LABELS[t.trigger_type] ?? t.trigger_type;

const TRIG_CSS = `
.trig-name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.trig-name-t { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.trig-name-t strong { font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
.trig-name-t strong svg { width: 16px; height: 16px; flex-shrink: 0; }
.trig-word { font-size: 11.5px; font-weight: 600; color: var(--text-soft); }
.trig-word.is-look { color: var(--warn, #b45f06); }
.trig-word.is-bad { color: var(--danger, #c62828); }
.trig-word.is-ok { color: var(--success, #138a4c); }
.trig-meter { position: relative; height: 5px; width: 100%; max-width: 150px; border-radius: 99px; background: var(--tig-hole); overflow: visible; }
.trig-meter > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; }
.trig-meter > b { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--tig-look); border-radius: 1px; }
.trig-level-h { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.trig-level-h small { color: var(--text-soft); font-size: 12px; }
.trig-unsaved { font-size: 11.5px; font-weight: 600; color: var(--accent-blue, #1f6fe5); }
`;
const METER_COLOR: Record<Tone, string> = { ok: "var(--tig-ok)", look: "var(--tig-look)", bad: "var(--tig-bad)", blue: "var(--tig-blue)", skip: "var(--tig-skip)" };

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
            setStatus({ msg: `Saved: ${t.mr_level} ${nameOf(t)}`, kind: "ok" });
        } catch (err) {
            setStatus({ msg: String(err), kind: "err" });
        }
    }

    const mrII = triggers.filter((t) => t.mr_level === "MR-II");
    const mrIII = triggers.filter((t) => t.mr_level === "MR-III");

    const states = triggers.map((t) => ({ t, s: counterState(t) }));
    const dueNow = states.filter((x) => x.s.tone === "bad");
    const dueSoon = states.filter((x) => x.s.tone === "look");
    const unsaved = Object.keys(edits).length;
    const hints = [
        ...(dueNow.length ? [`${dueNow.length === 1 ? "1 counter is" : `${dueNow.length} counters are`} due now: ${dueNow.map((x) => `${x.t.mr_level} ${nameOf(x.t)}`).join(", ")}`] : []),
        ...(dueSoon.length ? [`${dueSoon.length === 1 ? "1 counter is" : `${dueSoon.length} counters are`} due soon: ${dueSoon.map((x) => `${x.t.mr_level} ${nameOf(x.t)}`).join(", ")}`] : []),
        ...(unsaved ? [`${unsaved === 1 ? "1 row has" : `${unsaved} rows have`} changes not saved yet — click the tick at the end of the row`] : []),
    ];

    function renderGroup(level: string, label: string, items: Trigger[]) {
        const on = items.filter((t) => t.enabled);
        return (
            <div className="panel adm-lift" style={{ marginBottom: 16 }}>
                <div className="trig-level-h"><h2>{label}</h2><small>{level} triggers · {on.length} of {items.length} switched on</small></div>
                {items.length === 0 ? (
                    <div className="empty">No counters set up for {level} yet</div>
                ) : (
                    <>
                    {on.length > 0 && (
                        <IsoBars label={`${level}: how far each counter is towards being due`}
                            items={on.map((t) => { const s = counterState(t); return { label: nameOf(t), value: Math.round(s.pct), tone: s.tone, note: `${s.word}: ${t.running_value} of ${t.interval_value} (${Math.round(s.pct)}%)` }; })} />
                    )}
                    {on.length > 0 && (
                        <small style={{ display: "block", color: "var(--text-soft)", fontSize: 12, margin: "-4px 0 8px" }}>Bars show how far each counter is towards being due, in %. Over 100 means it is overdue.</small>
                    )}
                    <div className="trigger-table">
                        <div className="trigger-row trigger-head">
                            <span>Counter</span>
                            <span>On</span>
                            <span>Due every</span>
                            <span>Warn at</span>
                            <span>Count now</span>
                            <span>Total so far</span>
                            <span></span>
                        </div>
                        {items.map((t) => {
                            const dirty = !!edits[t.id];
                            const s = counterState(t);
                            return (
                                <div className="trigger-row" key={t.id}>
                                    <span className="trig-name">
                                        <RowTile tone={s.tone} />
                                        <span className="trig-name-t">
                                            <strong><span style={{ color: triggerColor(t.trigger_type), display: "inline-flex" }} aria-hidden="true">{triggerIcon(t.trigger_type)}</span>{nameOf(t)}</strong>
                                            {t.enabled && t.interval_value > 0 && (
                                                <span className="trig-meter" aria-hidden="true">
                                                    <i style={{ width: `${Math.min(100, s.pct)}%`, background: METER_COLOR[s.tone] }} />
                                                    {t.warning_value > 0 && t.warning_value < t.interval_value && <b style={{ left: `${(t.warning_value / t.interval_value) * 100}%` }} />}
                                                </span>
                                            )}
                                            <span className={`trig-word is-${s.tone}`}>{s.word}{t.enabled && t.interval_value > 0 ? ` · ${Math.round(s.pct)}%` : ""}{dirty && <span className="trig-unsaved"> · not saved</span>}</span>
                                        </span>
                                    </span>
                                    <input type="checkbox" checked={fieldValue(t, "enabled") as boolean}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            if (checked) {
                                                setField(t, "enabled", true);
                                            } else {
                                                setEdits((prev) => ({
                                                    ...prev,
                                                    [t.id]: {
                                                        ...prev[t.id],
                                                        enabled: false,
                                                        interval_value: 0,
                                                        warning_value: 0,
                                                        running_value: 0,
                                                    },
                                                }));
                                            }
                                        }} />
                                    <input type="number" className="trigger-input" value={fieldValue(t, "interval_value") as number}
                                        disabled={!fieldValue(t, "enabled")}
                                        onChange={(e) => setField(t, "interval_value", Number(e.target.value))} />
                                    <input type="number" className="trigger-input" value={fieldValue(t, "warning_value") as number}
                                        disabled={!fieldValue(t, "enabled")}
                                        onChange={(e) => setField(t, "warning_value", Number(e.target.value))} />
                                    <input type="number" className="trigger-input" value={fieldValue(t, "running_value") as number}
                                        disabled={!fieldValue(t, "enabled")}
                                        onChange={(e) => setField(t, "running_value", Number(e.target.value))} />
                                    <span className="trigger-readonly">{t.tally_value}</span>
                                    <button className="icon-btn" disabled={!dirty} aria-label={`Save ${t.mr_level} ${nameOf(t)}`} title="Save this row" onClick={() => saveRow(t)}>
                                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="tig">
            <style>{TRIG_CSS + TIG_CSS + ADMIN_CSS}</style>
            <div className="header">
                <h1>When is {assetCode} due for maintenance?</h1>
                <span className="sub">Maintenance triggers · count now and total so far are updated by Maintenance Reports</span>
            </div>

            <ScreenIntro glyph="gauge"
                label={`${assetCode} counters: what you'll do here`}
                kpis={isLoading ? [] : [
                    { label: "due now", value: dueNow.length, tone: dueNow.length ? "bad" : "ok" },
                    { label: "due soon", value: dueSoon.length, tone: dueSoon.length ? "look" : "ok" },
                    { label: "on track", value: states.filter((x) => x.s.tone === "ok").length, tone: "ok" },
                    { label: "switched on", value: `${triggers.filter((t) => t.enabled).length} of ${triggers.length}`, tone: "blue" },
                ]}
                explain="Each counter (hours, days, km…) counts up from the last MR-II or MR-III maintenance. It warns you when it reaches “Warn at” and the maintenance is due when it reaches “Due every”. Switching a counter off clears its numbers."
                todo={["Switch a counter on, then set when it's due and when to warn", "Change a number, then click the tick at the end of that row to save it", "Green is on track, orange is due soon, red is due now"]}
                hints={isLoading ? [] : hints} />

            {isLoading ? (
                <div className="empty">Loading...</div>
            ) : (
                <>
                    {renderGroup("MR-II", "MR-II counters", mrII)}
                    {renderGroup("MR-III", "MR-III counters", mrIII)}
                </>
            )}

            {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 320 }}>{status.msg}</div>}

            <div className="actions">
                <button className="ghost" onClick={onBack}>← Back to Asset Registry</button>
            </div>
        </div>
    );
}

export default MaintenanceTriggers;