// On-screen hints for the MR-I report wizard (Option B).
//
// Works out, step by step, what still looks unfinished on a report so the 3D step bar, the
// "What you'll do here" boxes and the folded banners can show the same plain-language hints.
// Display only: hints never block saving or submitting, never change a report's status and never
// change any data. The real submit check stays in the Review step of ReportWizard, unchanged.

export type ReportStep = "header" | "checklist" | "mid" | "footer" | "review";
export type HintStep = Exclude<ReportStep, "review">;

/** ok = looks complete · look = worth a look · skip = not needed on this report */
export type HintState = "ok" | "look" | "skip";

export interface StepHint {
  step: HintStep;
  state: HintState;
  /** How many things are worth a look on this step (0 when ok or skipped). */
  count: number;
  /** Plain-language hints, e.g. "Pre-Mobilization Checklist ID is still empty". */
  messages: string[];
  /** What is on the step, e.g. "6 of 7 checks done · 4 Fail". */
  summary: string;
}

export interface HeaderHintField { label: string; required: boolean; value: string }
export interface ChecklistHintItem {
  name: string;
  required: boolean;
  status: "Pass" | "Fail" | null;
  issueDetails: string;
  actionTaken: string;
  severity: string | null;
  closure: string | null;
}
export interface FooterHintField { label: string; value: string }

export interface ReportHintInput {
  header: HeaderHintField[];
  checklist: ChecklistHintItem[];
  /** Distance Travelled: null when the template has no distance fields. */
  distance: { stage: string; previousStage?: string | null; km: string } | null;
  footer: FooterHintField[];
}

export interface ReportHints {
  steps: Record<HintStep, StepHint>;
  /** Total number of things worth a look across all steps. */
  lookCount: number;
  /** Key numbers for the folded banners. */
  numbers: {
    checksDone: number; checksTotal: number; fail: number; openFail: number;
    critical: number; moderate: number; minor: number; distanceKm: string;
    headerFilled: number; headerTotal: number;
  };
}

export const HINT_STEPS: HintStep[] = ["header", "checklist", "mid", "footer"];

