import { useCurrentUserPermissionCodes } from "../../lib/useCurrentUserPermissions";
import { DASHBOARDS, GROUPS, PAUSED_DASHBOARDS, USER_GROUPS } from "./dashCatalog";

// Which dashboard items the signed-in user may open. Set per role in Administration > Roles and
// per person in Users > Permissions (category "Dashboards"). While permissions are still loading,
// everything stays visible (the same fail-open rule as the rest of the app).

export const DASH_AREA = "dashboard.view";
export const DASH_OVERVIEW = "dash.overview";
export const DASH_HISTORY = "dash.history";
export const dashCode = (no: number) => `dash.${no}`;

export interface DashAccess {
  area: boolean;
  overview: boolean;
  history: boolean;
  dash: (no: number) => boolean;
  /** Dashboards (by number) this user may open, in catalogue order. */
  allowed: number[];
  /** First MR-I dashboard / first User Analytics board the user may open, if any. */
  firstMri: number | null;
  firstUser: number | null;
}

export function useDashAccess(): DashAccess {
  const codes = useCurrentUserPermissionCodes();
  const can = (code: string) => codes === null || codes.has(code);
  const dash = (no: number) => !PAUSED_DASHBOARDS.has(no) && can(dashCode(no));
  const allowed = DASHBOARDS.map((d) => d.no).filter(dash);
  const firstMri = GROUPS.flatMap((g) => g.nos).find(dash) ?? null;
  const firstUser = USER_GROUPS.flatMap((g) => g.nos).find(dash) ?? null;
  return { area: can(DASH_AREA), overview: can(DASH_OVERVIEW), history: can(DASH_HISTORY), dash, allowed, firstMri, firstUser };
}

/** True for the switch of a paused dashboard (FB-007): hidden in Roles and User permissions. */
export function isPausedPerm(code: string): boolean {
  const m = /^dash\.(\d+)$/.exec(code);
  return !!m && PAUSED_DASHBOARDS.has(Number(m[1]));
}

/** Order for the "Dashboards" switches in Roles / User permissions: area, Overview, History, then 1-19. */
export function dashPermRank(code: string): number {
  if (code === DASH_AREA) return 0;
  if (code === DASH_OVERVIEW) return 1;
  if (code === DASH_HISTORY) return 2;
  const m = /^dash\.(\d+)$/.exec(code);
  return m ? 10 + Number(m[1]) : 1000;
}
