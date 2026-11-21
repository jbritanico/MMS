// On-screen hints for the MR-I template builder (Option B).
//
// Works out, step by step, what still looks unfinished on a template so the step bar, the 3D guide and
// the "Check and save" summary can show the same plain-language hints. Hints are display only: they never
// block saving, never change a template's status and never change any data.

export type HintStep = "header" | "components" | "checklist" | "drawing" | "mid" | "footer";

/** ok = looks complete · look = worth a look · skip = optional step left empty */
export type HintState = "ok" | "look" | "skip";

export interface StepHint {
  step: HintStep;
  state: HintState;
  /** How many things are worth a look on this step (0 when ok or skipped). */
  count: number;
  /** Plain-language hint, e.g. "2 checks have no group". Empty when nothing needs a look. */
  message: string;
  /** What is on the step, e.g. "11 checks in 3 groups". */
  summary: string;
}

export interface TemplateHintInput {
  headerFields: { required: boolean }[];
  components: { label: string; active: boolean }[];
  checklistItems: { section_id: number | null; severity: string | null }[];
  hasDrawing: boolean;
  hotspots: { checklist_item_ids: number[] }[];
  midFieldCount: number;
  /** Labels of the footer fields on the template (from the footer field catalog). */
  footerLabels: string[];
}

export interface TemplateHints {
  steps: Record<HintStep, StepHint>;
  /** Total number of things worth a look across all steps. */
  lookCount: number;
}

export const HINT_STEPS: HintStep[] = ["header", "components", "checklist", "drawing", "mid", "footer"];

/** Footer fields that make up the sign-off. */
export const SIGN_OFF_LABELS = ["Operator", "Supervisor"];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const joinAnd = (parts: string[]) =>
  parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

function hint(step: HintStep, state: HintState, count: number, message: string, summary: string): StepHint {
  return { step, state, count: state === "look" ? count : 0, message: state === "look" ? message : "", summary };
}

export function getTemplateHints(t: TemplateHintInput): TemplateHints {
  // Report details (header fields)
  const hReq = t.headerFields.filter((f) => f.required).length;
  const header = t.headerFields.length
    ? hint("header", "ok", 0, "", `${plural(t.headerFields.length, "field", "fields")}, ${hReq} must be filled`)
    : hint("header", "look", 1, "No report details chosen yet", "No fields");

  // Parts of the unit (components) — optional
  const active = t.components.filter((c) => c.active);
  const off = t.components.length - active.length;
  const components = t.components.length
    ? hint("components", "ok", 0, "",
        `${active.map((c) => c.label).join(", ") || "No parts in use"}${off ? ` (${off} switched off)` : ""}`)
    : hint("components", "skip", 0, "", "None — reports cover the whole unit");

  // Things to check (checklist)
  const items = t.checklistItems;
  const noGroup = items.filter((i) => i.section_id == null).length;
  const noSev = items.filter((i) => !i.severity).length;
  const groups = new Set(items.filter((i) => i.section_id != null).map((i) => i.section_id)).size;
  const chkSummary = items.length ? `${plural(items.length, "check", "checks")} in ${plural(groups, "group", "groups")}` : "No checks";
  let checklist: StepHint;
  if (!items.length) {
    checklist = hint("checklist", "look", 1, "No checks added yet", chkSummary);
  } else if (noGroup || noSev) {
    const parts: string[] = [];
    if (noGroup) parts.push(`${plural(noGroup, "check has", "checks have")} no group`);
    if (noSev) parts.push(`${plural(noSev, "check has", "checks have")} no “how serious”`);
    checklist = hint("checklist", "look", noGroup + noSev, parts.join(" · "), chkSummary);
  } else {
    checklist = hint("checklist", "ok", 0, "", chkSummary);
  }

  // Picture of the unit (drawing) — optional
  const unlinked = t.hotspots.filter((h) => !h.checklist_item_ids.length).length;
  let drawing: StepHint;
  if (!t.hasDrawing) {
    drawing = hint("drawing", "skip", 0, "", "No picture");
  } else if (!t.hotspots.length) {
    drawing = hint("drawing", "look", 1, "The picture has no points yet", "Picture, no points");
  } else if (t.hotspots.length > items.length) {
    const over = t.hotspots.length - items.length;
    drawing = hint("drawing", "look", over,
      `${plural(t.hotspots.length, "point", "points")} for ${plural(items.length, "check", "checks")} — delete ${plural(over, "point", "points")}`,
      `${plural(t.hotspots.length, "point", "points")}, ${t.hotspots.length - unlinked} linked to checks`);
  } else if (unlinked) {
    drawing = hint("drawing", "look", unlinked,
      `${plural(unlinked, "point is", "points are")} not linked to any check`,
      `${plural(t.hotspots.length, "point", "points")}, ${t.hotspots.length - unlinked} linked to checks`);
  } else {
    drawing = hint("drawing", "ok", 0, "", `${plural(t.hotspots.length, "point", "points")}, all linked to checks`);
  }

  // Distance travelled (mid-section) — optional
  const mid = t.midFieldCount
    ? hint("mid", "ok", 0, "", plural(t.midFieldCount, "reading", "readings"))
    : hint("mid", "skip", 0, "", "No distance readings");

  // Sign-off (footer)
  const have = new Set(t.footerLabels.map((l) => l.trim().toLowerCase()));
  const missing = SIGN_OFF_LABELS.filter((l) => !have.has(l.toLowerCase()));
  const fSummary = t.footerLabels.length ? plural(t.footerLabels.length, "field", "fields") : "No fields";
  const footer = !t.footerLabels.length
    ? hint("footer", "look", 1, "No sign-off fields chosen yet", fSummary)
    : missing.length
      ? hint("footer", "look", missing.length, `${joinAnd(missing)} ${missing.length === 1 ? "is" : "are"} not ticked`, fSummary)
      : hint("footer", "ok", 0, "", fSummary);

  const steps = { header, components, checklist, drawing, mid, footer };
  return { steps, lookCount: HINT_STEPS.reduce((n, s) => n + steps[s].count, 0) };
}
