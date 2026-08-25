import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface AppUser {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created_date: string;
  updated_date: string;
}

export interface Permission {
  id: number;
  code: string;
  label: string;
  category: string;
}

export interface UserOverride {
  permission_code: string;
  granted: boolean;
}

export const ROLES = ["View Only", "Tier 1", "Tier 2", "Tier 3", "Administrator"];

// Users
export function useAppUsers() {
  return useQuery({
    queryKey: ["app-users"],
    queryFn: () => invoke<AppUser[]>("get_app_users"),
  });
}

export function useCreateAppUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (user: { name: string; email: string; role: string }) =>
      invoke("create_app_user", { user }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });
}

export function useUpdateAppUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { id: number; name: string; email: string; role: string; active: boolean }) =>
      invoke("update_app_user", item),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });
}

export function useDeleteAppUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke("delete_app_user", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });
}

// Permissions catalog
export function usePermissions() {
  return useQuery({
    queryKey: ["permissions"],
    queryFn: () => invoke<Permission[]>("get_permissions"),
  });
}

// Role defaults
export function useRolePermissions(role: string) {
  return useQuery({
    queryKey: ["role-permissions", role],
    queryFn: () => invoke<string[]>("get_role_permissions", { role }),
    enabled: !!role,
  });
}

export function useSetRolePermission(role: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { permissionCode: string; granted: boolean }) =>
      invoke("set_role_permission", { role, ...item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-permissions", role] }),
  });
}

// Per-user overrides
export function useUserOverrides(userId: number) {
  return useQuery({
    queryKey: ["user-overrides", userId],
    queryFn: () => invoke<UserOverride[]>("get_user_overrides", { userId }),
    enabled: !!userId,
  });
}

export function useSetUserOverride(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { permissionCode: string; granted: boolean | null }) =>
      invoke("set_user_override", { userId, ...item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-overrides", userId] }),
  });
}

export function useEffectivePermissions(userId: number) {
  return useQuery({
    queryKey: ["effective-permissions", userId],
    queryFn: () => invoke<string[]>("get_effective_permissions", { userId }),
    enabled: !!userId,
  });
}