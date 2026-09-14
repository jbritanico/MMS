import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppUsers, type AppUser } from "../features/administration/hooks/useUserAdmin";

interface CurrentUserContextValue {
    user: AppUser | null;
    users: AppUser[];
    isLoading: boolean;
    setCurrentUserId: (id: number) => void;
    clearCurrentUser: () => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
    const { data: users = [], isLoading } = useAppUsers();
    // Always starts unset — every app launch requires picking a user again.
    // No localStorage persistence: nobody stays "logged in" across restarts.
    const [userId, setUserId] = useState<number | null>(null);

    function setCurrentUserId(id: number) {
        setUserId(id);
    }

    function clearCurrentUser() {
        setUserId(null);
    }

    const user = useMemo(() => {
        if (userId === null) return null;
        return users.find((u) => u.id === userId && u.active) ?? null;
    }, [userId, users]);

    // Safety net: if the picked user gets deactivated by an admin mid-session,
    // drop back to the picker instead of continuing to act as a stale user.
    useEffect(() => {
        if (!isLoading && userId !== null && !user) {
            clearCurrentUser();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, userId, user]);

    const value: CurrentUserContextValue = { user, users, isLoading, setCurrentUserId, clearCurrentUser };

    return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
    const ctx = useContext(CurrentUserContext);
    if (!ctx) throw new Error("useCurrentUser must be used within a CurrentUserProvider");
    return ctx;
}