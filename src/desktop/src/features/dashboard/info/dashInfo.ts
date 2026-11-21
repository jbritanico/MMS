// Plain-language explanations for every dashboard and every card on it, with the part of the
// MMS Maintenance Management Manual (SPC-MTN-OMN-01/v2, Rev. 02) that each one supports.
// Shown by the (i) buttons in the dashboard area. Cards are matched by their heading text.

export interface ManualRef {
  sec: string;
  name: string;
  page?: string;
  /** "manual" = Manual Rev. 02; "doc" = a supporting document (clarification, deck, KPI doc). */
  src?: "manual" | "doc";
}
export interface InfoEntry { what: string; how?: string; why?: string; refs: ManualRef[] }
export interface InfoItem extends InfoEntry { match: RegExp }
export interface DashInfo extends InfoEntry { name: string; items: InfoItem[] }

const m = (sec: string, name: string, page: string): ManualRef => ({ sec, name, page, src: "manual" });
const d = (sec: string, name: string): ManualRef => ({ sec, name, src: "doc" });

export const R = {
  s41: m("§4.1", "Regional Maintenance Manager responsibilities", "7–8"),
  s42: m("§4.2", "Country Management responsibilities", "8"),
  s43: m("§4.3", "Country Maintenance Manager responsibilities", "8"),
  s44: m("§4.4", "Maintenance Personnel responsibilities", "8"),
  s45: m("§4.5", "Job Supervisor responsibilities", "9"),
  s46: m("§4.6", "Logistics, Supply Chain and Warehouse", "9"),
  s611: m("§6.1.1", "MR-I Purpose", "11"),
  s613: m("§6.1.3", "MR-I Typical Triggers", "11"),
  s615: m("§6.1.5", "Defect Severity Classification", "11–13"),
  t3: m("Table 3", "MR-I Defect Severity Classification", "11–12"),
  f1: m("Figure 1", "MR-I Approval Workflow in Case of Fault", "13"),
  exm: m("§6.1.5", "Red-tagged units need an approved MOC exemption (text under Figure 1)", "13"),
  s617: m("§6.1.7", "MR-I Workflow", "13"),
  f2: m("Figure 2", "MR-I Compliance Occasion", "14"),
  s623: m("§6.2.3", "MR-II Typical Triggers (250 h or 90 days)", "16"),
  s625: m("§6.2.5", "MR-II Planning and Scheduling", "16"),
  s633: m("§6.3.3", "MR-III Typical Triggers (3,000 h or 3 years)", "19"),
  s7: m("§7", "Equipment Testing and Verification", "26"),
  s81: m("§8.1", "Equipment Status Designation (Green / Yellow / Red)", "26"),
  s82: m("§8.2", "Approval and Record Retention", "26"),
  s92: m("§9.2", "MMS User Access Tiers (Table 4)", "27–28"),
  s93: m("§9.3", "MMS Key Functions", "28"),
  s94: m("§9.4", "Maintenance Forecasting", "28"),
  s95: m("§9.5", "User Responsibilities", "28"),
  s961: m("§9.6.1", "Home Dashboard", "29"),
  s9641: m("§9.6.4.1", "MR-II Compliance Status", "34–35"),
  s9642: m("§9.6.4.2", "MR-III Compliance Status", "35"),
  s9643: m("§9.6.4.3", "Month-on-Month MR Occasion Count", "36"),
  s9644: m("§9.6.4.4", "Pending Fault Analysis Dashboard", "36–37"),
  s9645: m("§9.6.4.5", "Report Database", "37"),
  c1: d("Clarification 1", "Approval by phone is not in the manual; MMS records it as temporary and the reviewer confirms it later"),
  c2: d("Clarification 2", "FSM / Maintenance Manager authority, and phone decisions stay provisional until confirmed in MMS"),
  deck: d("Dashboard deck", "MMS Dashboard Visualization, 08.10.2026"),
  kpi: d("KPI document", "Dashboard Structure & KPIs: recurring operational failures (CMER)"),
};

const SEL_HOW = "Click the card to list these items below. Click it again to clear the selection.";

/** Cards that look the same on many dashboards. Checked after the dashboard's own list. */
export const COMMON_ITEMS: InfoItem[] = [
  { match: /^Selected/i, what: "The items you picked by clicking a tile, bar, row or chart point above.", how: "Use \"Clear selection\" (or click the same tile again) to see everything again. Click a report number to open the report.", refs: [R.s9645] },
  { match: /^Group by/i, what: "Changes how the table is grouped: by country, service line or equipment type.", refs: [R.s9644] },
];

