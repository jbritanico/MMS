import React from "react";

// The dashboard catalogue: numbers, titles, groups and icons. Shared by the MR-I dashboards screen
// and the Fluent dashboard shell (sidebar search, overview quick actions).

const ALL_DASHBOARDS: { no: number; title: string; desc: string }[] = [
  { no: 1, title: "Fleet Status by Tag Colour", desc: "How many units are Green, Yellow or Red." },
  { no: 2, title: "Open Defects by Severity", desc: "Faults not yet fixed, Minor / Moderate / Critical, and the trend." },
  { no: 3, title: "Defect Aging", desc: "How long open faults have waited; overdue ones flagged." },
  { no: 4, title: "Fault Closure Rate", desc: "Faults closed in the period, against the backlog plus new faults." },
  { no: 19, title: "Fault Trends by Equipment", desc: "Faults by equipment type, drill down to each unit and checklist item; year on year." },
  { no: 5, title: "Decisions Waiting, by Reviewer", desc: "Fault decisions and report reviews waiting now, and with whom." },
  { no: 6, title: "Review Turnaround", desc: "Time from Submit to the fault decision and to report closure." },
  { no: 7, title: "Repair Queue and Repair Time", desc: "Repairs waiting, who is assigned, parts, days to repair." },
  { no: 8, title: "Time Spent Red or Yellow", desc: "How long units were out of action." },
  { no: 9, title: "Repeat Faults", desc: "Inspection items that fail most often." },
  { no: 10, title: "Phone Decisions and Acknowledgements", desc: "Decisions still to confirm or acknowledge." },
  { no: 11, title: "MR-I Reports per Period", desc: "Inspections by stage: Pre-Mob, Pre-Job, Post Job, Yard." },
  { no: 12, title: "Red Units Under Exemption (MOC)", desc: "Exemptions in force, their limits and expiry dates." },
  { no: 13, title: "MR-II Due Forecast", desc: "Units close to their next MR-II (or MR-III), from the MR-I counters." },
  { no: 14, title: "Inspectors", desc: "Reports submitted, faults found, and faults rejected or downgraded on review." },
  { no: 15, title: "Supervisors", desc: "Reports closed, time from Submit to closure, endorsed reports still open." },
  { no: 16, title: "Reviewers", desc: "Fault decisions, time to decide, reclassified or rejected, decisions waiting." },
  { no: 17, title: "Technicians", desc: "Open repairs, waiting for parts, past planned date, repair time." },
  { no: 18, title: "Managers and FSM", desc: "Phone decisions confirmed, Moderate decisions acknowledged, and waiting." },
  { no: 20, title: "Inspection Sequence per Job", desc: "Post-Job reports with or without a Pre-Job before them, and Pre-Jobs still waiting for a Post-Job." },
  { no: 21, title: "On-site Repairs Log", desc: "Minor faults repaired on site: what, on which unit, by whom and how often." },
  { no: 22, title: "Sign-off Completeness", desc: "How often Cleaned, Pressure tested and Function tested are ticked, by location and supervisor." },
  { no: 23, title: "Data Quality", desc: "Reports with a missing stage, job number or client, engine hours going down, or odd distances." },
  { no: 24, title: "Usage per Job", desc: "Engine hours, operating hours and distance per job and unit, checked against the MR-II / MR-III counters." },
  { no: 25, title: "MR Cost", desc: "Cost to perform the MR by unit, equipment type, country and month; reports still waiting for the cost." },
  { no: 26, title: "Critical Fault Audit Trail", desc: "Every Major / Critical fault: who decided, how, when, and the confirmation that followed." },
  { no: 27, title: "Faults by Client", desc: "Faults found on Post-Job reports, by the client on the report." },
  { no: 28, title: "Exemption (MOC) Audit", desc: "Every MOC exemption: limits, controls, dates and how it ended." },
];

// Paused 24 Nov 2026 (FB-007): costing dashboards are removed for now and wait for further
// instruction from Mr. Kamil. Their code stays; take a number out of this set to bring one back.
export const PAUSED_DASHBOARDS = new Set<number>([25]);
export const DASHBOARDS = ALL_DASHBOARDS.filter((d) => !PAUSED_DASHBOARDS.has(d.no));

