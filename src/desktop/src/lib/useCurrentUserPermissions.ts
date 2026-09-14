// Resolves CURRENT_USER_EMAIL against the local app_users table and returns the
// permission codes that user effectively has (role defaults + their personal
// overrides — same logic the Roles/Permissions admin screens edit).
//
// FAIL-OPEN BY DESIGN: there is no login system yet (see currentUser.ts). If no
// app_user record matches CURRENT_USER_EMAIL yet — a fresh install with no users
// configured, or the current machine's user just hasn't been added — this
// returns `null` rather than an empty set, and every `useHasPermission` check
// treats `null` as "permit everything." The alternative (deny everything until
// someone's set up) risks locking the app before anyone can go create the first
// user. Once Administrators start using the Users/Roles screens, this stops
// being permissive for anyone actually added to app_users with a restrictive role.
import { useEffectivePermissions } from "../features/administration/hooks/useUserAdmin";
import { useCurrentUser } from "./currentUser";

/** Null means "don't enforce yet" (still loading, or no user picked yet — the
 *  UserPickerGate should already be blocking this case, but stay fail-open here too). */
export function useCurrentUserPermissionCodes(): Set<string> | null {
    const { user: currentUser, isLoading: usersLoading } = useCurrentUser();
    const { data: codes, isLoading: permsLoading } = useEffectivePermissions(currentUser?.id ?? 0);

    if (usersLoading) return null;
    if (!currentUser) return null;
    if (permsLoading) return null;
    return new Set(codes ?? []);
}

/** True if the current user has `code`, or if permissions aren't being enforced yet (fail-open). */
export function useHasPermission(code: string): boolean {
    const permCodes = useCurrentUserPermissionCodes();
    if (permCodes === null) return true;
    return permCodes.has(code);
}