export const DASH_INFO: Record<string, DashInfo> = {
  overview: {
    name: "Overview",
    what: "The front page of the dashboards. It gives a quick summary of the fleet, open faults, reviews waiting and repairs in progress, with shortcuts to the detailed dashboards.",
    how: "Start here each day. Click a card or a \"View all\" link to open the dashboard behind it.",
    why: "The manual describes the Home Dashboard as the entry point into MMS for maintenance data and reports.",
    refs: [R.s961, R.s93],
    items: [
      { match: /^Fleet availability/i, what: "The share of active units that are ready for service (Green tag) right now. The coloured liquid behind the card fills to the same percentage, and the tiles on the right count units by tag colour.", how: "The arrow compares with 30 days ago, worked out from the tag history. The liquid is green at 85% and above, amber from 70% to 84% and red below 70%; these bands are for display only, as the manual sets no availability target. Click a tile to open Fleet status by tag colour.", refs: [R.s81, R.s43, R.s42] },
      { match: /^Units by tag/i, what: "How many units are Green (ready), Yellow (under repair) and Red (not ready for service).", how: "Click to open Fleet status by tag colour.", refs: [R.s81] },
      { match: /^Open faults/i, what: "Faults found during MR-I that are not fixed and closed yet, compared with 30 days ago.", how: "Click to open Open defects by severity.", refs: [R.s9644, R.s615] },
      { match: /^Waiting for review/i, what: "MR-I reports and fault decisions waiting for a Supervisor or a reviewer to act, oldest first.", how: "Click a line or \"View all\" to open Decisions waiting.", refs: [R.f1, R.t3] },
      { match: /^Repairs in progress/i, what: "Confirmed faults that are in the repair queue and not yet repaired and checked.", how: "Click to open Repair queue and repair time.", refs: [R.s617, R.s7] },
      { match: /^Faults found and closed/i, what: "Each month: bars for faults found and faults closed, and a line for faults still open at the end of the month.", how: "If the line keeps rising, faults are being found faster than they are fixed. Use the 3M / 6M / 12M buttons to change the range.", refs: [R.s615, R.s43] },
      { match: /^Fleet health/i, what: "The share of units that were Green, Yellow and Red at the end of each month.", how: "A growing red or yellow band means more units were out of action.", refs: [R.s81, R.s41] },
      { match: /^Closest to MR-II/i, what: "The units nearest to their next MR-II or MR-III, worked out from the counters read at each MR-I.", how: "Click \"View all\" to open the MR-II due forecast.", refs: [R.s94, R.s623, R.s633] },
      { match: /^Quick actions/i, what: "Shortcuts to the dashboards used most often, with a live count on each.", how: "Click a shortcut to open that dashboard.", refs: [R.s961] },
      { match: /^Recent activity/i, what: "The latest things that happened in MMS: reports submitted, fault decisions, tag changes and repairs.", refs: [R.s82] },
    ],
  },

  history: {
    name: "Asset MR-I History",
    what: "Every unit with its tag colour and its MR-II / MR-III counters. Open a unit to see all of its MR-I reports in date order.",
    how: "Search for a unit or use the filter buttons, then click a unit card. Click a report in the timeline to open it.",
    why: "The manual asks MMS to keep the full maintenance history of each asset and make it easy to find.",
    refs: [R.s9645, R.s82, R.s95],
    items: [
      { match: /counters/i, what: "How much of the MR-II and MR-III interval this unit has used, from the latest counter readings (kilometres, engine hours and so on).", how: "Amber means the warning value is reached; red means the interval is reached and the MR-II or MR-III is due.", refs: [R.s94, R.s9641, R.s9642] },
      { match: /timeline/i, what: "All MR-I reports for this unit, newest first, with their stage, status and faults.", how: "Click a report to open it.", refs: [R.s9645, R.s82] },
    ],
  },

  "1": {
    name: "Fleet Status by Tag Colour",
    what: "How many units are Green (ready for service), Yellow (under maintenance), Red (not ready for service) or not tagged yet, and where they are.",
    how: "Click a colour tile to list those units. Use \"Group by\" to compare countries, service lines or equipment types.",
    why: "The manual says MMS must clearly show the status of every unit, so Operations know what can be sent to a job.",
    refs: [R.s81, R.s617, R.s45],
    items: [
      { match: /Green$/i, what: "Units that are ready for service: their last MR-I found no blocking fault, or the fault was repaired and checked.", how: SEL_HOW, refs: [R.s81] },
      { match: /Yellow$/i, what: "Units under maintenance. They are not available until the work is finished and the unit is released.", how: SEL_HOW, refs: [R.s81] },
      { match: /Red$/i, what: "Units not ready for service because of a fault that makes them unsafe. They must not go on a job without an approved MOC exemption.", how: SEL_HOW, refs: [R.s81, R.exm] },
      { match: /Not tagged$/i, what: "Units with no MR-I result yet, so MMS does not know their condition. An MR-I inspection sets the tag.", how: SEL_HOW, refs: [R.s81, R.s95] },
      { match: /^Tag colour over/i, what: "The share of the fleet in each colour, month by month, for the last 12 months.", how: "A growing red or yellow band means more units were out of action. Click a month to see that point.", refs: [R.s81, R.s41] },
      { match: /^Tag colour by/i, what: "The tag colours split by country, service line or equipment type. The 3D view shows two groupings at once.", how: "Click a bar (or a 3D column) to list those units.", refs: [R.s81, R.s43] },
      { match: /^Units not ready/i, what: "Every Red and Yellow unit, with the reason and since when.", how: "Click a unit to open its history.", refs: [R.s81, R.s82] },
    ],
  },

  "2": {
    name: "Open Defects by Severity",
    what: "Faults found during MR-I that are not fixed and closed yet, split into Minor, Moderate and Major / Critical, and how the number changes month by month.",
    how: "Click a severity tile to narrow everything below. Click a month on the chart to see the faults that were open at that time.",
    why: "This is the Pending Fault Analysis the manual asks for: it shows the repair backlog and where it sits.",
    refs: [R.s9644, R.s615, R.t3, R.deck],
    items: [
      { match: /^Minor/i, what: "Open Minor faults: low-level things like paint damage or a broken door lock. No approval is needed; they are fixed at the next planned maintenance.", how: SEL_HOW, refs: [R.t3] },
      { match: /^Moderate/i, what: "Open Moderate faults: early wear that does not stop the unit yet but must be watched and repaired as planned.", how: SEL_HOW, refs: [R.t3] },
      { match: /Critical/i, what: "Open Major / Critical faults: faults that affect the unit's safety or operation. The unit must stop and be Red-tagged until repaired and checked.", how: SEL_HOW, refs: [R.t3, R.s81] },
      { match: /^All open faults/i, what: "All faults open now, with how many were open at the start of the period and how many new ones were found during it.", how: "Click to clear the severity selection.", refs: [R.s9644] },
      { match: /^Open faults at the end of each month/i, what: "The number of faults still open on the last day of each month, by severity.", how: "A rising line means the backlog is growing. Click a month to list the faults open then.", refs: [R.s615, R.s43] },
      { match: /^Flow of open faults/i, what: "Faults coming in (found) and going out (closed) each month, and how many were left open.", how: "When more come in than go out, the backlog grows.", refs: [R.s615, R.s43] },
      { match: /^Open faults by/i, what: "Open faults counted by equipment type, service line or country, and then by unit.", how: "Click a row to see its units, then a unit to list only its faults.", refs: [R.s9644] },
      { match: /^(Open faults|Faults open at the end)/i, what: "The fault register: each open fault with its unit, item, severity, description and age.", how: "Click a report number to open the MR-I report.", refs: [R.s9644] },
    ],
  },

  "3": {
    name: "Defect Aging",
    what: "How long open faults have been waiting to be fixed. A fault is overdue when it is older than its limit: Major / Critical 7 days, Moderate and Minor 30 days.",
    how: "Click an \"overdue\" tile to list those faults, oldest first.",
    why: "The manual asks for faults to be fixed within defined timeframes and for aging trends to be watched. The 7- and 30-day limits are set in MMS; the manual does not give the number of days.",
    refs: [R.s615, R.s9644, R.deck],
    items: [
      { match: /overdue$/i, what: "Open faults of this severity that are older than their limit (7 days for Major / Critical, 30 days for Moderate and Minor).", how: SEL_HOW, refs: [R.s615, R.t3] },
      { match: /^All open faults/i, what: "All open faults, how many are overdue, and their average age in days.", how: "Click to clear the selection.", refs: [R.s9644] },
      { match: /^How old are/i, what: "Open faults grouped by age: 0–7, 8–30, 31–60, 61–90 and over 90 days, by severity.", how: "Faults in the older bands need attention first. Click a bar to list them.", refs: [R.s9644, R.s615] },
      { match: /^Overdue faults at the end of each month/i, what: "How many faults were overdue on the last day of each month.", how: "A rising line means repairs are falling behind.", refs: [R.s615, R.s43] },
      { match: /^Overdue faults over the period/i, what: "Overdue faults during the selected period, by severity.", refs: [R.s615] },
      { match: /^By /i, what: "Open and overdue faults counted by equipment type, service line or country.", how: "Shows where the oldest faults are. Click a row to narrow the list.", refs: [R.s9644] },
      { match: /^(Open faults|Selected faults)/i, what: "Each open fault with its age, ordered by how far it is past its limit.", how: "Click a report number to open the MR-I report.", refs: [R.s9644] },
    ],
  },

  "4": {
    name: "Fault Closure Rate",
    what: "Of all the faults there were to fix in the period (those already open at the start plus the new ones), the share that was closed. Higher is better.",
    how: "Compare the severities: Major / Critical should have the highest rate.",
    why: "The manual asks for faults to be fixed within defined timeframes and for the defect backlog to be monitored.",
    refs: [R.s615, R.s43, R.deck],
    items: [
      { match: /Critical/i, what: "Closure rate for Major / Critical faults: closed ÷ (open at start + new).", how: SEL_HOW, refs: [R.t3, R.s615] },
      { match: /^Moderate/i, what: "Closure rate for Moderate faults: closed ÷ (open at start + new).", how: SEL_HOW, refs: [R.t3] },
      { match: /^Minor/i, what: "Closure rate for Minor faults. These are often left for the next planned maintenance, so a lower rate can be normal.", how: SEL_HOW, refs: [R.t3] },
      { match: /^All faults/i, what: "Closure rate for all severities together, with the closed and total counts.", how: "Click to list all faults.", refs: [R.s615] },
      { match: /^Closure rate by month/i, what: "The closure rate month by month.", how: "A falling line means faults are being closed more slowly.", refs: [R.s615, R.s43] },
      { match: /^Faults in/i, what: "Every fault counted in the rate, with whether it was closed and when.", refs: [R.s9644] },
    ],
  },

  "5": {
    name: "Decisions Waiting, by Reviewer",
    what: "MR-I reports and fault decisions that are waiting for someone to act right now, and who they are waiting with. The period filter does not change this dashboard.",
    how: "Click a tile or a stage to list what is waiting. Follow up on anything waiting over 7 days.",
    why: "The manual sets who must review each fault (Table 3) and how reports move to closure (Figure 1). Items left waiting keep units out of action.",
    refs: [R.f1, R.t3, R.s82, R.s92],
    items: [
      { match: /^Fault decisions waiting/i, what: "Moderate and Major / Critical faults waiting for the reviewer to approve, reclassify or reject them.", how: SEL_HOW, refs: [R.t3, R.f1] },
      { match: /^Reports waiting for the Supervisor/i, what: "MR-I reports the Supervisor still has to review or close.", how: SEL_HOW, refs: [R.f1, R.s92] },
      { match: /^Not named to a person/i, what: "Fault decisions not assigned to a named reviewer. Anyone with the right authority can take them.", how: SEL_HOW, refs: [R.t3, R.s92] },
      { match: /^Waiting over 7 days/i, what: "Reports and decisions that have been waiting for more than a week.", how: "Chase these first. " + SEL_HOW, refs: [R.f1] },
      { match: /^Where things are waiting/i, what: "The three review stages: Supervisor review of the report, fault decision, and Supervisor closing the report, with how many items wait at each.", how: "Click a stage to list what is waiting there.", refs: [R.f1] },
      { match: /^Waiting with whom/i, what: "For each person, how many items are waiting with them and for how long (under 1 day, 1–3, 4–7, over 7 days).", how: "Long red bars show who may need help or a reminder.", refs: [R.f1, R.s92] },
      { match: /^(Everything waiting|Selected items)/i, what: "Each waiting item, longest first, with the unit, the step and the person it is waiting with.", how: "Click a report number to open it.", refs: [R.f1] },
    ],
  },

  "6": {
    name: "Review Turnaround",
    what: "How long reviews take: from Submit to the fault decision, and from Submit to the report being closed.",
    how: "Look for months, severities or reviewers where the time goes up.",
    why: "While a review is waiting, the unit may stay Red or the fault may stay unfixed. The manual defines who reviews and closes reports.",
    refs: [R.f1, R.t3, R.s82],
    items: [
      { match: /fault decision$/i, what: "Average time from submitting the report to the reviewer's fault decision.", how: SEL_HOW, refs: [R.t3, R.f1] },
      { match: /report closed$/i, what: "Average time from submitting the report to the Supervisor closing it.", how: SEL_HOW, refs: [R.f1, R.s82] },
      { match: /^Took over/i, what: "Decisions and closures that took more than 7 days.", how: SEL_HOW, refs: [R.f1] },
      { match: /^Decision time by severity/i, what: "Average decision time for Moderate and for Major / Critical faults (Manual Table 3 levels 2 and 3).", how: "Major / Critical faults should be decided fastest because the unit is stopped.", refs: [R.t3] },
      { match: /^Journey of a report/i, what: "The path of a report: Submitted → fault decision → report closed, with the average time to each step.", how: "Click a step to see its details.", refs: [R.f1] },
      { match: /^Average days by month/i, what: "The average days to a decision and to closure, month by month.", refs: [R.f1] },
      { match: /^Decision time by reviewer/i, what: "Average decision time for each reviewer.", how: "Helps to see who may need support or a backup reviewer.", refs: [R.t3, R.s92] },
      { match: /^Details for/i, what: "Each report and decision in the period with its times.", refs: [R.s82] },
    ],
  },

  "7": {
    name: "Repair Queue and Repair Time",
    what: "Repairs still to be done after a fault is confirmed: who is assigned, whether parts are available, and how long repairs take.",
    how: "Click a tile or a stage to list those repairs.",
    why: "The manual asks MMS to manage corrective actions, resources and spare parts, and to check the repair before the unit is released.",
    refs: [R.s617, R.s615, R.s43, R.s46, R.s7],
    items: [
      { match: /^In the repair queue/i, what: "Repairs not finished yet, with the oldest one's age.", how: SEL_HOW, refs: [R.s617, R.s43] },
      { match: /^Waiting for parts/i, what: "Repairs that cannot start because the parts are not available yet.", how: "Follow up with Logistics / Warehouse. " + SEL_HOW, refs: [R.s46, R.s43] },
      { match: /^No technician/i, what: "Repairs nobody is assigned to.", how: "Assign a technician. " + SEL_HOW, refs: [R.s43] },
      { match: /^Average repair time/i, what: "Average time from a repair entering the queue to it being repaired and verified.", how: SEL_HOW, refs: [R.s7] },
      { match: /^Repair flow/i, what: "The repair stages: waiting for parts, parts ordered, ready to repair, repaired and verified.", how: "Click a stage to list its repairs.", refs: [R.s617, R.s7] },
      { match: /^Queue by technician/i, what: "Open repairs for each technician, split by parts status.", how: "Shows who is overloaded and where parts are holding things up.", refs: [R.s43, R.s46] },
      { match: /^Repairs/i, what: "Each repair with its unit, fault, technician, parts status and dates.", refs: [R.s617] },
    ],
  },

  "8": {
    name: "Time Spent Red or Yellow",
    what: "How long units were out of action in the period (Red = not ready for service, Yellow = under maintenance), counted in unit-days. One unit Red for 3 days is 3 unit-days.",
    how: "Click a tile to list the units. Look for units that are Red or Yellow again and again.",
    why: "The manual asks the Country Maintenance Manager to monitor equipment availability.",
    refs: [R.s81, R.s43, R.s42],
    items: [
      { match: /^Units out of action \(/i, what: "Each unit that was Red or Yellow during the period, with its days in each colour.", how: "Click a unit to see its tag changes.", refs: [R.s81] },
      { match: /^Units out of action/i, what: "How many active units were Red or Yellow at some point in the period.", how: SEL_HOW, refs: [R.s81] },
      { match: /Red$/i, what: "Total days units spent Red (not ready for service), and how many times a unit turned Red.", how: SEL_HOW, refs: [R.s81] },
      { match: /Yellow$/i, what: "Total days units spent Yellow (under maintenance).", how: SEL_HOW, refs: [R.s81] },
      { match: /^Ready-for-service time/i, what: "The share of time active units were Green during the period.", how: "Higher is better.", refs: [R.s81, R.s43] },
      { match: /^Fleet health over/i, what: "The share of the fleet in each colour across the period.", refs: [R.s81] },
      { match: /^Days/i, what: "Days Red and Yellow for each unit. The 3D view shows units against months.", how: "Click a unit (or a 3D column) to see its tag changes.", refs: [R.s81, R.s43] },
      { match: /^Tag changes for/i, what: "Every tag change for this unit, with the date and reason.", refs: [R.s81, R.s82] },
    ],
  },

  "9": {
    name: "Repeat Faults",
    what: "Which inspection items fail most often, which fail on many units, and which faults recurred on the same unit after being fixed.",
    how: "Items on many units may point to a design or parts problem. Faults that recurred may mean the repair did not fix the cause.",
    why: "The manual says the fault process must help identify recurring faults and root causes of the maintenance backlog. This dashboard is not in the 08.10.2026 deck.",
    refs: [R.s615, R.s44, R.kpi],
    items: [
      { match: /^New faults found/i, what: "Faults found in the period and on how many different inspection items.", how: SEL_HOW, refs: [R.s615] },
      { match: /^Items failing on 2\+ units/i, what: "Inspection items that failed on two or more units. This may point to a common cause.", how: SEL_HOW, refs: [R.s615] },
      { match: /^Recurred after a fix/i, what: "Faults found again on the same item of the same unit after an earlier fault there was fixed and closed.", how: "Worth checking the repair quality. " + SEL_HOW, refs: [R.s615, R.s44] },
      { match: /^Fails most often/i, what: "The inspection item with the most faults in the period, and on how many units.", refs: [R.s615] },
      { match: /^Items that fail most often/i, what: "The items with the most faults, by severity. The 3D view shows items against units.", how: "Click an item to list its faults.", refs: [R.s615] },
      { match: /^Faults \(/i, what: "Each fault for the selected item, with whether it recurred after a fix.", refs: [R.s9644] },
      { match: /^All items/i, what: "Every item that failed in the period: times failed, units affected, how many recurred, and severities.", refs: [R.s615] },
    ],
  },

  "19": {
    name: "Fault Trends by Equipment",
    what: "Faults recorded on MR-I reports, counted by equipment type, with a drill-down to each unit (fixed asset) and to each checklist item. Every level compares the period with the same period a year earlier.",
    how: "Click a type to see its units, then a unit to see which checklist items keep failing. Use the breadcrumb above the summary to go back up.",
    why: "Asked for in the \"Recurring Issues\" request: to spot recurring faults, follow trends, improve the MR checklists and find equipment that needs further investigation. The manual says the fault process must help identify recurring faults and their root causes. This dashboard is not in the 08.10.2026 deck.",
    refs: [R.s615, R.s44, R.kpi],
    items: [
      { match: /^Faults recorded/i, what: "New faults found in the period (a fault carried forward is counted once), and the change against the same period a year earlier.", refs: [R.s615] },
      { match: /^Recurring items/i, what: "Checklist items that failed two or more times on the same unit in the period.", how: "Recurring items point to a cause that the repair did not remove.", refs: [R.s615, R.s44] },
      { match: /^Units needing attention|^Needs investigation/i, what: "Units with at least 3 faults and 1.5 times the average of their equipment type, or with two or more recurring items.", refs: [R.s615] },
      { match: /^Most faults per unit/i, what: "The equipment type with the most faults per unit, so large and small fleets compare fairly.", refs: [R.s615] },
      { match: /^Faults by equipment type/i, what: "Faults per equipment type in the period, against the same period a year earlier.", how: "Click a bar to see the units of that type.", refs: [R.s615] },
      { match: /^Equipment types/i, what: "Every equipment type: units, faults, change, faults per unit, recurring items, the item that fails most often, and units needing attention.", how: "Click a row to see its units.", refs: [R.s615] },
      { match: /^Faults per unit, month by month/i, what: "Faults per unit for each equipment type, month by month. The 3D view shows types against months; flick it to turn it.", how: "A rising row means that type is getting worse. Click a type to see its units.", refs: [R.s615] },
      { match: /^Checklist items with no fault/i, what: "Items on the active MR-I templates that have had no fault in the last 24 months.", how: "Worth checking whether they are still useful or need clearer wording.", refs: [R.s615] },
      { match: /units \(/i, what: "Each unit of the type: faults now and a year earlier, recurring items, the item that fails most often and the last fault.", how: "Click a unit to see its faults item by item.", refs: [R.s615] },
      { match: /^Where faults repeat/i, what: "Checklist items against units. A dark row means many units fail the item (a common cause); a dark cell means one unit keeps failing it.", refs: [R.s615] },
      { match: /^Faults by checklist item/i, what: "On one unit: faults per checklist item, now and a year earlier.", refs: [R.s615] },
      { match: /^Faults per month/i, what: "On one unit: faults found each month, now and a year earlier.", refs: [R.s615] },
      { match: /^Recurring on this unit/i, what: "Checklist items that failed more than once on this unit, with the dates.", refs: [R.s615, R.s44] },
      { match: /^Every fault on/i, what: "Each fault on the unit in the period, with its MR-I report.", refs: [R.s9644] },
    ],
  },

  "10": {
    name: "Phone Decisions and Acknowledgements",
    what: "Fault decisions given by phone take effect straight away, but the real reviewer must confirm them in MMS later. Moderate decisions must also be acknowledged by the FSM / Maintenance Manager.",
    how: "Click a tile to list what is still waiting, then follow up with the person named.",
    why: "Table 3 says the FSM / Maintenance Manager must be informed of Moderate faults. Phone approval is not in the manual; Clarifications 1 and 2 cover how MMS records it.",
    refs: [R.t3, R.f1, R.s82, R.c1, R.c2],
    items: [
      { match: /^Waiting for confirmation/i, what: "Phone decisions the reviewer has not yet confirmed in MMS.", how: SEL_HOW, refs: [R.c1, R.c2] },
      { match: /^Waiting for acknowledgement/i, what: "Moderate decisions the FSM / Maintenance Manager has not yet acknowledged.", how: SEL_HOW, refs: [R.t3] },
      { match: /^Decisions made by phone/i, what: "How many fault decisions in the period were given by phone.", how: SEL_HOW, refs: [R.c1] },
      { match: /^Time to confirm/i, what: "Average time from a phone decision to the reviewer confirming it in MMS.", refs: [R.c2] },
      { match: /^Phone decision flow/i, what: "Decided by phone → waiting for confirmation → confirmed by the authority.", how: "Click a stage to list its decisions.", refs: [R.c1, R.c2] },
      { match: /^Decisions by month/i, what: "Fault decisions each month, split into by phone and in person.", refs: [R.f1] },
      { match: /confirm|acknowledge|phone/i, what: "Each decision in the selected list, with who decided, who must confirm or acknowledge, and how long it has waited.", refs: [R.c2, R.t3] },
    ],
  },

  "11": {
    name: "MR-I Reports per Period",
    what: "How many MR-I inspections were done, by stage (Pre-Mob, Pre-Job, Post Job, Yard), and how many found faults.",
    how: "Compare months and stages. A drop may mean inspections are being missed.",
    why: "The manual sets when MR-I must be done and asks for a month-on-month count of maintenance activity.",
    refs: [R.s613, R.f2, R.s9643, R.s45],
    items: [
      { match: /^Reports by stage, month by month/i, what: "3D view: reports submitted per compliance stage and month. Gaps in a row show months when that stage was not inspected.", how: "Click a bar to list those reports. Drag or flick to turn the chart.", refs: [R.s613] },
      { match: /^Reports submitted over/i, what: "Reports submitted each month, by stage.", how: "Click a month to list its reports.", refs: [R.s9643] },
      { match: /^Reports submitted/i, what: "MR-I reports submitted in the period and on how many units.", how: SEL_HOW, refs: [R.s9643, R.s613] },
      { match: /^Reports with faults/i, what: "Reports that found at least one fault, and their share of all reports.", how: SEL_HOW, refs: [R.s615] },
      { match: /^Drafts not/i, what: "Reports that were started but not submitted yet (now).", how: "Remind the inspector to finish and submit. " + SEL_HOW, refs: [R.s95] },
      { match: /^By stage/i, what: "Reports split by stage: Pre-Mob, Pre-Job, Post Job and Yard.", refs: [R.s613, R.f2] },
      { match: /^Reports \(|^Drafts not yet/i, what: "Each report with its unit, stage, date and faults.", refs: [R.s9645] },
    ],
  },

  "12": {
    name: "Red Units Under Exemption (MOC)",
    what: "Red units, and whether each has an approved MOC exemption that allows limited use, with its limits and end date.",
    how: "Red units without an exemption must not be deployed. Watch exemptions that are about to end.",
    why: "The manual says Red-tagged units must not be deployed without an exemption approved through MOC, with limits, controls and a validity period.",
    refs: [R.exm, R.s42, R.s81],
    items: [
      { match: /without an exemption/i, what: "Red units with no exemption in force.", refs: [R.exm] },
      { match: /Red units \(/i, what: "All Red units, with any exemption they have.", refs: [R.s81, R.exm] },
      { match: /Red units/i, what: "How many units are Red now, and how many of them have an exemption.", how: SEL_HOW, refs: [R.s81, R.exm] },
      { match: /^Red, no exemption/i, what: "Red units with no exemption. They must not go on a job.", how: SEL_HOW, refs: [R.exm] },
      { match: /^Expiring within/i, what: "Exemptions that end within 7 days.", how: "Plan the repair or a renewal before the end date. " + SEL_HOW, refs: [R.exm, R.s42] },
      { match: /^Past end date/i, what: "Exemptions still marked Active after their end date.", how: "Close or renew them. " + SEL_HOW, refs: [R.exm] },
      { match: /^Exemptions/i, what: "Each exemption with its unit, limits, approver and dates.", refs: [R.exm, R.s82] },
    ],
  },

  "13": {
    name: "MR-II Due Forecast",
    what: "Which units are close to their next MR-II (or MR-III), worked out from the counters (kilometres, engine hours and so on) read at each MR-I.",
    how: "Plan the units marked Overdue and Due soon first.",
    why: "The manual asks MMS to forecast MR-II (250 hours or 90 days) and MR-III (3,000 hours or 3 years) from actual use.",
    refs: [R.s94, R.s623, R.s625, R.s633, R.s9641, R.s9642],
    items: [
      { match: /^Overdue/i, what: "Units where a counter has reached its interval. The MR-II or MR-III is due now.", how: SEL_HOW, refs: [R.s9641, R.s623] },
      { match: /^Due soon/i, what: "Units where a counter has reached its warning value.", how: SEL_HOW, refs: [R.s9641] },
      { match: /^Expected within/i, what: "Units expected to become due within 30 days, estimated from how fast they have been used so far.", how: SEL_HOW, refs: [R.s94] },
      { match: /^Not enough use/i, what: "Units without enough counter readings to estimate when they will be due.", how: "Make sure counters are entered at each MR-I. " + SEL_HOW, refs: [R.s95] },
      { match: /interval/i, what: "How much of the interval each unit has used, per counter. Over 100% means overdue. The 3D view shows units against counter types.", how: "Click a unit (or a 3D column) to see its details.", refs: [R.s94] },
      { match: /^Units, soonest first/i, what: "Each unit with its counters, % used and estimated due date, soonest first.", refs: [R.s94, R.s9641] },
    ],
  },

  "14": {
    name: "Inspectors",
    what: "The work of the people who carry out MR-I inspections: reports submitted, faults found, and how many of their faults were rejected or downgraded at review.",
    how: "Use it to spot where training on the severity table may help, not to rank people.",
    why: "The manual makes Job Supervisors and maintenance staff responsible for MR-I and for reporting defects accurately in MMS.",
    refs: [R.s45, R.s44, R.s92, R.s95],
    items: [
      { match: /^Reports submitted:/i, what: "The reports this person submitted in the period.", refs: [R.s9645] },
      { match: /^Reports submitted/i, what: "MR-I reports submitted in the period and by how many people.", refs: [R.s45] },
      { match: /^Faults found/i, what: "Faults reported in the period, and the average per report.", refs: [R.s44] },
      { match: /^Reports with faults/i, what: "The share of submitted reports that found at least one fault.", refs: [R.s44] },
      { match: /^Rejected or downgraded/i, what: "Faults sent for a decision that the reviewer rejected or lowered in severity.", how: "A high number may mean the severity table needs more training.", refs: [R.t3] },
    ],
  },

  "15": {
    name: "Supervisors",
    what: "Reports closed by Supervisors, how long it takes from Submit to closure, and endorsed reports that are still open.",
    refs: [R.s45, R.s92, R.f1, R.s82],
    items: [
      { match: /^Reports:/i, what: "The reports this Supervisor handled in the period.", refs: [R.s9645] },
      { match: /^Reports closed/i, what: "Reports closed in the period and by how many Supervisors.", refs: [R.s92, R.f1] },
      { match: /closed$/i, what: "Average time from Submit to the report being closed.", refs: [R.f1] },
      { match: /^Endorsed, still open/i, what: "Reports the Supervisor endorsed or escalated that are not closed yet (now).", refs: [R.f1, R.s82] },
    ],
  },

  "16": {
    name: "Reviewers",
    what: "Fault decisions by reviewers: how many, how fast, how often the severity was changed or the fault rejected, and what is waiting now.",
    refs: [R.t3, R.f1, R.s92, R.c2],
    items: [
      { match: /^Fault decisions:/i, what: "The fault decisions this reviewer made in the period.", refs: [R.t3] },
      { match: /^Fault decisions/i, what: "Fault decisions made in the period and by how many reviewers.", refs: [R.t3] },
      { match: /decision$/i, what: "Average time from Submit to the fault decision.", refs: [R.f1] },
      { match: /^Waiting now/i, what: "Fault decisions named to a reviewer and still waiting (now).", refs: [R.f1] },
    ],
  },

  "17": {
    name: "Technicians",
    what: "Repairs by technician: open repairs, repairs waiting for parts or past their planned date, and repair time.",
    refs: [R.s44, R.s617, R.s7, R.s95],
    items: [
      { match: /^Repairs:/i, what: "The repairs assigned to this technician.", refs: [R.s617] },
      { match: /^Open repairs/i, what: "Repairs not finished yet, including those with no technician.", refs: [R.s617, R.s43] },
      { match: /^Verified in period/i, what: "Repairs completed and verified in the period.", refs: [R.s7] },
      { match: /^Repair time/i, what: "Average time from entering the queue to being repaired and verified.", refs: [R.s7] },
    ],
  },

  "18": {
    name: "Managers and FSM",
    what: "Phone decisions confirmed and Moderate decisions acknowledged by Managers and FSMs, and what is still waiting for them.",
    refs: [R.t3, R.s42, R.s43, R.c1, R.c2],
    items: [
      { match: /^Confirmations and acknowledgements:/i, what: "The confirmations and acknowledgements this person made or still owes.", refs: [R.c2, R.t3] },
      { match: /^Confirmed/i, what: "Phone decisions confirmed in MMS in the period.", refs: [R.c1, R.c2] },
      { match: /^Acknowledged/i, what: "Moderate decisions acknowledged in the period.", refs: [R.t3] },
      { match: /^Waiting now/i, what: "Phone decisions to confirm and Moderate decisions to acknowledge (now).", refs: [R.t3, R.c2] },
    ],
  },
};

/** The table of people on each User Analytics dashboard. */
const PEOPLE_TABLE: InfoItem = {
  match: /^(Your figures|Inspectors|Supervisors|Reviewers|Technicians|Managers)\b/i,
  what: "One row per person with their figures for the period. \"Your figures\" shows only your own row unless you can see everyone.",
  how: "Click a person to list their items below.",
  refs: [R.s92],
};

export interface InfoResult { title: string; entry: InfoEntry; dash: DashInfo | null; generic: boolean }

export function infoFor(scope: string | null, title: string): InfoResult {
  const dash = scope ? DASH_INFO[scope] ?? null : null;
  const t = title.replace(/\s+/g, " ").trim();
  const items = [...(dash?.items ?? []), ...(/^1[4-8]$/.test(scope ?? "") ? [PEOPLE_TABLE] : []), ...COMMON_ITEMS];
  const hit = items.find((i) => i.match.test(t));
  if (hit) return { title: t, entry: hit, dash, generic: false };
  return { title: t, entry: dash ?? { what: "No explanation is available for this card yet.", refs: [] }, dash, generic: true };
}

/** The manual sections (not the supporting documents) for a dashboard, for the header chips. */
export const manualSecs = (scope: string | null) =>
  [...new Set((scope ? DASH_INFO[scope]?.refs ?? [] : []).filter((r) => r.src !== "doc").map((r) => r.sec))];