/** Plain step names, with the original names kept underneath on screen. */
export const STEP_NAMES: Record<ReportStep, { name: string; tech: string }> = {
  header: { name: "Report details", tech: "Header" },
  checklist: { name: "Things to check", tech: "Checklist" },
  mid: { name: "Distance travelled", tech: "Distance Travelled" },
  footer: { name: "Sign-off", tech: "Footer" },
  review: { name: "Check and send", tech: "Review & Submit" },
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The Distance step only asks for a distance on these stages (same rule as the wizard). */
export function distanceNeeded(stage: string, previousStage?: string | null): boolean {
  const s = stage.trim().toUpperCase();
  if (s === "PRE-JOB" || s === "POST JOB") return true;
  return s === "YARD INSPECTION" && (previousStage ?? "").trim().toUpperCase() === "POST JOB";
}

function hint(step: HintStep, state: HintState, messages: string[], summary: string, count = messages.length): StepHint {
  return { step, state, count: state === "look" ? count : 0, messages: state === "look" ? messages : [], summary };
}

export function getReportHints(r: ReportHintInput): ReportHints {
  // Report details (header)
  const hMsgs: string[] = [];
  r.header.forEach((f) => { if (f.required && !f.value.trim()) hMsgs.push(`${f.label} is still empty`); });
  const stageField = r.header.find((f) => norm(f.label) === "compliance stage");
  if (stageField && !stageField.required && !stageField.value.trim()) hMsgs.push("Compliance stage is still empty");
  // FB-024: operating hours are recorded on every MR-I occasion.
  const ohField = r.header.find((f) => norm(f.label) === "job operating hours");
  if (ohField && !ohField.required && !ohField.value.trim()) hMsgs.push("Job Operating Hours is needed on every MR-I");
  const stage = (stageField?.value ?? "").trim().toUpperCase();
  const idField = r.header.find((f) => norm(f.label) === "pre-mobilization checklist id");
  const jobField = r.header.find((f) => norm(f.label) === "job number");
  if ((stage === "PREMOB" || stage === "PRE-JOB") && idField && !idField.required && !idField.value.trim()) {
    hMsgs.push("Pre-Mobilization Checklist ID is needed for a Pre-Mob or Pre-Job report");
  } else if (((stage === "PRE-JOB" && !idField) || stage === "POST JOB") && jobField && !jobField.required && !jobField.value.trim()) {
    hMsgs.push(`Job Number is needed for a ${stage === "POST JOB" ? "Post-Job" : "Pre-Job"} report`);
  }
  const clientField = r.header.find((f) => norm(f.label) === "client");
  if ((stage === "PRE-JOB" || stage === "POST JOB") && clientField && !clientField.required && !clientField.value.trim()) {
    hMsgs.push(`Client is needed for a ${stage === "POST JOB" ? "Post-Job" : "Pre-Job"} report`);
  }
  const filled = r.header.filter((f) => f.value.trim()).length;
  const header = r.header.length
    ? hint("header", hMsgs.length ? "look" : "ok", hMsgs, `${filled} of ${r.header.length} filled in`)
    : hint("header", "skip", [], "No report details on this template");

  // Things to check (checklist)
  const items = r.checklist;
  const cMsgs: string[] = [];
  const notAssessed = items.filter((i) => i.required && !i.status).length;
  if (notAssessed) cMsgs.push(`${plural(notAssessed, "check is", "checks are")} not assessed yet`);
  const fails = items.filter((i) => i.status === "Fail");
  let failsToFix = 0;
  fails.forEach((i) => {
    const missing: string[] = [];
    if (!i.issueDetails.trim()) missing.push("what's wrong");
    // FB-022: "what was done" is only needed once the fault is closed.
    if (i.closure === "Closed" && !i.actionTaken.trim()) missing.push("what was done");
    if (!i.severity) missing.push("how serious");
    if (missing.length) failsToFix++;
    if (missing.length) cMsgs.push(`${i.name}: Fail with no ${missing.join(", ")}`);
  });
  const done = items.filter((i) => i.status).length;
  const checklist = items.length
    ? hint("checklist", cMsgs.length ? "look" : "ok", cMsgs, `${done} of ${items.length} checks done · ${fails.length} Fail`, notAssessed + failsToFix)
    : hint("checklist", "skip", [], "No checks on this template");

  // Distance travelled (mid) — a hint only; the wizard does not require it to submit.
  let mid: StepHint;
  if (!r.distance) mid = hint("mid", "skip", [], "No distance on this template");
  else if (!distanceNeeded(r.distance.stage, r.distance.previousStage)) mid = hint("mid", "skip", [], "Not needed for this Compliance stage");
  else if (!r.distance.km.trim()) mid = hint("mid", "look", ["Distance not recorded yet"], "No distance yet");
  else mid = hint("mid", "ok", [], `${r.distance.km} km`);

  // Sign-off (footer): the same people and dates the submit check asks for.
  const fMsgs: string[] = [];
  r.footer.forEach((f) => {
    if (["operator", "operator date", "supervisor", "supervisor date", "job supervisor"].includes(norm(f.label)) && !f.value.trim())
      fMsgs.push(`${f.label} is still empty`);
  });
  const footer = r.footer.length
    ? hint("footer", fMsgs.length ? "look" : "ok", fMsgs, `${r.footer.filter((f) => f.value.trim()).length} of ${r.footer.length} filled in`)
    : hint("footer", "skip", [], "No sign-off on this template");

  const steps = { header, checklist, mid, footer };
  const sev = (s: string) => fails.filter((i) => i.severity === s).length;
  return {
    steps,
    lookCount: HINT_STEPS.reduce((n, s) => n + steps[s].count, 0),
    numbers: {
      checksDone: done, checksTotal: items.length, fail: fails.length,
      openFail: fails.filter((i) => i.closure !== "Closed").length,
      critical: sev("Critical"), moderate: sev("Moderate"), minor: sev("Minor"),
      distanceKm: r.distance?.km.trim() ?? "",
      headerFilled: filled, headerTotal: r.header.length,
    },
  };
}
