import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export function useBrowsableTables() {
  return useQuery({
    queryKey: ["browsable-tables"],
    queryFn: () => invoke<string[]>("get_browsable_tables"),
  });
}

export function useTableColumns(tableName: string | null) {
  return useQuery({
    queryKey: ["table-columns", tableName],
    queryFn: () => invoke<string[]>("get_table_columns", { tableName }),
    enabled: !!tableName,
  });
}

export function useTableRows(tableName: string | null) {
  return useQuery({
    queryKey: ["table-rows", tableName],
    queryFn: () => invoke<Record<string, any>[]>("get_table_rows", { tableName }),
    enabled: !!tableName,
  });
}

export function useUpdateTableRow(tableName: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { id: number; values: Record<string, any> }) =>
      invoke("update_table_row", { tableName, id: item.id, values: item.values }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["table-rows", tableName] }),
  });
}

export function useDeleteTableRow(tableName: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke("delete_table_row", { tableName, id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["table-rows", tableName] }),
  });
}