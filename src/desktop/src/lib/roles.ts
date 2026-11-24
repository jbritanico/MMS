// Role names as people see them, and the job titles in each tier (Clarification 4, Mr. Kamil,
// 23 Nov 2026; CL4-1 on the Post-Beta Changes checklist).
// The stored role keys ("Operator", "Data Miner View", ...) stay the same, so saved users,
// permissions and the checks in the code keep working; only the names on screen change.

/** Tier of each MMS role (Clarification 4 table). */
export const ROLE_TIER: Record<string, string> = {
  "Data Miner View": "Read Only",
  Operator: "Tier 1",
  "Job Supervisor": "Tier 2",
  "Operations Coordinator": "Tier 2",
  "Maintenance Supervisor": "Tier 2",
  "Maintenance Manager / FSM": "Tier 3",
  "Regional Maintenance Manager / RSDM": "Tier 4",
  Administrator: "Tier 0",
};

const RENAMED: Record<string, string> = {
  "Data Miner View": "Read Only",
  Operator: "Reporter",
};

/** The name shown for a role: "Operator" -> "Reporter", "Data Miner View" -> "Read Only". */
export function roleName(role: string | null | undefined): string {
  if (!role) return "";
  return RENAMED[role] ?? role;
}

/** The role with its tier: "Reporter (Tier 1)", "Read Only", "Job Supervisor (Tier 2)", "Administrator (Tier 0)". */
export function roleWithTier(role: string | null | undefined): string {
  if (!role) return "";
  const name = roleName(role);
  const tier = ROLE_TIER[role];
  return !tier || tier === name ? name : `${name} (${tier})`;
}

export interface TierGuide {
  tier: string;
  /** Stored role keys to pick from for this tier. */
  roles: string[];
  rights: string;
  titles: string[];
  note?: string;
}

/** Clarification 4 table: job titles per tier, and the MMS roles that carry each tier. Tier 4: template approval (24 Nov 2026). */
export const TIER_GUIDE: TierGuide[] = [
  {
    tier: "Read Only",
    roles: ["Data Miner View"],
    rights: "View MMS records only. No data entry, editing, review, approval or closure.",
    titles: ["Assistant Operator", "Operator", "Assistant Mechanic", "Mechanic"],
  },
  {
    tier: "Tier 1",
    roles: ["Operator"],
    rights: "View records; start and submit MR-I reports. No editing after submission.",
    titles: [
      "Field Engineer Trainee (FET)",
      "Service Technician Trainee (STT)",
      "Senior Operator",
      "Maintenance Technician Trainee",
      "Maintenance Engineer Trainee",
      "Service Technician",
      "Lead Operator",
      "Maintenance Technician",
    ],
  },
  {
    tier: "Tier 2",
    roles: ["Job Supervisor", "Operations Coordinator", "Maintenance Supervisor"],
    rights: "Start, review and edit MR-I reports within assigned authority; review Moderate faults.",
    titles: [
      "Operations Supervisor / Coordinator",
      "Senior Service Technician",
      "Service Supervisor",
      "Senior Service Supervisor",
      "Senior / Lead Maintenance Technician",
      "Maintenance Supervisor",
      "Maintenance Engineer",
      "Lead Maintenance Engineer",
    ],
    note: "Job Supervisor: edits and endorses reports on the job. Operations Coordinator or Maintenance Supervisor: also reviews Moderate faults (Manual Table 3).",
  },
  {
    tier: "Tier 3",
    roles: ["Maintenance Manager / FSM"],
    rights: "Reviews Major / Critical faults and confirms the final classification.",
    titles: ["FSM", "Maintenance Manager"],
  },
  {
    tier: "Tier 4",
    roles: ["Regional Maintenance Manager / RSDM"],
    rights: "Everything the Maintenance Manager / FSM can do, plus approve new and changed MR-I templates.",
    titles: ["Regional Maintenance Manager", "Regional Service Delivery Manager"],
    note: "Added for MR-I template approval (agreed with Mr. Kamil, 24 Nov 2026); not in the Clarification 4 table.",
  },
];

/** Roles to offer for a job title. Two titles match a Tier 2 role by name; the rest list the tier's roles. */
export function rolesForJobTitle(title: string): { tier: string; roles: string[]; note?: string } | null {
  const g = TIER_GUIDE.find((t) => t.titles.includes(title));
  if (!g) return null;
  if (title === "Operations Supervisor / Coordinator") return { tier: g.tier, roles: ["Operations Coordinator"] };
  if (title === "Maintenance Supervisor") return { tier: g.tier, roles: ["Maintenance Supervisor"] };
  return { tier: g.tier, roles: g.roles, note: g.note };
}
