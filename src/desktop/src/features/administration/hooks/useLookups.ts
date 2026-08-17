import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface LookupValue {
  id: number;
  criteria: string;
  name: string;
  active: boolean;
}

export function useLookupCriteria() {
  return useQuery({
    queryKey: ["lookup-criteria"],
    queryFn: () => invoke<string[]>("get_lookup_criteria"),
  });
}

export function useLookups(criteria: string) {
  return useQuery({
    queryKey: ["lookups", criteria],
    queryFn: () => invoke<LookupValue[]>("get_lookups", { criteria }),
    enabled: !!criteria,
  });
}

export function useCreateLookup(criteria: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => invoke("create_lookup", { criteria, name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookups", criteria] });
      qc.invalidateQueries({ queryKey: ["lookup-criteria"] });
    },
  });
}

export function useUpdateLookup(criteria: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: LookupValue) => invoke("update_lookup", { item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lookups", criteria] }),
  });
}

export function useDeleteLookup(criteria: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke("delete_lookup", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lookups", criteria] }),
  });
}

export function useBulkCreateLookups(criteria: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) => invoke<string>("bulk_create_lookups", { criteria, names }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookups", criteria] });
      qc.invalidateQueries({ queryKey: ["lookup-criteria"] });
    },
  });
}