// Dashboards defined in the "MMS Dashboard Visualization" design (deck 08.10.2026), with the slides
// they come from. They are marked with the design colour so users can tell them apart from the
// dashboards added for the MR-I follow-up.
export const DECK_SLIDES: Record<number, string> = { 2: "Slides 9 and 15", 3: "Slides 10 and 15", 4: "Slide 11" };
export const DECK_NAME = "MMS Dashboard Visualization design (08.10.2026)";
// Dashboards asked for after the deck, marked the same way (dot / badge) as the deck dashboards.
export const REQUESTED: Record<number, { name: string; date: string }> = { 19: { name: "\"Recurring Issues\"", date: "20.11.2026" } };
/** True for a dashboard that carries the design mark (from the deck or a later request). */
export const isMarked = (no: number) => !!(DECK_SLIDES[no] || REQUESTED[no]);
/** Tooltip for the mark. */
export const markTip = (no: number) => (DECK_SLIDES[no] ? `From the ${DECK_NAME}, ${DECK_SLIDES[no]}` : REQUESTED[no] ? `Asked for in the ${REQUESTED[no].name} request (${REQUESTED[no].date})` : "");
/** Badge text for the mark; large adds where it comes from. */
export const markBadge = (no: number, large: boolean) => (DECK_SLIDES[no] ? `Dashboard design${large ? ` · ${DECK_SLIDES[no]}` : ""}` : `Requested${large ? ` · ${REQUESTED[no]?.name} (${REQUESTED[no]?.date})` : ""}`);

// The dashboard list, grouped by topic.
export const GROUPS: { title: string; nos: number[] }[] = [
  { title: "Faults and Defects", nos: [2, 3, 4, 19, 9, 27] },
  { title: "Reviews and Decisions", nos: [5, 6, 10, 26] },
  { title: "Fleet Condition and Repairs", nos: [1, 8, 7, 12, 28, 21] },
  { title: "Inspections and Maintenance Due", nos: [11, 13, 20, 24, 23] },
];

// One line icon per dashboard type (24x24, stroke = currentColor), same style as the hub tiles.
export const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const DASH_ICONS: Record<number, React.ReactElement> = {
  // 1 fleet status: tag lamps (Red / Yellow / Green)
  1: svg(<><rect x="7.5" y="2.5" width="9" height="19" rx="3" /><circle cx="12" cy="7" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="17" r="1.8" /></>),
  // 2 open defects: warning triangle
  2: svg(<><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.2v.1" /></>),
  // 3 defect aging: hourglass
  3: svg(<><path d="M5.5 3h13M5.5 21h13M7 3v2.5c0 3 5 4.5 5 6.5s-5 3.5-5 6.5V21M17 3v2.5c0 3-5 4.5-5 6.5s5 3.5 5 6.5V21" /><path d="M9.5 18.5h5" /></>),
  // 4 closure rate: ring with tick
  4: svg(<><path d="M20 12a8 8 0 1 1-3-6.2" /><path d="m9 12 2.5 2.5L20 6" /></>),
  // 5 decisions waiting: person with clock
  5: svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.6-3.6 3-5.5 5.5-5.5" /><circle cx="17" cy="16" r="4" /><path d="M17 14v2l1.3 1" /></>),
  // 6 review turnaround: stopwatch
  6: svg(<><circle cx="12" cy="13.5" r="7" /><path d="M12 13.5V10M10 3h4M12 3v3.5M18.5 6.5l1.5-1.5" /></>),
  // 7 repair queue: wrench
  7: svg(<><path d="M14.5 5.5a4 4 0 0 0-5 5L3.5 16.5l3 3 6-6a4 4 0 0 0 5-5l-2.5 2.5-2.2-.6-.6-2.2z" /></>),
  // 8 time red / yellow: stopped clock with tag
  8: svg(<><circle cx="10" cy="12" r="7" /><path d="M10 8v4l2.5 1.5" /><path d="M17.5 4.5h3.5v3.5l-2 2-3.5-3.5z" /></>),
  // 9 repeat faults: circular arrows
  9: svg(<><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3M4.5 12A7.5 7.5 0 0 1 17.3 6.7" /><path d="M17.5 3v4h-4M6.5 21v-4h4" /></>),
  // 10 phone decisions: phone handset
  10: svg(<><path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" /></>),
  // 11 reports per period: bar chart
  11: svg(<><path d="M4 20V10M10 20V5M16 20v-7M22 20H2" /></>),
  // 12 exemptions: shield with tick
  12: svg(<><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.2" /></>),
  // 13 MR-II forecast: calendar with gauge needle
  // User Analytics: a person with a role mark (clipboard, tick, scales, wrench, star)
  14: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><rect x="15" y="9" width="6" height="8" rx="1.2" /><path d="M16.8 12h2.4M16.8 14.5h2.4" /></>),
  15: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M15.5 13.5l2 2 3.5-4" /></>),
  16: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M18 8v9M15.5 10h5M15.5 10l-1.2 3h2.4zM20.5 10l-1.2 3h2.4z" /></>),
  17: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M20.5 9.5a2.5 2.5 0 0 1-3.3 2.4l-2.4 2.4-1.2-1.2 2.4-2.4a2.5 2.5 0 0 1 3.1-3.2l-1.4 1.4.8.8z" /></>),
  18: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M18 8.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" /></>),
  // 20 inspection sequence: two reports with an arrow between them
  20: svg(<><rect x="3" y="5" width="7" height="14" rx="1.5" /><rect x="14" y="5" width="7" height="14" rx="1.5" /><path d="M10 12h4M12.5 10.5 14 12l-1.5 1.5" /></>),
  // 21 on-site repairs: wrench with a tick
  21: svg(<><path d="M13.5 4.5a4 4 0 0 0-5 5L3 15l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.2-.6-.6-2.2z" /><path d="m15 18.5 2 2 4-4" /></>),
  // 22 sign-off completeness: a person with ticks
  22: svg(<><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M15.5 8.5l1.2 1.2 2.3-2.3M15.5 13.5l1.2 1.2 2.3-2.3" /></>),
  // 23 data quality: magnifier with a warning mark
  23: svg(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5M10.5 7.5v3.5M10.5 13.6v.1" /></>),
  // 24 usage per job: gauge with a road
  24: svg(<><path d="M4 16a8 8 0 0 1 16 0" /><path d="M12 16l3.5-4.5" /><path d="M3 20h18" /><circle cx="12" cy="16" r="1" /></>),
  // 25 MR cost: banknote with a coin
  25: svg(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.8" /><path d="M6 9v.1M18 15v.1" /></>),
  // 26 critical audit trail: warning triangle on a list
  26: svg(<><path d="M4 5h9M4 9h7M4 13h5M4 17h5" /><path d="M16.5 9 11 19h11z" /><path d="M16.5 13v2.5M16.5 17.4v.1" /></>),
  // 27 faults by client: building with a warning mark
  27: svg(<><path d="M4 21V5l7-2v18M11 9h6v12M2.5 21h19" /><path d="M7 8v.1M7 12v.1M7 16v.1M14 13v.1M14 16.5v.1" /></>),
  // 28 exemption audit: shield with a list
  28: svg(<><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" /><path d="M9 10h6M9 13h6M9 16h3.5" /></>),
  // 19 fault trends by equipment: rising bars with a magnifier
  19: svg(<><path d="M4 20V14M8.5 20v-8M13 20v-5" /><circle cx="17" cy="8.5" r="3.5" /><path d="m19.6 11.1 2.4 2.4M3 20h18" /></>),
  13: svg(<><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><path d="M8.5 17a3.5 3.5 0 0 1 7 0M12 17l1.8-2" /></>),
};


// User Analytics is its own group on the Dashboard hub, separate from the MR-I dashboards.
export const USER_GROUPS: { title: string; nos: number[] }[] = [
  { title: "By Role in the MR-I Process", nos: [14, 15, 16, 17, 18, 22] },
];

